'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { inventoryRepository } = require('../electron/repo-inventory.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (relative, text = '') => { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
  return { root, put };
}
test('metadata scan is stable, sorted, classified and never reads file contents', t => {
  const { root, put } = fixture(t);
  for (const file of ['src/run.py', 'tests/test_run.py', 'README.md', 'package.json', 'images/a.png', 'data/a.csv', 'unknown.xyz']) put(file, 'content');
  const read = t.mock.method(fs, 'readFileSync', () => { throw new Error('content read forbidden'); });
  const open = t.mock.method(fs, 'openSync', () => { throw new Error('file open forbidden'); });
  const rawRead = t.mock.method(fs, 'readSync', () => { throw new Error('raw read forbidden'); });
  const stream = t.mock.method(fs, 'createReadStream', () => { throw new Error('stream read forbidden'); });
  const first = inventoryRepository(root), second = inventoryRepository(root);
  for (const mock of [read, open, rawRead, stream]) mock.mock.restore();
  assert.deepEqual(first, second); assert.equal(first.coverage.complete, true);
  assert.deepEqual(first.counts, { source: 1, test: 1, docs: 1, config: 1, asset: 1, data: 1, other: 1 });
  assert.equal(first.contentHashed, false); assert.equal(first.sourceSnapshot, null);
  assert.ok(!JSON.stringify(first).includes(root)); assert.ok(first.files.every(x => !x.path.includes('\\')));
  const before = first.inventoryId; put('new.go'); assert.notEqual(inventoryRepository(root).inventoryId, before);
});
test('default exclusions include private names, caches and generated build directories', t => {
  const { root, put } = fixture(t);
  for (const file of ['.env', '.env.example', '.npmrc', '.netrc', '.git-credentials', '.pgpass', 'id_rsa', 'client_secret-test.json', '.kube/config', '.gnupg/pubring', 'private-data/foo.py', 'privateKey.json', 'secretsBackup.txt', 'credentials.json', 'secrets.txt', 'cert.key', 'node_modules/x.js', '.claude/a.json', 'Library/cache.json', '__pycache__/a.py', 'build-v2/x.cpp', '.wrangler/auth.json']) put(file);
  put('src/auth.py'); put('build-analysis.cjs');
  const result = inventoryRepository(root);
  assert.deepEqual(result.files.map(x => x.path), ['build-analysis.cjs', 'src/auth.py']); assert.ok(result.coverage.excluded >= 10);
  assert.ok(!JSON.stringify(result).includes('private-data'));
  assert.ok(result.coverage.excludedByRule['private-name'] > 0);
  assert.ok(result.coverage.excludedDirectories.some(item => item.path === 'Library'));
  assert.ok(!result.coverage.excludedDirectories.some(item => item.path.includes('.kube')));
});
test('entry and depth bounds report incomplete coverage', t => {
  const { root, put } = fixture(t);
  for (let i = 0; i < 8; i++) put(`f${i}.py`);
  put('a/b/c/d.py');
  const capped = inventoryRepository(root, { maxEntries: 3 });
  assert.equal(capped.coverage.examined, 3); assert.equal(capped.coverage.truncated, true); assert.equal(capped.coverage.complete, false);
  const shallow = inventoryRepository(root, { maxDepth: 1 });
  assert.equal(shallow.coverage.complete, false); assert.ok(shallow.coverage.reasons.includes('depth-limit'));
});
test('root links are rejected and nested links are skipped', t => {
  const { root, put } = fixture(t); put('real/a.py');
  fs.symlinkSync(path.join(root, 'real'), path.join(root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => inventoryRepository(path.join(root, 'link')), /root link/);
  const result = inventoryRepository(root);
  assert.equal(result.coverage.symlinks, 1); assert.equal(result.coverage.complete, false);
  assert.deepEqual(result.files.map(x => x.path), ['real/a.py']);
});
test('invalid roots and noninteger budgets fail with path-free errors', t => {
  const { root } = fixture(t);
  for (const value of ['relative', root + '\0', path.join(root, 'missing')]) assert.throws(() => inventoryRepository(value), error => !error.message.includes(root));
  for (const maxEntries of [0, 1.5, NaN, 20001]) assert.throws(() => inventoryRepository(root, { maxEntries }), /bounds/);
  for (const maxDepth of [0, 1.5, Infinity, 33]) assert.throws(() => inventoryRepository(root, { maxDepth }), /bounds/);
});
test('unreadable directory coverage is explicit without exposing paths', t => {
  const { root, put } = fixture(t); put('a.py');
  t.mock.method(fs, 'opendirSync', () => { throw new Error('mock access denial: ' + root); });
  const result = inventoryRepository(root);
  assert.equal(result.coverage.complete, false); assert.equal(result.coverage.unreadable, 1);
  assert.deepEqual(result.coverage.reasons, ['unreadable-directory']); assert.ok(!JSON.stringify(result).includes(root));
});
test('changing metadata is a coverage gap and scan handles close after read failures', t => {
  const { root, put } = fixture(t); put('a.py');
  const original = fs.lstatSync.bind(fs); let calls = 0;
  const stat = t.mock.method(fs, 'lstatSync', file => {
    const value = original(file);
    if (file === path.join(root, 'a.py') && ++calls === 2) return new Proxy(value, { get(target, key) { return key === 'mtimeMs' ? target.mtimeMs + 1 : Reflect.get(target, key); } });
    return value;
  });
  const changed = inventoryRepository(root); stat.mock.restore();
  assert.deepEqual(changed.files, []); assert.ok(changed.coverage.reasons.includes('changed-file'));
  let closed = false;
  t.mock.method(fs, 'opendirSync', () => ({ readSync() { throw new Error('mock read failure'); }, closeSync() { closed = true; } }));
  assert.equal(inventoryRepository(root).coverage.complete, false); assert.equal(closed, true);
});
test('an exactly filled entry budget is complete when directory EOF proves it', t => {
  const { root, put } = fixture(t); put('a.py'); put('b.py');
  const exact = inventoryRepository(root, { maxEntries: 2 });
  assert.equal(exact.coverage.complete, true); assert.equal(exact.coverage.truncated, false);
  const capped = inventoryRepository(root, { maxEntries: 1 });
  assert.equal(capped.coverage.complete, false); assert.equal(capped.coverage.lookaheadEntries, 1);
});
