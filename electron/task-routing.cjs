'use strict';

const { pickReviewer } = require('./delegation.cjs');
const { validOpenCodeTaskModel } = require('./local-models.cjs');
const { names: workerNames } = require('./provider-workers.cjs');
const { FUNDING, accountFunding, fundingRank } = require('./account-funding.cjs');
const { selectModel } = require('./routing-models.cjs');
const defaults = {
  small: [{ accountId: 'codex:default', model: 'gpt-6.1-terra' }, { accountId: 'opencode:default', model: 'opencode-go/gpt-6-luna' }],
  medium: [{ accountId: 'codex:default', model: 'gpt-6.1-terra' }, { accountId: 'opencode:default', model: 'opencode-go/kimi-k3.1-pro' }],
  large: [{ accountId: 'codex:default', model: 'gpt-6.1-sol' }],
  defaultReviewer: { accountId: 'opencode:default', model: 'opencode-go/gpt-6-luna' }, claudeReviewsOnly: false, discoverAccounts: true, preferFree: true, accountFunding: {},
  excludedModels: ['opencode-go/qwen3.8-max', 'opencode-go/glm-5.3', 'opencode-go/minimax-m3', 'opencode/glm-5.3-flash-free', 'opencode/mimo-v2.6-flash-free']
};
const ROUTING_SCHEMA_VERSION = 2;
const modelPattern = /^[\w.:/-]{1,120}$/;
const accountPattern = /^(?:[a-z0-9-]{1,40}:[\w.-]{1,80}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
function modelFamily(model) {
  const name = String(model || '').toLowerCase().split('/').at(-1);
  if (/^(?:gpt|o\d|codex)(?:[-.]|$)/.test(name)) return 'openai';
  if (/^claude(?:[-.]|$)/.test(name)) return 'anthropic';
  if (/^kimi(?:[-.]|$)/.test(name)) return 'moonshot';
  if (/^qwen(?:[-.]|$)/.test(name)) return 'alibaba';
  if (/^(?:glm|chatglm)(?:[-.]|$)/.test(name)) return 'zhipu';
  if (/^minimax(?:[-.]|$)/.test(name)) return 'minimax';
  if (/^mimo(?:[-.]|$)/.test(name)) return 'xiaomi';
  if (/^deepseek(?:[-.]|$)/.test(name)) return 'deepseek';
  if (/^gemini(?:[-.]|$)/.test(name)) return 'google';
  if (/^grok(?:[-.]|$)/.test(name)) return 'xai';
  if (/^llama(?:[-.]|$)/.test(name)) return 'meta';
  return null;
}
const levelFromPool = { small: 'L1', medium: 'L2', large: 'L3' };
const poolFromLevel = { L1: 'small', L2: 'medium', L3: 'large' };
function looseAssignment(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.accountId !== 'string' || typeof item.model !== 'string') return null;
  if (!accountPattern.test(item.accountId) || !modelPattern.test(item.model) || item.model.startsWith('-')) return null;
  if (item.accountId.startsWith('opencode:') && !/^opencode-go\/[\w.-]+$|^opencode\/[\w.-]+-free$/.test(item.model)) return null;
  return { accountId: item.accountId, model: item.model };
}
function migrateRouting(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : defaults;
  const needsSetup = Array.isArray(source.needsSetup) ? source.needsSetup.filter(item => item && typeof item === 'object').slice(0, 100) : [];
  const noteSetup = (item, level, reason = 'Model family could not be identified.') => {
    if (!item || typeof item !== 'object') return;
    const record = { level, accountId: typeof item.accountId === 'string' ? item.accountId.slice(0, 120) : '', model: typeof item.model === 'string' ? item.model.slice(0, 120) : '', reason };
    if (!needsSetup.some(existing => existing.level === record.level && existing.accountId === record.accountId && existing.model === record.model)) needsSetup.push(record);
  };
  const pools = {};
  for (const size of ['small', 'medium', 'large']) {
    const configured = Array.isArray(source[size]) ? source[size] : (source.schemaVersion === ROUTING_SCHEMA_VERSION ? [] : defaults[size]);
    pools[size] = [];
    for (const item of configured.slice(0, 30)) {
      const assignment = looseAssignment(item);
      if (!assignment) { noteSetup(item, levelFromPool[size], 'Entry needs valid account and model settings.'); continue; }
      pools[size].push(assignment);
    }
  }
  const levels = {};
  for (const level of ['L1', 'L2', 'L3']) {
    const size = poolFromLevel[level], configured = source.schemaVersion === ROUTING_SCHEMA_VERSION && source.levels && Array.isArray(source.levels[level]) ? source.levels[level] : pools[size];
    levels[level] = [];
    for (const item of configured.slice(0, 30)) {
      const assignment = looseAssignment(item);
      if (!assignment) { noteSetup(item, level, 'Entry needs valid account and model settings.'); continue; }
      const family = typeof item.family === 'string' && /^[a-z0-9-]{1,40}$/.test(item.family) ? item.family : modelFamily(assignment.model);
      const entry = { ...assignment, family };
      if (!family || item.needsSetup === true) {
        entry.needsSetup = true;
        noteSetup(assignment, level, item.needsSetup ? 'Model family needs setup.' : 'Model family could not be identified.');
      }
      levels[level].push(entry);
    }
  }
  let defaultReviewer = null;
  if (source.defaultReviewer != null) {
    defaultReviewer = looseAssignment(source.defaultReviewer);
    if (!defaultReviewer) noteSetup(source.defaultReviewer, 'reviewer', 'Reviewer needs valid account and model settings.');
  }
  const excludedModels = Array.isArray(source.excludedModels) ? source.excludedModels.filter(model => typeof model === 'string' && modelPattern.test(model) && !model.startsWith('-')).slice(0, 100) : [...defaults.excludedModels];
  const claudeReviewsOnly = typeof source.claudeReviewsOnly === 'boolean' ? source.claudeReviewsOnly : defaults.claudeReviewsOnly;
  return validateRouting({
    ...pools, schemaVersion: ROUTING_SCHEMA_VERSION, levels, defaultReviewer, preferFree: source.preferFree !== false, accountFunding: source.accountFunding || {},
    discoverAccounts: typeof source.discoverAccounts === 'boolean' ? source.discoverAccounts : ['small', 'medium', 'large'].every(size => JSON.stringify(pools[size]) === JSON.stringify(defaults[size])),
    claudeReviewsOnly, excludedModels, needsSetup,
    // Retain the legacy role policy until ladder roles explicitly enable building.
    roles: source.schemaVersion === ROUTING_SCHEMA_VERSION && source.roles?.claude && typeof source.roles.claude.builder === 'boolean' && typeof source.roles.claude.reviewer === 'boolean'
      ? { claude: { ...source.roles.claude } } : { claude: { builder: !claudeReviewsOnly, reviewer: true } }
  });
}
function validateRouting(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter routing settings.');
  const assignment = item => {
    if (!item || typeof item.accountId !== 'string' || !accountPattern.test(item.accountId) || typeof item.model !== 'string' || !modelPattern.test(item.model) || item.model.startsWith('-') || (item.accountId.startsWith('opencode:') && !validOpenCodeTaskModel(item.accountId, item.model))) throw new Error('Enter a valid account and model.');
    return { accountId: item.accountId, model: item.model };
  };
  const result = {};
  for (const size of ['small', 'medium', 'large']) {
    if (!Array.isArray(value[size]) || value[size].length > 30) throw new Error('Enter an ordered list for each task size.');
    result[size] = value[size].map(assignment);
  }
  if (typeof value.claudeReviewsOnly !== 'boolean' || !Array.isArray(value.excludedModels) || value.excludedModels.length > 100 || value.excludedModels.some(model => typeof model !== 'string' || !modelPattern.test(model) || model.startsWith('-'))) throw new Error('Enter valid routing settings.');
  const levels = {};
  for (const level of ['L1', 'L2', 'L3']) {
    const entries = value.levels?.[level];
    const source = Array.isArray(entries) ? entries : result[poolFromLevel[level]];
    if (!Array.isArray(source) || source.length > 30) throw new Error('Enter an ordered model pool for each ladder level.');
    levels[level] = source.map(item => {
      const valid = assignment(item);
      const family = typeof item.family === 'string' && /^[a-z0-9-]{1,40}$/.test(item.family) ? item.family : modelFamily(valid.model);
      return { ...valid, family, ...(family && item.needsSetup !== true ? {} : { needsSetup: true }) };
    });
  }
  const roles = value.roles?.claude && typeof value.roles.claude.builder === 'boolean' && typeof value.roles.claude.reviewer === 'boolean'
    ? { claude: { builder: value.roles.claude.builder, reviewer: value.roles.claude.reviewer } }
    : { claude: { builder: !value.claudeReviewsOnly, reviewer: true } };
  const needsSetup = Array.isArray(value.needsSetup) ? value.needsSetup.filter(item => item && typeof item === 'object').slice(0, 100).map(item => ({ level: String(item.level || '').slice(0, 16), accountId: String(item.accountId || '').slice(0, 120), model: String(item.model || '').slice(0, 120), reason: String(item.reason || 'Needs setup.').slice(0, 200) })) : [];
  if (value.discoverAccounts !== undefined && typeof value.discoverAccounts !== 'boolean') throw new Error('Choose whether to discover available accounts.');
  if (value.preferFree !== undefined && typeof value.preferFree !== 'boolean') throw new Error('Choose whether to prefer free allowances.');
  const funding = value.accountFunding || {};
  if (typeof funding !== 'object' || Array.isArray(funding) || Object.keys(funding).length > 100 || Object.entries(funding).some(([id, kind]) => !/^[\w:.-]{1,120}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || !FUNDING.includes(kind))) throw new Error('Enter a valid funding type for each account.');
  return { ...result, schemaVersion: ROUTING_SCHEMA_VERSION, levels, roles, needsSetup, preferFree: value.preferFree !== false, accountFunding: { ...funding }, discoverAccounts: value.discoverAccounts ?? ['small', 'medium', 'large'].every(size => JSON.stringify(result[size]) === JSON.stringify(defaults[size])), defaultReviewer: value.defaultReviewer === null ? null : assignment(value.defaultReviewer), claudeReviewsOnly: value.claudeReviewsOnly, excludedModels: [...new Set(value.excludedModels)] };
}
function estimateEffort({ criteria = '', title = '' } = {}) {
  const text = `${title}\n${criteria}`, bullets = (criteria.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) || []).length, paths = (text.match(/\b[\w.-]+(?:\/[\w.-]+)+\b/g) || []).length;
  let score = 0; const reasons = [];
  if (criteria.length > 1200 || bullets >= 8) { score += 2; reasons.push('Many acceptance criteria.'); }
  else if (criteria.length > 400 || bullets >= 4) { score++; reasons.push('Several acceptance criteria.'); }
  if (/\b(refactor|migrate|migration|redesign|new page)\b/i.test(text)) { score += 2; reasons.push('The task describes a broad change.'); }
  if (paths >= 3) { score++; reasons.push('Several file paths are mentioned.'); }
  if (!reasons.length) reasons.push('Few scope signals in the description.');
  return { size: score >= 3 ? 'large' : score >= 1 ? 'medium' : 'small', reasons };
}
function accountAllowance(id, limits = [], now = Date.now()) {
    const readings = limits.filter(item => item.accountId === id && Number.isFinite(item.observedAt) && item.observedAt <= now);
    const invalidatedAt = Math.max(-Infinity, ...readings.filter(item => !Array.isArray(item.windows) || !item.windows.length || (item.usageCheck?.status && !['current', 'refreshing'].includes(item.usageCheck.status))).map(item => item.observedAt));
    const latest = new Map();
    for (const item of readings) for (const window of (Array.isArray(item.windows) ? item.windows : [])) {
      const key = window.key ?? `${window.label || ''}:${window.minutes ?? ''}`, before = latest.get(key);
      if (!before || before.observedAt < item.observedAt) latest.set(key, { ...window, observedAt: item.observedAt, checkStatus: item.usageCheck?.status });
      else if (before.observedAt === item.observedAt) {
        // Concurrent account snapshots must not become optimistic through order.
        const valid = value => Number.isFinite(value) && value >= 0 && value <= 100;
        before.usedPercent = valid(before.usedPercent) && valid(window.usedPercent) ? Math.max(before.usedPercent, window.usedPercent) : null;
        const check = item.usageCheck?.status;
        if (check && !['current', 'refreshing'].includes(check)) before.checkStatus = check;
      }
    }
    const windows = [...latest.values()].map(window => window.observedAt <= invalidatedAt ? { ...window, usedPercent: null, checkStatus: 'unknown' } : window), fresh = w => (!w.checkStatus || ['current', 'refreshing'].includes(w.checkStatus)) && now - w.observedAt <= 30 * 60_000 && Number.isFinite(w.usedPercent) && w.usedPercent >= 0 && w.usedPercent <= 100;
    const shortest = windows.sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity))[0];
    const status = !windows.length || windows.some(w => !Number.isFinite(w.usedPercent) || w.usedPercent < 0 || w.usedPercent > 100 || (w.checkStatus && !['current', 'refreshing'].includes(w.checkStatus))) ? 'unknown' : windows.some(w => !fresh(w)) ? 'stale' : 'current';
    const controlling = status === 'current' ? windows.reduce((a, b) => a.usedPercent >= b.usedPercent ? a : b) : null;
    return { status, observedAt: readings.length ? Math.max(...readings.map(r => r.observedAt)) : null, plan: readings.slice().sort((a, b) => b.observedAt - a.observedAt).find(r => r.plan)?.plan || null,
      blocked: windows.some(w => fresh(w) && w.usedPercent >= 100), shortest: shortest && fresh(shortest) ? shortest : null, controlling,
      remainingPercent: controlling ? 100 - controlling.usedPercent : null, windows };
}
function builderAllowed(candidate, rules) {
  return candidate.roles?.builder !== false && !(candidate.provider === 'claude' && (rules.claudeReviewsOnly || rules.roles?.claude?.builder === false));
}
function routingPool(size, candidates, rules, now = Date.now()) {
  const pool = [...(rules[size] || [])];
  // A specifically local pool stays local. Custom pools remain opt-in.
  if (!rules.discoverAccounts || (pool.length && pool.every(entry => entry.accountId === 'opencode:strata'))) return pool;
  // Refresh built-in defaults from the actual account catalog. Preserve custom
  // model selections; a named profile never inherits another account's models.
  for (let i = 0; i < pool.length; i++) {
    const entry = pool[i], candidate = candidates.find(c => c.id === entry.accountId);
    if (candidate && defaults[size]?.some(d => d.accountId === entry.accountId && d.model === entry.model)) {
      const selected = selectModel(candidate, { size, now, excluded: rules.excludedModels });
      if (selected.blocked) pool[i] = { ...entry, blocked: true };
      else if (selected.source !== 'account default') pool[i] = { ...entry, model: selected.model };
    }
  }
  if (['small', 'medium'].includes(size)) for (const candidate of candidates) {
    if (candidate.local && candidate.readiness === 'ready' && candidate.available === true && builderAllowed(candidate, rules) && validOpenCodeTaskModel(candidate.id, candidate.model)) {
      const prior = pool.findIndex(entry => entry.accountId === candidate.id);
      if (prior >= 0) pool.splice(prior, 1);
      pool.unshift({ accountId: candidate.id, model: candidate.model, discovered: true });
    }
  }
  for (const candidate of candidates) {
    if (candidate.local || pool.some(entry => entry.accountId === candidate.id) || !builderAllowed(candidate, rules)) continue;
    if (!(candidate.provider in workerNames) && candidate.provider !== 'opencode') continue;
    // Native launchers choose their own account-appropriate default. OpenCode
    // must keep an explicit Go/free route and cannot fall through to paid Zen.
    const selection = selectModel(candidate, { size, now, excluded: rules.excludedModels });
    if (selection.blocked) continue;
    const model = candidate.provider === 'opencode' ? candidate.model || defaults[size]?.find(entry => entry.accountId === 'opencode:default')?.model || defaults.defaultReviewer.model : selection.model;
    if (candidate.provider === 'opencode' && !validOpenCodeTaskModel(candidate.id, model)) continue;
    pool.push({ accountId: candidate.id, model, discovered: true });
  }
  return pool;
}
function suggestAssignment({ size, candidates = [], limits = [], rules = defaults, now = Date.now(), selectedImplementer, assignmentCounts = {}, preferDifferentVendor = false }) {
  const warnings = [], reasons = [], available = [];
  const room = id => accountAllowance(id, limits, now);
  for (const entry of routingPool(size, candidates, rules, now)) {
    if (entry.blocked) continue;
    const candidate = candidates.find(c => c.id === entry.accountId);
    if (!candidate || candidate.installed === false || candidate.signedIn === false || candidate.available === false || rules.excludedModels.includes(entry.model) || !builderAllowed(candidate, rules)) continue;
    const usage = room(entry.accountId); if (usage.blocked) continue;
    const route = candidate.models?.find(m => m.id === entry.model && m.available === true && Number.isFinite(m.observedAt) && m.observedAt <= now && now - m.observedAt <= 30 * 60_000);
    const funding = route?.funding || accountFunding(candidate, usage, rules);
    if (funding === 'metered') continue; // Metered accounts require an explicit task assignment.
    available.push({ ...entry, candidate, usage, funding });
  }
  const preferFree = rules.discoverAccounts && rules.preferFree !== false;
  const cloud = available.filter(item => !item.candidate.local);
  const bestFunding = Math.min(...cloud.map(item => fundingRank(item.funding)));
  const ranked = preferFree && cloud.length ? cloud.filter(item => fundingRank(item.funding) === bestFunding) : available;
  const measured = ranked.filter(item => item.usage.controlling);
  const bestUsed = measured.length ? Math.min(...measured.map(item => item.usage.controlling.usedPercent)) : null;
  const balanced = measured.filter(item => item.usage.controlling.usedPercent <= bestUsed + 10);
  const local = available.find(item => item.candidate.local && item.candidate.readiness === 'ready' && ['small', 'medium'].includes(size));
  const next = (measured.length ? balanced : ranked).reduce((choice, item) => {
    if (!choice) return item;
    const assigned = (assignmentCounts[item.accountId] || 0) - (assignmentCounts[choice.accountId] || 0);
    if (assigned !== 0) return assigned < 0 ? item : choice;
    // Prefer the most remaining allowance when both accounts have equal work.
    // The ten-point band is only for spreading concurrent independent portions.
    return (item.usage.controlling?.usedPercent ?? Infinity) < (choice.usage.controlling?.usedPercent ?? Infinity) ? item : choice;
  }, null);
  // Reserve local work first, then share independent portions with free accounts.
  // Queueing local work never implicitly authorizes included or metered overflow.
  const shareFree = local && preferFree && next?.funding === 'free' && (assignmentCounts[local.accountId] || 0) > (assignmentCounts[next.accountId] || 0);
  const best = local && !shareFree ? local : next;
  let implementer = null, reviewer = null;
  if (best) {
    implementer = { accountId: best.accountId, model: best.model };
    const w = best.usage.controlling, usage = w ? `${w.label || 'Limiting window'} ${Math.round(100 - w.usedPercent)}% left (checked ${Math.floor((now - w.observedAt) / 60000)} min ago)` : `usage ${best.usage.status}`;
    reasons.push(`${size[0].toUpperCase() + size.slice(1)} task. ${best.candidate.label} · ${best.model || 'account default model'}: ${available[0] === best ? 'first available choice' : 'more available headroom'}; ${usage}.`);
    if (best === local) reasons[0] = `${size[0].toUpperCase() + size.slice(1)} task. ${best.candidate.label}: running local model; bounded implementation first. Verify output once; no automatic cloud retry.`;
    else if (shareFree) reasons[0] += ' Local work already assigned; sharing an independent portion with a free account.';
    else if (preferFree && best.funding === 'free') reasons[0] += ' Free allocation preferred.';
    else if (balanced.length > 1 && Object.keys(assignmentCounts).length) reasons[0] += ' Work spread across accounts within 10 points of the best measured usage.';
  } else warnings.push('No preferred implementer is available.');
  const reviewBase = selectedImplementer ? candidates.find(c => c.id === selectedImplementer) : best?.candidate;
  let pool = candidates.filter(c => c.id !== reviewBase?.id && c.installed !== false && c.signedIn !== false && c.available !== false && c.roles?.reviewer !== false && !(c.provider === 'claude' && rules.roles?.claude?.reviewer === false) && !room(c.id).blocked && accountFunding(c, room(c.id), rules) !== 'metered');
  if (rules.discoverAccounts) pool = pool.filter(c => !selectModel(c, { role: 'reviewer', now, excluded: rules.excludedModels }).blocked ||
    (rules.defaultReviewer?.accountId === c.id && JSON.stringify(rules.defaultReviewer) !== JSON.stringify(defaults.defaultReviewer)));
  if (preferFree && pool.some(c => accountFunding(c, room(c.id), rules) === 'free')) pool = pool.filter(c => accountFunding(c, room(c.id), rules) === 'free');
  if (preferDifferentVendor && pool.some(c => c.provider !== reviewBase?.provider)) pool = pool.filter(c => c.provider !== reviewBase?.provider);
  const preferred = rules.defaultReviewer, match = preferred && pool.find(c => c.id === preferred.accountId);
  const discoveredReviews = rules.discoverAccounts ? pool.filter(c => !c.local).map(candidate => ({ candidate, selected: selectModel(candidate, { role: 'reviewer', size, now, excluded: rules.excludedModels }) })).filter(r => r.selected.tier !== null && r.selected.source !== 'account default') : [];
  const sufficientReviews = discoveredReviews.filter(item => item.selected.tier >= 2);
  const sufficient = (sufficientReviews.length ? sufficientReviews : discoveredReviews).sort((a, b) => a.selected.tier - b.selected.tier || (room(b.candidate.id).remainingPercent ?? -1) - (room(a.candidate.id).remainingPercent ?? -1))[0];
  const customReviewer = preferred && JSON.stringify(preferred) !== JSON.stringify(defaults.defaultReviewer);
  if (sufficient && !customReviewer) {
    reviewer = { accountId: sufficient.candidate.id, model: sufficient.selected.model };
    if (sufficient.selected.warning) warnings.push(sufficient.selected.warning);
    reasons.push(`${sufficient.candidate.label}: ${sufficient.selected.tier < 2 ? 'strongest available model below the preferred review tier' : 'smallest sufficient discovered review tier'}; model tiers are capability hints.`);
  }
  else if (match && !rules.excludedModels.includes(preferred.model)) { reviewer = { ...preferred }; reasons.push(`${match.label}: default reviewer.`); }
  else if (pool.length && reviewBase) {
    const openCodeModel = ['opencode-go/gpt-6-luna', 'opencode-go/kimi-k3.1-pro', 'opencode/mimo-v2.6-flash-free'].find(model => !rules.excludedModels.includes(model));
    const fallback = pool.filter(c => !c.local && (c.provider !== 'opencode' || openCodeModel));
    const different = fallback.filter(c => c.provider !== reviewBase.provider);
    const eligible = different.length ? different : preferDifferentVendor ? fallback : [];
    const nonClaude = eligible.filter(c => c.provider !== 'claude');
    if (eligible.length) { try { const picked = pickReviewer({ candidates: nonClaude.length ? nonClaude : eligible, limits, callerProvider: reviewBase.provider, now }); reviewer = { accountId: picked.choice.id, model: picked.choice.provider === 'opencode' ? openCodeModel : '' }; reasons.push(picked.why); } catch {} }
  }
  if (!reviewer) warnings.push('No independent reviewer is available.');
  return { implementer, reviewer, reasons, warnings };
}
module.exports = { defaults, ROUTING_SCHEMA_VERSION, modelFamily, migrateRouting, validateRouting, estimateEffort, suggestAssignment, accountAllowance, routingPool };
