'use strict';
// Normalized usage types and the single staleness rule. Desktop and phone read
// the result of these functions and never compute freshness themselves.
//
// UsageReading { accountId, provider, accountLabel|null, plan|null, source, method, observedAt,
//   precision: exact|rounded, windows: UsageWindow[], credits? }
// UsageWindow { key, label, scope: account|model-group, modelGroup|null, minutes|null,
//   usedPercent|null, unlimited, used?, total?, unit?, resetsAt|null, resetLabel|null }
// UsageCheck { accountId, provider, status, checkedAt, observedAt|null, message,
//   stale, staleReason|null, failure?, reason?, lastReading|null, lastReadings }
//
// A null percent is unknown. It is never shown as 0% or 100%, never summed across
// windows or accounts, and never inferred from token counts.
const { usageSource } = require('./providers/index.cjs');

const STALE_AFTER_MS = 5 * 60_000;
const STATUSES = ['current', 'refreshing', 'stale', 'sign-in', 'not-installed', 'timeout', 'unavailable', 'unsupported', 'no-quota', 'not-isolated', 'limited', 'inactive'];
// A failed check keeps its cached reading visible, marked stale.
const FAILURES = new Set(['sign-in', 'not-installed', 'timeout', 'unavailable', 'unsupported', 'limited', 'inactive']);

const finite = value => typeof value === 'number' && Number.isFinite(value);
const percent = value => finite(value) && value >= 0 && value <= 100 ? value : null;
const text = value => typeof value === 'string' && value.trim() ? value.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 80) : null;

function normalizeWindow(raw) {
  const modelGroup = text(raw?.modelGroup);
  const window = {
    ...raw,
    key: text(raw?.key) || 'window', label: text(raw?.label) || 'Limit',
    scope: modelGroup ? 'model-group' : 'account', modelGroup,
    minutes: finite(raw?.minutes) ? raw.minutes : null,
    usedPercent: percent(raw?.usedPercent), unlimited: raw?.unlimited === true,
    resetsAt: finite(raw?.resetsAt) ? raw.resetsAt : null, resetLabel: text(raw?.resetLabel)
  };
  for (const key of ['used', 'total']) if (!finite(window[key])) delete window[key];
  if (typeof window.unit !== 'string') delete window.unit;
  return window;
}

// Reader output becomes a UsageReading for exactly this account. A reading that
// names another account or provider is rejected, never relabelled.
function normalizeReading(raw, account) {
  if (!raw || raw.accountId !== account.id || raw.provider !== account.provider || !finite(raw.observedAt)) return null;
  const source = usageSource(account.provider);
  return {
    ...raw,
    accountLabel: text(account.label), plan: text(raw.plan), source: text(raw.source) || source?.source || 'Provider',
    method: source?.method || 'native-command', precision: raw.precision || source?.precision || 'exact',
    observedAt: raw.observedAt, windows: (Array.isArray(raw.windows) ? raw.windows : []).map(normalizeWindow)
  };
}

// Returns why a cached reading is stale, or null. A missing observation time is
// stale, never fresh.
function staleReason(readings, observedAt, now) {
  if (!readings?.length) return null;
  if (!finite(observedAt) || now - observedAt > STALE_AFTER_MS) return 'age';
  if (readings.some(reading => reading.windows?.some(window => finite(window.resetsAt) && window.resetsAt <= now))) return 'reset-passed';
  return null;
}

// The check as consumers see it, evaluated at `now`.
function checkView(state, now) {
  const readings = state.lastReadings || [];
  const age = staleReason(readings, state.observedAt, now);
  const view = { ...state, lastReading: readings[0] || null, stale: false, staleReason: null };
  if (FAILURES.has(state.status) && readings.length) Object.assign(view, { status: 'stale', failure: state.status, stale: true, staleReason: 'check-failed' });
  else if (age) Object.assign(view, { stale: true, staleReason: age }, state.status === 'current' ? { status: 'stale' } : {});
  return view;
}

module.exports = { STALE_AFTER_MS, STATUSES, FAILURES, normalizeReading, normalizeWindow, staleReason, checkView };
