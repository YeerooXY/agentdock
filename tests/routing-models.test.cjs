'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { selectModel, modelsFromReading } = require('../electron/routing-models.cjs');
const row = (id, more = {}) => ({ id, available: true, funding: 'free', observedAt: 100, ...more });
const tiers = [row('claude-haiku-5'), row('claude-sonnet-5'), row('claude-opus-5')];
test('only explicit small builds start at Haiku-class; broader work and reviews start at Sonnet-class', () => {
  const c = { models: tiers };
  assert.equal(selectModel(c, { size: 'small', now: 100 }).model, 'claude-haiku-5');
  assert.equal(selectModel(c, { size: 'medium', now: 100 }).model, 'claude-sonnet-5');
  assert.equal(selectModel(c, { size: 'large', now: 100 }).model, 'claude-sonnet-5');
  assert.equal(selectModel(c, { role: 'reviewer', now: 100 }).model, 'claude-sonnet-5');
});
test('the strongest discovered model is chosen only for an explicit escalation', () => {
  const c = { models: tiers };
  const escalated = selectModel(c, { role: 'reviewer', now: 100, escalation: true });
  assert.equal(escalated.model, 'claude-opus-5');
  assert.equal(escalated.warning, null);
});
test('Astra stays out of routine selection and is chosen only for an explicit escalation', () => {
  const c = { models: [row('gpt-6-luna'), row('gpt-5.6-terra'), row('gpt-6-astra')] };
  assert.equal(selectModel(c, { now: 100 }).model, 'gpt-6-luna');
  assert.equal(selectModel(c, { size: 'medium', now: 100 }).model, 'gpt-5.6-terra');
  assert.equal(selectModel(c, { role: 'reviewer', now: 100 }).model, 'gpt-5.6-terra');
  assert.equal(selectModel(c, { role: 'reviewer', now: 100, escalation: true }).model, 'gpt-6-astra');
  assert.equal(selectModel({ models: [row('gpt-6-astra')] }, { now: 100 }).blocked, true);
});
test('larger tasks remain unassigned when only smaller models are discovered', () => {
  const c = { models: [row('claude-sonnet-5'), row('claude-opus-5')] };
  assert.equal(selectModel(c, { size: 'small', now: 100 }).model, 'claude-sonnet-5');
  const lone = selectModel({ models: [row('claude-haiku-5')] }, { size: 'large', now: 100 });
  assert.equal(lone.blocked, true);
  assert.equal(lone.model, '');
  for (const options of [{ size: 'medium' }, { role: 'reviewer' }]) assert.equal(selectModel({ models: [row('claude-haiku-5')] }, { ...options, now: 100 }).blocked, true);
  assert.match(selectModel({ models: [row('gpt-6-luna'), row('gpt-5.6-terra')] }, { role: 'reviewer', now: 100 }).model, /terra/);
});
test('paid, stale, unavailable, excluded and catalog-only models cannot be auto-selected', () => {
  const c = { model: 'native-default', models: [row('gpt-6-astra', { funding: 'metered' }), row('gpt-6-luna', { available: false }), row('gpt-5.6-terra', { observedAt: -2000000 }), row('claude-opus', { available: undefined }), row('claude-haiku')] };
  assert.equal(selectModel(c, { now: 100, excluded: ['claude-haiku'] }).model, 'native-default');
  assert.equal(modelsFromReading({ observedAt: 100, models: [{ id: 'claude-opus' }] }, 100)[0].available, false);
});
test('larger tasks require fresh capability discovery while small tasks retain native defaults', () => {
  const picked = selectModel({ model: 'account-default', models: [] }, { size: 'large', now: 100 });
  assert.equal(picked.blocked, true);
  assert.equal(picked.model, '');
  assert.equal(selectModel({ model: 'account-default', models: [] }, { size: 'small', now: 100 }).model, 'account-default');
});

test('Gemini 4 Hydrogen routes as a light model and Argon as a mid model, so automatic routing can choose them', () => {
  const { modelTier } = require('../electron/routing-models.cjs');
  assert.equal(modelTier('gemini-4-hydrogen-high'), 1); assert.equal(modelTier('gemini-4-argon-medium'), 2);
  const c = { models: [row('gemini-4-hydrogen-medium'), row('gemini-4-argon-medium'), row('claude-opus-5-5-high')] };
  assert.equal(selectModel(c, { size: 'small', now: 100 }).model, 'gemini-4-hydrogen-medium');
  assert.equal(selectModel(c, { size: 'medium', now: 100 }).model, 'gemini-4-argon-medium');
});
