'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaults, ROUTING_SCHEMA_VERSION, migrateRouting, validateRouting, estimateEffort, suggestAssignment } = require('../electron/task-routing.cjs');

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
  assert.equal(suggest([reading('codex:default', 90)]).implementer.accountId, 'codex:default');
  assert.equal(suggest([reading('codex:default', 99.9)]).implementer.accountId, 'codex:default');
  assert.equal(suggest([reading('codex:default', 100)]).implementer.accountId, 'opencode:default');
  assert.equal(suggest([reading('codex:default', 30), reading('opencode:default', 25)]).implementer.accountId, 'opencode:default');
  assert.equal(suggest([reading('codex:default', 50), reading('opencode:default', 20)]).implementer.accountId, 'opencode:default');
  assert.equal(suggest([reading('codex:default', 1, 0), reading('opencode:default', 50)]).implementer.accountId, 'opencode:default');
  assert.notEqual(suggest([]).reviewer.accountId, suggest([]).implementer.accountId);
  const rules = { ...defaults, claudeReviewsOnly: true, small: [{ accountId: 'claude:default', model: 'model' }, ...defaults.small], excludedModels: [defaults.small[0].model] };
  assert.equal(suggestAssignment({ size: 'small', candidates, rules, now }).implementer.accountId, 'opencode:default');
});

test('validates routing settings', () => {
  const validated = validateRouting(defaults);
  assert.deepEqual(validated.small, defaults.small); assert.deepEqual(validated.medium, defaults.medium); assert.deepEqual(validated.large, defaults.large);
  assert.equal(validated.schemaVersion, ROUTING_SCHEMA_VERSION); assert.deepEqual(validated.levels.L1.map(item => item.family), ['openai', 'openai']);
  assert.throws(() => validateRouting({ ...defaults, small: [{ accountId: 'opencode:default', model: 'paid-model' }] }));
  assert.throws(() => validateRouting({ ...defaults, claudeReviewsOnly: 'true' }));
});

test('named Codex UUID routes survive validation and migration with Luna', () => {
  const accountId = 'cb75b00b-2caf-4295-8256-0d28514a1531';
  const configured = { ...defaults, small: [{ accountId, model: 'gpt-6-luna' }] };
  assert.deepEqual(migrateRouting(configured).small, configured.small);
  assert.deepEqual(validateRouting(configured).small, configured.small);
  assert.throws(() => validateRouting({ ...configured, small: [{ accountId: '../account', model: 'gpt-6-luna' }] }));
});

test('discovery picks entitled Luna for named profiles and the strongest free reviewer tier', () => {
  const accountId = 'cb75b00b-2caf-4295-8256-0d28514a1531', now = 100;
  const local = { id: 'opencode:strata', provider: 'opencode', label: 'Local', local: true, available: true, readiness: 'ready', model: 'strata/local' };
  const models = ['gpt-6-luna', 'gpt-5.6-terra'].map(id => ({ id, available: true, funding: 'free', observedAt: now }));
  const candidate = { id: accountId, provider: 'codex', label: 'Free Codex', funding: 'free', models };
  const result = suggestAssignment({ size: 'small', candidates: [candidate, local], now });
  assert.equal(result.implementer.accountId, local.id);
  assert.deepEqual(result.reviewer, { accountId, model: 'gpt-5.6-terra' });
  assert.deepEqual(suggestAssignment({ size: 'small', candidates: [candidate], now }).implementer, { accountId, model: 'gpt-6-luna' });
  const escalationOnly = { ...candidate, models: [{ id: 'gpt-6-astra', available: true, funding: 'free', observedAt: now }] };
  assert.equal(suggestAssignment({ size: 'small', candidates: [local, escalationOnly], now }).reviewer, null);
});

test('routing migration preserves choices and reviewer policy, records unknown model families, and is idempotent', () => {
  const old = {
    small: [{ accountId: 'codex:default', model: 'gpt-6.1-terra' }, { accountId: 'kiro:work', model: 'terras-new-model' }],
    medium: [{ accountId: 'claude:default', model: 'claude-sonnet-5' }], large: [],
    defaultReviewer: { accountId: 'opencode:default', model: 'opencode-go/gpt-6-luna' },
    claudeReviewsOnly: true, excludedModels: ['opencode-go/qwen3.8-max']
  };
  const migrated = migrateRouting(old);
  assert.equal(migrated.schemaVersion, ROUTING_SCHEMA_VERSION);
  assert.deepEqual(migrated.small, old.small); assert.deepEqual(migrated.levels.L1.map(item => item.accountId), ['codex:default', 'kiro:work']);
  assert.equal(migrated.levels.L1[0].family, 'openai'); assert.equal(migrated.levels.L1[1].needsSetup, true);
  assert.deepEqual(migrated.levels.L2[0], { accountId: 'claude:default', model: 'claude-sonnet-5', family: 'anthropic' });
  assert.deepEqual(migrated.defaultReviewer, old.defaultReviewer); assert.deepEqual(migrated.excludedModels, old.excludedModels);
  assert.equal(migrated.claudeReviewsOnly, true); assert.deepEqual(migrated.roles.claude, { builder: false, reviewer: true });
  assert.deepEqual(migrateRouting(migrated), migrated);
  const optedIn = migrateRouting({ ...old, claudeReviewsOnly: false });
  assert.equal(optedIn.claudeReviewsOnly, false); assert.deepEqual(optedIn.roles.claude, { builder: true, reviewer: true });
});

test('legacy Claude roles require an explicit ladder opt-in and survive later migrations', () => {
  const legacy = { ...defaults, claudeReviewsOnly: true, roles: { claude: { builder: true, reviewer: true } } };
  assert.deepEqual(migrateRouting(legacy).roles.claude, { builder: false, reviewer: true });
  assert.deepEqual(validateRouting(defaults).roles.claude, { builder: true, reviewer: true });
  const optedIn = { ...migrateRouting(legacy), roles: { claude: { builder: true, reviewer: true } } };
  assert.deepEqual(migrateRouting(optedIn), optedIn);
});

test('local routing is explicit, pins the local model and never assigns it a cloud fallback', () => {
  const local = { id: 'opencode:strata', provider: 'opencode', label: 'Strata', local: true };
  const codex = { id: 'codex:default', provider: 'codex', label: 'Codex' };
  const assignment = { accountId: local.id, model: 'strata/local' };
  const rules = validateRouting({ ...defaults, small: [assignment] });
  assert.deepEqual(suggestAssignment({ size: 'small', candidates: [local], rules }).implementer, assignment);
  const ordinary = suggestAssignment({ size: 'small', candidates: [codex, local], rules: defaults });
  assert.equal(ordinary.implementer.accountId, codex.id); assert.equal(ordinary.reviewer, null);
  assert.deepEqual(suggestAssignment({ size: 'small', candidates: [codex, local], rules: { ...defaults, defaultReviewer: assignment } }).reviewer, assignment);
  assert.throws(() => validateRouting({ ...defaults, small: [{ accountId: local.id, model: 'opencode-go/test' }] }));
  assert.throws(() => validateRouting({ ...defaults, small: [{ accountId: 'opencode:default', model: 'strata/local' }] }));
});

test('automatic bounded tasks prefer ready local implementation over measured cloud headroom', () => {
  const local = { id: 'opencode:strata', provider: 'opencode', label: 'Strata', model: 'strata/local', local: true, available: true, readiness: 'ready' };
  const cloud = { id: 'codex:default', provider: 'codex', label: 'Codex' };
  const limits = [{ accountId: cloud.id, observedAt: Date.now(), windows: [{ label: 'Weekly', usedPercent: 0, minutes: 10080 }] }];
  for (const size of ['small','medium']) assert.equal(suggestAssignment({size,candidates:[cloud,local],limits,rules:defaults}).implementer.accountId,local.id);
  assert.equal(suggestAssignment({size:'large',candidates:[cloud,local],limits,rules:defaults}).implementer.accountId,cloud.id);
  for (const change of [{available:false},{readiness:'unchecked'},{readiness:'offline'}]) assert.equal(suggestAssignment({size:'small',candidates:[cloud,{...local,...change}],limits,rules:defaults}).implementer.accountId,cloud.id);
  assert.equal(suggestAssignment({size:'small',candidates:[cloud,local],limits,rules:{...defaults,discoverAccounts:false}}).implementer.accountId,cloud.id);
});

test('compares every candidate to the best headroom before applying the ten-point preference', () => {
  const candidates = ['one', 'two', 'three'].map(id => ({ id: `codex:${id}`, provider: 'codex', label: id }));
  const rules = { ...defaults, small: candidates.map(c => ({ accountId: c.id, model: 'test' })) };
  const limits = [50, 41, 32].map((usedPercent, i) => ({ accountId: candidates[i].id, observedAt: 100, windows: [{ key: '5h', minutes: 300, usedPercent }] }));
  assert.equal(suggestAssignment({ size: 'small', candidates, limits, rules, now: 100 }).implementer.accountId, 'codex:three');
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

test('split suggestions spread measured accounts within ten points and preserve unknown usage', () => {
  const candidates = ['one', 'two', 'unknown'].map(id => ({ id: `codex:${id}`, provider: 'codex', label: id }));
  const rules = { ...defaults, small: candidates.map(c => ({ accountId: c.id, model: 'test' })) }, now = 2_000_000;
  const limits = [40, 35].map((usedPercent, i) => ({ accountId: candidates[i].id, observedAt: now, windows: [{ minutes: 300, usedPercent }] }));
  const assignmentCounts = {}, ids = [];
  for (let i = 0; i < 4; i++) {
    const result = suggestAssignment({ size: 'small', candidates, rules, limits, now, assignmentCounts });
    const id = result.implementer.accountId; ids.push(id); assignmentCounts[id] = (assignmentCounts[id] || 0) + 1;
  }
  assert.deepEqual(ids, ['codex:two', 'codex:one', 'codex:two', 'codex:one']);
  limits[0].windows[0].usedPercent = 70;
  assert.equal(suggestAssignment({ size: 'small', candidates, rules, limits, now, assignmentCounts }).implementer.accountId, 'codex:two');
});

test('split plan reviewers prefer a different vendor to the planner', () => {
  const candidates = [{ id: 'codex:one', provider: 'codex', label: 'One' }, { id: 'codex:two', provider: 'codex', label: 'Two' }, { id: 'kiro:default', provider: 'kiro', label: 'Kiro' }];
  const rules = { ...defaults, large: [{ accountId: 'codex:one', model: 'planner' }], defaultReviewer: { accountId: 'codex:two', model: 'reviewer' } };
  const result = suggestAssignment({ size: 'large', candidates, rules, preferDifferentVendor: true });
  assert.equal(result.implementer.model, 'planner'); assert.equal(result.reviewer.accountId, 'kiro:default');
  assert.equal(suggestAssignment({ size: 'large', candidates: candidates.slice(0, 2), rules: { ...rules, defaultReviewer: null }, preferDifferentVendor: true }).reviewer.accountId, 'codex:two');
});

test('default discovery works with Claude alone and never invents an independent reviewer', () => {
  const result = suggestAssignment({ size: 'medium', candidates: [{ id: 'claude:default', provider: 'claude', label: 'Claude' }] });
  assert.deepEqual(result.implementer, { accountId: 'claude:default', model: '' }); assert.equal(result.reviewer, null);
  assert.match(result.reasons[0], /account default model/);
});

test('Kiro and OpenCode can distribute work without a Codex account', () => {
  const candidates = [{ id: 'kiro:default', provider: 'kiro', label: 'Kiro' }, { id: 'opencode:default', provider: 'opencode', label: 'OpenCode' }];
  const limits = candidates.map(c => ({ accountId: c.id, observedAt: 100, windows: [{ usedPercent: 10 }] }));
  const counts = {}, ids = [];
  for (let i = 0; i < 4; i++) { const r = suggestAssignment({ size: 'small', candidates, limits, now: 100, assignmentCounts: counts }); ids.push(r.implementer.accountId); counts[r.implementer.accountId] = (counts[r.implementer.accountId] || 0) + 1; }
  assert.equal(new Set(ids).size, 2);
});

test('the limiting window, role restrictions and explicit pools govern discovery', () => {
  const candidates = [{ id: 'kiro:default', provider: 'kiro', label: 'Kiro' }, { id: 'opencode:default', provider: 'opencode', label: 'OpenCode' }, { id: 'claude:default', provider: 'claude', label: 'Claude' }];
  const limits = [{ accountId: 'opencode:default', observedAt: 100, windows: [{ key: '5h', minutes: 300, usedPercent: 0 }, { key: 'weekly', minutes: 10080, usedPercent: 80 }] }, { accountId: 'kiro:default', observedAt: 100, windows: [{ usedPercent: 20 }] }];
  assert.equal(suggestAssignment({ size: 'small', candidates, limits, now: 100 }).implementer.accountId, 'kiro:default');
  assert.equal(suggestAssignment({ size: 'small', candidates: candidates.slice(2), rules: { ...defaults, claudeReviewsOnly: true } }).implementer, null);
  assert.equal(suggestAssignment({ size: 'small', candidates: candidates.slice(0, 1), rules: { ...defaults, discoverAccounts: false } }).implementer, null);
});

test('failed quota refresh stays unknown rather than reusing a fresh-looking cached limit', () => {
  const { accountAllowance } = require('../electron/task-routing.cjs');
  const value = accountAllowance('opencode:default', [{ accountId: 'opencode:default', observedAt: 100, usageCheck: { status: 'sign-in' }, windows: [{ usedPercent: 0 }] }], 110);
  assert.equal(value.status, 'unknown'); assert.equal(value.remainingPercent, null);
});

test('same-time quota snapshots retain the more restrictive reading in either order', () => {
  const { accountAllowance } = require('../electron/task-routing.cjs');
  const low = { accountId: 'opencode:default', observedAt: 100, windows: [{ key: 'weekly', usedPercent: 0 }] };
  const high = { ...low, windows: [{ key: 'weekly', usedPercent: 100 }] };
  for (const readings of [[low, high], [high, low]]) {
    const value = accountAllowance('opencode:default', readings, 110);
    assert.equal(value.blocked, true); assert.equal(value.remainingPercent, 0);
  }
  const unknown = { ...low, windows: [{ key: 'weekly', usedPercent: null }] };
  assert.equal(accountAllowance('opencode:default', [low, unknown], 110).status, 'unknown');
});


test('automatic review uses Sonnet-class before a larger model across accounts', () => {
  const now = 100;
  const model = id => ({ id, available: true, observedAt: now });
  const candidates = [
    { id: 'codex:default', provider: 'codex', label: 'Builder', models: [model('gpt-6-luna')] },
    { id: 'claude:sonnet', provider: 'claude', label: 'Sonnet', models: [model('claude-sonnet-5')] },
    { id: 'claude:opus', provider: 'claude', label: 'Opus', models: [model('claude-opus-5')] }
  ];
  const result = suggestAssignment({ size: 'medium', candidates, rules: { ...defaults, defaultReviewer: null }, now });
  assert.equal(result.implementer.model, 'gpt-6-luna');
  assert.equal(result.reviewer.model, 'claude-sonnet-5');
});


test('a newer empty or failed allowance check invalidates earlier current data', () => {
  const { accountAllowance } = require('../electron/task-routing.cjs');
  const earlier = { accountId: 'claude:a', observedAt: 100, windows: [{ key: 'weekly', usedPercent: 90 }] };
  for (const newer of [{ windows: [] }, { windows: [{ key: 'weekly', usedPercent: 0 }], usageCheck: { status: 'sign-in' } }]) {
    const value = accountAllowance('claude:a', [earlier, { ...newer, accountId: 'claude:a', observedAt: 110 }], 120);
    assert.equal(value.status, 'unknown'); assert.equal(value.remainingPercent, null);
  }
  assert.equal(accountAllowance('claude:a', [earlier, { accountId: 'claude:a', observedAt: 110, windows: [] }, { ...earlier, observedAt: 120 }], 130).status, 'current');
});

test('a below-floor reviewer carries its capability warning instead of claiming sufficiency', () => {
  const row = id => ({ id, available: true, observedAt: 100 });
  const result = suggestAssignment({ size: 'small', now: 100, rules: { ...defaults, defaultReviewer: null }, candidates: [
    { id: 'codex:default', provider: 'codex', label: 'Builder', models: [row('gpt-6-luna')] },
    { id: 'claude:default', provider: 'claude', label: 'Reviewer', models: [row('claude-haiku-5')] }
  ] });
  assert.equal(result.reviewer.model, 'claude-haiku-5');
  assert.ok(result.warnings.some(w => /strongest discovered tier/.test(w)));
  assert.ok(result.reasons.some(r => /below the preferred review tier/.test(r)));
});
