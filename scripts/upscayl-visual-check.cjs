'use strict';
const { installStateTransport } = require('./state-test-transport.cjs');
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { openPage } = require('./ui-navigation.cjs');
const { definitions } = require('../electron/integrations.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts', 'upscayl', 'visual');
fs.mkdirSync(out, { recursive: true });
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'console-layout', 'fixture.json')));
const server = http.createServer((req, res) => {
  const file = path.resolve(dist, '.' + (req.url === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
const profiles = [['windows-chromium', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac-webkit-emulated', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android-chromium-emulated', chromium, devices['Pixel 7']], ['iphone-webkit-emulated', webkit, devices['iPhone 13']]];
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`, results = [];
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options), state = structuredClone(fixture), calls = [], errors = [];
    state.mode = 'dashboard'; state.settings.setupComplete = true; state.settings.theme = 'blue';
    state.shared.connections = []; state.workbench.setupRequests = [];
    state.integrations = definitions.map(item => ({ ...item, ready: false, available: true, connected: false, enabled: true, job: null }));
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      calls.push({ method, payload });
      if (method === 'state') return { ok: true, value: state };
      if (method === 'integrations.setup') return { ok: false, error: 'Download verification failed. Try again.' };
      return { ok: true, value: method === 'session.buffer' ? { data: '', sequence: 0 } : [] };
    });
    await installStateTransport(context);
await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), get state() { return window.fixtureStateTransport; }, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin); await openPage(page, 'tools');
    const card = page.locator('[data-integration=upscayl]'); await card.scrollIntoViewIfNeeded(); await page.evaluate(() => document.fonts.ready);
    assert.match(await card.textContent(), /Vulkan GPU/); assert.equal(await card.locator('[data-integration-setup]').textContent(), 'Install and connect');
    await card.screenshot({ path: path.join(out, name + '-card.png') });
    if (name.includes('iphone')) {
      // A phone's scroll area is shorter than this card. Capture both portions
      // in the actual viewport so fixed Settings controls do not hide evidence.
      await card.locator('h3').evaluate(el => el.scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: path.join(out, name + '-heading-viewport.png') });
      await card.locator('[data-integration-setup]').evaluate(el => el.scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: path.join(out, name + '-action-viewport.png') });
    }
    await card.locator('[data-docs]').click(); assert.ok(calls.some(c => c.method === 'docs' && c.payload === 'upscayl'));
    await card.locator('[data-integration-setup]').focus(); await page.keyboard.press('Enter');
    await card.locator('[data-integration-status]').filter({ hasText: 'Download verification failed.' }).waitFor();
    assert.equal(await card.locator('[data-integration-setup]').isEnabled(), true);
    await card.screenshot({ path: path.join(out, name + '-error.png') });
    state.integrations.find(x => x.id === 'upscayl').ready = true;
    state.integrations.find(x => x.id === 'upscayl').connected = true;
    await page.evaluate(state => window.fixtureState(state), state);
    await openPage(page, 'general-settings'); await openPage(page, 'tools');
    await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: path.join(out, name + '-connected.png') });
    assert.match(await card.locator('[data-integration-status]').textContent(), /Connected/);
    assert.equal(await card.evaluate(el => el.scrollWidth > el.clientWidth + 1), false); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.deepEqual(errors, []); results.push({ profile: name, passed: true, states: ['install', 'failure/retry', 'connected'], emulated: name !== 'windows-chromium' });
    await browser.close(); browser = null;
  }
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(results, null, 2)); console.log('PASS Upscayl card on four profiles; installation and failure/retry calls are mocked.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
