'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { atomicJson, readJson } = require('./storage.cjs');

const EXECUTION_HISTORY_SCHEMA_VERSION = 1;
const KINDS = new Set(['task', 'review']);
const RECORD_KEYS = new Set(['schemaVersion', 'kind', 'id', 'title', 'report', 'outcome', 'revision', 'updatedAt']);
const FORBIDDEN_KEYS = new Set(['constructor', 'prototype', '__proto__']);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_TITLE_LENGTH = 200, MAX_REPORT_BYTES = 2 * 1024 * 1024, MAX_OUTCOME_BYTES = 256 * 1024;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function lstatIfExists(target) {
  try { return fs.lstatSync(target); }
  catch (error) { if (error && error.code === 'ENOENT') return null; throw error; }
}

function validateKey(kind, id) {
  if (!KINDS.has(kind)) throw new Error('Execution history kind must be "task" or "review".');
  if (typeof id !== 'string' || !ID_PATTERN.test(id) || FORBIDDEN_KEYS.has(id)) throw new Error('Execution history ID must be 1 to 100 letters, numbers, dashes or underscores.');
}
function validateText(value, label, { maxChars = Infinity, maxBytes = Infinity } = {}) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error(`${label} must be plain text.`);
  if (value.length > maxChars || Buffer.byteLength(value, 'utf8') > maxBytes) throw new Error(`${label} exceeds the maximum size.`);
  return value;
}

function cloneJsonValue(value, seen = new Set(), depth = 0) {
  if (depth > 32) throw new Error('Execution history outcome nesting is too deep.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string' && value.includes('\0')) throw new Error('Execution history outcome strings cannot contain null bytes.');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Execution history outcome numbers must be finite.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') throw new Error('Execution history outcome must be JSON-safe.');
  if (seen.has(value)) throw new Error('Execution history outcome cannot contain circular references.');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length || Object.keys(value).some(k => !/^(?:0|[1-9]\d*)$/.test(k))) {
        throw new Error('Execution history outcome arrays must contain only indexed JSON values.');
      }
      const list = new Array(value.length);
      for (let i = 0; i < value.length; i++) {
        const desc = Object.getOwnPropertyDescriptor(value, i);
        if (!desc || 'get' in desc || 'set' in desc) throw new Error('Execution history outcome arrays cannot contain sparse holes or accessors.');
        list[i] = cloneJsonValue(desc.value, seen, depth + 1);
      }
      return Object.freeze(list);
    }
    if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length) {
      throw new Error('Execution history outcome must contain only plain JSON objects.');
    }
    const copy = {};
    for (const key of Object.keys(value)) {
      if (key.includes('\0') || FORBIDDEN_KEYS.has(key)) throw new Error('Execution history outcome contains an invalid property key.');
      const desc = Object.getOwnPropertyDescriptor(value, key);
      if (!desc || 'get' in desc || 'set' in desc) throw new Error('Execution history outcome cannot contain property accessors.');
      copy[key] = cloneJsonValue(desc.value, seen, depth + 1);
    }
    return Object.freeze(copy);
  } finally { seen.delete(value); }
}

function validateOutcome(outcome) {
  if (outcome === null) return null;
  if (!isPlainObject(outcome)) throw new Error('Execution history outcome must be null or a JSON-safe object.');
  const cloned = cloneJsonValue(outcome);
  if (Buffer.byteLength(JSON.stringify(cloned), 'utf8') > MAX_OUTCOME_BYTES) throw new Error('Execution history outcome exceeds the maximum size.');
  return cloned;
}
function sameJson(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((item, i) => sameJson(item, b[i]));
  const keysA = Object.keys(a), keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every(key => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
}

function validateStoredRecord(raw, kind, id) {
  const keys = isPlainObject(raw) ? Object.keys(raw) : [];
  if (keys.length !== RECORD_KEYS.size || keys.some(key => !RECORD_KEYS.has(key)) ||
      raw.schemaVersion !== EXECUTION_HISTORY_SCHEMA_VERSION || raw.kind !== kind || raw.id !== id ||
      !Number.isInteger(raw.revision) || raw.revision < 1 || typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) {
    throw new Error('Corrupt execution history record. The file was preserved.');
  }
  try {
    const title = validateText(raw.title, 'Title', { maxChars: MAX_TITLE_LENGTH });
    const report = validateText(raw.report, 'Report', { maxBytes: MAX_REPORT_BYTES });
    const outcome = validateOutcome(raw.outcome);
    return Object.freeze({ schemaVersion: EXECUTION_HISTORY_SCHEMA_VERSION, kind, id, title, report, outcome, revision: raw.revision, updatedAt: raw.updatedAt });
  } catch { throw new Error('Corrupt execution history record. The file was preserved.'); }
}

// UTF-16 bound also keeps UTF-8 reports below the store byte limit.
function boundedText(value, limit) {
  const text = String(value || '');
  let end = Math.min(text.length, limit);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1] || '')) end--;
  return text.slice(0, end);
}

class ExecutionHistory {
  constructor(root, options = {}) {
    if (typeof root !== 'string' || !root.trim() || root.includes('\0')) throw new Error('Provide a valid storage root.');
    if (!isPlainObject(options) || typeof (options.now ?? Date.now) !== 'function') throw new Error('Provide valid execution history options.');
    this.root = path.resolve(root);
    this.dir = path.join(this.root, 'execution-history');
    this.now = options.now ?? Date.now;
  }

  checkDirectory(requireExists = false) {
    const rootStat = lstatIfExists(this.root);
    if (rootStat && (rootStat.isSymbolicLink() || !rootStat.isDirectory())) throw new Error('The execution history root was redirected.');
    const dirStat = lstatIfExists(this.dir);
    if (!dirStat) { if (requireExists) throw new Error('The execution history folder is missing.'); return false; }
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory() || path.dirname(fs.realpathSync(this.dir)) !== fs.realpathSync(this.root)) {
      throw new Error('The execution history folder was redirected.');
    }
    return true;
  }

  recordFile(kind, id) {
    const file = path.join(this.dir, `${kind}-${id}.json`);
    if (path.dirname(file) !== this.dir) throw new Error('Invalid execution history path.');
    const fileStat = lstatIfExists(file);
    if (fileStat && (fileStat.isSymbolicLink() || !fileStat.isFile() || path.dirname(fs.realpathSync(file)) !== fs.realpathSync(this.dir))) {
      throw new Error('The execution history record was redirected.');
    }
    return { file, exists: Boolean(fileStat) };
  }

  get(kind, id) {
    validateKey(kind, id);
    if (!this.checkDirectory(false)) return null;
    const { file, exists } = this.recordFile(kind, id);
    return exists ? validateStoredRecord(readJson(file, null), kind, id) : null;
  }

  read(kind, id, { offset = 0, limit = 16000, revision } = {}) {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 2 || limit > 64000) throw new Error('Invalid report page.');
    const record = this.get(kind, id);
    if (!record) throw new Error('Execution report is unavailable.');
    if (revision !== undefined && revision !== record.revision) throw new Error('Execution report changed. Open it again.');
    if (offset > record.report.length || (offset && /[\uDC00-\uDFFF]/.test(record.report[offset] || '') && /[\uD800-\uDBFF]/.test(record.report[offset - 1]))) throw new Error('Invalid report offset.');
    const text = boundedText(record.report.slice(offset), limit);
    const end = offset + text.length;
    return { title: record.title, text, revision: record.revision, offset, nextOffset: end < record.report.length ? end : null, totalChars: record.report.length };
  }

  put(entry) {
    if (!isPlainObject(entry)) throw new Error('Execution history entry must be an object.');
    const { kind, id, title: rawTitle, report: rawReport, outcome: rawOutcome = null } = entry;
    validateKey(kind, id);
    const title = validateText(rawTitle, 'Title', { maxChars: MAX_TITLE_LENGTH });
    const report = validateText(rawReport, 'Report', { maxBytes: MAX_REPORT_BYTES });
    const outcome = validateOutcome(rawOutcome);
    const updatedAt = this.now();
    if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) throw new Error('Execution history timestamp must be finite.');
    const existing = this.get(kind, id);
    if (existing && existing.title === title && existing.report === report && sameJson(existing.outcome, outcome)) return existing;
    if (!this.checkDirectory(false)) { fs.mkdirSync(this.dir, { recursive: true }); this.checkDirectory(true); }
    const { file } = this.recordFile(kind, id);
    const record = Object.freeze({ schemaVersion: EXECUTION_HISTORY_SCHEMA_VERSION, kind, id, title, report, outcome, revision: existing ? existing.revision + 1 : 1, updatedAt });
    atomicJson(file, record);
    return record;
  }
}

module.exports = { ExecutionHistory, EXECUTION_HISTORY_SCHEMA_VERSION, boundedText };
