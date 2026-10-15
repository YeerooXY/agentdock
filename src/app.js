import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './style.css';
import { sharedViews } from './shared-ui.js';
import { holdToChoose } from './launch-gesture.js';
import { vimControls } from './vim-controls.js';
import { firstRun } from './first-run.js';
import { windowDragging } from './window-drag.js';
import { toolFeatures, syncIntegrationJobs } from './tool-features.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  terminal: '<path d="m5 7 5 5-5 5m8 0h6"/>',
  chart: '<path d="M4 20V10m8 10V4m8 16v-7"/>',
  api: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-5 2 2-18"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  corner: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 4v7h8"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8m0-13v5h-5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 4h7a2 2 0 0 1 2 2v10H3Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  minus: '<path d="M5 12h14"/>',
  menu: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  star: '<path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7Z"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.terminal}</svg>`;
const providerName = value => ({ codex: 'Codex', claude: 'Claude Code', shell: 'PowerShell', custom: 'Custom', openai: 'OpenAI', anthropic: 'Anthropic' })[value] || value;
const number = value => Number.isFinite(value) ? Intl.NumberFormat('en', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value) : '—';
const money = value => value == null ? 'Not priced' : '$' + value.toFixed(value && value < 0.01 ? 4 : 2);
const labels = { open: 'Open', active: 'Thinking', ready: 'Ready', attention: 'Needs attention', error: 'Error', ended: 'Ended', recent: 'Recent', interrupted: 'Interrupted' };
let state, page = 'consoles', selectedId = null, selectedApi = 'openai', apiBusy = false, outputText = '', toastTimer;
let apiDraft = { model: '', prompt: '', maxOutput: '1024' }, responseMeta = 'TEXT OUTPUT', responseError = '';
const terminals = new Map();
let openingConsole = false;
let launchGesture, chooserOpener, vim, setup;
const nameSaves = new Map();
const launchHint = 'title="Click to open. Hold or right-click to choose." aria-haspopup="dialog"';
let renderedView = null, viewAnimation, windowMoving = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
async function call(method, payload) {
  const result = await window.dock.call(method, payload);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function toast(message, error = false) {
  const element = $('#toast'); element.textContent = message; element.className = 'visible' + (error ? ' error' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { element.className = ''; }, 6500);
}
function age(at) {
  if (!at) return 'Not connected';
  const minutes = Math.max(0, Math.floor((Date.now() - at) / 60000));
  return minutes < 1 ? 'Just updated' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}
function resetTime(at) {
  if (!at) return 'Reset time unavailable';
  const diff = at - Date.now();
  if (diff <= 0) return 'Reset passed · refresh needed';
  const minutes = Math.ceil(diff / 60000), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  return `Resets in ${days ? days + 'd ' : ''}${hours % 24 ? hours % 24 + 'h ' : ''}${!days ? minutes % 60 + 'm' : ''}`.trim();
}
function windowLabel(minutes) { return minutes === 10080 ? 'Weekly' : minutes === 300 ? '5-hour' : minutes == null ? 'Usage window' : minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60}-hour` : `${minutes} min`; }
function badge(status) { return `<span class="status ${escape(status)}"><span class="dot"></span>${escape(labels[status] || status)}</span>`; }

$('#app').innerHTML = `
<div id="dashboard" class="app-shell">
  <aside id="sidebar" class="sidebar">
    <button class="brand" data-page="consoles" aria-label="Agent Dock home"><span class="brand-mark">${icon('star')}</span><span>agent<span class="brand-light">dock</span></span></button>
    <nav aria-label="Main navigation">

      <button data-page="consoles">${icon('terminal')}Consoles <span id="nav-count">0</span></button>
      <button data-page="usage">${icon('chart')}Usage</button>
      <button data-page="api">${icon('api')}API</button>
      <button data-page="vault">${icon('lock')}Keys</button>
      <button data-page="tools">${icon('api')}Tools</button>
      <button data-page="instructions">${icon('folder')}Instructions</button>
    </nav>
    <div class="sidebar-bottom"><button data-page="settings">${icon('settings')}Settings</button></div>
  </aside>
  <div class="workspace">
    <header class="titlebar"><button id="sidebar-toggle" class="icon-button" data-action="sidebar" aria-label="Hide sidebar" title="Hide sidebar" aria-controls="sidebar" aria-expanded="true">${icon('menu')}</button><button id="launch-folder" class="launch-folder" data-action="launch-folder" aria-label="Choose launch folder">${icon('folder')}<span></span></button><div class="window-drag-handle" data-window-drag title="Drag to move. Double-click for fullscreen." aria-label="Move window"><span></span></div><div class="window-actions"><button data-action="hud" title="Collapse to corner HUD" aria-label="Collapse to corner HUD">${icon('corner')}</button><button data-action="minimize" aria-label="Minimize">${icon('minus')}</button><button data-action="tray" aria-label="Hide in system tray" title="Hide in system tray">${icon('close')}</button></div></header>
    <main id="content" tabindex="-1"></main>
    <section id="consoles-page" class="console-grid-view" hidden aria-label="Consoles"><div class="consoles-only"><div class="session-grid"></div></div></section>
    <section id="terminal-page" hidden><div class="terminal-toolbar"><div id="terminal-heading"></div><div class="toolbar-actions"><button data-page="consoles" class="subtle" aria-label="Back to consoles">${icon('grid')}Consoles</button><button data-action="fullscreen" class="subtle">${icon('expand')}Fullscreen</button><button data-action="end-session" class="subtle danger">End console</button></div></div><div id="terminal-tabs" role="tablist" aria-label="Open consoles"></div><div id="terminal-host"></div></section>
    <div id="terminal-cache" hidden></div>
  </div>
</div>
<section id="hud" hidden aria-label="Agent Dock desktop HUD"></section>
<dialog id="console-chooser" aria-labelledby="console-chooser-title" aria-describedby="console-chooser-hint">
  <form id="one-off-console-form">
    <div class="dialog-heading"><div><h2 id="console-chooser-title">Open console</h2><p id="console-chooser-hint">Just for this console.</p></div><button type="button" class="icon-button" data-action="cancel-console" aria-label="Close chooser">${icon('close')}</button></div>
    <div class="form-pair"><label>Agent or shell<select name="provider">${['codex', 'claude', 'shell', 'custom'].map(provider => `<option value="${provider}">${providerName(provider)}</option>`).join('')}</select></label><label id="one-off-model">Model<select name="model"><option value="">Agent default</option><option value="__custom__">Enter a model…</option></select></label></div>
    <label id="one-off-custom-model" hidden>Model name<input name="customModel" maxlength="200" spellcheck="false" autocomplete="off" placeholder="Model name or alias"></label>
    <label>Project folder<div class="folder-input"><input name="cwd" required><button type="button" data-action="pick-folder" aria-label="Choose project folder for this console">${icon('folder')}</button></div></label>
    <label id="one-off-command" hidden>Command<textarea name="command" rows="3" maxlength="4000" spellcheck="false" placeholder="The command to run"></textarea></label>
    <details class="console-options"><summary>Options</summary><label>Name <span class="optional">optional</span><input name="name" maxlength="64" placeholder="Uses the folder name"></label><label id="one-off-permissions">Permissions<select name="permissions"><option value="unrestricted">Unrestricted</option><option value="default">Agent defaults</option></select></label></details>
    <p class="form-error" role="alert"></p><div class="dialog-footer"><button type="button" class="secondary" data-action="cancel-console">Cancel</button><button type="submit" class="primary">Open console</button></div>
  </form>
</dialog>`;
$('#launch-folder').insertAdjacentHTML('afterend', '<button class="vim-mode" data-action="vim-normal" hidden></button>');
document.querySelectorAll('.sidebar [data-page]').forEach(button => {
  if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', button.textContent.replace(/\d+$/, '').trim());
});

function pageHeading(eyebrow, title, description, action = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}
function quotaCard(provider, detailed = false) {
  const values = state.limits.filter(x => x.provider === provider);
  const value = values[0];
  const stale = value && Date.now() - value.observedAt > 5 * 60000;
  const display = providerName(provider);
  const card = (entry, index) => `<article class="quota-card ${detailed ? 'large' : ''}">
    <div class="quota-heading"><span class="provider-icon ${provider}">${provider === 'codex' ? '◈' : '✳'}</span><strong>${escape(entry?.name || display)}</strong>${entry?.plan ? `<span class="plan">${escape(entry.plan)}</span>` : ''}<span class="connection ${entry ? 'connected' : ''}">${entry ? stale ? 'Cached' : 'Connected' : 'Not connected'}</span></div>
    ${entry?.windows.length ? entry.windows.map(w => `<div class="quota-window"><div><span>${windowLabel(w.minutes)}</span><strong>${number(w.usedPercent)}<small>% used</small></strong></div><div class="meter ${w.usedPercent >= 90 ? 'warning' : ''}" role="progressbar" aria-label="${escape(display)} ${windowLabel(w.minutes)} used" aria-valuenow="${Math.min(100, w.usedPercent)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(100, w.usedPercent)}%"></span></div><span class="reset">${resetTime(w.resetsAt)}</span></div>`).join('') : `<div class="quota-unavailable"><span class="empty-value">—</span><p>${provider === 'codex' ? state.accountError ? escape(state.accountError) : 'Waiting for account usage.' : state.capabilities.claude ? 'Usage arrives after a Claude response.' : 'Install Claude Code to connect usage.'}</p></div>`}
    ${entry && !entry.windows.some(w => w.minutes === 300) ? '<div class="missing-window">5-hour limit not reported</div>' : ''}
    ${entry && !entry.windows.some(w => w.minutes === 10080) ? '<div class="missing-window">Weekly limit not reported</div>' : ''}
    <div class="quota-foot">${entry ? `${stale ? 'Stale snapshot · ' : ''}${age(entry.observedAt)}` : 'No estimated limits'}${detailed && entry ? `<span>${escape(entry.source)}</span>` : ''}</div>
  </article>`;
  return values.length ? values.map(card).join('') : card(null, 0);
}
function slotNameInput(slot, session) {
  const name = session?.name || state.settings.slotNames?.[slot] || '';
  return `<input class="console-name" data-name-slot="${slot}" data-name-session="${session?.id || ''}" value="${escape(name)}" maxlength="64" aria-label="Name console ${slot}" title="Name this console" placeholder="Name console" autocomplete="off" spellcheck="false">`;
}
function newConsoleMark() {
  return `<span class="new-console-mark" aria-hidden="true">${icon('plus')}<span class="new-console-label"><span>New console</span></span></span>`;
}
function syncSlotName(input, slot, session) {
  if (input !== document.activeElement && !nameSaves.has(slot)) input.value = session?.name || state.settings.slotNames?.[slot] || '';
}
function sessionCard(slot) {
  const session = state.sessions.find(x => x.slot === slot && (x.alive || x.restoreError));
  if (!session) return `<article class="session-card empty" data-slot="${slot}"><header class="empty-panel-header">${slotNameInput(slot)}</header><button class="console-launch" data-action="new" data-slot="${slot}" aria-label="Open console ${slot}" ${launchHint} ${openingConsole ? 'disabled' : ''}>${newConsoleMark()}</button></article>`;
  return `<article class="session-card ${escape(session.state)}" data-console-id="${session.id}" data-slot="${slot}"><header class="console-panel-header"><span class="slot" title="${escape(providerName(session.provider) + ' · ' + session.cwd)}">${String(slot).padStart(2, '0')}</span>${slotNameInput(slot, session)}<span class="panel-status">${badge(session.state)}</span><button class="icon-button" data-session="${session.id}" aria-label="Expand console ${slot}" title="Expand console">${icon('expand')}</button></header><div class="console-panel-body" data-terminal-mount="${session.id}"></div></article>`;
}
function recentSection() {
  const entries = state.recent.filter(x => !state.sessions.some(s => s.providerSessionId === x.id));
  return `<section class="recent-section"><div class="section-label"><h2>Outside the dock</h2><span>Recent Codex activity · read only</span></div>${entries.length ? entries.slice(0, 5).map(x => `<div class="recent-row"><span class="provider-icon codex">◈</span><div><strong>${escape(x.name)}</strong><small title="${escape(x.cwd)}">${escape(x.cwd)}</small></div>${badge(x.state)}<span class="mono recent-tokens">${x.usage ? number(x.usage.total) + ' tokens' : 'Usage unavailable'}</span><time>${age(x.updatedAt)}</time></div>`).join('') : '<div class="inline-empty">Recent Codex sessions will appear here. No transcript text is copied into the tracker.</div>'}</section>`;
}
function renderConsoles() {
  const grid = $('.session-grid');
  for (let slot = 1; slot <= 9; slot++) {
    const session = state.sessions.find(x => x.slot === slot && (x.alive || x.restoreError));
    let panel = grid.children[slot - 1];
    if (!panel || (panel.dataset.consoleId || '') !== (session?.id || '')) {
      const previous = terminals.get(panel?.dataset.consoleId);
      if (previous && panel.contains(previous.node)) $('#terminal-cache').append(previous.node);
      const template = document.createElement('template'); template.innerHTML = sessionCard(slot);
      const replacement = template.content.firstElementChild;
      if (panel) panel.replaceWith(replacement); else grid.append(replacement);
      panel = replacement;
    }
    syncSlotName(panel.querySelector('.console-name'), slot, session);
    panel.tabIndex = -1;
    panel.setAttribute('aria-label', `Console ${slot}${session?.name || state.settings.slotNames?.[slot] ? ': ' + (session?.name || state.settings.slotNames[slot]) : ''}`);
    if (!session) { panel.querySelector('[data-action="new"]').disabled = openingConsole; continue; }
    if (panel.dataset.state !== session.state) {
      panel.className = `session-card ${session.state}`; panel.dataset.state = session.state;
      panel.querySelector('.panel-status').innerHTML = badge(session.state);
    }
    if (session.restoreError && !panel.querySelector('[data-action="retry-session"]')) {
      panel.querySelector('.console-panel-header [data-session]').insertAdjacentHTML('beforebegin', `<button class="icon-button" data-action="retry-session" data-id="${session.id}" aria-label="Retry console ${slot}" title="Try reopening">${icon('refresh')}</button>`);
    }
    mountTerminal(session, panel.querySelector('.console-panel-body'), true);
  }
  scheduleFits();
}
function ledgerTable() {
  return state.ledger.length ? `<div class="table-scroll"><table><thead><tr><th>Time</th><th>Provider / model</th><th>Input</th><th>Output</th><th>Est. USD</th><th>Status</th></tr></thead><tbody>${state.ledger.slice(0, 100).map(row => `<tr><td>${new Date(row.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td><strong>${providerName(row.provider)}</strong><small>${escape(row.model)}</small></td><td class="mono">${number(row.usage?.input)}</td><td class="mono">${number(row.usage?.output)}</td><td class="mono">${money(row.estimatedCost)}</td><td><span class="ledger-status ${row.status}">${escape(row.status)}</span></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-ledger"><span class="empty-illustration">${icon('chart')}</span><h3>No API requests yet</h3><p>Requests made here will appear below.</p><button class="secondary" data-page="api">Open API workspace ${icon('arrow')}</button></div>`;
}
function renderUsage() {
  const summary = state.summary;
  return pageHeading('', 'Usage', 'Account limits and API spending.', '<button class="secondary" data-action="refresh">' + icon('refresh') + 'Refresh</button>') +
    '<div class="stats-row usage-stats"><div class="stat"><span>API REQUESTS · 30 DAYS</span><strong>' + summary.requests + '</strong></div><div class="stat"><span>API TOKENS · 30 DAYS</span><strong>' + (summary.unknownUsage && !summary.tokens ? '—' : number(summary.tokens) + (summary.unknownUsage ? '+' : '')) + '</strong></div><div class="stat"><span>ESTIMATED API COST · 30 DAYS</span><strong>' + (summary.unpriced ? summary.cost ? money(summary.cost) + '+' : '—' : money(summary.cost)) + '</strong><span class="stat-description">' + (summary.unpriced ? summary.unpriced + ' requests need rates or usage' : 'USD · configured rates') + '</span></div></div>' +
    '<div class="usage-grid">' + quotaCard('codex', true) + quotaCard('claude', true) + '</div><p class="section-note">Limits are shared across each account. Missing values stay blank.</p><section class="ledger-panel"><div class="section-label"><div><h2>API requests</h2><p>Requests made through Agent Dock.</p></div><button class="subtle" data-action="export">Export</button></div>' + ledgerTable() + '<div class="ledger-foot">' + (state.ledger.length > 100 ? 'Latest 100 shown. Export includes all records. ' : '') + 'Costs are estimates, not invoices. Tool steps count as separate requests.</div></section>' +
    '<details class="surface pricing-details"><summary>Cost estimate settings</summary><form id="rates-form"><div class="form-pair"><label>API<select name="provider">' + state.shared.profiles.map(x => '<option value="' + escape(x.id) + '">' + escape(x.name) + '</option>').join('') + '</select></label><label>Model ID<input name="model" required placeholder="Model to price"></label></div><p class="field-hint">USD per million tokens. Leave unknown rates blank.</p><div class="price-grid">' + [['input', 'Input'], ['output', 'Output'], ['cached', 'Cache reads'], ['cacheWrite', 'Cache writes']].map(([key,label]) => '<label>' + label + '<input name="' + key + '" type="number" min="0" step="any" placeholder="Unknown"></label>').join('') + '</div><button type="submit" class="primary">Save rates</button><p class="form-error" role="alert"></p></form></details>';
}
function renderApi() {
  const profiles = state.shared.profiles;
  if (!profiles.some(x => x.id === selectedApi)) selectedApi = profiles[0]?.id || '';
  const profile = profiles.find(x => x.id === selectedApi);
  const hasKey = profile && (!profile.keyId || state.vault.entries.some(x => x.id === profile.keyId));
  return pageHeading('', 'API', 'Your shared tools and instructions are included.') + '<div class="api-columns"><form id="api-form" class="surface api-form"><h2>New request</h2><label>API<select name="provider">' + profiles.map(x => '<option value="' + escape(x.id) + '" ' + (x.id === selectedApi ? 'selected' : '') + '>' + escape(x.name) + '</option>').join('') + '</select></label><div class="key-state ' + (hasKey ? 'saved' : '') + '">' + icon('lock') + (hasKey ? profile.keyId ? 'Key connected' : 'No key required' : 'Add the key in Keys, or choose one in Tools.') + '</div><label>Model<input name="model" required maxlength="150" placeholder="Model ID" autocomplete="off"></label><label>Prompt<textarea name="prompt" rows="9" required maxlength="100000" placeholder="What are we working on?"></textarea></label><label>Max output tokens per step<input type="number" name="maxOutput" min="16" max="32768" value="1024" required></label><p class="field-hint">Each request starts fresh. Up to 8 model steps with tools.</p><p id="api-error" class="form-error" role="alert"></p><button type="submit" class="primary wide" ' + (!hasKey || apiBusy ? 'disabled' : '') + '>' + icon('arrow') + (apiBusy ? 'Working…' : 'Send') + '</button></form><section class="surface response-panel"><div class="section-label"><h2>Response</h2><span id="response-meta" class="small-label"></span></div><pre id="api-response">' + escape(outputText || 'Your response will appear here.') + '</pre></section></div>';
}
function renderVault() { return sharedViews(state, { escape, icon, pageHeading }).vault(); }
function renderTools() { return sharedViews(state, { escape, icon, pageHeading }).tools(); }
function refreshToolSections() {
  if (page !== 'tools') return;
  const drafts = [...document.querySelectorAll('.integrations input, .integrations select')].map(field => [field.name, field.value]);
  const focusedSetup = document.activeElement?.dataset.integrationSetup;
  const template = document.createElement('template'); template.innerHTML = renderTools();
  for (const selector of ['.integrations', '.connection-list']) document.querySelector(selector)?.replaceWith(template.content.querySelector(selector));
  for (const [name, value] of drafts) { const field = document.querySelector(`.integrations [name="${name}"]`); if (field) field.value = value; }
  if (focusedSetup) document.querySelector(`[data-integration-setup="${focusedSetup}"]`)?.focus({ preventScroll: true });
}
function renderInstructions() { return sharedViews(state, { escape, icon, pageHeading }).instructions(); }
function renderLaunchDefaults() {
  const defaults = state.settings.consoleDefaults;
  return `<form id="console-defaults-form" class="surface"><h2>Console defaults</h2><p class="field-hint">Used when you click +.</p><div class="form-pair"><label>Agent or shell<select name="provider">${['codex', 'claude', 'shell', 'custom'].map(provider => `<option value="${provider}" ${defaults.provider === provider ? 'selected' : ''}>${providerName(provider)}</option>`).join('')}</select></label><label id="default-permissions">Permissions<select name="permissions" data-setting="agentPermissions"><option value="unrestricted" ${state.settings.agentPermissions === 'unrestricted' ? 'selected' : ''}>Unrestricted</option><option value="default" ${state.settings.agentPermissions !== 'unrestricted' ? 'selected' : ''}>Agent defaults</option></select></label></div><label>Project folder<div class="folder-input"><input name="cwd" required value="${escape(defaults.cwd)}"><button type="button" data-action="pick-folder" aria-label="Choose default project folder">${icon('folder')}</button></div></label><label>Name <span class="optional">optional</span><input name="name" maxlength="64" value="${escape(defaults.name)}" placeholder="Uses the folder name"></label><label id="default-command">Custom command<textarea name="command" rows="3" maxlength="4000" spellcheck="false" placeholder="The command to run">${escape(defaults.command)}</textarea></label><p id="default-provider-hint" class="field-hint"></p><p class="form-error" role="alert"></p><button type="submit" class="primary">Save defaults</button></form>`;
}
function renderSettings() {
  return pageHeading('', 'Settings', '') + '<div class="settings-layout"><section class="surface"><h2>Desktop</h2><label class="toggle-row"><span><strong>Keep HUD above other apps</strong><small>Off lets your other windows cover it.</small></span><input type="checkbox" data-setting="hudAlwaysOnTop" ' + (state.settings.hudAlwaysOnTop ? 'checked' : '') + '></label><label class="toggle-row"><span><strong>Notify when an agent needs you</strong></span><input type="checkbox" data-setting="notifications" ' + (state.settings.notifications ? 'checked' : '') + '></label><div class="shortcut-row"><span>Show or collapse</span><kbd>Ctrl Alt Space</kbd></div><div class="shortcut-row"><span>Open a console</span><kbd>Ctrl Alt 1…9</kbd></div><p class="field-hint">Close hides Dock in the system tray. Consoles keep running. Use Quit to stop the app.</p></section><section class="surface"><h2>Installed agents</h2>' + ['codex', 'claude'].map(provider => '<div class="connection-row"><span>' + providerName(provider) + '</span><span>' + (state.capabilities[provider] ? provider === 'claude' ? escape(state.capabilities.claudeLocation) : 'Windows' : 'Not found') + '</span><button class="subtle" data-docs="' + provider + '">Guide ↗</button></div>').join('') + '<button class="secondary danger" data-action="quit">Quit Agent Dock</button></section></div>';
}
function renderStartupSettings() {
  return `<section class="surface"><h2>Startup</h2><label class="toggle-row"><span><strong>Restore previous consoles</strong><small>Reopen your panels and folders. Saved agent chats resume; shells and custom commands restart.</small></span><input type="checkbox" data-setting="restoreConsoles" ${state.settings.restoreConsoles ? 'checked' : ''}></label><p id="workspace-error" class="form-error" role="alert">${escape(state.workspaceError || '')}</p></section>`;
}
function renderKeyboardSettings() {
  return `<section class="surface"><h2>Keyboard</h2><label class="toggle-row"><span><strong>Vim controls</strong><small>Use h/j/k/l to move around Dock.</small></span><input type="checkbox" data-setting="vimControls" ${state.settings.vimControls ? 'checked' : ''}></label><p class="field-hint">Ctrl+Shift+Space returns control to Dock. Press i to type in a console.</p><button class="subtle" data-action="vim-help">View shortcuts</button></section>`;
}
function renderPage() {
  if (!state) return;
  queueMicrotask(() => vim?.refresh());
  applySidebar();
  if ($('#workspace-error')) $('#workspace-error').textContent = state.workspaceError || '';
  const terminalView = page === 'terminal', consoleView = ['consoles', 'overview'].includes(page);
  $('#terminal-page').hidden = !terminalView;
  $('#consoles-page').hidden = !consoleView;
  $('#content').hidden = terminalView || consoleView;
  $('#launch-folder').hidden = !consoleView;
  const view = page === 'terminal' ? `${page}:${selectedId}` : page === 'api' ? `${page}:${selectedApi}` : page;
  const changed = renderedView !== null && renderedView !== view;
  renderedView = view;
  if (changed) {
    viewAnimation?.cancel();
    if (!windowMoving && state.mode !== 'hud' && !reducedMotion.matches) {
      viewAnimation = $(terminalView ? '#terminal-page' : consoleView ? '#consoles-page' : '#content').animate(
        [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 160, easing: 'cubic-bezier(.22,1,.36,1)' }
      );
    }
  }
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('selected', button.dataset.page === page));
  if (terminalView) { renderTerminal(); return; }
  if (consoleView) { renderConsoles(); return; }
  const renderer = { usage: renderUsage, api: renderApi, vault: renderVault, tools: renderTools, instructions: renderInstructions, settings: renderSettings }[page] || renderSettings;
  $('#content').innerHTML = (state.storageError ? `<div class="error-banner" role="alert">${escape(state.storageError)}</div>` : '') + renderer();
  if (page === 'settings') { $('.settings-layout').insertAdjacentHTML('afterbegin', renderKeyboardSettings() + renderStartupSettings() + renderLaunchDefaults()); launchDefaultsFields(); }
  if (page === 'api') {
    const form = $('#api-form');
    for (const key of ['model', 'prompt', 'maxOutput']) form.elements[key].value = apiDraft[key];

    $('#response-meta').textContent = apiBusy ? 'IN PROGRESS' : responseMeta;
    $('#api-error').textContent = responseError;
  }
}
function hudHtml() {
  const ready = state.sessions.filter(x => ['ready', 'attention'].includes(x.state)).length;
  const active = state.sessions.filter(x => x.alive).length;
  const selected = state.sessions.find(x => x.id === selectedId && x.alive) || state.sessions.find(x => x.alive);
  const quotaProvider = selected?.provider === 'claude' ? 'claude' : 'codex';
  const quota = state.limits.find(x => x.id === `${quotaProvider}:account` || x.id === `${quotaProvider}:codex`) || state.limits.find(x => x.provider === quotaProvider);
  const weekly = quota?.windows.find(x => x.minutes === 10080), five = quota?.windows.find(x => x.minutes === 300);
  const slots = Array.from({ length: 9 }, (_, i) => {
    const item = state.sessions.find(x => x.slot === i + 1 && (x.alive || x.restoreError));
    const name = state.settings.slotNames?.[i + 1];
    return item ? `<button class="hud-slot ${item.state} ${item.id === selectedId ? 'current' : ''}" data-slot="${i + 1}" data-session="${item.id}" title="${escape(item.name)} · ${labels[item.state]}"><span>${i + 1}</span><i class="dot"></i><small>${escape(item.name)}</small></button>` : `<button class="hud-slot empty ${name ? 'named' : ''}" data-action="new" data-slot="${i + 1}" aria-label="Open console ${i + 1}${name ? ': ' + escape(name) : ''}" ${launchHint} ${openingConsole ? 'disabled' : ''}>${newConsoleMark()}${name ? `<small class="hud-slot-name">${escape(name)}</small>` : ''}</button>`;
  }).join('');
  return `<div class="hud-title"><span class="hud-brand" data-window-drag title="Drag to move">${icon('grid')}agentdock</span><button class="vim-mode" data-action="vim-normal" hidden></button><button class="icon-button" data-action="dashboard" aria-label="Expand dashboard">${icon('expand')}</button><button class="icon-button" data-action="tray" aria-label="Hide in system tray">${icon('close')}</button></div><button class="hud-summary" data-action="dashboard"><div><strong>${ready ? `${ready} ready for you` : active ? `${active} console${active === 1 ? '' : 's'} open` : ''}</strong>${icon('arrow')}</div></button><div class="hud-slots">${slots}</div>${selected ? `<button class="hud-console ${selected.state}" data-session="${selected.id}"><div><span>${icon('terminal')}${escape(selected.name)}</span>${icon('expand')}</div><pre id="hud-preview">${escape(terminalPreview(selected))}</pre></button>` : `<button class="hud-console empty" data-action="new" aria-label="Open console" ${launchHint} ${openingConsole ? 'disabled' : ''}>${newConsoleMark()}</button>`}<div class="hud-usage"><span>${quotaProvider === 'claude' ? 'CLAUDE USAGE' : 'CODEX USAGE'} <small>${quota ? age(quota.observedAt) : 'Not connected'}</small></span><div><span>5h <b>${five ? number(five.usedPercent) + '%' : '—'}</b></span><span>Weekly <b>${weekly ? number(weekly.usedPercent) + '%' : '—'}</b></span></div></div>`;
}
function terminalPreview(session) {
  if (!session) return '> ready when you are';
  const buffer = terminals.get(session.id)?.term.buffer.active;
  if (buffer) {
    const lines = [];
    for (let i = Math.max(0, buffer.baseY + buffer.cursorY - 4); i <= buffer.baseY + buffer.cursorY; i++) {
      const line = buffer.getLine(i)?.translateToString(true); if (line?.trim()) lines.push(line);
    }
    if (lines.length) return lines.slice(-3).join('\n');
  }
  return `${providerName(session.provider)}  /  ${labels[session.state]}\nClick to enter fullscreen.`;
}
let previewTimer;
function updatePreview() {
  if (state.mode !== 'hud' || previewTimer) return;
  previewTimer = setTimeout(() => {
    previewTimer = null;
    const selected = state.sessions.find(x => x.id === selectedId) || state.sessions.find(x => x.alive);
    if ($('#hud-preview')) $('#hud-preview').textContent = terminalPreview(selected);
  }, 200);
}
function receive(next) {
  state = next;
  setup?.receive();
  if ($('#workspace-error')) $('#workspace-error').textContent = state.workspaceError || '';
  windowMoving = !!state.transitioning;
  document.body.classList.toggle('window-moving', windowMoving);
  for (const [id, record] of terminals) if (!state.sessions.some(session => session.id === id)) { record.term.dispose(); record.node.remove(); terminals.delete(id); }
  const hud = state.mode === 'hud';
  $('#dashboard').hidden = hud; $('#hud').hidden = !hud;
  $('#nav-count').textContent = state.sessions.filter(x => x.alive).length;
  const launchFolder = state.settings.consoleDefaults.cwd;
  $('#launch-folder span').textContent = launchFolder.split(/[\\/]/).filter(Boolean).pop() || launchFolder;
  $('#launch-folder').title = `New consoles start in ${launchFolder}`;
  applySidebar();
  if (page === 'tools') for (const connection of state.shared.connections) {
    const label = document.querySelector(`[data-tool-status="${connection.id}"]`);
    if (label) { label.textContent = !connection.enabled ? 'Disabled' : connection.status ? connection.status.ok ? `${connection.status.count} tools` : 'Check connection' : 'Ready to connect'; label.classList.toggle('connected', !!connection.status?.ok); }
  }
  syncIntegrationJobs(state);
  if (hud && !launchGesture?.active && !$('#console-chooser').open && !document.body.classList.contains('window-dragging')) $('#hud').innerHTML = hudHtml();
  else if (['overview', 'consoles', 'usage', 'terminal'].includes(page) && !document.activeElement?.closest('#rates-form')) renderPage();
  if (!windowMoving) scheduleFits();
  vim?.refresh();
}
function applySidebar() {
  const collapsed = !!state.settings.sidebarCollapsed;
  const sidebar = $('#sidebar'), toggle = $('#sidebar-toggle');
  const initialized = sidebar.hasAttribute('data-collapsed');
  if (collapsed && sidebar.contains(document.activeElement)) toggle.focus();
  sidebar.inert = collapsed;
  sidebar.setAttribute('aria-hidden', String(collapsed));
  sidebar.dataset.collapsed = String(collapsed);
  if (!initialized) {
    // Apply the saved layout before enabling motion on later toggles.
    sidebar.getBoundingClientRect();
    sidebar.classList.add('sidebar-animated');
  }
  $('#sidebar-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('#sidebar-toggle').setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
  $('#sidebar-toggle').title = collapsed ? 'Show sidebar' : 'Hide sidebar';
}
async function selectSession(id) {
  selectedId = id;
  if (state.mode !== 'fullscreen') await call('mode', 'fullscreen');
  page = 'terminal';
  renderPage();
  await call('session.acknowledge', id);
  await terminals.get(id)?.ready;
  if (page === 'terminal' && selectedId === id) { fitVisible(); terminals.get(id)?.term.focus(); }
}
let fitTimer, fitFrame;
function scheduleFits() {
  if (fitFrame) return;
  fitFrame = requestAnimationFrame(() => { fitFrame = null; fitVisible(); });
}
function fitVisible() {
  if (windowMoving || state?.mode === 'hud') return;
  const visible = page === 'terminal' ? [terminals.get(selectedId)] : ['consoles', 'overview'].includes(page) ? [...terminals.values()].filter(record => record.node.closest('#consoles-page')) : [];
  for (const record of visible) {
    if (!record || record.loading || !record.node.getClientRects().length) continue;
    try {
      record.fit.fit();
      const size = `${record.term.cols}:${record.term.rows}`;
      if (record.size !== size) {
        record.size = size;
        call('session.resize', { id: record.id, cols: record.term.cols, rows: record.term.rows }).catch(() => {});
      }
    } catch {}
  }
}
function mountTerminal(session, host, compact) {
  let record = terminals.get(session.id);
  if (!record) {
    const id = session.id, node = document.createElement('div');
    node.className = 'terminal-instance'; node.dataset.terminalId = id; host.append(node);
    const term = new Terminal({ cols: session.cols || 110, rows: session.rows || 30, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: compact ? 11 : 14, lineHeight: 1.22, cursorBlink: !compact, scrollback: 3000, theme: { background: '#010103', foreground: '#e5e7ef', cursor: '#f58ac8', selectionBackground: '#293550', black: '#1b2126', red: '#ef8a86', green: '#b9e888', yellow: '#e8c57e', blue: '#8daef2', magenta: '#c0a2f5', cyan: '#89ccc4', white: '#e1e8e3', brightBlack: '#81908d' } });
    const fit = new FitAddon(); term.loadAddon(fit); term.open(node);
    record = { id, term, fit, node, compact, loading: true, queued: [] }; terminals.set(id, record);
    term.onData(data => call('session.input', { id, data }).catch(error => toast(error.message, true)));
    node.addEventListener('focusin', () => { selectedId = id; });
    record.ready = call('session.buffer', id).then(buffer => {
      if (terminals.get(id) !== record) return;
      term.write(buffer.data);
      for (const packet of record.queued) if (packet.sequence > buffer.sequence) term.write(packet.data);
      record.queued = []; record.loading = false;
      return new Promise(resolve => term.write('', () => { scheduleFits(); resolve(); }));
    }).catch(error => { record.loading = false; toast(error.message, true); });
  }
  if (record.node.parentElement !== host) host.append(record.node);
  if (record.compact !== compact) {
    record.compact = compact;
    record.term.options.fontSize = compact ? 11 : 14;
    record.term.options.cursorBlink = !compact;
  }
  record.node.classList.toggle('compact', compact); record.node.hidden = false;
  return record;
}
function renderTerminal() {
  const session = state.sessions.find(x => x.id === selectedId);
  if (!session) { page = 'consoles'; renderPage(); return; }
  $('#terminal-host').dataset.state = session.state;
  if (!$('#terminal-heading').contains(document.activeElement) && !nameSaves.has(session.slot)) {
    $('#terminal-heading').innerHTML = `<span class="slot">${String(session.slot).padStart(2, '0')}</span><div>${slotNameInput(session.slot, session)}<small>${escape(session.cwd)}</small></div>${badge(session.state)}`;
    if (session.permissions === 'unrestricted') $('#terminal-heading').insertAdjacentHTML('beforeend', '<span class="permission-tag">Full access</span>');
    if (session.restoreError) $('#terminal-heading').insertAdjacentHTML('beforeend', `<button class="secondary" data-action="retry-session" data-id="${session.id}">Try reopening</button>`);
  }
  $('#terminal-tabs').innerHTML = state.sessions.map(x => `<button role="tab" aria-selected="${x.id === selectedId}" data-session="${x.id}" class="${x.id === selectedId ? 'active' : ''}"><span class="dot ${x.state}"></span>${x.slot}. ${escape(x.name)}</button>`).join('');
  $('#terminal-page [data-action="end-session"]').disabled = !session.alive && !session.restoreError;
  $('#terminal-page [data-action="end-session"]').textContent = session.restoreError ? 'Remove saved console' : 'End console';
  mountTerminal(session, $('#terminal-host'), false);
  for (const [id, record] of terminals) if (record.node.parentElement === $('#terminal-host')) record.node.hidden = id !== selectedId;
  scheduleFits();
}
const terminalResize = new ResizeObserver(() => { clearTimeout(fitTimer); fitTimer = setTimeout(scheduleFits, 80); });
terminalResize.observe($('#terminal-host')); terminalResize.observe($('.session-grid'));
window.dock.onOutput(packet => { const record = terminals.get(packet.id); if (!record) return; if (record.loading) record.queued.push(packet); else record.term.write(packet.data, updatePreview); });
window.dock.onSelect(id => selectSession(id).catch(error => toast(error.message, true)));
window.dock.onState(receive);

function launchDefaultsFields() {
  const form = $('#console-defaults-form'); if (!form) return;
  const provider = form.elements.provider.value;
  $('#default-command').hidden = provider !== 'custom';
  $('#default-permissions').hidden = !['codex', 'claude'].includes(provider);
  $('#default-provider-hint').textContent = provider === 'claude' ? state.capabilities.claude ? 'Claude Code · ' + state.capabilities.claudeLocation : 'Claude Code was not found.' : provider === 'custom' ? 'Shared files: {instructions} and {mcp_config}.' : '';
}
function toolFields() {
  const form = $('#tool-form'); if (!form) return;
  const type = form.elements.type.value, local = type === 'stdio';
  form.querySelectorAll('[data-tool-stdio]').forEach(x => x.hidden = !local);
  form.querySelectorAll('[data-tool-http]').forEach(x => x.hidden = local);
  form.querySelector('[data-tool-rest]').hidden = type !== 'rest';
  form.querySelector('[data-key-target]').firstChild.textContent = local ? 'Environment variable' : 'Header name';
  form.elements.keyTarget.placeholder = local ? 'API_KEY' : 'Authorization';
}
function editTool(id) {
  const item = state.shared.connections.find(x => x.id === id); if (!item) return;
  const form = $('#tool-form'); form.reset(); form.elements.id.readOnly = true;
  for (const key of ['id', 'name', 'description', 'type', 'command', 'cwd', 'url', 'method']) if (item[key]) form.elements[key].value = item[key];
  form.elements.enabled.checked = item.enabled;
  form.elements.args.value = (item.args || []).join('\n');
  const pairs = Object.entries(item.type === 'stdio' ? item.envKeys || {} : item.headerKeys || {});
  if (pairs.length) { const [name, ref] = pairs.shift(); form.elements.keyTarget.value = name; form.elements.keyId.value = ref.key; form.elements.keyPrefix.value = ref.prefix; }
  form.elements.extraKeys.value = JSON.stringify(Object.fromEntries(pairs), null, 2);
  form.elements.queryKeys.value = JSON.stringify(item.queryKeys || {}, null, 2);
  if (item.inputSchema) form.elements.inputSchema.value = JSON.stringify(item.inputSchema, null, 2);
  $('#tool-form-title').textContent = 'Edit tool'; toolFields(); form.scrollIntoView({ block: 'start' });
}
function toolPayload(form, data) {
  const parse = (value, field) => { try { return JSON.parse(value || '{}'); } catch { throw new Error(`${field} needs valid JSON.`); } };
  const bindings = parse(data.extraKeys, 'Key bindings');
  if (!bindings || Array.isArray(bindings) || typeof bindings !== 'object') throw new Error('Key bindings must be an object.');
  if (data.keyId) { const target = data.keyTarget.trim() || (data.type === 'stdio' ? 'API_KEY' : 'Authorization'); bindings[target] = { key: data.keyId, prefix: data.type === 'stdio' ? '' : data.keyPrefix }; }
  return { id: data.id, name: data.name, description: data.description, type: data.type, enabled: form.elements.enabled.checked, command: data.command, args: data.args.split(/\r?\n/).filter(x => x !== ''), cwd: data.cwd, url: data.url, method: data.method, ...(data.type === 'stdio' ? { envKeys: bindings } : { headerKeys: bindings, queryKeys: parse(data.queryKeys, 'Query bindings') }), ...(data.type === 'rest' ? { inputSchema: parse(data.inputSchema, 'Input schema') } : {}) };
}
let chooserModelRequest = 0;
function chooserFields() {
  const form = $('#one-off-console-form'), provider = form.elements.provider.value;
  const agent = ['codex', 'claude'].includes(provider), customModel = agent && form.elements.model.value === '__custom__';
  $('#one-off-model').hidden = !agent; form.elements.model.disabled = !agent;
  $('#one-off-custom-model').hidden = !customModel; form.elements.customModel.disabled = !customModel; form.elements.customModel.required = customModel;
  $('#one-off-permissions').hidden = !agent; form.elements.permissions.disabled = !agent;
  $('#one-off-command').hidden = provider !== 'custom'; form.elements.command.disabled = provider !== 'custom'; form.elements.command.required = provider === 'custom';
}
async function chooserModels() {
  const request = ++chooserModelRequest, form = $('#one-off-console-form'), provider = form.elements.provider.value;
  const select = form.elements.model;
  select.innerHTML = '<option value="">Agent default</option><option value="__custom__">Enter a model…</option>';
  form.elements.customModel.value = ''; chooserFields();
  if (!['codex', 'claude'].includes(provider)) return;
  try {
    const models = await call('session.models', provider);
    if (request !== chooserModelRequest || !$('#console-chooser').open) return;
    for (const model of models) select.add(new Option(model.name, model.id), select.lastElementChild);
  } catch { /* A custom model can still be entered when the local list is unavailable. */ }
}
function chooseConsole(button) {
  const dialog = $('#console-chooser');
  if (openingConsole || dialog.open) return;
  const occupied = new Set(state.sessions.filter(x => x.alive || x.restoreError).map(x => x.slot));
  const slot = Number(button.dataset.slot) || Array.from({ length: 9 }, (_, i) => i + 1).find(x => !occupied.has(x));
  if (!slot || occupied.has(slot)) return;
  const form = $('#one-off-console-form'); form.reset(); form.dataset.slot = slot;
  for (const key of ['provider', 'cwd', 'name', 'command']) form.elements[key].value = state.settings.consoleDefaults[key] || '';
  form.elements.name.value = state.settings.slotNames?.[slot] || form.elements.name.value;
  form.elements.permissions.value = state.settings.agentPermissions;
  form.querySelector('details').open = false; form.querySelector('.form-error').textContent = '';
  $('#console-chooser-title').textContent = `Console ${slot}`;
  chooserOpener = button; dialog.showModal(); chooserModels(); form.elements.provider.focus();
}
launchGesture = holdToChoose({ onChoose: chooseConsole, disabled: () => openingConsole || $('#console-chooser').open });
$('#console-chooser').addEventListener('cancel', event => { if (openingConsole) event.preventDefault(); });
$('#console-chooser').addEventListener('close', () => {
  ++chooserModelRequest; launchGesture.cancel();
  if (state.mode === 'hud') $('#hud').innerHTML = hudHtml();
  if (!openingConsole) {
    const slot = $('#one-off-console-form').dataset.slot;
    const opener = chooserOpener?.isConnected ? chooserOpener : document.querySelector(`${state.mode === 'hud' ? '#hud' : '#consoles-page'} [data-action="new"][data-slot="${slot}"]`);
    opener?.focus();
  }
  chooserOpener = null;
});
async function openNew(slot, overrides = null) {
  if (openingConsole) return;
  openingConsole = true;
  document.querySelectorAll('[data-action="new"]').forEach(button => button.disabled = true);
  try {
    // A click on plus can blur an edited title; finish that save before launching.
    await Promise.all(nameSaves.values());
    const session = await call('session.create', { ...overrides, ...(slot ? { slot: Number(slot) } : {}) });
    if (overrides) $('#console-chooser').close();
    if (state.mode === 'hud') await selectSession(session.id);
    else {
      selectedId = session.id; page = 'consoles'; renderPage();
      await terminals.get(session.id)?.ready;
      fitVisible(); terminals.get(session.id)?.term.focus();
    }
  } catch (error) {
    if (overrides) throw error;
    page = 'settings';
    if (state.mode !== 'dashboard') await call('mode', 'dashboard');
    renderPage(); toast(error.message, true);
  } finally {
    openingConsole = false;
    document.querySelectorAll('[data-action="new"]').forEach(button => button.disabled = false);
  }
}
document.addEventListener('focusin', event => {
  const input = event.target;
  if (input.matches('.console-name')) { if (!input.hasAttribute('aria-invalid')) input.dataset.original = input.value; input.select(); }
});
document.addEventListener('focusout', async event => {
  const input = event.target;
  if (!input.matches('.console-name')) return;
  const slot = Number(input.dataset.nameSlot), name = input.value.trim();
  if (name === input.dataset.original || nameSaves.has(slot)) return;
  input.readOnly = true;
  const save = call('slot.name', { slot, name, sessionId: input.dataset.nameSession || null });
  nameSaves.set(slot, save);
  try {
    await save;
    input.removeAttribute('aria-invalid'); input.title = 'Name this console';
    input.dataset.original = name;
  } catch (error) {
    input.setAttribute('aria-invalid', 'true'); input.title = error.message; toast(error.message, true);
    if (input.isConnected && input.getClientRects().length) input.focus();
  } finally {
    nameSaves.delete(slot); input.readOnly = false;
    if (!input.hasAttribute('aria-invalid')) {
      const session = state.sessions.find(x => x.slot === slot && (x.alive || x.restoreError));
      document.querySelectorAll(`.console-name[data-name-slot="${slot}"]`).forEach(field => syncSlotName(field, slot, session));
    }
  }
});
document.addEventListener('keydown', event => {
  const input = event.target;
  if (!input.matches('.console-name') || event.isComposing) return;
  if (event.key === 'Escape' || event.key === 'Enter') {
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') { input.value = input.dataset.original; input.removeAttribute('aria-invalid'); input.title = 'Name this console'; }
    input.blur();
  }
});
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.dataset.page) { page = button.dataset.page; renderPage(); $('#content').scrollTop = 0; return; }
    if (button.dataset.session) return await selectSession(button.dataset.session);
    if (button.dataset.docs) return await call('docs', button.dataset.docs);
    if (button.dataset.removeKey) { await call('vault.remove', button.dataset.removeKey); renderPage(); toast('Key removed.'); return; }
    if (button.dataset.editTool) { editTool(button.dataset.editTool); return; }
    if (button.dataset.removeTool) { await call('tools.remove', button.dataset.removeTool); renderPage(); toast('Tool removed.'); return; }
    if (button.dataset.testTool) {
      button.disabled = true; button.textContent = 'Connecting…';
      try { const result = await call('tools.test', button.dataset.testTool); toast(result.message); }
      finally { button.disabled = false; button.textContent = 'Test connection'; }
      return;
    }
    if (button.dataset.removeProfile) { await call('profiles.remove', button.dataset.removeProfile); renderPage(); return; }
    if (button.dataset.editProfile) {
      const profile = state.shared.profiles.find(x => x.id === button.dataset.editProfile), form = $('#profile-form');
      for (const key of ['id','name','protocol','url','keyId']) form.elements[key].value = profile[key];
      form.elements.id.readOnly = true; $('#profile-editor').open = true; form.scrollIntoView(); return;
    }
    switch (button.dataset.action) {
      case 'new': await openNew(button.dataset.slot); break;
      case 'cancel-console': if (!openingConsole) $('#console-chooser').close(); break;
      case 'vim-normal': vim.enterNormal(); break;
      case 'vim-help': vim.showHelp(); break;
      case 'sidebar':
        button.disabled = true;
        try { await call('settings', { sidebarCollapsed: !state.settings.sidebarCollapsed }); }
        finally { button.disabled = false; }
        break;
      case 'reset-tool': $('#tool-form').reset(); $('#tool-form').elements.id.readOnly = false; $('#tool-form-title').textContent = 'Add a tool'; toolFields(); break;
      case 'pick-folder': {
        const form = button.closest('form');
        const folder = await call('pickFolder', { cwd: form.elements.cwd.value });
        if (folder) { form.elements.cwd.value = folder; form.elements.cwd.dispatchEvent(new Event('input', { bubbles: true })); }
        break;
      }
      case 'launch-folder': {
        button.disabled = true;
        try { const folder = await call('pickFolder'); if (folder) await call('settings', { consoleDefaults: { ...state.settings.consoleDefaults, cwd: folder } }); }
        finally { button.disabled = false; }
        break;
      }
      case 'hud': await call('mode', 'hud'); break;
      case 'dashboard': page = 'consoles'; await call('mode', 'dashboard'); renderPage(); break;
      case 'fullscreen': await call('mode', 'fullscreen'); break;
      case 'minimize': await call('minimize'); break;
      case 'tray': await call('tray'); break;
      case 'refresh': await call('refresh'); break;
      case 'quit': await call('quit'); break;
      case 'end-session': await call('session.end', selectedId); break;
      case 'retry-session': {
        button.disabled = true;
        try { const restored = await call('session.retry', button.dataset.id); if (page === 'terminal') selectedId = restored.id; renderPage(); }
        finally { button.disabled = false; }
        break;
      }
      case 'export': await call('ledger.export'); break;

    }
  } catch (error) { toast(error.message, true); }
});
document.addEventListener('change', async event => {
  const input = event.target;
  if (input.form?.getAttribute('id') === 'console-defaults-form' && input.name === 'provider') launchDefaultsFields();
  if (input.form?.getAttribute('id') === 'one-off-console-form') {
    if (input.name === 'provider') chooserModels();
    else if (input.name === 'model') chooserFields();
  }
  if (input.form?.getAttribute('id') === 'api-form' && input.name === 'provider') { selectedApi = input.value; renderPage(); }
  if (input.form?.getAttribute('id') === 'tool-form' && input.name === 'type') toolFields();
  if (input.dataset.setting) { try { await call('settings', { [input.dataset.setting]: input.type === 'checkbox' ? input.checked : input.value }); } catch (error) { toast(error.message, true); } }
  if (input.form?.getAttribute('id') === 'rates-form' && ['model','provider'].includes(input.name)) loadRates(input.form);
});
function loadRates(form) {
  const rates = state.settings.rates[`${form.elements.provider.value}:${form.elements.model.value.trim()}`];
  for (const field of ['input', 'output', 'cached', 'cacheWrite']) form.elements[field].value = rates?.[field] ?? '';
}
document.addEventListener('input', event => {
  const input = event.target;
  if (input.form?.getAttribute('id') === 'api-form' && ['model', 'prompt', 'maxOutput'].includes(input.name)) apiDraft[input.name] = input.value;
});
document.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target, data = Object.fromEntries(new FormData(form)); const submit = form.querySelector('[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    if (form.getAttribute('id') === 'one-off-console-form') {
      form.querySelector('.form-error').textContent = '';
      const { customModel, ...overrides } = data;
      if (overrides.model === '__custom__') overrides.model = customModel;
      await openNew(form.dataset.slot, overrides);
    } else if (form.getAttribute('id') === 'console-defaults-form') {
      form.querySelector('.form-error').textContent = '';
      const { permissions, ...consoleDefaults } = data;
      await call('settings', { consoleDefaults, agentPermissions: permissions }); toast('Defaults saved.');
    } else if (form.getAttribute('id') === 'vault-form') {
      $('#vault-error').textContent = ''; await call('vault.save', data); form.elements.key.value = ''; renderPage(); toast('Key encrypted and saved.');
    } else if (form.getAttribute('id') === 'instructions-form') {
      await call('shared.instructions', data.instructions); renderPage(); toast('Instructions saved.');
    } else if (form.getAttribute('id') === 'tool-form') {
      await call('tools.save', toolPayload(form, data)); renderPage(); toast('Tool saved.');
    } else if (form.getAttribute('id') === 'profile-form') {
      await call('profiles.save', data); renderPage(); toast('API saved.');
    } else if (form.getAttribute('id') === 'rates-form') {
      await call('rates.save', data); toast('Rates saved.');
    } else if (form.getAttribute('id') === 'api-form') {
      if (apiBusy) return;
      apiBusy = true; responseError = ''; $('#api-error').textContent = ''; $('#response-meta').textContent = 'IN PROGRESS';
      const result = await call('api.send', data); outputText = result.text || result.error;
      responseMeta = result.entry.status.toUpperCase();
      responseError = result.error || '';
    }
  } catch (error) {
    const target = form.getAttribute('id') === 'vault-form' ? '#vault-error' : form.getAttribute('id') === 'api-form' ? '#api-error' : `#${form.getAttribute('id')} .form-error`;
    if (form.getAttribute('id') === 'api-form') { responseError = error.message; responseMeta = 'REQUEST NOT SENT'; }
    if ($(target)) $(target).textContent = error.message; else toast(error.message, true);
  } finally {
    if (submit?.isConnected) submit.disabled = false;
    if (form.getAttribute('id') === 'api-form') { apiBusy = false; if (page === 'api') renderPage(); }
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'F11') { event.preventDefault(); call('mode', state.mode === 'fullscreen' ? 'dashboard' : 'fullscreen'); }
});

function focusVimSlot(slot) {
  if (state.mode !== 'hud' && !['consoles', 'overview'].includes(page)) { page = 'consoles'; renderPage(); }
  const panel = document.querySelector(state.mode === 'hud' ? `.hud-slot[data-slot="${slot}"]` : `.session-card[data-slot="${slot}"]`);
  panel?.focus({ preventScroll: true });
}
async function vimAction(action, value) {
  if (action === 'page') {
    page = value;
    if (state.mode === 'hud') await call('mode', 'dashboard');
    renderPage();
    if (page === 'consoles') focusVimSlot(vim.slot); else $('#content').focus({ preventScroll: true });
    return;
  }
  if (action === 'sidebar') { await call('settings', { sidebarCollapsed: !state.settings.sidebarCollapsed }); return; }
  if (action === 'fullscreen') { await call('mode', state.mode === 'fullscreen' ? 'dashboard' : 'fullscreen'); return; }
  if (action === 'dock') { await call('mode', 'hud'); focusVimSlot(vim.slot); return; }
  const session = state.sessions.find(x => x.slot === value && (x.alive || x.restoreError));
  if (action === 'open') { if (session) await selectSession(session.id); else await openNew(value); }
  else if (action === 'new') await openNew(value);
  else if (action === 'choose') {
    const button = document.querySelector(`${state.mode === 'hud' ? '#hud' : '#consoles-page'} [data-action="new"][data-slot="${value}"]`);
    if (button) chooseConsole(button);
  } else if (action === 'rename') {
    if (state.mode === 'hud') { page = 'consoles'; await call('mode', 'dashboard'); renderPage(); }
    else focusVimSlot(value);
    document.querySelector(`#consoles-page .console-name[data-name-slot="${value}"]`)?.focus();
  } else if (action === 'type') {
    if (!session?.alive) { toast('Press n to open a console here.'); return; }
    if (state.mode === 'hud') { await selectSession(session.id); return; }
    focusVimSlot(value); selectedId = session.id;
    await terminals.get(session.id)?.ready;
    fitVisible(); terminals.get(session.id)?.term.focus();
  }
}
vim = vimControls({
  context: () => ({ enabled: state?.settings.vimControls === true, view: state?.mode === 'hud' ? 'hud' : page, sessions: state?.sessions || [], busy: windowMoving || openingConsole }),
  focusSlot: focusVimSlot, action: vimAction, onError: message => toast(message, true)
});
setup = firstRun({ call, escape, icon, getState: () => state });
windowDragging(call, () => state);
toolFeatures({ call, getState: () => state, navigate: next => { page = next; renderPage(); }, render: refreshToolSections, toast, escape });
try { state = await call('state'); receive(state); renderPage(); } catch (error) { $('#content').textContent = error.message; }
