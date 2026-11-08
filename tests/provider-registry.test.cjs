'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../electron/providers/index.cjs');
const { catalog, byId, providers } = require('../electron/cli-catalog.cjs');
const capabilities = require('../electron/provider-account-capabilities.cjs');
const snapshot = require('./fixtures/provider-registry-snapshot.json');

const plain = value => JSON.parse(JSON.stringify(value));

test('derived catalog, provider list and capability table equal the pre-registry values', () => {
  assert.deepEqual(plain(catalog), snapshot.catalog);
  assert.deepEqual(providers, snapshot.providers);
  assert.deepEqual(plain(capabilities.listAccountProviders()), snapshot.capabilities);
  assert.equal(byId.get('cursor').aliases[0], 'cursor-agent');
});

test('usage capability follows the usage reader references', () => {
  assert.deepEqual(registry.usageProviders.slice().sort(), ['antigravity', 'claude', 'codex', 'copilot', 'cursor', 'kimi', 'kiro', 'opencode', 'pi']);
  for (const item of capabilities.listAccountProviders()) assert.equal(item.usage, registry.usageProviders.includes(item.id), item.id);
});

test('providers without a reader declare why', () => {
  for (const id of ['grok', 'cline', 'qwen']) assert.equal(registry.usageSource(id).state, 'no-source');
  assert.equal(registry.usageSource('droid').state, 'no-reader');
  assert.equal(registry.usageSource('gemini'), null, 'Gemini CLI support was removed');
  assert.equal(registry.usageSource('strata').state, 'no-quota');
  assert.equal(registry.sourceForAccount({ id: 'opencode:strata', provider: 'opencode' }).provider, 'strata');
  assert.equal(registry.sourceForAccount({ id: 'opencode:default', provider: 'opencode' }).provider, 'opencode');
  assert.equal(registry.usageSource('__proto__'), null);
});

test('only providers with verified separate sign-in storage are isolated', () => {
  assert.deepEqual(registry.adapters.filter(a => a.accounts).map(a => a.id).sort(), ['antigravity', 'claude', 'codex', 'grok', 'pi']);
  for (const id of ['copilot', 'cursor', 'kiro', 'kimi', 'opencode']) assert.equal(registry.usageSource(id).isolated, false);
  assert.equal(registry.usageSource('antigravity').switched, true);
});

test('adapter schema rejects malformed adapters', () => {
  const good = () => structuredClone(registry.byId('grok'));
  assert.doesNotThrow(() => registry.validate(good(), 'grok'));
  const bad = [
    [a => { a.id = 'other'; }, /file name must match/],
    [a => { a.extra = 1; }, /unknown top-level/],
    [a => { a.settings.strategy = 'missing'; }, /unknown settings strategy/],
    [a => { a.settings.extra = true; }, /unknown settings/],
    [a => { a.settings.resumeFlag = ['--conversation']; }, /resumeFlag needs/],
    [a => { a.settings = { strategy: 'codex', resumeFlag: '--conversation' }; }, /resumeFlag needs/],
    [a => { a.session = { identityEvents: 'guess' }; }, /identity event policy/],
    [a => { a.session = { focusReports: 'yes' }; }, /session flags/],
    [a => { a.session = { steering: 'yes' }; }, /session flags/],
    [a => { a.console = { permissions: 'yes' }; }, /console.permissions/],
    [a => { a.console = { unknown: true }; }, /unknown console/],
    [a => { a.session = { instructionFiles: ['../AGENTS.md'] }; }, /distinct basenames/],
    [a => { delete a.catalog.name; }, /catalog needs/],
    [a => { a.catalog.install = {}; }, /script or npm/],
    [a => { a.launch.surprise = 1; }, /unknown launch/],
    [a => { a.launch.args = [1]; }, /launch.args/],
    [a => { a.usage = { reader: 'grok', method: 'screen' }; }, /needs method, precision and source/],
    [a => { a.usage = { reader: 'other', method: 'screen', precision: 'exact', source: 'x' }; }, /reference this provider/],
    [a => { a.usage = { reader: null }; }, /needs a usage state/],
    [a => { a.usage = { reader: null, state: 'no-source', method: 'screen' }; }, /belong to a reader/],
    [a => { a.usage = { reader: null, state: 'no-source', accountIds: ['x:y'] }; }, /accountIds apply/],
    [a => { a.accounts = { isolation: {}, login: { args: [] }, models: false, resume: false }; }, /isolation needs/]
  ];
  for (const [mutate, pattern] of bad) { const adapter = good(); mutate(adapter); assert.throws(() => registry.validate(adapter, 'grok'), pattern); }
  assert.throws(() => registry.validate({ ...registry.byId('strata'), launch: { args: ['x'] } }, 'strata'), /without a CLI/);
});

test('two providers cannot claim the same fixed account', () => {
  const loader = id => { const adapter = structuredClone(registry.byId(id)); if (id === 'codex') adapter.usage = { reader: null, state: 'no-quota', accountIds: ['opencode:strata'] }; return adapter; };
  assert.throws(() => registry.load(loader), /already claimed/);
});

test('session policies are immutable, serializable and safe for unknown providers', () => {
  assert.equal(registry.sessionPolicy('codex').focusReports, false);
  assert.equal(registry.sessionPolicy('antigravity').identityEvents, 'tagged-uuid');
  assert.deepEqual(registry.ids.filter(id => registry.sessionPolicy(id).persistConversation), ['codex', 'claude', 'antigravity']);
  assert.deepEqual(registry.sessionPolicy('copilot').instructionFiles, ['PADDOCK.md', 'AGENTS.md']);
  assert.equal(registry.sessionPolicy('__proto__').identityEvents, 'none');
  assert.equal(Object.isFrozen(registry.sessionPolicy('copilot').instructionFiles), true);
  for (const adapter of registry.adapters) assert.deepEqual(structuredClone(adapter), JSON.parse(JSON.stringify(adapter)));
});

test('console choices carry registry flags and steering uses one provider policy', () => {
  const { consoleChoices } = require('../electron/mobile-console.cjs');
  const { WorkerSessions } = require('../electron/worker-sessions.cjs');
  const { consoleCapabilities } = require('../electron/worker-placement.cjs');
  const choices = consoleChoices({ items: new Map(), cliSetup: { snapshot: () => [] } }, {});
  const workers = new WorkerSessions({ items: new Map(), emit() {} }, {
    jobs: new Map(), unconfirmed: new Set(), changed() {}, now: () => 1
  });
  for (const agent of choices.agents) {
    assert.deepEqual(agent.consoleFeatures, registry.consoleFeaturesFor(agent.id));
    const item = workers.open({ id: agent.id, rounds: [{ attemptId: 'a' }] }, { provider: agent.id });
    assert.equal(item.steeringSupported, registry.sessionPolicy(agent.id).steering);
    assert.equal(consoleCapabilities(item, null, true).steering,
      registry.sessionPolicy(agent.id).steering);
  }
  assert.equal(registry.consoleFeaturesFor('__proto__').permissions, false);
  assert.equal(Object.isFrozen(registry.consoleFeaturesFor('codex')), true);
  assert.deepEqual(registry.ids.filter(id => registry.consoleFeaturesFor(id).modelChoices), ['codex', 'claude', 'opencode']);
  assert.deepEqual(registry.ids.filter(id => registry.consoleFeaturesFor(id).mobileModelChoices), ['codex', 'claude']);
  assert.deepEqual(registry.ids.filter(id => registry.consoleFeaturesFor(id).liveModelMenu), ['codex', 'claude', 'opencode']);
  assert.deepEqual(registry.ids.filter(id => registry.sessionPolicy(id).steering), ['codex', 'claude', 'kiro']);
});
