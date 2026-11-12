'use strict';
const { _electron: electron } = require('playwright');
const { openPage } = require('./ui-navigation.cjs');
const { Results } = require('../electron/results.cjs');
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
  unresolved: ['Checks failed (exit 1).'], changedFiles: ['app.js'], log: [], error: '', fingerprint: null, diffStat: 'app.js | 1 +', finalDiff: '+const value = 2;', resultId: null };
const outcome = { type: 'task', taskId: id, projectId: null, originConsoleId: null, verdict: 'failed-checks',
  outcome: 'One file changed. Checks failed. <tool_call>{"name":"hidden"}</tool_call>',
  changedFiles: { count: 1, top: ['app.js'] }, checks: { status: 'failed', summary: 'Checks failed (exit 1).' },
  unresolved: ['<tool_call>hidden</tool_call>Review the failed check.'], usage: null };
const saved = new Results(profile).add({ text: '# Fixture task\n\nStatus: needs-you', ext: '.md', title: job.title, kind: 'report', status: 'needs-review', summary: 'Fixture task outcome.', outcome }, { trusted: true, project, consoleName: 'Tasks', consoleKey: `task-${id}` });
job.resultId = saved.id;
fs.writeFileSync(path.join(profile, 'tasks', id + '.json'), JSON.stringify(job));
const splitId = '00000000-0000-4000-8000-000000000006', buildingId = '00000000-0000-4000-8000-000000000007';
const plan = { contracts: 'Use milliseconds. Label the page Classes.', subtasks: [
  { id: 'first', title: 'First module', criteria: 'Create first.js.', owns: ['src/first/**'], dependsOn: [], size: 'small' },
  { id: 'second', title: 'Second module', criteria: 'Create second.js.', owns: ['src/second/**'], dependsOn: ['first'], size: 'medium' }
] };
function splitFixture(taskId, state) {
  return { ...structuredClone(job), id: taskId, title: state === 'plan-ready' ? 'Split fixture' : 'Building fixture', startedAt: now - (state === 'plan-ready' ? 1000 : 2000), state, split: true, workflow: 'worktree', planner: account, plan, parallelLimit: 2,
    rounds: [], unresolved: [], resultId: null, planRounds: [], planReview: { state: 'not-set', findings: [] }, approvedAt: state === 'building' ? now : null,
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
  assert.equal(await page.locator('.task-result-verdict').textContent(), 'Failed');
  const initialTask = (await call('state')).tasks.find(item => item.id === id);
  assert.equal(await page.locator('.task-result-outcome').textContent(), initialTask.outcome.outcome);
  assert.equal(await page.locator('.task-result-files code').textContent(), 'app.js');
  assert.ok((await page.locator('.task-result').textContent()).includes('Checks failed (exit 1).'));
  assert.ok((await page.locator('.task-result-open').textContent()).includes(initialTask.outcome.unresolved[0]));
  assert.equal(await page.locator('[data-task-details="result-details"]').getAttribute('open'), null, 'Technical log starts behind Details');

  assert.equal(await page.locator('[data-task-action="new"], #task-form').count(), 0, 'Tasks are started by agents');
  const resultDetails = page.locator('[data-task-details="result-details"] > summary');
  await resultDetails.focus(); await page.keyboard.press('Space');
  assert.equal(await page.locator('[data-task-details="result-details"]').getAttribute('open'), '');
  const summary = page.locator('[data-task-details="check-1"] > summary');
  await summary.focus(); await page.keyboard.press('Space');
  assert.equal(await page.locator('[data-task-details="check-1"]').getAttribute('open'), '');
  assert.equal(await page.getByLabel('Round 1 check output', { exact: true }).textContent(), 'Expected 2.');
  for (const width of [984, 390]) {
    await page.setViewportSize({ width, height: 820 });
    assert.equal(await page.locator('.task-page').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, `Result card fits at ${width}px`);
  }
  await page.setViewportSize({ width: 984, height: 820 });

  await page.evaluate(() => {
    window.taskStatusRegion = document.querySelector('#task-announcement'); window.taskAnnouncements = [];
    new MutationObserver(() => window.taskAnnouncements.push(window.taskStatusRegion.textContent)).observe(window.taskStatusRegion, { childList: true, characterData: true, subtree: true });
  });
  const region = page.locator('#task-announcement');
  assert.equal(await region.getAttribute('role'), 'status'); assert.equal(await region.getAttribute('aria-live'), 'polite'); assert.equal(await region.getAttribute('aria-atomic'), 'true');
  const accept = page.getByRole('button', { name: 'Accept with issues', exact: true });
  await accept.focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.taskAction), 'seen');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.taskAction), 'accept');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#task-announcement').textContent === 'Fixture task: Accepted.' && document.activeElement?.dataset.taskAction === 'seen', null, { timeout: 15000 });
  assert.equal(await page.evaluate(() => document.activeElement.dataset.taskAction), 'seen', 'A removed Accept action hands focus to Mark as seen');
  const acceptedDetails = page.locator('[data-task-details="result-details"] > summary');
  if (await page.locator('[data-task-details="result-details"]').getAttribute('open') === null) { await acceptedDetails.focus(); await page.keyboard.press('Space'); }
  await page.getByRole('button', { name: 'Open report', exact: true }).focus(); await page.keyboard.press('Enter');
  const report = page.locator('.execution-report[open]');
  await report.waitFor();
  await page.waitForFunction(() => document.querySelector('.execution-report pre')?.textContent.includes('Status: accepted'));
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Execution report');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Close');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Execution report');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Space');
  await report.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement.dataset.taskAction), 'report');
  await page.keyboard.press('Enter'); await report.waitFor();
  await page.keyboard.press('Escape'); await report.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement.dataset.taskAction), 'report');
  await page.getByRole('button', { name: 'Mark as seen', exact: true }).focus(); await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('[data-task-action="seen"]')?.disabled === true);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.taskAction), 'close', 'Disabling Mark as seen hands focus to Close');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.task-result'));
  assert.equal(await page.evaluate(() => document.activeElement.dataset.taskAction), 'filter', 'Closing the last result moves focus to the view filter');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'history');
  await page.locator('[data-task-action=filter][data-id=active]').click();
  await page.locator(`[data-task-action=select][data-id="${splitId}"]`).focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#task-detail-title')?.textContent === 'Split fixture');
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
  assert.deepEqual(errors, []);
  console.log('PASS Task outcome cards and split plans: keyboard controls, focus succession, acknowledge, dismiss, approval validation, restart recovery, 984px/phone layouts and markdown reports. No provider requests.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close().catch(() => {});
  assert.equal(path.dirname(fs.realpathSync(work)), fs.realpathSync(parent)); fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
