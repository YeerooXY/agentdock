'use strict';
const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const sum = values => values.every(v => count(v) !== null) ? count(values.reduce((a, b) => a + b, 0)) : null;
function claudeTokens(usage) {
  if (!usage) return null;
  return { inputTokens: sum([usage.input_tokens, usage.cache_read_input_tokens ?? 0, usage.cache_creation_input_tokens ?? 0]),
    outputTokens: count(usage.output_tokens), cachedInputTokens: count(usage.cache_read_input_tokens ?? 0) };
}
function openCodeTokens(tokens = {}) {
  // OpenCode session.getUsage subtracts cache from input and reasoning from
  // output. Recombine each side once; keep cache reads separately for pricing.
  return { inputTokens: sum([tokens.input, tokens.cache?.read ?? 0, tokens.cache?.write ?? 0]),
    outputTokens: sum([tokens.output, tokens.reasoning ?? 0]), cachedInputTokens: count(tokens.cache?.read ?? 0) };
}
module.exports = { claudeTokens, openCodeTokens };
