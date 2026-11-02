'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { levels, validateEffort, launchArgs } = require('../electron/task-effort.cjs');
const { implementerLaunch, TaskLoop } = require('../electron/task-loop.cjs');
const { reviewerLaunch } = require('../electron/delegation.cjs');
const { workerLaunch } = require('../electron/provider-workers.cjs');

test('provider capabilities expose only verified effort mappings', () => {
  assert.deepEqual(levels('codex'), ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
  assert.deepEqual(levels('claude'), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.ok(levels('pi').includes('off')); assert.ok(levels('opencode').includes('high'));
  assert.equal(validateEffort('claude', undefined), '');
  assert.throws(() => validateEffort('kiro', 'high'), /not available/);
  assert.throws(() => validateEffort('codex', 'invalid'), /effort/);
  assert.throws(() => validateEffort('codex', 'max', { model: 'small', models: [{id:'small',efforts:['low','high']}] }), /selected model/);
});

test('Codex and Claude adapters preserve defaults and record requested dispatches', () => {
  const codex = implementerLaunch('codex', 'codex.exe', { effort: 'high', platform: 'linux' });
  assert.ok(codex.args.includes('model_reasoning_effort="high"'));
  assert.deepEqual(codex.effortDispatch, { requested: 'high', method: 'config', key: 'model_reasoning_effort', value: 'high', status: 'requested' });
  const claude = reviewerLaunch('claude', 'claude.exe', { effort: 'max', outFile: 'reply' });
  assert.ok(claude.args.includes('--effort') && claude.args.includes('max'));
  assert.deepEqual(claude.effortDispatch, { requested: 'max', method: 'flag', flag: '--effort', value: 'max', status: 'requested' });
  assert.deepEqual(launchArgs('codex', '').evidence, { requested: null, status: 'native-default' });
  const copilot = workerLaunch('copilot', 'copilot.exe', { effort: 'medium' });
  assert.ok(copilot.args.includes('--reasoning-effort'));
  assert.equal(copilot.effortDispatch.requested, 'medium');
  assert.throws(() => workerLaunch('antigravity', 'agy.exe', { effort: 'high' }), /not available/);
});

test('planner and reviewer assignments retain provider-valid requested effort', () => {
  const candidates = () => [
    { id: 'codex:default', provider: 'codex', label: 'Codex' },
    { id: 'claude:default', provider: 'claude', label: 'Claude' }
  ];
  const context = { candidates, getProfiles: () => [], getLimits: () => [], getSettings: () => ({}), now: () => 0 };
  const planner = TaskLoop.prototype.assignment.call(context, { accountId: 'claude:default', effort: 'high' }, 'planner');
  const reviewer = TaskLoop.prototype.assignment.call(context, { accountId: 'codex:default', effort: 'xhigh' }, 'reviewer');
  assert.equal(planner.requestedEffort, 'high'); assert.equal(reviewer.requestedEffort, 'xhigh');
  assert.throws(() => TaskLoop.prototype.assignment.call(context, { accountId: 'claude:default', effort: 'minimal' }, 'planner'), /Claude effort/);
  const choices = TaskLoop.prototype.choices.call({ ...context, repositories: () => [] }, undefined);
  assert.deepEqual(choices.implementers.find(item => item.id === 'codex:default').efforts, ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
  assert.deepEqual(choices.reviewers.find(item => item.id === 'claude:default').efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
});
