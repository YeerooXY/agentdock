'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { workerLaunch, workerInput, workerState, workerEvent, workerReply, workerProgress } = require('../electron/provider-workers.cjs');
const { suggestAssignment, defaults, validateRouting, migrateRouting } = require('../electron/task-routing.cjs');
const { accountFunding } = require('../electron/account-funding.cjs');
const { TaskLoop } = require('../electron/task-loop.cjs');
const { parallelAssignmentCounts } = require('../electron/task-plan.cjs');
test('native worker roles restrict tools, keep prompts out of arguments and preserve account defaults', () => {
  for (const provider of ['grok', 'copilot', 'antigravity']) for (const review of [true, false]) {
    const launch = workerLaunch(provider, '/bin/cli.exe', { review, workFolder: '/repo', promptFile: '/private/prompt.txt' });
    assert.ok(!launch.args.some(x => /bypassPermissions|always-approve|allow-all-paths|dangerously-skip/.test(x)));
    assert.ok(!launch.args.includes('--model'));
    if (provider === 'grok') { assert.ok(launch.args.includes('MCPTool')); assert.ok(launch.args.includes('Agent')); assert.equal(launch.args.includes('write_file') || launch.args.some(x => x.includes(',write_file')), !review); }
    if (provider === 'copilot') { assert.ok(launch.args.includes('shell')); assert.equal(launch.args.some(x => x.includes('apply_patch')), !review); }
    if (provider === 'antigravity') { const s = JSON.parse(launch.args[launch.args.indexOf('--settings') + 1]); assert.equal(s.useG1Credits, false); assert.equal(s.allowNonWorkspaceAccess, false); assert.equal(s.permissions.deny.includes('write_file(*)'), review); }
  }
  const brief = 'line 1\n"line 2"';
  assert.equal(JSON.parse(workerInput('antigravity', brief)).message.content, brief);
  assert.equal(workerInput('copilot', brief), brief); assert.equal(workerInput('grok', brief), '');
});
test('Grok terminal totals include both input caches once and incomplete spend stays unknown', () => {
  const state = workerState();
  workerEvent('grok', state, { type: 'usage', usage: { input_tokens: 500 } });
  workerEvent('grok', state, { type: 'text', data: 'VERDICT: approve\nFINDINGS:\n- none' });
  const end = { type: 'end', stopReason: 'end_turn', num_turns: 2, usage: { input_tokens: 10, cache_read_input_tokens: 70, cache_creation_input_tokens: 20, output_tokens: 5 } };
  workerEvent('grok', state, end); assert.equal(state.usage.inputTokens, 100); assert.equal(state.usage.cachedInputTokens, 70); assert.equal(state.usage.reportedCost, null);
  workerEvent('grok', state, { ...end, usage_is_incomplete: true }); assert.equal(state.usage.inputTokens, null);
  workerEvent('grok', state, { type: 'error' }); assert.equal(state.error, true);
  assert.throws(() => workerReply('grok', JSON.stringify({ type: 'text', data: 'VERDICT: approve' })), /successful/);
});
test('Copilot receipt duplicates and final accounting snapshots never double-count usage', () => {
  const state = workerState(), usage = { inputTokens: 100, outputTokens: 5, cacheReadTokens: 80, apiCallId: 'call1' };
  workerEvent('copilot', state, { type: 'assistant.usage', data: usage });
  workerEvent('copilot', state, { type: 'session.usage_record', data: { usage } });
  assert.equal(state.usage.inputTokens, 100);
  workerEvent('copilot', state, { type: 'session.usage_checkpoint', data: { accountingSnapshot: { modelMetrics: { a: { usage }, b: { usage: { inputTokens: 40, outputTokens: 2, cacheReadTokens: 0 } } } } } });
  workerEvent('copilot', state, { type: 'result', exitCode: 0 });
  assert.equal(state.complete, true); assert.equal(state.error, false); assert.equal(state.usage.inputTokens, 140); assert.equal(state.usage.outputTokens, 7);
  workerEvent('copilot', state, { type: 'session.error' }); workerEvent('copilot', state, { type: 'result', exitCode: 0 }); assert.equal(state.error, true);
});
test('progress excludes raw tools, secrets, private reasoning and usage payloads', () => {
  assert.deepEqual(workerProgress('grok', { type: 'thought', data: 'private' }), []);
  assert.deepEqual(workerProgress('copilot', { type: 'tool.execution_start', data: { arguments: 'secret' } }), ['Using project tool']);
  assert.deepEqual(workerProgress('antigravity', { event: 'step_update', step_update: { state: 'ACTIVE', text_delta: 'private' } }), ['Working']);
});
test('any connected native provider is discoverable without a Codex account', () => {
  for (const provider of ['antigravity', 'copilot', 'grok']) {
    const c = { id: `${provider}:default`, provider, label: provider, signedIn: true };
    assert.equal(suggestAssignment({ size: 'small', candidates: [c] }).implementer.accountId, c.id);
    assert.equal(suggestAssignment({ size: 'small', candidates: [{ ...c, signedIn: false }] }).implementer, null);
    assert.equal(suggestAssignment({ size: 'small', candidates: [c], rules: { ...defaults, discoverAccounts: false } }).implementer, null);
  }
});
test('local precedes free, free precedes included, and exhausted or metered accounts are excluded', () => {
  const local = { id: 'opencode:strata', provider: 'opencode', model: 'strata/local', label: 'Local', local: true, readiness: 'ready', available: true };
  const free = { id: 'copilot:default', provider: 'copilot', label: 'Free' }, included = { id: 'codex:default', provider: 'codex', label: 'Included' };
  const rules = { ...defaults, accountFunding: { [free.id]: 'free', [included.id]: 'included' } };
  const limits = [{ accountId: free.id, observedAt: 100, windows: [{ usedPercent: 50 }] }, { accountId: included.id, observedAt: 100, windows: [{ usedPercent: 0 }] }];
  const route = candidates => suggestAssignment({ size: 'small', candidates, rules, limits, now: 100 });
  assert.equal(route([local, free, included]).implementer.accountId, local.id);
  assert.equal(route([free, included]).implementer.accountId, free.id);
  assert.equal(route([local, free, included]).reviewer.accountId, free.id);
  limits[0].windows[0].usedPercent = 100; assert.equal(route([free, included]).implementer.accountId, included.id);
  rules.accountFunding[included.id] = 'metered'; assert.equal(route([free, included]).implementer, null);
});
test('funding is explicit or reported, survives migration, and never inferred from provider presence', () => {
  assert.equal(accountFunding({ id: 'grok:default' }), 'unknown');
  assert.equal(accountFunding({}, { plan: 'copilot_free' }), 'free');
  assert.equal(accountFunding({}, { windows: [{ label: 'Free plan credits' }] }), 'free');
  assert.equal(accountFunding({}, { plan: 'copilot_pro', windows: [{ label: 'Free plan credits' }] }), 'included');
  assert.equal(accountFunding({ id: 'grok:default' }, { plan: 'free' }, { accountFunding: { 'grok:default': 'unknown' } }), 'unknown');
  const config = validateRouting({ ...defaults, accountFunding: { 'grok:default': 'unknown', 'copilot:default': 'free' } });
  assert.deepEqual(migrateRouting(config).accountFunding, config.accountFunding);
  assert.throws(() => validateRouting({ ...defaults, accountFunding: { 'grok:default': 'unlimited' } }), /funding/);
});

test('public candidates and the legacy review suggestion respect funding and sign-in', () => {
  const candidates = [
    { id: 'opencode:strata', provider: 'opencode', local: true, model: 'strata/local', readiness: 'ready', available: true },
    { id: 'grok:default', provider: 'grok', funding: 'free', signedIn: false },
    { id: 'copilot:default', provider: 'copilot', signedIn: true },
    { id: 'codex:default', provider: 'codex', signedIn: true }
  ];
  const routing = { ...defaults, accountFunding: { 'copilot:default': 'free', 'codex:default': 'metered' } };
  const choices = TaskLoop.prototype.choices.call({ candidates: () => candidates, getLimits: () => [], getSettings: () => ({ routing }), now: () => 100, repositories: () => [] });
  assert.equal(choices.suggestion, 'copilot:default');
  assert.equal(choices.assignment.implementer.accountId, 'opencode:strata');
  assert.equal(choices.implementers.find(c => c.id === 'grok:default').funding, 'free');
  assert.equal(choices.implementers.find(c => c.id === 'codex:default').funding, 'metered');
});

test('split work starts locally, shares independent work with free accounts and reuses local for dependencies', () => {
  const candidates = [
    { id: 'opencode:strata', provider: 'opencode', local: true, model: 'strata/local', readiness: 'ready', available: true },
    { id: 'copilot:default', provider: 'copilot', funding: 'free' },
    { id: 'kiro:default', provider: 'kiro', funding: 'free' },
    { id: 'codex:default', provider: 'codex', funding: 'included' }
  ];
  const plan = [
    { id: 'base', dependsOn: [] }, { id: 'sibling', dependsOn: [] },
    { id: 'third', dependsOn: [] }, { id: 'dependent', dependsOn: ['base','sibling','third'] },
    { id: 'fourth', dependsOn: [] }
  ], assigned = [];
  for (const sub of plan) {
    const assignmentCounts = parallelAssignmentCounts(plan, assigned, sub.id);
    const { implementer } = suggestAssignment({ size: 'small', candidates, assignmentCounts });
    assigned.push({ subtaskId: sub.id, implementer });
  }
  assert.deepEqual(assigned.map(s => s.implementer.accountId), ['opencode:strata','copilot:default','kiro:default','opencode:strata','copilot:default']);
  assert.equal(suggestAssignment({ size: 'small', candidates: [candidates[0],candidates[3]], assignmentCounts: { 'opencode:strata': 5 } }).implementer.accountId, 'opencode:strata');
  const graph = [{ id: 'root', dependsOn: [] }, { id: 'a', dependsOn: ['root'] }, { id: 'b', dependsOn: ['root'] }, { id: 'leaf', dependsOn: ['a'] }];
  const records = graph.map(s => ({ subtaskId: s.id, implementer: { accountId: '__proto__' } }));
  assert.equal(parallelAssignmentCounts(graph, records, 'a').__proto__, 1, 'Sibling b stays independent; ancestors and descendants do not count.');
});
