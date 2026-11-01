'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { selectModel, modelsFromReading } = require('../electron/routing-models.cjs');
const row = (id, more = {}) => ({ id, available: true, funding: 'free', observedAt: 100, ...more });
test('bounded work chooses Luna while review discovers the stronger entitled model', () => {
  const c = { models: [row('gpt-6-luna'), row('gpt-5.6-terra'), row('gpt-6-astra')] };
  assert.equal(selectModel(c, { now: 100 }).model, 'gpt-6-luna');
  assert.equal(selectModel(c, { size: 'medium', now: 100 }).model, 'gpt-5.6-terra');
  assert.equal(selectModel(c, { role: 'reviewer', now: 100 }).model, 'gpt-5.6-terra');
  assert.equal(selectModel(c, { role: 'reviewer', now: 100, escalation: true }).model, 'gpt-6-astra');
  assert.equal(selectModel({ models: [row('gpt-6-astra')] }, { now: 100 }).blocked, true);
});
test('free-only account uses its strongest discovered tier without inventing access', () => {
  const c = { models: [row('gpt-6-luna'), row('gpt-5.6-terra')] };
  assert.equal(selectModel(c, { role: 'reviewer', now: 100 }).model, 'gpt-5.6-terra');
  assert.match(selectModel(c, { role: 'reviewer', now: 100 }).warning, /strongest discovered tier/);
});
test('paid, stale, unavailable, excluded and catalog-only models cannot be auto-selected', () => {
  const c = { model: 'native-default', models: [row('gpt-6-astra', { funding: 'metered' }), row('gpt-6-luna', { available: false }), row('gpt-5.6-terra', { observedAt: -2000000 }), row('claude-opus', { available: undefined }), row('claude-haiku')] };
  assert.equal(selectModel(c, { now: 100, excluded: ['claude-haiku'] }).model, 'native-default');
  assert.equal(modelsFromReading({ observedAt: 100, models: [{ id: 'claude-opus' }] }, 100)[0].available, false);
});
