'use strict';
// Isolated renderer review. Run npm run test:desktop first to create the fixture.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const runRoot = process.env.PADDOCK_ACCOUNTS_OUT ? path.resolve(root, process.env.PADDOCK_ACCOUNTS_OUT) : path.join(root, '.build/codex-prompt-runs/2026-10-24/5/verification');
const shots = path.join(runRoot, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json'), 'utf8'));
const alpha = 'codex:fixture-alpha', beta = 'codex:fixture-beta';
const consoleId = '11111111-1111-4111-8111-111111111111';
const launchId = '22222222-2222-4222-8222-222222222222';

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  const file = pathname === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(root, 'dist', pathname === '/' ? 'index.html' : pathname);
  if ((pathname !== '/_axe.js' && !file.startsWith(path.join(root, 'dist') + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});

function fixtureState() {
  const state = structuredClone(base);
  state.mode = 'dashboard';
  state.settings.setupComplete = true;
  state.settings.sidebarCollapsed = false;
  state.sessions = [{
    id: consoleId, consoleKey: '33333333-3333-4333-8333-333333333333', projectId: null,
    slot: 1, width: 1, height: 1, name: 'Switch review', nameMode: 'custom', cwd: 'C:\\Paddock\\Fixture',
    provider: 'codex', accountId: alpha, accountLabel: 'Alpha', launchId,
    switchTargets: [{ id: beta, label: 'Backup subscription profile', ready: true }],
    draftSupported: true, state: 'ready', alive: true, permissions: 'default', launchModel: 'gpt-5.2-codex',
    switchOffer: { key: 'fixture-alpha-usage', targetAccountId: beta, targetLabel: 'Backup subscription profile', usedPercent: 92, minutes: 300, resetsAt: Date.now() + 3600000 },
    cols: 100, rows: 30, sequence: 0, buffer: '', providerSessionId: '44444444-4444-4444-8444-444444444444'
  }];
  state.accounts = [
    { id: alpha, provider: 'codex', label: 'Alpha', profile: true, loginCompletedAt: 1 },
    { id: beta, provider: 'codex', label: 'Backup subscription profile', profile: true, loginCompletedAt: 1 }
  ];
  state.limits = [
    { id: alpha, accountId: alpha, provider: 'codex', name: 'Alpha', observedAt: Date.now(), source: 'Synthetic fixture', windows: [{ minutes: 300, usedPercent: 92, resetsAt: Date.now() + 3600000 }, { minutes: 10080, usedPercent: 30, resetsAt: Date.now() + 86400000 }] },
    { id: beta, accountId: beta, provider: 'codex', name: 'Backup subscription profile', observedAt: Date.now(), source: 'Synthetic fixture', windows: [{ minutes: 300, usedPercent: 12, resetsAt: Date.now() + 3600000 }, { minutes: 10080, usedPercent: 25, resetsAt: Date.now() + 86400000 }] }
  ];
  state.ledger = [];
  state.summary = { requests: 0, tokens: 0, unknownUsage: false };
  return state;
}

const profiles = [
  ['windows-chromium', chromium, { viewport: { width: 1440, height: 950 } }],
  ['desktop-webkit-mac-emulation', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 950 } }],
  ['android-chromium-emulation', chromium, { ...devices['Pixel 7'] }],
  ['iphone-webkit-emulation', webkit, { ...devices['iPhone 13'] }]
];
const reports = [];
let browser;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch();
    const context = await browser.newContext(options), state = fixtureState(), errors = [], external = [];
    await context.addInitScript(initialState => {
      window.__fixtureData = initialState;
      const fixtureConsoleId = initialState.sessions[0].id;
      const fixtureLaunchId = initialState.sessions[0].launchId;
      const fixtureTargetId = initialState.accounts[1].id;
      window.__createCalls = 0;
      window.__loginCalls = 0;
      window.__renameCalls = 0;
      window.__setupCalls = 0;
      window.__sendFixtureSnapshot = () => window.fixtureState?.(structuredClone(window.__fixtureData));
      window.__fixtureCall = async (method, payload) => {
        const data = window.__fixtureData;
        if (method === 'state') return { ok: true, value: data };
        if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0, launchId: fixtureLaunchId } };
        if (method === 'session.switch') {
          if (payload.id !== fixtureConsoleId || payload.launchId !== data.sessions[0].launchId || payload.targetAccountId !== fixtureTargetId) return { ok: false, error: 'The console changed.' };
          Object.assign(data.sessions[0], { accountId: fixtureTargetId, accountLabel: 'Backup subscription profile', launchId: '55555555-5555-4555-8555-555555555555' });
          delete data.sessions[0].switchOffer;
          window.__sendFixtureSnapshot();
          return { ok: true, value: data.sessions[0] };
        }
        if (method === 'accounts.setup') {
          window.__setupCalls++;
          if (payload.id !== fixtureConsoleId || payload.launchId !== data.sessions[0].launchId || payload.targetAccountId !== fixtureTargetId) return { ok: false, error: 'The console changed.' };
          return { ok: true, value: { id: 'setup-fixture', cwd: data.sessions[0].cwd, accountId: fixtureTargetId } };
        }
        if (method === 'accounts.create') {
          window.__createCalls++;
          const profile = { id: 'codex:created-fixture', provider: payload.provider, label: payload.label, profile: true, loginCompletedAt: null };
          data.accounts.push(profile); window.__sendFixtureSnapshot();
          return { ok: true, value: profile };
        }
        if (method === 'accounts.login') {
          window.__loginCalls++;
          if (window.__loginCalls === 1) return { ok: false, error: 'No console slot is available. Close a console, then retry sign-in.' };
          data.accounts.find(item => item.id === payload.id).loginCompletedAt = Date.now();
          window.__sendFixtureSnapshot();
          return { ok: true, value: { id: payload.id } };
        }
        if (method === 'accounts.rename') {
          window.__renameCalls++;
          if (window.__renameCalls === 1) return { ok: false, error: 'The account name is already in use.' };
          const account = data.accounts.find(item => item.id === payload.id);
          account.label = payload.label;
          for (const session of data.sessions) {
            if (session.accountId === account.id) session.accountLabel = account.label;
            for (const target of session.switchTargets || []) if (target.id === account.id) target.label = account.label;
          }
          window.__sendFixtureSnapshot();
          return { ok: true, value: account };
        }
        if (method === 'settings') return { ok: true, value: data.settings };
        return { ok: true, value: [] };
      };
      window.dock = {
        call: (method, payload) => window.__fixtureCall(method, payload),
        onState: callback => { window.fixtureState = callback; },
        onOutput: () => {}, onSelect: () => {}
      };
    }, state);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:') && !request.url().startsWith('data:')) external.push(request.url()); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const toggle = page.locator('.console-account-toggle').first(); await toggle.waitFor();
    const controlledId = await toggle.getAttribute('aria-controls');
    assert.equal(await page.locator(`#${controlledId}`).count(), 1, `${name}: unique menu target`);
    await toggle.click();
    const menu = page.locator(`#${controlledId}`);
    await menu.waitFor({ state: 'visible' });
    assert.equal(await menu.locator(':popover-open').count(), 0); // The menu itself is the popover element.
    assert.equal(await menu.evaluate(node => node.matches(':popover-open')), true, `${name}: account menu opens`);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-target-account-id')), beta, `${name}: menu receives focus`);
    assert.match(await page.locator('.account-switch-offer').innerText(), /92%/);
    const menuNode = await menu.elementHandle();
    await page.evaluate(() => window.__sendFixtureSnapshot());
    await page.waitForTimeout(40);
    assert.equal(await menu.evaluate(node => node.matches(':popover-open')), true, `${name}: unchanged broadcast keeps menu open`);
    assert.equal(await menuNode.evaluate(node => node.isConnected && node.matches(':popover-open')), true, `${name}: unchanged broadcast keeps the same menu node`);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-target-account-id')), beta, `${name}: broadcast keeps menu focus`);
    assert.equal(await menu.evaluate(node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1; }), true, `${name}: menu stays inside the emulated viewport`);
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), 'account-setup', `${name}: ArrowDown reaches setup`);
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.action), 'account-switch', `${name}: ArrowUp returns to switch`);
    await page.keyboard.press('Escape');
    assert.equal(await menu.evaluate(node => node.matches(':popover-open')), false, `${name}: Escape closes the account menu`);
    assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-account-menu-toggle]')), true, `${name}: Escape returns focus to the account control`);
    await toggle.click(); await menu.waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(shots, `${name}-account-menu.png`) });
    await menu.getByRole('menuitem', { name: 'Set up Backup subscription profile' }).click({ delay: 1100 });
    assert.equal(await page.evaluate(() => window.__setupCalls), 1, `${name}: first-use setup stays pinned to the original console`);
    await toggle.click(); await menu.waitFor({ state: 'visible' });
    await menu.getByRole('menuitem', { name: 'Switch to Backup subscription profile' }).click();
    await page.getByTitle('Account: Backup subscription profile').waitFor();
    assert.equal(await page.evaluate(() => window.__fixtureData.sessions[0].accountId), beta, `${name}: selected account updates in place`);
    const header = page.locator('.console-panel-header').first();
    const bounds = await header.evaluate(node => {
      const rect = selector => { const item = node.querySelector(selector).getBoundingClientRect(); return { left: item.left, right: item.right }; };
      const panel = node.getBoundingClientRect();
      return { panel: { left: panel.left, right: panel.right }, account: rect('.console-account-toggle'), expand: rect('[aria-label^="Expand console"]'), end: rect('[data-action="end-session"]') };
    });
    for (const control of [bounds.account, bounds.expand, bounds.end]) {
      assert.equal(control.left >= bounds.panel.left && control.right <= bounds.panel.right, true, `${name}: account, expand and end controls fit the switched console header`);
    }
    assert.equal(bounds.expand.right <= bounds.end.left, true, `${name}: expand and end controls remain separate`);
    await page.screenshot({ path: path.join(shots, `${name}-account-header.png`) });

    await page.locator('[data-page="usage"]').evaluate(node => node.click());
    await page.locator('#account-profile-form').waitFor();
    const betaRow = page.locator('.account-profile-row').filter({ hasText: 'Backup subscription profile' });
    await betaRow.getByRole('button', { name: 'Rename' }).click();
    const renameForm = page.locator('#account-rename-form'), renameDialog = page.locator('#account-rename-dialog');
    await renameDialog.waitFor({ state: 'visible' });
    await renameForm.locator('[name="label"]').fill('Backup renamed profile');
    await renameForm.evaluate(form => form.requestSubmit());
    await page.getByRole('alert').filter({ hasText: 'already in use' }).waitFor();
    assert.equal(await renameForm.locator('[name="label"]').inputValue(), 'Backup renamed profile', `${name}: rename failure keeps its value`);
    await renameForm.locator('[name="label"]').fill('Backup profile renamed');
    await renameForm.evaluate(form => form.requestSubmit());
    await renameDialog.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.account-profile-row').filter({ hasText: 'Backup profile renamed' }).count(), 1);

    const label = page.locator('#account-profile-form [name="label"]');
    const longLabel = 'Personal Claude subscription profile with Unicode café 🧪';
    await page.locator('#account-profile-form [name="provider"]').selectOption('claude');
    await label.fill(longLabel);
    await label.evaluate(node => node.setSelectionRange(7, 15));
    assert.equal(await label.evaluate(node => document.activeElement === node), true, `${name}: account form receives focus before broadcast`);
    await page.evaluate(() => window.__sendFixtureSnapshot());
    await page.waitForTimeout(30);
    assert.equal(await label.inputValue(), longLabel, `${name}: account form survives state update`);
    assert.equal(await page.locator('#account-profile-form [name="provider"]').inputValue(), 'claude');
    assert.equal(await label.evaluate(node => document.activeElement === node), true, `${name}: account form keeps focus`);
    assert.deepEqual(await label.evaluate(node => [node.selectionStart, node.selectionEnd]), [7, 15], `${name}: account form keeps selection`);
    await label.evaluate(node => node.form.requestSubmit());
    await page.getByRole('button', { name: 'Retry sign-in' }).waitFor();
    assert.equal(await page.evaluate(() => window.__createCalls), 1, `${name}: profile created once after login-start failure`);
    assert.equal(await page.locator('.account-profile-row').filter({ hasText: longLabel }).count(), 1);
    await page.getByRole('button', { name: 'Retry sign-in' }).click();
    await page.getByRole('button', { name: 'Add account' }).waitFor();
    assert.equal(await label.inputValue(), '', `${name}: successful retry clears the completed account label`);
    assert.equal(await page.locator('#account-profile-form [name="provider"]').inputValue(), 'codex', `${name}: successful retry resets the provider`);
    assert.equal(await page.evaluate(() => window.__createCalls), 1, `${name}: retry reuses the created profile`);
    assert.equal(await page.evaluate(() => window.__loginCalls), 2, `${name}: retry starts the same profile login`);
    assert.equal(await page.evaluate(() => window.__renameCalls), 2, `${name}: rename failure and retry use the in-app dialog`);
    assert.equal(await page.locator('.account-profile-row').filter({ hasText: longLabel }).count(), 1);
    await page.screenshot({ path: path.join(shots, `${name}-usage-accounts.png`) });
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.addScriptTag({ url: '/_axe.js' });
    const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['button-name', 'aria-allowed-attr', 'aria-required-children', 'aria-required-parent'] })).violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })));
    assert.deepEqual(violations, [], `${name}: selected account controls accessibility`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`);
    assert.deepEqual(errors, [], `${name}: no renderer errors`);
    assert.deepEqual(external, [], `${name}: no external requests`);
    reports.push({ profile: name, emulated: name !== 'windows-chromium', checks: ['account popover open through unchanged state update', 'focus and target click', 'Arrow, Escape and focus return', 'account setup pinned to the original console', 'selected account header refresh and bounds', 'long account form retained through broadcast', 'retry login without duplicate profile and clear the successful form', 'selected ARIA checks', 'viewport overflow', 'no external requests'], screenshots: [`screenshots/${name}-account-menu.png`, `screenshots/${name}-account-header.png`, `screenshots/${name}-usage-accounts.png`] });
    await context.close(); await browser.close(); browser = null;
  }
  fs.writeFileSync(path.join(runRoot, 'account-switching-visual-report.json'), JSON.stringify(reports, null, 2));
  console.log(`PASS: account switching renderer review on ${reports.map(item => item.profile).join(', ')}.`);
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
