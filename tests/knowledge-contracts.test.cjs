'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SCHEMA_VERSION,
  CANONICAL_FIELDS,
  validateSection
} = require('../electron/knowledge-contracts.cjs');
const fixtures = require('./fixtures/knowledge/sections.json');

const clone = value => structuredClone(value);

test('validates canonical section fixtures and preserves supplied values without manufacturing fields', () => {
  assert.equal(SCHEMA_VERSION, 1);
  const expectedNames = [
    'greenfieldProposed',
    'existingObservedFact',
    'staleInterpretation',
    'ownerIntent',
    'unknownCoverage'
  ];
  assert.deepEqual(Object.keys(fixtures), expectedNames);

  for (const name of expectedNames) {
    const input = clone(fixtures[name]);
    const validated = validateSection(input);
    assert.deepEqual(Object.keys(validated), CANONICAL_FIELDS, name);
    assert.deepEqual(validated, fixtures[name], name);
    assert.deepEqual(JSON.parse(JSON.stringify(validated)), fixtures[name], name);
  }
});

test('returns a deep-frozen copy isolated from caller input mutations', () => {
  const input = clone(fixtures.existingObservedFact);
  const result = validateSection(input);

  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.provenance), true);
  assert.equal(Object.isFrozen(result.evidence), true);
  assert.equal(Object.isFrozen(result.evidence[0]), true);
  assert.equal(Object.isFrozen(result.sourceRefs), true);
  assert.equal(Object.isFrozen(result.flowRefs), true);

  input.title = 'Mutated caller title';
  input.provenance.reference = 'mutated:ref';
  input.evidence[0].anchor = 'mutated:anchor';
  input.evidence.push({
    sourceId: 'src_extra',
    contentHash: 'a'.repeat(64),
    anchor: 'extra'
  });
  input.sourceRefs.push('src_extra');
  input.flowRefs.push('flow_extra');

  assert.deepEqual(result, fixtures.existingObservedFact);

  assert.throws(() => { result.title = 'x'; }, TypeError);
  assert.throws(() => { result.provenance.kind = 'inferred'; }, TypeError);
  assert.throws(() => { result.evidence[0].anchor = 'x'; }, TypeError);
  assert.throws(() => { result.evidence.push({}); }, TypeError);
  assert.throws(() => { result.sourceRefs.push('src_new'); }, TypeError);
  assert.throws(() => { result.flowRefs.push('flow_new'); }, TypeError);
});

test('rejects unsupported schema versions and unknown or missing fields', () => {
  for (const badVersion of [0, 2, '1', 1.5, null, undefined, NaN]) {
    const record = clone(fixtures.greenfieldProposed);
    record.schemaVersion = badVersion;
    assert.throws(() => validateSection(record), /schemaVersion|missing required top-level field/);
  }

  const withExtraTop = clone(fixtures.greenfieldProposed);
  withExtraTop.createdAt = 1793463681594;
  assert.throws(() => validateSection(withExtraTop), /unknown top-level field "createdAt"/);

  const withExtraProv = clone(fixtures.greenfieldProposed);
  withExtraProv.provenance.approvedBy = 'model';
  assert.throws(() => validateSection(withExtraProv), /unknown provenance field "approvedBy"/);

  const withExtraEvidence = clone(fixtures.existingObservedFact);
  withExtraEvidence.evidence[0].line = 198;
  assert.throws(() => validateSection(withExtraEvidence), /unknown evidence\[0\] field "line"/);

  for (const field of CANONICAL_FIELDS) {
    const missing = clone(fixtures.existingObservedFact);
    delete missing[field];
    assert.throws(() => validateSection(missing), new RegExp(`missing required top-level field "${field}"`));
  }
});

test('rejects bad IDs, malformed types, non-JSON-safe strings and oversized bounds', () => {
  assert.throws(() => validateSection(null), /record must be a plain object/);
  assert.throws(() => validateSection([]), /record must be a plain object/);
  assert.throws(() => validateSection(new Date()), /record must be a plain object/);

  const badIds = [
    '',
    '9sec_numeric_start',
    'Sec_Upper',
    'sec space',
    'sec/slash',
    'sec.dot',
    `a${'b'.repeat(96)}`
  ];
  for (const badId of badIds) {
    const record = clone(fixtures.greenfieldProposed);
    record.id = badId;
    assert.throws(() => validateSection(record), /id must match stable ID pattern/);
  }

  const maxLenIdRecord = clone(fixtures.greenfieldProposed);
  maxLenIdRecord.id = `a${'b'.repeat(95)}`;
  assert.equal(validateSection(maxLenIdRecord).id.length, 96);

  const badCases = [
    [r => { r.kind = 'hypothesis'; }, /kind must be one of/],
    [r => { r.freshness = 'verified'; }, /freshness must be one of/],
    [r => { r.title = '   '; }, /title must not be empty/],
    [r => { r.summary = ''; }, /summary must not be empty/],
    [r => { r.title = 'x'.repeat(241); }, /title exceeds maximum length/],
    [r => { r.summary = 'x'.repeat(8193); }, /summary exceeds maximum length/],
    [r => { r.title = 'bad\uD800surrogate'; }, /title must be JSON-safe UTF-8 text/],
    [r => { r.summary = 'null\0byte'; }, /summary must be JSON-safe UTF-8 text/],
    [r => { r.sourceSnapshot = 'snap with space'; }, /sourceSnapshot must not contain whitespace/],
    [r => { r.sourceSnapshot = ' padded '; }, /sourceSnapshot must not contain whitespace/],
    [r => { r.provenance = null; }, /provenance must be a plain object/],
    [r => { r.provenance.kind = 'auto'; }, /provenance\.kind must be one of/],
    [r => { r.provenance.reference = ''; }, /provenance\.reference must not be empty/]
  ];

  for (const [mutate, pattern] of badCases) {
    const record = clone(fixtures.existingObservedFact);
    mutate(record);
    assert.throws(() => validateSection(record), pattern);
  }
});

test('enforces snapshot and evidence integrity for current and stale facts/interpretations', () => {
  const currentFactNoSnap = clone(fixtures.existingObservedFact);
  currentFactNoSnap.sourceSnapshot = null;
  assert.throws(() => validateSection(currentFactNoSnap), /sourceSnapshot/);

  const currentFactNoEvidence = clone(fixtures.existingObservedFact);
  currentFactNoEvidence.evidence = [];
  assert.throws(() => validateSection(currentFactNoEvidence), /evidence/);

  const currentInterpNoEvidence = clone(fixtures.staleInterpretation);
  currentInterpNoEvidence.freshness = 'current';
  currentInterpNoEvidence.evidence = [];
  assert.throws(() => validateSection(currentInterpNoEvidence), /current interpretation requires at least one evidence item/);

  const currentInterpNoSnap = clone(fixtures.staleInterpretation);
  currentInterpNoSnap.freshness = 'current';
  currentInterpNoSnap.sourceSnapshot = null;
  assert.throws(() => validateSection(currentInterpNoSnap), /sourceSnapshot/);

  const staleInterpNoEvidence = clone(fixtures.staleInterpretation);
  staleInterpNoEvidence.evidence = [];
  assert.throws(() => validateSection(staleInterpNoEvidence), /stale interpretation requires at least one evidence item/);

  const proposedWithOrphanEvidence = clone(fixtures.greenfieldProposed);
  proposedWithOrphanEvidence.evidence = clone(fixtures.existingObservedFact.evidence);
  assert.throws(() => validateSection(proposedWithOrphanEvidence), /evidence requires a non-null sourceSnapshot/);
});

test('rejects invented owner provenance and hypotheses marked as observed', () => {
  const inferredIntent = clone(fixtures.ownerIntent);
  inferredIntent.provenance.kind = 'inferred';
  assert.throws(() => validateSection(inferredIntent), /intent sections require owner provenance/);

  const reviewedIntent = clone(fixtures.ownerIntent);
  reviewedIntent.provenance.kind = 'reviewed';
  assert.throws(() => validateSection(reviewedIntent), /intent sections require owner provenance/);

  const factClaimingOwner = clone(fixtures.existingObservedFact);
  factClaimingOwner.provenance.kind = 'owner';
  assert.throws(() => validateSection(factClaimingOwner), /owner provenance is reserved for intent sections/);

  const interpClaimingOwner = clone(fixtures.staleInterpretation);
  interpClaimingOwner.provenance.kind = 'owner';
  assert.throws(() => validateSection(interpClaimingOwner), /owner provenance is reserved for intent sections/);

  const proposedClaimingObserved = clone(fixtures.greenfieldProposed);
  proposedClaimingOwnerOrObserved(proposedClaimingObserved);

  const unknownClaimingObserved = clone(fixtures.unknownCoverage);
  unknownClaimingObserved.provenance.kind = 'observed';
  unknownClaimingObserved.sourceSnapshot = 'f3fadec67553d7dbf3df256836ccd536fae90b44';
  unknownClaimingObserved.evidence = clone(fixtures.existingObservedFact.evidence);
  assert.throws(() => validateSection(unknownClaimingObserved), /unknown sections cannot claim observed provenance/);

  const interpClaimingObserved = clone(fixtures.staleInterpretation);
  interpClaimingObserved.provenance.kind = 'observed';
  assert.throws(() => validateSection(interpClaimingObserved), /observed provenance requires fact kind/);

  const unverifiedCurrentFact = clone(fixtures.existingObservedFact);
  unverifiedCurrentFact.provenance.kind = 'inferred';
  assert.throws(() => validateSection(unverifiedCurrentFact), /current fact sections cannot use unverified inferred provenance/);
});

function proposedClaimingOwnerOrObserved(record) {
  record.provenance.kind = 'observed';
  assert.throws(() => validateSection(record), /proposed sections cannot claim observed provenance/);
}

test('rejects invalid or duplicate sourceRefs, flowRefs and evidence entries', () => {
  const dupSourceRef = clone(fixtures.existingObservedFact);
  dupSourceRef.sourceRefs = ['src_electron_task_loop_persist', 'src_electron_task_loop_persist'];
  assert.throws(() => validateSection(dupSourceRef), /duplicate reference "src_electron_task_loop_persist" in sourceRefs/);

  const dupFlowRef = clone(fixtures.existingObservedFact);
  dupFlowRef.flowRefs = ['flow_task_lifecycle', 'flow_task_lifecycle'];
  assert.throws(() => validateSection(dupFlowRef), /duplicate reference "flow_task_lifecycle" in flowRefs/);

  const invalidSourceRef = clone(fixtures.existingObservedFact);
  invalidSourceRef.sourceRefs = ['Invalid Ref!'];
  assert.throws(() => validateSection(invalidSourceRef), /sourceRefs\[0\] must match stable ID pattern/);

  const invalidFlowRef = clone(fixtures.existingObservedFact);
  invalidFlowRef.flowRefs = [''];
  assert.throws(() => validateSection(invalidFlowRef), /flowRefs\[0\] must match stable ID pattern/);

  const selfRef = clone(fixtures.existingObservedFact);
  selfRef.flowRefs = [selfRef.id];
  assert.throws(() => validateSection(selfRef), /flowRefs must not self-reference section id/);

  const badEvidenceHash = clone(fixtures.existingObservedFact);
  badEvidenceHash.evidence[0].contentHash = 'ABCD'.repeat(16);
  assert.throws(() => validateSection(badEvidenceHash), /64-character lowercase hex sha256/);

  const shortEvidenceHash = clone(fixtures.existingObservedFact);
  shortEvidenceHash.evidence[0].contentHash = 'abc123';
  assert.throws(() => validateSection(shortEvidenceHash), /64-character lowercase hex sha256/);

  const badEvidenceSourceId = clone(fixtures.existingObservedFact);
  badEvidenceSourceId.evidence[0].sourceId = 'Bad Source ID';
  assert.throws(() => validateSection(badEvidenceSourceId), /evidence\[0\]\.sourceId must match stable ID pattern/);

  const dupEvidence = clone(fixtures.existingObservedFact);
  dupEvidence.evidence.push(clone(dupEvidence.evidence[0]));
  assert.throws(() => validateSection(dupEvidence), /duplicate evidence entry at index 1/);
});

test('rejects accessors without invoking them on sections, evidence and provenance', () => {
  for (const target of ['section', 'provenance', 'evidence', 'array']) {
    const input = clone(fixtures.existingObservedFact);
    const object = target === 'section' ? input : target === 'provenance' ? input.provenance : target === 'array' ? input.sourceRefs : input.evidence[0];
    const key = Object.keys(object)[0]; let reads = 0;
    Object.defineProperty(object, key, { enumerable: true, get() { reads++; throw new Error('getter executed'); } });
    assert.throws(() => validateSection(input), /plain|array|list|sourceRefs/);
    assert.equal(reads, 0);
  }
});
