'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Workbench } = require('../electron/workbench.cjs');

test('agent candidates contain quota once, preserve model evidence and expose full details on demand', async () => {
  const account = { id: 'claude:default', provider: 'claude', label: 'Claude', funding: 'included', signedIn: true, workerSupported: true,
    models: [{ id: 'selected-model', available: true, tier: 2, observedAt: 100, efforts: ['medium'], source: 'Native account catalog' }],
    allowance: { status: 'stale', observedAt: 100, remainingPercent: null, blocked: false,
      windows: [{ label: 'Weekly', usedPercent: 58, resetsAt: 300, status: 'stale' },
        { label: 'Disabled window', usedPercent: null, notApplicable: true, status: 'unknown' },
        { label: 'Unlimited window', usedPercent: null, unlimited: true, status: 'fresh' }] } };
  const unknown = { id: 'kimi:default', provider: 'kimi', label: 'Kimi', funding: 'unknown', signedIn: null, workerSupported: true,
    quotaReader: 'unavailable', quotaMessage: 'Kimi returned an empty quota list.', allowance: { status: 'unknown', windows: [] } };
  const raw = { accounts: [account, unknown], implementers: [account, unknown], reviewers: [account], allReviewers: [account, unknown],
    repos: [{ path: '/other-project' }], assignment: { implementer: null, warnings: ['Quota is stale.'] } };
  const before = JSON.stringify(raw);
  const workbench = Object.assign(Object.create(Workbench.prototype), { getProject: () => '/project', getTasks: () => ({ choices: () => raw }) });
  const compact = await workbench.invoke('dock/task_candidates', {});
  assert.deepEqual(compact.implementers, ['claude:default', 'kimi:default']);
  assert.deepEqual(compact.reviewers, ['claude:default']);
  assert.equal(compact.accounts.length, 1);
  assert.equal((JSON.stringify(compact).match(/Weekly/g) || []).length, 1);
  assert.equal(compact.unknown.length, 1);
  assert.equal(compact.unknown[0].reason, unknown.quotaMessage);
  assert.equal(compact.accounts[0].allowance.remainingPercent, null);
  assert.equal(compact.accounts[0].allowance.windows[0].remainingPercent, 42);
  assert.equal(compact.accounts[0].allowance.status, 'stale');
  assert.equal(compact.accounts[0].allowance.windows[1].notApplicable, true);
  assert.equal(compact.accounts[0].allowance.windows[1].remainingPercent, null);
  assert.equal(compact.accounts[0].allowance.windows[2].unlimited, true);
  assert.equal(compact.accounts[0].modelCount, 1);
  assert.equal(compact.accounts[0].models, undefined);
  assert.doesNotMatch(JSON.stringify(compact), /allReviewers|repos|other-project|Native account catalog/);
  assert.deepEqual(compact.assignment, raw.assignment);
  const detail = await workbench.invoke('dock/task_candidates', { accountId: unknown.id });
  assert.deepEqual(detail, { account: unknown, implementer: true, reviewer: false });
  const knownDetail = await workbench.invoke('dock/task_candidates', { accountId: account.id });
  assert.equal(knownDetail.account.models[0].source, 'Native account catalog');
  assert.deepEqual(knownDetail.account.models[0].efforts, ['medium']);
  assert.equal(knownDetail.account.models[0].available, true);
  assert.equal(knownDetail.account.models[0].observedAt, 100);
  await assert.rejects(workbench.invoke('dock/task_candidates', { accountId: 'missing' }), /not found/);
  assert.equal(JSON.stringify(raw), before);
});

test('requested usage refresh finishes before task candidates are read', async () => {
  const events = [];
  const workbench = Object.assign(Object.create(Workbench.prototype), {
    getProject: () => '/project', refreshUsage: async () => { events.push('refresh'); },
    getTasks: () => ({ choices: () => { events.push('choices'); return { accounts: [], implementers: [], reviewers: [], assignment: {} }; } }),
  });
  await workbench.invoke('dock/task_candidates', { refresh: true });
  assert.deepEqual(events, ['refresh', 'choices']);
  events.length = 0;
  workbench.refreshUsage = async () => { throw Error('Usage refresh failed'); };
  await assert.rejects(workbench.invoke('dock/task_candidates', { refresh: true }), /Usage refresh failed/);
  assert.deepEqual(events, []);
});
