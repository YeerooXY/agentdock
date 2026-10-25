'use strict';
// The shipped renderer with fake IPC: the agent chooser lists installed agents,
// one row per signed-in account with usage, most recent first, in a popover
// that leaves the dialog layout unchanged. Run after npm run build:
// node scripts/agent-chooser-visual-check.cjs
const { chromium, webkit, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { initialSettings } = require('../electron/settings.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.join(root, '.build', 'agent-chooser');
fs.mkdirSync(out, { recursive: true });
const profiles = [
  ['windows-chromium', chromium, { viewport: { width: 1440, height: 900 } }],
  ['desktop-webkit-mac-emulation', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }],
  ['android-chromium-pixel7-emulation', chromium, devices['Pixel 7']],
  ['iphone-webkit-iphone13-emulation', webkit, devices['iPhone 13']],
];
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
const copy = value => JSON.parse(JSON.stringify(value));
const now = Date.now(), hour = 3600000;
const agent = (id, name, installed) => ({ id, name, installed, model: '--model', unrestricted: ['--x'] });
const windows = (fiveHour, weekly) => [{ minutes: 300, usedPercent: 100 - fiveHour, resetsAt: now + 2 * hour }, { minutes: 10080, usedPercent: 100 - weekly, resetsAt: now + 3 * 24 * hour }];
function makeState() {
  return {
    mode: 'dashboard', transitioning: false, trayHidden: false, grid: { columns: 3, rows: 3 },
    sessions: [{ id: 'kiro-1', consoleKey: 'kiro-1', projectId: null, worktree: { repository: 'C:\\Workspace', path: 'C:\\Paddock\\worktrees\\workspace\\header-redesign-a1b2c3', branch: 'paddock/header-redesign-a1b2c3', base: 'a'.repeat(40) }, slot: 1, width: 1, height: 1, name: 'Kiro', nameMode: 'custom', cwd: 'C:\\Workspace', provider: 'kiro', permissions: 'default', launchModel: '', accountId: null, launchId: 'l1', purpose: 'agent', switching: false, dismissed: false, draftSupported: false, switchTargets: [], state: 'open', alive: true, cols: 80, rows: 24, sequence: 0, usage: null, createdAt: now - hour, updatedAt: now - hour }],
    settings: initialSettings({ setupComplete: true, suggestProjects: false, restoreConsoles: false, consoleDefaults: { provider: 'codex', cwd: 'C:\\Workspace', name: '', command: '' } }, 'C:\\Workspace', {}),
    agents: [agent('codex', 'Codex', true), agent('claude', 'Claude Code', true), agent('antigravity', 'Google Antigravity', false), agent('copilot', 'GitHub Copilot', false), agent('kiro', 'Kiro', true), agent('gemini', 'Gemini CLI', true), agent('cline', 'Cline', false)],
    accounts: [
      { id: 'codex:default', provider: 'codex', label: 'Personal', profile: false },
      { id: 'codex-work', provider: 'codex', label: 'Work', profile: true, loginCompletedAt: now - 24 * hour },
      { id: 'codex-pending', provider: 'codex', label: 'Not signed in', profile: true, loginCompletedAt: null },
      { id: 'claude:default', provider: 'claude', label: 'Claude', profile: false },
    ],
    limits: [
      { provider: 'codex', id: 'codex', accountId: 'codex:default', observedAt: now, windows: windows(91, 70) },
      { provider: 'codex', id: 'codex', accountId: 'codex-work', observedAt: now, windows: windows(62, 80) },
      { provider: 'claude', id: 'claude:account', observedAt: now - 20 * 60000, windows: windows(40, 55) },
    ],
    projects: [], recent: [], accountError: null, refreshing: false, lastRefresh: 0, capabilities: {}, sshHosts: [], messages: [], ledger: [],
    summary: { requests: 0, tokens: 0 }, shared: { connections: [], profiles: [], imageGeneration: { provider: 'agent', previewFirst: true }, instructions: '' },
    workbench: { results: [], concepts: [], unreadResults: 0, setupRequests: [] }, vault: { available: false, entries: [] }, integrations: [], toolCatalog: [], toolLimits: {},
    defaultFolder: 'C:\\Workspace', version: 'fixture', screenshot: null,
  };
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const record = [];
  for (const [name, type, options] of profiles) {
    const browser = await type.launch({ headless: true });
    const context = await browser.newContext(options);
    const state = makeState(), creates = [], errors = [];
    let page;
    await context.addInitScript(at => { localStorage.setItem('console-recent', JSON.stringify({ 'codex|codex-work': at })); }, now);
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      if (method === 'state') return { ok: true, value: copy(state) };
      if (method === 'session.buffer') return { ok: true, value: { data: 'PS C:\\Workspace> ', sequence: 0, launchId: 'l1' } };
      if (method === 'session.models') return { ok: true, value: [] };
      if (method === 'session.create') { creates.push(copy(payload)); throw new Error('Fixture stops before launching.'); }
      return { ok: true, value: null };
    });
    await context.addInitScript(() => {
      window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: c => { window.fixtureReceive = c; }, onOutput: c => { window.fixtureOutput = c; }, onSelect: c => { window.fixtureSelect = c; }, onNotice: c => { window.fixtureNotice = c; } };
    });
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    // A worktree console shows its branch in the header without crowding the controls.
    const badge = page.locator('.session-card[data-console-id="kiro-1"] .worktree-badge');
    await badge.waitFor();
    assert.equal(await badge.getAttribute('aria-label'), 'Git worktree branch paddock/header-redesign-a1b2c3');
    assert.ok((await badge.boundingBox()).width <= 26, `${name}: a single-cell console shows only the branch icon`);
    const header = await page.locator('.session-card[data-console-id="kiro-1"] .console-panel-header').evaluate(el => ({ fits: el.scrollWidth <= el.clientWidth + 1, scroll: el.scrollWidth, client: el.clientWidth, widths: [...el.children].map(c => c.className + ':' + Math.round(c.getBoundingClientRect().width)) }));
    assert.equal(header.fits, true, `${name}: console header has no overflow with the worktree badge ${JSON.stringify(header)}`);
    await page.locator('.session-card[data-console-id="kiro-1"]').screenshot({ path: path.join(out, `${name}-worktree-badge.png`) });
    await page.locator('.session-card.empty[data-slot="2"] [data-action=new]').click({ button: 'right' });
    const chooser = page.locator('#console-chooser'); await chooser.waitFor({ state: 'visible' });
    await page.evaluate(() => Promise.all(document.getAnimations().map(x => x.finished.catch(() => {}))));
    await page.waitForTimeout(250);
    const before = await chooser.boundingBox(), footer = await chooser.locator('.dialog-footer').boundingBox();
    await chooser.locator('.shell-picker-trigger').click();
    const list = chooser.locator('.shell-picker-options');
    await list.waitFor({ state: 'visible' });
    const after = await chooser.boundingBox(), footerAfter = await chooser.locator('.dialog-footer').boundingBox();
    assert.deepEqual(after, before, `${name}: opening the list leaves the dialog unchanged`);
    assert.deepEqual(footerAfter, footer, `${name}: buttons stay in place`);
    const rows = await list.locator('[data-choice]').evaluateAll(buttons => buttons.map(b => b.innerText.replace(/\s+/g, ' ').trim()));
    const groups = await list.locator('.shell-picker-group').allInnerTexts();
    assert.deepEqual(groups.map(x => x.toUpperCase()), ['RECENT', 'OTHER INSTALLED'], name);
    assert.match(rows[0], /^Codex · Work 62% left · resets/, `${name}: last used account first`);
    assert.match(rows[1], /^Kiro/, `${name}: open console counts as recent`);
    assert.ok(rows.some(r => /^Codex · Personal\s*Most left 70% left · resets/.test(r)), `${name}: best account marked: ${rows}`);
    assert.ok(rows.some(r => /^Claude Code 40% left · resets .* · cached$/.test(r)), `${name}: stale usage labeled: ${rows}`);
    assert.ok(!rows.some(r => /Not signed in|Antigravity|Copilot|Cline/.test(r)), `${name}: only installed agents and signed-in accounts`);
    const box = await list.boundingBox(), viewport = page.viewportSize();
    assert.ok(box.x >= 0 && box.x + box.width <= viewport.width + 1 && box.y >= 0 && box.y + box.height <= viewport.height + 1, `${name}: list fits the screen ${JSON.stringify(box)} ${JSON.stringify(await chooser.locator(".shell-picker-trigger").boundingBox())}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`);
    await page.screenshot({ path: path.join(out, `${name}-open.png`) });
    await list.locator('[data-choice]').filter({ hasText: 'Personal' }).click();
    assert.equal(await list.evaluate(el => el.matches(':popover-open')), false);
    assert.equal(await chooser.locator('[name=accountId]').inputValue(), 'codex:default');
    assert.match(await chooser.locator('.shell-picker-trigger').innerText(), /Codex · Personal/);
    // Worktree option sits in Options and is sent with the launch.
    await chooser.locator('.console-options>summary').click();
    const worktreeOption = chooser.locator('#one-off-worktree');
    await worktreeOption.waitFor();
    assert.ok(await worktreeOption.evaluate(el => el.scrollWidth <= el.clientWidth + 1), `${name}: worktree option text wraps inside the dialog`);
    await worktreeOption.locator('input').check();
    await page.screenshot({ path: path.join(out, `${name}-worktree-option.png`) });
    await chooser.locator('[name=cwd]').fill('C:\\Workspace');
    await chooser.locator('[type=submit]').click();
    await chooser.locator('.form-error').filter({ hasText: 'Fixture stops' }).waitFor();
    assert.equal(creates.at(-1).provider, 'codex'); assert.equal(creates.at(-1).accountId, 'codex:default'); assert.equal(creates.at(-1).worktree, '1');
    await page.screenshot({ path: path.join(out, `${name}-chosen.png`) });
    assert.deepEqual(errors, [], name);
    record.push(`${name}: ${rows.length} rows; layout unchanged; list ${Math.round(box.width)}x${Math.round(box.height)} inside ${viewport.width}x${viewport.height}`);
    await browser.close();
  }
  server.close();
  fs.writeFileSync(path.join(out, 'verification.md'), `# Agent chooser check\n\n${new Date().toISOString()}\n\nEmulated profiles (Playwright engines and device presets; not physical devices):\n\n${record.map(x => '- ' + x).join('\n')}\n\nReal-device font rendering on macOS and iOS is not verified by emulation.\n`);
  console.log(record.join('\n'));
})().catch(error => { console.error(error); server.close(); process.exit(1); });
