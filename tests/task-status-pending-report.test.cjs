'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { TaskLoop } = require('../electron/task-loop.cjs');

test('requesting a final report preserves live task progress until publication', async () => {
  const repo = path.resolve('pending-report-fixture');
  const job = { id: 'pending', repo, state: 'implementing' };
  const loop = Object.create(TaskLoop.prototype);
  loop.jobs = new Map([[job.id, job]]);
  loop.refresh = async () => {};
  loop.view = value => ({ id: value.id, state: value.state });
  let reads = 0;
  loop.executionHistory = { read: () => { reads++; throw Error('Execution report is unavailable.'); } };
  const pending = await loop.status(job.id, repo, { includeReport: true });
  assert.equal(pending.state, 'implementing');
  assert.equal(pending.reportPending, true);
  assert.equal('report' in pending, false);
  assert.equal(reads, 0);
  assert.equal('reportPending' in await loop.status(job.id, repo), false);
  await assert.rejects(loop.status(job.id, path.resolve('another-project'), { includeReport: true }), /unavailable/);
  job.state = 'passed';
  await assert.rejects(loop.status(job.id, repo, { includeReport: true }), /Execution report is unavailable/);
  job.executionHistory = { kind: 'task', id: job.id, revision: 1 };
  loop.executionHistory.read = () => ({ text: 'Finished report', revision: 1 });
  assert.deepEqual((await loop.status(job.id, repo, { includeReport: true })).report, { text: 'Finished report', revision: 1 });
});

test('compact task status reports usage once and detail retains accounting evidence', async () => {
  const repo = path.resolve('usage-report-fixture'), job = { id: 'usage', repo, state: 'passed' };
  const loop = Object.create(TaskLoop.prototype);
  loop.jobs = new Map([[job.id, job]]); loop.refresh = async () => {};
  const view = { ...job, outcome: { state: 'passed', usage: { input: 10 } }, usageSummary: { input: 10 }, rounds: [{ number: 1, implement: { state: 'done', usage: { input: 10 } } }] };
  loop.view = () => view;
  const compact = await loop.status(job.id, repo);
  assert.deepEqual(compact.usageSummary, { input: 10 });
  assert.equal(compact.outcome.usage, undefined);
  assert.equal(compact.rounds[0].implement.usage, undefined);
  const detail = await loop.status(job.id, repo, { detail: true });
  assert.deepEqual(detail.outcome.usage, { input: 10 });
  assert.deepEqual(detail.rounds[0].implement.usage, { input: 10 });
});
