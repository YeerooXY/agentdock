'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createHash } = require('node:crypto');
const { SourceSnapshots } = require('../electron/source-snapshots.cjs');
const sha = text => createHash('sha256').update(text).digest('hex');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-source-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const sources = new SourceSnapshots(path.join(root, 'data'), { extract: ({ text }) => ({ language: 'fixture', extractor: 'fixture:1', coverage: { complete: false }, symbols: [{ id: 'run', name: 'run', start: 0, end: text.length, contentHash: sha(text) }] }) });
  return { root, repo, sources };
}
test('pinned source reconstructs dirty and untracked UTF-8 exactly after live edits', t => {
  const { repo, sources } = fixture(t), text = 'function run(\u00e1) {\r\n return "\ud83c\udf1f";\r\n}\r\n'; fs.writeFileSync(path.join(repo, 'run.js'), text);
  const captured = sources.capture('project', repo);
  assert.equal(captured.files.length, 1); assert.equal(captured.coverage.dependencyResolution, 'unavailable');
  fs.writeFileSync(path.join(repo, 'run.js'), 'changed');
  const read = sources.read('project', { snapshotId: captured.snapshotId, path: 'run.js', symbolId: 'run' });
  assert.equal(read.text, text); assert.equal(read.contentHash, sha(text)); assert.equal(read.exact, true);
  assert.equal(read.endByte, Buffer.byteLength(text));
  assert.throws(() => sources.read('foreign', { snapshotId: captured.snapshotId, path: 'run.js' }));
  assert.equal(sources.resolve('project', { snapshotId: captured.snapshotId, query: 'run' }).total, 1);
});
test('source path policy blocks private files, traversal, unsupported roots and symlinks', t => {
  const { root, repo, sources } = fixture(t);
  fs.writeFileSync(path.join(repo, '.env'), 'TOKEN=private'); fs.writeFileSync(path.join(repo, 'main.js'), 'public');
  for (const file of ['../private', '.env', '/main.js', 'a/../main.js']) assert.throws(() => sources.capture('project', repo, { paths: [file] }));
  assert.throws(() => sources.capture('../escape', repo));
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'outside.js'), 'private');
  try { fs.symlinkSync(outside, path.join(repo, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return; throw error; }
  const captured = sources.capture('project', repo);
  assert.deepEqual(captured.files.map(f => f.path), ['main.js']);
  assert.throws(() => sources.capture('project', path.join(repo, 'linked')));
});
test('sensitive contents, invalid encoding and oversized files are excluded explicitly', t => {
  const { repo, sources } = fixture(t);
  fs.writeFileSync(path.join(repo, 'sensitive.js'), 'const apiKey = "abcdefghijklmnop";');
  fs.writeFileSync(path.join(repo, 'invalid.js'), Buffer.from([0xff, 0xfe]));
  fs.writeFileSync(path.join(repo, 'large.js'), 'a'.repeat(262145));
  const captured = sources.capture('project', repo);
  assert.equal(captured.files.length, 0); assert.equal(captured.coverage.complete, false); assert.equal(captured.coverage.omitted.length, 3);
  assert.ok(!fs.readFileSync(sources.file('project', captured.snapshotId), 'utf8').includes('abcdefghijklmnop'));
});
test('budget overflow returns no truncated exact source and snapshots detect tampering', t => {
  const { repo, sources } = fixture(t); const text = 'a'.repeat(3000); fs.writeFileSync(path.join(repo, 'main.js'), text);
  const captured = sources.capture('project', repo, { paths: ['main.js'] });
  assert.equal(captured.coverage.selectionOnly, true); assert.equal(captured.coverage.complete, false);
  const read = sources.read('project', { snapshotId: captured.snapshotId, path: 'main.js', maxBytes: 1024 });
  assert.equal(read.text, null); assert.equal(read.requiredBytes, 3000); assert.equal(read.complete, false);
  const file = sources.file('project', captured.snapshotId), saved = JSON.parse(fs.readFileSync(file)); saved.files[0].text = 'tampered'; fs.writeFileSync(file, JSON.stringify(saved));
  assert.throws(() => sources.load('project', captured.snapshotId), /integrity/);
});


test('BOM bytes round-trip and JSON/YAML credential literals are excluded', t => {
  const { repo, sources } = fixture(t), text = '\ufefffunction run() {}\r\n';
  fs.writeFileSync(path.join(repo, 'bom.js'), text);
  fs.writeFileSync(path.join(repo, 'app.config.json'), JSON.stringify({ password: 'longsecretvalue1' }));
  fs.writeFileSync(path.join(repo, 'app.yaml'), 'password: longsecretvalue1');
  const captured = sources.capture('project', repo);
  assert.deepEqual(captured.files.map(f => f.path), ['bom.js']);
  assert.equal(sources.read('project', { snapshotId: captured.snapshotId, path: 'bom.js' }).text, text);
  assert.equal(captured.coverage.omittedCount, 2);
});

test('existing immutable snapshots are reused and linked storage is rejected', t => {
  const { root, repo, sources } = fixture(t); fs.writeFileSync(path.join(repo, 'a.js'), 'source');
  const first = sources.capture('project', repo), second = sources.capture('project', repo); assert.equal(first.snapshotId, second.snapshotId);
  const target = sources.file('project', first.snapshotId); fs.unlinkSync(target);
  try { fs.symlinkSync(path.join(root, 'missing'), target); } catch (error) { if (error.code === 'EPERM') return; throw error; }
  assert.throws(() => sources.file('project', first.snapshotId), /Linked/);
});


test('explicit source selections work beyond inventory caps without weakening exclusions', t => {
  const { repo, sources } = fixture(t);
  fs.writeFileSync(path.join(repo, 'a.js'), 'first'); fs.writeFileSync(path.join(repo, 'z.js'), 'selected');
  const saved = sources.capture('project', repo, { paths: ['z.js'], inventoryBounds: { maxEntries: 1, maxDepth: 1 } });
  assert.equal(sources.read('project', { snapshotId: saved.snapshotId, path: 'z.js' }).text, 'selected');
  assert.equal(saved.coverage.selectionOnly, true); assert.equal(saved.coverage.complete, false);
  for (const denied of ['node_modules/pkg/code.js', '.env.js', 'src/credentials.json', '.build/code.js', '../outside.js', 'src/private/key.js']) assert.throws(() => sources.capture('project', repo, { paths: [denied] }), /excluded|relative/);
});
