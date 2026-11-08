'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { KnowledgeQueue } = require('../electron/knowledge-queue.cjs');
const { atomicJson } = require('../electron/storage.cjs');

function fixture(t) {
  const parent = path.resolve(__dirname, '..', 'test-data');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'kq-'));
  t.after(() => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  });
  return root;
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);

function sampleRecord(overrides = {}) {
  return {
    operationId: 'op-' + crypto.randomUUID(),
    taskId: 'task-1',
    projectId: 'proj-1',
    rootId: HASH_A,
    baseSnapshot: HASH_B,
    targetSnapshot: HASH_C,
    diffHash: HASH_D,
    touchedPaths: ['src/index.js'],
    ...overrides
  };
}

test('never create store on read or empty claim', t => {
  const root = fixture(t);
  const queue = new KnowledgeQueue(root);
  const storeDir = path.join(root, 'knowledge-queue');

  assert.deepEqual(queue.state('proj-new'), []);
  assert.deepEqual(queue.dirty('proj-new'), []);
  assert.equal(queue.claim('proj-new'), null);
  assert.equal(fs.existsSync(storeDir), false);

  queue.enqueue(sampleRecord({ projectId: 'proj-1' }));
  const claimed = queue.claim('proj-1');
  assert.ok(claimed);
  queue.finish('proj-1', claimed.id, { state: 'committed' });

  const statBefore = fs.statSync(path.join(storeDir, 'proj-1.json'));
  assert.equal(queue.claim('proj-1'), null);
  const statAfter = fs.statSync(path.join(storeDir, 'proj-1.json'));
  assert.equal(statBefore.mtimeMs, statAfter.mtimeMs);
});

test('idempotency and conflicting duplicate rejection', t => {
  const root = fixture(t);
  const queue = new KnowledgeQueue(root);
  const rec = sampleRecord({ operationId: 'op-fixed', projectId: 'proj-1' });

  const first = queue.enqueue(rec);
  assert.equal(first.operationId, 'op-fixed');
  assert.equal(queue.state('proj-1').length, 1);

  // Identical payload: idempotent
  const second = queue.enqueue({ ...rec });
  assert.equal(second.operationId, 'op-fixed');
  assert.equal(queue.state('proj-1').length, 1);

  // Conflicting duplicate fields
  assert.throws(() => queue.enqueue({ ...rec, taskId: 'task-other' }), /Conflicting duplicate operationId/);
  assert.throws(() => queue.enqueue({ ...rec, rootId: HASH_B }), /Conflicting duplicate operationId/);
  assert.throws(() => queue.enqueue({ ...rec, baseSnapshot: HASH_A }), /Conflicting duplicate operationId/);
  assert.throws(() => queue.enqueue({ ...rec, targetSnapshot: HASH_D }), /Conflicting duplicate operationId/);
  assert.throws(() => queue.enqueue({ ...rec, diffHash: HASH_A }), /Conflicting duplicate operationId/);
  assert.throws(() => queue.enqueue({ ...rec, touchedPaths: ['src/other.js'] }), /Conflicting duplicate operationId/);
  assert.throws(() => queue.enqueue({ ...rec, touchedPaths: ['src/index.js', 'src/second.js'] }), /Conflicting duplicate operationId/);

  assert.equal(queue.state('proj-1').length, 1);
});

test('foreign paths and malformed fields rejection', t => {
  const root = fixture(t);
  const queue = new KnowledgeQueue(root);

  // Path traversal and absolute paths
  assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: ['../secret.txt'] })), /Invalid touchedPath/);
  assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: ['foo/../../secret.txt'] })), /Invalid touchedPath/);
  assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: ['..'] })), /Invalid touchedPath/);
  assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: ['/etc/passwd'] })), /Invalid touchedPath/);
  assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: ['C:/secret.txt'] })), /Invalid touchedPath/);
  assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: ['C:\\secret.txt'] })), /Invalid touchedPath/);
  assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: ['foo\\bar.txt'] })), /Invalid touchedPath/);
  assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: [''] })), /Invalid touchedPath/);
  assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: ['foo\0bar.txt'] })), /Invalid touchedPath/);
  assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: 'not-an-array' })), /touchedPaths must be an array/);

  // Over limit touched paths
  const overPaths = Array.from({ length: 257 }, (_, i) => `src/file${i}.js`);
  assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: overPaths })), /at most 256 paths/);

  // Unknown or missing fields
  assert.throws(() => queue.enqueue({ ...sampleRecord(), extraProp: 123 }), /unknown or missing fields/);
  const missingField = sampleRecord();
  delete missingField.diffHash;
  assert.throws(() => queue.enqueue(missingField), /unknown or missing fields/);

  // Malformed IDs and hashes
  assert.throws(() => queue.enqueue(sampleRecord({ operationId: 'bad id with spaces' })), /Invalid ID field/);
  assert.throws(() => queue.enqueue(sampleRecord({ rootId: 'short-hash' })), /rootId must be a valid SHA256/);
  assert.throws(() => queue.enqueue(sampleRecord({ rootId: null })), /rootId must be a valid SHA256/);
  assert.throws(() => queue.enqueue(sampleRecord({ baseSnapshot: 'not-sha256' })), /Invalid baseSnapshot/);
  assert.throws(() => queue.enqueue(sampleRecord({ targetSnapshot: 'not-sha256' })), /Invalid targetSnapshot/);
  assert.throws(() => queue.enqueue(sampleRecord({ diffHash: 'not-sha256' })), /Invalid diffHash/);

  // Null is allowed for baseSnapshot, targetSnapshot, and diffHash
  assert.doesNotThrow(() => queue.enqueue(sampleRecord({ baseSnapshot: null, targetSnapshot: null, diffHash: null })));
});

test('coalescing roots and limits', t => {
  const root = fixture(t);
  const queue = new KnowledgeQueue(root);
  const proj = 'proj-coalesce';

  // Coalescing roots
  const rA1 = sampleRecord({ projectId: proj, rootId: HASH_A, baseSnapshot: HASH_B, targetSnapshot: HASH_C, touchedPaths: ['src/a.js'] });
  const rB1 = sampleRecord({ projectId: proj, rootId: HASH_B, baseSnapshot: HASH_A, targetSnapshot: HASH_C, touchedPaths: ['src/b.js'] });
  const rA2 = sampleRecord({ projectId: proj, rootId: HASH_A, baseSnapshot: HASH_C, targetSnapshot: HASH_D, touchedPaths: ['src/a.js', 'src/c.js'] });
  const rNull = sampleRecord({ projectId: proj, rootId: HASH_A, baseSnapshot: HASH_D, targetSnapshot: null, touchedPaths: ['src/d.js'] });

  queue.enqueue(rA1);
  queue.enqueue(rB1);
  queue.enqueue(rA2);
  queue.enqueue(rNull);

  // First claim should take rA1 and rA2 (same rootId HASH_A), skipping rB1 and ignoring rNull (targetSnapshot null)
  const batch1 = queue.claim(proj);
  assert.ok(batch1);
  assert.equal(batch1.rootId, HASH_A);
  assert.deepEqual(batch1.operationIds, [rA1.operationId, rA2.operationId]);
  assert.equal(batch1.baseSnapshot, HASH_B);
  assert.equal(batch1.targetSnapshot, HASH_D);
  assert.deepEqual(batch1.touchedPaths, ['src/a.js', 'src/c.js']);

  // Second claim should take rB1 (rootId HASH_B)
  const batch2 = queue.claim(proj);
  assert.ok(batch2);
  assert.equal(batch2.rootId, HASH_B);
  assert.deepEqual(batch2.operationIds, [rB1.operationId]);

  // Third claim: only rNull remains, but targetSnapshot is null -> returns null
  assert.equal(queue.claim(proj), null);

  // Limit check: up to 16 records
  const proj16 = 'proj-16';
  for (let i = 0; i < 20; i++) {
    queue.enqueue(sampleRecord({ projectId: proj16, rootId: HASH_A, touchedPaths: [`src/f${i}.js`] }));
  }
  const claim16 = queue.claim(proj16);
  assert.equal(claim16.operationIds.length, 16);
  const claimRest = queue.claim(proj16);
  assert.equal(claimRest.operationIds.length, 4);

  // Limit check: max 256 touched paths stop adding records that would exceed
  const projPaths = 'proj-paths';
  const p1 = Array.from({ length: 150 }, (_, i) => `src/batch1_${i}.js`);
  const p2 = Array.from({ length: 100 }, (_, i) => `src/batch2_${i}.js`);
  const p3 = Array.from({ length: 20 }, (_, i) => `src/batch3_${i}.js`); // 150 + 100 + 20 = 270 > 256

  const recP1 = queue.enqueue(sampleRecord({ projectId: projPaths, touchedPaths: p1 }));
  const recP2 = queue.enqueue(sampleRecord({ projectId: projPaths, touchedPaths: p2 }));
  const recP3 = queue.enqueue(sampleRecord({ projectId: projPaths, touchedPaths: p3 }));

  const claimPaths = queue.claim(projPaths);
  assert.equal(claimPaths.operationIds.length, 2);
  assert.deepEqual(claimPaths.operationIds, [recP1.operationId, recP2.operationId]);
  assert.equal(claimPaths.touchedPaths.length, 250);

  const claimPaths2 = queue.claim(projPaths);
  assert.equal(claimPaths2.operationIds.length, 1);
  assert.deepEqual(claimPaths2.operationIds, [recP3.operationId]);
});

test('crash and restart uncertainty without replaying inference', t => {
  const root = fixture(t);
  const queue1 = new KnowledgeQueue(root);
  const proj = 'proj-restart';

  queue1.enqueue(sampleRecord({ projectId: proj, operationId: 'op-1' }));
  queue1.enqueue(sampleRecord({ projectId: proj, operationId: 'op-2' }));
  queue1.enqueue(sampleRecord({ projectId: proj, operationId: 'op-3' }));

  const batch = queue1.claim(proj);
  assert.ok(batch);
  assert.equal(queue1.state(proj).every(r => r.status === 'running'), true);

  // Simulate process restart with fresh KnowledgeQueue instance
  const queue2 = new KnowledgeQueue(root);

  // On first load, running records become uncertain
  const records = queue2.state(proj);
  assert.equal(records.length, 3);
  for (const r of records) {
    assert.equal(r.status, 'uncertain');
    assert.equal(r.state, 'uncertain');
    assert.equal(r.reason, 'interrupted');
  }

  // Never replay inference
  assert.equal(queue2.claim(proj), null);

  // All 3 records remain dirty (not committed)
  assert.equal(queue2.dirty(proj).length, 3);

  // Enqueue new record and verify only the new record is claimed
  queue2.enqueue(sampleRecord({ projectId: proj, operationId: 'op-4' }));
  const newBatch = queue2.claim(proj);
  assert.ok(newBatch);
  assert.deepEqual(newBatch.operationIds, ['op-4']);
});

test('failed atomic writes preserve records', t => {
  const root = fixture(t);
  const queue = new KnowledgeQueue(root);
  const proj = 'proj-atomic';

  const r1 = queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-safe' }));
  assert.equal(queue.state(proj).length, 1);

  // Simulate write failure on enqueue
  const origSync = fs.fsyncSync;
  const syncMock = t.mock.method(fs, 'fsyncSync', () => {
    throw Object.assign(new Error('Disk failure'), { code: 'EIO' });
  });

  assert.throws(() => queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-fail' })), /Disk failure/);
  syncMock.mock.restore();

  // Preserved in memory and on disk
  assert.equal(queue.state(proj).length, 1);
  assert.equal(queue.state(proj)[0].operationId, 'op-safe');

  const reloaded = new KnowledgeQueue(root);
  assert.equal(reloaded.state(proj).length, 1);
  assert.equal(reloaded.state(proj)[0].operationId, 'op-safe');

  // Simulate write failure on claim
  const claimMock = t.mock.method(fs, 'fsyncSync', () => {
    throw Object.assign(new Error('Disk failure on claim'), { code: 'EIO' });
  });
  assert.throws(() => queue.claim(proj), /Disk failure on claim/);
  claimMock.mock.restore();

  // Record is still pending (not stuck in running)
  assert.equal(queue.state(proj)[0].status, 'pending');

  // Claim properly
  const claimed = queue.claim(proj);
  assert.ok(claimed);
  assert.equal(queue.state(proj)[0].status, 'running');

  // Simulate write failure on finish
  const finishMock = t.mock.method(fs, 'fsyncSync', () => {
    throw Object.assign(new Error('Disk failure on finish'), { code: 'EIO' });
  });
  assert.throws(() => queue.finish(proj, claimed.id, { state: 'committed' }), /Disk failure on finish/);
  finishMock.mock.restore();

  // Record is still running
  assert.equal(queue.state(proj)[0].status, 'running');

  // Complete finish successfully
  queue.finish(proj, claimed.id, { state: 'committed' });
  assert.equal(queue.state(proj)[0].status, 'committed');
  assert.deepEqual(queue.dirty(proj), []);
});

test('capacity 1000 records fails without dropping receipts', t => {
  const root = fixture(t);
  const proj = 'proj-cap';
  const file = path.join(root, 'knowledge-queue', `${proj}.json`);

  // Create 1000 records directly in storage
  const initialRecords = [];
  for (let i = 0; i < 1000; i++) {
    initialRecords.push({
      operationId: `op-${i}`,
      taskId: 'task-1',
      projectId: proj,
      rootId: HASH_A,
      baseSnapshot: HASH_B,
      targetSnapshot: HASH_C,
      diffHash: HASH_D,
      touchedPaths: [`src/f${i}.js`],
      status: i === 0 ? 'committed' : 'pending',
      state: i === 0 ? 'committed' : 'pending',
      batchId: i === 0 ? 'batch-0' : null,
      receipt: i === 0 ? { token: 'valid-receipt-proof' } : undefined,
      enqueuedAt: 1000 + i
    });
  }
  atomicJson(file, initialRecords);

  const queue = new KnowledgeQueue(root);
  assert.equal(queue.state(proj).length, 1000);

  // Attempting to add 1001st record must fail
  assert.throws(() => queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-1000' })), /Queue capacity reached/);

  // State still has 1000 records and receipt is preserved
  const recordsAfter = queue.state(proj);
  assert.equal(recordsAfter.length, 1000);
  assert.deepEqual(recordsAfter[0].receipt, { token: 'valid-receipt-proof' });

  // Idempotent re-enqueue of existing record does not throw even at capacity
  const existingRecord = {
    operationId: 'op-0',
    taskId: 'task-1',
    projectId: proj,
    rootId: HASH_A,
    baseSnapshot: HASH_B,
    targetSnapshot: HASH_C,
    diffHash: HASH_D,
    touchedPaths: ['src/f0.js']
  };
  assert.doesNotThrow(() => queue.enqueue(existingRecord));
});

test('finish states, reason, receipt and no auto retries', t => {
  const root = fixture(t);
  const queue = new KnowledgeQueue(root);
  const proj = 'proj-finish';

  // Finish committed
  const r1 = queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-c' }));
  const b1 = queue.claim(proj);
  assert.equal(queue.dirty(proj).length, 1);
  queue.finish(proj, b1.id, { state: 'committed', reason: 'all good', receipt: { digest: 'abc' } });
  assert.equal(queue.dirty(proj).length, 0);
  assert.equal(queue.state(proj)[0].status, 'committed');
  assert.equal(queue.state(proj)[0].reason, 'all good');
  assert.deepEqual(queue.state(proj)[0].receipt, { digest: 'abc' });

  // Finish blocked (no auto retries, remains dirty)
  const r2 = queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-b' }));
  const b2 = queue.claim(proj);
  queue.finish(proj, b2.id, { state: 'blocked', reason: 'merge conflict' });
  assert.equal(queue.dirty(proj).length, 1);
  assert.equal(queue.dirty(proj)[0].status, 'blocked');
  assert.equal(queue.dirty(proj)[0].reason, 'merge conflict');
  // No auto retries: claim returns null
  assert.equal(queue.claim(proj), null);

  // Finish uncertain
  const r3 = queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-u' }));
  const b3 = queue.claim(proj);
  queue.finish(proj, b3.id, { state: 'uncertain', reason: 'network timeout' });
  assert.equal(queue.dirty(proj).length, 2); // blocked and uncertain
  assert.equal(queue.claim(proj), null); // no auto retries

  // Invalid state
  assert.throws(() => queue.finish(proj, 'bogus-batch', { state: 'invalid' }), /Invalid state/);
  // Non-running batch
  assert.throws(() => queue.finish(proj, b3.id, { state: 'committed' }), /Running batch not found/);
});


test('receipts are bounded deep copies, path sets are idempotent and malformed storage is preserved', t => {
  const root = fixture(t), queue = new KnowledgeQueue(root), record = sampleRecord({ touchedPaths: ['a.js', 'b.js'] });
  queue.enqueue(record); const revision = queue.revision(record.projectId);
  queue.enqueue({ ...record, touchedPaths: ['b.js', 'a.js'] }); assert.equal(queue.revision(record.projectId), revision);
  const batch = queue.claim(record.projectId); assert.throws(() => queue.finish(record.projectId, batch.id, { state: 'committed', reason: 'x'.repeat(501) }), /bounded/);
  const receipt = { nested: { revision: 1 } }; queue.finish(record.projectId, batch.id, { state: 'committed', receipt }); receipt.nested.revision = 9;
  const copy = queue.state(record.projectId); copy[0].receipt.nested.revision = 8; assert.equal(queue.state(record.projectId)[0].receipt.nested.revision, 1);
  for (const file of ['a//b', 'a/./b', 'a:stream', 'a/']) assert.throws(() => queue.enqueue(sampleRecord({ touchedPaths: [file] })), /touchedPath/);
  const target = path.join(root, 'knowledge-queue', 'broken.json'); fs.writeFileSync(target, '{"invalid":true}');
  assert.throws(() => new KnowledgeQueue(root).state('broken'), /persisted queue/); assert.equal(fs.readFileSync(target, 'utf8'), '{"invalid":true}');
});


test('a consumer can coalesce five-worker updates into completable four-path batches', t => {
  const root = fixture(t), queue = new KnowledgeQueue(root);
  for (let i = 0; i < 5; i++) queue.enqueue(sampleRecord({ touchedPaths: [`src/area${i}.js`] }));
  const first = queue.claim('proj-1', { maxPaths: 4 }); assert.equal(first.touchedPaths.length, 4); queue.finish('proj-1', first.id, { state: 'committed' });
  const second = queue.claim('proj-1', { maxPaths: 4 }); assert.equal(second.touchedPaths.length, 1);
});

test('optional deltaEvidence is validated, preserved in the payload and absent for legacy records', t => {
  const root = fixture(t), queue = new KnowledgeQueue(root), proj = 'proj-evidence';
  const evidence = { schemaVersion: 1, complete: true, omittedCount: 0, changedCount: 0 };
  queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-e', touchedPaths: [], deltaEvidence: evidence }));
  assert.deepEqual(queue.state(proj)[0].deltaEvidence, evidence);
  assert.throws(() => queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-e', touchedPaths: [] })), /Conflicting duplicate operationId/);
  for (const bad of [{ ...evidence, changedCount: -1 }, { ...evidence, extra: 1 }, { ...evidence, complete: 'yes' }, { ...evidence, schemaVersion: 2 }, 'not-an-object']) {
    assert.throws(() => queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-bad', touchedPaths: [], deltaEvidence: bad })), /Invalid deltaEvidence|plain object/);
  }
  queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-legacy', touchedPaths: [] }));
  assert.equal('deltaEvidence' in queue.state(proj).find(r => r.operationId === 'op-legacy'), false);
  assert.equal(queue.state(proj).length, 2);
});

test('persisted deltaEvidence is validated on load', t => {
  const root = fixture(t), proj = 'proj-bad-evidence', file = path.join(root, 'knowledge-queue', `${proj}.json`);
  atomicJson(file, [{ ...sampleRecord({ projectId: proj, operationId: 'op-p', touchedPaths: [] }), status: 'pending', state: 'pending', batchId: null, enqueuedAt: 1, deltaEvidence: { schemaVersion: 1, complete: true, omittedCount: 0, changedCount: 'many' } }]);
  assert.throws(() => new KnowledgeQueue(root).state(proj), /Invalid deltaEvidence/);
  assert.equal(fs.readFileSync(file, 'utf8').includes('many'), true);
});

test('claims report unknown and incomplete delta evidence and never treat an empty list as proof', t => {
  const root = fixture(t), queue = new KnowledgeQueue(root), proj = 'proj-claim-evidence';
  queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-unknown', touchedPaths: [], deltaEvidence: { schemaVersion: 1, complete: false, omittedCount: 0, changedCount: null } }));
  const unknown = queue.claim(proj);
  assert.equal(unknown.deltaUnknown, true); assert.equal(unknown.deltaComplete, false);
  queue.finish(proj, unknown.id, { state: 'blocked', reason: 'unknown' });

  queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-overflow', touchedPaths: [], deltaEvidence: { schemaVersion: 1, complete: false, omittedCount: 0, changedCount: 300 } }));
  const overflow = queue.claim(proj);
  assert.equal(overflow.deltaUnknown, true);
  queue.finish(proj, overflow.id, { state: 'blocked', reason: 'overflow' });

  queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-omitted', touchedPaths: ['src/a.js'], deltaEvidence: { schemaVersion: 1, complete: false, omittedCount: 1, changedCount: 1 } }));
  const omitted = queue.claim(proj);
  assert.equal(omitted.deltaUnknown, false); assert.equal(omitted.deltaComplete, false);
  queue.finish(proj, omitted.id, { state: 'committed' });

  queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-legacy', touchedPaths: ['src/b.js'] }));
  const legacy = queue.claim(proj);
  assert.equal(legacy.deltaUnknown, false); assert.equal(legacy.deltaComplete, true);
});

test('settlement is per operation, payload and revision checked, and idempotent on replay', t => {
  const root = fixture(t), queue = new KnowledgeQueue(root), proj = 'proj-settle';
  const evidence = { schemaVersion: 1, complete: true, omittedCount: 0, changedCount: 0 };
  queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-a', touchedPaths: [], deltaEvidence: evidence }));
  queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-b', touchedPaths: [], deltaEvidence: evidence }));
  const a = queue.state(proj).find(r => r.operationId === 'op-a'), b = queue.state(proj).find(r => r.operationId === 'op-b');
  const receipt = { mode: 'proven-no-change' };
  const expected = { status: 'pending', payload: a };

  // A queue change after the proof was computed aborts the settlement.
  const revision = queue.revision(proj);
  queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-c', touchedPaths: [] }));
  assert.throws(() => queue.settle(proj, 'op-a', { expected, expectedRevision: revision, receipt }), /Queue changed before settlement/);

  const settled = queue.settle(proj, 'op-a', { expected, expectedRevision: queue.revision(proj), receipt, reason: 'proven' });
  assert.equal(settled.status, 'committed'); assert.deepEqual(settled.receipt, receipt); assert.equal(settled.reason, 'proven');
  assert.deepEqual(queue.dirty(proj).map(r => r.operationId), ['op-b', 'op-c'], 'only the proven operation leaves dirty');

  // Replays of the same settlement are idempotent, even after the revision moved on.
  assert.deepEqual(queue.settle(proj, 'op-a', { expected, receipt }).receipt, receipt);
  assert.throws(() => queue.settle(proj, 'op-a', { expected, receipt: { mode: 'other' } }), /different receipt/);

  // Payload drift, state drift, running records, unknown records and unbounded receipts are rejected.
  assert.throws(() => queue.settle(proj, 'op-b', { expected: { status: 'pending', payload: { ...b, targetSnapshot: HASH_A } }, receipt }), /changed before settlement/);
  assert.throws(() => queue.settle(proj, 'op-b', { expected: { status: 'blocked', payload: b }, receipt }), /changed before settlement/);
  assert.throws(() => queue.settle(proj, 'op-b', { expected: { status: 'running', payload: b }, receipt }), /expected record state/);
  assert.throws(() => queue.settle(proj, 'op-b', { expected, receipt: 'text' }), /bounded plain JSON object/);
  assert.throws(() => queue.settle(proj, 'op-missing', { expected, receipt }), /not found/);
  assert.equal(queue.state(proj).find(r => r.operationId === 'op-b').status, 'pending');

  const reloaded = new KnowledgeQueue(root).state(proj).find(r => r.operationId === 'op-a');
  assert.equal(reloaded.status, 'committed'); assert.deepEqual(reloaded.receipt, receipt);
});

test('settlement can replace a blocked record only when its expected state still matches', t => {
  const root = fixture(t), queue = new KnowledgeQueue(root), proj = 'proj-blocked-settle';
  queue.enqueue(sampleRecord({ projectId: proj, operationId: 'op-blocked', touchedPaths: [] }));
  queue.finish(proj, queue.claim(proj).id, { state: 'blocked', reason: 'No proof' });
  const blocked = queue.state(proj)[0];
  const settled = queue.settle(proj, 'op-blocked', { expected: { status: 'blocked', payload: blocked }, receipt: { mode: 'proven-no-change' } });
  assert.equal(settled.status, 'committed'); assert.equal(queue.dirty(proj).length, 0);
});
