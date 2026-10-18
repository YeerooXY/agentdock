'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { Turns } = require('../electron/turns.cjs');
const { Results } = require('../electron/results.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-turn-')), project = path.join(root, 'project'), store = path.join(root, 'dock'); fs.mkdirSync(project); fs.mkdirSync(store);
  execFileSync('git', ['init', '-q', '-b', 'feature/results', project], { windowsHide: true });
  const results = new Results(store, { trash: x => fs.promises.rm(x, { recursive: true, force: true }) });
  const sessions = new Map(['a','b'].map(id => [id, { id, consoleKey: id, name: 'Project ' + id, cwd: project, alive: true }]));
  const turns = new Turns(results, { getSession: id => sessions.get(id), getSecrets: () => ['a-long-private-value'] });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, project, results, sessions, turns, write: (file, value) => fs.writeFileSync(path.join(project, file), value) };
}
test('Results groups turn diffs with reports and excludes pre-existing edits and credentials', async t => {
  const f = fixture(t); f.write('existing.js', 'already dirty\n'); f.write('deleted.js', 'remove me\n'); f.write('.env', 'KEY=secret');
  const id = await f.turns.begin('a'); assert.equal(await f.turns.begin('a'), id);
  f.write('existing.js', 'already dirty\nnew change\n'); f.write('new.js', 'a-long-private-value\n'); f.write('.env', 'KEY=changed'); fs.unlinkSync(path.join(f.project, 'deleted.js'));
  f.results.add({ title: 'Test report', text: 'passed', kind: 'test', groupId: 'agent-chosen-batch' }, f.turns.context('a'));
  await f.turns.finish('a'); await f.turns.finish('a');
  assert.equal(f.results.items.length, 2); assert.equal(f.results.unreadGroups(), 1); assert.ok(f.results.items.every(x => x.groupId === id && x.consoleName === 'Project a'));
  const code = f.results.items.find(x => x.kind === 'code'), report = f.results.preview(code.id).diff;
  assert.equal(code.git.branch, 'feature/results'); assert.equal(report.git.before.branch, 'feature/results'); assert.equal(report.git.after.branch, 'feature/results');
  assert.ok(f.results.items.every(x => x.git.branch === 'feature/results'));
  assert.deepEqual(report.changes.map(x => x.file).sort(), ['deleted.js','existing.js','new.js']);
  assert.ok(report.changes.find(x => x.file === 'existing.js').patch.includes('+new change'));
  assert.ok(!report.changes.find(x => x.file === 'existing.js').patch.includes('+already dirty'));
  assert.ok(!JSON.stringify(report).includes('a-long-private-value'));
  await f.results.remove(f.results.items.map(x => x.id)); assert.equal(f.results.items.length, 0); assert.ok(fs.existsSync(path.join(f.project, 'new.js')));
});

test('turn reports retain starting and ending Git branches when the branch changes', async t => {
  const f = fixture(t); f.write('app.js', 'before'); await f.turns.begin('a');
  execFileSync('git', ['-C', f.project, 'symbolic-ref', 'HEAD', 'refs/heads/fix/restore'], { windowsHide: true });
  f.write('app.js', 'after'); await f.turns.finish('a');
  const report = f.results.preview(f.results.items[0].id).diff;
  assert.equal(report.git.before.branch, 'feature/results'); assert.equal(report.git.after.branch, 'fix/restore');
  assert.ok(report.notes.some(x => x.includes('branch changed')));
});
test('concurrent consoles mark folder attribution as overlapping; idle files do not become a new diff', async t => {
  const f = fixture(t); f.write('app.txt', 'before'); await Promise.all([f.turns.begin('a'), f.turns.begin('b')]); f.write('app.txt', 'after');
  await f.turns.finish('a'); await f.turns.finish('b');
  assert.ok(f.results.items.every(x => f.results.preview(x.id).diff.attribution === 'overlapping-folder-activity'));
  const count = f.results.items.length; await f.turns.begin('a'); await f.turns.finish('a'); assert.equal(f.results.items.length, count);
});

test('disabled auto-save skips file capture but keeps explicitly saved files and turn grouping', async t => {
  const f = fixture(t); f.turns.setEnabled(false);
  const finished = []; f.turns.on('finished', event => finished.push(event));
  const id = await f.turns.begin('a');
  assert.equal(f.turns.active.get('a').baseline, null);
  assert.equal(f.turns.active.get('a').capture, false);
  f.write('new.js', 'not automatically captured');
  f.results.add({ title: 'Requested report', text: 'A manually saved report' }, f.turns.context('a'));
  await f.turns.finish('a');
  assert.equal(f.results.items.length, 1);
  assert.equal(f.results.items[0].title, 'Requested report');
  assert.equal(f.results.items[0].groupId, id);
  assert.equal(f.turns.active.size, 0);
  assert.deepEqual(finished, [{ owner: 'a', id }]);
});

test('turning auto-save off discards current captures; enabling starts again on the next turn', async t => {
  const f = fixture(t); f.write('app.js', 'original');
  await f.turns.begin('a');
  assert.ok(f.turns.active.get('a').baseline);
  f.turns.setEnabled(false);
  assert.equal(f.turns.active.get('a').baseline, undefined);
  f.write('app.js', 'changed while off');
  f.turns.setEnabled(true);
  await f.turns.finish('a');
  assert.equal(f.results.items.length, 0);
  await f.turns.begin('a'); f.write('app.js', 'changed after re-enabling');
  await f.turns.finish('a');
  assert.equal(f.results.items.length, 1);
  const patch = f.results.preview(f.results.items[0].id).diff.changes[0].patch;
  assert.ok(patch.includes('-changed while off'));
  assert.ok(patch.includes('+changed after re-enabling'));
});

test('disabled auto-save never reads even an unavailable project folder', async t => {
  const f = fixture(t); f.turns.setEnabled(false);
  f.sessions.get('a').cwd = path.join(f.root, 'not-present');
  await f.turns.begin('a');
  assert.equal(f.turns.active.get('a').error, '');
  await f.turns.finish('a');
  assert.equal(f.results.items.length, 0);
});
