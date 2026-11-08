'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { resolutionCandidate } = require('../electron/task-resolution.cjs');
function fixture() { return { id: 'task', automaticResolution: true, state: 'passed', workflow: 'current', sourceRevision: 'head', fingerprint: 'tree', checks: 'check', unresolved: [], rounds: [{ check: { command: 'check', state: 'passed', outcome: 'passed', exitCode: 0, fingerprint: 'tree' } }] }; }
const evidence = { fingerprint: 'tree', head: 'head' };
test('verified current work gets a stable system disposition without owner approval', () => {
  const job = fixture(), resolved = resolutionCandidate(job, evidence);
  assert.equal(resolved.eligible, true); assert.equal(resolved.actor, 'system'); assert.equal(resolved.disposition, 'verified');
  assert.equal(resolutionCandidate(job, evidence).operationId, resolved.operationId); assert.equal('approvedBy' in resolved, false);
});
test('live processes, changed artifacts, different HEAD and failed/stale checks block resolution', () => {
  for (const altered of [{ fingerprint: 'other' }, { head: 'other' }, { live: true }]) assert.equal(resolutionCandidate(fixture(), { ...evidence, ...altered }).eligible, false);
  for (const changed of [{ state: 'failed' }, { exitCode: 1 }, { command: 'different' }, { timedOut: true }, { fingerprint: 'old' }]) { const job = fixture(); Object.assign(job.rounds[0].check, changed); assert.equal(resolutionCandidate(job, evidence).eligible, false); }
});
test('review findings and old manual jobs never self-approve', () => {
  const job = fixture(); delete job.automaticResolution; assert.equal(resolutionCandidate(job, evidence).eligible, false);
  job.automaticResolution = true; job.reviewer = { accountId: 'reviewer' };
  job.rounds[0].review = { state: 'done', verdict: 'approve', findings: ['bug'], fingerprint: 'tree' };
  assert.equal(resolutionCandidate(job, evidence).eligible, false);
  job.rounds[0].review.findings = []; assert.equal(resolutionCandidate(job, evidence).eligible, true);
});
test('no-check current work is labelled unverified; publication requires checks', () => {
  const job = fixture(); job.checks = ''; job.rounds[0].check = { state: 'not-set', fingerprint: 'tree' };
  assert.equal(resolutionCandidate(job, evidence).disposition, 'completed-unverified');
  job.workflow = 'worktree'; assert.equal(resolutionCandidate(job, evidence).decisionRequired, true);
});
