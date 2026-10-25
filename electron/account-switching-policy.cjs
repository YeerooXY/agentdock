'use strict';

function accountIdForLimit(limit) {
  if (limit?.accountId) return limit.accountId;
  if (limit?.provider === 'codex') return 'codex:default';
  if (limit?.provider === 'claude' && limit.id === 'claude:account') return 'claude:default';
  return null;
}

function freshLimits(limits, accountId, provider, now, maxAge = 5 * 60_000) {
  return (limits || []).filter(item => accountIdForLimit(item) === accountId && item.provider === provider &&
    Number.isFinite(item.observedAt) && now >= item.observedAt && now - item.observedAt <= maxAge);
}

function thresholdCandidate(limits, accountId, provider, threshold, now = Date.now()) {
  return freshLimits(limits, accountId, provider, now).flatMap(item => Array.isArray(item.windows) ? item.windows : [])
    .filter(window => Number.isFinite(window.usedPercent) && window.usedPercent >= threshold && Number.isFinite(window.resetsAt) && window.resetsAt > now)
    .sort((a, b) => b.usedPercent - a.usedPercent)[0] || null;
}

function allFreshWindows(limits, accountId, provider, now) {
  const records = (limits || []).filter(item => accountIdForLimit(item) === accountId && item.provider === provider);
  const fresh = freshLimits(limits, accountId, provider, now);
  const complete = records.length > 0 && fresh.length === records.length && fresh.every(item =>
    Array.isArray(item.windows) && item.windows.length > 0 && item.windows.every(window =>
      Number.isFinite(window.usedPercent) && Number.isFinite(window.resetsAt) && window.resetsAt > now));
  return { complete, windows: fresh.flatMap(item => Array.isArray(item.windows) ? item.windows : []) };
}

function automaticSwitchEligible({ limits, sourceAccountId, targetAccountId, provider, candidate, threshold, now = Date.now(), enabled, state, busy, draftSupported }) {
  if (enabled !== true || busy || !draftSupported || !['open', 'ready'].includes(state) || !candidate) return false;
  const source = allFreshWindows(limits, sourceAccountId, provider, now);
  const target = allFreshWindows(limits, targetAccountId, provider, now);
  if (!source.complete || !target.complete) return false;
  const confirmed = source.windows.some(window => window.minutes === candidate.minutes && window.resetsAt === candidate.resetsAt && window.usedPercent >= threshold);
  const matching = target.windows.filter(window => window.minutes === candidate.minutes);
  return confirmed && matching.length > 0 && target.windows.every(window => window.usedPercent < threshold && window.resetsAt > now);
}

module.exports = { accountIdForLimit, freshLimits, thresholdCandidate, automaticSwitchEligible };
