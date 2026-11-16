'use strict';
// Headless renderer fixtures only. No Electron launch or provider request.
const { chromium, webkit, devices } = require('playwright');
const { installStateTransport } = require('./state-test-transport.cjs');
const { openPage } = require('./ui-navigation.cjs');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { migrateRouting, defaults } = require('../electron/task-routing.cjs');
const parallel = process.argv.includes('--parallel');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/auto-delegation', parallel ? 'parallel-screens' : process.argv.includes('--legacy') ? 'parallel-legacy-screens' : 'screens');
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0], file = path.join(dist, url === '/' ? 'index.html' : url);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
const worker = { accountId: 'codex:default', model: 'small-code', provider: 'codex', label: 'Codex' };
function jobFixture() {
  const job = { id: 'owner-message-fixture', kind: 'owner-message', title: 'Fix import and explain file storage', criteria: 'Fix the PDF import error. Explain where files are stored. Review a new import layout.', repo: 'C:\\fixture', workFolder: 'C:\\fixture', state: 'plan-ready', workflow: 'current', startedAt: Date.now(), rounds: [], log: [], unresolved: [], maxRounds: 1, implementer: worker, reviewer: null, dispatchTasks: [],
    plan: { contracts: 'Keep imported files and keyboard focus.', conflicts: [], subtasks: [
      { id: 'import', title: 'Investigate the PDF import error', criteria: 'Reproduce the failed import and repair the confirmed cause.', kind: 'bug', size: 'small', owns: ['src/import.js'], dependsOn: [], images: ['C:\\screens\\import.png'], implementer: worker, reviewer: null, warnings: [], assignmentReason: 'Included account. 48% allowance left.' },
      { id: 'storage', title: 'Where are files stored?', criteria: 'Explain file storage.', kind: 'question', size: 'small', owns: [], dependsOn: [], images: [], answer: 'Imported files remain in the selected project folder.' },
      { id: 'layout', title: 'Review the import layout', criteria: 'Create concepts for owner selection before building.', kind: 'design', phase: 'concepts-required', size: 'medium', owns: ['src/import.js'], dependsOn: ['import'], images: [], implementer: worker, reviewer: null, warnings: [] }
    ] } };
  if (parallel) {
    job.executionMode = 'parallel'; job.parallelLimit = 6;
    job.title = 'Update listening, profiles and savings'; job.criteria = 'Investigate Android startup, restore offline listening, preserve refresh data and update savings, profiles and wording.';
    job.integration = { implementer: { ...worker, model: 'integration-code' }, reviewer: null, warnings: [] };
    job.plan.subtasks = [
      ['startup', 'Investigate Android startup'], ['offline', 'Sync offline listening'], ['refresh', 'Preserve data during refresh'],
      ['savings', 'Update savings totals'], ['profiles', 'Add Spotify status to profiles'], ['wording', 'Remove unwanted dashboard text']
    ].map(([id, title]) => ({ id, title, criteria: 'Verify the requested behavior and preserve existing user data.', kind: id === 'startup' ? 'bug' : 'build', size: 'small', owns: [`src/${id}.js`], dependsOn: [], images: id === 'startup' ? ['C:\\screens\\import.png'] : [], implementer: worker, reviewer: null, warnings: [] }));
    job.plan.subtasks.push({ id: 'storage', title: 'Where are files stored?', criteria: 'Explain file storage.', kind: 'question', size: 'small', owns: [], dependsOn: [], images: [], answer: 'Imported files remain in the selected project folder.' });
  }
  return job;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const results = [];
  try { for (const [name, engine, options] of profiles) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ ...options, reducedMotion: 'reduce' }), state = structuredClone(base), calls = [], errors = [];
      state.mode = 'dashboard'; state.platform = ['mac', 'iphone'].includes(name) ? 'darwin' : 'win32';
      Object.assign(state.settings, { setupComplete: true, sidebarCollapsed: false, routing: migrateRouting(defaults), dispatcher: null, launchEffect: false });
      state.tasks = []; state.ledger = []; state.delegations = []; state.usageChecks = [];
      state.usageAccounts = [{ id: 'codex:default', provider: 'codex', label: 'Codex', models: [{ id: 'small-code', available: true }] }];
      let releasePlan, planRequestedResolve, releaseApproval, approvalRequestedResolve;
      const planRequested = new Promise(resolve => { planRequestedResolve = resolve; });
      const approvalRequested = new Promise(resolve => { approvalRequestedResolve = resolve; });
      await context.exposeFunction('fixtureCall', async (method, payload) => {
        calls.push({ method, payload });
        let value = [];
        if (method === 'state') value = state;
        if (method === 'session.buffer') value = { data: '', sequence: 0 };
        if (method === 'tasks.candidates') value = { repos: [{ path: 'C:\\fixture', label: 'Fixture project' }], implementers: [worker], reviewers: [] };
        if (method === 'tasks.planMessage') { await new Promise(resolve => { releasePlan = resolve; planRequestedResolve(); }); value = jobFixture(); state.tasks = [value]; }
        if (method === 'tasks.approveMessage') {
          await new Promise(resolve => { releaseApproval = resolve; approvalRequestedResolve(); });
          state.tasks[0].state = 'building'; state.tasks[0].approvedAt = Date.now();
          if (parallel) { state.tasks[0].parallelLimit = payload.parallelLimit; state.tasks[0].dispatchTasks = [{ itemId: 'lanes', taskId: 'integration-fixture' }]; }
          value = state.tasks[0];
        }
        if (method === 'tasks.stop') { state.tasks[0].state = 'stopped'; value = state.tasks[0]; }
        if (method === 'settings') { Object.assign(state.settings, payload); value = state.settings; }
        return { ok: true, value };
      });
      await installStateTransport(context);
      await context.addInitScript(() => { window.dock = { call: (method, payload) => window.fixtureCall(method, payload), get state() { return window.fixtureStateTransport; }, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`); await openPage(page, 'tasks');
      const summary = page.locator('[data-message-composer] > summary'); await summary.focus(); await page.keyboard.press('Space');
      assert.equal(await page.locator('[data-message-composer]').getAttribute('open'), '');
      await page.keyboard.press('Tab'); assert.equal(await page.locator('#message-plan-repo').evaluate(node => node === document.activeElement), true);
      await page.locator('#message-plan-repo').selectOption('C:\\fixture');
      await page.locator('#message-plan-text').fill('Fix the PDF import error and explain file storage.');
      await page.locator('#message-plan-images').fill('C:\\screens\\import.png');
      await page.locator('#message-plan-checks').fill('npm test');
      await page.locator('#message-plan-text').focus(); await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('#message-plan-repo').evaluate(node => node === document.activeElement), true);
      await page.locator('#message-plan-form').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, `${name}-composer.png`), animations: 'disabled' });
      await page.locator('#message-plan-form button[type=submit]').focus(); await page.keyboard.press('Enter');
      await planRequested;
      assert.equal(await page.locator('#message-plan-submit').evaluate(node => node === document.activeElement), true);
      assert.equal(await page.locator('#message-plan-submit').getAttribute('aria-disabled'), 'true');
      await page.keyboard.press('Enter'); assert.equal(calls.filter(call => call.method === 'tasks.planMessage').length, 1); releasePlan();
      await page.locator('[data-task-action=approveMessage]').waitFor();
      assert.equal(await page.locator('#task-detail-title').evaluate(node => node === document.activeElement), true);
      assert.equal(calls.filter(call => call.method === 'tasks.approveMessage').length, 0);
      assert.deepEqual(calls.find(call => call.method === 'tasks.planMessage').payload.images, ['C:\\screens\\import.png']);
      assert.match(await page.locator('#task-content').innerText(), /Imported files remain/);
      if (parallel) {
        assert.match(await page.locator('#task-content').innerText(), /6 work lanes/);
        assert.equal(await page.locator('#task-content .task-subtasks > li').count(), 7);
        assert.match(await page.locator('#task-content').innerText(), /Integration worker: codex:default \/ integration-code/);
        assert.match(await page.locator('#task-content').innerText(), /Commit or stash local changes/);
        assert.equal(await page.locator('#message-parallel-limit').inputValue(), '6');
        await page.locator('#message-parallel-limit').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        assert.equal(await page.locator('#message-parallel-limit').evaluate(node => node === document.activeElement), true);
        await page.locator('#message-parallel-limit').fill('11');
        await page.locator('[data-task-action=approveMessage]').focus(); await page.keyboard.press('Space');
        await page.waitForFunction(() => document.activeElement?.id === 'message-parallel-limit');
        assert.equal(calls.filter(call => call.method === 'tasks.approveMessage').length, 0);
        await page.screenshot({ path: path.join(out, `${name}-invalid-limit.png`), animations: 'disabled' });
        await page.locator('#message-parallel-limit').fill('5');
        state.tasks[0].plan.contracts += ' Preserve playback.';
        await page.evaluate(value => window.fixtureStateTransport.publish(value), state);
        await page.waitForFunction(() => document.querySelector('#task-content')?.textContent.includes('Preserve playback.'));
        assert.equal(await page.locator('#message-parallel-limit').inputValue(), '5');
        assert.equal(await page.locator('#message-parallel-limit').evaluate(node => node === document.activeElement), true);
        await page.waitForFunction(() => !document.querySelector('#toast')?.classList.contains('visible'));
      } else assert.match(await page.locator('#task-content').innerText(), /Concept selection required/);
      assert.equal(await page.locator('[data-message-composer]').getAttribute('open'), null);
      await page.locator('#task-detail-title').scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(out, `${name}-plan.png`), animations: 'disabled' });
      await page.locator('[data-task-action=approveMessage]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `${name}-approval.png`), animations: 'disabled' });
      await page.locator('[data-task-action=approveMessage]').focus(); await page.keyboard.press('Space');
      await approvalRequested;
      assert.equal(await page.locator('[data-task-action=approveMessage]').evaluate(node => node === document.activeElement), true);
      assert.equal(await page.locator('[data-task-action=approveMessage]').getAttribute('aria-disabled'), 'true');
      if (parallel) {
        state.tasks[0].plan.contracts += ' Preserve saved results.';
        await page.evaluate(value => window.fixtureStateTransport.publish(value), state);
        await page.waitForFunction(() => document.querySelector('#task-content')?.textContent.includes('Preserve saved results.'));
        assert.equal(await page.locator('[data-task-action=approveMessage]').evaluate(node => node === document.activeElement), true);
        assert.equal(await page.locator('[data-task-action=approveMessage]').getAttribute('aria-disabled'), 'true');
      }
      await page.keyboard.press('Space'); assert.equal(calls.filter(call => call.method === 'tasks.approveMessage').length, 1); releaseApproval();
      await page.waitForFunction(() => !document.querySelector('[data-task-action=approveMessage]'));
      assert.equal(calls.filter(call => call.method === 'tasks.approveMessage').length, 1);
      assert.equal(calls.filter(call => call.method === 'tasks.approvePlan').length, 0);
      if (parallel) {
        assert.equal(calls.find(call => call.method === 'tasks.approveMessage').payload.parallelLimit, 5);
        assert.equal(await page.getByRole('button', { name: 'Open lanes and integration', exact: true }).count(), 1);
        assert.equal(await page.getByRole('button', { name: 'Open task', exact: true }).count(), 0);
        await page.getByRole('button', { name: 'Open lanes and integration', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(out, `${name}-running.png`), animations: 'disabled' });
        const design = jobFixture(); design.id = 'design-message'; design.plan.subtasks[0].kind = 'design'; design.plan.subtasks[0].phase = 'concepts-required';
        state.tasks = [design]; await page.evaluate(value => window.fixtureStateTransport.publish(value), state);
        await page.waitForFunction(() => document.querySelector('#task-content')?.textContent.includes('Select concepts before starting parallel lanes.'));
        await page.getByText('Concept selection required. Start the design review from a console. Select concepts before starting parallel lanes.', { exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(out, `${name}-concepts.png`), animations: 'disabled' });
      }
      assert.equal(await page.evaluate(() => document.activeElement === document.body), false);
      await page.locator('#message-plan-form button[type=submit]').evaluate(node => { if (node.disabled) throw Error('Composer remains disabled after creating a plan'); });
      await openPage(page, 'agent-settings');
      await page.locator('[name=dispatcher]').waitFor(); assert.equal(await page.locator('[name=dispatcher]').inputValue(), '');
      await page.locator('[name=dispatcher]').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('[name=dispatcher]').evaluate(node => node === document.activeElement), true);
      await page.locator('#routing-form button[type=submit]').click();
      assert.equal(calls.find(call => call.method === 'settings').payload.dispatcher, null);
      await page.locator('[name=dispatcher]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, `${name}-settings.png`), animations: 'disabled' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('#content').scrollWidth > document.querySelector('#content').clientWidth + 1), false, `${name}: overflow`);
      assert.deepEqual(errors, []); results.push({ profile: name, emulated: true, engine: engine.name(), checks: parallel ? 'six executable routes plus question, integration route, clean-repo consequence, lane limit default and payload, concept gate label, one approval, no second plan approval, execution link, pending focus, Tab/Shift+Tab/Enter/Space, settings, overflow' : 'message paths, question answer, concepts gate label, approval once, Tab/Shift+Tab/Enter/Space, focus, dispatcher default save, overflow' });
    } finally { await browser.close(); }
  } } finally { server.close(); }
  fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; });
