'use strict';
// Checks the titlebar screenshot spot: it appears for a new screenshot, pastes
// the quoted path into the selected console and accepts a drag onto a console.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(root, 'test-data', 'screenshot-'));
const out = path.join(root, 'artifacts', 'screenshot-spot'); fs.mkdirSync(out, { recursive: true });
const shots = path.join(dataDir, 'test-screenshots'); fs.mkdirSync(shots, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ setupComplete: true, firstRunComplete: true }));
(async () => {
  const app = await electron.launch({ args: [root, '--smoke-test', `--data-dir=${dataDir}`], env: { ...process.env, NO_COLOR: '1' }, timeout: 30000 });
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('.session-grid');
  await page.setViewportSize({ width: 1240, height: 800 });
  const invoke = (m, p) => page.evaluate(async ([m, p]) => { const r = await window.dock.call(m, p); if (!r.ok) throw new Error(r.error); return r.value; }, [m, p]);
  const session = await invoke('session.create', { provider: 'custom', command: 'Write-Host ready', cwd: root, name: 'Paste target' });
  assert.equal(await page.locator('#screenshot-spot').isHidden(), true, 'No spot before a screenshot exists');
  // A 1x1 PNG saved into the watched folder, as Snipping Tool would.
  fs.copyFileSync(path.join(root, 'assets', 'icon.png'), path.join(shots, 'Screenshot 2026-10-22 120000.png'));
  await page.waitForSelector('#screenshot-spot:not([hidden])', { timeout: 8000 });
  await page.locator(`.terminal-instance[data-terminal-id="${session.id}"]`).click();
  await page.screenshot({ path: path.join(out, 'desktop-1240.png') });
  await page.locator('#screenshot-spot').click();
  const expected = path.join(shots, 'Screenshot 2026-10-22 120000.png');
  const seen = async () => (await invoke('session.buffer', session.id)).data.includes('Screenshot 2026-10-22 120000.png');
  for (let i = 0; i < 50 && !await seen(); i++) await new Promise(r => setTimeout(r, 100));
  assert.ok(await seen(), 'Clicking pastes the screenshot path into the console');
  await page.locator(`.terminal-instance[data-terminal-id="${session.id}"]`).press('Control+c');
  await page.locator('#screenshot-spot').dragTo(page.locator(`.terminal-instance[data-terminal-id="${session.id}"]`));
  await new Promise(r => setTimeout(r, 600));
  const count = (await invoke('session.buffer', session.id)).data.split('120000.png').length - 1;
  assert.ok(count >= 2, 'Dragging onto a console pastes the path too');
  await page.setViewportSize({ width: 760, height: 640 });
  await page.screenshot({ path: path.join(out, 'narrow-760.png') });
  await page.locator('#screenshot-spot').focus();
  await page.screenshot({ path: path.join(out, 'focus.png'), clip: { x: 0, y: 0, width: 760, height: 60 } });
  assert.deepEqual(errors, []);
  console.log('PASS screenshot spot: hidden without a screenshot, appears for a new file, click and drag paste', expected);
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
})().catch(async error => { console.error(error); process.exit(1); });
