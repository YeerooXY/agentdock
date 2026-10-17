'use strict';
// Real Codex/ConPTY input against a local stub. No user profile or paid requests.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const assert = require('node:assert/strict');
const pty = require('node-pty');
const { nativeCodex } = require('../electron/adapters.cjs');
const out = path.resolve(__dirname, '../artifacts/mobile-input'); fs.mkdirSync(out, { recursive: true });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdock-mobile-input-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message, timeout = 12000) {
  const start = Date.now();
  while (!predicate()) { if (Date.now() - start > timeout) throw Error(message); await delay(50); }
}
let terminal, calls = 0, exited = true;
const server = http.createServer((req, res) => {
  req.resume();
  if (req.method !== 'POST' || !req.url.startsWith('/v1/responses')) { res.writeHead(404); res.end(); return; }
  calls++;
  const item = { type: 'message', id: 'message_test', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'LOCAL TEST RECEIVED', annotations: [] }] };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  res.end('data: ' + JSON.stringify({ type: 'response.completed', response: { id: 'response_test', object: 'response', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }) + '\n\n');
});
async function start(name, port) {
  const project = path.join(root, name), home = path.join(root, name + '-home');
  fs.mkdirSync(project); fs.mkdirSync(home);
  const config = [
    'model="input-test"', 'model_provider="input-test"',
    `model_providers.input-test={name="Local test",base_url="http://127.0.0.1:${port}/v1",wire_api="responses",requires_openai_auth=false}`,
    `projects.${JSON.stringify(project)}.trust_level="trusted"`,
    'check_for_update_on_startup=false', 'windows.sandbox="unelevated"',
  ];
  const env = { ...process.env, CODEX_HOME: home, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  for (const name of Object.keys(env)) if (/API_KEY|TOKEN|SECRET|PASSWORD|^AGENT_DOCK_|^ELECTRON_RUN_AS_NODE$/.test(name)) delete env[name];
  terminal = pty.spawn(nativeCodex(), ['--no-daemon', '--no-alt-screen', '--ask-for-approval', 'never', '--sandbox', 'read-only', ...config.flatMap(x => ['-c', x])], { cwd: project, env, cols: 110, rows: 30, name: 'xterm-256color', useConpty: true });
  exited = false;
  let output = '', trusted = false;
  terminal.onExit(() => { exited = true; });
  terminal.onData(data => {
    output += data;
    if (data.includes('\x1b[6n')) terminal?.write('\x1b[1;1R');
    // The fixture owns this empty folder and disposable Codex profile.
    if (!trusted && /Trust and continue/.test(output)) { trusted = true; setTimeout(() => terminal?.write('\r'), 200); }
  });
  try { await until(() => /context left|for shortcuts|input-test default/.test(output), 'Codex composer did not become ready'); }
  catch (error) { fs.writeFileSync(path.join(out, 'startup.txt'), output); throw error; }
  await delay(300);
  return () => output;
}
async function stop() {
  if (!terminal) return;
  const current = terminal; terminal = null;
  if (!exited) {
    current.write('\x03'); await delay(100); current.write('\x03');
    try { await until(() => exited, 'Test console did not exit', 4000); }
    catch { current.kill(); }
  }
  await delay(300);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await start('original', port);
  terminal.write('Original mobile input\r');
  await delay(700);
  const originalSubmitted = calls > 0;
  if (!originalSubmitted) { terminal.write('\r'); await until(() => calls > 0, 'Separate Enter did not submit the original input'); }
  await stop();
  const previous = calls;
  await start('fixed', port);
  terminal.write('\x1b[200~Fixed mobile input\nwith a second line\x1b[201~');
  await delay(150);
  terminal.write('\r');
  await until(() => calls > previous, 'Fixed mobile input did not submit');
  assert.equal(calls, previous + 1);
  await stop();
  const report = { originalSubmitted, originalNeededSeparateEnter: !originalSubmitted, fixedSubmitted: true, localRequests: calls, paidRequests: 0 };
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await stop(); server.closeAllConnections(); server.close(() => process.exit(process.exitCode || 0)); });
