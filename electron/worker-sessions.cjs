'use strict';
const { randomUUID } = require('node:crypto');

function ordinaryConsole(item) {
  if (item?.taskId) throw new Error('Use the worker composer or Stop worker.');
}
const steeringSupported = provider => ['codex', 'claude', 'kiro'].includes(provider);

// Batch CLIs close stdin after the brief. Steering is consumed at the next
// serial turn boundary, never typed into a closed pipe or a second agent.
// Text stays in memory; task JSON contains delivery metadata only. Uncertain
// deliveries are never replayed on restart. Durable encrypted mail is row 9.
class WorkerSessions {
  constructor(sessions, loop, { placement = null } = {}) {
    this.sessions = sessions; this.loop = loop; this.mail = new Map(); this.history = new Map(); this.outcomes = new Set();
    // Production stays headless until row 6 supplies its complete presentation
    // adapter. Tests can inject the existing placement prototype.
    this.placement = placement;
    sessions.workerBridge = this; loop.workers = this;
    this.reconcile = () => {
      if (this.reconciling) return;
      this.reconciling = true;
      try {
        for (const parent of loop.jobs.values()) for (const job of [parent, ...(parent.subtasks || [])]) {
          if (['passed', 'needs-you', 'failed', 'stopped', 'interrupted', 'accepted', 'merged'].includes(job.state)) this.complete(job);
        }
      } finally { this.reconciling = false; }
    };
    sessions.ownerConsoles?.on('changed', this.reconcile);
  }
  open(job, step) {
    let item = this.sessions.items.get(job.workerSession?.id);
    if (item) {
      if (item.processAlive || this.loop.unconfirmed.has(job.id)) throw new Error('This worker is still running. Stop it explicitly or wait for process exit.');
      item.attemptId = job.rounds.at(-1)?.attemptId;
      item.model = step.model; item.level = job.currentLevel || job.startingLevel || null;
      Object.assign(item, { provider: step.provider, accountId: step.accountId, quotaGroupId: step.quotaGroupId, local: step.local === true, steeringSupported: steeringSupported(step.provider) });
      this.sessions.emit('changed');
      return item;
    }
    const id = job.workerSession?.id || randomUUID(), consoleKey = job.workerSession?.consoleKey || randomUUID();
    item = { id, consoleKey, launchId: randomUUID(), taskId: job.parentId || job.id,
      sliceId: job.id, attemptId: job.rounds.at(-1)?.attemptId, projectId: job.projectId || job.repo,
      name: job.subtaskId || job.title, nameMode: 'custom', cwd: job.workFolder,
      provider: step.provider, model: step.model, accountId: step.accountId, quotaGroupId: step.quotaGroupId,
      local: step.local === true, purpose: 'worker', state: 'open', alive: true, processAlive: false,
      steeringSupported: steeringSupported(step.provider),
      width: 1, height: 1, cols: 110, rows: 30, sequence: 0, buffer: '', createdAt: this.loop.now() };
    job.workerSession = { id, consoleKey, launchId: item.launchId };
    this.loop.changed(job); // Identity is durable before dispatch.
    this.placement?.reserve(item);
    const placed = this.placement?.commit(consoleKey, item.launchId);
    Object.assign(item, { slot: placed?.page === 'main' ? placed.slot : null, hidden: placed?.page !== 'main' });
    const parent = this.loop.jobs.get(job.parentId || job.id);
    if (parent?.workerSteering?.some(event => event.sliceId === job.id && event.status === 'uncertain')) item.steeringState = 'Delivery unconfirmed';
    this.sessions.items.set(id, item); this.sessions.emit('changed');
    return item;
  }
  current(payload) {
    const item = this.sessions.items.get(payload?.id);
    if (!item?.taskId || item.dismissed || item.consoleKey !== payload.consoleKey || item.launchId !== payload.launchId) throw new Error('The worker changed. Open its controls again.');
    const parent = this.loop.jobs.get(item.taskId);
    const job = parent?.id === item.sliceId ? parent : parent?.subtasks?.find(sub => sub.id === item.sliceId);
    if (!job || job.workerSession?.launchId !== item.launchId) throw new Error('The worker changed. Open its controls again.');
    return { item, job };
  }
  submit(payload) {
    const { item, job } = this.current(payload);
    if (!item.steeringSupported) throw new Error('Steering is unavailable for this CLI.');
    if (!['implementing', 'checking', 'reviewing'].includes(job.state)) throw new Error('Resume this slice before submitting steering.');
    if (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 16000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(payload.text)) throw new Error('Enter a worker message of up to 16000 characters.');
    if (typeof payload.submissionId !== 'string' || !/^[\w-]{1,100}$/.test(payload.submissionId)) throw new Error('Enter a submission ID.');
    const parent = this.loop.jobs.get(item.taskId), events = parent.workerSteering ||= [];
    const prior = events.find(event => event.id === payload.submissionId);
    if (prior) {
      if (prior.sliceId !== job.id || prior.sourceConsole !== item.consoleKey) throw new Error('This submission ID belongs to another worker.');
      return { ...prior };
    }
    const queued = this.mail.get(job.id) || [];
    if (queued.length >= 20 || events.length >= 1000) throw new Error('The worker mailbox is full. Wait for delivery.');
    const event = { id: payload.submissionId, sequence: ++parent.steeringSequence,
      sourceConsole: item.consoleKey, sliceId: job.id, planRevision: parent.planRevision || 0,
      status: 'queued', submittedAt: this.loop.now() };
    events.push(event); this.loop.changed(job);
    queued.push({ event, text: payload.text }); this.mail.set(job.id, queued);
    const history = this.history.get(job.id) || []; history.push({ event, text: payload.text }); this.history.set(job.id, history);
    this.sessions.ownerInteraction(item.id, 'panel-control', { pendingSubmission: true, draft: false });
    // An owner may steer a worker still awaiting its first automatic slot.
    // Re-enter admission as an owner submission, without starting a duplicate.
    this.loop.admission?.cancel(request => request.id === job.id && request.automatic !== false);
    item.steeringState = 'Queued'; this.sessions.emit('changed'); return { ...event };
  }
  pending(job) { return (this.mail.get(job.id)?.length || 0) > 0; }
  unconsumed(job) {
    const parent = this.loop.jobs.get(job.parentId || job.id);
    const consumed = Math.max(0, ...job.rounds.map(round => round.steeringSequenceConsumed || 0));
    return parent?.workerSteering?.some(event => event.sliceId === job.id && event.status !== 'uncertain' && event.sequence > consumed) === true;
  }
  take(job) {
    const messages = this.mail.get(job.id) || []; this.mail.delete(job.id);
    for (const { event } of messages) event.status = 'delivering';
    if (messages.length) this.loop.changed(job);
    return messages;
  }
  brief(job, { review = false } = {}) {
    return (this.history.get(job.id) || []).filter(({ event }) => review ? event.status === 'acknowledged' : event.status !== 'uncertain')
      .map(({ event, text }) => `Owner steering ${event.sequence}:\n${text}`).join('\n\n');
  }
  begin(job) {
    const item = this.sessions.items.get(job.workerSession?.id); if (!item) return;
    if (item.hasLaunched) item.launchId = randomUUID();
    item.hasLaunched = true;
    job.workerSession.launchId = item.launchId;
    const round = job.rounds.at(-1);
    if (round) round.workerSession = { ...job.workerSession };
    this.loop.changed(job); this.sessions.emit('changed');
    this.sessions.emit('output', { id: item.id, launchId: item.launchId, sequence: item.sequence, data: item.buffer, reset: true });
  }
  acknowledge(job, messages, successful) {
    const item = this.sessions.items.get(job.workerSession?.id), round = job.rounds.at(-1);
    for (const { event } of messages) {
      event.status = successful ? 'acknowledged' : 'uncertain';
      event.attemptId = round?.attemptId;
      if (successful && round) round.steeringSequenceConsumed = Math.max(round.steeringSequenceConsumed || 0, event.sequence);
    }
    if (messages.length) this.loop.changed(job);
    if (item) {
      if (messages.length || this.pending(job)) item.steeringState = this.pending(job) ? 'Queued' : successful ? 'Delivered' : 'Delivery unconfirmed';
      const owners = this.sessions.ownerConsoles, record = owners?.records.get(item.consoleKey);
      if (record) { owners.updateFlags(record, { pendingSubmission: this.pending(job), ownerTurn: false }); owners.changed(); }
      this.sessions.emit('changed');
    }
  }
  output(job, line) {
    const item = this.sessions.items.get(job.workerSession?.id); if (!item) return;
    const data = line + '\r\n'; item.buffer = (item.buffer + data).slice(-64000);
    this.sessions.emit('output', { id: item.id, launchId: item.launchId, sequence: ++item.sequence, data });
  }
  process(job, running) {
    const item = this.sessions.items.get(job.workerSession?.id); if (!item) return;
    item.processAlive = running; item.state = running ? 'active' : 'open'; this.sessions.emit('changed');
  }
  complete(job, { saved = false } = {}) {
    if (saved) this.outcomes.add(job.id);
    const item = this.sessions.items.get(job.workerSession?.id);
    if (!item || item.processAlive || this.loop.unconfirmed.has(job.id)) return;
    item.state = job.state;
    if (!this.outcomes.has(job.id)) return;
    if (!this.sessions.ownerConsoles || this.sessions.ownerConsoles.isProtected(item.consoleKey)) { this.sessions.emit('changed'); return; }
    this.sessions.items.delete(item.id); this.placement?.panels.delete(item.consoleKey); this.history.delete(job.id); this.sessions.emit('changed');
  }
  dispose() { this.sessions.ownerConsoles?.removeListener('changed', this.reconcile); this.mail.clear(); this.history.clear(); this.outcomes.clear(); }
  async stop(payload) {
    const { item, job } = this.current(payload);
    if (payload.confirm !== true || payload.sliceId !== job.id) throw new Error(`Confirm Stop worker for ${item.name}.`);
    this.sessions.ownerInteraction(item.id, 'panel-control');
    await this.loop.cancel(job, 'stopped', 'Stopped by you. All work was kept.');
    return true;
  }
  async stopDesktop(payload, { testMode = false, confirm } = {}) {
    const { item, job } = this.current(payload);
    if (!testMode && !await confirm(item)) return false;
    return this.stop({ ...payload, sliceId: job.id, confirm: true });
  }
}
module.exports = { WorkerSessions, ordinaryConsole };
