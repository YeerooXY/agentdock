'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { clineRoute } = require('../electron/native-account-route.cjs');
test('native selected free route exposes no credential or fabricated quota', () => {
  const result = clineRoute({ env: {}, read: () => JSON.stringify({ lastUsedProvider: 'cline', providers: { cline: { token: 'PRIVATE', settings: { provider: 'cline', model: 'cline-free/nemotron-3.5-super-vl', apiKey: 'PRIVATE' } } } }) });
  assert.deepEqual(result, { model: 'cline-free/nemotron-3.5-super-vl', nativeProvider: 'cline', funding: 'free', quota: 'unknown' });
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});
test('other native routes and missing settings remain unknown', () => {
  assert.equal(clineRoute({ read: () => '{' }), null);
  const result = clineRoute({ read: () => JSON.stringify({ lastUsedProvider: 'openrouter', providers: { openrouter: { settings: { provider: 'openrouter', model: 'anthropic/claude-opus' } } } }) });
  assert.equal(result.funding, 'unknown');
});
