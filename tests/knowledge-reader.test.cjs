'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { directory, readSections } = require('../electron/knowledge-reader.cjs');
const fixture = require('./fixtures/knowledge/sections.json').greenfieldProposed;
function snapshot() {
  return { projectId: 'project', revision: 3, entries: ['sec_c', 'sec_a', 'sec_b'].map(id => ({ id, version: 1, deleted: false, section: { ...structuredClone(fixture), id } }))
    .concat({ id: 'sec_old', version: 2, deleted: true, section: null }) };
}
test('directory pages retain stable ordering and reject stale or cross-project cursors', () => {
  const snap = snapshot(), page = directory(snap, { limit: 2 });
  assert.deepEqual(page.items.map(x => x.id), ['sec_a', 'sec_b']);
  assert.equal(page.retiredCount, 1); assert.equal(page.total, 3);
  assert.equal(page.assurance.sourceVerified, false);
  const next = directory(snap, { cursor: page.nextCursor });
  assert.deepEqual(next.items.map(x => x.id), ['sec_c']); assert.equal(next.nextCursor, null);
  assert.throws(() => directory({ ...snap, revision: 4 }, { cursor: page.nextCursor }), /changed/);
  assert.throws(() => directory({ ...snap, projectId: 'other' }, { cursor: page.nextCursor }), /cursor/);
  for (const cursor of ['', '../', 'e30', Buffer.from('null').toString('base64url')]) assert.throws(() => directory(snap, { cursor }));
  assert.throws(() => directory(snap, { limit: 101 }));
});
test('reads distinguish missing and retired sections and preserve requested order', () => {
  const snap = snapshot(), read = readSections(snap, { ids: ['sec_c', 'sec_old', 'sec_missing', 'sec_a'], revision: 3 });
  assert.deepEqual(read.items.map(x => x.id), ['sec_c', 'sec_a']);
  assert.deepEqual(read.missingIds, ['sec_missing']); assert.deepEqual(read.retiredIds, ['sec_old']);
  assert.deepEqual(read.items[0].recorded, snap.entries[0].section);
  assert.equal(read.assurance.semanticVerified, false);
  assert.throws(() => readSections(snap, { ids: ['sec_c'], revision: 2 }), /changed/);
  for (const ids of [[], ['sec_c', 'sec_c'], ['../secret'], Array(33).fill('sec_c')]) assert.throws(() => readSections(snap, { ids }));
});
test('byte budgets defer complete Unicode sections with explicit continuation', () => {
  const snap = snapshot(); snap.entries[0].section.summary = '\u{1f600}'.repeat(2000);
  const read = readSections(snap, { ids: ['sec_a', 'sec_c', 'sec_b'], maxBytes: 2048 });
  assert.deepEqual(read.items.map(x => x.id), ['sec_a']); assert.deepEqual(read.remainingIds, ['sec_c', 'sec_b']);
  assert.ok(read.requiredBytes > 2048); assert.ok(Buffer.byteLength(JSON.stringify(read)) <= 2048);
  const rest = readSections(snap, { ids: read.remainingIds, revision: read.revision, maxBytes: 16384 });
  assert.equal(rest.items[0].recorded.summary, snap.entries[0].section.summary);
  assert.deepEqual(rest.remainingIds, []);
});

test('oversized valid evidence is explicitly marked for decomposition', () => {
  const { validateSection } = require('../electron/knowledge-contracts.cjs');
  const record = structuredClone(require('./fixtures/knowledge/sections.json').existingObservedFact);
  record.id = 'sec_large';
  record.evidence = Array.from({ length: 256 }, (_, i) => ({ sourceId: `src_${i}`, contentHash: 'a'.repeat(64), anchor: '\u{1f600}'.repeat(256) }));
  const section = validateSection(record);
  const read = readSections({ projectId: 'project', revision: 1, entries: [{ id: section.id, version: 1, deleted: false, section }] }, { ids: [section.id], maxBytes: 262144 });
  assert.deepEqual(read.items, []); assert.deepEqual(read.remainingIds, [section.id]);
  assert.ok(read.requiredBytes > 262144); assert.equal(read.decompositionRequired, true);
});

function sectionAtResponseSize(target) {
  const record = structuredClone(require('./fixtures/knowledge/sections.json').existingObservedFact);
  record.id = 'sec_large';
  record.evidence = Array.from({ length: 256 }, (_, i) => ({ sourceId: `src_${i}`, contentHash: 'a'.repeat(64), anchor: 'a'.repeat(512) }));
  const snap = { projectId: 'project', revision: 1, entries: [{ id: record.id, version: 1, deleted: false, section: record }] };
  let extra = target - readSections(snap, { ids: [record.id], maxBytes: 2048 }).requiredBytes;
  assert.ok(extra >= 0 && extra <= 256 * 512);
  for (const item of record.evidence) {
    const count = Math.min(extra, 512); extra -= count;
    item.anchor = '\u00e9'.repeat(count) + 'a'.repeat(512 - count);
  }
  require('../electron/knowledge-contracts.cjs').validateSection(record);
  return snap;
}
test('retrying the reported solo budget succeeds, including the exact maximum', () => {
  for (const target of [8000, 262144]) {
    const snap = target === 8000 ? snapshot() : sectionAtResponseSize(target);
    const id = target === 8000 ? 'sec_c' : 'sec_large';
    if (target === 8000) snap.entries[0].section.summary = 'x'.repeat(8000);
    const deferred = readSections(snap, { ids: [id], maxBytes: 2048 });
    const read = readSections(snap, { ids: [id], maxBytes: deferred.requiredBytes });
    assert.equal(read.items.length, 1); assert.deepEqual(read.remainingIds, []);
    assert.equal(Buffer.byteLength(JSON.stringify(read)), deferred.requiredBytes);
    assert.equal(read.decompositionRequired, false);
  }
  const over = sectionAtResponseSize(262145);
  const deferred = readSections(over, { ids: ['sec_large'], maxBytes: 262144 });
  assert.equal(deferred.requiredBytes, 262145); assert.equal(deferred.decompositionRequired, true);
});
test('unrelated continuation IDs cannot falsely require decomposition', () => {
  const snap = sectionAtResponseSize(262000), ids = ['sec_large'];
  for (let i = 0; i < 31; i++) {
    const id = 'sec_' + String(i).padStart(90, 'a'); ids.push(id);
    snap.entries.push({ id, version: 1, deleted: false, section: { ...fixture, id } });
  }
  const deferred = readSections(snap, { ids, maxBytes: 262144 });
  assert.deepEqual(deferred.items, []); assert.equal(deferred.requiredBytes, 262000);
  assert.equal(deferred.decompositionRequired, false);
  const solo = readSections(snap, { ids: ['sec_large'], maxBytes: deferred.requiredBytes });
  assert.equal(solo.items.length, 1);
});
