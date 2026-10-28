'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaults, validateRouting, estimateEffort, suggestAssignment } = require('../electron/task-routing.cjs');

test('estimates effort from scope signals', () => {
  assert.equal(estimateEffort({ title: 'Fix typo', criteria: 'Correct the label.' }).size, 'small');
  assert.equal(estimateEffort({ criteria: '- One\n- Two\n- Three\n- Four' }).size, 'medium');
  assert.equal(estimateEffort({ title: 'Migrate storage', criteria: '- One\n- Two\n- Three\n- Four' }).size, 'large');
});

test('routing uses fresh account headroom and respects exclusions', () => {
  const now = 2_000_000, candidates = [{ id: 'codex:default', provider: 'codex', label: 'Codex' }, { id: 'opencode:default', provider: 'opencode', label: 'OpenCode' }, { id: 'claude:default', provider: 'claude', label: 'Claude' }];
  const reading = (accountId, usedPercent, observedAt = now) => ({ accountId, observedAt, windows: [{ label: '5-hour', minutes: 300, usedPercent }] });
  const suggest = limits => suggestAssignment({ size: 'small', candidates, limits, rules: defaults, now });
  assert.equal(suggest([]).implementer.accountId, 'codex:default');
  assert.equal(suggest([reading('codex:default', 90)]).implementer.accountId, 'opencode:default');
  assert.equal(suggest([reading('codex:default', 30), reading('opencode:default', 25)]).implementer.accountId, 'codex:default');
  assert.equal(suggest([reading('codex:default', 50), reading('opencode:default', 20)]).implementer.accountId, 'opencode:default');
  assert.equal(suggest([reading('codex:default', 1, 0), reading('opencode:default', 50)]).implementer.accountId, 'opencode:default');
  assert.notEqual(suggest([]).reviewer.accountId, suggest([]).implementer.accountId);
  const rules = { ...defaults, small: [{ accountId: 'claude:default', model: 'model' }, ...defaults.small], excludedModels: [defaults.small[0].model] };
  assert.equal(suggestAssignment({ size: 'small', candidates, rules, now }).implementer.accountId, 'opencode:default');
});

test('validates routing settings', () => {
  assert.deepEqual(validateRouting(defaults), defaults);
  assert.throws(() => validateRouting({ ...defaults, small: [{ accountId: 'opencode:default', model: 'paid-model' }] }));
  assert.throws(() => validateRouting({ ...defaults, claudeReviewsOnly: 'true' }));
});

test('compares every candidate to the best headroom before applying the ten-point preference', () => {
  const candidates = ['one', 'two', 'three'].map(id => ({ id: `codex:${id}`, provider: 'codex', label: id }));
  const rules = { ...defaults, small: candidates.map(c => ({ accountId: c.id, model: 'test' })) };
  const limits = [50, 41, 32].map((usedPercent, i) => ({ accountId: candidates[i].id, observedAt: 100, windows: [{ key: '5h', minutes: 300, usedPercent }] }));
  assert.equal(suggestAssignment({ size: 'small', candidates, limits, rules, now: 100 }).implementer.accountId, 'codex:two');
});

test('a stale or unknown shortest window cannot be replaced by a longer one', () => {
  const candidates = [{ id: 'codex:default', provider: 'codex', label: 'Codex' }, { id: 'kiro:default', provider: 'kiro', label: 'Kiro' }];
  const rules = { ...defaults, small: candidates.map(c => ({ accountId: c.id, model: 'test' })) }, now = 2_000_000;
  const limits = [{ accountId: candidates[0].id, observedAt: now - 1_800_001, windows: [{ key: '5h', minutes: 300, usedPercent: 0 }] },
    { accountId: candidates[0].id, observedAt: now, windows: [{ key: 'week', minutes: 10080, usedPercent: 0 }] },
    { accountId: candidates[1].id, observedAt: now, windows: [{ key: '5h', minutes: 300, usedPercent: 80 }] }];
  assert.equal(suggestAssignment({ size: 'small', candidates, limits, rules, now }).implementer.accountId, candidates[1].id);
  limits[0].observedAt = now; limits[0].windows[0].usedPercent = null;
  assert.equal(suggestAssignment({ size: 'small', candidates, limits, rules, now }).implementer.accountId, candidates[1].id);
});

test('OpenCode is a default and fallback reviewer with an allowed model', () => {
  const candidates = [{ id: 'codex:default', provider: 'codex', label: 'Codex' }, { id: 'opencode:default', provider: 'opencode', label: 'OpenCode' }, { id: 'claude:default', provider: 'claude', label: 'Claude' }];
  const suggestion = rules => suggestAssignment({ size: 'small', candidates, rules, now: 100 });
  assert.deepEqual(suggestion(defaults).reviewer, { accountId: 'opencode:default', model: 'opencode-go/gpt-6-luna' });
  const fallback = suggestion({ ...defaults, defaultReviewer: null, excludedModels: [...defaults.excludedModels, 'opencode-go/gpt-6-luna'] }).reviewer;
  assert.deepEqual(fallback, { accountId: 'opencode:default', model: 'opencode-go/kimi-k3.1-pro' });
  assert.equal(suggestAssignment({ size: 'small', candidates: candidates.map(c => c.provider === 'opencode' ? { ...c, signedIn: false } : c), rules: defaults, now: 100 }).reviewer.accountId, 'claude:default');
});
