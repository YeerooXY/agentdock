'use strict';

const SCHEMA_VERSION = 1;
const STABLE_ID_PATTERN = /^[a-z][a-z0-9_:-]{0,95}$/;
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;
const LONE_SURROGATE_PATTERN = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const SECTION_KINDS = Object.freeze(['fact', 'interpretation', 'intent']);
const FRESHNESS_VALUES = Object.freeze(['proposed', 'current', 'stale', 'unknown']);
const PROVENANCE_KINDS = Object.freeze(['observed', 'inferred', 'reviewed', 'owner']);
const CANONICAL_FIELDS = Object.freeze([
  'schemaVersion', 'id', 'kind', 'title', 'summary', 'sourceSnapshot',
  'freshness', 'provenance', 'evidence', 'sourceRefs', 'flowRefs'
]);
const PROVENANCE_FIELDS = Object.freeze(['kind', 'reference']);
const EVIDENCE_FIELDS = Object.freeze(['sourceId', 'contentHash', 'anchor']);

const MAX_TITLE_LENGTH = 240;
const MAX_SUMMARY_LENGTH = 8192;
const MAX_SNAPSHOT_LENGTH = 256;
const MAX_REFERENCE_LENGTH = 512;
const MAX_ANCHOR_LENGTH = 512;
const MAX_ARRAY_LENGTH = 256;

function fail(id, message) {
  const label = typeof id === 'string' && id.length > 0 && id.length <= 96 ? `"${id}"` : '<invalid>';
  throw new TypeError(`Knowledge section ${label}: ${message}`);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.getOwnPropertySymbols(value).length === 0 &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(desc => !desc.get && !desc.set);
}

function isPlainArray(value) {
  if (!Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Array.prototype) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  return Object.keys(value).length === value.length &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(desc => !desc.get && !desc.set);
}

function checkExactKeys(object, allowedKeys, id, where) {
  const keys = Object.keys(object);
  for (const key of keys) {
    if (!allowedKeys.includes(key)) fail(id, `unknown ${where} field "${key}"`);
  }
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(object, key) || object[key] === undefined) {
      fail(id, `missing required ${where} field "${key}"`);
    }
  }
}

function checkBoundedText(value, maxLength, id, fieldName) {
  if (typeof value !== 'string') fail(id, `${fieldName} must be a string`);
  if (value.length === 0 || value.trim().length === 0) fail(id, `${fieldName} must not be empty`);
  if (value.length > maxLength) fail(id, `${fieldName} exceeds maximum length of ${maxLength}`);
  if (value.includes('\0') || LONE_SURROGATE_PATTERN.test(value)) {
    fail(id, `${fieldName} must be JSON-safe UTF-8 text`);
  }
  return value;
}

function checkStableId(value, id, fieldName) {
  if (typeof value !== 'string' || !STABLE_ID_PATTERN.test(value)) {
    fail(id, `${fieldName} must match stable ID pattern ${STABLE_ID_PATTERN}`);
  }
  return value;
}

function validateSnapshot(value, id) {
  if (value === null) return null;
  checkBoundedText(value, MAX_SNAPSHOT_LENGTH, id, 'sourceSnapshot');
  if (value.trim() !== value || /\s/.test(value)) {
    fail(id, 'sourceSnapshot must not contain whitespace');
  }
  return value;
}

function validateProvenance(provenance, id) {
  if (!isPlainObject(provenance)) fail(id, 'provenance must be a plain object');
  checkExactKeys(provenance, PROVENANCE_FIELDS, id, 'provenance');
  if (!PROVENANCE_KINDS.includes(provenance.kind)) {
    fail(id, `provenance.kind must be one of ${PROVENANCE_KINDS.join(', ')}`);
  }
  const reference = checkBoundedText(provenance.reference, MAX_REFERENCE_LENGTH, id, 'provenance.reference');
  return Object.freeze({ kind: provenance.kind, reference });
}

function validateEvidenceList(evidence, id) {
  if (!isPlainArray(evidence)) fail(id, 'evidence must be an array');
  if (evidence.length > MAX_ARRAY_LENGTH) fail(id, `evidence exceeds maximum length of ${MAX_ARRAY_LENGTH}`);
  const seen = new Set();
  const normalized = evidence.map((item, index) => {
    if (!isPlainObject(item)) fail(id, `evidence[${index}] must be a plain object`);
    checkExactKeys(item, EVIDENCE_FIELDS, id, `evidence[${index}]`);
    const sourceId = checkStableId(item.sourceId, id, `evidence[${index}].sourceId`);
    if (typeof item.contentHash !== 'string' || !CONTENT_HASH_PATTERN.test(item.contentHash)) {
      fail(id, `evidence[${index}].contentHash must be a 64-character lowercase hex sha256`);
    }
    const anchor = checkBoundedText(item.anchor, MAX_ANCHOR_LENGTH, id, `evidence[${index}].anchor`);
    const key = `${sourceId}\0${item.contentHash}\0${anchor}`;
    if (seen.has(key)) fail(id, `duplicate evidence entry at index ${index}`);
    seen.add(key);
    return Object.freeze({ sourceId, contentHash: item.contentHash, anchor });
  });
  return Object.freeze(normalized);
}

function validateRefList(refs, sectionId, fieldName) {
  if (!isPlainArray(refs)) fail(sectionId, `${fieldName} must be an array`);
  if (refs.length > MAX_ARRAY_LENGTH) fail(sectionId, `${fieldName} exceeds maximum length of ${MAX_ARRAY_LENGTH}`);
  const seen = new Set();
  const normalized = refs.map((ref, index) => {
    const validRef = checkStableId(ref, sectionId, `${fieldName}[${index}]`);
    if (validRef === sectionId) fail(sectionId, `${fieldName} must not self-reference section id "${sectionId}"`);
    if (seen.has(validRef)) fail(sectionId, `duplicate reference "${validRef}" in ${fieldName}`);
    seen.add(validRef);
    return validRef;
  });
  return Object.freeze(normalized);
}

function validateLifecycleIntegrity(section) {
  const { id, kind, freshness, sourceSnapshot, provenance, evidence } = section;
  if (kind === 'intent') {
    if (provenance.kind !== 'owner') fail(id, 'intent sections require owner provenance');
  } else if (provenance.kind === 'owner') {
    fail(id, `owner provenance is reserved for intent sections, not ${kind}`);
  }
  if (provenance.kind === 'observed') {
    if (kind !== 'fact') fail(id, `observed provenance requires fact kind, not ${kind}`);
    if (freshness === 'proposed' || freshness === 'unknown') {
      fail(id, `${freshness} sections cannot claim observed provenance`);
    }
    if (sourceSnapshot === null || evidence.length === 0) {
      fail(id, 'observed provenance requires sourceSnapshot and evidence');
    }
  }
  if (evidence.length > 0 && sourceSnapshot === null) {
    fail(id, 'evidence requires a non-null sourceSnapshot');
  }
  if ((kind === 'fact' || kind === 'interpretation') && (freshness === 'current' || freshness === 'stale')) {
    if (sourceSnapshot === null) fail(id, `${freshness} ${kind} requires a non-null sourceSnapshot`);
    if (evidence.length === 0) fail(id, `${freshness} ${kind} requires at least one evidence item`);
  }
  if (kind === 'fact' && freshness === 'current' && provenance.kind === 'inferred') {
    fail(id, 'current fact sections cannot use unverified inferred provenance');
  }
}

function validateSection(record) {
  const candidateId = isPlainObject(record) ? record.id : undefined;
  if (!isPlainObject(record)) fail(candidateId, 'record must be a plain object');
  checkExactKeys(record, CANONICAL_FIELDS, candidateId, 'top-level');
  const id = checkStableId(record.id, candidateId, 'id');
  if (record.schemaVersion !== SCHEMA_VERSION) {
    fail(id, `unsupported schemaVersion ${JSON.stringify(record.schemaVersion)} (expected ${SCHEMA_VERSION})`);
  }
  if (!SECTION_KINDS.includes(record.kind)) {
    fail(id, `kind must be one of ${SECTION_KINDS.join(', ')}`);
  }
  if (!FRESHNESS_VALUES.includes(record.freshness)) {
    fail(id, `freshness must be one of ${FRESHNESS_VALUES.join(', ')}`);
  }
  const normalized = {
    schemaVersion: SCHEMA_VERSION,
    id,
    kind: record.kind,
    title: checkBoundedText(record.title, MAX_TITLE_LENGTH, id, 'title'),
    summary: checkBoundedText(record.summary, MAX_SUMMARY_LENGTH, id, 'summary'),
    sourceSnapshot: validateSnapshot(record.sourceSnapshot, id),
    freshness: record.freshness,
    provenance: validateProvenance(record.provenance, id),
    evidence: validateEvidenceList(record.evidence, id),
    sourceRefs: validateRefList(record.sourceRefs, id, 'sourceRefs'),
    flowRefs: validateRefList(record.flowRefs, id, 'flowRefs')
  };
  validateLifecycleIntegrity(normalized);
  return Object.freeze(normalized);
}

module.exports = Object.freeze({
  SCHEMA_VERSION,
  STABLE_ID_PATTERN,
  CONTENT_HASH_PATTERN,
  SECTION_KINDS,
  FRESHNESS_VALUES,
  PROVENANCE_KINDS,
  CANONICAL_FIELDS,
  validateSection
});
