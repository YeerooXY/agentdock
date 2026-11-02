'use strict';
// Usage rows and in-place patching: states, screenshots and keyboard focus.
// Needs dist/ (npm run build) and artifacts/console-layout/fixture.json (from test:desktop).
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.build/usage-rows');
fs.mkdirSync(out, { recursive: true });
const fixture = [path.join(root, 'artifacts/console-layout/fixture.json'), path.resolve(root, '../../../artifacts/console-layout/fixture.json')].find(fs.existsSync);
const base = JSON.parse(fs.readFileSync(fixture, 'utf8'));
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0], file = path.join(root, 'dist', pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['android', chromium, { ...devices['Pixel 7'] }]];
if (process.env.USAGE_WEBKIT) profiles.push(['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['iphone', webkit, { ...devices['iPhone 13'] }]);
const now = Date.now(), win = (label, minutes, usedPercent) => ({ key: label, label, minutes, usedPercent, unlimited: false, resetsAt: now + 3600000, resetLabel: null });
const reading = (id, provider, windows, plan) => ({ accountId: id, provider, plan, observedAt: now - 30000, windows });
const check = (id, provider, fields) => ({ accountId: id, provider, status: 'current', checkedAt: now, observedAt: now - 30000, message: '', stale: false, staleReason: null, lastReadings: [], ...fields });
function build() {
  const state = structuredClone(base);
  state.mode = 'dashboard'; state.settings.setupComplete = true; state.settings.sidebarCollapsed = false; state.settings.usageHidden = []; state.ledger = []; state.limits = [];
  const accounts = [['codex:default', 'codex', 'Codex'], ['codex:work', 'codex', 'Work'], ['claude:default', 'claude', 'Claude Code'], ['kiro:default', 'kiro', 'Kiro'], ['grok:default', 'grok', 'Grok'], ['copilot:work', 'copilot', 'Copilot work']];
  state.accountProviders = [['claude', 'Claude Code', true], ['codex', 'Codex', true], ['gemini', 'Gemini CLI', true], ['pi', 'Pi', true], ['kiro', 'Kiro', false], ['grok', 'Grok', false], ['copilot', 'GitHub Copilot', false], ['cursor', 'Cursor', false], ['cline', 'Cline', false]].map(([id, name, namedProfiles]) => ({ id, name, namedProfiles }));
  state.agents = [{ id: 'cline', installed: false }];
  state.usageAccounts = accounts.map(([id, provider, label]) => ({ id, provider, label, hasUsage: true }));
  const r1 = reading('codex:default', 'codex', [win('5-hour', 300, 38), win('Weekly', 10080, 71)], 'Pro');
  const r2 = reading('codex:work', 'codex', [win('5-hour', 300, 20)], 'Plus'); r2.observedAt = now - 3 * 3600000;
  const r3 = reading('claude:default', 'claude', [win('5-hour', 300, null), win('Weekly', 10080, 90), win('Opus', 10080, 40), win('Sonnet', 10080, 10), win('Design', 10080, 5)], 'Max');
  state.usageChecks = [
    check('codex:default', 'codex', { lastReadings: [r1] }),
    check('codex:work', 'codex', { status: 'stale', stale: true, staleReason: 'old', observedAt: r2.observedAt, lastReadings: [r2] }),
    check('claude:default', 'claude', { lastReadings: [r3] }),
    check('kiro:default', 'kiro', { status: 'unavailable', observedAt: null, message: 'The provider could not return current usage. Try again.' }),
    check('grok:default', 'grok', { status: 'unsupported', reason: 'no-source', observedAt: null, message: 'No known quota source.' }),
    check('copilot:work', 'copilot', { status: 'not-isolated', observedAt: null, message: 'Separate sign-in storage is not verified for this CLI.' })
  ];
  return state;
}
let browser;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options), state = build(), errors = [];
    await context.exposeFunction('fixtureCall', method => ({ ok: true, value: method === 'state' ? state : method === 'session.buffer' ? { data: '', sequence: 0 } : [] }));
    await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {} }; });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => document.querySelector('[data-page=usage]').click());
    await page.locator('.usage-row').first().waitFor();
    const push = () => page.evaluate(s => window.fixtureState(structuredClone(s)), state);
    const text = id => page.locator(`[data-usage-account-id="${id}"]`).innerText();
    // States
    assert.equal(await page.locator('.usage-row').count(), 6);
    assert.equal(await page.locator('.usage-provider').count(), 5, 'one header per provider');
    assert.equal(await page.locator('select[data-usage-account]').count(), 0, 'account select removed');
    assert.match(await text('codex:default'), /62% left/);
    assert.match(await text('codex:work'), /Stale/); assert.match(await text('codex:work'), /Last refreshed: 3h ago/); assert.match(await text('codex:work'), /80% left/);
    const claude = await text('claude:default');
    assert.match(claude, /More limits/);
    assert.match(claude, /More limits \(1\)/);
    assert.deepEqual(await page.locator('[data-usage-account-id="claude:default"] .usage-window-value').allTextContents(), ['10% left', '60% left', '90% left', '95% left', 'Unknown']);
    assert.match(await text('kiro:default'), /Unavailable/); assert.match(await text('grok:default'), /No quota source/); assert.match(await text('copilot:work'), /Not isolated/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name + ' overflow');
    await page.screenshot({ path: path.join(out, name + '-usage-states.png'), fullPage: true });
    // Keyboard: Space opens More limits; a state push keeps it open and focused.
    const summary = page.locator('[data-usage-account-id="claude:default"] .usage-more > summary');
    await summary.focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('.usage-more').evaluate(d => d.open), true);
    state.usageChecks[0].lastReadings[0].windows[0].usedPercent = 50; await push();
    assert.equal(await page.locator('.usage-more').evaluate(d => d.open), true, 'details stays open');
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'SUMMARY', 'focus stays on summary');
    assert.match(await text('codex:default'), /50% left/);
    await page.keyboard.press('Shift+Tab');
    assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY');
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.usage-more').evaluate(d => d.open), false, 'Enter toggles closed');
    // Rows carry no per-account Refresh or Hide, and a check in progress keeps every card's size.
    assert.equal(await page.locator('[data-usage-hide], [data-usage-refresh]').count(), 0);
    const sizes = () => page.locator('.usage-row').evaluateAll(rows => rows.map(row => Math.round(row.getBoundingClientRect().height)));
    const before = await sizes();
    for (const check of state.usageChecks) check.checking = true;
    state.refreshing = true; await push();
    assert.match(await text('codex:default'), /Checking now/);
    assert.deepEqual(await sizes(), before, 'cards keep their size while checking');
    for (const check of state.usageChecks) delete check.checking;
    state.refreshing = false; await push();
    assert.deepEqual(await sizes(), before, 'cards keep their size after checking');
    // Typing survives a push.
    const period = page.locator('[data-usage-period]'); await period.focus(); await page.keyboard.press('ArrowDown');
    await push(); assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-usage-period')), true);
    // Used-up allowance: limits blur and the next reset is centred over them.
    state.usageChecks[0].lastReadings[0].windows[1].usedPercent = 100; state.usageChecks[0].lastReadings[0].windows[1].resetsAt = Date.now() + (37 * 60 + 5) * 60000; await push();
    assert.match(await page.locator('[data-usage-account-id="codex:default"] .usage-next-reset').innerText(), /^Next reset in: 1d 13h$/);
    await page.locator('[data-usage-account-id="codex:default"]').screenshot({ path: path.join(out, name + '-usage-spent.png') });
    await page.locator('.usage-add-slot').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, name + '-usage-bottom.png') });
    // Add subscription lists every provider with what adding it does.
    await page.locator('[data-action=usage-add]').click();
    assert.equal(await page.locator('.usage-choice').count(), 9);
    assert.match(await page.locator('.usage-choice', { hasText: 'Gemini CLI' }).innerText(), /Add account/);
    assert.match(await page.locator('.usage-choice', { hasText: 'Cline' }).innerText(), /Install the CLI first/);
    assert.equal(await page.evaluate(() => document.activeElement?.closest('#usage-add-panel') !== null), true, 'focus moves into the chooser');
    await page.locator('#usage-add-panel').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, name + '-usage-chooser.png') });
    await page.locator('[data-action=usage-add]').click();
    // Empty state
    state.settings.usageHidden = state.usageAccounts.map(a => a.id); await push();
    assert.match(await page.locator('.usage-empty').innerText(), /hidden/);
    await page.screenshot({ path: path.join(out, name + '-usage-empty.png') });
    assert.deepEqual(errors, [], name + ' page errors');
    await browser.close(); browser = null;
  }
  console.log('PASS: Usage rows, patching and keyboard focus on ' + profiles.map(p => p[0]).join(', '));
})().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
