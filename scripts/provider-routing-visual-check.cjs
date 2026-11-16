'use strict';
const { installStateTransport } = require('./state-test-transport.cjs');
// Synthetic routing settings only; no live provider calls.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { migrateRouting, defaults } = require('../electron/task-routing.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/provider-routing');
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0], file = url === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, url === '/' ? 'index.html' : url);
  if ((url !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const results = [];
  try { for (const [name, engine, options] of profiles) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext(options), state = structuredClone(base), errors = [], calls = [];
      state.mode = 'dashboard'; state.platform = ['mac', 'iphone'].includes(name) ? 'darwin' : 'win32';
      Object.assign(state.settings, { setupComplete: true, sidebarCollapsed: false, delegationEnabled: true, delegationProviders: ['claude','codex','kiro','antigravity','copilot','grok'], routing: migrateRouting(defaults) });
      state.ledger = []; state.delegations = []; state.usageChecks = [];
      let page;
      await context.exposeFunction('fixtureCall', (method, payload) => {
        if (method === 'settings') { calls.push(payload); Object.assign(state.settings, payload); }
        return { ok: true, value: method === 'state' ? state : method === 'session.buffer' ? { data: '', sequence: 0 } : method === 'settings' ? state.settings : [] };
      });
      await installStateTransport(context);
await context.addInitScript(() => { window.dock = { call: (m,p) => window.fixtureCall(m,p), get state() { return window.fixtureStateTransport; }, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
      page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator('.sidebar-bottom [data-page=settings]').click(); await page.locator('.settings-navigation [data-page=agent-settings]').click();
      const form = page.locator('#routing-form'); await form.waitFor();
      assert.equal(await form.locator('[name=discoverAccounts]').isChecked(), true);
      assert.equal(await form.locator('[name=preferFree]').isChecked(), true);
      await form.locator('[name=accountFunding]').fill('copilot:default free\ngrok:default unknown');
      await form.locator('[type=submit]').click();
      const saved = calls.find(x => x.routing)?.routing;
      assert.deepEqual(saved?.accountFunding, { 'copilot:default': 'free', 'grok:default': 'unknown' });
      assert.equal(saved?.discoverAccounts, true); assert.equal(saved?.preferFree, true);
      await page.addScriptTag({ url: '/_axe.js' });
      const axe = await page.evaluate(async () => (await window.axe.run('.delegation-settings', { runOnly: ['color-contrast', 'button-name', 'label'] })).violations.map(x => x.id));
      assert.deepEqual(axe, [], `${name}: accessibility`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('#content').scrollWidth > document.querySelector('#content').clientWidth + 1), false, `${name}: overflow`);
      await form.locator('[name=discoverAccounts]').scrollIntoViewIfNeeded(); await page.mouse.move(0, 0); await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(out, `${name}-routing.png`) });
      const reviews = page.locator('.delegation-settings').filter({ has: page.locator('.delegation-reviewers') });
      for (const label of ['Antigravity', 'GitHub Copilot', 'Grok']) assert.ok((await reviews.innerText()).includes(label));
      await reviews.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${name}-reviewers.png`) });
      assert.deepEqual(errors, []); results.push({ profile: name, emulated: true, checks: 'save, labels, accessibility, overflow, reviewer choices' });
    } finally { await browser.close(); }
  } } finally { server.close(); }
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
})().catch(e => { console.error(e); process.exitCode = 1; });
