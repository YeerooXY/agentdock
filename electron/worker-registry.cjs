'use strict';

// Headless ladder routing. The caller owns dispatch and supplies a fresh snapshot
// of active work, including owner work; this module never opens or stops consoles.
const { modelFamily } = require('./task-routing.cjs');
const FRESH_MS = 30 * 60_000;
const LEVELS = new Set(['L1', 'L2', 'L3']);
const STRATA_URL = 'http://127.0.0.1:8080/v1';

function workerRegistry({ workers = [], excludedModels = [], claudeRoles = { builder: true, reviewer: true } } = {}) {
  if (!Array.isArray(workers)) throw new Error('Workers must be a list.');
  const ids = new Set();
  return workers.map((raw) => {
    if (!raw || typeof raw.id !== 'string' || !raw.id || ids.has(raw.id) || typeof raw.accountId !== 'string' || !raw.accountId || typeof raw.launcher !== 'string' || !raw.launcher || typeof raw.model !== 'string' || !raw.model || typeof raw.quotaGroupId !== 'string' || !raw.quotaGroupId || !LEVELS.has(raw.level) || !Number.isInteger(raw.concurrency) || raw.concurrency < 1 || !Number.isInteger(raw.unknownAllowance) || raw.unknownAllowance < 0 || raw.unknownAllowance > raw.concurrency) throw new Error('Enter a valid worker definition.');
    ids.add(raw.id);
    const inferred = modelFamily(raw.model);
    // Recognizable upstream models cannot be relabelled as a local family.
    const family = inferred || (typeof raw.family === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.family) ? raw.family : null);
    const roles = { builder: raw.roles?.builder === true, reviewer: raw.roles?.reviewer === true };
    if (raw.launcher === 'claude') { roles.builder &&= claudeRoles.builder === true; roles.reviewer &&= claudeRoles.reviewer === true; }
    return {
      id: raw.id, accountId: raw.accountId, launcher: raw.launcher, model: raw.model, family,
      level: raw.level, quotaGroupId: raw.quotaGroupId, concurrency: raw.concurrency,
      unknownAllowance: raw.unknownAllowance, roles, canEdit: raw.canEdit === true,
      available: raw.available !== false && !excludedModels.includes(raw.model),
      needsSetup: !family || (!inferred && raw.familyConfirmed !== true) || raw.needsSetup === true,
      local: raw.local === true, endpoint: raw.local === true ? (raw.endpoint || STRATA_URL) : null,
      cost: Number.isFinite(raw.cost) && raw.cost >= 0 ? raw.cost : null
    };
  });
}

// Turn the migrated ladder pools and currently available accounts into worker
// definitions. Quota mappings are explicit: unrelated accounts do not share a
// budget merely because they use the same launcher.
function registryFromRouting({ routing, candidates = [], profiles = {} }) {
  const definitions = [];
  for (const level of LEVELS) for (const [index, entry] of (routing.levels?.[level] || []).entries()) {
    const account = candidates.find(candidate => candidate.id === entry.accountId);
    const profile = profiles[entry.accountId] || {};
    definitions.push({ id: `${level}:${index}:${entry.accountId}:${entry.model}`, accountId: entry.accountId,
      launcher: account?.provider || entry.accountId.split(':')[0], model: entry.model, family: entry.family,
      familyConfirmed: !!entry.family && profile.confirmedFamilies?.[entry.model] === entry.family,
      level, quotaGroupId: profile.quotaGroupId || entry.accountId, concurrency: profile.concurrency ?? 1,
      unknownAllowance: profile.unknownAllowance ?? 1, roles: { builder: true, reviewer: true }, canEdit: true,
      available: !!account && account.installed !== false && account.signedIn !== false,
      needsSetup: entry.needsSetup === true, local: profile.local === true, endpoint: profile.endpoint, cost: profile.cost });
  }
  return workerRegistry({ workers: definitions, excludedModels: routing.excludedModels || [], claudeRoles: routing.roles?.claude || { builder: !routing.claudeReviewsOnly, reviewer: true } });
}

// A newer missing value supersedes an older reading. Keep every stale/unknown
// window visible, and apply the conservative allowance if any window is unknown.
function groupHeadroom(limits, accountIds, now = Date.now()) {
  const latest = new Map();
  for (const reading of limits || []) {
    if (!accountIds.includes(reading.accountId) || !Number.isFinite(reading.observedAt) || reading.observedAt > now) continue;
    for (const window of Array.isArray(reading.windows) ? reading.windows : []) {
      const key = JSON.stringify([reading.accountId, window.key ?? `${window.label || ''}:${window.minutes ?? ''}`]);
      const prior = latest.get(key);
      if (!prior || reading.observedAt > prior.observedAt || (reading.observedAt === prior.observedAt && (!Number.isFinite(window.usedPercent) || window.usedPercent > prior.usedPercent))) latest.set(key, { ...window, accountId: reading.accountId, observedAt: reading.observedAt });
    }
  }
  const windows = [...latest.values()].map(window => {
    const valid = Number.isFinite(window.usedPercent) && window.usedPercent >= 0 && window.usedPercent <= 100;
    const status = !valid ? 'unknown' : now - window.observedAt > FRESH_MS ? 'stale' : 'fresh';
    return { ...window, status };
  });
  const fresh = windows.filter(window => window.status === 'fresh');
  return { status: !windows.length || accountIds.some(id => !windows.some(window => window.accountId === id)) || windows.some(window => window.status === 'unknown') ? 'unknown' : windows.some(window => window.status === 'stale') ? 'stale' : 'fresh',
    left: fresh.length ? Math.min(...fresh.map(window => 100 - window.usedPercent)) : null,
    blocked: fresh.some(window => window.usedPercent >= 90), windows };
}

function routeWorker({ workers, role = 'builder', level, builderFamily, limits = [], active = [], now = Date.now(), rotation = 0 } = {}) {
  if (!Array.isArray(workers) || !Array.isArray(active) || !['builder', 'reviewer'].includes(role) || (role === 'builder' && !LEVELS.has(level))) throw new Error('Enter valid routing inputs.');
  if (role === 'reviewer' && !builderFamily) return { worker: null, reason: 'Needs family setup' };
  const eligible = workers.filter(w => w.available && w.roles[role] && (role !== 'builder' || (w.level === level && w.canEdit)));
  const known = eligible.filter(w => !w.needsSetup && w.family && (role !== 'reviewer' || w.family !== builderFamily));
  if (!known.length) return { worker: null, reason: eligible.some(w => w.needsSetup || !w.family) ? 'Needs family setup' : role === 'reviewer' ? 'Waiting for reviewer' : 'No eligible worker' };
  const available = [];
  for (const worker of known) {
    const group = workers.filter(w => w.quotaGroupId === worker.quotaGroupId);
    const availableGroup = group.filter(w => w.available);
    const accountIds = [...new Set(group.map(w => w.accountId))];
    const usage = worker.local ? { status: 'machine', left: null, blocked: false, windows: [] } : groupHeadroom(limits, accountIds, now);
    const occupied = active.filter(turn => turn.quotaGroupId === worker.quotaGroupId).length;
    const capacity = Math.min(...availableGroup.map(w => w.concurrency), ...(availableGroup.some(w => w.local) ? [1] : []));
    const allowance = usage.status === 'fresh' || usage.status === 'machine' ? capacity : Math.min(capacity, ...availableGroup.map(w => w.unknownAllowance));
    if (usage.blocked || occupied >= allowance) continue;
    // The machine-wide local-model limit applies across quota groups.
    if (worker.local && active.some(turn => turn.local === true || workers.some(w => w.id === turn.workerId && w.local))) continue;
    available.push({ worker, usage, occupied, capacity: allowance });
  }
  if (!available.length) return { worker: null, reason: 'Waiting for capacity' };
  // Unknown/stale groups remain eligible only under their configured allowance;
  // prefer a measured group when one is available.
  let qualified = available;
  if (role === 'reviewer') {
    const priced = qualified.filter(item => item.worker.cost !== null);
    if (priced.length) { const cheapest = Math.min(...priced.map(item => item.worker.cost)); qualified = priced.filter(item => item.worker.cost === cheapest); }
  }
  const measured = qualified.filter(item => item.usage.left !== null && item.usage.status === 'fresh');
  const pool = measured.length ? measured : qualified;
  const best = measured.length ? Math.max(...pool.map(item => item.usage.left)) : null;
  let choices = best === null ? pool : pool.filter(item => item.usage.left >= best - 10);
  const least = Math.min(...choices.map(item => item.occupied));
  choices = choices.filter(item => item.occupied === least);
  const index = ((Number.isInteger(rotation) ? rotation : 0) % choices.length + choices.length) % choices.length;
  return { ...choices[index], reason: null, ...(role === 'reviewer' ? { unpricedReviewers: available.filter(item => item.worker.cost === null).map(item => item.worker.id) } : {}) };
}

// Refresh is supplied by the caller and may use mocked or existing usage services.
async function refreshAndRoute(options, refresh) {
  let limits = options.limits;
  if (typeof refresh === 'function') {
    try { limits = await refresh(); } catch { /* Keep the last readings and their original timestamps. */ }
  }
  return routeWorker({ ...options, limits });
}

module.exports = { workerRegistry, registryFromRouting, groupHeadroom, routeWorker, refreshAndRoute, STRATA_URL, FRESH_MS };
