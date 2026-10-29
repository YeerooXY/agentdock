'use strict';
const { _electron: electron } = require('playwright');
const { openPage } = require('./ui-navigation.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data');
fs.mkdirSync(parent, { recursive: true });
const work = fs.mkdtempSync(path.join(parent, 'task-loop-desktop-')), profile = path.join(work, 'profile'), project = path.join(work, 'repo');
fs.mkdirSync(profile); fs.mkdirSync(project); fs.mkdirSync(path.join(profile, 'tasks'));
const git = (...args) => execFileSync('git', args, { cwd: project, encoding: 'utf8', stdio: 'pipe', windowsHide: true });
git('init', '-q'); git('config', 'user.name', 'Task UI tests'); git('config', 'user.email', 'test@example.com');
fs.writeFileSync(path.join(project, 'app.js'), 'const value = 2;\n'); git('add', '.'); git('commit', '-qm', 'fixture');
const revision = git('rev-parse', 'HEAD').trim(), now = Date.now(), id = '00000000-0000-4000-8000-000000000005';
const account = { accountId: 'codex:default', provider: 'codex', label: 'Codex', model: 'fixture-model' };
const job = { id, repo: project, workFolder: project, repoKey: project, title: 'Fixture task', criteria: 'Return 2.', checks: 'fixture-checks', workflow: 'current', branch: null, sourceRevision: revision, baseline: revision, baselineUntracked: [], baselineUntrackedState: {},
  implementer: account, reviewer: null, why: { implementer: 'Selected by you.', reviewer: 'No review selected.' }, maxRounds: 3, timeLimitMinutes: 30, startedAt: now, finishedAt: now, state: 'needs-you',
  rounds: [{ number: 1, startedAt: now, elapsedMs: 1200, implement: { ...account, startedAt: now, elapsedMs: 600, state: 'done', usage: null, summary: 'Updated app.js.' }, check: { state: 'failed', outcome: 'failed', elapsedMs: 600, exitCode: 1, output: 'Expected 2.', startedAt: now }, review: { state: 'not-set', elapsedMs: 0, findings: [] } }],
  unresolved: ['Checks failed (exit 1).'], log: [], error: '', fingerprint: null, diffStat: 'app.js | 1 +', finalDiff: '+const value = 2;', resultId: null };
fs.writeFileSync(path.join(profile, 'tasks', id + '.json'), JSON.stringify(job));
const splitId = '00000000-0000-4000-8000-000000000006', buildingId = '00000000-0000-4000-8000-000000000007';
const plan = { contracts: 'Use milliseconds. Label the page Classes.', subtasks: [
  { id: 'first', title: 'First module', criteria: 'Create first.js.', owns: ['src/first/**'], dependsOn: [], size: 'small' },
  { id: 'second', title: 'Second module', criteria: 'Create second.js.', owns: ['src/second/**'], dependsOn: ['first'], size: 'medium' }
] };
function splitFixture(taskId, state) {
  return { ...structuredClone(job), id: taskId, title: state === 'plan-ready' ? 'Split fixture' : 'Building fixture', startedAt: now - (state === 'plan-ready' ? 1000 : 2000), state, split: true, workflow: 'worktree', planner: account, plan, parallelLimit: 2,
    rounds: [], unresolved: [], planRounds: [], planReview: { state: 'not-set', findings: [] }, approvedAt: state === 'building' ? now : null,
    subtasks: plan.subtasks.map(sub => ({ ...sub, id: `${taskId}-${sub.id}`, subtaskId: sub.id, parentId: taskId, state: state === 'building' && sub.id === 'first' ? 'implementing' : 'queued',
      implementer: account, assignmentReason: 'Small task. Codex: first available choice; usage unknown.', rounds: [], unresolved: [], elapsedMs: 0, finalDiff: '+module change', log: [] })) };
}
for (const item of [splitFixture(splitId, 'plan-ready'), splitFixture(buildingId, 'building')]) fs.writeFileSync(path.join(profile, 'tasks', item.id + '.json'), JSON.stringify(item));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false, consoleDefaults: { provider: 'shell', cwd: project, name: '', command: '' } }));
fs.writeFileSync(path.join(profile, 'projects.json'), JSON.stringify([{ id: 'fixture-project', name: 'Task UI', status: 'active', folders: [{ path: project, label: 'Repository' }], milestones: [], createdAt: now }]));
const executablePath = process.argv.find(arg => arg.startsWith('--app='))?.slice(6);
let app;
(async () => {
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? [] : [root]), '--smoke-test', `--data-dir=${profile}`], timeout: 30000 });
  const page = await app.firstWindow(), errors = []; page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.locator('.session-grid').waitFor(); await page.setViewportSize({ width: 984, height: 820 });
  const call = (method, payload) => page.evaluate(async ([method, payload]) => { const reply = await window.dock.call(method, payload); if (!reply.ok) throw Error(reply.error); return reply.value; }, [method, payload]);
  assert.deepEqual((await call('tasks.candidates')).implementers, [], 'Smoke mode cannot launch paid providers');
  await openPage(page, 'tasks'); await page.locator('#task-detail-title').waitFor();
  assert.equal(await page.locator('#task-detail-title').textContent(), 'Fixture task');
  assert.equal(await page.locator('.task-list [aria-current=true]').count(), 1);

  await page.getByRole('button', { name: 'New task', exact: true }).focus(); await page.keyboard.press('Enter');
  const form = page.locator('#task-form'); await form.waitFor();
  assert.equal(await form.getByLabel('Repository', { exact: true }).inputValue(), project);
  await form.getByLabel('Title', { exact: true }).fill('Keyboard task'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-criteria');
  await page.keyboard.type('Return 2.'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-size');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-split');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-implementer');
  assert.equal(await form.getByLabel('Implementer', { exact: true }).inputValue(), '');
  await form.getByLabel('Reviewer', { exact: true }).focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-checks', 'Disabled reviewer model is skipped');
  await page.keyboard.type('npm test -- --grep "a b"'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-workflow');
  assert.equal(await form.getByLabel('Max rounds', { exact: true }).inputValue(), '3');
  assert.equal(await form.getByLabel('Time limit (minutes)', { exact: true }).inputValue(), '30');
  assert.equal(await form.getByRole('button', { name: 'Start', exact: true }).isDisabled(), true);
  await form.getByLabel('Split into subtasks', { exact: true }).focus(); await page.keyboard.press('Space');
  await form.getByLabel('Planner', { exact: true }).waitFor();
  assert.equal(await form.getByLabel('Workflow', { exact: true }).isDisabled(), true);
  assert.equal(await form.getByLabel('Workflow', { exact: true }).inputValue(), 'worktree');
  await form.getByRole('button', { name: 'Cancel', exact: true }).focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-detail-title');
  const summary = page.locator('[data-task-details="check-1"] > summary');
  await summary.focus(); await page.keyboard.press('Space');
  assert.equal(await page.locator('[data-task-details="check-1"]').getAttribute('open'), '');
  assert.equal(await page.getByLabel('Round 1 check output', { exact: true }).textContent(), 'Expected 2.');
  assert.equal(await page.evaluate(() => document.querySelector('.task-page').scrollWidth <= document.querySelector('.task-page').clientWidth + 1), true, 'The Tasks page fits at 984 px');

  await page.evaluate(() => {
    window.taskStatusRegion = document.querySelector('#task-announcement'); window.taskAnnouncements = [];
    new MutationObserver(() => window.taskAnnouncements.push(window.taskStatusRegion.textContent)).observe(window.taskStatusRegion, { childList: true, characterData: true, subtree: true });
  });
  const region = page.locator('#task-announcement');
  assert.equal(await region.getAttribute('role'), 'status'); assert.equal(await region.getAttribute('aria-live'), 'polite'); assert.equal(await region.getAttribute('aria-atomic'), 'true');
  const base = await call('state');
  async function sendState(state, progress = '') {
    const next = structuredClone(base), item = next.tasks.find(task => task.id === id);
    item.state = state; item.log = progress ? [progress] : []; item.error = '';
    const round = item.rounds[0];
    round.implement.state = state === 'implementing' ? 'running' : 'done';
    round.check.state = state === 'checking' ? 'running' : 'passed'; round.check.outcome = 'passed'; round.check.exitCode = 0;
    item.unresolved = state === 'needs-you' ? ['Review requested a fix.'] : [];
    await app.evaluate(({ BrowserWindow }, snapshot) => BrowserWindow.getAllWindows()[0].webContents.send('dock:state', snapshot), next);
    await page.waitForFunction(text => document.querySelector('#task-announcement').textContent === text, `Fixture task: ${state === 'needs-you' ? 'Needs you' : state[0].toUpperCase() + state.slice(1)}.`);
    if (progress) await page.waitForFunction(text => document.querySelector('#task-progress-log')?.textContent === text, progress);
    assert.equal(await page.evaluate(() => window.taskStatusRegion === document.querySelector('#task-announcement') && !document.querySelector('#task-content').contains(window.taskStatusRegion)), true, 'Live region survives detail updates');
  }
  await sendState('implementing'); await page.getByRole('button', { name: 'Stop', exact: true }).focus();
  await sendState('checking'); assert.equal(await page.evaluate(() => document.activeElement.dataset.taskAction), 'stop');
  const announcements = await page.evaluate(() => window.taskAnnouncements.length);
  await sendState('checking', 'Checking app.js');
  assert.equal(await page.evaluate(() => window.taskAnnouncements.length), announcements, 'Progress does not repeat a status announcement');
  await sendState('reviewing'); assert.equal(await page.evaluate(() => document.activeElement.dataset.taskAction), 'stop');
  await sendState('passed'); assert.equal(await page.evaluate(() => document.activeElement.id), 'task-detail-title');
  await sendState('needs-you');
  const announced = await page.evaluate(() => window.taskAnnouncements);
  for (const state of ['Implementing', 'Checking', 'Reviewing', 'Passed', 'Needs you']) assert.ok(announced.includes(`Fixture task: ${state}.`));

  await page.getByRole('button', { name: 'Accept', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#task-announcement').textContent === 'Fixture task: Accepted.');
  await page.getByRole('button', { name: 'Open report', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.locator('.wb-dialog[open] #result-preview').waitFor();
  await page.waitForFunction(() => document.querySelector('.wb-dialog[open] #result-preview')?.textContent.includes('Status: accepted'));
  await page.keyboard.press('Escape');
  await page.locator(`[data-task-action=select][data-id="${splitId}"]`).focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#task-detail-title').textContent(), 'Split fixture');
  assert.ok((await page.locator('.task-plan').textContent()).includes('Plan not reviewed'));
  const assignment = page.getByLabel('Implementer for first', { exact: true }); await assignment.focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-sub-first-model');
  await page.keyboard.type('saved-model');
  await page.getByLabel('Maximum running subtasks', { exact: true }).fill('3');
  const approveButton = page.getByRole('button', { name: 'Approve plan', exact: true }); await approveButton.focus();
  assert.equal(await approveButton.isEnabled(), true);
  await page.keyboard.press('Enter');
  // Real approval is validated in main: smoke mode has no signed-in providers.
  await page.waitForFunction(() => document.querySelector('#task-detail-title')?.textContent === 'Split fixture' && !document.querySelector('[data-task-action=approvePlan]').disabled);
  assert.equal((await call('state')).tasks.find(task => task.id === splitId).state, 'plan-ready');
  await page.getByRole('link', { name: 'View diff for First module', exact: true }).focus(); await page.keyboard.press('Enter');
  assert.equal(await page.getByLabel('Diff for First module', { exact: true }).evaluate(node => node === document.activeElement), true);
  for (const width of [984, 390]) {
    await page.setViewportSize({ width, height: 820 });
    assert.equal(await page.locator('.task-page').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, `Split plan fits at ${width}px`);
  }
  const recovered = (await call('state')).tasks.find(task => task.id === buildingId);
  assert.equal(recovered.state, 'interrupted'); assert.equal(recovered.subtasks[0].state, 'interrupted');
  await page.locator(`[data-task-action=select][data-id="${buildingId}"]`).focus(); await page.keyboard.press('Enter');
  await page.evaluate(() => { window.taskStatusRegion = document.querySelector('#task-announcement'); });
  assert.equal(await page.getByRole('button', { name: 'Resume', exact: true }).count(), 1);
  const building = await call('state'), item = building.tasks.find(task => task.id === buildingId);
  item.state = 'building'; item.subtasks[0].state = 'implementing'; item.error = ''; item.unresolved = [];
  await app.evaluate(({ BrowserWindow }, snapshot) => BrowserWindow.getAllWindows()[0].webContents.send('dock:state', snapshot), building);
  await page.waitForFunction(() => document.querySelector('#task-announcement').textContent.includes('Building fixture: Building.'));
  await page.getByRole('button', { name: 'Stop', exact: true }).focus();
  item.subtasks[0].state = 'checking';
  await app.evaluate(({ BrowserWindow }, snapshot) => BrowserWindow.getAllWindows()[0].webContents.send('dock:state', snapshot), building);
  await page.waitForFunction(() => document.querySelector('#task-announcement').textContent.includes('First module: Checking.'));
  assert.equal(await page.evaluate(() => document.activeElement.dataset.taskAction), 'stop');
  assert.equal(await page.evaluate(() => window.taskStatusRegion === document.querySelector('#task-announcement')), true);
  await page.setViewportSize({ width: 984, height: 820 });
  assert.equal(await page.locator('.task-page').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
  assert.deepEqual(errors, []);
  console.log('PASS Tasks and split plans: keyboard controls, approval validation, restart recovery, persistent live region, focus, 984px/phone layouts and Results. No provider requests.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close().catch(() => {});
  assert.equal(path.dirname(fs.realpathSync(work)), fs.realpathSync(parent)); fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
