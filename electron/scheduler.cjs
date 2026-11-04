'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { atomicJson, readJson } = require('./storage.cjs');
const { ownerCapacity } = require('./owner-consoles.cjs');

const parallelLimit = settings => { const value = Number(settings?.maxParallelTasks); return Number.isInteger(value) && value >= 1 && value <= 10 ? value : 5; };
function subtaskLimit(args, job, settings) {
  const value = args.parallelLimit ?? job.parallelLimit ?? parallelLimit(settings);
  if (!Number.isInteger(value) || value < 1 || value > 10) throw Error('Run 1 to 10 subtasks at once.');
  return value;
}
const emptyOwners = { records: new Map(), reservations: () => new Set(), snapshot: () => [], tier: () => 5, on() {}, removeListener() {} };

function resourceProfile(request, workers = []) {
  if (request.kind === 'docker' || request.kind === 'checks') return { ...request, kind: 'checks', capacity: 1, local: false };
  const match = (request.workerId && workers.find(w => w.id === request.workerId)) ||
    (request.accountId && workers.find(w => w.accountId === request.accountId && (!request.model || w.model === request.model)));
  const quotaGroupId = request.quotaGroupId || match?.quotaGroupId || request.accountId;
  const group = workers.filter(w => w.quotaGroupId === quotaGroupId && w.available !== false);
  return { ...request, quotaGroupId, capacity: Math.min(request.capacity ?? match?.concurrency ?? 1, ...group.map(w => w.concurrency)), local: request.local === true || match?.local === true };
}
function admissionReason(item, active, { limit = 5, reservations = new Set(), owners = emptyOwners, resourcePressure = false } = {}) {
  if (item.automatic !== false && resourcePressure) return 'Owner resource pressure';
  if (item.kind === 'subtask') {
    const used = active.filter(turn => turn.kind === 'subtask' && turn.taskId === item.taskId).length;
    return used >= item.taskCapacity ? `Waiting for a free slot (${used} of ${item.taskCapacity} in use)` : null;
  }
  if (item.kind === 'checks') return active.some(turn => turn.kind === 'checks' || turn.kind === 'docker') ? 'Waiting for checks' : null;
  const models = active.filter(turn => !['checks', 'docker', 'subtask'].includes(turn.kind));
  if (models.length >= limit) return `Waiting for a free slot (${models.length} of ${limit} in use)`;
  if (item.local && item.automatic !== false && owners.snapshot().some(record => record.local && reservations.has(record.quotaGroupId))) return 'Reserved for owner';
  if (item.local && models.some(turn => turn.local)) return 'Waiting for Strata';
  if (!item.quotaGroupId) return null;
  const reason = ownerCapacity({ quotaGroupId: item.quotaGroupId, capacity: item.capacity ?? 1, active: models, reservations, automatic: item.automatic !== false });
  return reason === 'Waiting for capacity' ? `Waiting for ${item.accountLabel || item.accountId || item.quotaGroupId || 'account'}` : reason;
}

class Scheduler extends EventEmitter {
  constructor(root, { owners = emptyOwners, active = () => [], workers = () => [], getSettings = () => ({}), now = Date.now } = {}) {
    super();
    Object.assign(this, { owners, externalActive: active, workers, getSettings, now });
    this.pending = []; this.active = new Map(); this.jobs = new Map(); this.resourcePressure = false;
    if (root) this.attach(root);
    this.onChanged = () => { try { this.drain(); } catch (error) { this.emit('persistence-error', error); } }; owners.on('changed', this.onChanged);
    this.timer = setInterval(this.onChanged, 1000); this.timer.unref();
  }
  attach(root) {
    const file = path.join(root, 'scheduler', 'jobs.json');
    if (this.file === file) return;
    if (this.file) throw Error('The scheduler already has a storage root.');
    fs.mkdirSync(path.dirname(file), { recursive: true }); this.file = file;
    const saved = readJson(file, { jobs: [] });
    for (const job of saved.jobs || []) {
      if (!job || typeof job.id !== 'string') continue;
      // Requests contain metadata only. Never replay a process or volatile input.
      this.jobs.set(job.id, ['running', 'queued'].includes(job.state) ? { ...job, state: 'interrupted', lease: null, queuePosition: 0, reason: 'Paddock closed before this request finished.' } : job);
    }
    this.persist();
  }
  persist() { if (this.file) atomicJson(this.file, { version: 1, jobs: [...this.jobs.values()] }); }
  snapshot() { return [...this.jobs.values()].map(job => ({ ...job, request: { ...job.request } })); }
  profile(request) { return resourceProfile(request, this.workers()); }
  reason(item, active, reservations) { return admissionReason(item, active, { limit: parallelLimit(this.getSettings()), reservations, owners: this.owners, resourcePressure: this.resourcePressure }); }
  acquire(request) {
    if (this.disposed) return Promise.resolve(null);
    const record = this.owners.records.get(request.consoleKey);
    const item = { ...this.profile(request), id: request.id || randomUUID(), requestedAt: request.automatic === false ? record?.pendingAt ?? this.now() : this.now() };
    if (this.active.has(item.id) || this.pending.some(entry => entry.id === item.id)) return Promise.reject(Error('This request already has an admission slot.'));
    if (!Number.isInteger(item.capacity) || item.capacity < 1) return Promise.reject(Error('Enter a positive concurrency allowance.'));
    const metadata = Object.fromEntries(['kind', 'taskId', 'projectId', 'accountId', 'accountLabel', 'model', 'workerId', 'quotaGroupId', 'capacity', 'local', 'automatic', 'consoleKey', 'taskCapacity'].filter(key => item[key] !== undefined).map(key => [key, item[key]]));
    this.jobs.set(item.id, { id: item.id, request: metadata, state: 'queued', requestedAt: item.requestedAt, lease: null, queuePosition: 0, reason: null });
    return new Promise((resolve, reject) => {
      item.resolve = resolve; this.pending.push(item);
      try { this.persist(); this.drain(); } catch (error) { this.pending = this.pending.filter(entry => entry !== item); reject(error); }
    });
  }
  drain() {
    if (this.draining || this.disposed) return;
    this.draining = true;
    try {
      const reservations = this.owners.reservations();
      const queued = [...this.pending].sort((a, b) => this.tier(a) - this.tier(b) || a.requestedAt - b.requestedAt);
      let position = 0;
      for (const item of queued) {
        const active = [...this.externalActive(), ...this.active.values()];
        const reason = this.reason(item, active, reservations), job = this.jobs.get(item.id);
        const queuePosition = reason ? ++position : 0;
        Object.assign(job, { reason, queuePosition });
        if (item.reason !== reason || item.queuePosition !== queuePosition) {
          item.reason = reason; item.queuePosition = queuePosition; this.persist(); item.onQueued?.(reason, queuePosition);
        }
        if (reason) continue;
        const record = this.owners.records.get(item.consoleKey);
        this.active.set(item.id, { ...item, owner: item.automatic === false && record?.ownerManaged === true });
        const lease = randomUUID();
        this.jobs.set(item.id, { ...job, state: 'running', lease, startedAt: this.now() });
        try { this.persist(); } catch (error) { this.jobs.set(item.id, job); this.active.delete(item.id); throw error; }
        this.pending = this.pending.filter(entry => entry !== item);
        item.resolve(() => this.release(item.id, lease));
      }
      this.emit('changed');
    } finally { this.draining = false; }
  }
  release(id, lease, state = 'completed') {
    const job = this.jobs.get(id);
    if (!this.active.has(id) || job.lease !== lease) return;
    this.jobs.set(id, { ...job, state, lease: null, finishedAt: this.now() });
    try { this.persist(); } catch (error) { this.jobs.set(id, job); throw error; }
    this.active.delete(id); this.onChanged();
  }
  tier(item) { return item.automatic === false ? this.owners.tier(item.consoleKey) : 5; }
  cancel(predicate) {
    const cancelled = this.pending.filter(predicate);
    this.pending = this.pending.filter(item => !cancelled.includes(item));
    for (const item of cancelled) {
      Object.assign(this.jobs.get(item.id), { state: 'cancelled', lease: null, reason: null, queuePosition: 0 });
      this.persist(); item.onQueued?.(null, 0); item.resolve(null);
    }
    // Active execution owns stopping its process before releasing the lease.
    this.drain();
  }
  setResourcePressure(pressure) { this.resourcePressure = pressure === true; this.drain(); }
  dispose() { this.disposed = true; clearInterval(this.timer); this.owners.removeListener('changed', this.onChanged); this.cancel(() => true); }
}
const schedulers = new Map();
function getScheduler(root, options) {
  const key = root ? path.resolve(root) : '';
  if (!schedulers.has(key) || schedulers.get(key).disposed) schedulers.set(key, new Scheduler(root, options));
  return schedulers.get(key);
}
module.exports = { Scheduler, getScheduler, parallelLimit, subtaskLimit, resourceProfile, admissionReason };
