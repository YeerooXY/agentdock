'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { atomicJson } = require('../electron/storage.cjs');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data'), out = path.join(root, 'artifacts', 'power-check');
fs.mkdirSync(parent, { recursive: true }); fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(parent, 'power-'));
atomicJson(path.join(profile, 'settings.json'), { setupComplete: true, restoreConsoles: false, notifications: false });
let app;
async function until(check) { const end = Date.now() + 15000; while (Date.now() < end) { if (await check()) return; await new Promise(r => setTimeout(r, 50)); } throw Error('Power-state update timed out'); }
(async () => {
  app = await electron.launch({ args: [root, '--smoke-test', `--data-dir=${profile}`] });
  const page = await app.firstWindow(); await page.locator('.session-grid').waitFor();
  const call = (method, payload) => page.evaluate(async ([m, p]) => { const r = await window.dock.call(m, p); if (!r.ok) throw Error(r.error); return r.value; }, [method, payload]);
  fs.writeFileSync(path.join(out, 'fixture.json'), JSON.stringify(await call('state')));
  await app.evaluate(({ powerSaveBlocker, app }, file) => {
    const start = powerSaveBlocker.start.bind(powerSaveBlocker), stop = powerSaveBlocker.stop.bind(powerSaveBlocker);
    globalThis.workPowerChecks = { requests: [], stops: [] };
    powerSaveBlocker.start = type => { const id = start(type); workPowerChecks.requests.push({ id, type }); return id; };
    powerSaveBlocker.stop = id => { workPowerChecks.stops.push(id); return stop(id); };
    app.once('before-quit', () => process.getBuiltinModule('fs').writeFileSync(file, JSON.stringify({ active: workPowerChecks.requests.filter(x => powerSaveBlocker.isStarted(x.id)).length })));
  }, path.join(profile, 'shutdown.json'));
  const activeCount = () => app.evaluate(({ powerSaveBlocker }) => workPowerChecks.requests.filter(x => powerSaveBlocker.isStarted(x.id)).length);
  const a = await call('session.create', { provider: 'shell', cwd: profile, name: 'Power check A' });
  const b = await call('session.create', { provider: 'shell', cwd: profile, name: 'Power check B' });
  assert.equal(await activeCount(), 0);
  async function state(id, state) {
    const session = (await call('state')).sessions.find(x => x.id === id);
    atomicJson(path.join(profile, 'events', `${id}.${session.launchId}.state.json`), { session: id, launchId: session.launchId, state, at: Date.now() });
    await until(async () => (await call('state')).sessions.find(x => x.id === id)?.state === state);
  }
  await state(a.id, 'active'); await until(async () => await activeCount() === 1);
  await state(b.id, 'active'); await state(a.id, 'ready'); assert.equal(await activeCount(), 1);
  assert.equal(await app.evaluate(() => workPowerChecks.requests.length), 1);
  await call('mode', 'hud'); assert.equal(await activeCount(), 1);
  await call('tray'); assert.equal(await activeCount(), 1);
  await state(b.id, 'attention'); await until(async () => await activeCount() === 0);
  await call('mode', 'dashboard'); await state(b.id, 'active');
  await page.locator('[data-page=settings]').click();
  const toggle = page.locator('[data-setting=keepAwakeWhileWorking]'); assert.equal(await toggle.isChecked(), true);
  await toggle.uncheck(); await until(async () => await activeCount() === 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).keepAwakeWhileWorking, false);
  await page.reload(); await page.locator('.session-grid').waitFor(); await page.locator('[data-page=settings]').click();
  assert.equal(await toggle.isChecked(), false); await toggle.check(); await until(async () => await activeCount() === 1);
  await call('session.end', b.id); await until(async () => await activeCount() === 0);
  await state(a.id, 'active'); await until(async () => await activeCount() === 1);
  const requests = await app.evaluate(() => workPowerChecks.requests); assert.ok(requests.every(x => x.type === 'prevent-app-suspension'));
  await page.screenshot({ path: path.join(out, 'windows-settings.png') });
  await call('quit'); await app.close(); app = null;
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'shutdown.json'))).active, 0);
  fs.writeFileSync(path.join(out, 'native-checks.json'), JSON.stringify({ passed: true, requestType: 'prevent-app-suspension', checks: ['idle consoles', 'overlapping work', 'completion', 'waiting for input', 'HUD and tray', 'setting toggle and persistence', 'console close', 'quit cleanup'] }, null, 2));
  console.log('PASS native sleep requests follow active consoles, settings, tray/HUD and shutdown');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await app?.close().catch(() => {}); assert.equal(path.dirname(fs.realpathSync(profile)), fs.realpathSync(parent)); fs.rmSync(profile, { recursive: true, force: true }); });
