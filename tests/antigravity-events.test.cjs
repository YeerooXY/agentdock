'use strict';
// Local draft cases, with completed truncation coverage and corrected terminal-state assertions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { antigravityEvent } = require('../electron/antigravity-events.cjs');
test('cumulative totals replace previous values and ignore step_update', () => {
  const state = { text: '', usage: null, complete: false, error: false, maxText: 6000 };
  antigravityEvent(state, { event: 'step_update', data: 'ignored' });
  assert.equal(state.usage, null); assert.equal(state.complete, false);
  antigravityEvent(state, { event: 'result', result: { status: 'SUCCESS', response: 'first text', num_turns: 2,
    usage: { input_tokens: 10, cache_read_tokens: 90, output_tokens: 4 } } });
  assert.deepEqual(state.usage, { inputTokens: 100, outputTokens: 4, cachedInputTokens: 90, turns: 2 });
  assert.equal(state.text, 'first text'); assert.equal(state.complete, true); assert.equal(state.error, false);
  antigravityEvent(state, { event: 'result', result: { status: 'SUCCESS', response: 'second text', num_turns: 3,
    usage: { input_tokens: 20, cache_read_tokens: 100, output_tokens: 7 } } });
  assert.deepEqual(state.usage, { inputTokens: 120, outputTokens: 7, cachedInputTokens: 100, turns: 3 });
});
test('invalid counters remain unknown', () => {
  for (const field of ['input_tokens', 'cache_read_tokens', 'output_tokens']) for (const value of [undefined, '10', -1, Infinity, NaN]) {
    const state = {};
    antigravityEvent(state, { event: 'result', result: { status: 'SUCCESS', response: 'text', usage: { input_tokens: 10, cache_read_tokens: 90, output_tokens: 4, [field]: value } } });
    assert.equal(field === 'output_tokens' ? state.usage.outputTokens : state.usage.inputTokens, null);
  }
});
test('error is terminal and sticky even after a later successful event', () => {
  const state = {};
  antigravityEvent(state, { event: 'result', result: null });
  assert.equal(state.error, true); assert.equal(state.complete, true);
  antigravityEvent(state, { event: 'result', result: { status: 'SUCCESS', response: 'later' } });
  assert.equal(state.error, true); assert.equal(state.complete, true);
});
test('only the bounded response tail is retained', () => {
  const state = { maxText: 5 };
  antigravityEvent(state, { event: 'result', result: { status: 'SUCCESS', response: 'prefix-final' } });
  assert.equal(state.text, 'final');
});
