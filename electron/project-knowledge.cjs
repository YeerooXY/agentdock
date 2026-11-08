'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { readJson, atomicJson } = require('./storage.cjs');
const {
  SCHEMA_VERSION,
  STABLE_ID_PATTERN,
  CONTENT_HASH_PATTERN,
  validateSection
} = require('./knowledge-contracts.cjs');

const BOUNDED_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_BATCH_SIZE = 32;
const MAX_ENTRIES = 1000;
const MAX_JOURNAL_ENTRIES = 1000;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

const STORE_KEYS = Object.freeze(['schemaVersion', 'projectId', 'revision', 'entries', 'journal']);
const ENTRY_KEYS = Object.freeze(['id', 'version', 'deleted', 'section']);
const RECEIPT_KEYS = Object.freeze(['operationId', 'hash', 'revision', 'updatedAt', 'versions']);
const VERSION_KEYS = Object.freeze(['id', 'version', 'deleted']);
const COMMIT_KEYS = Object.freeze(['operationId', 'changes']);
const CHANGE_KEYS = Object.freeze(['id', 'expectedVersion', 'section']);
const PROTO_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  ...Object.getOwnPropertyNames(Object.prototype)
]);

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.keys(descriptors)) {
    if (descriptors[key].get || descriptors[key].set) return false;
  }
  return true;
}

function isPlainList(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  if (Object.keys(value).length !== value.length) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Object.keys(descriptors)) {
    if (descriptors[key].get || descriptors[key].set) return false;
  }
  return true;
}

function requireExactShape(obj, expectedKeys, context) {
  if (!isPlainRecord(obj)) {
    throw new TypeError(`Knowledge store ${context} must be a plain object`);
  }
  const actualKeys = Object.keys(obj);
  for (const key of actualKeys) {
    if (!expectedKeys.includes(key)) {
      throw new TypeError(`Knowledge store ${context} has unknown field "${key}"`);
    }
  }
  for (const key of expectedKeys) {
    if (!Object.prototype.hasOwnProperty.call(obj, key) || obj[key] === undefined) {
      throw new TypeError(`Knowledge store ${context} is missing required field "${key}"`);
    }
  }
}

function validateBoundedId(value, label) {
  if (typeof value !== 'string' || !BOUNDED_ID_PATTERN.test(value) || PROTO_KEYS.has(value)) {
    throw new TypeError(`Invalid ${label}: must match ${BOUNDED_ID_PATTERN} and not be a prototype key`);
  }
  return value;
}

function validateSectionId(value, label) {
  if (typeof value !== 'string' || !STABLE_ID_PATTERN.test(value) || PROTO_KEYS.has(value)) {
    throw new TypeError(`Invalid ${label}: must match ${STABLE_ID_PATTERN} and not be a prototype key`);
  }
  return value;
}

function validateNonNegativeInt(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Invalid ${label}: must be a non-negative safe integer`);
  }
  return value;
}

function validatePositiveInt(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`Invalid ${label}: must be a positive safe integer`);
  }
  return value;
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) deepFreeze(value[i]);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const sortedKeys = Object.keys(value).sort();
  return `{${sortedKeys.map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

function hashNormalizedChanges(normalizedChanges) {
  return crypto.createHash('sha256').update(canonicalJson(normalizedChanges), 'utf8').digest('hex');
}

function validateAndNormalizeCommitInput(projectId, payload) {
  validateBoundedId(projectId, 'projectId');
  requireExactShape(payload, COMMIT_KEYS, 'commit payload');
  const operationId = validateBoundedId(payload.operationId, 'operationId');
  if (!isPlainList(payload.changes)) {
    throw new TypeError('Knowledge store commit changes must be a plain array');
  }
  if (payload.changes.length === 0) {
    throw new RangeError('Knowledge store commit requires at least 1 change');
  }
  if (payload.changes.length > MAX_BATCH_SIZE) {
    throw new RangeError(`Knowledge store commit batch size ${payload.changes.length} exceeds limit of ${MAX_BATCH_SIZE}`);
  }
  const seenTargets = new Set();
  const normalizedChanges = payload.changes.map((change, index) => {
    requireExactShape(change, CHANGE_KEYS, `changes[${index}]`);
    const id = validateSectionId(change.id, `changes[${index}].id`);
    if (seenTargets.has(id)) {
      throw new Error(`Duplicate section target "${id}" in commit batch`);
    }
    seenTargets.add(id);
    const expectedVersion = validateNonNegativeInt(change.expectedVersion, `changes[${index}].expectedVersion`);
    if (change.section === null) {
      if (expectedVersion === 0) {
        throw new Error(`Cannot delete section "${id}" with expectedVersion 0`);
      }
      return { id, expectedVersion, section: null };
    }
    const validated = validateSection(change.section);
    if (validated.id !== id) {
      throw new Error(`Section id "${validated.id}" does not match target id "${id}"`);
    }
    return { id, expectedVersion, section: validated };
  });
  return {
    operationId,
    changes: normalizedChanges,
    hash: hashNormalizedChanges(normalizedChanges)
  };
}

function tryLstat(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function checkNoSymlinkChain(rootDir, knowledgeDir, filePath) {
  const stopBoundaries = new Set([
    path.resolve(process.cwd()),
    path.resolve(os.tmpdir())
  ]);
  if (process.env.TEMP) stopBoundaries.add(path.resolve(process.env.TEMP));
  if (process.env.TMPDIR) stopBoundaries.add(path.resolve(process.env.TMPDIR));

  let probe = rootDir;
  while (true) {
    const st = tryLstat(probe);
    if (st) {
      if (st.isSymbolicLink()) {
        throw new Error(`Knowledge store refuses symbolic link path: ${probe}`);
      }
      if (!st.isDirectory()) {
        throw new Error(`Knowledge store root path is not a directory: ${probe}`);
      }
    }
    if (stopBoundaries.has(probe)) break;
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }

  const rootStat = tryLstat(rootDir);
  const rootReal = rootStat ? fs.realpathSync(rootDir) : null;
  const dirStat = tryLstat(knowledgeDir);
  if (dirStat) {
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
      throw new Error('Knowledge store directory must be a real directory, not a symbolic link or file');
    }
    if (rootReal && fs.realpathSync(knowledgeDir) !== path.join(rootReal, 'knowledge')) {
      throw new Error('Knowledge store directory failed realpath containment check');
    }
  }
  const fileStat = tryLstat(filePath);
  if (fileStat) {
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      throw new Error('Knowledge store target must be a regular file, not a symbolic link or directory');
    }
    const dirReal = fs.realpathSync(knowledgeDir);
    if (fs.realpathSync(filePath) !== path.join(dirReal, path.basename(filePath))) {
      throw new Error('Knowledge store file failed realpath containment check');
    }
    return fileStat;
  }
  return null;
}

function resolveProjectPaths(rootDir, projectId) {
  validateBoundedId(projectId, 'projectId');
  const knowledgeDir = path.join(rootDir, 'knowledge');
  const fileName = `${projectId}.json`;
  const filePath = path.join(knowledgeDir, fileName);
  if (path.dirname(filePath) !== knowledgeDir || path.basename(filePath) !== fileName || path.relative(knowledgeDir, filePath) !== fileName) {
    throw new Error(`Knowledge store path traversal rejected for "${projectId}"`);
  }
  const fileStat = checkNoSymlinkChain(rootDir, knowledgeDir, filePath);
  return { knowledgeDir, filePath, fileStat };
}

function validateStoredEntries(entries, revision) {
  if (!isPlainList(entries)) {
    throw new Error('Corrupt knowledge store: entries must be a plain array');
  }
  if (entries.length > MAX_ENTRIES) {
    throw new RangeError(`Knowledge store entries count ${entries.length} exceeds limit of ${MAX_ENTRIES}`);
  }
  const byId = new Map();
  const normalized = entries.map((entry, index) => {
    requireExactShape(entry, ENTRY_KEYS, `entries[${index}]`);
    const id = validateSectionId(entry.id, `entries[${index}].id`);
    if (byId.has(id)) {
      throw new Error(`Corrupt knowledge store: duplicate entry id "${id}"`);
    }
    const version = validatePositiveInt(entry.version, `entries[${index}].version`);
    if (version > revision) {
      throw new Error(`Corrupt knowledge store: entry "${id}" version ${version} exceeds store revision ${revision}`);
    }
    if (typeof entry.deleted !== 'boolean') {
      throw new TypeError(`Corrupt knowledge store: entries[${index}].deleted must be a boolean`);
    }
    let section = null;
    if (entry.deleted) {
      if (entry.section !== null) {
        throw new Error(`Corrupt knowledge store: tombstone "${id}" must have null section`);
      }
    } else {
      if (entry.section === null) {
        throw new Error(`Corrupt knowledge store: active entry "${id}" cannot have null section`);
      }
      section = validateSection(entry.section);
      if (section.id !== id) {
        throw new Error(`Corrupt knowledge store: entry "${id}" section id "${section.id}" mismatch`);
      }
    }
    const record = { id, version, deleted: entry.deleted, section };
    byId.set(id, record);
    return record;
  });
  return { normalized, byId };
}

function validateStoredJournal(journal, revision, entriesById) {
  if (!isPlainList(journal)) {
    throw new Error('Corrupt knowledge store: journal must be a plain array');
  }
  if (journal.length > MAX_JOURNAL_ENTRIES) {
    throw new RangeError(`Knowledge store journal count ${journal.length} exceeds limit of ${MAX_JOURNAL_ENTRIES}`);
  }
  if ((revision === 0 && journal.length > 0) || (revision > 0 && journal.length === 0)) {
    throw new Error('Corrupt knowledge store: revision and journal state mismatch');
  }
  if (journal.length !== revision) throw new Error('Corrupt knowledge store: journal revisions are incomplete');
  const seenOps = new Set(), sectionVersions = new Map();
  let previousRevision = 0;
  const normalized = journal.map((item, index) => {
    requireExactShape(item, RECEIPT_KEYS, `journal[${index}]`);
    const operationId = validateBoundedId(item.operationId, `journal[${index}].operationId`);
    if (seenOps.has(operationId)) {
      throw new Error(`Corrupt knowledge store: duplicate operationId "${operationId}" in journal`);
    }
    seenOps.add(operationId);
    if (typeof item.hash !== 'string' || !CONTENT_HASH_PATTERN.test(item.hash)) {
      throw new Error(`Corrupt knowledge store: journal[${index}].hash must be a 64-character hex sha256`);
    }
    const itemRevision = validatePositiveInt(item.revision, `journal[${index}].revision`);
    if (itemRevision !== index + 1 || itemRevision > revision) {
      throw new Error(`Corrupt knowledge store: out-of-order journal revision ${itemRevision}`);
    }
    previousRevision = itemRevision;
    const updatedAt = validateNonNegativeInt(item.updatedAt, `journal[${index}].updatedAt`);
    if (!isPlainList(item.versions) || item.versions.length === 0 || item.versions.length > MAX_BATCH_SIZE) {
      throw new Error(`Corrupt knowledge store: journal[${index}].versions must be a bounded non-empty array`);
    }
    const seenVersionIds = new Set();
    const versions = item.versions.map((ver, vIndex) => {
      requireExactShape(ver, VERSION_KEYS, `journal[${index}].versions[${vIndex}]`);
      const id = validateSectionId(ver.id, `journal[${index}].versions[${vIndex}].id`);
      if (seenVersionIds.has(id)) {
        throw new Error(`Corrupt knowledge store: duplicate id "${id}" in journal[${index}].versions`);
      }
      seenVersionIds.add(id);
      const version = validatePositiveInt(ver.version, `journal[${index}].versions[${vIndex}].version`);
      const entry = entriesById.get(id);
      if (!entry || entry.version < version) {
        throw new Error(`Corrupt knowledge store: journal references missing or newer version for "${id}"`);
      }
      if (version !== (sectionVersions.get(id)?.version || 0) + 1) throw new Error(`Corrupt knowledge store: noncontiguous section version for "${id}"`);
      const prior = sectionVersions.get(id);
      if (typeof ver.deleted !== 'boolean' || prior?.deleted || (version === 1 && ver.deleted)) throw new Error(`Corrupt knowledge store: invalid deletion history for "${id}"`);
      sectionVersions.set(id, { version, deleted: ver.deleted });
      return { id, version, deleted: ver.deleted };
    });
    return { operationId, hash: item.hash, revision: itemRevision, updatedAt, versions };
  });
  if (journal.length > 0 && previousRevision !== revision) {
    throw new Error(`Corrupt knowledge store: latest journal revision ${previousRevision} does not match store revision ${revision}`);
  }
  for (const [id, entry] of entriesById) {
    if (sectionVersions.get(id)?.version !== entry.version || sectionVersions.get(id)?.deleted !== entry.deleted || (entry.deleted && entry.version < 2)) throw new Error(`Corrupt knowledge store: entry version has no matching journal history for "${id}"`);
  }
  return normalized;
}

function loadAndValidateStore(rootDir, projectId) {
  const { filePath, fileStat } = resolveProjectPaths(rootDir, projectId);
  if (!fileStat) {
    return {
      filePath,
      doc: {
        schemaVersion: SCHEMA_VERSION,
        projectId,
        revision: 0,
        entries: [],
        journal: []
      }
    };
  }
  if (fileStat.size > MAX_DOCUMENT_BYTES) {
    throw new RangeError(`Knowledge store document size ${fileStat.size} exceeds limit of ${MAX_DOCUMENT_BYTES} bytes`);
  }
  const raw = readJson(filePath, null);
  requireExactShape(raw, STORE_KEYS, 'document');
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Unsupported knowledge store schemaVersion ${JSON.stringify(raw.schemaVersion)} (expected ${SCHEMA_VERSION})`);
  }
  if (raw.projectId !== projectId) {
    throw new Error(`Corrupt knowledge store: document projectId "${raw.projectId}" does not match "${projectId}"`);
  }
  const revision = validateNonNegativeInt(raw.revision, 'revision');
  const { normalized: entries, byId: entriesById } = validateStoredEntries(raw.entries, revision);
  if (revision === 0 && entries.length > 0) {
    throw new Error('Corrupt knowledge store: revision 0 cannot contain entries');
  }
  const journal = validateStoredJournal(raw.journal, revision, entriesById);
  return {
    filePath,
    doc: {
      schemaVersion: SCHEMA_VERSION,
      projectId,
      revision,
      entries,
      journal
    }
  };
}

function applyBatchToEntries(currentEntries, changes) {
  const nextEntries = currentEntries.map(entry => ({ ...entry }));
  const indexById = new Map(nextEntries.map((entry, idx) => [entry.id, idx]));
  const appliedVersions = [];

  for (const change of changes) {
    const existingIndex = indexById.get(change.id);
    if (existingIndex === undefined) {
      if (change.expectedVersion !== 0) {
        throw new Error(`Version conflict for missing section "${change.id}": expected ${change.expectedVersion}, actual 0`);
      }
      const created = { id: change.id, version: 1, deleted: false, section: change.section };
      indexById.set(change.id, nextEntries.length);
      nextEntries.push(created);
      appliedVersions.push({ id: change.id, version: 1, deleted: false });
      continue;
    }
    const current = nextEntries[existingIndex];
    if (current.deleted) {
      throw new Error(`Tombstone section "${change.id}" cannot be updated, deleted or resurrected`);
    }
    if (change.expectedVersion !== current.version) {
      throw new Error(`Version conflict for section "${change.id}": expected ${change.expectedVersion}, actual ${current.version}`);
    }
    const nextVersion = current.version + 1;
    nextEntries[existingIndex] = {
      id: change.id,
      version: nextVersion,
      deleted: change.section === null,
      section: change.section
    };
    appliedVersions.push({ id: change.id, version: nextVersion, deleted: change.section === null });
  }

  if (nextEntries.length > MAX_ENTRIES) {
    throw new RangeError(`Knowledge store entries count ${nextEntries.length} exceeds limit of ${MAX_ENTRIES}`);
  }
  return { nextEntries, appliedVersions };
}

class ProjectKnowledge {
  constructor(root, options = {}) {
    if (typeof root !== 'string' || root.trim().length === 0 || root.includes('\0')) {
      throw new TypeError('ProjectKnowledge root must be a non-empty path string');
    }
    if (!isPlainRecord(options)) {
      throw new TypeError('ProjectKnowledge options must be a plain object');
    }
    const { now = Date.now, writeJson = atomicJson, ...rest } = options;
    if (Object.keys(rest).length > 0) {
      throw new TypeError(`Unknown ProjectKnowledge option "${Object.keys(rest)[0]}"`);
    }
    if (typeof now !== 'function') {
      throw new TypeError('ProjectKnowledge option "now" must be a function');
    }
    if (typeof writeJson !== 'function') {
      throw new TypeError('ProjectKnowledge option "writeJson" must be a function');
    }
    this.root = path.resolve(root);
    this._now = now;
    this._writeJson = writeJson;
  }

  snapshot(projectId) {
    const { doc } = loadAndValidateStore(this.root, projectId);
    return deepFreeze(doc);
  }

  commit(projectId, payload) {
    const normalized = validateAndNormalizeCommitInput(projectId, payload);
    const { filePath, doc } = loadAndValidateStore(this.root, projectId);

    const existingReceipt = doc.journal.find(item => item.operationId === normalized.operationId);
    if (existingReceipt) {
      if (existingReceipt.hash !== normalized.hash) {
        throw new Error(`Operation "${normalized.operationId}" was already committed with a different payload`);
      }
      return deepFreeze(existingReceipt);
    }

    const updatedAt = validateNonNegativeInt(this._now(), 'now() timestamp');
    const { nextEntries, appliedVersions } = applyBatchToEntries(doc.entries, normalized.changes);
    const nextRevision = doc.revision + 1;
    const receipt = {
      operationId: normalized.operationId,
      hash: normalized.hash,
      revision: nextRevision,
      updatedAt,
      versions: appliedVersions
    };
    const nextJournal = [...doc.journal, receipt];
    if (nextJournal.length > MAX_JOURNAL_ENTRIES) {
      throw new RangeError(`Knowledge store journal count ${nextJournal.length} exceeds limit of ${MAX_JOURNAL_ENTRIES}`);
    }

    const nextDoc = {
      schemaVersion: SCHEMA_VERSION,
      projectId,
      revision: nextRevision,
      entries: nextEntries,
      journal: nextJournal
    };
    const serialized = JSON.stringify(nextDoc, null, 2);
    const byteLength = Buffer.byteLength(serialized, 'utf8');
    if (byteLength > MAX_DOCUMENT_BYTES) {
      throw new RangeError(`Knowledge store document size ${byteLength} bytes exceeds limit of ${MAX_DOCUMENT_BYTES} bytes`);
    }

    checkNoSymlinkChain(this.root, path.dirname(filePath), filePath);
    this._writeJson(filePath, nextDoc);
    return deepFreeze(receipt);
  }
}

ProjectKnowledge.ProjectKnowledge = ProjectKnowledge;
ProjectKnowledge.SCHEMA_VERSION = SCHEMA_VERSION;
ProjectKnowledge.MAX_BATCH_SIZE = MAX_BATCH_SIZE;
ProjectKnowledge.MAX_ENTRIES = MAX_ENTRIES;
ProjectKnowledge.MAX_JOURNAL_ENTRIES = MAX_JOURNAL_ENTRIES;
ProjectKnowledge.MAX_DOCUMENT_BYTES = MAX_DOCUMENT_BYTES;

module.exports = Object.freeze(ProjectKnowledge);
