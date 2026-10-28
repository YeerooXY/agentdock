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
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-implementer');
  await form.getByLabel('Reviewer', { exact: true }).focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-checks', 'Disabled reviewer model is skipped');
  await page.keyboard.type('npm test -- --grep "a b"'); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'task-workflow');
  assert.equal(await form.getByLabel('Max rounds', { exact: true }).inputValue(), '3');
  assert.equal(await form.getByLabel('Time limit (minutes)', { exact: true }).inputValue(), '30');
  assert.equal(await form.getByRole('button', { name: 'Start', exact: true }).isDisabled(), true);
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
  await page.keyboard.press('Escape'); assert.deepEqual(errors, []);
  console.log('PASS Tasks keyboard controls, labels, persistent polite status announcements, focus preservation, 984 px layout and Results report. No provider requests.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close().catch(() => {});
  assert.equal(path.dirname(fs.realpathSync(work)), fs.realpathSync(parent)); fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
