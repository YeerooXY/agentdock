'use strict';
// Explicit manual connector check. Never part of automated tests.
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { programLaunch } = require('../electron/platform.cjs');
const { killTree } = require('../electron/delegation.cjs');
if (process.argv[2] !== '--live') throw Error('Pass --live to use the connected OpenRouter free allowance.');
const root = path.resolve(__dirname, '../artifacts/pi-verification', new Date().toISOString().replaceAll(':', '-'));
fs.mkdirSync(path.join(root, '.pi'), { recursive: true });
fs.writeFileSync(path.join(root, '.pi', 'settings.json'), JSON.stringify({ retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } }, compaction: { enabled: false }, cacheWarming: { enabled: false } }));
const requestId = 'pi-local-' + Date.now();
const brief = `This is a bounded Paddock connector check requested by the owner. The parent coordinator owns tracking; do not start or finish a Paddock turn, create tasks, or change settings. Use codemode to discover the dock/local_assist schema via tools.mcp__paddock__dock_tools({tool:"dock/local_assist"}). Then call tools.mcp__paddock__dock_call with tool dock/local_assist and arguments requestId "${requestId}", purpose "extract", maxOutput 256, prompt "Extract these rules into exactly this JSON shape: implementation is local first; artwork has no baked-in text; three radiating strokes are forbidden. Return only {\"implementation\":\"local\",\"textInArtwork\":false,\"radiatingStrokes\":false}.". Use the actual local response to write receipt.json in this working directory with those three fields plus localRequestId and localStatus from the response. Use only those two Paddock tools and the write tool. No shell commands, other tools, retries, alternative models or further agents. Finish in one sentence; report a concrete blocker if the local call fails.`;
const promptFile = path.join(root, 'prompt.txt'); fs.writeFileSync(promptFile, brief);
const executable = path.join(process.env.APPDATA, 'Paddock', 'agents', 'pi', 'node_modules', '.bin', 'pi.cmd');
const model = 'cohere/north-mini-code:free';
const launch = programLaunch(executable, ['--print', '--mode', 'json', '--provider', 'openrouter', '--model', model, '--thinking', 'off',
  '--no-session', '--no-context-files', '--no-skills', '--no-prompt-templates', '--no-extensions', '-e', 'builtin:mcp', '-e', 'builtin:codemode',
  '--tools', 'write,codemode,mcp__paddock__dock_tools,mcp__paddock__dock_call', '--approve', '@' + promptFile]);
const report = { model, requestId, elapsedMs: 0, settled: false, aborted: false, timedOut: false, tools: [], local: null, messages: [], usage: [] };
let pending = '', stderr = '', stderrBytes = 0; const started = Date.now();
const child = spawn(launch.executable, launch.args, { cwd: root, env: process.env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe','pipe','pipe'] });
const timer = setTimeout(() => { report.timedOut = true; killTree(child); }, 90000);
const safeText = text => String(text || '').replace(/sk-[\w-]+/g, '[redacted]').slice(-1500);
function event(e) {
  if (e.type === 'tool_execution_end') {
    report.tools.push({ name: e.toolName, error: !!e.isError, durationMs: e.durationMs });
    for (const content of e.result?.content || []) if (content.type === 'text') {
      const text = content.text || '';
      // Local receipts may be nested inside codemode's printed tool envelope.
      const match = text.match(/"requestId"\s*:\s*"(pi-local-\d+)"[\s\S]*/);
      if (match) report.local = { requestId: match[1], completed: /"status"\s*:\s*"completed"/.test(text), text: safeText(text) };
    }
  }
  if (e.type === 'message_end' && e.message?.role === 'assistant') {
    const m = e.message; report.messages.push({ stopReason: m.stopReason, text: safeText((m.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n')), error: safeText(m.errorMessage) });
    if (m.usage) report.usage.push(m.usage);
  }
  if (e.type === 'agent_settled') { report.settled = true; report.aborted = !!e.aborted; }
}
child.stdout.on('data', b => { const lines = (pending + b.toString()).split('\n'); pending = lines.pop(); for (const l of lines) { try { event(JSON.parse(l)); } catch {} } });
child.stderr.on('data', b => { stderrBytes += b.length; stderr = (stderr + b.toString()).slice(-2000); });
child.stdin.end();
child.once('error', () => { report.launchFailed = true; });
child.once('close', code => {
  clearTimeout(timer); try { event(JSON.parse(pending)); } catch {}
  report.exitCode = code; report.elapsedMs = Date.now() - started; report.stderrBytes = stderrBytes;
  // Persist only useful sanitized diagnostics, never raw provider streams.
  report.diagnostic = safeText(stderr.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'));
  let receipt; try { receipt = JSON.parse(fs.readFileSync(path.join(root, 'receipt.json'), 'utf8')); } catch {}
  report.receipt = receipt || null;
  report.passed = code === 0 && report.settled && !report.aborted && !report.timedOut && report.local?.completed === true &&
    receipt?.localRequestId === requestId && receipt?.localStatus === 'completed' && receipt?.implementation === 'local' && receipt?.textInArtwork === false && receipt?.radiatingStrokes === false;
  fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ folder: root, ...report })); process.exitCode = report.passed ? 0 : 1;
});
