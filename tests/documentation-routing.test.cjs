'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { KnowledgeBudget } = require('../electron/knowledge-budget.cjs');
const { selectDocumentationWorker } = require('../electron/documentation-routing.cjs');
const { TaskLoop } = require('../electron/task-loop.cjs');

test('selection discovers accounts once across all models and rechecks eligibility on dispatch', () => {
  let discoveries = 0;
  const account = { id: 'claude:default', provider: 'claude', signedIn: true, funding: 'included',
    models: Array.from({ length: 14 }, (_, i) => ({ id: `sonnet-${i}` })) };
  const loop = Object.create(TaskLoop.prototype);
  Object.assign(loop, { candidates: () => { discoveries++; return [account]; },
    now: Date.now, getSettings: () => ({}), getLimits: () => [] });
  // Even ineligible models must share discovery; stale quota is still rejected.
  assert.throws(() => selectDocumentationWorker(loop), /allowance is unknown/);
  assert.equal(discoveries, 1);
  account.available = false;
  assert.throws(() => loop.documentationEligibility({ accountId: account.id, model: 'sonnet-0' }), /available/);
  assert.equal(discoveries, 2, 'dispatch must obtain current account availability');
});
test('documentation attempts are persisted per project', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-budget-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'budget.json'); let now = 10000000;
  const budget = new KnowledgeBudget(file, () => now);
  for (let i = 0; i < 4; i++) budget.record('one');
  assert.equal(budget.available('one'), false); assert.equal(budget.available('two'), true);
  budget.record('two');
  assert.equal(new KnowledgeBudget(file, () => now).available('one'), false);
  now += 3600001; assert.equal(budget.available('one'), true);
});
test('automatic routing prefers eligible local routes and excludes failed accounts', () => {
  const loop = { candidates: () => [
    { id: 'claude:default', provider: 'claude', signedIn: true, models: [{ id: 'sonnet' }] },
    { id: 'opencode:strata', provider: 'opencode', local: true, available: true, models: [{ id: 'local' }] }
  ], documentationEligibility: ({ accountId }) => ({ funding: accountId === 'opencode:strata' ? 'local' : 'included' }) };
  assert.equal(selectDocumentationWorker(loop).accountId, 'opencode:strata');
  assert.equal(selectDocumentationWorker(loop, { excluded: ['opencode:strata'] }).accountId, 'claude:default');
  loop.documentationEligibility = () => ({ funding: 'metered' });
  assert.throws(() => selectDocumentationWorker(loop), /No ready/);
});
