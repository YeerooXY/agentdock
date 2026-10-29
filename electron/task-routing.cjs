'use strict';

const { pickReviewer } = require('./delegation.cjs');
const defaults = {
  small: [{ accountId: 'codex:default', model: 'gpt-6.1-terra' }, { accountId: 'opencode:default', model: 'opencode-go/gpt-6-luna' }],
  medium: [{ accountId: 'codex:default', model: 'gpt-6.1-terra' }, { accountId: 'opencode:default', model: 'opencode-go/kimi-k3.1-pro' }],
  large: [{ accountId: 'codex:default', model: 'gpt-6.1-sol' }],
  defaultReviewer: { accountId: 'opencode:default', model: 'opencode-go/gpt-6-luna' }, claudeReviewsOnly: true,
  excludedModels: ['opencode-go/qwen3.8-max', 'opencode-go/glm-5.3', 'opencode-go/minimax-m3', 'opencode/glm-5.3-flash-free', 'opencode/mimo-v2.6-flash-free']
};
const modelPattern = /^[\w.:/-]{1,120}$/;
function validateRouting(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter routing settings.');
  const assignment = item => {
    if (!item || typeof item.accountId !== 'string' || !/^[a-z0-9-]{1,40}:[\w.-]{1,80}$/i.test(item.accountId) || typeof item.model !== 'string' || !modelPattern.test(item.model) || item.model.startsWith('-') || (item.accountId.startsWith('opencode:') && !/^opencode-go\/[\w.-]+$|^opencode\/[\w.-]+-free$/.test(item.model))) throw new Error('Enter a valid account and model.');
    return { accountId: item.accountId, model: item.model };
  };
  const result = {};
  for (const size of ['small', 'medium', 'large']) {
    if (!Array.isArray(value[size]) || value[size].length > 30) throw new Error('Enter an ordered list for each task size.');
    result[size] = value[size].map(assignment);
  }
  if (typeof value.claudeReviewsOnly !== 'boolean' || !Array.isArray(value.excludedModels) || value.excludedModels.length > 100 || value.excludedModels.some(model => typeof model !== 'string' || !modelPattern.test(model) || model.startsWith('-'))) throw new Error('Enter valid routing settings.');
  return { ...result, defaultReviewer: value.defaultReviewer === null ? null : assignment(value.defaultReviewer), claudeReviewsOnly: value.claudeReviewsOnly, excludedModels: [...new Set(value.excludedModels)] };
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
function suggestAssignment({ size, candidates = [], limits = [], rules = defaults, now = Date.now(), selectedImplementer, assignmentCounts = {}, preferDifferentVendor = false }) {
  const warnings = [], reasons = [], available = [];
  const room = id => {
    const readings = limits.filter(item => item.accountId === id && Number.isFinite(item.observedAt) && item.observedAt <= now);
    const latest = new Map();
    for (const item of readings) for (const window of (Array.isArray(item.windows) ? item.windows : [])) {
      const key = window.key ?? `${window.label || ''}:${window.minutes ?? ''}`, before = latest.get(key);
      if (!before || before.observedAt < item.observedAt) latest.set(key, { ...window, observedAt: item.observedAt });
    }
    const windows = [...latest.values()], fresh = w => now - w.observedAt <= 30 * 60_000 && Number.isFinite(w.usedPercent) && w.usedPercent >= 0 && w.usedPercent <= 100;
    const shortest = windows.sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity))[0];
    return { blocked: windows.some(w => fresh(w) && w.usedPercent >= 90), shortest: shortest && fresh(shortest) ? shortest : null };
  };
  for (const entry of rules[size] || []) {
    const candidate = candidates.find(c => c.id === entry.accountId);
    if (!candidate || candidate.installed === false || candidate.signedIn === false || rules.excludedModels.includes(entry.model) || (rules.claudeReviewsOnly && candidate.provider === 'claude')) continue;
    const usage = room(entry.accountId); if (usage.blocked) continue;
    available.push({ ...entry, candidate, usage });
  }
  const measured = available.filter(item => item.usage.shortest);
  const bestUsed = measured.length ? Math.min(...measured.map(item => item.usage.shortest.usedPercent)) : null;
  const balanced = measured.filter(item => item.usage.shortest.usedPercent <= bestUsed + 10);
  const best = measured.length ? balanced.reduce((choice, item) => (assignmentCounts[item.accountId] || 0) < (assignmentCounts[choice.accountId] || 0) ? item : choice) : available[0];
  let implementer = null, reviewer = null;
  if (best) {
    implementer = { accountId: best.accountId, model: best.model };
    const w = best.usage.shortest, usage = w ? `${w.label || 'Shortest window'} ${Math.round(100 - w.usedPercent)}% left (checked ${Math.floor((now - w.observedAt) / 60000)} min ago)` : 'usage unknown';
    reasons.push(`${size[0].toUpperCase() + size.slice(1)} task. ${best.candidate.label} · ${best.model}: ${available[0] === best ? 'first available choice' : 'more available headroom'}; ${usage}.`);
    if (balanced.length > 1 && Object.keys(assignmentCounts).length) reasons[0] += ' Work spread across accounts within 10 points of the best measured usage.';
  } else warnings.push('No preferred implementer is available.');
  const reviewBase = selectedImplementer ? candidates.find(c => c.id === selectedImplementer) : best?.candidate;
  let pool = candidates.filter(c => c.id !== reviewBase?.id && c.installed !== false && c.signedIn !== false && !room(c.id).blocked);
  if (preferDifferentVendor && pool.some(c => c.provider !== reviewBase?.provider)) pool = pool.filter(c => c.provider !== reviewBase?.provider);
  const preferred = rules.defaultReviewer, match = preferred && pool.find(c => c.id === preferred.accountId);
  if (match && !rules.excludedModels.includes(preferred.model)) { reviewer = { ...preferred }; reasons.push(`${match.label}: default reviewer.`); }
  else if (pool.length && reviewBase) {
    const openCodeModel = ['opencode-go/gpt-6-luna', 'opencode-go/kimi-k3.1-pro', 'opencode/mimo-v2.6-flash-free'].find(model => !rules.excludedModels.includes(model));
    const different = pool.filter(c => c.provider !== reviewBase.provider && (c.provider !== 'opencode' || openCodeModel));
    const eligible = different.length ? different : preferDifferentVendor ? pool.filter(c => c.provider !== 'opencode' || openCodeModel) : [];
    const nonClaude = eligible.filter(c => c.provider !== 'claude');
    if (eligible.length) { try { const picked = pickReviewer({ candidates: nonClaude.length ? nonClaude : eligible, limits, callerProvider: reviewBase.provider, now }); reviewer = { accountId: picked.choice.id, model: picked.choice.provider === 'opencode' ? openCodeModel : '' }; reasons.push(picked.why); } catch {} }
  }
  if (!reviewer) warnings.push('No independent reviewer is available.');
  return { implementer, reviewer, reasons, warnings };
}
module.exports = { defaults, validateRouting, estimateEffort, suggestAssignment };
