'use strict';
// Isolated, unpaid Windows + Android integration fixture. Never attaches to the user's Dock.
const { _electron: electron } = require('playwright');
const { Results } = require('../electron/results.cjs');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'mobile-device');
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(out, 'profile-')), project = path.join(profile, 'project'); fs.mkdirSync(project);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false, consoleDefaults: { cwd: project, provider: 'shell', name: 'Trader', command: '' } }));
const results = new Results(profile);
results.add({ text: JSON.stringify({ version: 1, notes: ['Integration fixture — no real project was changed.'], changes: [{ file: 'src/page.js', type: 'modified', patch: '--- src/page.js\n+++ src/page.js\n@@ -1 +1 @@\n-const status = "waiting";\n+const status = "ready";' }] }), ext: '.json', title: '1 changed file', kind: 'code', groupId: 'mobile-turn' }, { project, consoleName: 'Trader', consoleKey: 'mobile-fixture' });
results.add({ file: path.join(root, 'assets', 'icon.png'), title: 'Page concept', kind: 'concept', groupId: 'mobile-turn' }, { project, consoleName: 'Trader', consoleKey: 'mobile-fixture', trusted: true });
results.add({ text: fs.readFileSync(path.join(__dirname, 'fixtures/result-preview.md'), 'utf8'), title: 'Verification', kind: 'test', status: 'passed', groupId: 'mobile-turn' }, { project, consoleName: 'Trader', consoleKey: 'mobile-fixture' });
let app;
(async () => {
  const reserved = net.createServer(); await new Promise(r => reserved.listen(0, '127.0.0.1', r)); const port = reserved.address().port; await new Promise(r => reserved.close(r));
  app = await electron.launch({ args: [root, '--smoke-test', `--data-dir=${profile}`] }); const page = await app.firstWindow(); await page.waitForSelector('.session-grid');
  const call = (method, payload) => page.evaluate(async ({ method, payload }) => { const r = await window.dock.call(method, payload); if (!r.ok) throw Error(r.error); return r.value; }, { method, payload });
  const sessions = [];
  for (const name of ['Trader', 'Robonslaught', 'Website']) {
    const session = await call('session.create', { provider: 'shell', cwd: project, name }); sessions.push(session);
    await call('session.input', { id: session.id, data: `Write-Host '${name}: mobile connection is ready'\r` });
  }
  await call('mobile.configure', { enabled: true, host: '127.0.0.1', port });
  const invite = await call('mobile.invite');
  fs.writeFileSync(path.join(out, 'connection.json'), JSON.stringify({ port, code: invite.code, sessions, profile }, null, 2));
  console.log('READY isolated Android fixture on localhost:' + port);
  const started = Date.now();
  while (Date.now() - started < 30 * 60000 && !fs.existsSync(path.join(profile, 'stop'))) {
    const actionsFile = path.join(profile, 'actions.json');
    if (fs.existsSync(actionsFile)) {
      const actions = JSON.parse(fs.readFileSync(actionsFile, 'utf8')); fs.unlinkSync(actionsFile);
      for (const action of actions) {
        if (action.method !== 'session.resize' && action.method !== 'session.input') throw Error('Unsupported fixture action');
        if (!sessions.some(x => x.id === action.payload.id)) throw Error('Not a fixture console');
        await call(action.method, action.payload);
      }
    }
    const state = await call('state');
    fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify({ mobile: state.mobile, sessions: state.sessions.map(x => ({ id: x.id, name: x.name, state: x.state })), results: state.workbench.results.length }, null, 2));
    for (const session of sessions) { const buffer = await call('session.buffer', session.id); fs.writeFileSync(path.join(profile, session.id + '.txt'), buffer.data); }
    await new Promise(r => setTimeout(r, 1000));
  }
  await call('quit');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await app?.close().catch(() => {}); });
