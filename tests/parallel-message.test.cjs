'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { TaskLoop } = require('../electron/task-loop.cjs');
const { defaults } = require('../electron/task-routing.cjs');
const { taskUsage } = require('../electron/workflow-usage.cjs');
const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, stdio: 'pipe' });
const route = { accountId: 'codex:default', model: 'test-model' };
const item = (id, extra = {}) => ({ id, title: id, criteria: `Update ${id}.js.`, kind: 'build', size: 'small', owns: [`${id}.js`], dependsOn: [], images: [], ...extra });

function fixture(t, items) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-parallel-')), repo = path.join(temp, 'repo'), root = path.join(temp, 'data');
  fs.mkdirSync(repo); git(repo, 'init', '-q'); git(repo, 'config', 'user.name', 'Parallel tests'); git(repo, 'config', 'user.email', 'test@example.com'); git(repo, 'config', 'core.autocrlf', 'false');
  for (const sub of items.filter(sub => sub.kind !== 'question')) fs.writeFileSync(path.join(repo, `${sub.id}.js`), 'module.exports = 0;\n');
  fs.writeFileSync(path.join(repo, 'app.js'), 'module.exports = 0;\n'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'base');
  const routing = { ...defaults, discoverAccounts: false, small: [route], medium: [route], large: [route], defaultReviewer: null };
  const loop = new TaskLoop(root, { candidates: () => [{ id: route.accountId, provider: 'codex', label: 'Codex', executable: '/mock/codex', funding: 'included', available: true }],
    repositories: () => [{ path: repo, label: 'Fixture' }], getSettings: () => ({ routing, maxParallelTasks: 10, autoResolveTasks: false }),
    getLimits: () => [{ accountId: route.accountId, funding: 'included', observedAt: Date.now(), windows: [{ key: 'account', usedPercent: 20 }] }] });
  loop.dispatcher.request = async () => ({ text: JSON.stringify({ contracts: 'Integrate the approved lane outputs in app.js.', subtasks: items }) });
  loop.process = async () => ({ code: 0, output: '', timedOut: false });
  t.after(async () => { loop.interruptAll(); await Promise.allSettled([...loop.pending.values()]); fs.rmSync(temp, { recursive: true, force: true }); });
  const create = () => loop.dispatcher.create({ repo, text: 'Complete these changes.', checks: 'fixture-check' });
  const complete = async parent => {
    const child = loop.jobs.get(loop.jobs.get(parent.id).dispatchTasks[0].taskId);
    await loop.pending.get(child.id); await loop.dispatcher.advance(parent.id); return child;
  };
  return { loop, repo, root, create, complete };
}

test('six independent lanes run together in isolated worktrees before one integration turn and combined checks', async t => {
  const items = Array.from({ length: 6 }, (_, i) => item(`lane-${i}`)), f = fixture(t, items);
  let active = 0, maximum = 0, release, integrated = 0;
  const together = new Promise(resolve => { release = resolve; });
  const timeout = setTimeout(release, 10000); t.after(() => clearTimeout(timeout));
  const folders = new Set();
  f.loop.provider = async (job, step) => {
    if (job.parentId) {
      folders.add(job.workFolder); maximum = Math.max(maximum, ++active);
      if (active === 6) release(); await together;
      fs.writeFileSync(path.join(job.workFolder, `${job.subtaskId}.js`), `module.exports = ${Number(job.subtaskId.slice(5)) + 1};\n`); active--;
    } else {
      integrated++; assert.equal(job.dispatchParallel, true); assert.equal(job.subtasks.every(sub => sub.state === 'merged'), true);
      for (const [i, sub] of items.entries()) assert.equal(fs.readFileSync(path.join(job.workFolder, `${sub.id}.js`), 'utf8'), `module.exports = ${i + 1};\n`);
      fs.writeFileSync(path.join(job.workFolder, 'app.js'), 'module.exports = 21;\n');
    }
    step.usage = { inputTokens: 10, outputTokens: 2, cachedInputTokens: 0 }; return { summary: 'Updated approved files.' };
  };
  const sourceHead = git(f.repo, 'rev-parse', 'HEAD'), sourceBranch = git(f.repo, 'branch', '--show-current');
  const parent = await f.create(); assert.equal(parent.state, 'plan-ready'); assert.equal(folders.size, 0);
  await f.loop.dispatcher.approve({ id: parent.id, parallelLimit: 6 });
  const child = await f.complete(parent);
  assert.equal(maximum, 6); assert.equal(folders.size, 6); assert.equal(integrated, 1);
  assert.equal(child.state, 'passed'); assert.equal(child.rounds.length, 1); assert.equal(child.rounds[0].check.state, 'passed');
  assert.equal(child.planRounds.length, 0); assert.equal(child.subtasks.length, 6); assert.equal(child.parallelLimit, 6);
  assert.equal(f.loop.jobs.get(parent.id).state, 'passed'); assert.equal(taskUsage(child).cloud.calls, 7);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), sourceHead); assert.equal(git(f.repo, 'branch', '--show-current'), sourceBranch);
  assert.equal(fs.readFileSync(path.join(f.repo, 'app.js'), 'utf8'), 'module.exports = 0;\n');
  await assert.rejects(f.loop.dispatcher.approve({ id: parent.id }), /ready/);
});

test('overlapping ownership waits for merged dependency output and the lane cap bounds concurrency', async t => {
  const items = [item('first', { owns: ['first.js', 'app.js'] }), item('second', { owns: ['second.js', 'app.js'] }), item('third')], f = fixture(t, items);
  let active = 0, maximum = 0;
  f.loop.provider = async job => {
    if (!job.parentId) return { summary: 'Integrated.' };
    maximum = Math.max(maximum, ++active);
    if (job.subtaskId === 'second') assert.match(fs.readFileSync(path.join(job.workFolder, 'app.js'), 'utf8'), /first/);
    await new Promise(resolve => setTimeout(resolve, 20));
    fs.writeFileSync(path.join(job.workFolder, `${job.subtaskId}.js`), 'module.exports = 1;\n');
    if (job.subtaskId !== 'third') fs.appendFileSync(path.join(job.workFolder, 'app.js'), `// ${job.subtaskId}\n`);
    active--; return { summary: 'Updated.' };
  };
  const parent = await f.create(); await f.loop.dispatcher.approve({ id: parent.id, parallelLimit: 2 });
  const child = await f.complete(parent);
  assert.equal(child.state, 'passed'); assert.ok(maximum <= 2);
  assert.deepEqual(child.subtasks.find(sub => sub.subtaskId === 'second').dependsOn, ['first']);
  assert.match(fs.readFileSync(path.join(child.workFolder, 'app.js'), 'utf8'), /first\n\/\/ second/);
});

test('dirty approval preserves tracked and untracked owner work and creates no worktrees', async t => {
  const f = fixture(t, [item('first')]); let turns = 0; f.loop.provider = async () => { turns++; return {}; };
  const parent = await f.create(); fs.writeFileSync(path.join(f.repo, 'app.js'), 'owner edit'); fs.writeFileSync(path.join(f.repo, 'owner.txt'), 'owner notes');
  await assert.rejects(f.loop.dispatcher.approve({ id: parent.id }), /Commit or stash/);
  assert.equal(f.loop.jobs.get(parent.id).state, 'plan-ready'); assert.equal(turns, 0);
  assert.equal(fs.readFileSync(path.join(f.repo, 'app.js'), 'utf8'), 'owner edit'); assert.equal(fs.readFileSync(path.join(f.repo, 'owner.txt'), 'utf8'), 'owner notes');
  assert.equal(git(f.repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm).length, 1);
});

test('stopping a parallel plan during async preparation prevents every worker launch', async t => {
  const f = fixture(t, [item('first')]); let turns = 0, statusCalls = 0, release, reached;
  f.loop.provider = async () => { turns++; return {}; };
  const blocked = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const original = f.loop.git.bind(f.loop);
  f.loop.git = async (folder, args) => {
    if (args[0] === 'status' && ++statusCalls === 2) { reached(); await gate; }
    return original(folder, args);
  };
  const parent = await f.create(), approval = f.loop.dispatcher.approve({ id: parent.id });
  await blocked; await f.loop.dispatcher.stop(f.loop.jobs.get(parent.id)); release(); await approval;
  assert.equal(f.loop.jobs.get(parent.id).state, 'stopped'); assert.equal(turns, 0); assert.equal(f.loop.jobs.get(parent.id).dispatchTasks.length, 0);
  assert.equal(git(f.repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm).length, 1);
});

test('stopping the parent stops active lanes and preserves their isolated worktrees', async t => {
  const f = fixture(t, [item('first'), item('second')]); let active = 0, release, reached, integration = 0;
  const running = new Promise(resolve => { reached = resolve; }), gate = new Promise(resolve => { release = resolve; });
  f.loop.provider = async job => {
    if (!job.parentId) { integration++; return {}; }
    if (++active === 2) reached(); await gate;
    fs.writeFileSync(path.join(job.workFolder, `${job.subtaskId}.js`), 'owner can inspect this result\n'); return { summary: 'Kept work.' };
  };
  const parent = await f.create(); await f.loop.dispatcher.approve({ id: parent.id, parallelLimit: 2 }); await running;
  const child = f.loop.jobs.get(f.loop.jobs.get(parent.id).dispatchTasks[0].taskId);
  const stopped = f.loop.dispatcher.stop(f.loop.jobs.get(parent.id)); release(); await stopped;
  assert.equal(f.loop.jobs.get(parent.id).state, 'stopped'); assert.equal(child.state, 'stopped'); assert.equal(integration, 0);
  assert.equal(child.subtasks.every(sub => sub.state === 'stopped'), true);
  for (const sub of child.subtasks) assert.equal(fs.existsSync(sub.workFolder), true);
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('integration funding is rechecked after lanes and blocked before the merger turn', async t => {
  const f = fixture(t, [item('first')]); let turns = 0;
  const assignment = f.loop.assignment.bind(f.loop);
  f.loop.provider = async job => {
    turns++; assert.ok(job.parentId);
    fs.writeFileSync(path.join(job.workFolder, 'first.js'), 'module.exports = 1;\n');
    f.loop.assignment = (...args) => ({ ...assignment(...args), funding: 'metered' });
    return { summary: 'Updated.' };
  };
  const parent = await f.create(); await f.loop.dispatcher.approve({ id: parent.id }); const child = await f.complete(parent);
  assert.equal(turns, 1); assert.equal(child.state, 'needs-you'); assert.match(child.error, /funding/);
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
});

test('parallel parent linkage must save before any child worker can start', async t => {
  const f = fixture(t, [item('first')]); let turns = 0;
  f.loop.provider = async () => { turns++; return {}; };
  const parent = await f.create(), changed = f.loop.changed.bind(f.loop); let failed = false;
  f.loop.changed = job => {
    if (job.id === parent.id && job.dispatchTasks.length && !failed) { failed = true; return false; }
    return changed(job);
  };
  await f.loop.dispatcher.approve({ id: parent.id });
  assert.equal(turns, 0); assert.equal(f.loop.jobs.get(parent.id).state, 'needs-you');
  const child = f.loop.jobs.get(f.loop.jobs.get(parent.id).dispatchTasks[0].taskId);
  assert.equal(child.state, 'stopped'); assert.match(f.loop.jobs.get(parent.id).error, /progress could not be saved/);
});

test('explicit integration resume adds one bounded turn after a failed combined check without rebuilding merged lanes', async t => {
  const f = fixture(t, [item('first')]); let workers = 0, mergers = 0, combinedChecks = 0;
  f.loop.provider = async job => {
    if (job.parentId) { workers++; fs.writeFileSync(path.join(job.workFolder, 'first.js'), 'module.exports = 1;\n'); }
    else { mergers++; fs.writeFileSync(path.join(job.workFolder, 'app.js'), `module.exports = ${mergers};\n`); }
    return { summary: 'Updated.' };
  };
  f.loop.process = async job => ({ code: job.split && ++combinedChecks === 1 ? 1 : 0, output: '', timedOut: false });
  const parent = await f.create(); await f.loop.dispatcher.approve({ id: parent.id }); const child = await f.complete(parent);
  assert.equal(child.state, 'needs-you'); assert.equal(child.rounds.length, 1); assert.equal(workers, 1); assert.equal(mergers, 1);
  await f.loop.resume(child.id); await f.loop.pending.get(child.id); await f.loop.dispatcher.advance(parent.id);
  assert.equal(child.state, 'passed'); assert.equal(child.rounds.length, 2); assert.equal(workers, 1); assert.equal(mergers, 2);
  assert.equal(f.loop.jobs.get(parent.id).state, 'passed');
});

test('answered question chains keep executable ancestor dependencies without creating question tasks', async t => {
  const f = fixture(t, [item('before'), item('answer', { kind: 'question', owns: [], answer: 'Use the first result.', dependsOn: ['before'] }),
    item('followup', { kind: 'question', owns: [], answer: 'Continue with the answer.', dependsOn: ['answer'] }), item('after', { dependsOn: ['followup'] })]);
  const seen = [];
  f.loop.provider = async job => {
    if (!job.parentId) return { summary: 'Integrated.' };
    seen.push(job.subtaskId);
    if (job.subtaskId === 'before') await new Promise(resolve => setTimeout(resolve, 40));
    if (job.subtaskId === 'after') assert.equal(fs.readFileSync(path.join(job.workFolder, 'before.js'), 'utf8'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(job.workFolder, `${job.subtaskId}.js`), 'module.exports = 1;\n'); return { summary: 'Updated.' };
  };
  const parent = await f.create(); await f.loop.dispatcher.approve({ id: parent.id }); const child = await f.complete(parent);
  assert.equal(child.state, 'passed'); assert.deepEqual(seen, ['before', 'after']);
  assert.deepEqual(child.subtasks.map(sub => sub.subtaskId), ['before', 'after']); assert.deepEqual(child.subtasks[1].dependsOn, ['before']);
});
