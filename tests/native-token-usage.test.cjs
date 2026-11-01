'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { claudeTokens, openCodeTokens } = require('../electron/native-token-usage.cjs');
const { openCodeEvents } = require('../electron/task-loop.cjs');
test('native counters include cache and reasoning exactly once', () => {
  assert.deepEqual(openCodeTokens({ input: 10, output: 2, reasoning: 7, cache: { read: 100, write: 5 } }), { inputTokens: 115, outputTokens: 9, cachedInputTokens: 100 });
  assert.deepEqual(claudeTokens({ input_tokens: 10, output_tokens: 9, cache_read_input_tokens: 100, cache_creation_input_tokens: 5 }), { inputTokens: 115, outputTokens: 9, cachedInputTokens: 100 });
});
test('missing or invalid required counters stay unknown across later valid receipts', () => {
  assert.equal(openCodeTokens({ input: -1, output: 2 }).inputTokens, null);
  const lines = [{ type: 'step_finish', part: { tokens: { output: 5 } } }, { type: 'step_finish', part: { tokens: { input: 10, output: 2 } } }].map(JSON.stringify).join('\n');
  assert.equal(openCodeEvents(lines).usage.inputTokens, null);
});
