'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeClaudeModels, resolveSelection } = require('../electron/model-selection.cjs');

test('Claude native choices preserve model-specific effort support and exclude unavailable models', () => {
  const models = normalizeClaudeModels({ models: [
    { value: 'sonnet', resolvedModel: 'claude-sonnet-current', displayName: 'Sonnet', supportedEffortLevels: ['low', 'max', 'bogus', 'low'] },
    { value: 'haiku', supportsEffort: false, supportedEffortLevels: ['max'] },
    { value: 'hidden', available: false }, { value: '--bad' }, { value: 'sonnet' }
  ] });
  assert.deepEqual(models.map(x => [x.id, x.efforts]), [['sonnet', ['low', 'max']], ['haiku', []]]);
  assert.deepEqual(resolveSelection(models, { model: 'claude-sonnet-current', effort: 'max' }), { model: 'sonnet', resolvedModel: 'claude-sonnet-current', effort: 'max' });
  assert.throws(() => resolveSelection(models, { model: 'custom-model' }), /not offered/);
  assert.throws(() => resolveSelection([{ id: 'first-model' }], {}), /Choose a model/);
  assert.throws(() => resolveSelection(models, { model: 'haiku', effort: 'max' }), /effort level/);
  assert.equal(resolveSelection(models, { model: 'haiku' }, { effort: 'max' }).effort, null);
  assert.equal(resolveSelection(models, { model: 'sonnet', effort: null }, { effort: 'max' }).effort, null);
});
