'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readJson, atomicJson } = require('../electron/storage.cjs');

function fixture(t) {
  const parent = path.resolve(__dirname, '..', 'test-data');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'storage-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(parent));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

test('damaged caches recover without inventing usage and preserve the exact original bytes', t => {
  const root = fixture(t), file = path.join(root, 'limits.json');
  const backups = [];
  for (const bytes of [Buffer.alloc(403), Buffer.from('[{"provider":"codex"'), Buffer.alloc(0)]) {
    fs.writeFileSync(file, bytes);
    let backup;
    assert.deepEqual(readJson(file, [], { recoverCorrupt: true, onRecovery: value => { backup = value; } }), []);
    assert.ok(backup.endsWith('.corrupt'));
    assert.equal(fs.existsSync(file), false);
    assert.deepEqual(fs.readFileSync(backup), bytes);
    backups.push(backup);
  }
  assert.equal(new Set(backups).size, 3);
  const refreshed = [{ provider: 'codex', windows: [{ usedPercent: 0, minutes: 300 }], observedAt: 123 }];
  atomicJson(file, refreshed);
  assert.deepEqual(readJson(file, [], { recoverCorrupt: true, onRecovery: () => assert.fail('Valid cache must not be recovered') }), refreshed);
  assert.equal(fs.readdirSync(root).length, 4, 'Fresh limits keep all corrupt originals');
});

test('missing caches do not report corruption or create files', t => {
  const root = fixture(t);
  assert.deepEqual(readJson(path.join(root, 'limits.json'), [], { recoverCorrupt: true, onRecovery: () => assert.fail('Missing is not corrupt') }), []);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('corrupt settings, credentials and ledgers remain strict and untouched', t => {
  const root = fixture(t), bytes = Buffer.alloc(16);
  for (const name of ['settings.json', 'vault.json', 'ledger.json']) {
    const file = path.join(root, name);
    fs.writeFileSync(file, bytes);
    assert.throws(() => readJson(file, {}), /The file was preserved/);
    assert.deepEqual(fs.readFileSync(file), bytes);
  }
  assert.equal(fs.readdirSync(root).length, 3);
});

test('cache access failures are not treated as corrupt or reset', t => {
  const root = fixture(t), file = path.join(root, 'limits.json');
  fs.writeFileSync(file, '[]');
  const read = fs.readFileSync;
  const denied = t.mock.method(fs, 'readFileSync', (target, ...args) => {
    if (target === file) throw Object.assign(new Error('Access denied'), { code: 'EACCES' });
    return read(target, ...args);
  });
  assert.throws(() => readJson(file, [], { recoverCorrupt: true, onRecovery: () => assert.fail('Must not recover access errors') }), /The file was preserved/);
  denied.mock.restore();
  assert.equal(fs.readFileSync(file, 'utf8'), '[]');
  assert.deepEqual(fs.readdirSync(root), ['limits.json']);
});

test('cache recovery stops if the damaged original cannot be preserved', t => {
  const root = fixture(t), file = path.join(root, 'limits.json'), bytes = Buffer.alloc(403);
  fs.writeFileSync(file, bytes);
  const rename = t.mock.method(fs, 'renameSync', () => { throw Object.assign(new Error('Access denied'), { code: 'EACCES' }); });
  assert.throws(() => readJson(file, [], { recoverCorrupt: true, onRecovery: () => assert.fail('No backup was made') }), /Cannot preserve damaged limits.json/);
  rename.mock.restore();
  assert.deepEqual(fs.readFileSync(file), bytes);
  assert.deepEqual(fs.readdirSync(root), ['limits.json']);
});

test('failed disk flush keeps the previous save and removes the unfinished temporary file', t => {
  const root = fixture(t), file = path.join(root, 'settings.json'), before = { restoreConsoles: true };
  atomicJson(file, before);
  const flush = t.mock.method(fs, 'fsyncSync', () => { throw Object.assign(new Error('Disk write failed'), { code: 'EIO' }); });
  assert.throws(() => atomicJson(file, { restoreConsoles: false }), /Disk write failed/);
  flush.mock.restore();
  assert.deepEqual(readJson(file, {}), before);
  assert.deepEqual(fs.readdirSync(root), ['settings.json']);
  atomicJson(file, { restoreConsoles: false });
  assert.deepEqual(readJson(file, {}), { restoreConsoles: false });
});
