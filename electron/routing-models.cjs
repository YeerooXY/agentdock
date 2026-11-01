'use strict';
// Capability tiers are routing hints, not benchmark scores or plan entitlement.
// Entitlement evidence must come from the current account's own model discovery.
const FRESH_MS = 30 * 60_000;
const validId = value => typeof value === 'string' && /^[\w.:/-]{1,120}$/.test(value) && !value.startsWith('-');
function modelTier(model) {
  const name = String(model || '').split('/').at(-1);
  if (/(?:^|[-.])(?:astra|opus|ultra)(?:[-.:]|$)/i.test(name)) return 3;
  if (/(?:^|[-.])(?:luna|haiku|mini|nano|flash|lite)(?:[-.:]|$)/i.test(name)) return 1;
  if (/(?:^|[-.])(?:sol|terra|sonnet|pro)(?:[-.:]|$)/i.test(name)) return 2;
  return null;
}
function accountModels(candidate, now = Date.now()) {
  return (Array.isArray(candidate?.models) ? candidate.models : []).filter(m =>
    validId(m.id) && m.available === true && m.funding !== 'metered' &&
    Number.isFinite(m.observedAt) && m.observedAt <= now && now - m.observedAt <= FRESH_MS);
}
// Adopted the local draft's sufficient-tier selection; corrected its forbidden
// paid fallback, size handling and unknown-model handling before integration.
function selectModel(candidate, { size = 'small', role = 'builder', now = Date.now(), excluded = [], escalation = false } = {}) {
  const discovered = accountModels(candidate, now).filter(m => !excluded.includes(m.id));
  // Astra is reserved for an explicitly requested unresolved escalation.
  const available = discovered.filter(m => escalation || !/(?:^|[-/])astra(?:[-.:]|$)/i.test(m.id));
  if (!available.length && discovered.length) return { model: '', tier: null, source: 'explicit escalation required', blocked: true, warning: 'Only escalation models are currently eligible; select one explicitly for an unresolved blocker.' };
  const known = available.filter(m => [1, 2, 3].includes(m.tier ?? modelTier(m.id)))
    .map(m => ({ ...m, tier: m.tier ?? modelTier(m.id) }));
  const required = role === 'reviewer' || size === 'large' ? 3 : size === 'medium' ? 2 : 1;
  let pool = known.filter(m => m.tier >= required);
  if (!pool.length && known.length) pool = known.filter(m => m.tier === Math.max(...known.map(x => x.tier)));
  pool.sort((a, b) => (role === 'reviewer' ? b.tier - a.tier : a.tier - b.tier) ||
    (Number.isFinite(a.economy) ? a.economy : Infinity) - (Number.isFinite(b.economy) ? b.economy : Infinity));
  const chosen = pool[0] || available.find(m => m.id === candidate.model) || available[0];
  return chosen ? { model: chosen.id, tier: chosen.tier ?? modelTier(chosen.id), source: chosen.source || 'account model discovery',
    warning: chosen.tier < required ? 'Use the strongest discovered tier available; check the result against the task.' : null }
    : { model: candidate?.model || '', tier: null, source: 'account default', warning: 'No fresh model entitlement/capability reading; account default retained.' };
}
function modelsFromReading(reading, now = Date.now()) {
  const models = reading?.models || reading?.availableModels;
  if (!Array.isArray(models) || !Number.isFinite(reading.observedAt) || now - reading.observedAt > FRESH_MS) return [];
  return models.filter(m => validId(m.id)).slice(0, 100).map(m => ({ ...m,
    observedAt: reading.observedAt, available: m.available === true,
    tier: [1, 2, 3].includes(m.tier) ? m.tier : modelTier(m.id), tierSource: m.tierSource || 'model-name hint' }));
}
module.exports = { modelTier, accountModels, selectModel, modelsFromReading, FRESH_MS };
