'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { accountIdForLimit, isDefaultAccountLimit } = require('../electron/account-switching-policy.cjs');
test('saved usage preserves default accounts without recreating removed named profiles', () => {
  assert.equal(isDefaultAccountLimit({ provider: 'codex' }), true);
  assert.equal(isDefaultAccountLimit({ provider: 'claude', id: 'claude:account' }), true);
  assert.equal(isDefaultAccountLimit({ provider: 'antigravity', accountId: 'antigravity:default' }), true);
  assert.equal(isDefaultAccountLimit({ provider: 'codex', accountId: 'cb75b00b-2caf-4295-8256-0d28514a1531' }), false);
  assert.equal(isDefaultAccountLimit({ provider: 'claude', accountId: 'af33e776-3122-4055-84bb-1ca3a749d366' }), false);
  assert.equal(accountIdForLimit({ provider: 'codex', accountId: 'kept-profile' }), 'kept-profile');
  assert.equal(isDefaultAccountLimit(null), false);
});
