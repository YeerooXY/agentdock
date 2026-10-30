'use strict';

const path = require('node:path');
const { EventEmitter } = require('node:events');
const { atomicJson, readJson } = require('./storage.cjs');
const RECENT_MS = 10 * 60_000, HEARTBEAT_MS = 15_000, PERSIST_MS = 2000;
const INTERACTIONS = new Set(['focus', 'click', 'typing', 'paste', 'scroll', 'selection', 'panel-control']);
const FLAGS = ['focused', 'selection', 'draft', 'pendingSubmission', 'ownerTurn'];
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200;

// Main owns protection and timestamps. Persist metadata only: no input, draft
// text, terminal output or credentials belong in this file.
class OwnerConsoles extends EventEmitter {
  constructor(root, { now = Date.now, write = atomicJson, schedule = setTimeout, cancel = clearTimeout } = {}) {
    super(); this.now = now; this.file = path.join(root, 'owner-consoles.json');
    Object.assign(this, { write, schedule, cancel });
    this.records = new Map(); this.connected = false; this.heartbeatAt = null;
    const saved = readJson(this.file, { version: 1, consoles: [] });
    if (saved.version !== 1 || !Array.isArray(saved.consoles)) throw new Error('Unsupported owner console registry.');
    for (const raw of saved.consoles) {
      if (!validId(raw.consoleKey) || !validId(raw.launchId)) throw new Error('Invalid owner console registry.');
      const record = this.clean(raw);
      record.activityKnown = false; this.records.set(record.consoleKey, record);
    }
  }
  clean(raw) {
    return { consoleKey: raw.consoleKey, launchId: raw.launchId, projectId: raw.projectId || null,
      accountId: raw.accountId || null, quotaGroupId: raw.quotaGroupId || raw.accountId || null,
      local: raw.local === true, ownerCreated: raw.ownerCreated === true,
      ownerManaged: raw.ownerCreated === true || raw.ownerManaged === true,
      lastInteractionAt: Number.isFinite(raw.lastInteractionAt) ? raw.lastInteractionAt : null,
      pendingAt: Number.isFinite(raw.pendingAt) ? raw.pendingAt : null,
      ...Object.fromEntries(FLAGS.map(flag => [flag, raw[flag] === true])),
      activityKnown: raw.activityKnown === true, reserved: raw.reserved === true };
  }
  current(consoleKey, launchId) {
    const record = this.records.get(consoleKey);
    if (!record || record.launchId !== launchId) throw new Error('The console changed. Refresh its status.');
    return record;
  }
  register(raw) {
    if (!validId(raw?.consoleKey) || !validId(raw.launchId)) throw new Error('Enter a console key and launch ID.');
    const prior = this.records.get(raw.consoleKey);
    const record = this.clean({ ...prior, ...raw,
      ownerCreated: prior?.ownerCreated || raw.ownerCreated,
      ownerManaged: prior?.ownerManaged || raw.ownerCreated,
      // Relaunch/reconnect cannot clear protection or the last reservation.
      activityKnown: prior?.launchId === raw.launchId ? prior.activityKnown : false });
    if (JSON.stringify(prior) === JSON.stringify(record)) return;
    this.records.set(record.consoleKey, record); this.changed();
  }
  qualifies(record) {
    return record.ownerManaged && (FLAGS.some(flag => record[flag]) ||
      (record.lastInteractionAt !== null && this.now() - record.lastInteractionAt <= RECENT_MS));
  }
  checkHeartbeat() {
    if (this.connected && this.now() - this.heartbeatAt > HEARTBEAT_MS) this.freeze();
  }
  isProtected(consoleKey) {
    this.checkHeartbeat();
    const record = this.records.get(consoleKey);
    return !!record && (record.ownerManaged || !record.activityKnown);
  }
  interaction(consoleKey, launchId, kind, { trusted = false, ...flags } = {}) {
    if (!trusted || !INTERACTIONS.has(kind)) return false;
    const record = this.current(consoleKey, launchId);
    if (flags.focused === true) for (const other of this.records.values()) if (other !== record) other.focused = false;
    record.ownerManaged = true; record.lastInteractionAt = this.now();
    this.updateFlags(record, flags); record.reserved = this.qualifies(record);
    this.changed(); return true;
  }
  updateFlags(record, flags) {
    for (const flag of FLAGS) if (typeof flags[flag] === 'boolean') record[flag] = flags[flag];
    if (record.pendingSubmission && record.pendingAt === null) record.pendingAt = this.now();
    if (!record.pendingSubmission) record.pendingAt = null;
  }
  // Reconnection reports flags only. It cannot promote a console or refresh
  // owner recency. Validate the entire snapshot before changing any record.
  heartbeat(snapshot) {
    if (!Array.isArray(snapshot)) throw new Error('Enter console activity.');
    const updates = snapshot.map(value => ({ value, record: this.current(value.consoleKey, value.launchId) }));
    this.connected = true; this.heartbeatAt = this.now();
    for (const record of this.records.values()) record.activityKnown = false;
    for (const { value, record } of updates) {
      this.updateFlags(record, { focused: value.focused, selection: value.selection, draft: value.draft });
      record.activityKnown = true; record.reserved = this.qualifies(record);
    }
    this.changed();
  }
  turn(consoleKey, launchId, active) {
    const record = this.current(consoleKey, launchId);
    record.ownerTurn = active === true;
    if (record.activityKnown) record.reserved = this.qualifies(record);
    this.changed();
  }
  freeze() {
    this.connected = false;
    for (const record of this.records.values()) record.activityKnown = false;
    this.changed();
  }
  release(consoleKey, launchId) {
    const record = this.current(consoleKey, launchId);
    if (record.ownerCreated) throw new Error('Owner-created consoles stay protected until closed.');
    record.ownerManaged = false; record.reserved = false;
    this.changed();
  }
  close(consoleKey, launchId) {
    this.current(consoleKey, launchId); this.records.delete(consoleKey); this.changed();
  }
  reservations() {
    this.checkHeartbeat();
    const groups = new Set();
    for (const record of this.records.values()) {
      const reserved = record.activityKnown ? this.qualifies(record) : record.reserved;
      if (reserved && record.quotaGroupId) groups.add(record.quotaGroupId);
    }
    return groups;
  }
  tier(consoleKey) {
    this.checkHeartbeat();
    const record = this.records.get(consoleKey);
    if (!record?.ownerManaged) return 5;
    if (record.focused) return 0;
    if (record.selection) return 1;
    if (record.draft) return 2;
    if (record.lastInteractionAt !== null && this.now() - record.lastInteractionAt <= RECENT_MS) return 3;
    return 4;
  }
  snapshot() { this.checkHeartbeat(); return [...this.records.values()].map(record => ({ ...record })); }
  bind(sessions, { profile = () => ({}) } = {}) {
    sessions.ownerConsoles = this;
    const bound = new Set();
    const sync = () => {
      const present = new Set();
      for (const item of sessions.items.values()) {
        if (!item.consoleKey || (!item.launchId && !item.kind) || item.dismissed) continue;
        present.add(item.consoleKey); bound.add(item.consoleKey);
        const account = profile(item);
        this.register({ consoleKey: item.consoleKey, launchId: item.launchId || item.id, projectId: item.projectId,
          accountId: item.accountId || (item.provider && `${item.provider}:default`),
          quotaGroupId: item.quotaGroupId || account.quotaGroupId || item.accountId || (item.provider && `${item.provider}:default`),
          local: item.local === true || account.local === true, ownerCreated: !item.taskId && item.purpose !== 'review' && item.kind !== 'review' });
        const record = this.records.get(item.consoleKey);
        if (record.ownerTurn && (!item.alive || item.state !== 'active')) this.turn(record.consoleKey, record.launchId, false);
      }
      for (const key of bound) if (!present.has(key)) {
        const record = this.records.get(key);
        if (record) this.close(key, record.launchId);
        bound.delete(key);
      }
    };
    sessions.on('changed', sync); sync();
    return () => { sessions.removeListener('changed', sync); delete sessions.ownerConsoles; };
  }
  changed() {
    const saved = { version: 1, consoles: [...this.records.values()] }, serialized = JSON.stringify(saved);
    // Ownership, demand flags and identity changes are durable immediately.
    // Only recency-only updates wait; scheduling always reads the exact time.
    const critical = JSON.stringify(saved.consoles.map(record => ({ ...record, lastInteractionAt: null })));
    if (!this.disposed && serialized !== this.lastSaved) {
      if (critical !== this.lastCritical || this.now() - this.lastPersistAt >= PERSIST_MS) this.flush();
      else if (!this.persistTimer) {
        this.persistTimer = this.schedule(() => {
          this.persistTimer = null;
          try { this.flush(); } catch { this.emit('persistence-error'); }
        }, PERSIST_MS - (this.now() - this.lastPersistAt));
        this.persistTimer?.unref?.();
      }
    }
    this.emit('changed');
  }
  flush() {
    if (this.persistTimer) this.cancel(this.persistTimer);
    this.persistTimer = null;
    const saved = { version: 1, consoles: [...this.records.values()] }, serialized = JSON.stringify(saved);
    if (serialized === this.lastSaved) return;
    this.write(this.file, saved); this.lastSaved = serialized; this.lastPersistAt = this.now();
    this.lastCritical = JSON.stringify(saved.consoles.map(record => ({ ...record, lastInteractionAt: null })));
  }
  dispose() { this.flush(); this.disposed = true; }
}

// One reserved lane per quota group. An owner turn already using that lane
// satisfies the reservation; hidden/background turns still count as occupied.
function ownerCapacity({ quotaGroupId, capacity, active = [], reservations = new Set(), automatic = true }) {
  const turns = active.filter(turn => turn.quotaGroupId === quotaGroupId);
  const reserved = automatic && reservations.has(quotaGroupId) && !turns.some(turn => turn.owner === true) ? 1 : 0;
  if (turns.length >= capacity) return 'Waiting for capacity';
  return turns.length + reserved >= capacity ? 'Reserved for owner' : null;
}

module.exports = { OwnerConsoles, ownerCapacity, RECENT_MS, HEARTBEAT_MS, PERSIST_MS };
