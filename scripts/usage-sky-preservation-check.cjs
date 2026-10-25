'use strict';
// Guards the shared #content sky across Usage state broadcasts and navigation.
// Run after npm run build. Uses synthetic local state and makes no model calls.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.build/codex-prompt-runs/2026-10-24/3/verification');
fs.mkdirSync(out, { recursive: true });
const fixture = structuredClone(JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json'))));
fixture.mode = 'dashboard';
fixture.settings = { ...fixture.settings, trimStyle: 'blue', themeTextures: true, starDensity: 4, ambientMotion: true };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, 'dist', '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});

function installFixture(initial) {
  let state = structuredClone(initial);
  const weak = new WeakMap(); let nextCanvasId = 1;
  const proto = CanvasRenderingContext2D.prototype;
  const clearRect = proto.clearRect, drawImage = proto.drawImage;
  proto.clearRect = function (...args) {
    if (this.canvas.matches('.panel-sky')) {
      const record = weak.get(this.canvas) || { id: nextCanvasId++, frames: 0, samples: [] };
      record.frames++;
      record.samples = [];
      weak.set(this.canvas, record);
    }
    return clearRect.apply(this, args);
  };
  proto.drawImage = function (image, x, y, width, height, ...rest) {
    if (this.canvas.matches('.panel-sky')) {
      const record = weak.get(this.canvas) || { id: nextCanvasId++, frames: 0, samples: [] };
      if (record.samples.length < 16) record.samples.push([x + width / 2, y + height / 2]);
      weak.set(this.canvas, record);
    }
    return drawImage.call(this, image, x, y, width, height, ...rest);
  };
  const copy = () => structuredClone(state);
  window.fixtureCalls = [];
  window.fixtureBroadcast = patch => {
    state = { ...state, ...patch };
    window.fixtureReceive(copy());
  };
  window.fixtureBroadcastSettings = patch => {
    state.settings = { ...state.settings, ...patch };
    window.fixtureReceive(copy());
  };
  window.dock = {
    async call(method, payload) {
      window.fixtureCalls.push([method, payload]);
      if (method === 'state') return { ok: true, value: copy() };
      if (method === 'settings') { state.settings = { ...state.settings, ...payload }; window.fixtureReceive(copy()); return { ok: true }; }
      if (method === 'mode') { state.mode = payload; window.fixtureReceive(copy()); return { ok: true }; }
      if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0 } };
      return { ok: true, value: [] };
    },
    onState(fn) { window.fixtureReceive = fn; }, onOutput() {}, onSelect() {}, onNotice() {},
  };
  window.skyState = canvas => {
    const record = weak.get(canvas);
    return record && { id: record.id, frames: record.frames, samples: record.samples.map(point => [...point]) };
  };
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1212, height: 1147 } });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(installFixture, fixture);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin); await page.locator('.session-grid').waitFor();
    await page.locator('.sidebar [data-page=usage]').click();
    await page.waitForTimeout(240); // Settle the finite view transition before inspecting content.
    const canvas = await page.$('#content > .page-background-layer > .panel-sky');
    const backdrop = await page.$('#content > .page-background-layer > .page-backdrop');
    assert.ok(canvas && backdrop, 'Usage mounts one region sky and its backdrop');
    await page.waitForTimeout(450); // Ambient motion remains enabled while its phase advances.
    const initial = await page.evaluate(node => window.skyState(node), canvas);
    assert.ok(initial?.frames > 3 && initial.samples.length >= 3, 'Usage sky has a live seeded particle pool');

    for (const requests of [43, 44, 45]) {
      const tokens = requests * 100;
      await page.evaluate(({ requests, tokens }) => window.fixtureBroadcast({ summary: { ...window.fixtureSummary, requests, tokens } }), { requests, tokens });
      // Assert the rendered usage update as well as preserving the actual controller canvas.
      await page.waitForFunction(value => document.querySelector('.usage-stats .stat strong')?.textContent === String(value), requests);
      assert.equal(await page.evaluate(node => document.querySelector('#content > .page-background-layer > .panel-sky') === node, canvas), true,
        `Usage broadcast ${requests} preserves the canvas node and its Sky controller`);
      assert.equal(await page.evaluate(node => document.querySelector('#content > .page-background-layer > .page-backdrop') === node, backdrop), true,
        `Usage broadcast ${requests} preserves its backdrop node`);
    }
    await page.waitForTimeout(180);
    const afterBroadcasts = await page.evaluate(node => window.skyState(node), canvas);
    assert.equal(afterBroadcasts.id, initial.id, 'Repeated state broadcasts retain the same seeded pool');
    assert.ok(afterBroadcasts.frames > initial.frames + 3, 'The retained sky keeps drawing through Usage updates');
    const initialParticle = initial.samples[0], broadcastParticle = afterBroadcasts.samples[0];
    assert.ok(initialParticle && broadcastParticle && Math.hypot(broadcastParticle[0]-initialParticle[0],broadcastParticle[1]-initialParticle[1]) > .01,
      'The retained particle pool continues from its elapsed phase');

    // Model an unrelated Settings update arriving while Usage is active.
    await page.evaluate(() => window.fixtureBroadcastSettings({ vimControls: true }));
    assert.equal(await page.evaluate(node => document.querySelector('#content > .page-background-layer > .panel-sky') === node, canvas), true,
      'An unrelated Settings broadcast preserves the Usage sky');
    await page.waitForTimeout(180);

    // Navigate away and back; #content owns one field whose phase belongs to the region.
    await page.locator('.sidebar-bottom [data-page=settings]').click();
    await page.locator('.settings-navigation [data-page=appearance]').click();
    await page.waitForTimeout(240);
    const appearanceCanvasSame = await page.evaluate(node => document.querySelector('#content > .page-background-layer > .panel-sky') === node, canvas);
    assert.equal(appearanceCanvasSame, true, 'Settings navigation keeps the #content sky node');
    const launchEffect = page.locator('[data-setting=launchEffect]');
    await launchEffect.setChecked(false);
    assert.equal(await page.evaluate(node => document.querySelector('#content > .page-background-layer > .panel-sky') === node, canvas), true,
      'A real unrelated Settings control change keeps the #content sky node');
    await page.locator('.settings-close button').click();
    await page.waitForTimeout(240);
    assert.equal(await page.evaluate(node => document.querySelector('#content > .page-background-layer > .panel-sky') === node, canvas), true,
      'Returning to Usage reuses the region sky');
    await page.waitForTimeout(350);
    const afterNavigation = await page.evaluate(node => window.skyState(node), canvas);
    assert.equal(afterNavigation.id, initial.id, 'Navigation does not reseed the region sky');
    assert.ok(afterNavigation.frames > afterBroadcasts.frames, 'The particle phase continues after navigation and setting changes');
    assert.deepEqual(errors, [], 'No renderer errors occur');

    const result = {
      profile: 'Windows Chromium 1212x1147', emulated: false,
      checks: ['three Usage state broadcasts preserve canvas/backdrop identity', 'usage counters update', 'unrelated Settings broadcast', 'Settings navigation and real control change', 'return to Usage preserves seeded canvas and continued frame phase'],
      initial, afterBroadcasts, afterNavigation, errors,
    };
    fs.writeFileSync(path.join(out, 'usage-sky-preservation.json'), JSON.stringify(result, null, 2));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } finally { await browser.close(); server.close(); }
})().catch(error => { server.close(); console.error(error); process.exitCode = 1; });
