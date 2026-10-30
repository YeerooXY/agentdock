'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workerRegistry, registryFromRouting, groupHeadroom, routeWorker, refreshAndRoute, STRATA_URL } = require('../electron/worker-registry.cjs');
const { migrateRouting, defaults } = require('../electron/task-routing.cjs');
const now = 2_000_000;
const worker = (id, overrides = {}) => ({ id, accountId: `codex:${id}`, launcher: 'codex', model: 'gpt-6.1-terra', level: 'L2', quotaGroupId: id, concurrency: 2, unknownAllowance: 1, roles: { builder: true, reviewer: true }, canEdit: true, ...overrides });
const reading = (accountId, usedPercent, observedAt = now, key = '5h') => ({ accountId, observedAt, windows: [{ key, usedPercent }] });

test('registry preserves actual model family, role policy and local profile', () => {
  const registry = workerRegistry({ workers: [worker('gpt', { launcher: 'opencode', family: 'local-strata' }), worker('local', { model: 'strata', family: 'local-strata', familyConfirmed: true, local: true }), worker('unknown', { model: 'new-model' }), worker('claude', { launcher: 'claude', model: 'claude-sonnet-5' })], claudeRoles: { builder: false, reviewer: true } });
  assert.equal(registry[0].family, 'openai'); assert.equal(registry[1].family, 'local-strata'); assert.equal(registry[1].endpoint, STRATA_URL);
  assert.equal(registry[2].needsSetup, true); assert.deepEqual(registry[3].roles, { builder: false, reviewer: true });
  assert.throws(() => workerRegistry({ workers: [worker('a'), worker('a')] }));
  assert.throws(() => workerRegistry({ workers: [worker('x', { unknownAllowance: 3 })] }));
});

test('registry builds from migrated pools without altering assignments or enabling legacy Claude builds', () => {
  const routing = migrateRouting({ ...defaults, medium: [{ accountId: 'claude:work', model: 'claude-sonnet-5' }, { accountId: 'codex:work', model: 'unknown-model' }] });
  const before = JSON.stringify(routing);
  const candidates = [{ id: 'claude:work', provider: 'claude' }, { id: 'codex:work', provider: 'codex' }];
  const workers = registryFromRouting({ routing, candidates, profiles: { 'claude:work': { quotaGroupId: 'shared', concurrency: 2 } } });
  const claude = workers.find(w => w.accountId === 'claude:work');
  assert.equal(claude.quotaGroupId, 'shared'); assert.equal(claude.roles.builder, false); assert.equal(claude.roles.reviewer, true);
  assert.equal(workers.find(w => w.accountId === 'codex:work').needsSetup, true);
  assert.equal(JSON.stringify(routing), before);
});

test('latest reading per shared account window controls admission and retains stale and unknown values', () => {
  const values = [reading('codex:a', 99, now - 100), reading('opencode:a', 20, now), reading('codex:a', 60, now, 'week'), reading('codex:a', 10, now - 1_800_001, 'day')];
  const usage = groupHeadroom(values, ['codex:a', 'opencode:a'], now);
  assert.equal(usage.left, 1); assert.equal(usage.blocked, true); assert.equal(usage.status, 'stale');
  assert.equal(usage.windows.find(w => w.key === 'day').status, 'stale');
  values.push(reading('codex:a', null, now + 1, 'week'));
  assert.equal(groupHeadroom(values, ['codex:a'], now).left, 1);
  values.push(reading('codex:a', null, now, 'week'));
  assert.equal(groupHeadroom(values, ['codex:a'], now).status, 'unknown');
  values.push(reading('codex:a', 90, now, 'day'));
  assert.equal(groupHeadroom(values, ['codex:a'], now).blocked, true);
});

test('missing group accounts and stale high readings remain visible with conservative admission', () => {
  assert.equal(groupHeadroom([reading('codex:a', 20)], ['codex:a', 'opencode:a'], now).status, 'unknown');
  const stale = groupHeadroom([reading('codex:a', 95, now - 1_800_001)], ['codex:a'], now);
  assert.equal(stale.status, 'stale'); assert.equal(stale.left, null); assert.equal(stale.blocked, false);
  const workers = workerRegistry({ workers: [worker('a')] });
  assert.equal(routeWorker({ workers, level: 'L2', limits: [reading('codex:a', 95, now - 1_800_001)], active: [{ quotaGroupId: 'a' }], now }).reason, 'Waiting for capacity');
});

test('unavailable members do not reduce capacity, but their missing readings remain unknown', () => {
  const workers = workerRegistry({ workers: [worker('a', { quotaGroupId: 'shared' }), worker('b', { quotaGroupId: 'shared', available: false, unknownAllowance: 0 })] });
  const result = routeWorker({ workers, level: 'L2', limits: [reading('codex:a', 10)], now });
  assert.equal(result.worker.id, 'a'); assert.equal(result.usage.status, 'unknown'); assert.equal(result.capacity, 1);
});

test('unrecognized families require explicit model lineage confirmation', () => {
  const unconfirmed = workerRegistry({ workers: [worker('local', { model: 'strata', family: 'local-strata', local: true })] });
  assert.equal(routeWorker({ workers: unconfirmed, level: 'L2', now }).reason, 'Needs family setup');
  const routing = { levels: { L1: [], L2: [{ accountId: 'codex:local', model: 'strata', family: 'local-strata' }], L3: [] }, excludedModels: [], roles: { claude: { builder: true, reviewer: true } } };
  const candidates = [{ id: 'codex:local', provider: 'codex' }];
  assert.equal(registryFromRouting({ routing, candidates })[0].needsSetup, true);
  assert.equal(registryFromRouting({ routing, candidates, profiles: { 'codex:local': { confirmedFamilies: { strata: 'local-strata' } } } })[0].needsSetup, false);
});

test('shared quota counts all active work across launchers, including owner turns', () => {
  const workers = workerRegistry({ workers: [worker('a', { quotaGroupId: 'shared' }), worker('b', { accountId: 'opencode:a', launcher: 'opencode', quotaGroupId: 'shared' }), worker('c')] });
  const limits = [reading('codex:a', 20), reading('codex:c', 22)];
  const active = [{ quotaGroupId: 'shared', owner: true }, { quotaGroupId: 'shared' }];
  assert.equal(routeWorker({ workers, level: 'L2', limits, active, now }).worker.id, 'c');
  assert.equal(routeWorker({ workers: workers.slice(0, 2), level: 'L2', limits, active, now }).reason, 'Waiting for capacity');
});

test('unknown and stale usage use conservative configured allowance and never appear fresh', () => {
  const workers = workerRegistry({ workers: [worker('a'), worker('b', { unknownAllowance: 0 })] });
  const route = (limits, active = []) => routeWorker({ workers, level: 'L2', limits, active, now });
  assert.equal(route([]).usage.status, 'unknown');
  assert.equal(route([], [{ quotaGroupId: 'a' }]).reason, 'Waiting for capacity');
  assert.equal(route([reading('codex:a', 0, now - 1_800_001)]).usage.status, 'stale');
  assert.equal(route([reading('codex:a', 80), reading('codex:b', 90)]).worker.id, 'a');
});

test('headroom uses the tightest fresh window and balances groups within ten points', () => {
  const workers = workerRegistry({ workers: [worker('a'), worker('b'), worker('c')] });
  const limits = [reading('codex:a', 20), reading('codex:a', 70, now, 'week'), reading('codex:b', 40), reading('codex:c', 45)];
  const params = { workers, level: 'L2', limits, now };
  assert.equal(routeWorker(params).worker.id, 'b');
  assert.equal(routeWorker({ ...params, rotation: 1 }).worker.id, 'c');
  assert.equal(routeWorker({ ...params, active: [{ quotaGroupId: 'b' }] }).worker.id, 'c');
});

test('reviews require different actual family and use qualified prices', () => {
  const workers = workerRegistry({ workers: [worker('gpt', { launcher: 'opencode', cost: 1 }), worker('claude', { model: 'claude-haiku-5', cost: 3 }), worker('strata', { model: 'strata', family: 'local-strata', familyConfirmed: true, local: true, cost: 1 }), worker('unidentified', { model: 'unknown', cost: 0 })] });
  assert.equal(routeWorker({ workers, role: 'reviewer', builderFamily: 'openai', now }).worker.id, 'strata');
  assert.equal(routeWorker({ workers, role: 'reviewer', builderFamily: 'local-strata', now }).worker.id, 'gpt');
  assert.equal(routeWorker({ workers: workers.slice(0, 1), role: 'reviewer', builderFamily: 'openai', now }).reason, 'Waiting for reviewer');
  assert.equal(routeWorker({ workers, role: 'reviewer', now }).reason, 'Needs family setup');
  assert.equal(routeWorker({ workers: workers.slice(3), level: 'L2', now }).reason, 'Needs family setup');
});

test('unpriced reviewers are reported, and can be selected when no prices are configured', () => {
  const workers = workerRegistry({ workers: [worker('claude', { model: 'claude-haiku-5', cost: 3 }), worker('strata', { model: 'strata', family: 'local-strata', familyConfirmed: true, local: true })] });
  const priced = routeWorker({ workers, role: 'reviewer', builderFamily: 'openai', now });
  assert.equal(priced.worker.id, 'claude'); assert.deepEqual(priced.unpricedReviewers, ['strata']);
  assert.equal(routeWorker({ workers: workers.slice(1), role: 'reviewer', builderFamily: 'openai', now }).worker.id, 'strata');
});

test('local invocation limit applies across endpoints and refresh happens before routing', async () => {
  const workers = workerRegistry({ workers: [worker('a', { local: true, family: 'local-strata', familyConfirmed: true, model: 'strata' }), worker('b', { local: true, family: 'local-strata', familyConfirmed: true, model: 'strata' })] });
  assert.equal(routeWorker({ workers, level: 'L2', active: [{ workerId: 'a', quotaGroupId: 'a' }], now }).reason, 'Waiting for capacity');
  let calls = 0;
  const remote = workerRegistry({ workers: [worker('a'), worker('b')] });
  const result = await refreshAndRoute({ workers: remote, level: 'L2', now }, async () => { calls++; return [reading('codex:a', 90), reading('codex:b', 10)]; });
  assert.equal(calls, 1); assert.equal(result.worker.id, 'b');
  const fallback = await refreshAndRoute({ workers: remote, level: 'L2', now }, async () => { throw new Error('offline'); });
  assert.equal(fallback.usage.status, 'unknown');
  const retained = await refreshAndRoute({ workers: remote, level: 'L2', now, limits: [reading('codex:a', 90)] }, async () => { throw new Error('offline'); });
  assert.equal(retained.worker.id, 'b');
});
