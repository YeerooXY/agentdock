'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { catalog } = require('../electron/cli-catalog.cjs');
const registry = require('../electron/provider-account-capabilities.cjs');

test('account registry covers the CLI catalog and rejects unknown and prototype IDs', () => {
  const providers = registry.listAccountProviders();
  assert.equal(new Set(providers.map(x => x.id)).size, catalog.length);
  for (const cli of catalog) assert.equal(registry.getAccountProvider(cli.id).name, cli.name);
  for (const id of ['missing-provider', '__proto__', 'constructor', 'toString', null]) {
    assert.equal(registry.getAccountProvider(id), null); assert.equal(registry.supportsNamedProfiles(id), false);
  }
});
test('nested capability metadata cannot be changed by a caller', () => {
  const before = registry.getAccountProvider('gemini');
  assert.throws(() => before.login.args.push('--wrong-account'), TypeError);
  assert.throws(() => { before.isolation.envOverrides.GEMINI_FORCE_FILE_STORAGE = 'false'; }, TypeError);
  registry.listAccountProviders().pop();
  assert.equal(registry.listAccountProviders().length, catalog.length);
});
test('profile isolation, usage and conversation resume have independent support', () => {
  const gemini = registry.getAccountProvider('gemini'), cursor = registry.getAccountProvider('cursor');
  assert.equal(gemini.namedProfiles, true); assert.equal(gemini.usage, false); assert.equal(gemini.resume, false);
  assert.equal(cursor.namedProfiles, false); assert.equal(cursor.usage, true); assert.ok(cursor.reason);
  assert.equal(registry.supportsNamedProfiles('pi'), true);
});
