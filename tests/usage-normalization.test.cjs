'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SubscriptionUsage, UsageError, usageHelp } = require('../electron/subscription-usage.cjs');
const { buildUsageReaders } = require('../electron/usage-readers.cjs');
const { usageProviders } = require('../electron/providers/index.cjs');
const capabilities = require('../electron/provider-account-capabilities.cjs');
const { STALE_AFTER_MS, normalizeReading } = require('../electron/usage-reading.cjs');

const MIN = 60_000;
const row = (provider, id, at, windows = [{ key: 'five_hour', label: '5-hour', minutes: 300, usedPercent: 34, resetsAt: at + 60 * MIN }]) => [{ id, accountId: id, provider, observedAt: at, windows }];

test('inapplicable windows cannot carry a false percentage or reset countdown', () => {
  const account = { id: 'antigravity:default', provider: 'antigravity' };
  const value = normalizeReading({ accountId: account.id, provider: account.provider, observedAt: 1, windows: [
    { key: 'five-hour', notApplicable: true, usedPercent: 0, resetsAt: 2, resetLabel: 'Weekly limit reached' }
  ] }, account).windows[0];
  assert.equal(value.notApplicable, true);
  assert.equal(value.usedPercent, null);
  assert.equal(value.resetsAt, null);
  assert.equal(value.resetLabel, 'Weekly limit reached');
});

test('readings are normalized and keep unknown percentages unknown', () => {
  const account = { id: 'cursor:default', provider: 'cursor', label: 'Default Cursor' };
  const reading = normalizeReading({ id: account.id, accountId: account.id, provider: 'cursor', observedAt: 5, windows: [
    { key: 'a', label: 'Included', modelGroup: 'cursor:a', usedPercent: null }, { key: 'b', label: 'Bad', usedPercent: 140 }, { key: 'c', label: 'Chat', unlimited: true, usedPercent: null }] }, account);
  assert.equal(reading.method, 'screen'); assert.equal(reading.precision, 'rounded'); assert.equal(reading.accountLabel, 'Default Cursor');
  assert.deepEqual(reading.windows.map(w => w.usedPercent), [null, null, null]);
  assert.deepEqual(reading.windows.map(w => w.scope), ['model-group', 'account', 'account']);
  assert.equal(reading.windows[0].modelGroup, 'cursor:a'); assert.equal(reading.windows[2].unlimited, true); assert.equal(reading.windows[1].resetsAt, null);
  assert.equal(normalizeReading({ accountId: 'cursor:other', provider: 'cursor', observedAt: 1, windows: [] }, account), null);
  assert.equal(normalizeReading({ accountId: account.id, provider: 'kiro', observedAt: 1, windows: [] }, account), null);
  assert.equal(normalizeReading({ accountId: account.id, provider: 'cursor', windows: [] }, account), null);
});

test('staleness is decided on the server: age, passed reset and failed check with a cached reading', async () => {
  let now = 1_000_000, fail = false;
  const usage = new SubscriptionUsage({ cooldownMs: 0, now: () => now, readers: { claude: async a => { if (fail) throw new UsageError('sign-in', 'Sign in through this CLI, then refresh.'); return row('claude', a.id, now); } } });
  const account = { id: 'claude:default', provider: 'claude' };
  await usage.refresh([account]);
  let [check] = usage.snapshot();
  assert.equal(check.status, 'current'); assert.equal(check.stale, false); assert.equal(check.lastReading.windows[0].usedPercent, 34);
  now += STALE_AFTER_MS; assert.equal(usage.snapshot()[0].status, 'current');
  now += 1; check = usage.snapshot()[0];
  assert.equal(check.status, 'stale'); assert.equal(check.staleReason, 'age'); assert.equal(check.lastReading.windows[0].usedPercent, 34);
  now = 1_000_000; await usage.refresh([account]);
  now += 61 * MIN - 1; assert.equal(usage.snapshot()[0].staleReason, 'age');
  const reset = new SubscriptionUsage({ now: () => 100, readers: { claude: async a => row('claude', a.id, 100, [{ key: 'w', usedPercent: 10, resetsAt: 150 }]) } });
  await reset.refresh([account]); assert.equal(reset.snapshot()[0].status, 'current');
  reset.now = () => 150; assert.equal(reset.snapshot()[0].status, 'stale'); assert.equal(reset.snapshot()[0].staleReason, 'reset-passed');
  now = 2_000_000; await usage.refresh([account]); fail = true; now += 20_000; await usage.refresh([account]);
  check = usage.snapshot()[0];
  assert.equal(check.status, 'stale'); assert.equal(check.failure, 'sign-in'); assert.equal(check.staleReason, 'check-failed'); assert.ok(check.lastReading);
  assert.equal(check.observedAt, 2_000_000);
});

test('a failed check without a cached reading keeps its own status', async () => {
  const usage = new SubscriptionUsage({ readers: { claude: async () => { throw new UsageError('timeout', 'The usage check timed out. Try again.'); } } });
  await usage.refresh([{ id: 'claude:default', provider: 'claude' }]);
  const [check] = usage.snapshot(); assert.equal(check.status, 'timeout'); assert.equal(check.stale, false); assert.equal(check.lastReading, null);
});

test('saved readings seed as stale with their age and are replaced by the first check', async () => {
  const at = 5_000_000;
  const usage = new SubscriptionUsage({ now: () => at + 10 * MIN, cooldownMs: 0, readers: { claude: async a => row('claude', a.id, at + 10 * MIN) } });
  usage.seed([...row('claude', 'claude:default', at), { provider: 'claude', observedAt: NaN }, { accountId: 'x', provider: 'claude' }]);
  let [check] = usage.snapshot();
  assert.equal(usage.snapshot().length, 1); assert.equal(check.status, 'stale'); assert.equal(check.staleReason, 'age'); assert.equal(check.observedAt, at);
  await usage.refresh([{ id: 'claude:default', provider: 'claude' }]);
  [check] = usage.snapshot(); assert.equal(check.status, 'current'); assert.equal(check.observedAt, at + 10 * MIN);
});

test('providers without a quota or a source are explicit, and Strata is Local', async () => {
  const usage = new SubscriptionUsage({ readers: {} });
  await usage.refresh([{ id: 'opencode:strata', provider: 'opencode' }, { id: 'strata:default', provider: 'strata' }, { id: 'grok:default', provider: 'grok' }, { id: 'cline:default', provider: 'cline' },
    { id: 'qwen:default', provider: 'qwen' }, { id: 'droid:default', provider: 'droid' }]);
  const by = Object.fromEntries(usage.snapshot().map(check => [check.accountId, check]));
  assert.equal(by['opencode:strata'].status, 'no-quota'); assert.equal(by['strata:default'].status, 'no-quota'); assert.match(by['opencode:strata'].message, /Local model/);
  for (const id of ['grok', 'cline', 'qwen']) { assert.equal(by[id + ':default'].status, 'unsupported'); assert.equal(by[id + ':default'].reason, 'no-source'); }
  assert.equal(by['droid:default'].reason, 'no-reader');
});

test('the five global-environment CLIs are not-isolated for non-default accounts and never call a reader', async () => {
  const calls = [], readers = {};
  const six = ['copilot', 'cursor', 'kiro', 'kimi', 'opencode'];
  for (const provider of six) readers[provider] = async a => { calls.push(a.id); return row(provider, a.id, 100); };
  const usage = new SubscriptionUsage({ now: () => 100, readers });
  await usage.refresh(six.flatMap(provider => [{ id: provider + ':default', provider }, { id: provider + ':second', provider }]));
  const by = Object.fromEntries(usage.snapshot().map(check => [check.accountId, check]));
  for (const provider of six) {
    assert.equal(by[provider + ':default'].status, 'current'); assert.equal(by[provider + ':second'].status, 'not-isolated');
    assert.equal(by[provider + ':second'].lastReading, null); assert.equal(by[provider + ':second'].observedAt, null);
  }
  assert.deepEqual(calls.sort(), six.map(provider => provider + ':default').sort());
});

test('a reading that names another account is rejected, not relabelled', async () => {
  const usage = new SubscriptionUsage({ now: () => 100, readers: { claude: async () => row('claude', 'claude:default', 100) } });
  await usage.refresh([{ id: 'claude:other', provider: 'claude' }]);
  const [check] = usage.snapshot(); assert.equal(check.status, 'unavailable'); assert.equal(check.lastReading, null);
});

test('usage help no longer sends Kimi users to a command when a reader exists', () => {
  assert.doesNotMatch(usageHelp('kimi'), /no connected background quota reader/); assert.match(usageHelp('kimi'), /read in the background/);
  assert.match(usageHelp('droid'), /\/limits in Droid/);
  assert.match(usageHelp('grok'), /No quota source/); assert.match(usageHelp('strata'), /Local model/);
});

function readerHarness() {
  const seen = {}, impl = {};
  for (const name of ['Claude', 'Copilot', 'Kiro', 'Kimi', 'OpenCode', 'Antigravity', 'Cursor', 'Pi']) impl[`read${name}Usage`] = async options => { seen[name.toLowerCase()] = options; return []; };
  const accounts = { environment: (id, provider, { baseEnv }) => ({ ...baseEnv, ACCOUNT_ENV: id + '/' + provider }), getAccount: id => ({ configDir: '/profiles/' + id }) };
  const readers = buildUsageReaders({ executable: id => '/bin/' + id, accounts, usageDirectory: '/usage', env: { PATH: 'x', OPENAI_API_KEY: 'secret' }, codex: async () => ['codex'], impl });
  return { seen, readers };
}

test('the reader map equals the providers that declare a reader, and drives the usage capability', () => {
  const { readers } = readerHarness();
  assert.deepEqual(Object.keys(readers).sort(), usageProviders.slice().sort());
  for (const item of capabilities.listAccountProviders()) assert.equal(item.usage, Object.hasOwn(readers, item.id), item.id);
});

test('every reader receives the selected account environment, without inherited secrets', async () => {
  const { seen, readers } = readerHarness();
  for (const provider of Object.keys(readers).filter(id => id !== 'codex')) await readers[provider]({ id: provider + ':default', provider });
  for (const [provider, options] of Object.entries(seen)) {
    assert.equal(options.accountId, provider + ':default'); assert.equal(options.env.ACCOUNT_ENV, provider + ':default/' + provider, provider);
    assert.equal(options.env.OPENAI_API_KEY, undefined, provider);
  }
  assert.equal(seen.pi.settingsPath.replaceAll('\\', '/'), '/profiles/pi:default/settings.json');
  await readers.claude({ id: 'claude:profile', provider: 'claude' }); assert.equal(seen.claude.env.ACCOUNT_ENV, 'claude:profile/claude');
});

test('reader functions refuse another account of an unverified CLI even if called directly', async () => {
  const { seen, readers } = readerHarness();
  for (const provider of ['copilot', 'cursor', 'antigravity', 'kiro', 'kimi', 'opencode']) {
    // Antigravity switches accounts; without the switch it refuses the same way.
    await assert.rejects(readers[provider]({ id: provider + ':second', provider }), error => error.code === 'not-isolated');
    assert.equal(seen[provider], undefined);
  }
  await assert.rejects(readers.kiro({ id: 'kiro:default', provider: 'cursor' }), error => error.code === 'unavailable');
});
