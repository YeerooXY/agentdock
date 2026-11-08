'use strict';
const fs = require('node:fs'), path = require('node:path');
const { atomicJson, readJson } = require('./storage.cjs');
const { studyCourse, supportsQuietStudy } = require('./study-context.cjs');
const pending = 'Completion check required. Call dock/finish_turn with this turnId, outcome (changed or no-change), summary, nextStep and outputs (none or saved). For saved outputs include resultIds.';
const clean = (value, max, field) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Provide ${field} (1–${max} characters).`);
  return value.trim();
};
class TurnCompletion {
  constructor(root, workbench) { this.dir = path.join(root, 'turn-completions'); this.workbench = workbench; this.studyCourse = studyCourse; }
  isStudyConversation(owner) {
    const session = this.workbench.turns?.session(owner);
    return !!(session?.alive && supportsQuietStudy(session, this.studyCourse(session)));
  }
  canContinueStudy(owner, expectedTurnId) {
    const turns = this.workbench.turns;
    if (!this.isStudyConversation(owner) || turns.active.has(owner) || turns.queues.has(owner)) return false;
    const latest = turns.latest.get(owner);
    if (expectedTurnId !== undefined && (latest?.id || null) !== expectedTurnId) return false;
    // A successful response check closes that work's lifecycle. Later deletion
    // of its saved output or changes to a historical worker do not reopen it.
    if (latest && (!latest.responseChecked || latest.completionInvalidated)) return false;
    return true;
  }
  async agentResponse(owner, event) {
    if (!['start', 'complete'].includes(event)) throw new Error('Choose a start or complete response event.');
    const turns = this.workbench.turns;
    if (this.canContinueStudy(owner)) return { completion: 'study-continuation', turnId: turns.latest.get(owner)?.id || null };
    if (event === 'start') return { turnId: await turns?.begin(owner) || null };
    const record = this.check(owner), turn = this.turn(owner);
    // A callback must not close a new task started by another agent after this
    // check. The expected ID is checked inside the turn's serialization queue.
    await turns?.finish(owner, undefined, record.turnId, () => this.check(owner));
    turn.responseChecked = true;
    return { completion: 'recorded', turnId: record.turnId };
  }
  turn(owner) {
    const turns = this.workbench.turns;
    return turns?.active.get(owner) || turns?.latest.get(owner);
  }
  read(turn) { return turn && readJson(path.join(this.dir, turn.id + '.json'), null); }
  validate(owner, record) {
    const wb = this.workbench, turn = this.turn(owner), session = wb.turns?.session(owner);
    if (!turn || !record || record.turnId !== turn.id || record.consoleKey !== turn.context.consoleKey) throw new Error(pending);
    if ((session?.projectId || null) !== (turn.context.projectId || null)) throw new Error('The linked project changed. Call dock/finish_turn({interrupted:true}), then dock_context to start a new turn.');
    if (record.outcome === 'changed' && record.projectId && turn.projectContextRead !== record.projectId) throw new Error('Read dock_context({detail:"project"}) before completing project work.');
    const saved = wb.results.items.filter(x => x.groupId === turn.id && x.consoleKey === turn.context.consoleKey);
    for (const id of record.resultIds) {
      const item = saved.find(x => x.id === id);
      if (!item || !fs.existsSync(wb.results.path(id))) throw new Error('A declared output is missing or belongs to another turn. Save it with dock/save_result, then repeat dock/finish_turn.');
    }
    const tasks = wb.getTasks?.();
    for (const id of turn.taskIds || []) {
      const job = tasks?.jobs?.get(id);
      // A task closed with a reason (dock/close_task or the Tasks page) is resolved.
      if (job?.dismissedAt && !require('./task-plan.cjs').ACTIVE.has(job.state)) continue;
      const recorded = tasks?.hasRecordedOutcome ? tasks.hasRecordedOutcome(job) : !!job?.resultId;
      if (!job || !['passed', 'accepted'].includes(job.state) || (job.state !== 'accepted' && job.unresolved?.length) || job.reportError || !recorded) throw new Error(`Task ${id} is unfinished or needs attention. Inspect dock/task_status; close a failed or replaced task with dock/close_task before completing this turn.`);
    }
    if (turn.completionInvalidated) throw new Error('This turn changed after its completion check. Repeat dock/finish_turn with the current outcome.');
    return record;
  }
  check(owner) { return this.validate(owner, this.read(this.turn(owner))); }
  invalidate(owner) {
    const turn = this.turn(owner);
    const historical = this.isStudyConversation(owner) && !this.workbench.turns.active.has(owner) && turn?.responseChecked;
    if (turn && !historical) turn.completionInvalidated = true;
  }
  async complete(owner, args) {
    const wb = this.workbench, turn = this.turn(owner);
    if (!turn || args.turnId !== turn.id) throw new Error('Use the current turnId returned by dock_context.');
    if (!['changed', 'no-change'].includes(args.outcome)) throw new Error(pending);
    const summary = clean(args.summary, 1200, 'an outcome summary');
    const nextStep = clean(args.nextStep, 500, 'the next step, or "None" when complete');
    if (!['none', 'saved'].includes(args.outputs)) throw new Error('Declare outputs as none or saved.');
    const resultIds = args.resultIds || [];
    if (!Array.isArray(resultIds) || resultIds.length > 100 || resultIds.some(id => typeof id !== 'string') || (args.outputs === 'saved' ? !resultIds.length : resultIds.length)) throw new Error('Saved outputs require resultIds; use an empty list when no deliverable was requested.');
    const record = { turnId: turn.id, consoleKey: turn.context.consoleKey, projectId: turn.context.projectId || null, outcome: args.outcome, summary, nextStep, outputs: args.outputs, resultIds: [...new Set(resultIds)], at: Date.now() };
    turn.completionInvalidated = false;
    try {
      // Refresh delegated verification before deciding whether the parent is done.
      for (const id of turn.taskIds || []) {
        const tasks = wb.getTasks?.();
        await tasks?.refresh?.(id);
        const job = tasks?.jobs?.get(id);
        if (job && ['passed', 'accepted'].includes(job.state) && tasks.hasRecordedOutcome && (job.reportError || !tasks.hasRecordedOutcome(job))) await tasks.record(job);
      }
      this.validate(owner, record);
      record.tasks = (turn.taskIds || []).map(id => { const job = wb.getTasks().jobs.get(id); return { id, state: job.state, resultId: job.resultId || null,
        ...(job.executionHistory ? { executionHistory: job.executionHistory } : {}), acceptedIssues: job.state === 'accepted' ? job.unresolved || [] : [] }; });
      if (record.projectId && record.outcome === 'changed') wb.projects.recordOutcome(record.projectId, record);
      fs.mkdirSync(this.dir, { recursive: true }); atomicJson(path.join(this.dir, turn.id + '.json'), record);
      return record;
    } catch (error) { turn.completionInvalidated = true; throw error; }
  }
  history(projectId, cursor = 0) {
    if (!fs.existsSync(this.dir)) return { items: [], nextCursor: null };
    const records = fs.readdirSync(this.dir).filter(x => /^[a-f0-9-]{36}\.json$/i.test(x)).map(file => readJson(path.join(this.dir, file), null)).filter(x => x?.projectId === projectId).sort((a, b) => b.at - a.at);
    const items = records.slice(cursor, cursor + 5).map(({ turnId, outcome, summary, nextStep, at }) => ({ turnId, outcome, summary, nextStep, at }));
    return { items, nextCursor: cursor + items.length < records.length ? cursor + items.length : null };
  }
}
module.exports = { TurnCompletion, pending };
