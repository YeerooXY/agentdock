'use strict';

// Keep this list tied to native command surfaces. It describes what Paddock can
// request, not an effort level a provider has confirmed it used.
const PROVIDERS = Object.freeze({
  codex: Object.freeze({ label: 'Codex reasoning effort', levels: Object.freeze(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']),
    dispatch: effort => ({ requested: effort, method: 'config', key: 'model_reasoning_effort', value: effort }) }),
  claude: Object.freeze({ label: 'Claude effort', levels: Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']),
    dispatch: effort => ({ requested: effort, method: 'flag', flag: '--effort', value: effort }) }),
  pi: Object.freeze({ label: 'Pi thinking effort', levels: Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
    dispatch: effort => ({ requested: effort, method: 'sdk', key: 'thinkingLevel', value: effort }) }),
  opencode: Object.freeze({ label: 'OpenCode effort variant', levels: Object.freeze(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
    dispatch: effort => ({ requested: effort, method: 'flag', flag: '--variant', value: effort }) }),
  copilot: Object.freeze({ label: 'Copilot reasoning effort', levels: Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']),
    dispatch: effort => ({ requested: effort, method: 'flag', flag: '--reasoning-effort', value: effort }) }),
  grok: Object.freeze({ label: 'Grok reasoning effort', levels: Object.freeze(['low', 'medium', 'high']),
    dispatch: effort => ({ requested: effort, method: 'flag', flag: '--reasoning-effort', value: effort }) })
});

const allEfforts = Object.freeze([...new Set(Object.values(PROVIDERS).flatMap(item => item.levels))]);
function capability(provider) { return PROVIDERS[provider] || { label: `${provider || 'This provider'} effort`, levels: [] }; }
function levels(provider) { return [...capability(provider).levels]; }
function validateEffort(provider, value, { model, models } = {}) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new Error('Choose an effort setting or leave it blank for the provider default.');
  const effort = value.trim(), supported = levels(provider);
  if (!supported.length) throw new Error(`${capability(provider).label} is not available for this provider. Leave effort blank to use its native default.`);
  if (!supported.includes(effort)) throw new Error(`Choose a supported ${capability(provider).label}: ${supported.join(', ')}.`);
  const discovered = models?.find(item => item.id === model);
  if (Array.isArray(discovered?.efforts) && !discovered.efforts.includes(effort)) throw new Error(`The selected model does not support effort ${effort}. Choose ${discovered.efforts.join(', ')}.`);
  return effort;
}
function dispatch(provider, effort) {
  if (!effort) return { requested: null, status: 'native-default' };
  const item = capability(provider);
  if (!item.dispatch) throw new Error(`${item.label} is not available for this provider. Leave effort blank to use its native default.`);
  return { ...item.dispatch(effort), status: 'requested' };
}
function launchArgs(provider, effort) {
  const requested = validateEffort(provider, effort);
  const evidence = dispatch(provider, requested);
  if (!requested) return { args: [], evidence };
  if (evidence.method === 'flag') return { args: [evidence.flag, evidence.value], evidence };
  if (evidence.method === 'config') return { args: ['-c', `${evidence.key}="${evidence.value}"`], evidence };
  return { args: [], evidence };
}

module.exports = { PROVIDERS, allEfforts, capability, levels, validateEffort, dispatch, launchArgs };
