'use strict';

const { randomUUID } = require('node:crypto');
const { ownerCapacity } = require('./owner-consoles.cjs');

// Admission only. Never moves, opens, hides or terminates a console/process.
class CapacityReservations {
  constructor(owners, { active = () => [], workers = () => [], maxModels = 4, now = Date.now } = {}) {
    Object.assign(this, { owners, externalActive: active, workers, maxModels, now });
    this.pending = []; this.active = new Map(); this.lastProject = new Map(); this.resourcePressure = false;
    this.onChanged = () => this.drain(); owners.on('changed', this.onChanged);
    this.timer = setInterval(() => this.drain(), 1000); this.timer.unref();
  }
  acquire(request) {
    return new Promise((resolve, reject) => {
      if (this.disposed) return resolve(null);
      request = this.profile(request);
      const id = request.id || randomUUID();
      if (this.active.has(id) || this.pending.some(item => item.id === id)) return reject(new Error('This request already has an admission slot.'));
      if (request.capacity !== undefined && (!Number.isInteger(request.capacity) || request.capacity < 1)) return reject(new Error('Enter a positive concurrency allowance.'));
      const record = this.owners.records.get(request.consoleKey);
      const item = { ...request, id, requestedAt: request.automatic === false && record?.pendingAt !== null && record?.pendingAt !== undefined ? record.pendingAt : this.now(), resolve };
      this.pending.push(item); this.drain();
    });
  }
  profile(request) {
    if (request.kind === 'docker') return { ...request, capacity: 1, local: false };
    const workers = this.workers();
    const match = (request.workerId && workers.find(worker => worker.id === request.workerId)) ||
      (request.accountId && workers.find(worker => worker.accountId === request.accountId && (!request.model || worker.model === request.model)));
    const quotaGroupId = request.quotaGroupId || match?.quotaGroupId || request.accountId;
    const group = workers.filter(worker => worker.quotaGroupId === quotaGroupId && worker.available !== false);
    const capacity = Math.min(request.capacity ?? match?.concurrency ?? 1, ...group.map(worker => worker.concurrency));
    return { ...request, quotaGroupId, capacity, local: request.local === true || match?.local === true };
  }
  reason(item, active, reservations) {
    if (item.automatic !== false && this.resourcePressure) return 'Owner resource pressure';
    if (item.kind === 'docker') return active.some(turn => turn.kind === 'docker') ? 'Waiting for checks' : null;
    if (active.filter(turn => turn.kind !== 'docker').length >= this.maxModels) return 'Waiting for capacity';
    if (item.local && active.some(turn => turn.local)) return 'Waiting for capacity';
    // An owner demand at any local endpoint reserves the machine's single lane.
    if (item.local && item.automatic !== false && this.owners.snapshot().some(record => record.local && reservations.has(record.quotaGroupId))) return 'Reserved for owner';
    return ownerCapacity({ quotaGroupId: item.quotaGroupId || item.accountId,
      capacity: item.capacity ?? 1, active, reservations, automatic: item.automatic !== false });
  }
  drain() {
    if (this.draining || this.disposed) return;
    this.draining = true;
    try {
      const reservations = this.owners.reservations();
      let queued = [...this.pending];
      while (queued.length) {
        queued.sort((a, b) => this.tier(a) - this.tier(b) || a.requestedAt - b.requestedAt);
        const first = queued[0], tier = this.tier(first), time = first.requestedAt;
        const tied = queued.filter(item => this.tier(item) === tier && item.requestedAt === time);
        const previous = this.lastProject.get(tier);
        const projects = [...new Set(tied.map(item => item.projectId))];
        const index = projects.indexOf(previous);
        const project = projects[(index + 1) % projects.length];
        const item = tied.find(entry => entry.projectId === project);
        queued = queued.filter(entry => entry !== item);
        const active = [...this.externalActive(), ...this.active.values()];
        const reason = this.reason(item, active, reservations);
        if (item.reason !== reason) { item.reason = reason; item.onQueued?.(reason); }
        if (reason) continue;
        this.pending = this.pending.filter(entry => entry !== item);
        const record = this.owners.records.get(item.consoleKey);
        this.active.set(item.id, { ...item, quotaGroupId: item.quotaGroupId || item.accountId,
          owner: item.automatic === false && record?.ownerManaged === true });
        this.lastProject.set(tier, item.projectId);
        let released = false;
        item.resolve(() => { if (released) return; released = true; this.active.delete(item.id); this.drain(); });
      }
    } finally { this.draining = false; }
  }
  tier(item) { return item.automatic === false ? this.owners.tier(item.consoleKey) : 5; }
  cancel(predicate) {
    this.pending = this.pending.filter(item => { if (!predicate(item)) return true; item.onQueued?.(null); item.resolve(null); return false; });
  }
  setResourcePressure(pressure) { this.resourcePressure = pressure === true; this.drain(); }
  dispose() { this.disposed = true; clearInterval(this.timer); this.owners.removeListener('changed', this.onChanged); this.cancel(() => true); }
}

module.exports = { CapacityReservations };
