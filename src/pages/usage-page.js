// Usage page: one row per account with its limits, plus the API ledger.
// Status, staleness and readings come from the server's usageChecks[];
// nothing here decides whether a reading is fresh.
import { escapeHtml as escape } from '../html-escape.js';
import { accountIdentity, accountMark, remainingPercent } from '../account-identity.js';
import { quotaState } from '../quota-state.js';
import { usageAnalytics } from '../usage-analytics.js';
import { icon } from '../ui/icons.js';
import { number, windowLabel, pageHeading } from '../ui/format.js';
import { limitAccountId } from '../ui/providers.js';

const USAGE_STATUS = {
  refreshing: 'Checking', stale: 'Stale', 'sign-in': 'Sign in needed', 'missing-key': 'Add key', 'not-installed': 'Not installed',
  unsupported: 'Unsupported', limited: 'Try later', timeout: 'Timed out', unavailable: 'Unavailable',
  'not-isolated': 'Not isolated', 'no-quota': 'No quota', inactive: 'Other account open'
};
const STALE_WHY = { 'check-failed': 'The last check failed.', 'no-observation': 'No reading time.', 'reset-passed': 'A reset time has passed.', old: 'Older than five minutes.' };
function usageStatusLabel(check) {
  if (!check) return 'Not checked';
  // A check in progress shows on the "Last refreshed" line, not as a chip.
  if (check.status === 'current' || check.status === 'refreshing') return '';
  if (check.status === 'unsupported' && check.reason === 'no-source') return 'No quota source';
  return USAGE_STATUS[check.status] || 'Not checked';
}
// Durations read "1d 13h", "5h 1m" or "12m": no zero units, no leading zeros.
// Time until a reset rounds up; time since a reading rounds down.
function usageSpan(ms, round = Math.ceil) {
  const total = Math.max(1, round(ms / 60000)), d = Math.floor(total / 1440), h = Math.floor(total % 1440 / 60), m = total % 60;
  return d ? (h ? `${d}d ${h}h` : `${d}d`) : h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
function readAge(at) {
  const ms = Date.now() - at;
  return ms < 60000 ? 'just now' : `${usageSpan(ms, Math.floor)} ago`;
}
// Every limit names when it resets. Without a reported time, an untouched
// window resets one full window after first use.
function usageResetText(w) {
  if (w.unlimited) return 'No limit';
  if (Number.isFinite(w.resetsAt)) return w.resetsAt > Date.now() ? `Resets in ${usageSpan(w.resetsAt - Date.now())}` : 'Reset passed, refresh needed';
  if (w.resetLabel) return w.resetLabel;
  if (Number.isFinite(w.minutes) && w.minutes > 0) return `Resets in ${usageSpan(w.minutes * 60000)}`;
  return 'Reset time unknown';
}
function usageWindowRow(w, display) {
  const left = w.unlimited ? null : remainingPercent(w.usedPercent), known = left !== null;
  const label = w.notApplicable ? 'Not applicable' : w.unlimited ? 'Unlimited' : known ? `${number(left)}% left` : 'Unknown', name = w.label || windowLabel(w.minutes);
  const credits = Number.isFinite(w.used) && Number.isFinite(w.total) ? `${w.used} of ${w.total} ${w.unit || 'credits'} used` : '';
  return `<div class="usage-window ${known && left === 0 ? 'usage-window-empty' : ''}"><div class="usage-window-name"><span>${escape(name)}</span><small class="reset">${escape([usageResetText(w), credits].filter(Boolean).join(', '))}</small></div>${w.unlimited || w.notApplicable ? '<span class="usage-window-unlimited"></span>' : `<div class="meter ${known ? left <= 10 ? 'warning' : '' : 'unknown'}" role="progressbar" aria-label="${escape(display)} ${escape(name)} remaining" ${known ? `aria-valuenow="${left}"` : ''} aria-valuetext="${escape(label)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${left ?? 0}%"></span></div>`}<strong class="usage-window-value">${escape(label)}</strong></div>`;
}

export function usagePage({ getState, call, toast, providerName, renderPage, openNewAccount }) {
  let addOpen = false, period = 30, metric = 'requests';
  const $ = selector => document.querySelector(selector);

  function usageRow(account, check, fallback) {
    const provider = account.provider, display = providerName(provider);
    const readings = Array.isArray(check?.lastReadings) && check.lastReadings.length ? check.lastReadings : fallback;
    const windows = readings.flatMap(reading => Array.isArray(reading.windows) ? reading.windows : []);
    windows.sort((a, b) => (remainingPercent(a.usedPercent) ?? 101) - (remainingPercent(b.usedPercent) ?? 101));
    const plan = readings.find(reading => reading.plan)?.plan;
    const stale = check?.stale === true, status = usageStatusLabel(check);
    const message = check?.message || (provider === 'opencode' ? 'Add an OpenCode key in Settings to check account limits.' : 'Refresh to check account usage.');
    const shown = windows.slice(0, 4), more = windows.slice(4);
    const observedAt = check?.observedAt || readings[0]?.observedAt;
    const reason = stale ? check.failure === 'inactive' ? check.message : [STALE_WHY[check.staleReason], check.failure ? `${USAGE_STATUS[check.failure] || check.failure}.` : ''].filter(Boolean).join(' ') : '';
    const name = account.label && account.label !== display && !/^Default\s/i.test(account.label) ? account.label : display;
    // Exhausting one model pool must leave the other model pools readable.
    const spent = windows.filter(w => !w.unlimited && remainingPercent(w.usedPercent) === 0);
    const exhausted = quotaState(provider, windows).exhausted;
    const nextReset = spent.map(w => w.resetsAt).filter(at => Number.isFinite(at) && at > Date.now()).sort((a, b) => a - b)[0];
    const spentNote = exhausted ? `<div class="usage-next-reset" role="status">${nextReset ? `Next reset in: ${escape(usageSpan(nextReset - Date.now()))}` : 'Allowance used'}</div>` : '';
    return `<article class="usage-row ${stale ? 'usage-row-stale' : ''} ${exhausted ? 'usage-row-spent' : ''}" data-usage-provider="${escape(provider)}" data-usage-account-id="${escape(account.id)}" aria-label="${escape(name)}" style="--provider-accent:${accountIdentity(provider).color}">
    <div class="usage-row-id"><span class="usage-age">${check?.checking || check?.status === 'refreshing' ? 'Checking now' : observedAt ? `Last refreshed: ${escape(readAge(observedAt))}` : check?.checkedAt ? `Last checked: ${escape(readAge(check.checkedAt))}` : 'Not checked yet'}</span><div class="usage-row-name">${accountMark(provider)}<div><strong>${escape(name)}</strong>${plan ? `<span class="plan">${escape(plan)}</span>` : ''}</div></div>${status ? `<span class="usage-status" data-status="${escape(check?.status || 'unchecked')}" role="status">${escape(status)}</span>` : ''}${reason ? `<span class="usage-stale-why">${escape(reason)}</span>` : ''}</div>
    <div class="usage-row-windows">${shown.length ? shown.map(w => usageWindowRow(w, display)).join('') : `<p class="usage-row-note">${escape(message)}</p>`}${more.length ? `<details class="usage-more" data-key="more-${escape(account.id)}"><summary>More limits (${more.length})</summary>${more.map(w => usageWindowRow(w, display)).join('')}</details>` : ''}${windows.length && check?.message && !stale ? `<p class="usage-row-note" role="status">${escape(check.message)}</p>` : ''}${spentNote}</div>
    ${provider === 'opencode' ? `<p class="section-note quota-local-usage">Used on this PC (last 7 days): ${check?.localSpending?.week ? `$${check.localSpending.week.cost.toFixed(2)}, ${number(check.localSpending.week.input)} input, ${number(check.localSpending.week.output)} output, ${number(check.localSpending.week.cacheRead)} cache read tokens` : 'Unavailable'}</p>` : ''}
  </article>`;
  }

  function ledgerTable() {
    const state = getState();
    return state.ledger.length ? `<div class="table-scroll"><table><thead><tr><th>Time</th><th>Provider / model</th><th>Input</th><th>Output</th><th>Status</th></tr></thead><tbody>${state.ledger.slice(0, 100).map(row => `<tr><td>${new Date(row.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td><strong class="ledger-provider">${accountMark(row.provider)}${escape(providerName(row.provider))}</strong><small>${escape(row.model)}</small></td><td class="mono">${number(row.usage?.input)}</td><td class="mono">${number(row.usage?.output)}</td><td><span class="ledger-status ${row.status}">${escape(row.status)}</span></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-ledger"><span class="empty-illustration">${icon('chart')}</span><h3>No API requests yet</h3><p>Requests made through Paddock appear here.</p></div>`;
  }
  function renderAnalytics() {
    const data = usageAnalytics(getState().ledger || [], period), values = data.points.map(point => point[metric]);
    const measuredTokens = group => group.unknownUsage && !group.tokens ? '—' : number(group.tokens) + (group.unknownUsage ? '+' : '');
    const maximum = Math.max(1, ...values), height = 125, width = 680;
    const points = values.map((value, index) => `${index * width / Math.max(1, values.length - 1)},${height - value / maximum * (height - 12)}`).join(' ');
    const metricName = metric === 'tokens' ? 'Reported tokens' : 'API requests';
    const date = at => new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `<section class="surface usage-analytics"><header class="section-label"><div><h2>API ledger &amp; analytics</h2><p>Requests recorded by Paddock.</p></div><div class="usage-analytics-controls"><select data-usage-period aria-label="API activity period">${[7,30,90].map(days => `<option value="${days}" ${days === period ? 'selected' : ''}>Last ${days} days</option>`).join('')}</select><button class="secondary" data-action="export">${icon('arrow')}Export</button></div></header>
    <div class="usage-stat-grid"><div><span>API requests</span><strong>${number(data.requests)}</strong></div><div><span>Cloud API tokens</span><strong>${measuredTokens(data.cloud)}</strong></div><div><span>Local tokens</span><strong>${measuredTokens(data.local)}</strong></div><div><span>Average request time</span><strong>${data.averageMs === null ? '—' : (data.averageMs / 1000).toFixed(1) + 's'}</strong></div><div><span>Failed requests</span><strong>${number(data.failed)}</strong></div></div>
    <div class="usage-chart-grid"><section class="usage-chart"><header><h3>${metricName}</h3><div class="usage-metric-toggle">${['requests','tokens'].map(item => `<button type="button" data-usage-metric="${item}" aria-pressed="${metric === item}">${item === 'requests' ? 'Requests' : 'Tokens'}</button>`).join('')}</div></header>${data.requests ? `<svg viewBox="0 0 ${width} ${height + 4}" role="img" aria-label="${metricName} over the last ${period} days. Highest daily count: ${number(Math.max(...values))}."><defs><linearGradient id="usage-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent-blue)" stop-opacity=".45"/><stop offset="1" stop-color="var(--accent-pink)" stop-opacity="0"/></linearGradient></defs>${[0, .5, 1].map(y => `<path class="usage-chart-gridline" d="M0 ${height * y}H${width}"/>`).join('')}<polygon points="0,${height} ${points} ${width},${height}" fill="url(#usage-chart-fill)"/><polyline points="${points}" fill="none" stroke="var(--accent-blue)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg><div class="usage-chart-dates"><span>${date(data.points[0].at)}</span><span>${date(data.points[Math.floor(data.points.length / 2)].at)}</span><span>${date(Date.now())}</span></div>` : '<p class="usage-chart-empty">No API requests in this period.</p>'}</section>
    <section class="usage-provider-chart"><h3>Requests by provider</h3>${data.providers.length ? data.providers.slice(0,6).map(item => `<div class="usage-provider-bar"><span>${accountMark(item.provider)}${escape(providerName(item.provider))}</span><div><i style="width:${100 * item.requests / data.requests}%"></i></div><strong>${number(item.requests)}</strong></div>`).join('') : '<p class="usage-chart-empty">No recorded providers.</p>'}</section></div>
    ${data.unknownUsage ? `<p class="field-hint">Token usage was not reported for ${data.unknownUsage} request${data.unknownUsage === 1 ? '' : 's'}.</p>` : ''}${data.measured < data.requests ? `<p class="field-hint">Request time is available for ${data.measured} of ${data.requests} records.</p>` : ''}
    <details class="usage-ledger-details"><summary>Request log</summary>${ledgerTable()}<p class="ledger-foot">Latest 100 records shown. Export includes all records. Tool steps count as separate requests.</p></details></section>`;
  }

  function render() {
    const state = getState();
    const known = new Set((state.accounts || []).map(account => account.id));
    const subscriptions = [...(state.usageAccounts || state.accounts || [])].filter(account => !state.accounts || known.has(account.id) || account.id === `${account.provider}:default`).sort((a,b) => Number(!!(b.hasUsage || state.limits.some(x => (x.accountId || x.id) === b.id))) - Number(!!(a.hasUsage || state.limits.some(x => (x.accountId || x.id) === a.id))));
    const limitOnly = state.limits.filter(entry => entry.provider !== 'opencode' && limitAccountId(entry) === `${entry.provider}:default` && !subscriptions.some(account => account.id === limitAccountId(entry))).map(entry => ({ id: limitAccountId(entry), provider: entry.provider, label: entry.name || providerName(entry.provider), hasUsage: true }));
    const hidden = new Set(state.settings.usageHidden || []), shown = new Set(state.settings.usageShown || []);
    for (const id of new Set([...hidden, ...shown])) if (![...subscriptions, ...limitOnly].some(account => account.id === id)) { const provider = id.split(':')[0]; if (id === `${provider}:default`) subscriptions.push({ id, provider, label: providerName(provider) }); }
    const listed = [...subscriptions, ...limitOnly], visible = listed.filter(account => !hidden.has(account.id) && (account.hasUsage || account.inUse || shown.has(account.id)));
    const groups = new Map(); for (const account of visible) { if (!groups.has(account.provider)) groups.set(account.provider, []); groups.get(account.provider).push(account); }
    const legacyReadings = id => state.limits.filter(x => limitAccountId(x) === id);
    const accountCards = [...groups.entries()].map(([provider, accounts]) => `<section class="usage-provider" data-key="usage-provider-${escape(provider)}" aria-labelledby="usage-provider-${escape(provider)}"><h2 id="usage-provider-${escape(provider)}" class="usage-provider-head sr-only">${accountMark(provider)}<span>${escape(providerName(provider))}</span><small>${accounts.length === 1 ? '1 account' : `${accounts.length} accounts`}</small></h2><div class="usage-rows">${accounts.map(account => usageRow(account, state.usageChecks?.find(item => item.accountId === account.id), legacyReadings(account.id))).join('')}</div></section>`).join('') || `<p class="section-note usage-empty">${hidden.size ? 'Every account is hidden. Use Hidden accounts to show one.' : 'No accounts to show. Add a subscription to see its limits.'}</p>`;
    const addable = listed.filter(account => !visible.includes(account));
    // Every provider is listed. Each tile says what adding it does today.
    const providerTile = provider => {
      const waiting = addable.filter(account => account.provider === provider.id);
      const agent = state.agents?.find(item => item.id === provider.id), installed = agent ? agent.installed !== false : true;
      const [attrs, note] = waiting.length ? [`data-usage-show="${escape(waiting[0].id)}"${hidden.has(waiting[0].id) ? ' data-usage-hidden-item' : ''}`, hidden.has(waiting[0].id) ? 'Show hidden account' : 'Show account']
        : provider.namedProfiles ? [`data-usage-new-account="${escape(provider.id)}"`, listed.some(account => account.provider === provider.id) ? 'Add another account' : 'Add account']
        : !installed ? ['data-page="agent-settings"', 'Install the CLI first']
        : ['disabled aria-disabled="true"', 'One account for now'];
      return `<button type="button" class="usage-choice" ${attrs}>${accountMark(provider.id)}<span><strong>${escape(provider.name)}</strong><small>${note}</small></span></button>`;
    };
    const providers = [...(state.accountProviders || [])].sort((a, b) => a.name.localeCompare(b.name));
    const addPanel = addOpen ? `<div class="usage-add" id="usage-add-panel" role="group" aria-label="Add a subscription"><div class="usage-choices">${providers.map(providerTile).join('')}</div></div>` : '';
    return pageHeading('', 'Usage', 'Account-wide limits, checked every two minutes.', `<div class="usage-heading-actions"><button class="secondary" data-action="refresh" ${state.refreshing ? 'disabled aria-busy="true"' : ''}>${icon('refresh')}${state.refreshing ? 'Checking accounts…' : 'Refresh'}</button>${hidden.size ? `<button type="button" class="secondary" data-action="usage-hidden" aria-expanded="${addOpen}" aria-controls="usage-add-panel">Hidden accounts (${hidden.size})</button>` : ''}</div>`) +
      `<section class="surface account-switch-settings usage-subscriptions"><div class="usage-groups">${accountCards}</div><div class="usage-add-slot"><button type="button" class="usage-add-button" data-action="usage-add" aria-expanded="${addOpen}" aria-controls="usage-add-panel">${icon('plus')}Add subscription</button>${addPanel}</div></section>${renderAnalytics()}`;
  }

  document.addEventListener('change', event => {
    if (event.target.matches('[data-usage-period]')) { period = Number(event.target.value); renderPage(); document.querySelector('[data-usage-period]')?.focus({ preventScroll: true }); }
  });

  async function showAccount(id) {
    const state = getState();
    const shown = new Set(state.settings.usageShown || []), hidden = new Set(state.settings.usageHidden || []);
    shown.add(id); hidden.delete(id);
    addOpen = false;
    await call('settings', { usageShown: [...shown], usageHidden: [...hidden] });
    void call('refresh').catch(() => {});
    toast('Added to Usage. Checking its limits.');
  }
  // Data-attribute buttons. Returns false when none matched, else true or the running promise.
  function click(button) {
    if (button.dataset.usageMetric) { metric = button.dataset.usageMetric; renderPage(); document.querySelector(`[data-usage-metric="${metric}"]`)?.focus({ preventScroll: true }); return true; }
    if (button.dataset.usageShow) return showAccount(button.dataset.usageShow);
    if (button.dataset.usageNewAccount) { addOpen = false; openNewAccount(button.dataset.usageNewAccount); return true; }
    return false;
  }
  const actions = {
    'usage-add'() { addOpen = !addOpen; renderPage(); ($('#usage-add-panel button:not([disabled])') || $('[data-action=usage-add]'))?.focus({ preventScroll: true }); },
    'usage-hidden'() { addOpen = !addOpen; renderPage(); $('[data-usage-hidden-item], [data-action=usage-hidden]')?.focus({ preventScroll: true }); },
    async export() { await call('ledger.export'); }
  };
  return { render, click, actions };
}
