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
  const turns = new Turns({ enabled: true, getSession: id => sessions.get(id), getSecrets: () => ['a-long-private-value'] });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, project, results, sessions, turns, write: (file, value) => fs.writeFileSync(path.join(project, file), value) };
}
test('a parent workspace does not capture changes or images in child repositories', async t => {
  const f = fixture(t); f.sessions.get('a').cwd = f.root;
  await f.turns.begin('a'); f.write('unrelated.js', 'another console'); f.write('screen.png', 'another project image');
  await f.turns.finish('a'); assert.equal(f.results.items.length, 0);
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
  const captured = await snapshot(sibling);
  assert.deepEqual([...captured.files.keys()], ['research.md']);
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
