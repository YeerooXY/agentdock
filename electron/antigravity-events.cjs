'use strict';
// Drafted by Strata; validated against the CLI's cumulative result envelope.
function normalizeNonnegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function antigravityEvent(state, event) {
  if (!event || typeof event !== 'object' || event.event !== 'result') return state;
  const result = event.result;
  state.complete = true;
  if (!result || typeof result !== 'object' || Array.isArray(result)) { state.error = true; return state; }
  state.error = Boolean(state.error) || result.status !== 'SUCCESS';
  const maxText = state.maxText || 6000;
  state.text = typeof result.response === 'string' ? result.response.slice(-maxText) : '';
  const usageInput = normalizeNonnegativeNumber(result.usage?.input_tokens);
  const cacheRead = normalizeNonnegativeNumber(result.usage?.cache_read_tokens);
  const inputTokens = usageInput == null || cacheRead == null ? null : normalizeNonnegativeNumber(usageInput + cacheRead);
  state.usage = { inputTokens, outputTokens: normalizeNonnegativeNumber(result.usage?.output_tokens),
    cachedInputTokens: cacheRead, turns: normalizeNonnegativeNumber(result.num_turns) };
  return state;
}
module.exports = { antigravityEvent };
