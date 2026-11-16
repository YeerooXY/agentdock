'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { SplitTasks } = require('../electron/task-plan.cjs');
const { taskUsage } = require('../electron/workflow-usage.cjs');
const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, stdio: 'pipe' });

function fixture(t, resolve) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-conflict-')), repo = path.join(root, 'repo');
  fs.mkdirSync(repo); git(repo, 'init', '-q'); git(repo, 'config', 'user.name', 'Merge tests'); git(repo, 'config', 'user.email', 'test@example.com'); git(repo, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(repo, 'shared.js'), 'module.exports = {};\n'); fs.writeFileSync(path.join(repo, 'other.js'), 'module.exports = 0;\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'base');
  const base = git(repo, 'rev-parse', 'HEAD').trim(), branch = 'paddock/task-12345678', workFolder = path.join(root, 'integration');
  git(repo, 'worktree', 'add', workFolder, '-b', branch, base);
  const assignment = { accountId: 'codex:default', provider: 'codex', model: 'test-model', funding: 'included' };
  const job = { id: 'integration', state: 'building', dispatchParallel: true, branch, workFolder, repo, integrationHead: base, size: 'medium', images: [], implementer: assignment, reviewer: null,
    plan: { contracts: 'Keep both approved features.', subtasks: [{ id: 'first', criteria: 'Keep feature one.' }, { id: 'second', criteria: 'Keep feature two.' }] }, planRounds: [], rounds: [], subtasks: [] };
  for (const [name, value] of [['first', 'one'], ['second', 'two']]) {
    const folder = path.join(root, name), subBranch = `${branch}-${name}`;
    git(repo, 'worktree', 'add', folder, '-b', subBranch, base); fs.writeFileSync(path.join(folder, 'shared.js'), `module.exports = { ${value}: true };\n`);
    git(folder, 'add', '.'); git(folder, 'commit', '-qm', name);
    job.subtasks.push({ id: name, subtaskId: name, state: 'passed', branch: subBranch, workFolder: folder, committed: git(folder, 'rev-parse', 'HEAD').trim(), rounds: [], unresolved: [] });
  }
  let requests = 0, eligibility = 0;
  const loop = { root, jobs: new Map([[job.id, job]]), now: Date.now, changed: () => true,
    git: async (cwd, args) => git(cwd, ...args), dispatcher: { checkAssignments() { eligibility++; } },
    provider: async (target, step, prompt) => { requests++; await resolve(target, prompt); step.usage = { inputTokens: 20, outputTokens: 3, cachedInputTokens: 4 }; return { summary: 'Reconciled both features.' }; } };
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const split = new SplitTasks(loop);
  return { job, loop, split, repo, base, requests: () => requests, eligibility: () => eligibility };
}

test('integration worker resolves an actual merge conflict, preserves both lane behaviors and records usage', async t => {
  const f = fixture(t, async (job, prompt) => {
    assert.match(prompt, /shared.js/); assert.match(prompt, /Keep feature one/); assert.match(prompt, /Keep feature two/);
    assert.match(fs.readFileSync(path.join(job.workFolder, 'shared.js'), 'utf8'), /<<<<<<< HEAD/);
    fs.writeFileSync(path.join(job.workFolder, 'shared.js'), 'module.exports = { one: true, two: true };\n');
  });
  await f.split.merge(f.job, f.job.subtasks[0]); await f.split.merge(f.job, f.job.subtasks[1]);
  assert.equal(f.requests(), 1); assert.equal(f.eligibility(), 1); assert.equal(f.job.integrationConflict.state, 'resolved');
  assert.ok(f.job.subtasks.every(sub => sub.state === 'merged'));
  assert.equal(fs.readFileSync(path.join(f.job.workFolder, 'shared.js'), 'utf8'), 'module.exports = { one: true, two: true };\n');
  assert.equal(git(f.job.workFolder, 'status', '--porcelain'), '');
  assert.equal(git(f.repo, 'rev-parse', 'HEAD').trim(), f.base);
  assert.equal(fs.readFileSync(path.join(f.repo, 'shared.js'), 'utf8'), 'module.exports = {};\n');
  assert.equal(taskUsage(f.job).cloud.calls, 1); assert.equal(taskUsage(f.job).cloud.input, 20);
});

test('unresolved markers preserve the integration conflict and both committed lane branches', async t => {
  const f = fixture(t, async () => {});
  await f.split.merge(f.job, f.job.subtasks[0]); const head = f.job.integrationHead;
  await assert.rejects(f.split.merge(f.job, f.job.subtasks[1]), /markers remain/);
  assert.equal(f.job.integrationConflict.state, 'needs-you'); assert.equal(f.job.integrationRounds[0].implement.state, 'failed');
  assert.equal(git(f.job.workFolder, 'rev-parse', 'HEAD').trim(), head);
  assert.equal(git(f.job.workFolder, 'diff', '--name-only', '--diff-filter=U').trim(), 'shared.js');
  for (const sub of f.job.subtasks) assert.equal(git(sub.workFolder, 'rev-parse', 'HEAD').trim(), sub.committed);
});

test('resolver edits outside conflict paths cannot be committed', async t => {
  const f = fixture(t, async job => {
    fs.writeFileSync(path.join(job.workFolder, 'shared.js'), 'module.exports = { one: true, two: true };\n');
    fs.writeFileSync(path.join(job.workFolder, 'other.js'), 'unauthorized change');
  });
  await f.split.merge(f.job, f.job.subtasks[0]); const head = f.job.integrationHead;
  await assert.rejects(f.split.merge(f.job, f.job.subtasks[1]), /outside/);
  assert.equal(git(f.job.workFolder, 'rev-parse', 'HEAD').trim(), head); assert.equal(f.job.subtasks[1].state, 'passed');
});

test('changed integration eligibility prevents a conflict model request', async t => {
  const f = fixture(t, async () => { throw Error('No request should start.'); });
  await f.split.merge(f.job, f.job.subtasks[0]); f.loop.dispatcher.checkAssignments = () => { throw Error('Integration funding changed.'); };
  await assert.rejects(f.split.merge(f.job, f.job.subtasks[1]), /funding changed/); assert.equal(f.requests(), 0);
});

test('protected staged-only edits are refused even when the working file still matches HEAD', async t => {
  const f = fixture(t, async job => {
    fs.writeFileSync(path.join(job.workFolder, 'shared.js'), 'module.exports = { one: true, two: true };\n');
    fs.writeFileSync(path.join(job.workFolder, 'other.js'), 'staged outside conflict scope\n');
    git(job.workFolder, 'add', 'other.js');
    fs.writeFileSync(path.join(job.workFolder, 'other.js'), 'module.exports = 0;\n');
  });
  await f.split.merge(f.job, f.job.subtasks[0]); const head = f.job.integrationHead;
  await assert.rejects(f.split.merge(f.job, f.job.subtasks[1]), /outside/);
  assert.equal(git(f.job.workFolder, 'rev-parse', 'HEAD').trim(), head);
  assert.match(git(f.job.workFolder, 'diff', '--cached', 'HEAD', '--', 'other.js'), /staged outside/);
});

test('deleting a normal conflict file cannot silently discard both lane changes', async t => {
  const f = fixture(t, async job => { fs.unlinkSync(path.join(job.workFolder, 'shared.js')); });
  await f.split.merge(f.job, f.job.subtasks[0]); const head = f.job.integrationHead;
  await assert.rejects(f.split.merge(f.job, f.job.subtasks[1]), /disappeared/);
  assert.equal(git(f.job.workFolder, 'rev-parse', 'HEAD').trim(), head);
  assert.equal(f.job.integrationConflict.state, 'needs-you'); assert.equal(f.job.subtasks[1].state, 'passed');
});
