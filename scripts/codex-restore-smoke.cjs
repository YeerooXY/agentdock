'use strict';
// Real CLI, isolated account/config, local mock provider. Never contacts a model API.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { Sessions } = require('../electron/sessions.cjs');
const { Workspace } = require('../electron/workspace.cjs');
const { nativeCodex } = require('../electron/adapters.cjs');
const { prepareCodexSession } = require('../electron/codex-session.cjs');
const pty = require('node-pty');
const root = fs.mkdtempSync(path.resolve(__dirname, '../test-data/codex-restore-'));
const project = path.join(root, 'project'), home = path.join(root, 'home');
fs.mkdirSync(project); fs.mkdirSync(home);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, description, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await wait(100); }
  throw new Error('Timed out: ' + description);
}
const connections = new Set(); let requests = 0;
const provider = http.createServer((req, res) => {
  if (req.url.includes('/responses')) { requests++; req.resume(); return; } // unfinished work
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [] }));
});
provider.on('connection', socket => { connections.add(socket); socket.on('close', () => connections.delete(socket)); });
const encryption = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() };
const active = [];
function launch() {
  const env = { ...process.env, CODEX_HOME: home };
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'PADDOCK_BRIDGE_URL', 'PADDOCK_BRIDGE_TOKEN', 'ELECTRON_RUN_AS_NODE']) delete env[key];
  const sessions = new Sessions(root, {
    nativeCodex, findProgram: () => process.execPath,
    prepareCodexSession: (exe, options) => prepareCodexSession(exe, { ...options, env: { ...options.env, ...env } }),
    pty: { spawn(exe, args, options) {
      const term = pty.spawn(exe, [...args, '--no-daemon'], { ...options, env: { ...options.env, ...env, TERM: 'xterm-256color' } });
      term.onData(data => { if (data.includes('\x1b[6n')) term.write('\x1b[1;1R'); });
      return term;
    } }
  });
  active.push(sessions);
  return { sessions, workspace: new Workspace(root, sessions, encryption) };
}
(async () => {
  assert.ok(nativeCodex(), 'Install Codex before running this optional integration check');
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  fs.writeFileSync(path.join(home, 'config.toml'), [
    'model="dock-test"', 'model_provider="dock_mock"', 'check_for_update_on_startup=false',
    'windows.sandbox="unelevated"',
    `projects={${JSON.stringify(path.resolve(__dirname, '..'))}={trust_level="trusted"}}`,
    '[model_providers.dock_mock]', 'name="Local test only"',
    `base_url="http://127.0.0.1:${provider.address().port}/v1"`, 'wire_api="responses"', 'requires_openai_auth=false', 'supports_websockets=false'
  ].join('\n'));
  const first = launch();
  for (let index = 0; index < 2; index++) {
    const item = await first.sessions.create({ provider: 'codex', cwd: project, name: 'Restore check ' + index, permissions: 'unrestricted' });
    await until(() => first.sessions.buffer(item.id).data.includes('dock-test'), 'CLI startup');
    first.sessions.write(item.id, `LOCAL RESTORE CHECK ${index}`); await wait(400); first.sessions.write(item.id, '\r');
    await until(() => { first.sessions.scanEvents(); return first.sessions.items.get(item.id).providerSessionId; }, 'SessionStart identity');
    await until(() => requests > index, 'mock provider receives the unfinished turn');
  }
  const ids = first.sessions.list().map(x => x.providerSessionId);
  assert.equal(new Set(ids).size, 2); assert.ok(first.sessions.list().every(x => x.state === 'active'));
  first.workspace.freeze(); await first.sessions.stop();
  const beforeResume = requests, second = launch(); await second.workspace.restore();
  assert.deepEqual(second.sessions.list().map(x => x.providerSessionId), ids);
  for (const item of second.sessions.list()) await until(() => second.sessions.buffer(item.id).data.includes('LOCAL RESTORE CHECK'), 'restored conversation history');
  await wait(600); assert.equal(requests, beforeResume, 'Restoration must not resubmit the interrupted prompt');
  second.workspace.freeze();
  fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify({ passed: true, consoles: 2, sameFolder: true, firstTurnInterrupted: true, exactChatsRestored: true, promptsReplayed: false, paidCalls: 0 }, null, 2));
  console.log('PASS two real Codex chats resume after interrupted first turns; no prompt replay or paid requests');
  console.log('Evidence: ' + path.join(root, 'verification.json'));
})().catch(error => { console.error(error); console.error('Test profile: ' + root); process.exitCode = 1; }).finally(async () => {
  for (const sessions of active) await sessions.stop();
  for (const socket of connections) socket.destroy(); provider.close();
});
