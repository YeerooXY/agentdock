'use strict';
const PROVIDERS = new Set(['openai', 'anthropic']);
function number(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
function rateWindow(raw, fallbackMinutes) {
  if (!raw) return null;
  const used = number(raw.usedPercent ?? raw.used_percentage);
  if (used === null) return null;
  const minutes = number(raw.windowDurationMins ?? raw.window_minutes) ?? fallbackMinutes;
  const seconds = number(raw.resetsAt ?? raw.resets_at);
  return { usedPercent: used, minutes, resetsAt: seconds === null ? null : seconds * 1000 };
}
function codexLimits(result, at = Date.now()) {
  const map = result?.rateLimitsByLimitId;
  const items = map && Object.keys(map).length ? Object.entries(map) : [['codex', result?.rateLimits]];
  return items.filter(([, v]) => v).map(([id, raw]) => ({
    id: `codex:${id}`, provider: 'codex', name: raw.limitName || (id === 'codex' ? 'Codex' : id),
    plan: raw.planType || null, source: 'Codex account service', observedAt: at,
    windows: [rateWindow(raw.primary, null), rateWindow(raw.secondary, null)].filter(Boolean)
  }));
}
function claudeLimits(raw, at = Date.now()) {
  const limits = raw?.rate_limits;
  if (!limits) return null;
  const windows = [rateWindow(limits.five_hour, 300), rateWindow(limits.seven_day, 10080)].filter(Boolean);
  if (!windows.length) return null;
  return { id: 'claude:account', provider: 'claude', name: 'Claude Code', source: 'Claude status line', observedAt: at, windows };
}
function normalizeUsage(provider, raw) {
  if (!raw) return null;
  if (provider === 'openai') {
    const input = number(raw.input_tokens), output = number(raw.output_tokens);
    if (input === null || output === null) return null;
    const cached = Math.min(input, number(raw.input_tokens_details?.cached_tokens) ?? 0);
    return { input, output, uncached: input - cached, cached, cacheWrite: 0, total: input + output };
  }
  const uncached = number(raw.input_tokens), output = number(raw.output_tokens);
  if (uncached === null || output === null) return null;
  const cached = number(raw.cache_read_input_tokens) ?? 0;
  const cacheWrite = number(raw.cache_creation_input_tokens) ?? 0;
  return { input: uncached + cached + cacheWrite, output, uncached, cached, cacheWrite, total: uncached + cached + cacheWrite + output };
}
function estimateCost(usage, rates) {
  if (!usage || !rates) return null;
  let total = 0;
  for (const [field, price] of [['uncached', 'input'], ['output', 'output'], ['cached', 'cached'], ['cacheWrite', 'cacheWrite']]) {
    if (!usage[field]) continue;
    const value = number(rates[price]);
    if (value === null) return null;
    total += usage[field] * value / 1_000_000;
  }
  return total;
}
function validateProvider(provider) {
  if (!PROVIDERS.has(provider)) throw new Error('Choose OpenAI or Anthropic.');
  return provider;
}
function validateRequest(raw) {
  const provider = validateProvider(raw?.provider);
  const model = typeof raw.model === 'string' ? raw.model.trim() : '';
  const prompt = typeof raw.prompt === 'string' ? raw.prompt : '';
  const maxOutput = Number(raw.maxOutput ?? 1024);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(model)) throw new Error('Enter a valid model ID.');
  if (!prompt.trim() || prompt.length > 100_000) throw new Error('Enter a prompt of 1–100,000 characters.');
  if (!Number.isInteger(maxOutput) || maxOutput < 16 || maxOutput > 32768) throw new Error('Output limit must be between 16 and 32,768 tokens.');
  return { provider, model, prompt, maxOutput };
}
function ledgerSummary(entries, since = Date.now() - 30 * 86400000) {
  const rows = entries.filter(x => x.at >= since);
  return {
    requests: rows.length, tokens: rows.reduce((a, x) => a + (x.usage?.total ?? 0), 0),
    cost: rows.reduce((a, x) => a + (x.estimatedCost ?? 0), 0),
    unpriced: rows.filter(x => x.estimatedCost === null).length,
    unknownUsage: rows.filter(x => !x.usage).length
  };
}
module.exports = { number, rateWindow, codexLimits, claudeLimits, normalizeUsage, estimateCost, validateProvider, validateRequest, ledgerSummary };
