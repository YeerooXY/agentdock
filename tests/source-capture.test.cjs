'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { captureInBackground } = require('../electron/source-capture.cjs');
const { SourceSnapshots } = require('../electron/source-snapshots.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-capture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'), data = path.join(root, 'data');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'main.cjs'), 'exports.sum = (a, b) => a + b;\n');
  return { repo, data };
}

test('background source capture preserves immutable content and lets desktop events run', async t => {
  const { repo, data } = fixture(t);
  let yielded = false, authorized = 0;
  const pending = captureInBackground(data, 'project', repo, { beforePersist() { authorized++; assert.equal(yielded, true); } });
  setImmediate(() => { yielded = true; });
  const captured = await pending;
  assert.equal(authorized, 1);
  const sources = new SourceSnapshots(data), sync = sources.capture('project', repo);
  assert.equal(captured.snapshotId, sync.snapshotId);
  fs.writeFileSync(path.join(repo, 'main.cjs'), 'changed');
  assert.equal(sources.read('project', { snapshotId: captured.snapshotId, path: 'main.cjs' }).text, 'exports.sum = (a, b) => a + b;\n');
});

test('revoked authorization prevents background snapshot publication', async t => {
  const { repo, data } = fixture(t);
  await assert.rejects(captureInBackground(data, 'project', repo, { beforePersist() { throw Error('Knowledge is off.'); } }), /Knowledge is off/);
  assert.equal(fs.existsSync(path.join(data, 'knowledge-sources')), false);
});

test('background failures return without waiting for authorization', async t => {
  const { repo, data } = fixture(t);
  await assert.rejects(captureInBackground(data, '../invalid', repo), /Invalid source capture/);
});
