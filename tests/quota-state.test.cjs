'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../src/quota-state.js');
test('a spent weekly or rolling limit makes Claude and Codex unavailable', async () => {
  const { quotaState } = await load();
  for (const provider of ['claude', 'codex']) for (const used of [[0, 100], [100, 15]]) {
    const windows = used.map((usedPercent, i) => ({ minutes: i ? 10080 : 300, usedPercent }));
    const result = quotaState(provider, windows);
    assert.equal(result.exhausted, true); assert.equal(result.primary.usedPercent, 100);
    windows.forEach(w => w.usedPercent = 20);
    assert.equal(quotaState(provider, windows).exhausted, false);
  }
});
test('model quotas do not disable other model pools and unknown readings stay unknown', async () => {
  const { quotaState } = await load();
  const shared = { key: 'seven_day', usedPercent: 50 };
  assert.deepEqual(quotaState('claude', [shared, { key: 'seven_day_sonnet', usedPercent: 100 }]), { primary: shared, exhausted: false });
  const pools = [{ modelGroup: 'gemini', usedPercent: 100 }, { modelGroup: 'claude-gpt', usedPercent: 20 }];
  assert.equal(quotaState('antigravity', pools).exhausted, false);
  pools[1].usedPercent = 100; assert.equal(quotaState('antigravity', pools).exhausted, true);
  pools[1].usedPercent = null; assert.equal(quotaState('antigravity', pools).exhausted, false);
  assert.equal(quotaState('codex', []).exhausted, false);
  assert.equal(quotaState('codex', [{ usedPercent: 101 }]).exhausted, false);
  assert.equal(quotaState('kiro', [{ unlimited: true, usedPercent: 100 }]).exhausted, false);
});

test('Copilot Chat remains available when its separate premium pool is empty, including cached readings', async () => {
  const { quotaState } = await load();
  for (const grouped of [true, false]) {
    const windows = [{ key: 'premium_interactions', usedPercent: 100 }, { key: 'chat', usedPercent: 2.5 }, { key: 'completions', usedPercent: 0 }];
    if (grouped) windows.forEach(w => w.modelGroup = 'copilot:' + w.key);
    const result = quotaState('copilot', windows);
    assert.equal(result.primary.key, 'chat'); assert.equal(result.primary.usedPercent, 2.5); assert.equal(result.exhausted, false);
    windows.forEach(w => w.usedPercent = 100); assert.equal(quotaState('copilot', windows).exhausted, true);
  }
});
