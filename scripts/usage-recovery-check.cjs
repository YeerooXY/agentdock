'use strict';
const { installStateTransport } = require('./state-test-transport.cjs');
// Synthetic accounts only; no provider calls or model requests.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { copilotReading } = require('../electron/subscription-usage.cjs');
const { cursorReading } = require('../electron/cursor-usage.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/usage-recovery');
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0], file = url === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, url === '/' ? 'index.html' : url);
  if ((url !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
const now = Date.now(), win = (minutes, usedPercent, extra = {}) => ({ minutes, usedPercent, resetsAt: now + 3_600_000, ...extra });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const results = [];
  try { for (const [name, engine, options] of profiles) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext(options), state = structuredClone(base), errors = [];
      state.mode = 'dashboard'; Object.assign(state.settings, { setupComplete: true, sidebarCollapsed: false, usageShown: [], usageHidden: ['antigravity:default', 'copilot:default'] });
      state.ledger = []; state.delegations = []; state.usageChecks = [];
      state.limits = ['codex', 'claude'].map(provider => ({ id: provider, provider, accountId: provider + ':default', source: provider + ' account service', observedAt: now, plan: 'Pro', windows: [win(300, 0), win(10080, 100)] }));
      state.limits.push({ id: 'kiro', provider: 'kiro', accountId: 'kiro:default', source: 'Kiro /usage estimate', observedAt: now, windows: [win(43200, 20, { label: 'Monthly' })] });
      state.usageAccounts = ['codex', 'claude', 'kiro'].map(provider => ({ id: provider + ':default', provider, label: 'Default ' + provider, hasUsage: true }));
      // Hidden Antigravity is intentionally absent from discovery to test recovery.
      let page;
      await context.exposeFunction('fixtureCall', (method, payload) => {
        if (method === 'settings') { Object.assign(state.settings, payload); setTimeout(() => page.evaluate(s => window.fixtureState(s), state).catch(() => {}), 5); }
        return { ok: true, value: method === 'state' ? state : method === 'session.buffer' ? { data: '', sequence: 0 } : method === 'settings' ? state.settings : [] };
      });
      await installStateTransport(context);
await context.addInitScript(() => { window.dock = { call: (m,p) => window.fixtureCall(m,p), get state() { return window.fixtureStateTransport; }, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
      page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      if (!await page.locator('[data-page=usage]').first().isVisible()) await page.locator('#sidebar-toggle').click();
      await page.locator('[data-page=usage]').first().click();
      const section = page.locator('.account-switch-settings'), cards = page.locator('.usage-grid .quota-card'); await section.waitFor();
      assert.equal(await cards.filter({ has: page.locator('.quota-ring strong', { hasText: /^0%$/ }) }).count(), 2);
      assert.equal(await page.locator('.usage-grid .quota-exhausted').count(), 2);
      assert.equal(await cards.locator('.connection,.quota-foot,select').count(), 0);
      assert.doesNotMatch(await section.innerText(), /Current|account service|usage estimate|Default/);
      const sizes = await cards.first().evaluate(el => ['.quota-window>div:first-child', '.reset', '.usage-hide'].map(s => parseFloat(getComputedStyle(el.querySelector(s)).fontSize)));
      assert.ok(sizes[0] >= 15 && sizes[1] >= 14 && sizes[2] >= 14, name + ': readable labels');
      await page.mouse.move(0, 0); await page.waitForTimeout(250);
      await cards.first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, name + '-quotas.png') });
      await page.locator('[data-action=usage-hidden]').click();
      await page.locator('[data-usage-show="antigravity:default"]').click(); await page.waitForTimeout(150);
      assert.deepEqual(state.settings.usageHidden, ['copilot:default']);
      assert.ok(state.settings.usageShown.includes('antigravity:default'));
      assert.equal(await page.locator('.usage-grid [data-usage-provider=antigravity]').count(), 1);
      await page.locator('[data-usage-hide="antigravity:default"]').click(); await page.waitForTimeout(150);
      await page.locator('[data-action=usage-hidden]').click();
      await page.locator('[data-usage-show="antigravity:default"]').waitFor();
      await page.addScriptTag({ url: '/_axe.js' });
      const violations = await page.evaluate(async () => (await window.axe.run('.account-switch-settings', { runOnly: ['color-contrast', 'button-name', 'label', 'aria-valid-attr-value'] })).violations.map(x => x.id + ':' + x.nodes.length));
      assert.deepEqual(violations, [], name + ': accessibility');
      const overflow = await section.evaluate(el => [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className));
      assert.deepEqual(overflow, [], name + ': overflow');
      await page.locator('#usage-add-panel').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, name + '-restore.png') });
      // A passed reset alone cannot manufacture fresh allowance.
      state.limits[0].windows[1].resetsAt = now - 60000;
      await page.evaluate(s => window.fixtureState(s), state); await page.waitForTimeout(100);
      assert.equal(await page.locator('.usage-grid [data-usage-provider=codex].quota-exhausted.quota-stale').count(), 1);
      state.limits[0].windows[1] = win(10080, 5); state.limits[0].observedAt = Date.now();
      await page.evaluate(s => window.fixtureState(s), state); await page.waitForTimeout(100);
      assert.equal(await page.locator('.usage-grid [data-usage-provider=codex].quota-exhausted').count(), 0);
      // Add the hidden Copilot account with the observed free-plan response shape.
      state.limits.push(...copilotReading({ quotaSnapshots: {
        chat: { entitlementRequests: 200, usedRequests: 5, hasQuota: true, remainingPercentage: 97.5 },
        completions: { entitlementRequests: 2000, usedRequests: 0, hasQuota: true, remainingPercentage: 100 },
        premium_interactions: { entitlementRequests: 0, usedRequests: 0, hasQuota: false, remainingPercentage: 0 }
      } }, 'copilot:default', Date.now()));
      await page.evaluate(s => window.fixtureState(s), state); await page.waitForTimeout(100);
      await page.locator('[data-usage-show="copilot:default"]').click(); await page.waitForTimeout(150);
      const copilot = page.locator('.usage-grid [data-usage-provider=copilot]');
      assert.equal(await copilot.locator('.quota-window').count(), 2);
      assert.equal(await copilot.locator('.quota-ring strong').innerText(), '97.5%');
      assert.doesNotMatch(await copilot.getAttribute('class'), /quota-exhausted|quota-stale/);
      assert.doesNotMatch(await copilot.innerText(), /Premium interactions/);
      assert.ok(!state.settings.usageHidden.includes('copilot:default'));
      await copilot.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, name + '-copilot.png') });
      state.limits.push(...cursorReading('Usage • Free                    Resets Dec 1\nMonthly plan and on-demand usage\nIncluded 19% used\nAuto 38% used\nAPI 0% used\nOn-Demand Disabled\nEsc to close'));
      state.usageAccounts.push({ id: 'cursor:default', provider: 'cursor', label: 'Cursor', hasUsage: true });
      await page.evaluate(s => window.fixtureState(s), state); await page.waitForTimeout(100);
      const cursor = page.locator('.usage-grid [data-usage-provider=cursor]');
      assert.equal(await cursor.locator('.quota-window').count(), 3);
      assert.equal(await cursor.locator('.quota-ring strong').innerText(), '81%');
      assert.match(await cursor.innerText(), /Resets Dec 1/);
      assert.doesNotMatch(await cursor.getAttribute('class'), /quota-exhausted|quota-stale/);
      await cursor.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, name + '-cursor.png') });
      assert.deepEqual(await cursor.evaluate(el => [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className)), [], name + ': Cursor overflow');
      state.ledger = [{id:'local',at:Date.now(),provider:'strata',local:true,status:'completed',model:'local-model',usage:{total:800},durationMs:3000}, {id:'cloud',at:Date.now(),provider:'openai',status:'completed',model:'cloud-model',usage:{total:50},durationMs:1000}];
      await page.evaluate(s => window.fixtureState(s), state); await page.waitForTimeout(100);
      const stats = page.locator('.usage-stat-grid');
      assert.equal(await stats.locator('div').filter({has:page.locator('span',{hasText:'Cloud API tokens'})}).locator('strong').innerText(),'50');
      assert.equal(await stats.locator('div').filter({has:page.locator('span',{hasText:'Local tokens'})}).locator('strong').innerText(),'800');
      await stats.scrollIntoViewIfNeeded(); await page.screenshot({path:path.join(out,name+'-local-cloud.png')});
      assert.deepEqual(await stats.evaluate(el => [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className)), [], name + ': usage totals overflow');
      assert.deepEqual(errors, []); results.push({ profile: name, sizes, violations, overflow, copilot: true, passed: true });
    } finally { await browser.close(); }
  }} finally { server.close(); }
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ emulated: true, results }, null, 2));
  console.log('Quota exhaustion, readability, hidden-account recovery and refresh passed in four emulated profiles.');
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
