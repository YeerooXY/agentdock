'use strict';
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { readJson, atomicJson } = require('./storage.cjs');

const MAX_RECORDS = 1000;
const MAX_CLAIM = 16;
const MAX_TOUCHED_PATHS = 256;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/;
const RECORD_KEYS = ['operationId', 'taskId', 'projectId', 'rootId', 'baseSnapshot', 'targetSnapshot', 'diffHash', 'touchedPaths'];
// Optional versioned metadata. Legacy records without it keep their previous meaning.
const OPTIONAL_RECORD_KEYS = ['deltaEvidence'];
const DELTA_EVIDENCE_KEYS = ['schemaVersion', 'complete', 'omittedCount', 'changedCount'];

function isValidId(v) { return typeof v === 'string' && ID_PATTERN.test(v); }
function isValidSha256(v) { return typeof v === 'string' && SHA256_PATTERN.test(v); }
function isValidPath(p) {
  if (typeof p !== 'string' || !p || p.length > 1000 || /[:\x00-\x1f]/.test(p) || p.includes('\\') || p.includes('\0')) return false;
  if (p.startsWith('/') || path.isAbsolute(p) || /^[a-zA-Z]:/.test(p)) return false;
  return !p.split('/').some(s => !s || s === '.' || s === '..');
}

// deltaEvidence: {schemaVersion:1, complete, omittedCount, changedCount}. changedCount null means the changed list was unavailable.
function validateDeltaEvidence(value) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('deltaEvidence must be a plain object');
  if (Object.keys(value).some(key => !DELTA_EVIDENCE_KEYS.includes(key)) || value.schemaVersion !== 1 || typeof value.complete !== 'boolean' ||
      !Number.isSafeInteger(value.omittedCount) || value.omittedCount < 0 || (value.changedCount !== null && (!Number.isSafeInteger(value.changedCount) || value.changedCount < 0))) throw new Error('Invalid deltaEvidence');
}

function validateRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Record must be an object');
  const keys = Object.keys(record);
  if (keys.some(k => !RECORD_KEYS.includes(k) && !OPTIONAL_RECORD_KEYS.includes(k)) || RECORD_KEYS.some(k => !keys.includes(k))) throw new Error('Record has unknown or missing fields');
  validateDeltaEvidence(record.deltaEvidence);
  if (!isValidId(record.operationId) || !isValidId(record.taskId) || !isValidId(record.projectId)) throw new Error('Invalid ID field in record');
  if (!isValidSha256(record.rootId)) throw new Error('rootId must be a valid SHA256');
  if (record.baseSnapshot !== null && !isValidSha256(record.baseSnapshot)) throw new Error('Invalid baseSnapshot');
  if (record.targetSnapshot !== null && !isValidSha256(record.targetSnapshot)) throw new Error('Invalid targetSnapshot');
  if (record.diffHash !== null && !isValidSha256(record.diffHash)) throw new Error('Invalid diffHash');
  if (!Array.isArray(record.touchedPaths) || record.touchedPaths.length > MAX_TOUCHED_PATHS) throw new Error(`touchedPaths must be an array of at most ${MAX_TOUCHED_PATHS} paths`);
  for (const p of record.touchedPaths) {
    if (!isValidPath(p)) throw new Error(`Invalid touchedPath: ${p}`);
  }
}

function isSamePayload(a, b) {
  if (a.taskId !== b.taskId || a.projectId !== b.projectId || a.rootId !== b.rootId ||
      a.baseSnapshot !== b.baseSnapshot || a.targetSnapshot !== b.targetSnapshot ||
      a.diffHash !== b.diffHash || a.touchedPaths.length !== b.touchedPaths.length ||
      JSON.stringify(a.deltaEvidence ?? null) !== JSON.stringify(b.deltaEvidence ?? null)) return false;
  return [...a.touchedPaths].sort().every((p, i) => p === [...b.touchedPaths].sort()[i]);
}

function cloneRecord(r) { return structuredClone(r); }
function validateCompletion(reason, receipt) {
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) throw Error('Queue reason must be a bounded string.');
  if (receipt !== undefined && (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.getPrototypeOf(receipt) !== Object.prototype || Buffer.byteLength(JSON.stringify(receipt)) > 8192)) throw Error('Queue receipt must be a bounded plain JSON object.');
}

class KnowledgeQueue {
  constructor(root, { now = Date.now } = {}) {
    if (typeof root !== 'string' || !root) throw new Error('root directory is required');
    this.root = root;
    this.now = typeof now === 'function' ? now : Date.now;
    this._loaded = new Set();
    this._cache = new Map(); this._revision = new Map();
  }

  _file(projectId) {
    if (!isValidId(projectId)) throw new Error('Invalid projectId');
    let cursor = this.root; for (const part of ['', 'knowledge-queue', `${projectId}.json`]) { if (part) cursor = path.join(cursor, part); try { if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('Linked queue storage is unavailable.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    return path.join(this.root, 'knowledge-queue', `${projectId}.json`);
  }

  _save(projectId, records) {
    if (Buffer.byteLength(JSON.stringify(records)) > 8 * 1024 * 1024) throw Error('Queue storage exceeds its size limit.');
    atomicJson(this._file(projectId), records);
    this._revision.set(projectId, (this._revision.get(projectId) || 0) + 1);
  }

  _load(projectId) {
    const file = this._file(projectId);
    if (this._loaded.has(projectId)) return this._cache.get(projectId);
    if (!fs.existsSync(file)) {
      this._loaded.add(projectId);
      this._cache.set(projectId, []);
      return [];
    }
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 8 * 1024 * 1024) throw Error('Queue storage is linked or exceeds its size limit.');
    const raw = readJson(file, []);
    if (!Array.isArray(raw) || raw.length > MAX_RECORDS) throw Error('Invalid persisted queue.');
    const ids = new Set();
    for (const record of raw) {
      if (Object.keys(record || {}).some(key => ![...RECORD_KEYS, ...OPTIONAL_RECORD_KEYS, 'status', 'state', 'batchId', 'enqueuedAt', 'reason', 'receipt'].includes(key))) throw Error('Unknown persisted queue field.');
      validateRecord(Object.fromEntries(RECORD_KEYS.map(key => [key, record?.[key]])));
      validateDeltaEvidence(record.deltaEvidence);
      if (record.projectId !== projectId || ids.has(record.operationId) || !['pending', 'running', 'committed', 'blocked', 'uncertain'].includes(record.status) || record.state !== record.status || !Number.isFinite(record.enqueuedAt) || record.enqueuedAt < 0 || record.batchId !== null && !isValidId(record.batchId)) throw Error('Invalid persisted queue record.');
      validateCompletion(record.reason, record.receipt); ids.add(record.operationId);
    }
    let modified = false;
    for (const r of raw) {
      if (r.status === 'running' || r.state === 'running') {
        r.status = 'uncertain';
        r.state = 'uncertain';
        if (!r.reason) r.reason = 'interrupted';
        modified = true;
      }
    }
    if (modified) this._save(projectId, raw);
    this._loaded.add(projectId);
    this._cache.set(projectId, raw);
    return raw;
  }

  revision(projectId) { this._load(projectId); return this._revision.get(projectId) || 0; }

  state(projectId) {
    return this._load(projectId).map(cloneRecord);
  }

  // One cloned record, so per-operation checks do not copy the whole project queue.
  find(projectId, operationId) {
    const record = this._load(projectId).find(r => r.operationId === operationId);
    return record ? cloneRecord(record) : null;
  }

  dirty(projectId) {
    return this._load(projectId).filter(r => r.status !== 'committed').map(cloneRecord);
  }

  enqueue(record) {
    validateRecord(record);
    const records = this._load(record.projectId);
    const existing = records.find(r => r.operationId === record.operationId);
    if (existing) {
      if (isSamePayload(existing, record)) return cloneRecord(existing);
      throw new Error(`Conflicting duplicate operationId: ${record.operationId}`);
    }
    if (records.length >= MAX_RECORDS) throw new Error(`Queue capacity reached (max ${MAX_RECORDS} records)`);

    const entry = {
      operationId: record.operationId,
      taskId: record.taskId,
      projectId: record.projectId,
      rootId: record.rootId,
      baseSnapshot: record.baseSnapshot,
      targetSnapshot: record.targetSnapshot,
      diffHash: record.diffHash,
      touchedPaths: [...record.touchedPaths],
      status: 'pending',
      state: 'pending',
      batchId: null,
      enqueuedAt: this.now(),
      ...(record.deltaEvidence !== undefined ? { deltaEvidence: structuredClone(record.deltaEvidence) } : {})
    };

    const next = [...records, entry];
    this._save(record.projectId, next);
    this._cache.set(record.projectId, next);
    return cloneRecord(entry);
  }

  claim(projectId, { maxPaths = MAX_TOUCHED_PATHS } = {}) {
    if (!Number.isInteger(maxPaths) || maxPaths < 1 || maxPaths > MAX_TOUCHED_PATHS) throw Error('Invalid maintenance batch path limit.');
    const records = this._load(projectId);
    let targetRootId = null;
    const selected = [];
    let coalescedPaths = new Set();

    for (const r of records) {
      if (r.status !== 'pending' || r.targetSnapshot === null) continue;
      if (!targetRootId) targetRootId = r.rootId;
      else if (r.rootId !== targetRootId) continue;

      const union = new Set(coalescedPaths);
      for (const p of r.touchedPaths) union.add(p);
      if (union.size > maxPaths) continue;

      coalescedPaths = union;
      selected.push(r);
      if (selected.length >= MAX_CLAIM) break;
    }

    if (selected.length === 0) return null;

    const batchId = crypto.randomUUID();
    const selectedIds = new Set(selected.map(r => r.operationId));
    const next = records.map(r => {
      if (!selectedIds.has(r.operationId)) return r;
      return { ...r, status: 'running', state: 'running', batchId };
    });

    this._save(projectId, next);
    this._cache.set(projectId, next);

    return {
      id: batchId,
      projectId,
      rootId: targetRootId,
      operationIds: selected.map(r => r.operationId),
      baseSnapshot: selected[0].baseSnapshot,
      targetSnapshot: selected[selected.length - 1].targetSnapshot,
      touchedPaths: Array.from(coalescedPaths),
      // Legacy records have no evidence and are treated as before. Unknown lists must never become an empty proof.
      deltaComplete: selected.every(r => !r.deltaEvidence || r.deltaEvidence.complete === true),
      deltaUnknown: selected.some(r => r.deltaEvidence && r.deltaEvidence.complete === false && (r.deltaEvidence.changedCount === null || r.deltaEvidence.changedCount > MAX_TOUCHED_PATHS))
    };
  }

  finish(projectId, batchId, { state, reason, receipt } = {}) {
    if (!isValidId(batchId)) throw new Error('Invalid batchId');
    if (!['committed', 'blocked', 'uncertain'].includes(state)) throw new Error(`Invalid state: ${state}`);
    validateCompletion(reason, receipt);
    const records = this._load(projectId);
    let updated = 0;
    const next = records.map(r => {
      if (r.batchId === batchId && (r.status === 'running' || r.state === 'running')) {
        updated++;
        const item = { ...r, status: state, state };
        if (reason !== undefined) item.reason = reason;
        if (receipt !== undefined) item.receipt = structuredClone(receipt);
        return item;
      }
      return r;
    });

    if (updated === 0) throw new Error(`Running batch not found: ${batchId}`);

    this._save(projectId, next);
    this._cache.set(projectId, next);
    return true;
  }

  // Settles one operation with a receipt. The caller passes the record it proved against; a changed
  // payload, state or revision aborts. Replaying the same settlement returns the committed record.
  settle(projectId, operationId, { expected, expectedRevision, receipt, reason } = {}) {
    if (!isValidId(operationId)) throw new Error('Invalid operationId');
    validateCompletion(reason, receipt);
    if (!receipt) throw new Error('Settlement requires a receipt.');
    if (!expected || typeof expected !== 'object' || !['pending', 'blocked', 'uncertain'].includes(expected.status) || !expected.payload) throw new Error('Settlement requires the expected record state.');
    const records = this._load(projectId);
    const index = records.findIndex(r => r.operationId === operationId);
    if (index < 0) throw new Error(`Queue record not found: ${operationId}`);
    const current = records[index];
    if (!isSamePayload(current, expected.payload)) throw new Error('Queue record changed before settlement.');
    if (current.status === 'committed') {
      if (JSON.stringify(current.receipt) === JSON.stringify(receipt)) return cloneRecord(current);
      throw new Error('Queue record is already settled with a different receipt.');
    }
    if (current.status !== expected.status) throw new Error('Queue record changed before settlement.');
    if (expectedRevision !== undefined && expectedRevision !== this.revision(projectId)) throw new Error('Queue changed before settlement.');

    const item = { ...current, status: 'committed', state: 'committed', receipt: structuredClone(receipt) };
    if (reason !== undefined) item.reason = reason;
    const next = records.map((r, i) => i === index ? item : r);
    this._save(projectId, next);
    this._cache.set(projectId, next);
    return cloneRecord(item);
  }
}

module.exports = { KnowledgeQueue, MAX_TOUCHED_PATHS };
