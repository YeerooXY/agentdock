'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaskAccounts } = require('../electron/task-accounts.cjs');

test('task accounts read current workers, quota freshness and funding without a metered fallback', () => {
  let workers = [], checks = new Map(), limits = [];
  const now = 4_000_000;
  const routing = createTaskAccounts({
    getWorkers: () => workers,
    usageAccounts: () => [{ id: 'pi:default', provider: 'pi' }],
    getUsageCheck: id => checks.get(id), getLimits: () => limits,
    limitAccountId: item => item.accountId,
    reviewers: ['pi', 'cline'], executable: id => id + '.exe',
    choices: id => [{ id: id + ':default', provider: id }],
    getAccount: () => null, namedProfiles: () => true, hasCredentials: () => true,
    environment: () => ({}), usageEnvironment: value => value,
    credentialSwitch: { activate() {}, release() {} },
    clineRoute: () => ({ funding: 'free', model: 'verified-free-route' }),
    saveResult() {}, now: () => now
  });
  assert.equal(routing.candidates().find(item => item.provider === 'pi').funding, 'unknown');
  checks = new Map([['pi:default', { status: 'current' }]]);
  limits = [{ accountId: 'pi:default', observedAt: now,
    windows: [{ modelGroup: 'openrouter:free', remaining: 1 }],
    freeAlternatives: [{ route: 'openrouter/example:free' }] }];
  assert.equal(routing.candidates().find(item => item.provider === 'pi').funding, 'free');
  workers = [{ id: 'local', local: true, signedIn: true }];
  assert.equal(routing.getAccounts().find(item => item.id === 'local').local, true);
  limits = [{ ...limits[0], observedAt: now - 31 * 60_000 }];
  const stale = routing.candidates().find(item => item.provider === 'pi');
  assert.equal(stale.available, false);
  assert.equal(stale.funding, 'unknown');
  assert.equal(stale.model, null);
  checks = new Map([['pi:default', { status: 'sign-in' }]]);
  assert.equal(routing.getAccounts().find(item => item.id === 'pi:default').signedIn, false);
  assert.deepEqual(routing.candidates().find(item => item.provider === 'cline').model, 'verified-free-route');
  assert.equal(routing.getLimits()[0].usageCheck.status, 'sign-in');
});
