'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { gitInfo, resultGitContext } = require('../electron/git-context.cjs');
const { Turns } = require('../electron/turns.cjs');
const { Results } = require('../electron/results.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-revision-'));
  const project = path.join(root, 'repo'), store = path.join(root, 'store');
  fs.mkdirSync(project); fs.mkdirSync(store);
  const git = (...args) => execFileSync('git', ['-C', project, ...args], { windowsHide: true }).toString().trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Dock tests'); git('config', 'user.email', 'test@example.invalid');
  const write = text => fs.writeFileSync(path.join(project, 'app.txt'), text);
  const commit = () => { git('add', 'app.txt'); git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  const results = new Results(store), session = { id: 'console', cwd: project, name: 'Paddock', consoleKey: 'slot', alive: true };
  const turns = new Turns(results, { enabled: true, getSession: () => session });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, project, store, git, write, commit, results, session, turns };
}

test('records an exact branch/commit pair, dirty changes, unborn branches and detached HEAD without creating branches', async t => {
  const f = fixture(t);
  const unborn = await gitInfo(f.project); assert.equal(unborn.branch, 'main'); assert.equal(unborn.commit, null); assert.equal(unborn.unborn, true);
  f.write('first'); const commit = f.commit();
  const indexBefore = fs.readFileSync(path.join(f.project, '.git/index'));
  assert.deepEqual(await gitInfo(f.project), { branch: 'main', commit, detached: false, repository: fs.realpathSync(f.project), dirty: false });
  assert.deepEqual(fs.readFileSync(path.join(f.project, '.git/index')), indexBefore);
  f.write('second'); assert.equal((await gitInfo(f.project)).dirty, true);
  f.git('checkout', '--detach', '-q');
  const detached = await gitInfo(f.project); assert.equal(detached.branch, null); assert.equal(detached.commit, commit); assert.equal(detached.detached, true);
  assert.equal(f.git('for-each-ref', '--format=%(refname:short)', 'refs/heads'), 'main');
  assert.equal(await gitInfo(f.root), null);
});

test('turn keeps the captured and finished commits after a later commit and restart', async t => {
  const f = fixture(t); f.write('before'); const before = f.commit();
  const id = await f.turns.begin('console');
  const saved = f.results.add({ text: 'review', title: 'Report' }, await resultGitContext({}, f.turns.context('console'), f.store));
  f.write('after'); const after = f.commit(); await f.turns.finish('console');
  const code = f.results.items.find(x => x.kind === 'code');
  assert.equal(f.results.preview(code.id).diff.git.before.commit, before);
  assert.equal(f.results.preview(code.id).diff.git.after.commit, after);
  f.write('later'); f.commit();
  const reloaded = new Results(f.store).list();
  assert.equal(reloaded.find(x => x.id === saved.id).git.commit, before);
  assert.ok(reloaded.every(x => x.groupId === id && x.gitEnd.branch === 'main' && x.gitEnd.commit === after));
  assert.equal(f.git('for-each-ref', '--format=%(refname:short)', 'refs/heads'), 'main');
});

test('manual saves from a parent folder find only the source repository, including when automatic capture is disabled', async t => {
  const f = fixture(t); f.write('before'); const before = f.commit();
  f.session.cwd = f.root; f.turns.setEnabled(false); await f.turns.begin('console');
  const input = { file: path.join(f.project, 'app.txt'), title: 'Saved file' };
  const context = await resultGitContext(input, f.turns.context('console'), f.store);
  assert.equal(context.git.commit, before); assert.equal(context.project, f.root);
  f.results.add(input, context);
  const unbound = f.results.add({ text: 'parent notes' }, await resultGitContext({}, f.turns.context('console'), f.store));
  f.write('after'); const after = f.commit(); await f.turns.finish('console');
  assert.equal(f.results.items.find(x => x.id !== unbound.id).gitEnd.commit, after);
  assert.equal(f.results.items.find(x => x.id === unbound.id).git, undefined);
  assert.equal(f.results.items.length, 2, 'No automatic diff was created');
  await assert.rejects(resultGitContext({ file: path.join(f.store, 'results/index.json') }, context, f.store), /project/);
  await assert.rejects(resultGitContext(input, { project: f.store }, f.store), /project/);
});

test('legacy code reports recover recorded revisions without consulting today’s HEAD', t => {
  const f = fixture(t); f.write('before'); const commit = f.commit();
  const git = { branch: 'main', commit, dirty: true };
  const saved = f.results.add({ text: JSON.stringify({ git: { before: git, after: git }, changes: [] }), ext: '.json', kind: 'code' });
  const index = JSON.parse(fs.readFileSync(f.results.file)); delete index[0].git; delete index[0].gitEnd;
  fs.writeFileSync(f.results.file, JSON.stringify(index));
  f.write('later'); f.commit();
  const recovered = new Results(f.store).list().find(x => x.id === saved.id);
  assert.equal(recovered.git.commit, commit); assert.equal(recovered.gitEnd.commit, commit);
});
