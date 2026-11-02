'use strict';

const MODEL_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:/\[\]@+-]{0,199}$/;
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'minimal', 'none'];

function normalizeName(raw) {
  return String(raw || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100);
}
function normalizeEffort(raw) {
  return Array.isArray(raw) ? [...new Set(raw.filter(x => EFFORT_LEVELS.includes(x)))] : [];
}
// Native catalogs describe offered choices. They do not prove inference entitlement.
function normalizeClaudeModels(raw) {
  const out = [], seen = new Set();
  for (const item of Array.isArray(raw?.models) ? raw.models : []) {
    if (!item || item.available === false || item.disabled === true || !MODEL_ID_RE.test(item.value || '') || seen.has(item.value)) continue;
    seen.add(item.value);
    out.push({ id: item.value, name: normalizeName(item.displayName) || item.value,
      resolvedModel: MODEL_ID_RE.test(item.resolvedModel || '') ? item.resolvedModel : item.value,
      efforts: item.supportsEffort === false ? [] : normalizeEffort(item.supportedEffortLevels) });
    if (out.length >= 100) break;
  }
  return out;
}
function resolveSelection(models, requested = {}, current = {}) {
  if (typeof requested.model !== 'string' || !MODEL_ID_RE.test(requested.model)) throw new Error('Choose a model offered by this account.');
  const selected = models?.find(x => x.available !== false && x.disabled !== true && x.id === requested.model)
    || models?.find(x => x.available !== false && x.disabled !== true && x.resolvedModel === requested.model);
  if (!selected || !MODEL_ID_RE.test(selected.id)) throw new Error('This model is not offered by this account. Refresh the choices.');
  const efforts = normalizeEffort(selected.efforts);
  let effort = requested.effort;
  if (effort === undefined) effort = efforts.includes(current.effort) ? current.effort : null;
  if (effort !== null && !efforts.includes(effort)) throw new Error('This effort level is not offered for the selected model. Refresh the choices.');
  return { model: selected.id, resolvedModel: selected.resolvedModel || selected.id, effort };
}
module.exports = { normalizeClaudeModels, resolveSelection };
