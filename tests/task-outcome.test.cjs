'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { buildOutcome, stripToolMarkup } = require('../electron/task-outcome.cjs');
const { TaskLoop } = require('../electron/task-loop.cjs');
const { Results } = require('../electron/results.cjs');

const base = (extra = {}) => ({ id: 't1', projectId: 'p1', originConsoleId: 'c1', state: 'passed', checks: 'npm test', unresolved: [], changedFiles: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js'], error: '',
  rounds: [{ implement: { summary: 'Added the filter. More detail follows.' }, check: { state: 'done', outcome: 'passed', exitCode: 0 } }], ...extra });

test('stripToolMarkup removes complete, unclosed and stray tool tags', () => {
  assert.equal(stripToolMarkup('Done. <tool_call>{"name":"x"}</tool_call> Next.'), 'Done. Next.');
  assert.equal(stripToolMarkup('Done.\n<function_calls><invoke name="a"></invoke></function_calls>'), 'Done.');
  assert.equal(stripToolMarkup('Fixed it. <tool_call>{"name":"cut off'), 'Fixed it.');
  assert.equal(stripToolMarkup('a </tool_result> b'), 'a b');
  assert.equal(stripToolMarkup('Keep <div> and 1 < 2.'), 'Keep <div> and 1 < 2.');
});

test('a clean passed task is ready with a one-sentence outcome and top five files', () => {
  const o = buildOutcome(base({ rounds: [{ implement: { summary: '<tool_call>x</tool_call>Added the filter. More detail follows.' }, check: { state: 'done', outcome: 'passed' } }] }));
  assert.equal(o.type, 'task'); assert.equal(o.verdict, 'ready'); assert.equal(o.outcome, 'Added the filter.');
  assert.equal(o.taskId, 't1'); assert.equal(o.projectId, 'p1'); assert.equal(o.originConsoleId, 'c1');
  assert.deepEqual(o.changedFiles, { count: 6, top: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'] });
  assert.equal(o.checks.status, 'passed'); assert.deepEqual(o.unresolved, []);
  assert.ok(o.usage && 'cloud' in o.usage);
});

test('verdicts cover failed checks, open items, failure and interruption', () => {
  const failedChecks = buildOutcome(base({ state: 'needs-you', unresolved: ['Checks failed (exit 1).'], rounds: [{ check: { state: 'failed', outcome: 'failed', exitCode: 1 } }] }));
  assert.equal(failedChecks.verdict, 'failed-checks'); assert.match(failedChecks.outcome, /Checks failed \(exit 1\)/);
  const open = buildOutcome(base({ state: 'needs-you', unresolved: ['<tool_call>z</tool_call>The review found a gap. Fix it.'] }));
  assert.equal(open.verdict, 'needs-decision'); assert.deepEqual(open.unresolved, ['The review found a gap. Fix it.']); assert.match(open.outcome, /The review found a gap\./);
  assert.equal(buildOutcome(base({ state: 'failed', error: 'The provider could not start.' })).verdict, 'failed');
  assert.equal(buildOutcome(base({ state: 'interrupted', error: 'Paddock closed before this task finished.' })).verdict, 'interrupted');
  assert.equal(buildOutcome(base({ state: 'implementing' })), null, 'running tasks have no outcome');
  assert.equal(buildOutcome(base({ checks: '', rounds: [] })).checks.status, 'none');
});

function loop(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-life-')); let clock = 1000;
  const l = new TaskLoop(root, { now: () => ++clock });
  t.after(() => { l.interruptAll(); fs.rmSync(root, { recursive: true, force: true }); });
  const add = (id, extra) => { const job = { id, title: id, state: 'needs-you', repo: root, repoKey: 'r', projectId: 'p', startedAt: 1, finishedAt: 2, rounds: [], log: [], unresolved: [], ...extra }; l.jobs.set(id, job); return job; };
  return { l, add };
}

test('acknowledge, dismiss and supersede persist lifecycle fields', t => {
  const { l, add } = loop(t); const a = add('a'), plan = add('plan', { state: 'plan-ready' }), run = add('run', { state: 'implementing' }), other = add('o', { projectId: 'q' });
  assert.equal(l.acknowledge('a').acknowledgedAt > 0, true);
  assert.ok(JSON.parse(fs.readFileSync(path.join(l.dir, 'a.json'), 'utf8')).acknowledgedAt);
  assert.throws(() => l.dismiss('run'), /Stop the task/);
  l.supersedeOlder({ id: 'new', projectId: 'p', repoKey: 'r' });
  assert.equal(a.supersededBy, 'new'); assert.ok(!plan.supersededBy);
  assert.ok(!run.supersededBy); assert.ok(!other.supersededBy);
  l.dismiss('a'); assert.ok(a.dismissedAt);
  assert.ok(!l.snapshot().some(job => job.id === 'a'));
  assert.throws(() => l.acknowledge('missing'), /not found/);
});

test('settling a task clears an earlier acknowledgement', t => {
  const { l, add } = loop(t); const job = add('s', { state: 'implementing', acknowledgedAt: 5, startedAt: 1, rounds: [] });
  l.settle(job, 'needs-you', ''); assert.equal(job.acknowledgedAt, null);
});

test('attention counts only unacknowledged needs-you, failed and plan-ready tasks', async () => {
  const { projectActivity } = await import('../src/project-activity.js');
  const state = { projects: [{ id: 'p', folders: [{ path: '/work/p' }] }], tasks: [
    { repo: '/work/p', state: 'needs-you', startedAt: 10 },
    { repo: '/work/p', state: 'needs-you', startedAt: 10, acknowledgedAt: 11 },
    { repo: '/work/p', state: 'failed', startedAt: 10, supersededBy: 'x' },
    { repo: '/work/p', state: 'failed', startedAt: 10, dismissedAt: 12 },
    { repo: '/work/p', state: 'plan-ready', startedAt: 1 },
    { repo: '/work/p', state: 'plan-ready', startedAt: 1, acknowledgedAt: 3 },
    { repo: '/work/p', state: 'passed', startedAt: 10 },
    { repo: '/work/p', state: 'interrupted', error: 'Paddock closed before this task finished.', startedAt: 10 },
  ] };
  assert.equal(projectActivity(state).get('p').attention, 2);
});
