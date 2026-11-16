'use strict';
// Capability tiers are routing hints, not benchmark scores or plan entitlement.
// Entitlement evidence must come from the current account's own model discovery.
const FRESH_MS = 30 * 60_000;
const validId = value => typeof value === 'string' && /^[\w.:/-]{1,120}$/.test(value) && !value.startsWith('-');
function compareModelVersions(left, right) {
  const release = id => /(?:^|[-/])(sonnet|opus|haiku|gpt)[-.](\d+)(?:[.-](\d+))?/i.exec(id || '');
  const a = release(left), b = release(right);
  if (!a || !b || a[1].toLowerCase() !== b[1].toLowerCase()) return 0;
  return Number(a[2]) - Number(b[2]) || Number(a[3] || 0) - Number(b[3] || 0);
}
function modelTier(model) {
  const name = String(model || '').split('/').at(-1);
  if (/(?:^|[-.])(?:astra|opus|ultra)(?:[-.:]|$)/i.test(name)) return 3;
  if (/(?:^|[-.])(?:luna|haiku|mini|nano|flash|lite|hydrogen)(?:[-.:]|$)/i.test(name)) return 1;
  if (/(?:^|[-.])(?:sol|terra|sonnet|pro|argon)(?:[-.:]|$)/i.test(name)) return 2;
  return null;
}
function accountModels(candidate, now = Date.now()) {
  return (Array.isArray(candidate?.models) ? candidate.models : []).filter(m =>
    validId(m.id) && m.available === true && m.funding !== 'metered' &&
    Number.isFinite(m.observedAt) && m.observedAt <= now && now - m.observedAt <= FRESH_MS);
}
// Explicit small tasks start at tier 1. Broader work and reviews start at tier 2.
// Capability tiers require task-specific judgment; tier 3 requires escalation.
function preferredTier({ size, role, escalation }) {
  if (escalation) return 3;
  return role === 'reviewer' || size !== 'small' ? 2 : 1;
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
  const preferred = preferredTier({ size, role, escalation });
  let pool = known.filter(m => m.tier >= preferred);
  pool.sort((a, b) => a.tier - b.tier ||
    (Number.isFinite(a.economy) ? a.economy : Infinity) - (Number.isFinite(b.economy) ? b.economy : Infinity) || compareModelVersions(b.id, a.id));
  const chosen = pool[0] || (preferred === 1 ? available.find(m => m.id === candidate.model) || available[0] : null);
  if (!chosen && preferred > 1) return { model: '', tier: null, source: 'capability requirement', blocked: true, warning: 'No fresh discovered model meets this task tier. Select a capable model explicitly or keep the task with the lead.' };
  return chosen ? { model: chosen.id, tier: chosen.tier ?? modelTier(chosen.id), source: chosen.source || 'account model discovery',
    warning: null }
    : { model: candidate?.model || '', tier: null, source: 'account default', warning: 'No fresh model entitlement/capability reading; account default retained.' };
}
function modelsFromReading(reading, now = Date.now()) {
  const models = reading?.models || reading?.availableModels;
  if (!Array.isArray(models) || !Number.isFinite(reading.observedAt) || now - reading.observedAt > FRESH_MS) return [];
  return models.filter(m => validId(m.id)).slice(0, 100).map(m => ({ ...m,
    observedAt: reading.observedAt, available: m.available === true,
    tier: [1, 2, 3].includes(m.tier) ? m.tier : modelTier(m.id), tierSource: m.tierSource || 'model-name hint' }));
}
module.exports = { modelTier, accountModels, selectModel, modelsFromReading, compareModelVersions, FRESH_MS };
