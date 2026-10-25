'use strict';
// Real Electron + local MCP bridge, with an isolated profile and an unpaid shell.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data'), out = path.join(root, 'artifacts', 'results-setting');
fs.mkdirSync(parent, { recursive: true }); fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(parent, 'results-setting-')), project = path.join(profile, 'project');
fs.mkdirSync(project); execFileSync('git', ['init', '-q', project], { windowsHide: true });
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false, autoSaveResults: true, notifications: false, consoleDefaults: { provider: 'shell', cwd: project } }));
let app;
async function until(fn) { const end = Date.now() + 15000; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 50)); } throw Error('Fixture timed out'); }
(async () => {
  app = await electron.launch({ args: [root, '--smoke-test', `--data-dir=${profile}`] });
  let page = await app.firstWindow(); await page.locator('.session-grid').waitFor();
  const call = (method, payload) => page.evaluate(async ([m, p]) => { const r = await window.dock.call(m, p); if (!r.ok) throw Error(r.error); return r.value; }, [method, payload]);
  await page.locator('[data-page=settings]').click();
  const toggle = page.locator('[data-setting=autoSaveResults]');
  assert.equal(await toggle.isChecked(), false);
  await toggle.check(); await toggle.uncheck();
  await until(async () => (await call('state')).settings.autoSaveResults === false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).autoSaveResults, false);
  const session = await call('session.create', { provider: 'shell', cwd: project, name: 'Results setting fixture' });
  const bridgeFile = path.join(profile, 'bridge.json');
  await call('session.input', { id: session.id, data: `@{url=$env:PADDOCK_BRIDGE_URL;token=$env:PADDOCK_BRIDGE_TOKEN} | ConvertTo-Json -Compress | Set-Content -LiteralPath '${bridgeFile.replaceAll("'", "''")}'\r` });
  await until(() => fs.existsSync(bridgeFile));
  const grant = JSON.parse(fs.readFileSync(bridgeFile, 'utf8').replace(/^\uFEFF/, ''));
  // Fixture credentials stay in this process and are never printed or saved as evidence.
  async function bridge(name, args = {}) {
    const r = await fetch(grant.url, { method: 'POST', headers: { Authorization: 'Bearer ' + grant.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args }) });
    assert.equal(r.status, 200); const result = await r.json(); assert.notEqual(result.isError, true, 'Fixture tool failed: ' + name); return result;
  }
  const context = await bridge('dock_context');
  assert.match(JSON.stringify(context), /Automatic Results capture is off/);
  assert.match(JSON.stringify(context), /requested deliverables/);
  fs.writeFileSync(path.join(project, 'routine.js'), 'const routine = true;');
  fs.writeFileSync(path.join(project, 'routine.png'), Buffer.from('routine image fixture'));
  await bridge('dock_call', { tool: 'dock/notify', arguments: { title: 'Ordinary edit complete', kind: 'ready' } });
  assert.equal((await call('state')).workbench.results.length, 0, 'Routine edits and changed images do not become Results');
  await bridge('dock_context');
  fs.writeFileSync(path.join(project, 'app.js'), 'const value = 1;');
  await bridge('dock_call', { tool: 'dock/save_result', arguments: { title: 'Requested report', text: 'Explicit save still works.' } });
  await bridge('dock_call', { tool: 'dock/notify', arguments: { title: 'Fixture ready', kind: 'ready' } });
  let state = await call('state');
  assert.equal(state.workbench.results.length, 1); assert.equal(state.workbench.results[0].title, 'Requested report');
  assert.equal(state.sessions.find(x => x.id === session.id).state, 'ready');
  assert.equal('inbox' in state.workbench, false);
  await toggle.check(); await until(async () => (await call('state')).settings.autoSaveResults === true);
  await bridge('dock_context'); fs.writeFileSync(path.join(project, 'app.js'), 'const value = 2;');
  await bridge('dock_call', { tool: 'dock/finish_turn', arguments: {} });
  state = await call('state'); assert.equal(state.workbench.results.filter(x => x.kind === 'code').length, 1);
  await bridge('dock_context'); fs.writeFileSync(path.join(project, 'app.js'), 'const value = 3;');
  await toggle.uncheck(); await until(async () => (await call('state')).settings.autoSaveResults === false);
  await bridge('dock_call', { tool: 'dock/finish_turn', arguments: {} });
  assert.equal((await call('state')).workbench.results.length, 2);
  await page.reload(); await page.locator('.session-grid').waitFor(); await page.locator('[data-page=settings]').click();
  assert.equal(await toggle.isChecked(), false);
  fs.writeFileSync(path.join(out, 'fixture.json'), JSON.stringify(await call('state')));
  await toggle.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'windows-setting.png') });
  await call('quit'); await app.close(); app = null;
  app = await electron.launch({ args: [root, '--smoke-test', `--data-dir=${profile}`] });
  page = await app.firstWindow(); await page.locator('.session-grid').waitFor();
  assert.equal((await call('state')).settings.autoSaveResults, false);
  assert.equal((await call('state')).workbench.results.length, 2);
  await call('quit'); await app.close(); app = null;
  fs.writeFileSync(path.join(out, 'native-checks.json'), JSON.stringify({ passed: true, checks: ['requested outputs by default', 'ordinary edits and images create no Results', 'persist off through restart', 'MCP knows capture is off', 'requested save and ready notification', 'opt-in next turn capture', 'disable an active turn', 'existing results retained'] }, null, 2));
  console.log('PASS Results setting, actual MCP capture, explicit saves, notifications and restart persistence');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  await app?.close().catch(() => {});
  assert.equal(path.dirname(fs.realpathSync(profile)), fs.realpathSync(parent)); fs.rmSync(profile, { recursive: true, force: true });
});
