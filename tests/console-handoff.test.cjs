'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { freshSession, handoffText } = require('../electron/console-handoff.cjs');
test('fresh sessions keep the account and project without resuming old conversation', async () => {
  const item = { id: 'a', launchId: 'old', alive: true, purpose: 'agent', provider: 'claude', projectId: 'p', cwd: '/repo', accountId: 'claude:other', providerSessionId: 'old-history', permissions: 'default' };
  let created;
  const sessions = { items: new Map([['a', item]]), create: async (raw, options) => { created = { raw, options }; return { id: 'new' }; } };
  await freshSession(sessions, { id: 'a', launchId: 'old', handoff: 'Next: run checks.' });
  assert.equal(created.options.accountId, 'claude:other'); assert.equal(created.options.resumeId, undefined);
  assert.equal(created.raw.projectId, 'p'); assert.equal(created.raw.handoff, 'Next: run checks.'); assert.equal(item.alive, true);
  await assert.rejects(freshSession(sessions, { id: 'a', launchId: 'stale' }), /open local/);
  assert.throws(() => handoffText('x'.repeat(4001)), /4,000/);
});
