'use strict';
// Optional live local check. Never invokes connected tools or a cloud model.
const fs = require('node:fs'), path = require('node:path');
const { runApi } = require('../electron/api-run.cjs');
const base = 'http://127.0.0.1:8080';
const output = path.resolve(__dirname, '../.build/strata-trial/live-check.json');
async function verify(fetcher = fetch) {
  const response = await fetcher(`${base}/v1/models`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('Strata model discovery failed.');
  const model = (await response.json()).data?.[0]?.id;
  if (!model) throw Error('Strata has no loaded model.');
  const profile = { id: 'strata', protocol: 'chat', url: `${base}/v1/chat/completions` };
  const localFetch = (url, options) => fetcher(url, { ...options, body: JSON.stringify({ ...JSON.parse(options.body), reasoning_effort: 'none' }) });
  const text = await runApi({ model, prompt: 'Reply with exactly STRATA_TEXT_OK.', maxOutput: 256 }, '', null, { profile, fetcher: localFetch });
  if (text.error || text.entry.status !== 'completed' || !text.text.includes('STRATA_TEXT_OK')) throw Error('Strata did not complete the text check.');
  const calls = [];
  const hub = {
    summary: () => 'This is a local diagnostic. Call dock_context once to obtain a marker, then include that marker in your final reply. Do not call any other tool.',
    invoke: async name => {
      if (name !== 'dock_context') throw Error('Only the diagnostic dock_context stub is available.');
      calls.push(name);
      return { content: [{ type: 'text', text: 'Diagnostic marker: STRATA_TOOL_OK' }] };
    }
  };
  const tool = await runApi({ model, prompt: 'Call dock_context, then reply with the diagnostic marker returned by the tool.', maxOutput: 1024 }, '', null, { profile, hub, fetcher: localFetch });
  if (tool.error || tool.entry.status !== 'completed' || calls.length !== 1 || !tool.text.includes('STRATA_TOOL_OK')) throw Error('Strata did not complete the tool round trip.');
  return { status: 'passed', model, endpoint: base, text: true, toolRoundTrip: true,
    requests: text.entries.length + tool.entries.length,
    durationMs: [...text.entries, ...tool.entries].reduce((sum, entry) => sum + entry.durationMs, 0), checkedAt: new Date().toISOString() };
}
async function notify(result) {
  if (!process.env.PADDOCK_BRIDGE_URL || !process.env.PADDOCK_BRIDGE_TOKEN) return;
  await fetch(process.env.PADDOCK_BRIDGE_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${process.env.PADDOCK_BRIDGE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'dock_call', arguments: { tool: 'dock/notify', arguments: {
      kind: result.status === 'passed' ? 'ready' : 'error', title: 'Strata local trial',
      message: result.status === 'passed' ? `${result.model} passed local text and tool checks. Apply the Strata settings in Tools; the updated Paddock build offers it in OpenCode's model chooser.` : result.error
    } } }) });
}
async function main() {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ status: 'waiting-for-local-server', startedAt: new Date().toISOString() }, null, 2));
  let result;
  try {
    if (process.argv.includes('--wait')) {
      const deadline = Date.now() + 6 * 60 * 60 * 1000;
      let ready = false;
      while (Date.now() < deadline) {
        try { const health = await fetch(`${base}/health`, { redirect: 'error', signal: AbortSignal.timeout(5000) }); if (health.ok) { ready = true; break; } } catch {}
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
      if (!ready) throw Error('Strata was not ready within six hours. Check the download and launch log.');
    }
    result = await verify();
  } catch (error) { result = { status: 'failed', error: error.message, checkedAt: new Date().toISOString() }; process.exitCode = 1; }
  fs.writeFileSync(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (process.argv.includes('--notify')) await notify(result).catch(() => console.log('Paddock notification unavailable; the result is saved in live-check.json.'));
}
if (require.main === module) main().catch(() => { process.exitCode = 1; });
module.exports = { verify };
