'use strict';
const { installStateTransport } = require('./state-test-transport.cjs');
// Current renderer with fixed sample data. No live sessions or provider calls.
const { chromium, webkit, devices } = require(process.env.REVIEW_PLAYWRIGHT || 'playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { openPage } = require('./ui-navigation.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.join(root, 'artifacts/workspace-review', process.env.REVIEW_STAGE || 'before');
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/projects/fixture.json'), 'utf8'));
const profiles = [
  ['windows-chromium', chromium, { viewport: { width: 1440, height: 1000 } }],
  ['mac-webkit', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }],
  ['android-chromium', chromium, devices['Pixel 7']],
  ['iphone-webkit', webkit, devices['iPhone 13']],
];
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
let browser;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const report = [];
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options);
    const state = structuredClone(base), errors = [], calls = [];
    state.mode = 'dashboard'; state.settings.setupComplete = true;
    state.settings.sidebarCollapsed = true;
    const now = Date.now(), account = { accountId: 'codex:default', provider: 'codex', label: 'Codex', model: '' };
    state.settings.trimStyle = 'blue'; state.settings.usageHidden = []; state.settings.usageShown = [];
    state.settings.routing ||= { small: [], medium: [], large: [], defaultReviewer: null, claudeReviewsOnly: false, excludedModels: [] };
    state.usageAccounts = [
      { id: 'codex:default', provider: 'codex', label: 'Default Codex', hasUsage: true },
      { id: 'codex:backup', provider: 'codex', label: 'Work account', inUse: true },
      { id: 'claude:default', provider: 'claude', label: 'Personal', hasUsage: true },
      { id: 'kiro:default', provider: 'kiro', label: 'Kiro', hasUsage: true },
    ];
    state.limits = [
      { provider: 'codex', accountId: 'codex:default', observedAt: now, source: 'Fixture data', windows: [{ minutes: 300, usedPercent: 22, resetsAt: now + 12600000 }, { minutes: 10080, usedPercent: 14, resetsAt: now + 248400000 }] },
      { provider: 'claude', accountId: 'claude:default', observedAt: now - 600000, source: 'Fixture data', windows: [{ minutes: 300, usedPercent: 38, resetsAt: now - 60000 }, { minutes: 10080, usedPercent: null }] },
      { provider: 'kiro', accountId: 'kiro:default', observedAt: now, source: 'Fixture data', windows: [{ label: 'Monthly credits', usedPercent: 44.9, used: 22.45, total: 50, resetsAt: now + 86400000 }] },
    ];
    state.usageChecks = [{ accountId: 'codex:default', status: 'current' }, { accountId: 'codex:backup', status: 'unavailable', message: 'Usage could not be checked.' }];
    state.ledger = Array.from({ length: 86 }, (_, i) => ({ id: 'usage-' + i, at: now - i % 27 * 86400000 - i * 60000, provider: ['codex', 'claude', 'kiro'][i % 3], model: 'Fixture model', status: i % 13 ? 'completed' : 'failed', durationMs: 750 + i * 19, usage: i % 11 ? { input: 1200 + i, output: 450, total: 1650 + i } : null }));
    if (process.env.REVIEW_STAGE === 'glass') {
      const sample = state.projects[0];
      state.projects = [
        { name: 'Paddock', status: 'planning', category: 'Desktop', goals: 'Run agent consoles, review task outcomes and keep project files together.', folder: root },
        { name: 'Website study', status: 'active', category: 'Research', goals: 'Review real websites and document their navigation, layouts and first-click paths.', folder: root + '/study' },
        { name: 'Robonslaught', status: 'paused', category: 'Game', goals: 'A playable arena prototype with short sessions and persistent upgrades.', folder: root + '/game' },
        { name: 'Portfolio', status: 'complete', category: 'Web', goals: 'A personal site with selected projects, case studies and contact details.', folder: root + '/portfolio' }
      ].map((p, i) => ({ ...sample, ...p, id: 'glass-project-' + i, plan: null, decisions: [], nextStep: 'Review the next milestone.', updatedAt: now - (i + 1) * 86400000, lastActiveAt: now - i * 86400000, folders: [{ path: p.folder, label: 'Project' }], milestones: ['Define the scope', 'Build the first version', 'Review the result', 'Verify the release'].map((text, n) => ({ text, acceptance: 'Reviewed evidence is recorded.', done: n <= i })) }));
    }
    state.tasks = [{ id: 'workspace-review-task', title: 'Check website changes', repo: root, workFolder: root,
      criteria: 'Check the changed pages and report any remaining problems.', checks: 'npm test', workflow: 'current',
      implementer: account, reviewer: { ...account, accountId: 'claude:default', provider: 'claude', label: 'Claude' },
      why: { implementer: 'Selected for this task.', reviewer: 'Independent review.' },
      maxRounds: 3, timeLimitMinutes: 30, startedAt: now - 3600000, finishedAt: now - 3200000, state: 'needs-you',
      rounds: [{ number: 1, elapsedMs: 150000, implement: { ...account, state: 'done', summary: 'Updated the affected pages.', elapsedMs: 90000 },
        check: { state: 'stale', outcome: 'passed', elapsedMs: 30000, output: 'Checks passed before later file changes.' },
        review: { state: 'stale', verdict: 'approve', elapsedMs: 30000, findings: [] } }],
      unresolved: ['Files changed after verification. Run checks again.'], error: '', log: [], finalDiff: '', diffStat: '', resultId: null }];
    if (process.env.REVIEW_STAGE === 'glass') state.tasks.push({ ...structuredClone(state.tasks[0]), id: 'history-task', title: 'Research report', state: 'stopped', unresolved: [], error: '', criteria: 'Review reference websites.' });
    state.workbench = { ...state.workbench, results: [
      { id: '00000000-0000-4000-8000-000000000031', title: 'Website reference study', ext: '.md', kind: 'report', status: 'passed', at: now - 86400000, size: 4000, project: root, consoleKey: 'research', consoleName: 'Website research', groupId: 'research-turn', summary: 'Reviewed reference sites and first-click paths.' },
      { id: '00000000-0000-4000-8000-000000000032', title: 'Website verification', ext: '.md', kind: 'test', status: 'needs-review', at: now - 3600000, size: 2000, project: root, consoleKey: 'website', consoleName: 'Website', groupId: 'website-turn', summary: 'Files changed after checks.' },
    ] };
    let reportText = 'Original report';
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      calls.push(method);
      if (method === 'state') return { ok: true, value: state };
      if (method === 'settings') { Object.assign(state.settings, payload); return { ok: true, state }; }
      if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0 } };
      if (method === 'tasks.list') return { ok: true, value: state.tasks };
      if (method === 'workbench.results.preview') return { ok: true, value: { text: reportText } };
      if (method === 'fixture.update-report') {
        reportText = 'Updated report!';
        state.workbench.results[0].contentRevision = 1;
        state.workbench.results[0].updatedAt = Date.now();
        return { ok: true, state };
      }
      if (method === 'fixture.activity') {
        state.tasks[0].state = 'checking'; state.tasks[0].unresolved = [];
        state.workbench.results[1].title = 'Updated verification'; state.workbench.results[1].updatedAt = Date.now();
        return { ok: true, state };
      }
      if (method === 'tasks.candidates') return { ok: true, value: { implementers: [account], reviewers: [], repos: [] } };
      if (method === 'explorer.list') return { ok: true, value: { entries: [] } };
      if (/session\.(input|create|end|kill)|write|delete|remove/.test(method)) throw new Error('Unexpected mutation: ' + method);
      return { ok: true, value: [] };
    });
    await installStateTransport(context);
await context.addInitScript(() => { window.dock = {
      call: async (m, p) => { const r = await window.fixtureCall(m, p); if (r.state) window.fixtureState?.(r.state); return r; },
      get state() { return window.fixtureStateTransport; }, onOutput: () => {}, onSelect: () => {}, onNotice: () => {},
    }; });
    const page = await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.locator('.session-card').first().waitFor();
    const captures = [];
    for (const view of ['tasks', 'results', 'projects', 'usage', 'consoles', 'console-settings', 'agent-settings']) {
      await openPage(page, view);
      if (view === 'console-settings') await page.locator('#console-defaults-form').scrollIntoViewIfNeeded();
      if (view === 'tasks') await page.locator('#task-detail-title').waitFor();
      if (view === 'results' && await page.locator('[data-wb="project-folder"]').count()) await page.locator('[data-wb="project-folder"]').first().click();
      if (view === 'projects' && process.env.REVIEW_STAGE === 'glass') await page.locator('[data-project-status]').selectOption('');
      await page.mouse.move(options.viewport?.width ? options.viewport.width - 5 : 300, 100);
      await page.evaluate(async () => { document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()); await document.fonts.ready; });
      const file = `${name}-${view}.png`; await page.screenshot({ path: path.join(out, file) });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      captures.push({ view, file, overflow });
      assert.equal(overflow, false, name + '/' + view);
      if (view === 'usage') {
        await page.locator('.usage-analytics').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(out, `${name}-usage-analytics.png`) });
      }
    }
    if (['after', 'glass'].includes(process.env.REVIEW_STAGE)) {
      assert.equal(await page.locator('#explorer-pane, #explorer-toggle, #explorer-backdrop, #launch-folder, #results-shortcut, [data-code-action=create], [data-web-action=create]').count(), 0);
      assert.ok(!calls.includes('explorer.list'));
      if (process.env.REVIEW_STAGE === 'glass') {
        await openPage(page, 'usage');
        assert.equal(await page.locator('#routing-form, .delegation-settings, #account-profile-form').count(), 0, 'Agent configuration belongs in Settings');
        assert.equal(await page.locator('.quota-card').count(), 3);
        await page.locator('[data-usage-account=codex]').selectOption('codex:backup');
        await page.locator('[data-usage-provider=codex] .quota-ring').getByText('Unknown', { exact: true }).waitFor();
        assert.equal(await page.locator('[data-usage-provider=codex] [role=progressbar]').count(), 0, 'Unknown quota has no percentage');
        await page.locator('[data-usage-account=codex]').selectOption('codex:default');
        await page.locator('[data-usage-metric=tokens]').click();
        await page.locator('[data-usage-period]').selectOption('7');
        assert.equal(await page.locator('[data-usage-metric=tokens]').getAttribute('aria-pressed'), 'true');
        await page.locator('[data-usage-period]').selectOption('30');
        const blue = await page.locator('.quota-card').first().evaluate(node => getComputedStyle(node).backgroundImage);
        await page.evaluate(() => window.dock.call('settings', { trimStyle: 'fiery' }));
        assert.notEqual(await page.locator('.quota-card').first().evaluate(node => getComputedStyle(node).backgroundImage), blue, 'Glass follows the selected theme');
        await page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()));
        await page.screenshot({ path: path.join(out, `${name}-usage-inferno.png`) });
        await openPage(page, 'projects');
        await page.locator('[data-project-id=glass-project-0]').waitFor();
        await page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()));
        await page.screenshot({ path: path.join(out, `${name}-projects-inferno.png`) });
        await page.evaluate(() => window.dock.call('settings', { trimStyle: 'blue' }));
        await openPage(page, 'agent-settings');
        await page.locator('#routing-form [name=small]').fill('Draft routing');
        await page.evaluate(() => window.dock.call('settings', { delegationEnabled: true }));
        assert.equal(await page.locator('#routing-form [name=small]').inputValue(), 'Draft routing', 'State updates preserve routing drafts');
        await page.locator('[data-setting=delegationEnabled]').waitFor();
        const dock = await page.locator('#sidebar').boundingBox();
        assert.ok(dock.width < 370 && dock.height < 65 && dock.y > (options.viewport?.height || devices[name === 'iphone-webkit' ? 'iPhone 13' : 'Pixel 7'].viewport.height) - 90, 'Navigation is a compact bottom-left strip');
        await openPage(page, 'tasks');
        await page.locator('[data-task-action=filter][data-id=history]').click();
        assert.equal(await page.locator('.task-list [data-id=history-task]').count(), 1);
        assert.equal(await page.locator('.task-list [data-id=workspace-review-task]').count(), 0);
        await page.locator('[data-task-action=filter][data-id=active]').click();
        assert.equal(await page.locator('.task-list [data-id=history-task]').count(), 0);
        await openPage(page, 'projects');
        const card = page.locator('[data-project-id=glass-project-0]');
        const notes = await card.locator('.project-notes-date').innerText();
        await card.locator('.project-more>summary').click();
        await card.locator('.project-more>summary').focus();
        await page.evaluate(() => window.dock.call('fixture.activity'));
        await card.getByText('1 running', { exact: true }).waitFor();
        await card.getByRole('button', { name: 'Updated verification', exact: true }).waitFor();
        assert.equal(await card.locator('.project-notes-date').innerText(), notes);
        assert.equal(await card.locator('.project-more').getAttribute('open'), '');
        assert.equal(await card.locator('.project-more>summary').evaluate(node => node === document.activeElement), true, 'Live updates preserve keyboard focus');
      }
      await openPage(page, 'results');
      if (await page.locator('[data-wb=project-folder]').count()) await page.locator('[data-wb=project-folder]').first().click();
      await page.locator('[data-wb=preview][data-id="00000000-0000-4000-8000-000000000031"]').first().click();
      await page.getByText('Original report', { exact: true }).waitFor();
      await page.evaluate(() => window.dock.call('fixture.update-report'));
      await page.getByText('Updated report!', { exact: true }).waitFor();
    }
    assert.deepEqual(errors, []);
    report.push({ profile: name, emulated: true, engine: browser.version(), fixture: true, captures, errors });
    await browser.close(); browser = null;
    console.log('PASS ' + name);
  }
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
