'use strict';
// Usage page lists only set-up subscriptions; the rest are added from "Add subscription". Four browser profiles, synthetic state.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/usage-subscriptions');
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0], file = p === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, p === '/' ? 'index.html' : p);
  if ((p !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
const now = Date.now(), win = (minutes, usedPercent) => ({ minutes, usedPercent, resetsAt: now + 3_600_000 });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const errors = [];
  for (const [name, engine, options] of profiles) {
    const browser = await engine.launch(), context = await browser.newContext(options), state = structuredClone(base), calls = [];
    state.mode = 'dashboard'; Object.assign(state.settings, { setupComplete: true, sidebarCollapsed: false, usageShown: [], usageHidden: [] });
    state.ledger = []; state.delegations = [];
    state.limits = [{ id: 'codex', accountId: 'codex:default', provider: 'codex', name: 'Codex', source: 'Codex app server', observedAt: now, windows: [win(300, 38), win(10080, 30)] },
      { id: 'claude:account', accountId: 'claude:default', provider: 'claude', name: 'Claude Code', source: 'Claude Code', observedAt: now, windows: [win(300, 19), win(10080, 14)] }];
    state.usageAccounts = [{ id: 'codex:default', provider: 'codex', label: 'Codex', hasUsage: true }, { id: 'claude:default', provider: 'claude', label: 'Claude Code', hasUsage: true },
      { id: 'kiro:default', provider: 'kiro', label: 'Kiro', hasUsage: false }, { id: 'gemini:default', provider: 'gemini', label: 'Gemini CLI', hasUsage: false }, { id: 'copilot:default', provider: 'copilot', label: 'GitHub Copilot with a deliberately long account name', hasUsage: false }];
    let page;
    await context.exposeFunction('fixtureCall', (method, payload) => {
      calls.push([method, payload]);
      if (method === 'settings') { Object.assign(state.settings, payload); setTimeout(() => page.evaluate(s => window.fixtureState(s), state).catch(() => {}), 5); }
      return { ok: true, value: method === 'state' ? state : method === 'session.buffer' ? { data: '', sequence: 0 } : method === 'settings' ? state.settings : [] };
    });
    await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    page = await context.newPage(); page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    if (await page.locator('[data-page=usage]').first().isVisible()) await page.locator('[data-page=usage]').first().click();
    else { await page.locator('#sidebar-toggle').click(); await page.locator('[data-page=usage]').first().click(); }
    const cards = () => page.locator('.account-switch-settings .usage-grid .quota-card .quota-heading strong').allTextContents();
    const section = page.locator('.account-switch-settings'); await section.waitFor();
    let list = await cards();
    if (list.length !== 2 || list.some(x => /Kiro|Gemini|Copilot/.test(x))) errors.push(`${name}: expected only Codex and Claude, got ${list.join(', ')}`);
    await section.screenshot({ path: path.join(out, `${name}-closed.png`) });
    await page.locator('[data-action=usage-add]').click(); await page.locator('#usage-add-panel').waitFor();
    if (await page.locator('[data-usage-show]').count() !== 3) errors.push(`${name}: add panel should list 3 agents`);
    await page.addScriptTag({ url: '/_axe.js' });
    const axe = await page.evaluate(async () => (await window.axe.run('.account-switch-settings', { runOnly: ['color-contrast', 'button-name', 'label', 'aria-valid-attr-value'] })).violations.map(x => x.id + ':' + x.nodes.length));
    if (axe.length) errors.push(`${name}: axe ${axe.join(', ')}`);
    const wide = await page.evaluate(() => { const box = document.querySelector('#content').getBoundingClientRect(); return [...document.querySelectorAll('#content *')].filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().right > Math.min(innerWidth, box.right) + 1).map(e => e.tagName + '.' + String(e.className).split(' ')[0]).slice(0, 4); });
    if (wide.length) errors.push(`${name}: overflow ${wide.join(' ')}`);
    await section.screenshot({ path: path.join(out, `${name}-add-open.png`) });
    await page.locator('[data-usage-show="kiro:default"]').click(); await page.waitForTimeout(150);
    list = await cards();
    if (!list.some(x => x.includes('Kiro')) || await page.locator('#usage-add-panel').count()) errors.push(`${name}: Kiro was not added (${list.join(', ')})`);
    if (!calls.some(([m]) => m === 'refresh')) errors.push(`${name}: adding did not check limits`);
    await page.locator('[data-usage-hide="codex:default"]').click(); await page.waitForTimeout(150);
    list = await cards();
    if (list.some(x => x.startsWith('Codex'))) errors.push(`${name}: Codex was not hidden`);
    await page.locator('[data-action=usage-add]').click(); await page.locator('[data-usage-show="codex:default"]').waitFor();
    await page.locator('[data-usage-new-account=claude]').click(); await page.waitForTimeout(150);
    if (await page.locator('#account-profile-form [name=provider]').inputValue() !== 'claude' || !await page.evaluate(() => document.activeElement?.name === 'label')) errors.push(`${name}: new account does not reach the form`);
    await browser.close();
  }
  server.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('usage subscriptions check passed on pc, mac, android and iphone profiles (emulated)');
})();
