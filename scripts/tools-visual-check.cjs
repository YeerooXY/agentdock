'use strict';
const { installStateTransport } = require('./state-test-transport.cjs');
// Isolated renderer check for recommended tools and per-tool limits.
// Run test:desktop first to create the synthetic base.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts/tool-limits');
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0], file = path.join(root, 'dist', pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch(), errors = [];
  try {
    for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['narrow', { width: 760, height: 1000 }]]) {
      const context = await browser.newContext({ viewport }), state = structuredClone(base), calls = [];
      state.mode = 'dashboard'; state.settings.setupComplete = true;
      state.vault.entries = [{ id: 'notion', label: 'Notion', savedAt: Date.now() }];
      state.shared.connections = [
        { id: 'meshy', name: 'Meshy AI', type: 'stdio', integration: 'meshy', enabled: true, policy: { access: 'allowed', maxModel: 'meshy-6', dailyBudget: 50 } },
        { id: 'stripe', name: 'Stripe', type: 'stdio', catalog: 'stripe', enabled: true, policy: { access: 'ask', maxModel: null, dailyBudget: null } },
      ];
      state.toolLimits = { meshy: { models: ['meshy-6-lite', 'meshy-6', 'meshy-7', 'meshy-7.1'], unit: 'credits' }, stripe: { models: [], unit: 'paid calls' } };
      for (const item of state.integrations) item.connected = state.shared.connections.some(connection => connection.integration === item.id);
      state.toolCatalog = require('../electron/mcp-catalog.cjs').catalog.map(item => ({ ...item, added: item.id === 'stripe', ready: false, job: null }));
      await context.exposeFunction('fixtureCall', (method, payload) => {
        calls.push([method, payload]);
        if (method === 'catalog.add') {
          state.toolCatalog.find(item => item.id === payload.id).added = true;
          state.shared.connections.push({ id: payload.id, name: payload.id, type: 'stdio', catalog: payload.id, enabled: true });
        }
        return { ok: true, value: method === 'state' ? state : method === 'session.buffer' ? { data: '', sequence: 0 } : [] };
      });
      await installStateTransport(context);
await context.addInitScript(() => { window.dock = { call: async (m, p) => { const result = await window.fixtureCall(m, p); if (m === 'catalog.add') await window.fixtureState((await window.fixtureCall('state')).value); return result; }, get state() { return window.fixtureStateTransport; }, onOutput: () => {}, onSelect: () => {} }; });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator('[data-page=settings]').first().click(); await page.locator('.settings-navigation [data-page=tools]').click();
      await page.locator('.connection-list').waitFor();
      assert.equal(await page.locator('.tool-catalog, #tool-form').count(), 0);
      assert.equal(await page.locator('[data-integration=meshy]').count(), 1);
      const meshy = page.locator('[data-tool-policy=meshy]');
      assert.equal(await meshy.locator('[name=maxModel]').inputValue(), 'meshy-6');
      assert.match(await meshy.locator('label').nth(2).textContent(), /Daily budget, credits/);
      assert.equal(await page.locator('[data-tool-policy=stripe] [name=maxModel]').count(), 0, 'no model list for tools Paddock has no model data for');
      await meshy.locator('[name=access]').selectOption('off'); await meshy.locator('[name=dailyBudget]').fill('25'); await meshy.locator('[type=submit]').click();
      await page.waitForFunction(() => true);
      const saved = calls.filter(([m]) => m === 'tools.policy').at(-1);
      assert.deepEqual(saved[1], { id: 'meshy', policy: { access: 'off', maxModel: 'meshy-6', dailyBudget: '25' } });
      await page.locator('.settings-navigation [data-page=add-tools]').click();
      await page.locator('.tool-catalog').waitFor();
      assert.equal(await page.locator('[data-catalog]').count(), 5);
      assert.equal(await page.locator('[data-catalog=stripe]').count(), 0);
      assert.equal(await page.locator('.connection-list').count(), 0);
      assert.equal(await page.locator('[data-integration=meshy]').count(), 0);
      await page.locator('[data-catalog=github] [name=newKey]').fill('UNSUBMITTED_DRAFT');
      await page.locator('#tool-form [name=name]').fill('Unfinished custom tool');
      await page.locator('[data-catalog=notion] [data-catalog-add]').click();
      await page.locator('[data-catalog=notion]').waitFor({ state: 'detached' });
      assert.deepEqual(calls.filter(([m]) => m === 'catalog.add').at(-1)[1], { id: 'notion', keyId: 'notion' });
      assert.equal(await page.locator('[data-catalog=github] [name=newKey]').inputValue(), 'UNSUBMITTED_DRAFT');
      assert.equal(await page.locator('#tool-form [name=name]').inputValue(), 'Unfinished custom tool');
      assert.equal(await page.evaluate(() => document.activeElement === document.body), false, name + ' keeps focus after adding a tool');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name + ' has no sideways scroll');
      await page.locator('.tool-catalog').screenshot({ path: path.join(out, name + '-recommended.png') });
      await page.locator('.settings-navigation [data-page=tools]').click();
      await page.locator('.connection-list').screenshot({ path: path.join(out, name + '-limits.png') });
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('Tools visual check passed (Windows Chromium, desktop and narrow). Screenshots in artifacts/tool-limits.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exit(1); });
