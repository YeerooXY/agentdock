'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Worktrees, cleanWorktree } = require('../electron/worktrees.cjs');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=test@example.invalid', '-c', 'user.name=Paddock test', '-c', 'commit.gpgsign=false', '-C', cwd, ...args], { encoding: 'utf8', windowsHide: true }).trim();

test('a console worktree gets its own branch and folder, and is removed only when clean', async t => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dock-worktree-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  const repo = path.join(root, 'repo'), data = path.join(root, 'data');
  fs.mkdirSync(path.join(repo, 'site'), { recursive: true }); fs.mkdirSync(data);
  git(repo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'site', 'index.html'), 'hello');
  git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'first');
  const worktrees = new Worktrees(data);

  await assert.rejects(worktrees.create(data, 'Not a repo'), /not in a Git repository/);
  const wt = await worktrees.create(path.join(repo, 'site'), 'Header redesign!');
  assert.match(wt.branch, /^paddock\/header-redesign-[a-f0-9]{6}$/);
  assert.ok(wt.path.startsWith(path.join(fs.realpathSync.native(data), 'worktrees') + path.sep), 'worktrees live in Paddock data, not the repository');
  assert.equal(wt.cwd, path.join(wt.path, 'site'), 'the console starts in the same subfolder');
  assert.equal(fs.readFileSync(path.join(wt.cwd, 'index.html'), 'utf8'), 'hello');
  assert.equal(git(wt.path, 'branch', '--show-current'), wt.branch);
  assert.equal(git(repo, 'branch', '--show-current'), 'main', 'the main checkout is unchanged');
  assert.deepEqual(cleanWorktree(wt), { repository: wt.repository, path: wt.path, branch: wt.branch, base: wt.base });

  fs.writeFileSync(path.join(wt.cwd, 'index.html'), 'changed');
  assert.deepEqual(await worktrees.status(wt), { dirty: true, ahead: 0 });
  await assert.rejects(worktrees.remove(wt), /uncommitted changes/);
  assert.ok(fs.existsSync(wt.path));

  git(wt.path, 'commit', '-q', '-am', 'agent change');
  assert.deepEqual(await worktrees.status(wt), { dirty: false, ahead: 1 });
  await worktrees.remove(wt);
  assert.equal(fs.existsSync(wt.path), false);
  assert.equal(git(repo, 'log', '-1', '--format=%s', wt.branch), 'agent change', 'the branch keeps its commits');

  await assert.rejects(worktrees.remove({ ...wt, path: repo }), /not managed by Paddock/);
  assert.equal(cleanWorktree({ ...wt, branch: 'main' }), null);
});

test('a console keeps its worktree in the saved layout; malformed values are dropped', async t => {
  const { Sessions } = require('../electron/sessions.cjs');
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dock-worktree-save-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  const sessions = new Sessions(root, { pty: { spawn() { return { onData() {}, onExit() {}, kill() {} }; } }, findProgram: () => null });
  const worktree = { repository: root, path: path.join(root, 'worktrees', 'repo', 'a-123abc'), branch: 'paddock/a-123abc', base: 'b'.repeat(40) };
  const kept = await sessions.create({ provider: 'shell', cwd: root, worktree: { ...worktree, extra: 'dropped' } });
  const dropped = await sessions.create({ provider: 'shell', cwd: root, worktree: { ...worktree, branch: 'main' } });
  assert.deepEqual(kept.worktree, worktree);
  assert.equal(dropped.worktree, undefined);
  assert.deepEqual(sessions.savedConsoles().find(x => x.slot === kept.slot).worktree, worktree);
});
