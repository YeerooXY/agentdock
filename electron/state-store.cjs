'use strict';
// Main-process state store. Services write allowlisted DTOs into named slices
// after they persist; the store coalesces writes per tick, bumps each changed
// slice's revision once and notifies subscribers with one batch.
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { SLICES, SLICE_NAMES, isSecretField, ProtocolError, isPlainObject, secretPaths, emptyValue, validateCollection, implicitOrder, applyPatch } = require('./state-protocol.cjs');

const fail = message => { throw new ProtocolError('invalid', message); };

// Copies a value into frozen JSON data. Undefined object fields are dropped and
// undefined array items or non-finite numbers become null, as JSON does.
function freezeJson(value, path = 'value', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === undefined) return null;
  if (typeof value !== 'object') fail(`${path} is not JSON data.`);
  if (seen.has(value)) fail(`${path} is circular.`);
  seen.add(value);
  let copy;
  if (Array.isArray(value)) copy = value.map((item, index) => freezeJson(item, `${path}[${index}]`, seen));
  else if (isPlainObject(value)) {
    copy = {};
    for (const [key, item] of Object.entries(value)) if (item !== undefined && typeof item !== 'function') copy[key] = freezeJson(item, `${path}.${key}`, seen);
  } else fail(`${path} is not JSON data.`);
  seen.delete(value);
  return Object.freeze(copy);
}

// Equality under JSON semantics, without copying either side.
function jsonEqual(a, b) {
  if (a === b) return true;
  const na = a === undefined || (typeof a === 'number' && !Number.isFinite(a)) ? null : a;
  const nb = b === undefined || (typeof b === 'number' && !Number.isFinite(b)) ? null : b;
  if (na === nb) return true;
  if (na === null || nb === null || typeof na !== 'object' || typeof nb !== 'object') return false;
  if (Array.isArray(na) !== Array.isArray(nb)) return false;
  if (Array.isArray(na)) {
    if (na.length !== nb.length) return false;
    for (let i = 0; i < na.length; i++) if (!jsonEqual(na[i], nb[i])) return false;
    return true;
  }
  const keys = obj => Object.keys(obj).filter(key => obj[key] !== undefined && typeof obj[key] !== 'function');
  const ka = keys(na), kb = keys(nb);
  if (ka.length !== kb.length) return false;
  for (const key of ka) if (!Object.prototype.hasOwnProperty.call(nb, key) || !jsonEqual(na[key], nb[key])) return false;
  return true;
}

// Removes secret-named fields from a copy. Used when the store runs with the
// `strip` policy; the `throw` policy rejects the write instead.
function stripSecrets(value, test = isSecretField) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => stripSecrets(item, test));
  const copy = {};
  for (const [key, item] of Object.entries(value)) if (!test(key, item)) copy[key] = stripSecrets(item, test);
  return copy;
}

function collectionChange(slice, before, after, baseRev, rev) {
  const upsert = {}, remove = [];
  for (const id of after.order) if (!Object.prototype.hasOwnProperty.call(before.byId, id) || !jsonEqual(before.byId[id], after.byId[id])) upsert[id] = after.byId[id];
  for (const id of before.order) if (!Object.prototype.hasOwnProperty.call(after.byId, id)) remove.push(id);
  const change = { kind: 'patch', slice, baseRev, rev, upsert, remove };
  if (!jsonEqual(implicitOrder(before, upsert, remove), after.order)) change.order = after.order;
  if (!jsonEqual(before.meta || {}, after.meta || {})) change.meta = after.meta || {};
  return change;
}

class StateStore extends EventEmitter {
  // policy: 'throw' rejects a write that carries a secret-named field; 'strip'
  // drops those fields and reports them through onSecret. Tests use 'throw'.
  constructor({ epoch = crypto.randomUUID(), slices = SLICES, policy = 'throw', onSecret = () => {}, schedule = queueMicrotask } = {}) {
    super();
    if (!['throw', 'strip'].includes(policy)) throw new Error('Choose throw or strip.');
    this.epoch = epoch; this.definitions = slices; this.policy = policy; this.onSecret = onSecret; this.schedule = schedule;
    this.values = {}; this.revs = {}; this.owners = new Map();
    for (const slice of Object.keys(slices)) { this.values[slice] = freezeJson(emptyValue(slice)); this.revs[slice] = 0; }
    this.staged = new Map(); this.transactions = []; this.scheduled = false; this.batch = 0;
  }
  // Each slice has exactly one writer. Claim returns that writer's handle.
  claim(slice, owner) {
    this.definition(slice);
    if (typeof owner !== 'string' || !owner) throw new Error('Name the slice owner.');
    if (this.owners.has(slice)) throw new Error(`${slice} already has a writer (${this.owners.get(slice)}).`);
    this.owners.set(slice, owner);
    return Object.freeze({
      slice, owner,
      set: value => this.write(slice, owner, { set: value }),
      patch: change => this.write(slice, owner, { patch: change }),
    });
  }
  definition(slice) {
    if (!Object.prototype.hasOwnProperty.call(this.definitions, slice)) throw new Error(`Unknown slice: ${String(slice).slice(0, 40)}.`);
    return this.definitions[slice];
  }
  get(slice) { this.definition(slice); return this.values[slice]; }
  revision(slice) { this.definition(slice); return this.revs[slice]; }
  cursor() { return { epoch: this.epoch, revs: { ...this.revs } }; }
  state() { return { ...this.values }; }
  // Writes inside fn are staged together and discarded if fn throws.
  transaction(fn) {
    const writes = new Map();
    this.transactions.push(writes);
    let result;
    try {
      result = fn();
      if (result && typeof result.then === 'function') throw new Error('Transactions group synchronous writes only.');
    } catch (error) { this.transactions.pop(); throw error; }
    this.transactions.pop();
    const target = this.transactions.at(-1) || this.staged;
    for (const [slice, value] of writes) target.set(slice, value);
    if (!this.transactions.length) this.request();
    return result;
  }
  pending(slice) {
    for (let i = this.transactions.length - 1; i >= 0; i--) if (this.transactions[i].has(slice)) return this.transactions[i].get(slice);
    return this.staged.has(slice) ? this.staged.get(slice) : this.values[slice];
  }
  write(slice, owner, { set, patch }) {
    if (this.owners.get(slice) !== owner) throw new Error(`${owner} does not write ${slice}.`);
    const kind = this.definition(slice).kind;
    let next;
    if (patch !== undefined) {
      if (kind !== 'collection') throw new Error(`${slice} is a value; use set.`);
      if (!patch || typeof patch !== 'object') throw new Error('Patch needs {upsert, remove, order?, meta?}.');
      const upsert = patch.upsert || {}, remove = patch.remove || [];
      next = applyPatch(this.pending(slice), { upsert: Object.fromEntries(Object.entries(upsert).map(([id, item]) => [id, this.clean(slice, item)])), remove, order: patch.order, meta: patch.meta === undefined ? undefined : this.clean(slice, patch.meta) });
    } else {
      next = this.clean(slice, set);
      if (kind === 'collection') validateCollection(next, slice);
    }
    // Copy now: later mutation of a service object cannot reach the store.
    next = freezeJson(next, slice);
    (this.transactions.at(-1) || this.staged).set(slice, next);
    if (!this.transactions.length) this.request();
  }
  clean(slice, value) {
    const found = secretPaths(value);
    if (!found.length) return value;
    if (this.policy === 'throw') throw new ProtocolError('invalid', `${slice} contains private fields: ${found.slice(0, 5).join(', ')}.`);
    this.onSecret(slice, found);
    return stripSecrets(value);
  }
  request() {
    if (this.scheduled || !this.staged.size) return;
    this.scheduled = true;
    this.schedule(() => { this.scheduled = false; this.commit(); });
  }
  // Commits staged writes now. Returns the batch, or null when nothing changed.
  commit() {
    if (this.transactions.length || !this.staged.size) return null;
    const staged = this.staged; this.staged = new Map();
    const changes = [];
    for (const slice of Object.keys(this.definitions)) {
      if (!staged.has(slice)) continue;
      const before = this.values[slice], after = staged.get(slice);
      if (jsonEqual(before, after)) continue;
      const baseRev = this.revs[slice], rev = baseRev + 1;
      changes.push(this.definition(slice).kind === 'collection'
        ? collectionChange(slice, before, after, baseRev, rev)
        : { kind: 'replace', slice, baseRev, rev, value: after });
      this.values[slice] = after; this.revs[slice] = rev;
    }
    if (!changes.length) return null;
    const batch = Object.freeze({ epoch: this.epoch, batch: ++this.batch, changes: Object.freeze(changes), revs: Object.freeze({ ...this.revs }) });
    this.emit('commit', batch);
    return batch;
  }
  subscribe(listener) { this.on('commit', listener); return () => this.off('commit', listener); }
  // A reset change per slice, for clients without matching cached values.
  reset(slices = SLICE_NAMES.filter(slice => slice in this.definitions)) {
    return slices.map(slice => ({ kind: 'reset', slice, rev: this.revision(slice), value: this.get(slice) }));
  }
}

module.exports = { StateStore, freezeJson, jsonEqual, collectionChange, stripSecrets };
