'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { implementerLaunch, TaskLoop } = require('../electron/task-loop.cjs');

const claudeModels = [{ id: 'claude-haiku-5', efforts: ['low', 'medium', 'high'] }, { id: 'claude-opus-5', efforts: ['low', 'high', 'max'] }];
const accounts = [
  { id: 'claude:default', provider: 'claude', label: 'Claude', models: claudeModels },
  { id: 'kiro:default', provider: 'kiro', label: 'Kiro', models: [] }
];
const context = { candidates: () => accounts, getProfiles: () => [], getLimits: () => [], getSettings: () => ({}), now: () => 0 };
const assign = raw => TaskLoop.prototype.assignment.call(context, raw, 'implementer');

test('omitted effort defaults to medium when the provider and discovered model support it, and reaches the launch', () => {
  const assignment = assign({ accountId: 'claude:default', model: 'claude-haiku-5' });
  assert.equal(assignment.requestedEffort, 'medium');
  const launch = implementerLaunch('claude', 'claude.exe', { model: 'claude-haiku-5', effort: assignment.effort, platform: 'linux' });
  assert.deepEqual(launch.args.slice(launch.args.indexOf('--effort')), ['--effort', 'medium']);
  assert.deepEqual(launch.effortDispatch, { requested: 'medium', method: 'flag', flag: '--effort', value: 'medium', status: 'requested' });
});

test('omitted effort respects a model exclusion and uses provider medium when model details are unavailable', () => {
  const noMedium = assign({ accountId: 'claude:default', model: 'claude-opus-5' });
  assert.equal(noMedium.requestedEffort, null);
  const undiscovered = assign({ accountId: 'claude:default', model: 'claude-sonnet-unlisted' });
  assert.equal(undiscovered.requestedEffort, 'medium');
  const launch = implementerLaunch('claude', 'claude.exe', { model: 'claude-opus-5', effort: noMedium.effort, platform: 'linux' });
  assert.equal(launch.args.includes('--effort'), false);
  assert.deepEqual(launch.effortDispatch, { requested: null, status: 'native-default' });
});

test('providers without any effort control keep the native default for omitted effort', () => {
  const assignment = assign({ accountId: 'kiro:default' });
  assert.equal(assignment.requestedEffort, null);
});

test('explicit effort values are never replaced by the medium default', () => {
  assert.equal(assign({ accountId: 'claude:default', model: 'claude-haiku-5', effort: '' }).requestedEffort, null);
  assert.equal(assign({ accountId: 'claude:default', model: 'claude-haiku-5', effort: 'high' }).requestedEffort, 'high');
  assert.equal(assign({ accountId: 'claude:default', model: 'claude-opus-5', effort: 'high' }).requestedEffort, 'high');
  assert.throws(() => assign({ accountId: 'claude:default', model: 'claude-haiku-5', effort: 'max' }), /selected model does not support/);
});
