'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { normalizeOpenRouterAllowance } = require('../electron/route-allowance.cjs');
const KIMI = { id: 'moonpai/kimi-k2-think', pricing: { prompt: '0.0000006', completion: '0.0000025' } };
const FREE_MODEL = { id: 'free/example-model', pricing: { prompt: '0', completion: 0 } };

test('a free account flag never proves a priced model is free', () => {
  const result = normalizeOpenRouterAllowance({ is_free_tier: true, limit_remaining: 0 }, { total_credits: 0, total_usage: 0 }, KIMI, 1700000000000);
  assert.deepEqual(result, { funding: 'metered', remainingCredits: 0, modelAllowed: false, windows: [], observedAt: 1700000000000 });
  assert.equal(JSON.stringify(result).includes('is_free_tier'), false);
});

test('a genuinely free model reports one daily request window', () => {
  const result = normalizeOpenRouterAllowance({ free_model_daily_requests: { used: 18, limit: 50, remaining: 32 } }, null, FREE_MODEL, 1700000000000);
  assert.equal(result.funding, 'free'); assert.equal(result.modelAllowed, true); assert.equal(result.remainingCredits, null);
  assert.deepEqual(result.windows, [{ key: 'free-model-daily', label: 'Free model requests', used: 18, total: 50, remaining: 32, unit: 'requests', usedPercent: 36, minutes: 1440 }]);
});

test('missing counters leave a free model readable but unproven', () => {
  const result = normalizeOpenRouterAllowance({ is_free_tier: true }, {}, FREE_MODEL, 1000);
  assert.equal(result.funding, 'free'); assert.equal(result.modelAllowed, null); assert.deepEqual(result.windows, []);
});

test('underflow and overflow prices never become a free route', () => {
  for (const prompt of ['1e-999', '1e999', Number.MAX_VALUE]) {
    assert.equal(normalizeOpenRouterAllowance({}, null, { pricing: { prompt, completion: 0 } }, 100).funding, 'unknown');
  }
});

test('invalid prices and counters never invent funding or allowance', () => {
  for (const pricing of [{ prompt: 'free', completion: '0' }, { prompt: '0', completion: undefined }, { prompt: '-0', completion: '0' }, { prompt: NaN, completion: 0 }])
    assert.equal(normalizeOpenRouterAllowance({}, null, { id: 'model', pricing }, 1000).funding, 'unknown');
  for (const counter of [{ used: 'ten', limit: 50, remaining: 40 }, { used: -1, limit: 50, remaining: 51 }, { used: 20, limit: 50, remaining: Infinity }, { used: 18, limit: 50, remaining: 31 }, { used: 0, limit: 0, remaining: 0 }, null]) {
    const result = normalizeOpenRouterAllowance({ free_model_daily_requests: counter }, null, FREE_MODEL, 1000);
    assert.equal(result.funding, 'free'); assert.equal(result.modelAllowed, null); assert.deepEqual(result.windows, []);
  }
});

test('a fully used quota is shown as exhausted instead of dropped', () => {
  const result = normalizeOpenRouterAllowance({ free_model_daily_requests: { used: 50, limit: 50, remaining: 0 } }, null, FREE_MODEL, 1000);
  assert.equal(result.modelAllowed, false); assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].usedPercent, 100); assert.equal(result.windows[0].remaining, 0);
});

test('a key cap blocks the model but is not proof of funded credits', () => {
  const capped = normalizeOpenRouterAllowance({ limit_remaining: 0 }, null, KIMI, 1000);
  assert.equal(capped.funding, 'metered'); assert.equal(capped.remainingCredits, null); assert.equal(capped.modelAllowed, false);
  const unknown = normalizeOpenRouterAllowance({ limit_remaining: '40' }, null, KIMI, 1000);
  assert.equal(unknown.remainingCredits, null); assert.equal(unknown.modelAllowed, null);
  assert.equal(normalizeOpenRouterAllowance({ limit_remaining: -5 }, null, KIMI, 1000).modelAllowed, null);
});

test('the key cap lowers a known balance and an unusable balance stays unknown', () => {
  const result = normalizeOpenRouterAllowance({ limit_remaining: 25 }, { total_credits: 100, total_usage: 40 }, KIMI, 1000);
  assert.equal(result.remainingCredits, 25); assert.equal(result.modelAllowed, true);
  assert.equal(normalizeOpenRouterAllowance({}, { total_credits: 100, total_usage: 140 }, KIMI, 1000).remainingCredits, null);
  assert.equal(normalizeOpenRouterAllowance({}, { total_credits: Number.MAX_SAFE_INTEGER + 1, total_usage: 0 }, KIMI, 1000).remainingCredits, null);
  assert.equal(normalizeOpenRouterAllowance({}, { total_credits: 100, total_usage: '40 credits' }, KIMI, 1000).remainingCredits, null);
});

test('the reader is pure: it reads no envelope layer and does not change its inputs', () => {
  const keyData = { limit_remaining: 25, free_model_daily_requests: { used: 18, limit: 50, remaining: 32 } }, model = { id: 'model', pricing: { prompt: '0', completion: '0' } };
  const envelope = { data: { is_free_tier: true, free_model_daily_requests: { used: 18, limit: 50, remaining: 32 } } };
  assert.deepEqual(normalizeOpenRouterAllowance(envelope, null, model, '1000'), { funding: 'free', remainingCredits: null, modelAllowed: null, windows: [], observedAt: null });
  assert.deepEqual(normalizeOpenRouterAllowance(keyData, null, model, 1000).windows[0].remaining, 32);
  assert.deepEqual(keyData, { limit_remaining: 25, free_model_daily_requests: { used: 18, limit: 50, remaining: 32 } });
  assert.deepEqual(model, { id: 'model', pricing: { prompt: '0', completion: '0' } });
});
