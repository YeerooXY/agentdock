'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Workbench } = require('../electron/workbench.cjs');
const { TaskLoop } = require('../electron/task-loop.cjs');
const { names } = require('../electron/provider-workers.cjs');
const origins = ['codex','claude','antigravity','copilot','opencode','cursor','grok','kiro','qwen','kimi','cline','droid','pi','gemini'];
test('every console origin receives the same inventory and can address every supported target', async () => {
  const targets = [...Object.keys(names), 'opencode'];
  const accounts = origins.map(provider => ({ id: `${provider}:default`, provider, label: provider, quotaReader: 'unsupported' }));
  const loop = Object.assign(Object.create(TaskLoop.prototype), { candidates: () => accounts.filter(a => targets.includes(a.provider)), getAccounts: () => accounts,
    getLimits: () => [], getSettings: () => ({}), now: () => 100, repositories: () => [] });
  const starts = [], sessions = new Map(origins.map(provider => [provider, { id: provider, provider, alive: true, cwd: '/project' }]));
  const bridge = Object.assign(Object.create(Workbench.prototype), { getSessions: () => ({ items: sessions }), getProject: () => '/project',
    completion: { isStudyConversation: () => false, invalidate: () => {} },
    turns: { isStudyConversation: () => false, begin: async () => {}, context: () => null, active: new Map() },
    getTasks: () => ({ choices: () => loop.choices(), start: args => { starts.push(args); return { id: 'mock' }; } }) });
  for (const origin of origins) {
    const result = await bridge.invoke('dock/task_candidates', {}, origin);
    assert.equal(result.accounts.length, 14); assert.equal(result.suggestionRole, 'reviewer');
    assert.equal(result.accounts.find(a => a.provider === 'cursor').workerSupported, true);
    assert.equal(result.accounts.find(a => a.provider === 'qwen').workerSupported, false);
    assert.equal(result.accounts.find(a => a.provider === 'cursor').allowance.status, 'unknown');
    for (const target of targets) await bridge.invoke('dock/start_task', { title: 'Check routing', criteria: 'Bounded assignment', implementer: { accountId: `${target}:default` }, reviewer: null }, origin);
  }
  assert.equal(starts.length, origins.length * targets.length);
  assert.ok(starts.every(s => s.repo === '/project'));
});
