'use strict';
// Exercise real IPC and disk saves in an isolated Electron profile.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data');
fs.mkdirSync(parent, { recursive: true });
const profile = fs.mkdtempSync(path.join(parent, 'appearance-'));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false, consoleDefaults: { provider: 'shell', cwd: root, name: '', command: '' } }));
let app;
(async () => {
  async function launch() {
    app = await electron.launch({ args: [root, '--smoke-test', `--data-dir=${profile}`] });
    const page = await app.firstWindow(); await page.waitForSelector('.session-grid');
    const call = (method, payload) => page.evaluate(async ([method, payload]) => { const r = await window.dock.call(method, payload); if (!r.ok) throw Error(r.error); return r.value; }, [method, payload]);
    return { page, call };
  }
  let { page, call } = await launch();
  for (const style of ['normal', 'cyber', 'icy', 'fiery']) {
    await call('slot.trim', { slot: 1, style });
    assert.equal((await call('state')).settings.slotTrims[1], style);
  }
  await call('settings', { trimStyle: 'icy', ambientMotion: false });
  await call('slot.trim', { slot: 1, style: 'redline' });
  await call('slot.trim', { slot: 2, style: 'blue' });
  const first = await call('session.create', { slot: 1, provider: 'shell', cwd: root });
  const second = await call('session.create', { slot: 3, provider: 'shell', cwd: root });
  await call('slot.trim', { slot: 3, sessionId: second.id, style: 'gamer' });
  await assert.rejects(call('slot.trim', { slot: 1, style: 'blue' }), /slot has changed/);
  await assert.rejects(call('slot.trim', { slot: 9, style: 'url(test)' }), /available console color/);
  await call('session.move', { id: first.id, slot: 2 });
  assert.deepEqual((await call('state')).settings.slotTrims, { 1: 'blue', 2: 'redline', 3: 'gamer' });
  await call('session.move', { id: first.id, slot: 3 });
  assert.deepEqual((await call('state')).settings.slotTrims, { 1: 'blue', 2: 'gamer', 3: 'redline' });
  await call('session.layout', { id: first.id, slot: 3, width: 1, height: 2 });
  assert.equal((await call('state')).settings.slotTrims[3], 'redline');
  await call('settings', { accentStyle: 'redline' });
  await call('mode', 'hud');
  assert.equal((await call('state')).sessions.filter(s => s.alive).length, 2, 'collapse keeps both processes alive');
  await call('mode', 'dashboard');
  await page.reload(); await page.waitForSelector('.session-grid');
  assert.equal(await page.locator(`[data-console-id="${first.id}"]`).getAttribute('data-frame'), 'redline');
  const saved = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'));
  assert.deepEqual(saved.slotTrims, { 1: 'blue', 2: 'gamer', 3: 'redline' });
  await call('session.end', first.id); await call('session.end', second.id);
  await app.close(); app = null;
  ({ page, call } = await launch());
  assert.equal((await call('state')).settings.accentStyle, 'redline');
  assert.equal((await call('state')).settings.trimStyle, 'icy');
  assert.equal((await call('state')).settings.ambientMotion, false);
  assert.deepEqual((await call('state')).settings.slotTrims, saved.slotTrims, 'colors survive restart');
  await call('slot.trim', { slot: 3, style: 'default' });
  assert.equal((await call('state')).settings.slotTrims[3], undefined, 'default clears only the selected override');
  console.log('PASS real Electron: frame persistence, restart, move, swap, resize, stale writes and collapse preserving sessions. No model requests.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await app?.close(); });
