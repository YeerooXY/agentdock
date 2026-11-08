'use strict';
// Read this thread's local usage counters only; never export conversation text.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const thread = process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID;
const directory = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions', '2026', '11', '01');
const files = fs.readdirSync(directory).filter(f => f.endsWith('.jsonl')).map(f => path.join(directory, f));
const rootFile = files.find(f => f.includes(thread)); if (!rootFile) throw Error('Current thread usage log not found.');
const events = file => fs.readFileSync(file, 'utf8').split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
const root = events(rootFile);
const request = root.find(e => e.type === 'response_item' && e.payload?.role === 'user' && e.payload.content?.some(c => c.type === 'input_text' && c.text?.includes('okay i will go make dinner')));
if (!request) throw Error('Audit start message not found.');
const start = request.timestamp;
function usage(rows, since) {
  let before = null, last = null; const models = new Set(); let additiveChecks = 0, additiveMatches = 0, previous;
  for (const e of rows) {
    if (e.type === 'turn_context' && e.timestamp >= (since || '') && e.payload?.model) models.add(e.payload.model);
    if (e.payload?.type !== 'token_count' || !e.payload.info?.total_token_usage) continue;
    const t = e.payload.info.total_token_usage;
    if (since && e.timestamp < since) before = { timestamp: e.timestamp, ...t };
    if (e.timestamp >= (since || '')) {
      last = { timestamp: e.timestamp, ...t };
      if (previous && t.input_tokens !== previous.input_tokens) { additiveChecks++; if (t.input_tokens - previous.input_tokens === e.payload.info.last_token_usage?.input_tokens) additiveMatches++; }
    }
    previous = t;
  }
  if (!last) return null;
  const result = { through: last.timestamp, models: [...models], baselineAt: before?.timestamp || null, additiveChecks, additiveMatches };
  for (const k of ['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens','total_tokens']) result[k] = last[k] === undefined ? null : last[k] - (before?.[k] || 0);
  result.uncached_input_tokens = result.input_tokens - result.cached_input_tokens;
  return result;
}
const children = [];
for (const file of files) {
  const first = JSON.parse(fs.readFileSync(file, 'utf8').split('\n')[0]);
  const spawn = first.payload?.source?.subagent?.thread_spawn;
  if (spawn?.parent_thread_id !== thread || !['/root/origin_audit','/root/native_targets','/root/website_runs'].includes(spawn.agent_path)) continue;
  children.push({ agent: spawn.agent_path, usage: usage(events(file)) });
}
const result = { start, collectedAt: new Date().toISOString(), root: usage(root, start), children,
  note: 'Snapshot through the last recorded model response; excludes subsequent response tail. Root spans routing audit and websites together. Child counters are their own thread totals; cached input is included in input. No prices inferred.' };
const out = path.resolve(__dirname, '../artifacts/agent-matrix/coordinator-usage.json'); fs.writeFileSync(out, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
