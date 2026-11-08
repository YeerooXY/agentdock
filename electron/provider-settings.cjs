'use strict';
// Compatibility facade. Provider data selects a validated runtime strategy.
const registry = require('./providers/index.cjs');
const strategies = require('./providers/strategies/index.cjs');
const cached = new Map();
const fallback = strategies.createSettings();
function settingsAdapter(provider) {
  const adapter = registry.byId(provider);
  if (!adapter) return fallback;
  if (!cached.has(provider)) cached.set(provider, strategies.createSettings(adapter.settings));
  return cached.get(provider);
}
// Preserve the generic factory's historical behavior for direct callers too.
function cliAdapter() {
  return { ...fallback, launchArgs(ctx) {
    return strategies.cliAdapter(registry.byId(ctx.provider)?.settings).launchArgs(ctx);
  } };
}
module.exports = { settingsAdapter, codexAdapter: strategies.codexAdapter,
  claudeAdapter: strategies.claudeAdapter, cliAdapter };
