'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { selectModel, modelsFromReading } = require('../electron/routing-models.cjs');
const row = (id, more = {}) => ({ id, available: true, funding: 'free', observedAt: 100, ...more });
const tiers = [row('claude-haiku-5'), row('claude-sonnet-5'), row('claude-opus-5')];
test('bounded medium and small builds start at Haiku-class; large builds and reviews start at Sonnet-class', () => {
  const c = { models: tiers };
  assert.equal(selectModel(c, { size: 'small', now: 100 }).model, 'claude-haiku-5');
  assert.equal(selectModel(c, { size: 'medium', now: 100 }).model, 'claude-haiku-5');
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
  assert.equal(selectModel(c, { size: 'medium', now: 100 }).model, 'gpt-6-luna');
  assert.equal(selectModel(c, { role: 'reviewer', now: 100 }).model, 'gpt-5.6-terra');
  assert.equal(selectModel(c, { role: 'reviewer', now: 100, escalation: true }).model, 'gpt-6-astra');
  assert.equal(selectModel({ models: [row('gpt-6-astra')] }, { now: 100 }).blocked, true);
});
test('a builder falls back to the strongest discovered tier without inventing access', () => {
  const c = { models: [row('claude-sonnet-5'), row('claude-opus-5')] };
  assert.equal(selectModel(c, { size: 'small', now: 100 }).model, 'claude-sonnet-5');
  const lone = selectModel({ models: [row('claude-haiku-5')] }, { size: 'large', now: 100 });
  assert.equal(lone.model, 'claude-haiku-5');
  assert.match(lone.warning, /strongest discovered tier/);
  assert.match(selectModel({ models: [row('gpt-6-luna'), row('gpt-5.6-terra')] }, { role: 'reviewer', now: 100 }).model, /terra/);
});
test('paid, stale, unavailable, excluded and catalog-only models cannot be auto-selected', () => {
  const c = { model: 'native-default', models: [row('gpt-6-astra', { funding: 'metered' }), row('gpt-6-luna', { available: false }), row('gpt-5.6-terra', { observedAt: -2000000 }), row('claude-opus', { available: undefined }), row('claude-haiku')] };
  assert.equal(selectModel(c, { now: 100, excluded: ['claude-haiku'] }).model, 'native-default');
  assert.equal(modelsFromReading({ observedAt: 100, models: [{ id: 'claude-opus' }] }, 100)[0].available, false);
});
test('with no discovered models the account default is kept', () => {
  const picked = selectModel({ model: 'account-default', models: [] }, { size: 'large', now: 100 });
  assert.equal(picked.model, 'account-default');
  assert.match(picked.warning, /account default retained/);
});
