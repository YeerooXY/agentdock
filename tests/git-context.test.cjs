'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, execFile } = require('node:child_process');
const { gitInfo } = require('../electron/git-context.cjs');
const { Turns } = require('../electron/turns.cjs');
const { Results } = require('../electron/results.cjs');

function fixture(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dock-revision-'))); // Git reports the long path; CI temp can be an 8.3 short name
  const project = path.join(root, 'repo'), store = path.join(root, 'store');
  fs.mkdirSync(project); fs.mkdirSync(store);
  const git = (...args) => execFileSync('git', ['-C', project, ...args], { windowsHide: true }).toString().trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Dock tests'); git('config', 'user.email', 'test@example.invalid');
  const write = text => fs.writeFileSync(path.join(project, 'app.txt'), text);
  const commit = () => { git('add', 'app.txt'); git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  const results = new Results(store), session = { id: 'console', cwd: project, name: 'Paddock', consoleKey: 'slot', alive: true };
  const turns = new Turns({ enabled: true, getSession: () => session });
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
