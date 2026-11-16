'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let tierOptions, excludedModelCandidates, normalizeEntries;
// Dynamic import of the ES module from CJS test.
test('routing-controls helpers load', async () => {
  const m = await import('../src/pages/routing-controls.js');
  tierOptions = m.tierOptions;
  excludedModelCandidates = m.excludedModelCandidates;
  normalizeEntries = m.normalizeEntries;
});

test('tierOptions returns empty list when no accounts or models', async () => {
  const m = await import('../src/pages/routing-controls.js');
  assert.deepEqual(m.tierOptions([], []), []);
  assert.deepEqual(m.tierOptions(null, []), []);
});

test('tierOptions builds label from account label and model id', async () => {
  const m = await import('../src/pages/routing-controls.js');
  const accounts = [{ id: 'codex:default', label: 'Codex', models: [{ id: 'gpt-6-luna', available: true }, { id: 'gpt-5.6-terra', available: true }] }];
  const opts = m.tierOptions(accounts, []);
  assert.equal(opts.length, 2);
  assert.equal(opts[0].value, 'codex:default gpt-6-luna');
  assert.match(opts[0].label, /Codex/);
  assert.match(opts[0].label, /gpt-6-luna/);
});

test('tierOptions excludes unavailable models', async () => {
  const m = await import('../src/pages/routing-controls.js');
  const accounts = [{ id: 'a:b', label: 'A', models: [{ id: 'good', available: true }, { id: 'bad', available: false }] }];
  const opts = m.tierOptions(accounts, []);
  assert.equal(opts.length, 1);
  assert.equal(opts[0].value, 'a:b good');
});

test('tierOptions appends stored entries not in discovered list as notFound', async () => {
  const m = await import('../src/pages/routing-controls.js');
  const accounts = [{ id: 'codex:default', label: 'Codex', models: [{ id: 'gpt-6-luna', available: true }] }];
  const stored = [{ accountId: 'codex:default', model: 'gpt-6-luna' }, { accountId: 'old:account', model: 'old-model' }];
  const opts = m.tierOptions(accounts, stored);
  assert.equal(opts.length, 2);
  assert.equal(opts[0].notFound, undefined);
  assert.equal(opts[1].value, 'old:account old-model');
  assert.equal(opts[1].notFound, true);
  assert.match(opts[1].label, /not found/);
});

test('tierOptions does not duplicate discovered entries present in stored list', async () => {
  const m = await import('../src/pages/routing-controls.js');
  const accounts = [{ id: 'a:b', label: 'A', models: [{ id: 'm1', available: true }] }];
  const stored = [{ accountId: 'a:b', model: 'm1' }];
  const opts = m.tierOptions(accounts, stored);
  assert.equal(opts.length, 1);
});

test('excludedModelCandidates collects unique model ids from all accounts', async () => {
  const m = await import('../src/pages/routing-controls.js');
  const accounts = [
    { id: 'a:1', models: [{ id: 'alpha' }, { id: 'beta' }] },
    { id: 'b:1', models: [{ id: 'beta' }, { id: 'gamma' }] },
  ];
  const ids = m.excludedModelCandidates(accounts);
  assert.deepEqual(ids, ['alpha', 'beta', 'gamma']);
});

test('normalizeEntries passes through valid arrays', async () => {
  const m = await import('../src/pages/routing-controls.js');
  const input = [{ accountId: 'a:b', model: 'm' }, { accountId: 'c:d', model: 'n' }];
  assert.deepEqual(m.normalizeEntries(input), input);
});

test('normalizeEntries drops malformed array entries', async () => {
  const m = await import('../src/pages/routing-controls.js');
  const input = [{ accountId: 'a:b', model: 'm' }, null, { accountId: 'c:d' }, { model: 'n' }];
  assert.deepEqual(m.normalizeEntries(input), [{ accountId: 'a:b', model: 'm' }]);
});

test('normalizeEntries parses legacy text format', async () => {
  const m = await import('../src/pages/routing-controls.js');
  const text = 'codex:default gpt-6-luna\nopencode:default opencode-go/kimi-k3.1-pro';
  assert.deepEqual(m.normalizeEntries(text), [
    { accountId: 'codex:default', model: 'gpt-6-luna' },
    { accountId: 'opencode:default', model: 'opencode-go/kimi-k3.1-pro' },
  ]);
});

test('normalizeEntries returns empty array for empty string or non-string/array', async () => {
  const m = await import('../src/pages/routing-controls.js');
  assert.deepEqual(m.normalizeEntries(''), []);
  assert.deepEqual(m.normalizeEntries(null), []);
  assert.deepEqual(m.normalizeEntries(undefined), []);
});
