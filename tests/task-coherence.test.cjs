'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { SplitTasks, planReport } = require('../electron/task-plan.cjs');

const plan = { contracts: 'Use milliseconds.', subtasks: [
  { id: 'one', title: 'One', criteria: 'Create one.', owns: ['one.js'], dependsOn: [], difficulty: 2, complexity: 2 },
  { id: 'two', title: 'Two', criteria: 'Create two.', owns: ['two.js'], dependsOn: [], difficulty: 2, complexity: 2 }
] };
const answer = { text: `\x60\x60\x60json\n${JSON.stringify(plan)}\n\x60\x60\x60` };
const finding = 'one.js:1 — high — wrong contract';
function fixture(provider) {
  const job = { id: 'task', split: true, state: 'planning', title: 'Task', criteria: 'Create modules.', planner: { label: 'Planner' }, planReviewer: { label: 'Reviewer' }, planRounds: [], rounds: [], subtasks: [] };
  const loop = {
    now: () => 10, changed() {}, record: async () => {}, candidates: () => [], getLimits: () => [], getSettings: () => ({}),
    provider, reviewFindings: () => [finding], finish: async (item, state, error) => Object.assign(item, { state, error }),
    jobs: new Map(), pending: new Map(), cancelling: new Set(), unconfirmed: new Map(), children: new Map(),
    ensureAvailable() {}, view: item => structuredClone(item)
  };
  const split = new SplitTasks(loop);
  loop.startSplit = item => { loop.resumed = split.plan(item); };
  loop.jobs.set(job.id, job);
  return { job, loop, split };
}

test('one coherence check is retained with its revision after a correction', async () => {
  const calls = [];
  const { job, split } = fixture(async (item, step, prompt) => {
    calls.push({ role: step.role || 'review', prompt });
    if (calls.length === 1) return answer;
    if (calls.length === 2) return { verdict: 'changes-requested', text: finding };
    assert.match(prompt, /wrong contract/); return answer;
  });
  await split.plan(job);
  assert.equal(job.state, 'plan-ready');
  assert.deepEqual(calls.map(call => call.role), ['planner', 'review', 'planner']);
  assert.equal(job.planRevision, 2); assert.equal(job.planReview.planRevision, 1);
  assert.equal(job.planReview.reused, true); assert.notEqual(job.planRounds[0].review, job.planRounds[1].review);
  assert.deepEqual(job.planRounds[1].review.findings, [finding]);
  assert.match(planReport(job, () => 'not reported').join('\n'), /revision 1; this revision was not re-reviewed/);
});

test('resume after interruption preserves review feedback without a second review', async () => {
  const calls = []; let interrupt = true;
  const { job, loop, split } = fixture(async (item, step, prompt) => {
    calls.push({ role: step.role || 'review', prompt });
    if (calls.length === 1) return answer;
    if (calls.length === 2) return { verdict: 'changes-requested', text: finding };
    assert.match(prompt, /wrong contract/);
    if (interrupt) { interrupt = false; item.state = 'interrupted'; return {}; }
    return answer;
  });
  await split.plan(job);
  const restored = JSON.parse(JSON.stringify(job));
  loop.jobs.set(restored.id, restored);
  await split.resume(restored.id); await loop.resumed;
  assert.equal(restored.state, 'plan-ready');
  assert.equal(calls.filter(call => call.role === 'review').length, 1);
  assert.match(calls.at(-1).prompt, /wrong contract/);
  assert.equal(restored.planReview.planRevision, 1); assert.equal(restored.planRevision, 2);
});

test('a missing review verdict blocks replay after restart', async () => {
  let calls = 0;
  const { job, loop, split } = fixture(async () => ++calls === 1 ? answer : { text: '' });
  await split.plan(job);
  assert.equal(job.state, 'needs-you'); assert.equal(job.planReview.verdict, null); assert.equal(calls, 2);
  const restored = JSON.parse(JSON.stringify(job)); loop.jobs.set(restored.id, restored);
  await assert.rejects(split.resume(restored.id), /review did not finish/i);
  assert.equal(calls, 2);
});

test('a prior review without a verdict is not called again', async () => {
  let calls = 0;
  const { job, split } = fixture(async () => { calls++; return answer; });
  job.planRounds.push({ number: 1, review: { state: 'interrupted', findings: [] } });
  await split.plan(job);
  assert.equal(calls, 1); assert.equal(job.state, 'needs-you');
  assert.equal(job.planRounds[1].review.reused, true); assert.equal(job.planReview.planRevision, 1);
});
