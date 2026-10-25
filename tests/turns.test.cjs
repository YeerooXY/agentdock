'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { Turns, snapshot } = require('../electron/turns.cjs');
const { sameSnapshotFile } = require('../electron/capture-files.cjs');
const { Results } = require('../electron/results.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-turn-')), project = path.join(root, 'project'), store = path.join(root, 'dock'); fs.mkdirSync(project); fs.mkdirSync(store);
  execFileSync('git', ['init', '-q', '-b', 'feature/results', project], { windowsHide: true });
  const results = new Results(store, { trash: x => fs.promises.rm(x, { recursive: true, force: true }) });
  const sessions = new Map(['a','b'].map(id => [id, { id, consoleKey: id, name: 'Project ' + id, cwd: project, alive: true }]));
  const turns = new Turns(results, { enabled: true, getSession: id => sessions.get(id), getSecrets: () => ['a-long-private-value'] });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, project, results, sessions, turns, write: (file, value) => fs.writeFileSync(path.join(project, file), value) };
}
test('default turns keep requested outputs without collecting edits or changed images', async t => {
  const f = fixture(t), turns = new Turns(f.results, { getSession: id => f.sessions.get(id) });
  await turns.begin('a');
  assert.equal(turns.active.get('a').baseline, null);
  f.write('app.js', 'ordinary edit'); f.write('screen.png', 'routine image');
  await turns.finish('a');
  assert.equal(f.results.items.length, 0);
  const id = await turns.begin('a');
  const requested = f.results.add({ title: 'Requested findings', text: 'A requested research output.' }, turns.context('a'));
  await turns.finish('a');
  assert.equal(f.results.items.length, 1);
  assert.equal(f.results.items[0].id, requested.id);
  assert.equal(f.results.items[0].groupId, id);
  assert.equal(f.results.items[0].consoleKey, 'a');
  assert.equal(f.results.preview(requested.id).text, 'A requested research output.');
});

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

test('turn identity survives reassignment; following turns use the new project', async t => {
  const f = fixture(t), session = f.sessions.get('a'); session.projectId = 'dock';
  f.write('app.js', 'before'); await f.turns.begin('a');
  const other = path.join(f.root, 'learning'); fs.mkdirSync(other);
  Object.assign(session, { name: 'Learning application', projectId: 'learning', cwd: other });
  f.write('app.js', 'after'); await f.turns.finish('a');
  const saved = f.results.items[0];
  assert.equal(saved.project, f.project); assert.equal(saved.projectId, 'dock'); assert.equal(saved.consoleName, 'Project a');
  assert.equal(f.results.preview(saved.id).diff.changes[0].file, 'app.js');
  await f.turns.begin('a'); assert.equal(f.turns.context('a').projectId, 'learning');
  f.results.add({ text: 'explicit report' }, f.turns.context('a')); await f.turns.finish('a');
  assert.equal(f.results.items[0].projectId, 'learning'); assert.equal(f.results.items[0].consoleName, 'Learning application');
  assert.equal(f.results.items.length, 2, 'No empty code snapshot is generated');
});

test('a parent workspace does not capture changes or images in child repositories', async t => {
  const f = fixture(t); f.sessions.get('a').cwd = f.root;
  await f.turns.begin('a'); f.write('unrelated.js', 'another console'); f.write('screen.png', 'another project image');
  await f.turns.finish('a'); assert.equal(f.results.items.length, 0);
});

test('disabled auto-save never reads even an unavailable project folder', async t => {
  const f = fixture(t); f.turns.setEnabled(false);
  f.sessions.get('a').cwd = path.join(f.root, 'not-present');
  await f.turns.begin('a');
  assert.equal(f.turns.active.get('a').error, '');
  await f.turns.finish('a');
  assert.equal(f.results.items.length, 0);
});

test('workspace capture excludes non-Git sibling projects and generated dependency metadata', async t => {
  const f = fixture(t);
  const sibling = path.join(f.root, 'ice-age-village-research');
  fs.mkdirSync(path.join(sibling, '.deps', 'package.dist-info'), { recursive: true });
  const metadata = path.join(sibling, '.deps', 'package.dist-info', 'INSTALLER');
  fs.writeFileSync(metadata, 'pip');
  const source = path.join(sibling, 'research.md'); fs.writeFileSync(source, 'before');
  f.sessions.get('a').cwd = f.root;
  await f.turns.begin('a');
  fs.writeFileSync(metadata, 'changed metadata'); fs.writeFileSync(source, 'another chat');
  await f.turns.finish('a');
  assert.equal(f.results.items.length, 0, 'Parent workspace must not attribute sibling edits');
  f.sessions.get('a').cwd = sibling;
  await f.turns.begin('a');
  fs.writeFileSync(metadata, 'changed again'); fs.writeFileSync(source, 'this chat');
  await f.turns.finish('a');
  assert.deepEqual(f.results.preview(f.results.items[0].id).diff.changes.map(x => x.file), ['research.md']);
  assert.equal(fs.readFileSync(metadata, 'utf8'), 'changed again', 'Capture never edits source files');
});

test('snapshot budget changes do not report untouched files as modified', async t => {
  const f = fixture(t); f.write('a.txt', 'one'); f.write('b.txt', 'two');
  const before = await snapshot(f.project, { maxBytes: 3 });
  const after = await snapshot(f.project, { maxBytes: 6 });
  assert.equal(before.files.get('b.txt').signature, null);
  assert.ok(after.files.get('b.txt').signature);
  assert.equal(sameSnapshotFile(before.files.get('b.txt'), after.files.get('b.txt')), true);
  f.write('b.txt', 'changed');
  const changed = await snapshot(f.project, { maxBytes: 3 });
  assert.equal(sameSnapshotFile(after.files.get('b.txt'), changed.files.get('b.txt')), false);
  assert.equal(sameSnapshotFile(undefined, changed.files.get('b.txt')), false, 'A new omitted file is still added');
});
