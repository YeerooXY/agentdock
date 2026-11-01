'use strict';
// Pure normalization of raw OpenRouter readings for one selected model. No HTTP,
// auth, storage or file access. Inputs are provider data objects, not {data:...} envelopes.
const SAFE = Number.MAX_SAFE_INTEGER;
const NUMERIC = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;
function record(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= SAFE ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!NUMERIC.test(text)) return null;
  const parsed = Number(text);
  // Underflow must not turn a small positive price into a free model.
  if (parsed === 0 && /[1-9]/.test(text.split(/e/i)[0])) return null;
  return Number.isFinite(parsed) && Math.abs(parsed) <= SAFE ? parsed : null;
}
function explicitZero(value) {
  const parsed = number(value);
  if (parsed !== 0 || Object.is(parsed, -0)) return false;
  return !(typeof value === 'string' && value.trim().startsWith('-'));
}
function nonnegative(value) {
  const parsed = number(value);
  if (parsed === null || parsed < 0 || Math.abs(parsed) > SAFE) return null;
  return parsed;
}
function normalizeOpenRouterAllowance(keyData, creditsData, selectedModel, observedAt) {
  const key = record(keyData), credits = record(creditsData), pricing = record(record(selectedModel)?.pricing);
  const prompt = number(pricing?.prompt), completion = number(pricing?.completion);
  const funding = explicitZero(pricing?.prompt) && explicitZero(pricing?.completion) ? 'free' : prompt > 0 || completion > 0 ? 'metered' : 'unknown';
  const windows = [];
  let remainingCredits = null, modelAllowed = null;
  if (funding === 'free') {
    const counter = record(key?.free_model_daily_requests);
    const used = nonnegative(counter?.used), limit = nonnegative(counter?.limit), remaining = nonnegative(counter?.remaining);
    if (used !== null && limit !== null && remaining !== null && limit > 0 && used <= limit && remaining <= limit && used + remaining === limit) {
      windows.push({ key: 'free-model-daily', label: 'Free model requests', used, total: limit, remaining, unit: 'requests', usedPercent: used / limit * 100, minutes: 1440 });
      modelAllowed = remaining > 0;
    }
  } else if (funding === 'metered') {
    const granted = credits ? nonnegative(credits.total_credits) : null, spent = credits ? nonnegative(credits.total_usage) : null, cap = nonnegative(key?.limit_remaining);
    const balance = granted !== null && spent !== null && spent <= granted ? granted - spent : null;
    remainingCredits = balance === null ? null : Math.min(balance, cap ?? balance);
    modelAllowed = cap === 0 ? false : remainingCredits === null ? null : remainingCredits > 0;
  }
  return { funding, remainingCredits, modelAllowed, windows, observedAt: Number.isFinite(observedAt) ? observedAt : null };
}
module.exports = { normalizeOpenRouterAllowance };
