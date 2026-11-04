'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const { MergeBack } = require('../electron/merge-back.cjs');
const { Scheduler } = require('../electron/scheduler.cjs');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(t, checks) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-merge-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  const repo = path.join(root, 'repo'), workFolder = path.join(root, 'task'); fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main'); git(repo, 'config', 'user.name', 'Test'); git(repo, 'config', 'user.email', 'test@localhost'); git(repo, 'config', 'core.autocrlf', 'false');
  git(repo, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(repo, 'base.txt'), 'base\n'); git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'base');
  git(repo, 'worktree', 'add', '-b', 'paddock/task-test', workFolder);
  fs.writeFileSync(path.join(workFolder, 'task.txt'), 'task\n');
  const admission = new Scheduler(path.join(root, 'data'));
  const merger = new MergeBack(path.join(root, 'data'), { admission, checks });
  t.after(() => admission.dispose());
  return { root, repo, workFolder, admission, merger, task: { id: 'test', repo, workFolder, branch: 'paddock/task-test', targetBranch: 'main' } };
}
test('checks see the exact combined tree before a clean checked-out target advances', async t => {
  const f = fixture(t, async (task, intent) => {
    assert.equal(git(f.repo, 'rev-parse', 'main'), intent.base);
    assert.equal(fs.readFileSync(path.join(task.workFolder, 'target.txt'), 'utf8'), 'target\n');
    assert.equal(fs.readFileSync(path.join(task.workFolder, 'task.txt'), 'utf8'), 'task\n');
    assert.equal(git(task.workFolder, 'rev-parse', 'HEAD'), intent.merged);
    return { code: 0 };
  });
  fs.writeFileSync(path.join(f.repo, 'target.txt'), 'target\n'); git(f.repo, 'add', '.'); git(f.repo, 'commit', '-qm', 'target advances');
  const source = git(f.workFolder, 'rev-parse', 'HEAD');
  const result = await f.merger.accept(f.task);
  assert.equal(result.state, 'completed'); assert.equal(git(f.repo, 'rev-parse', 'HEAD'), result.merged);
  assert.equal(git(f.repo, 'status', '--porcelain'), '');
  assert.equal(git(f.workFolder, 'rev-parse', 'HEAD'), source);
  assert.match(git(f.workFolder, 'status', '--porcelain'), /task.txt/);
  assert.equal(f.admission.active.size, 0);
});
test('failing checks preserve target ref, index and working files', async t => {
  const f = fixture(t, async () => ({ code: 1, output: 'failed test' }));
  const before = git(f.repo, 'rev-parse', 'HEAD');
  await assert.rejects(f.merger.accept(f.task), /checks failed/);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before);
  assert.equal(git(f.repo, 'status', '--porcelain'), ''); assert.equal(fs.existsSync(path.join(f.repo, 'task.txt')), false);
  assert.equal(f.merger.snapshot()[0].checks.output, 'failed test');
});
test('conflicting files are reported without changing target or running checks', async t => {
  let calls = 0; const f = fixture(t, async () => { calls++; return { code: 0 }; });
  fs.writeFileSync(path.join(f.workFolder, 'base.txt'), 'source\n');
  fs.writeFileSync(path.join(f.repo, 'base.txt'), 'target\n'); git(f.repo, 'commit', '-qam', 'target conflict');
  const before = git(f.repo, 'rev-parse', 'HEAD'), result = await f.merger.accept(f.task);
  assert.equal(result.state, 'conflict'); assert.deepEqual(result.conflicts, ['base.txt']); assert.equal(calls, 0);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before); assert.equal(git(f.repo, 'status', '--porcelain'), '');
});
test('merge leases serialize a target, then build against the newly accepted commit', async t => {
  let resume, started; const entered = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { resume = resolve; }); let calls = 0;
  const f = fixture(t, async () => { if (++calls === 1) { started(); await gate; } return { code: 0 }; });
  const otherFolder = path.join(f.root, 'second'); git(f.repo, 'worktree', 'add', '-b', 'paddock/second', otherFolder);
  fs.writeFileSync(path.join(otherFolder, 'second.txt'), 'second');
  const first = f.merger.accept(f.task); await entered;
  const second = f.merger.accept({ ...f.task, id: 'second', branch: 'paddock/second', workFolder: otherFolder });
  for (let i = 0; i < 100 && !f.admission.pending.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(f.admission.pending[0].reason, 'Waiting for merge'); assert.equal(calls, 1);
  resume(); const [a, b] = await Promise.all([first, second]); assert.equal(b.base, a.merged);
  assert.ok(fs.existsSync(path.join(f.repo, 'task.txt'))); assert.ok(fs.existsSync(path.join(f.repo, 'second.txt')));
});
test('startup preserves an interrupted intent and refuses to replay it', async t => {
  const f = fixture(t); const base = git(f.repo, 'rev-parse', 'HEAD');
  const common = git(f.repo, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  f.merger.save({ id: 'dead', taskId: 'test', repository: common, branch: f.task.branch, target: 'main', base, head: base }, 'merging');
  const restored = new MergeBack(path.join(f.root, 'data'), { admission: f.admission });
  assert.equal(restored.snapshot()[0].state, 'interrupted'); assert.equal(restored.snapshot()[0].previousState, 'merging');
  await assert.rejects(restored.accept(f.task), /interrupted merge-back needs review/);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), base); assert.equal(f.admission.active.size, 0);
});
test('checks that modify tracked files cannot publish a different tree', async t => {
  const f = fixture(t, async task => { fs.writeFileSync(path.join(task.workFolder, 'task.txt'), 'changed by checks'); return { code: 0 }; });
  const before = git(f.repo, 'rev-parse', 'HEAD');
  await assert.rejects(f.merger.accept(f.task), /Checks changed the merged tree/);
  assert.equal(git(f.repo, 'rev-parse', 'HEAD'), before);
});

function simulated(t, checks) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-merge-mock-'));
  const admission = new Scheduler(root), repo = path.join(root, 'repo');
  t.after(() => { admission.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
  const state = { target: 'base', dirty: '', calls: [] };
  const git = async (folder, args) => {
    state.calls.push({ folder, args });
    if (args.includes('--git-common-dir')) return path.join(repo, '.git');
    if (args[0] === 'check-ref-format') return '';
    if (args[0] === 'branch') return folder === repo ? 'main' : 'paddock/task';
    if (args[0] === 'status') return folder === repo ? state.dirty : '';
    if (args[0] === 'rev-parse') return args.at(-1) === 'refs/heads/main' ? state.target : args.at(-1) === 'refs/heads/paddock/task' ? 'head' : 'merged';
    if (args[0] === 'worktree' && args[1] === 'list') return `worktree ${repo}\0HEAD ${state.target}\0branch refs/heads/main\0\0`;
    if (args.includes('commit-tree')) return 'snapshot';
    if (args.includes('write-tree')) return 'tree';
    if (args.includes('merge') && folder === repo) state.target = args.at(-1);
    return '';
  };
  const merger = new MergeBack(root, { admission, git, checks });
  const task = { id: 'mock', repo, workFolder: path.join(root, 'source'), branch: 'paddock/task', targetBranch: 'main' };
  return { root, merger, task, state, git, admission };
}
test('mocked storage failure after publishing preserves an unresolved intent across startup', async t => {
  const f = simulated(t, async () => ({ code: 0 }));
  const save = f.merger.save.bind(f.merger);
  f.merger.save = (intent, state, fields) => { if (state === 'completed') throw Error('Disk unavailable'); return save(intent, state, fields); };
  await assert.rejects(f.merger.accept(f.task), /Disk unavailable/);
  assert.equal(f.state.target, 'merged'); assert.equal(f.merger.snapshot()[0].state, 'publishing');
  const restored = new MergeBack(f.root, { admission: f.admission, git: f.git });
  assert.equal(restored.snapshot()[0].previousState, 'publishing');
  await assert.rejects(restored.accept(f.task), /interrupted merge-back needs review/);
  assert.equal(f.admission.active.size, 0);
});
test('mocked target movement during checks fails before publishing', async t => {
  const f = simulated(t, async () => { f.state.target = 'external'; return { code: 0 }; });
  await assert.rejects(f.merger.accept(f.task), /target branch changed/);
  assert.equal(f.state.target, 'external'); assert.equal(f.merger.snapshot()[0].state, 'failed');
  assert.equal(f.state.calls.some(call => call.folder === f.task.repo && call.args.includes('merge')), false);
});
test('mocked dirty target keeps the target branch and its working files', async t => {
  const f = simulated(t, async () => { f.state.dirty = ' M owner.txt'; return { code: 0 }; });
  await assert.rejects(f.merger.accept(f.task), /target checkout has changes/);
  assert.equal(f.state.target, 'base'); assert.equal(f.state.dirty, ' M owner.txt');
});
test('mocked checks command requires an explicit checks runner', async t => {
  const f = simulated(t);
  await assert.rejects(f.merger.accept({ ...f.task, checks: 'npm test' }), /Provide a checks runner/);
  assert.equal(f.state.target, 'base');
});
