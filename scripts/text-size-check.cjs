'use strict';
// A−/A+ buttons change one console's xterm font size and persist per viewer.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const profile = process.env.PROFILE || 'windows-chromium';
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/console-font-2026-11-01', profile);
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0], file = path.join(dist, p === '/' ? 'index.html' : p);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const engine = profile.includes('webkit') ? webkit : chromium;
  const device = profile === 'iphone-webkit' ? devices['iPhone 13'] : profile === 'android-chromium' ? devices['Pixel 7'] : { viewport: { width: 1280, height: 800 } };
  const browser = await engine.launch(), context = await browser.newContext(device), state = structuredClone(base), errors = [];
  state.mode = 'dashboard'; Object.assign(state.settings, { setupComplete: true, trimStyle: 'classic', grid: { columns: 4, rows: 3 } }); state.grid = { columns: 4, rows: 3 };
  state.sessions = [0, 1].map(i => ({ ...base.sessions[0], id: `fx-${i}`, consoleKey: `font-${i}`, launchId: 'font-check', slot: i + 1, width: 1, height: 1, state: 'open', name: `Console ${i + 1}` }));
  await context.exposeFunction('fixtureCall', async (method) => method === 'state' ? { ok: true, value: state } : method === 'session.buffer' ? { ok: true, value: { data: 'Readable text check\r\nPS C:\\> ', sequence: 0, launchId: 'font-check' } } : { ok: true, value: [] });
  await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: fn => window.fixtureSelect = fn, onNotice: () => {} }; });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.session-grid .xterm').first().waitFor();
  await page.waitForFunction(() => document.querySelector('.session-grid .xterm-rows')?.textContent.includes('Readable'));
  const size = slot => page.locator(`.session-grid > [data-slot="${slot}"] .xterm-rows`).evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  const before = await size(1), other = await size(2);
  assert.equal(before, 21, 'new compact consoles start at the largest size');
  assert.equal(await page.locator('.session-grid > [data-slot="1"] [data-text-size="1"]').isDisabled(), true);
  for (let i = 0; i < 3; i++) await page.locator('.session-grid > [data-slot="1"] [data-text-size="-1"]').click();
  await page.waitForTimeout(200);
  assert.equal(await size(1), before - 3); assert.equal(await size(2), other, 'other consoles keep their size');
  await page.screenshot({ path: path.join(out, 'text-size-larger.png') });
  await page.reload(); await page.locator('.session-grid .xterm').first().waitFor(); await page.waitForTimeout(200);
  assert.equal(await size(1), before - 3, 'size survives reload');
  for (let i = 0; i < 20; i++) await page.locator('.session-grid > [data-slot="1"] [data-text-size="-1"]').click({ force: true });
  assert.equal(await size(1), before - 14); assert.equal(await page.locator('.session-grid > [data-slot="1"] [data-text-size="-1"]').isDisabled(), true);
  for (let i = 0; i < 4; i++) await page.locator('.session-grid > [data-slot="1"] [data-text-size="1"]').click();
  await page.reload(); await page.locator('.session-grid .xterm').first().waitFor();
  assert.equal(await size(1), 11, 'a saved zero step survives the largest default');
  await page.evaluate(() => window.fixtureSelect({ id: 'fx-0', textSize: 'largest' }));
  await page.waitForTimeout(200);
  assert.equal(await size(1), 21, 'study launch selects the largest size');
  await page.screenshot({ path: path.join(out, 'largest-console-text.png') });
  const header = await page.locator('.session-grid > [data-slot="1"] .console-panel-header').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
  assert.ok(header, 'header fits'); assert.deepEqual(errors, []);
  console.log('PASS per-console text size buttons, limits, persistence, header fit');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
