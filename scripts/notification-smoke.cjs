'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { Results } = require('../electron/results.cjs');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data'); fs.mkdirSync(parent, { recursive: true });
const profile = fs.mkdtempSync(path.join(parent, 'notifications-'));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false, notifications: false }));
const results = new Results(profile);
const result = results.add({ text: fs.readFileSync(path.join(__dirname, 'fixtures/result-preview.md'), 'utf8'), title: 'Notification report', kind: 'test', reviewId: 'fixture-review' }, { trusted: true });
const entry = { id: 'review-ready', title: 'Review ready', resultId: result.id };
let app;
async function until(check) { const end = Date.now() + 15000; while (Date.now() < end) { if (await check()) return; await new Promise(r => setTimeout(r, 50)); } throw Error('Notification activation timed out'); }
(async () => {
  const executablePath = process.argv.find(x => x.startsWith('--app='))?.slice(6);
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? [] : [root]), '--smoke-test', `--data-dir=${profile}`] });
  const page = await app.firstWindow(); await page.locator('.session-grid').waitFor();
  const call = (method, payload) => page.evaluate(async ([m, p]) => { const r = await window.dock.call(m, p); if (!r.ok) throw Error(r.error); return r.value; }, [method, payload]);
  const session = await call('session.create', { provider: 'shell', cwd: profile, name: 'Notification console' });
  const activate = async item => {
    const state = await call('state');
    // Simulate the native click event; all window transitions and renderer
    // navigation below go through the real main-process/IPC code.
    await app.evaluate(({ BrowserWindow, app: electronApp }, { item, state }) => {
      const appRoot = electronApp.getAppPath();
      const require = process.getBuiltinModule('module').createRequire(appRoot + '/package.json');
      const { DockNotifications } = require(require('node:path').join(appRoot, 'electron', 'notifications.cjs'));
      const { EventEmitter } = require('node:events');
      class Notice extends EventEmitter { static isSupported() { return true; } show() {} close() { this.emit('close'); } }
      const window = BrowserWindow.getAllWindows()[0];
      const center = new DockNotifications({ Notification: Notice, getWindow: () => window, getTray: () => null, getMode: () => state.mode,
        getSessions: () => state.sessions, reveal: () => { window.show(); window.focus(); }, publish: () => {},
        setMode: next => window.webContents.executeJavaScript(`window.dock.call('mode', ${JSON.stringify(next)})`) });
      center.show(item); [...center.live][0].emit('click');
    }, { item, state });
  };
  for (const action of ['minimize', 'tray']) {
    await call('mode', 'dashboard'); await call(action);
    await activate({ sessionId: session.id, title: 'Notification console is ready' });
    await until(async () => (await call('state')).mode === 'fullscreen' && await page.locator('#terminal-page').isVisible());
    assert.equal(await page.locator('#terminal-heading .console-name').inputValue(), session.name);
    assert.ok(await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return w.isVisible() && !w.isMinimized(); }));
    assert.equal((await call('state')).trayHidden, false);
  }
  await call('mode', 'hud'); await activate(entry);
  await page.locator('.result-markdown h1').waitFor();
  assert.equal(await page.locator('.result-markdown h1').textContent(), 'Ready for review');
  await page.locator('.wb-dialog [data-wb=close]').click();
  await activate({ title: 'Earlier review ready', reviewId: 'fixture-review' });
  await page.locator('.result-markdown h1').waitFor();
  assert.equal(await page.locator('[data-page=reviews]').count(), 0);
  assert.equal((await call('state')).mode, 'dashboard'); assert.equal('inbox' in (await call('state')).workbench, false);
  fs.mkdirSync(path.join(root, 'artifacts', 'notifications'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'artifacts', 'notifications', 'windows-result-activation.png') });
  console.log('PASS native-click handler restores tray/minimized windows, expands the HUD, selects the console, opens Markdown Results');
  await call('quit');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await app?.close().catch(() => {}); assert.equal(path.dirname(fs.realpathSync(profile)), fs.realpathSync(parent)); fs.rmSync(profile, { recursive: true, force: true }); });
