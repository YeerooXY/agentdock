const known = window => !window.unlimited && typeof window.usedPercent === 'number' && Number.isFinite(window.usedPercent) && window.usedPercent >= 0 && window.usedPercent <= 100;
const tightest = windows => windows.filter(known).reduce((selected, window) => !selected || window.usedPercent > selected.usedPercent ? window : selected, null);

export function quotaState(provider, windows = []) {
  // A model-specific allowance does not exhaust the whole Claude account.
  const shared = ['codex', 'claude'].includes(provider)
    ? windows.filter(w => !w.modelGroup && !/^model-|^seven_day_(?:opus|sonnet|oauth_apps)$/.test(w.key || ''))
    : windows;
  const groups = new Map();
  for (const window of shared) {
    const group = window.modelGroup || (provider === 'copilot' ? window.key : null) || 'account';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(window);
  }
  const groupLimits = [...groups.values()].map(tightest);
  const primary = (provider === 'copilot' ? shared.find(w => w.key === 'chat') || shared.find(w => w.key === 'premium_interactions') : null)
    || groupLimits[0] || shared.find(w => w.unlimited) || shared[0];
  return { primary, exhausted: groupLimits.length > 0 && groupLimits.every(w => w && w.usedPercent === 100) };
}
