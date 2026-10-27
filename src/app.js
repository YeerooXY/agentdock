import { codePanelUI } from './code-panel-ui.js';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './style.css';
import { sharedViews } from './shared-ui.js';
import { holdToChoose } from './launch-gesture.js';
import { vimControls } from './vim-controls.js';
import { firstRun } from './first-run.js';
import { mobileUI } from './mobile-ui.js';
import { setupRequests, apiPresets } from './setup-ui.js';
import { windowDragging } from './window-drag.js';
import { consoleDragging } from './console-drag.js';
import { consoleLayoutUI } from './console-layout-ui.js';
import { consoleMotion } from './console-motion.js';
import { closeConsoleSnapshot, openConsoleEffect, playConsoleStateEffect } from './console-effects.js';
import { consoleAppearance, frameStyles } from './console-appearance.js';
import { terminalTheme, consoleTheme, frameStyles as themeChoices, lightingStyles, starLevels } from './console-themes.js';
import { mountSky, refreshSky, setSkyLevel } from './console-sky.js';
import { terminalOutput } from './terminal-output.js';
import { workbenchUI } from './workbench-ui.js';
import { toolFeatures, syncIntegrationJobs } from './tool-features.js';
import './console-polish.css';
import './setup.css';
import { projectsUI } from './projects-ui.js';
import { consoleProjects } from './console-projects.js';
import { consoleQueue } from './console-queue.js';
import { webPanelUI } from './web-panel-ui.js';
import { imageGenerationUI } from './image-generation-ui.js';
import { sshUI } from './ssh-ui.js';
import './ssh.css';
import { updatesUI } from './updates-ui.js';
import { accountIdentity, accountMark, remainingPercent } from './account-identity.js';
import { shellPicker } from './shell-picker.js';
import { projectUsage } from './project-usage.js';
import { projectDot } from './project-colors.js';
import './account-usage.css';
import './usage-page.css';
import './console-trim.css';
import './console-themes.css';
import { isSettingsPage, settingsShell } from './settings-ui.js';
import { fileLinks, filePreviewDialog } from './file-links.js';
import './theme-system.css';

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
  restore: '<path d="M8 3v5H3m13-5v5h5M3 16h5v5m8 0v-5h5"/>',
  corner: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 4v7h8"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8m0-13v5h-5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 4h7a2 2 0 0 1 2 2v10H3Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  minus: '<path d="M5 12h14"/>',
  menu: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  dock: '<path d="M8 3.5H5.5a2 2 0 0 0-2 2V8m13-4.5h2.5a2 2 0 0 1 2 2V8m0 8v2.5a2 2 0 0 1-2 2H16m-8 0H5.5a2 2 0 0 1-2-2V16"/><path d="m12 6 1.8 4.2L18 12l-4.2 1.8L12 18l-1.8-4.2L6 12l4.2-1.8Z"/>',
  star: '<path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7Z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h7M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.7 5.7 3.7 9s-1.2 6.3-3.7 9c-2.5-2.7-3.7-5.7-3.7-9S9.5 5.7 12 3Z"/>'
};
let iconSequence = 0;
const icon = (name, cls = '') => { const id = `accent-icon-${++iconSequence}`; return `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#${id})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop class="icon-blue"/><stop offset="1" class="icon-pink"/></linearGradient></defs>${icons[name] || icons.terminal}</svg>`; };
// The "Pd" tile. Its edge and letters follow the current theme's accents.
const pdMark = (cls = '') => { const id = `pd-mark-${++iconSequence}`; return `<svg class="pd-mark ${cls}" viewBox="0 0 256 256" aria-hidden="true"><defs><linearGradient id="${id}" x1="20" y1="20" x2="236" y2="236" gradientUnits="userSpaceOnUse"><stop class="icon-blue"/><stop offset="1" class="icon-pink"/></linearGradient></defs><rect x="10" y="10" width="236" height="236" rx="50" fill="#0e0c1c"/><rect x="17" y="17" width="222" height="222" rx="44" fill="none" stroke="url(#${id})" stroke-width="10"/><g fill="none" stroke="url(#${id})" stroke-width="20"><path d="M70 188V76h34a29 29 0 0 1 0 58H70" stroke-linejoin="round"/><circle cx="158" cy="159" r="25"/><path d="M183 72v118"/></g></svg>`; };
const providerName = value => ({ codex: 'Codex', claude: 'Claude Code', shell: state?.platform && state.platform !== 'win32' ? 'Shell' : 'PowerShell', custom: 'Custom', openai: 'OpenAI', anthropic: 'Anthropic' })[value] || state?.agents?.find(x => x.id === value)?.name || value;
const consoleProviders = () => [...(state?.agents?.length ? state.agents.map(x => x.id) : ['codex', 'claude']), 'shell', 'custom'];
const number = value => Number.isFinite(value) ? Intl.NumberFormat('en', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value) : '—';
const labels = { open: 'Open', active: 'Thinking', ready: 'Ready', attention: 'Needs attention', error: 'Error', ended: 'Ended', recent: 'Recent', interrupted: 'Interrupted' };
let state, page = 'consoles', selectedId = null, expandedId = null, expansionRequest = 0, expansionModeIntent = null, stateReceiveVersion = 0, renderedExpansion = null, renderedConsoleVisibility = false, selectedApi = 'openai', apiBusy = false, outputText = '', toastTimer;
let usageAddOpen = false;
let accountProfileDraft = { provider: 'codex', label: '', error: '' }, accountProfileFocus = null, accountProfileBusy = false, accountProfileCreated = null, accountProfileResetOnRender = false;
let accountRenameOpener = null, accountRenameBusy = false;
let apiDraft = { model: '', prompt: '', maxOutput: '1024', projectId: '' }, responseMeta = 'TEXT OUTPUT', responseError = '';
const terminals = new Map();
const pendingConsoleOpenings = new Set();
const gridSize = () => state?.grid || { columns: 3, rows: 3 };
const allPanels = () => [...(state?.sessions || []), ...(state?.codePanels || [])];
const gridCapacity = () => gridSize().columns * gridSize().rows;
let openingConsole = false;
let codePanels, webPanels, launchGesture, chooserOpener, vim, setup, workbench, layoutMotion, phone, projects, projectChats, messageQueue, imageGenerator, updates, usageView;
const nameSaves = new Map();
const launchHint = 'title="Click to open. Hold or right-click to choose." aria-haspopup="dialog"';
let renderedView = null, viewAnimation, windowMoving = false, pageBeforeSettings = 'consoles';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
document.addEventListener('visibilitychange', () => { document.body.dataset.visualPaused = String(document.hidden); });
reducedMotion.addEventListener('change', event => {
  if (event.matches) document.querySelectorAll('.launch-burst,.console-exit').forEach(layer => layer.remove());
  const replay = document.querySelector('[data-preview-opening]');
  if (replay) replay.disabled = event.matches || state?.settings.launchEffect === false;
});
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
const isReady = session => !session.dismissed && session.alive && ['ready', 'attention'].includes(session.state);
const shellMark = provider => `<span class="shell-mark" data-shell="${escape(provider)}" role="img" aria-label="${escape(providerName(provider))}" title="${escape(providerName(provider))}">${['shell', 'custom'].includes(provider) ? icon('terminal') : accountMark(provider)}</span>`;
const readyIcon = session => `<span class="notification-icon">${shellMark(session.provider)}<span class="notification-badge console-ready-badge" ${isReady(session) ? '' : 'hidden'} aria-label="Ready for you">1</span></span>`;
function resizeHandles(slot) {
  return Object.entries({ n: 'top', e: 'right', s: 'bottom', w: 'left', ne: 'top right', nw: 'top left', se: 'bottom right', sw: 'bottom left' }).map(([edge, name]) => `<button class="console-resize" data-resize-edge="${edge}" aria-label="Resize console ${slot} from ${name}" title="Drag to resize. Arrow keys resize one grid cell; Escape cancels."></button>`).join('');
}

$('#app').innerHTML = `
<div id="dashboard" class="app-shell">
  <aside id="sidebar" class="sidebar">
    <button class="brand" data-page="consoles" aria-label="Paddock home"><span class="brand-mark">${pdMark()}</span><span>pad<span class="brand-light">dock</span></span></button>
    <nav aria-label="Main navigation">

      <button data-page="consoles"><span class="notification-icon">${icon('terminal')}<span id="ready-count" class="notification-badge" hidden></span></span>Consoles <span id="nav-count">0</span></button>
      <button data-page="projects">${icon('folder')}Projects</button>
      <button data-page="results"><span class="notification-icon">${icon('grid')}<span id="results-count" class="notification-badge" hidden></span></span>Results</button>
      <button data-page="usage">${icon('chart')}Usage</button>
      <button class="console-api-link" data-page="api">${icon('api')}API requests</button>
    </nav>
    <span class="sidebar-edge" aria-hidden="true"></span>
    <div class="sidebar-bottom"><button data-page="settings">${icon('settings')}Settings</button></div>
  </aside>
  <div class="workspace">
    <header class="titlebar"><button id="sidebar-toggle" class="icon-button" data-action="sidebar" aria-label="Hide sidebar" title="Hide sidebar" aria-controls="sidebar" aria-expanded="true">${icon('menu')}</button><button id="launch-folder" class="launch-folder" data-action="launch-folder" aria-label="Choose launch folder">${icon('folder')}<span></span></button><button type="button" class="subtle code-open" data-code-action="create" title="Open a read-only code panel">${icon('api')}Code</button><button type="button" class="subtle code-open" data-web-action="create" title="Preview a local web server">${icon('globe')}Preview</button><div class="window-drag-handle" data-window-drag title="Drag to move. Double-click for fullscreen." aria-hidden="true"><span></span></div><div class="window-actions"><button data-action="hud" title="Collapse to corner HUD" aria-label="Collapse to corner HUD">${icon('corner')}</button><button data-action="minimize" aria-label="Minimize">${icon('minus')}</button><button data-action="fullscreen" aria-label="Fullscreen" title="Fullscreen">${icon('expand')}</button><button data-action="tray" aria-label="Hide in system tray" title="Hide in system tray">${icon('close')}</button></div></header>
    <main id="content" tabindex="-1"></main>
    <section id="consoles-page" class="console-grid-view" hidden aria-label="Consoles"><div class="consoles-only"><div class="session-grid"></div></div><button id="grid-add" class="primary" data-action="new" aria-label="Add console" title="Add console · Ctrl Shift N" hidden>${icon('plus')}</button></section>
    <div id="terminal-cache" hidden></div>
  </div>
</div>
<section id="hud" hidden aria-label="Paddock desktop HUD"></section>
<dialog id="console-chooser" aria-labelledby="console-chooser-title" aria-describedby="console-chooser-hint">
  <form id="one-off-console-form">
    <div class="dialog-heading"><div><h2 id="console-chooser-title">Open console</h2><p id="console-chooser-hint">Just for this console.</p></div><button type="button" class="icon-button" data-action="cancel-console" aria-label="Close chooser">${icon('close')}</button></div>
    <label>Computer<select name="remoteHostId"><option value="">This PC</option></select></label><label id="chooser-remote-folder" hidden>Linux folder<input name="remoteFolder" value="."></label><div class="chooser-project"><label>Project<div class="folder-input"><select name="projectId"><option value="">No project</option></select><button type="button" class="secondary" id="chooser-new-project">New project</button></div></label><label id="chooser-project-folders" hidden>Start in<select name="projectFolder"></select></label></div>
    <label>Name <span class="optional">optional</span><input name="name" maxlength="64" placeholder="Uses the folder name" autocomplete="off"></label>
    <div class="form-pair"><div class="shell-field"><span>Agent or shell</span><select name="provider" aria-label="Agent or shell">${consoleProviders().map(provider => `<option value="${provider}">${providerName(provider)}</option>`).join('')}</select><input type="hidden" name="accountId"></div><label id="one-off-model">Model<select name="model"><option value="">Agent default</option><option value="__custom__">Enter a model…</option></select></label></div>
    <label id="one-off-custom-model" hidden>Model name<input name="customModel" maxlength="200" spellcheck="false" autocomplete="off" placeholder="Model name or alias"></label>
    <label>Project folder<div class="folder-input"><input name="cwd" required><button type="button" data-action="pick-folder" aria-label="Choose project folder for this console">${icon('folder')}</button></div></label>
    <label id="one-off-command" hidden>Command<textarea name="command" rows="3" maxlength="4000" spellcheck="false" placeholder="The command to run"></textarea></label>
    <details class="console-options"><summary>Options</summary><label id="one-off-permissions">Permissions<select name="permissions"><option value="unrestricted">Unrestricted</option><option value="default">Agent defaults</option></select></label><label class="chooser-check" id="one-off-worktree"><input type="checkbox" name="worktree" value="1"><span>Work in a new Git worktree<small>Its own branch and folder, so agents working in parallel don’t overwrite each other.</small></span></label></details>
    <p class="form-error" role="alert"></p><div class="dialog-footer"><button type="button" class="secondary" data-action="cancel-console">Cancel</button><button type="submit" class="primary">Open console</button></div>
  </form>
</dialog>
<dialog id="account-rename-dialog" aria-labelledby="account-rename-title">
  <form id="account-rename-form">
    <div class="dialog-heading"><div><h2 id="account-rename-title">Rename account</h2></div><button type="button" class="icon-button" data-action="cancel-account-rename" aria-label="Close rename dialog">${icon('close')}</button></div>
    <label>Account name<input name="label" required maxlength="64" autocomplete="off"></label>
    <p class="form-error" role="alert"></p>
    <div class="dialog-footer"><button type="button" class="secondary" data-action="cancel-account-rename">Cancel</button><button type="submit" class="primary">Save name</button></div>
  </form>
</dialog>`;
// Agent choices for the console chooser: installed agents only, one row per
// signed-in Codex or Claude account, most recently used first.
const RECENT_KEY = 'console-recent';
const recentChoices = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '{}'); } catch { return {}; } };
function rememberChoice(provider, accountId) {
  const recent = recentChoices(); recent[`${provider}|${accountId || ''}`] = Date.now();
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* order falls back to open consoles */ }
}
function accountLimits(provider, accountId) {
  return state.limits.filter(x => x.provider === provider && (x.accountId || (provider === 'codex' ? 'codex:default' : provider === 'claude' && x.id === 'claude:account' ? 'claude:default' : x.id)) === accountId);
}
function shortReset(at) {
  if (!at || at <= Date.now()) return '';
  const date = new Date(at);
  return at - Date.now() < 86400000 ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { weekday: 'short' });
}
// The window with the least left decides what an account can still do.
function choiceUsage(provider, accountId) {
  let tightest = null, stale = false;
  for (const entry of accountLimits(provider, accountId)) {
    if (!Number.isFinite(entry.observedAt) || Date.now() - entry.observedAt > 5 * 60000) stale = true;
    for (const w of entry.windows || []) {
      const left = w.unlimited ? null : remainingPercent(w.usedPercent);
      if (left !== null && (!tightest || left < tightest.left)) tightest = { left, resetsAt: w.resetsAt };
    }
  }
  if (!tightest) return { left: null, detail: '' };
  const reset = shortReset(tightest.resetsAt);
  return { left: tightest.left, detail: `${number(tightest.left)}% left${reset ? ' · resets ' + reset : ''}${stale ? ' · cached' : ''}` };
}
function consoleChoices() {
  const form = $('#one-off-console-form'), host = state.sshHosts?.find(h => h.id === form.elements.remoteHostId.value);
  if (host) return ['shell', ...(host.agents || [])].map(provider => ({ provider, accountId: '', label: providerName(provider), group: 'On ' + host.name }));
  const installed = provider => ['shell', 'custom'].includes(provider) || !!state.agents?.find(x => x.id === provider)?.installed || !!state.capabilities?.[provider];
  const rows = [];
  for (const provider of consoleProviders().filter(installed)) {
    const accounts = ['codex', 'claude'].includes(provider) ? (state.accounts || []).filter(a => a.provider === provider && (!a.profile || a.loginCompletedAt)) : [];
    if (accounts.length > 1) for (const a of accounts) rows.push({ provider, accountId: a.id, label: `${providerName(provider)} · ${a.label}` });
    else rows.push({ provider, accountId: accounts[0]?.id || '', label: providerName(provider) });
  }
  const recent = recentChoices();
  for (const row of rows) {
    const opened = state.sessions.filter(s => s.provider === row.provider && (!row.accountId || (s.accountId || `${s.provider}:default`) === row.accountId)).map(s => s.createdAt || 0);
    row.usedAt = Math.max(recent[`${row.provider}|${row.accountId}`] || 0, ...opened);
    Object.assign(row, choiceUsage(row.provider, row.accountId || `${row.provider}:default`));
  }
  for (const provider of new Set(rows.map(row => row.provider))) {
    const same = rows.filter(row => row.provider === provider && row.left !== null);
    if (rows.filter(row => row.provider === provider).length > 1 && same.length) same.reduce((a, b) => b.left > a.left ? b : a).best = true;
  }
  const used = rows.filter(row => row.usedAt).sort((a, b) => b.usedAt - a.usedAt).slice(0, 5);
  for (const row of rows) row.group = used.includes(row) ? 'Recent' : 'Other installed';
  return [...used, ...rows.filter(row => !used.includes(row))];
}
const oneOffShellPicker = shellPicker($('#one-off-console-form [name=provider]'), $('#one-off-console-form [name=accountId]'), {
  mark: shellMark, escape, choices: consoleChoices, more: { label: 'Install more agents…', open: () => { $('#console-chooser').close(); setup.open(); } }
});
$('#account-rename-dialog').addEventListener('close', () => {
  const dialog = $('#account-rename-dialog'), active = document.activeElement;
  const id = $('#account-rename-form').dataset.id;
  const fallback = id ? document.querySelector(`[data-action="account-rename"][data-id="${CSS.escape(id)}"]`) : null;
  const target = accountRenameOpener?.isConnected ? accountRenameOpener : fallback;
  const focusReturned = active === accountRenameOpener || active === fallback;
  const focusVacant = active === dialog || dialog.contains(active) || active === document.body || active === document.documentElement;
  if (focusReturned || focusVacant) target?.focus({ preventScroll: true });
  accountRenameOpener = null;
});
$('#sidebar-toggle').insertAdjacentHTML('afterend', `<button id="results-shortcut" class="results-shortcut" data-page="results" hidden title="New results"><span class="notification-icon">${icon('folder')}<span class="notification-badge"></span></span></button>`);
$('#launch-folder').insertAdjacentHTML('afterend', '<button class="vim-mode" data-action="vim-normal" hidden></button>');
$('#launch-folder').insertAdjacentHTML('afterend', '<button id="screenshot-spot" class="screenshot-spot" data-action="paste-screenshot" draggable="true" hidden><img alt="" width="48" height="27"><span>Paste screenshot</span></button>');
const openFile = filePreviewDialog({ call, toast, icon });
const appearance = consoleAppearance({ call, getState: () => state });
$('#screenshot-spot').addEventListener('dragstart', e => { e.dataTransfer.setData(SCREENSHOT_DRAG, '1'); e.dataTransfer.effectAllowed = 'copy'; });
document.querySelectorAll('.sidebar [data-page]').forEach(button => {
  if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', button.textContent.replace(/\d+$/, '').trim());
});

function pageHeading(eyebrow, title, description, action = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}
function quotaCard(provider, accountId, accountLabel, detailed = false, hideable = false) {
  const values = state.limits.filter(x => x.provider === provider && (x.accountId || (provider === 'codex' ? 'codex:default' : provider === 'claude' && x.id === 'claude:account' ? 'claude:default' : x.id)) === accountId);
  const display = providerName(provider);
  const check = state.usageChecks?.find(item => item.accountId === accountId);
  const card = entry => {
    const windows = Array.isArray(entry?.windows) ? entry.windows : [];
    const stale = entry && (!Number.isFinite(entry.observedAt) || entry.observedAt > Date.now() || Date.now() - entry.observedAt > 5 * 60000 || windows.some(w => w.resetsAt && w.resetsAt <= Date.now()) || (check && !['current', 'refreshing'].includes(check.status)));
    const status = check?.status === 'refreshing' ? 'Checking' : entry ? stale ? 'Cached' : 'Current' : ({ 'sign-in': 'Sign in', 'not-installed': 'Not installed', unsupported: 'Unavailable', limited: 'Try later', timeout: 'Timed out', unavailable: 'Unavailable' })[check?.status] || 'Not checked';
    const message = check?.message || (provider === 'codex' && state.accountError) || 'Refresh to check account usage.';
    return `<article class="quota-card ${detailed ? 'large' : ''}" style="--provider-accent:${accountIdentity(provider).color}">
    <div class="quota-heading">${accountMark(provider)}<strong>${escape(accountLabel)}${entry?.name && entry.name !== display && entry.name !== accountLabel ? ` · ${escape(entry.name)}` : ''}</strong>${entry?.plan ? `<span class="plan">${escape(entry.plan)}</span>` : ''}<span class="connection ${entry && !stale ? 'connected' : ''}" role="status">${status}</span></div>
    ${windows.length ? windows.map(w => {
      const left = remainingPercent(w.usedPercent), known = left !== null;
      const label = w.unlimited ? 'Unlimited' : known ? `${number(left)}% left` : 'Unknown';
      const name = w.label || windowLabel(w.minutes);
      return `<div class="quota-window"><div><span>${escape(name)}</span><strong>${escape(label)}</strong></div>${w.unlimited ? '' : `<div class="meter ${known ? left <= 10 ? 'warning' : '' : 'unknown'}" role="progressbar" aria-label="${escape(display)} ${escape(name)} remaining" ${known ? `aria-valuenow="${left}"` : ''} aria-valuetext="${escape(label)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${left ?? 0}%"></span></div>`}<span class="reset">${Number.isFinite(w.used) && Number.isFinite(w.total) ? escape(`${w.used} of ${w.total} ${w.unit || "credits"} used`) + " ? " : ""}${w.resetLabel ? escape(w.resetLabel) : w.unlimited && !w.resetsAt ? '' : resetTime(w.resetsAt)}</span></div>`;
    }).join('') : `<div class="quota-unavailable"><span class="empty-value">—</span><p>${escape(message)}</p></div>`}
    ${windows.length && check?.message ? `<p class="section-note" role="status">${escape(check.message)}</p>` : ''}
    ${entry && ['codex', 'claude'].includes(provider) && !windows.some(w => w.minutes === 300) ? '<div class="missing-window">5-hour limit not reported</div>' : ''}
    ${entry && ['codex', 'claude'].includes(provider) && !windows.some(w => w.minutes === 10080) ? '<div class="missing-window">Weekly limit not reported</div>' : ''}
    <div class="quota-foot">${entry ? `${stale ? 'Stale snapshot · ' : ''}${age(entry.observedAt)}` : 'No estimated limits'}${detailed && entry ? `<span>${escape(entry.source)}</span>` : ''}${hideable ? `<button class="subtle usage-hide" data-usage-hide="${escape(accountId)}" aria-label="Hide ${escape(accountLabel)} from Usage">Hide</button>` : ''}</div>
  </article>`;
  };
  return values.length ? values.map(card).join('') : card(null);
}
function accountSwitchMenu(session, hostKey) {
  if (!['codex', 'claude'].includes(session.provider) || session.purpose === 'login') return '';
  const targets = (session.switchTargets || []).filter(target => target.ready);
  const label = session.accountLabel || providerName(session.provider);
  if (session.purpose === 'setup') return `<span class="console-account-label" title="Account: ${escape(label)}">${escape(label)}</span>`;
  if (!targets.length) return `<span class="console-account-label" title="${escape(label)}">${escape(label)}</span>`;
  const available = session.draftSupported === true && !session.switching;
  const menuId = `account-menu-${session.id}-${hostKey}`;
  const unavailable = session.draftSupportReason || 'The CLI composer could not be verified for switching.';
  return `<div class="console-account-control"><button class="console-account-toggle" type="button" data-account-menu-toggle aria-haspopup="menu" aria-expanded="false" aria-controls="${menuId}" title="Account: ${escape(label)}">${escape(label)}</button><div id="${menuId}" class="account-menu-items" popover="auto" role="menu" aria-label="Switch account">${targets.map(target => `<button role="menuitem" data-action="account-switch" data-id="${session.id}" data-launch-id="${escape(session.launchId || '')}" data-target-account-id="${escape(target.id)}" ${available ? '' : 'disabled'}>${escape(`Switch to ${target.label}`)}</button><button role="menuitem" data-action="account-setup" data-id="${session.id}" data-launch-id="${escape(session.launchId || '')}" data-target-account-id="${escape(target.id)}">${escape(`Set up ${target.label}`)}</button>`).join('')}${available ? '' : `<small>${escape(unavailable)}</small>`}</div></div>`;
}
function switchOfferHtml(session) {
  const offer = session.switchOffer;
  if (!offer || session.switching) return '';
  return `<div class="account-switch-offer" role="status"><span>Usage reached ${number(offer.usedPercent)}% in the ${escape(windowLabel(offer.minutes))} window.</span><button class="subtle" data-action="account-switch" data-id="${session.id}" data-launch-id="${escape(session.launchId || '')}" data-target-account-id="${escape(offer.targetAccountId)}">Switch to ${escape(offer.targetLabel)}</button><button class="icon-button" data-action="account-switch-dismiss" data-id="${session.id}" data-launch-id="${escape(session.launchId || '')}" data-offer-key="${escape(offer.key)}" aria-label="Dismiss account switch offer" title="Dismiss">${icon('close')}</button></div>`;
}
function replaceSwitchControl(host, selector, html, after) {
  const current = host.querySelector(selector), template = document.createElement('template');
  template.innerHTML = html; const next = template.content.firstElementChild;
  if (current && !next) current.remove();
  else if (!current && next) after?.after(next);
  else if (current && next) {
    const stableMarkup = node => {
      const copy = node.cloneNode(true);
      copy.querySelector('[data-account-menu-toggle]')?.setAttribute('aria-expanded', 'false');
      copy.querySelector('.account-menu-items')?.removeAttribute('style');
      return copy.outerHTML;
    };
    if (stableMarkup(current) !== stableMarkup(next)) current.replaceWith(next);
  }
}
function syncConsoleSwitchUi(host, session) {
  replaceSwitchControl(host, '.console-account-control,.console-account-label', accountSwitchMenu(session, 'panel'), host.querySelector('.panel-status'));
  if (host.querySelector('.console-panel-header')) replaceSwitchControl(host, '.account-switch-offer', switchOfferHtml(session), host.querySelector('.console-panel-header'));
}
function slotNameInput(slot, session) {
  const name = session?.name || state.settings.slotNames?.[slot] || '';
  return `<input class="console-name" data-name-slot="${slot}" data-name-session="${session?.id || ''}" value="${escape(name)}" maxlength="64" aria-label="Name console ${slot}" title="Name this console" placeholder="Name console" autocomplete="off" spellcheck="false">`;
}
function newConsoleMark() {
  return `<span class="new-console-mark" aria-hidden="true">${icon('plus')}<span class="new-console-label"><span>New console</span></span></span>`;
}
function syncSlotName(input, slot, session) {
  if (!input) return;
  if (input !== document.activeElement && !nameSaves.has(slot)) input.value = session?.name || state.settings.slotNames?.[slot] || '';
}
const isOpenConsole = session => !!session && !session.dismissed && (session.alive || session.restoreError);
function sessionCard(slot) {
  const session = allPanels().find(x => x.slot === slot && isOpenConsole(x));
  if (!session) return `<article class="session-card empty" data-slot="${slot}"><header class="empty-panel-header">${slotNameInput(slot)}${appearance.button(slot)}</header><button class="console-launch" data-action="new" data-slot="${slot}" aria-label="Open console ${slot}" ${launchHint} ${openingConsole ? 'disabled' : ''}>${newConsoleMark()}</button></article>`;
  if (session.kind === 'code') return codePanels.card(session);
  if (session.kind === 'web') return webPanels.card(session);
  const expanded = expandedId === session.id;
  const endLabel = session.restoreError ? 'Remove saved console' : 'End this console';
  return `<article class="session-card ${escape(session.state)}${expanded ? ' console-expanded' : ''}" data-console-id="${session.id}" data-slot="${slot}"><header class="console-panel-header"><button class="console-grip" draggable="true" data-console-drag="${session.id}" aria-label="Move console ${slot}" title="Drag to move or swap. Focus here and press Alt + 1–9 to move.">${readyIcon(session)}</button><span class="slot" title="${escape(providerName(session.provider) + ' · ' + session.cwd)}">${String(slot).padStart(2, '0')}</span>${slotNameInput(slot, session)}${session.worktree ? `<span class="worktree-badge" role="img" aria-label="${escape(`Git worktree branch ${session.worktree.branch}`)}" title="${escape(`Git worktree on ${session.worktree.branch}\n${session.worktree.path}`)}"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="5.5" r="1.6"/><path d="M4 5.1v5.8M12 7.1c0 2.6-3 3-6.6 4.4"/></svg><span class="worktree-name">${escape(session.worktree.branch.replace(/^paddock\//, ''))}</span></span>` : ''}<span class="panel-status">${badge(session.state)}</span>${accountSwitchMenu(session, 'panel')}${projectChats.button(session)}${textSizeButtons(session.id, `console ${slot}`)}${appearance.button(slot)}<button class="icon-button console-expand" data-action="toggle-console" data-id="${session.id}" aria-label="${expanded ? 'Restore console ' + slot + ' to the grid (Ctrl+Shift+Enter)' : 'Expand console ' + slot}" aria-keyshortcuts="${expanded ? 'Control+Shift+Enter' : ''}" title="${expanded ? 'Restore console · Ctrl+Shift+Enter' : 'Expand console'}">${icon(expanded ? 'restore' : 'expand')}</button><button class="icon-button console-close" data-action="end-session" data-id="${session.id}" aria-label="${endLabel} ${slot}" title="${endLabel}">${icon('close')}</button></header>${switchOfferHtml(session)}<div class="console-panel-body" data-terminal-mount="${session.id}"></div>${messageQueue?.button(session) || ''}${resizeHandles(slot)}</article>`;
}
function coveredSlots() {
  return new Map(allPanels().filter(isOpenConsole).flatMap(x => Array.from({ length: x.height || 1 }, (_, y) => Array.from({ length: x.width || 1 }, (_, dx) => [x.slot + y * gridSize().columns + dx, x])).flat()));
}
function openConsole(id) {
  return allPanels().find(item => item.id === id && isOpenConsole(item)) || null;
}
function syncExpandedConsole() {
  const expanded = !!expandedId && !!openConsole(expandedId);
  if (!expanded) expandedId = null;
  $('#consoles-page').classList.toggle('has-expanded-console', expanded);
  $('#consoles-page').dataset.expandedConsole = expanded ? expandedId : '';
  document.body.classList.toggle('console-expanded', expanded);
  const target = expanded ? document.querySelector(`.session-card[data-console-id="${CSS.escape(expandedId)}"]`) : null;
  for (const panel of document.querySelectorAll('.session-grid > .session-card')) {
    const selected = panel === target;
    panel.classList.toggle('console-expanded', selected);
    panel.inert = !!expanded && !selected;
    panel.setAttribute('aria-hidden', String(!!expanded && !selected));
    if (!expanded) {
      const grip = panel.querySelector('.console-grip');
      if (grip) { grip.disabled = false; grip.draggable = true; }
      panel.querySelectorAll('.console-resize').forEach(handle => { handle.disabled = false; });
      const expand = panel.querySelector('[data-action="toggle-console"]');
      if (expand) {
        const slot = panel.dataset.slot || '';
        expand.setAttribute('aria-label', `Expand console ${slot}`);
        expand.setAttribute('aria-keyshortcuts', '');
        expand.setAttribute('aria-expanded', 'false');
        expand.title = 'Expand console';
        expand.innerHTML = icon('expand');
      }
    }
  }
  applySidebar();
  return expanded ? openConsole(expandedId) : null;
}
function recentSection() {
  const entries = state.recent.filter(x => !state.sessions.some(s => s.providerSessionId === x.id));
  return `<section class="recent-section"><div class="section-label"><h2>Outside the dock</h2><span>Recent Codex activity · read only</span></div>${entries.length ? entries.slice(0, 5).map(x => `<div class="recent-row"><span class="provider-icon codex">◈</span><div><strong>${escape(x.name)}</strong><small title="${escape(x.cwd)}">${escape(x.cwd)}</small></div>${badge(x.state)}<span class="mono recent-tokens">${x.usage ? number(x.usage.total) + ' tokens' : 'Usage unavailable'}</span><time>${age(x.updatedAt)}</time></div>`).join('') : '<div class="inline-empty">Recent Codex sessions will appear here. No transcript text is copied into the tracker.</div>'}</section>`;
}
function renderConsoles() {
  if (layoutMotion?.active) return;
  const before = layoutMotion?.capture();
  const grid = $('.session-grid'), covered = coveredSlots(), expanded = syncExpandedConsole();
  const consoleVisible = state.mode !== 'hud' && ['consoles', 'overview'].includes(page);
  const refreshDecorations = renderedExpansion !== (expanded?.id || null) || renderedConsoleVisibility !== consoleVisible;
  grid.style.setProperty('--grid-columns', gridSize().columns); grid.style.setProperty('--grid-rows', gridSize().rows);
  $('#grid-add').hidden = !!expanded || covered.size < gridCapacity();
  while (grid.children.length > gridCapacity()) grid.lastElementChild.remove();
  for (let slot = 1; slot <= gridCapacity(); slot++) {
    const session = allPanels().find(x => x.slot === slot && isOpenConsole(x));
    let panel = grid.children[slot - 1];
    if (!panel || (panel.dataset.consoleId || '') !== (session?.id || '')) {
      const returnFocus = !session && panel?.contains(document.activeElement);
      const previous = terminals.get(panel?.dataset.consoleId);
      if (previous && panel.contains(previous.node)) $('#terminal-cache').append(previous.node);
      const template = document.createElement('template'); template.innerHTML = sessionCard(slot);
      const replacement = template.content.firstElementChild, launched = session?.alive && pendingConsoleOpenings.delete(session.id);
      if (panel) panel.replaceWith(replacement); else grid.append(replacement);
      panel = replacement;
      if (launched) requestAnimationFrame(() => launchBurst(replacement));
      if (returnFocus) replacement.querySelector('[data-action="new"]')?.focus({ preventScroll: true });
    }
    panel.hidden = covered.has(slot) && covered.get(slot).slot !== slot;
    const isExpanded = !!expanded && session?.id === expanded.id;
    panel.inert = !!expanded && !isExpanded;
    panel.setAttribute('aria-hidden', String(!!expanded && !isExpanded));
    appearance.sync(panel, slot);
    panel.style.gridColumn = `${(slot - 1) % gridSize().columns + 1} / span ${session?.width || 1}`;
    panel.style.gridRow = `${Math.floor((slot - 1) / gridSize().columns) + 1} / span ${session?.height || 1}`;
    if (session?.kind === 'code' || session?.kind === 'web') {
      const kind = session.kind === 'web' ? 'preview' : 'code';
      panel.classList.toggle('console-expanded', isExpanded); panel.setAttribute('aria-label', session.kind === 'web' ? 'Preview panel' : 'Code panel');
      if (session.kind === 'web') webPanels.mount(session, panel.querySelector('.web-panel-body'));
      else codePanels.mount(session, panel.querySelector('.code-panel-body'));
      const expand = panel.querySelector('[data-action="toggle-console"]'); expand.innerHTML = icon(isExpanded ? 'restore' : 'expand'); expand.setAttribute('aria-label', isExpanded ? `Restore ${kind} panel to grid` : `Expand ${kind} panel`); expand.setAttribute('aria-expanded', String(isExpanded));
      panel.querySelectorAll('.console-grip,.console-resize').forEach(handle => { handle.disabled = !!expanded; });
      continue;
    }
    syncSlotName(panel.querySelector('.console-name'), slot, session);
    panel.tabIndex = -1;
    panel.setAttribute('aria-label', `Console ${slot}${session?.name || state.settings.slotNames?.[slot] ? ': ' + (session?.name || state.settings.slotNames[slot]) : ''}`);
    mountSky(panel, slot);
    if (!session) {
      panel.querySelector('[data-action="new"]').disabled = openingConsole; continue;
    }
    const project = state.projects?.find(p => p.id === session.projectId);
    let projectColorMark = panel.querySelector('.console-project-color');
    if (project) {
      if (!projectColorMark) { projectColorMark = document.createElement('span'); projectColorMark.className = 'console-project-color'; panel.querySelector('.console-name').before(projectColorMark); }
      const color = project.color || '';
      if (projectColorMark.dataset.color !== color) { projectColorMark.innerHTML = projectDot(project); projectColorMark.dataset.color = color; projectColorMark.title = project.name; }
      projectColorMark.title = project.name;
    } else projectColorMark?.remove();
    if (panel.dataset.state !== session.state) {
      panel.className = `session-card ${session.state}`; panel.dataset.state = session.state;
      panel.querySelector('.panel-status').innerHTML = badge(session.state);
    }
    panel.classList.toggle('console-expanded', isExpanded);
    syncConsoleSwitchUi(panel, session);
    panel.querySelector('.console-ready-badge').hidden = !isReady(session);
    panel.querySelector('[data-console-drag]').setAttribute('aria-label', `Move console ${slot}${isReady(session) ? ', ready for you' : ''}`);
    if (session.restoreError && !panel.querySelector('[data-action="retry-session"]')) {
      panel.querySelector('.console-panel-header [data-action="toggle-console"]').insertAdjacentHTML('beforebegin', `<button class="icon-button" data-action="retry-session" data-id="${session.id}" aria-label="Retry console ${slot}" title="Try reopening">${icon('refresh')}</button>`);
    }
    const expand = panel.querySelector('[data-action="toggle-console"]');
    const isExpandedNow = expanded?.id === session.id;
    expand.setAttribute('aria-label', `${isExpandedNow ? 'Restore console ' + slot + ' to the grid (Ctrl+Shift+Enter)' : 'Expand console ' + slot}`);
    expand.setAttribute('aria-keyshortcuts', isExpandedNow ? 'Control+Shift+Enter' : '');
    expand.title = isExpandedNow ? 'Restore console · Ctrl+Shift+Enter' : 'Expand console';
    expand.innerHTML = icon(isExpandedNow ? 'restore' : 'expand');
    expand.setAttribute('aria-expanded', String(isExpandedNow));
    const grip = panel.querySelector('.console-grip');
    grip.draggable = !expanded;
    grip.disabled = !!expanded;
    panel.querySelectorAll('.console-resize').forEach(handle => { handle.disabled = !!expanded; });
    const end = panel.querySelector('[data-action="end-session"]');
    const endLabel = session.restoreError ? 'Remove saved console' : 'End this console';
    end.title = endLabel;
    end.setAttribute('aria-label', `${endLabel} ${slot}`);
    mountTerminal(session, panel.querySelector('.console-panel-body'), true);
  }
  codePanels?.sync();
  webPanels?.sync();
  if (refreshDecorations) refreshSky();
  renderedExpansion = expanded?.id || null;
  renderedConsoleVisibility = consoleVisible;
  if (before) layoutMotion.animate(before);
  projectChats?.sync();
  messageQueue?.sync();
  scheduleFits();
  lightingChanged();
}
// Cross-agent reviews: optional, off by default, limited to the user's own Claude Code and Codex sign-ins.
function delegationSection() {
  const on = state.settings.delegationEnabled === true, allowed = state.settings.delegationProviders || ['claude', 'codex', 'kiro'];
  const states = { running: 'Reviewing', done: 'Done', failed: 'Failed', stopped: 'Stopped' };
  const rows = (state.delegations || []).slice(0, 6).map(job => `<div class="delegation-row"><span><strong>${escape(job.reviewer.label)}</strong> · ${states[job.state] || escape(job.state)}${job.verdict ? ' · ' + (job.verdict === 'approve' ? 'Approved' : job.verdict === 'changes-requested' ? 'Changes requested' : 'No clear verdict') : ''}<small>For ${escape(job.consoleName || 'a console')}. ${escape(job.error || job.why)}</small></span>${job.state === 'running' ? `<button class="secondary" data-delegation-stop="${escape(job.id)}">Stop</button>` : ''}</div>`).join('');
  return `<section class="surface delegation-settings"><div class="section-label"><div><h2>Cross-agent reviews</h2><p>An agent can ask another of your subscriptions to review its changes.</p></div></div><label class="check-row"><input type="checkbox" data-setting="delegationEnabled" ${on ? 'checked' : ''}>Allow cross-agent reviews</label><fieldset class="delegation-reviewers" ${on ? '' : 'disabled'}><legend>Reviewers</legend>${[['claude', 'Claude Code'], ['codex', 'Codex'], ['kiro', 'Kiro']].map(([id, name]) => `<label class="check-row"><input type="checkbox" data-delegation-provider="${id}" ${allowed.includes(id) ? 'checked' : ''}>${name}</label>`).join('')}</fieldset><p class="field-hint">Paddock runs the reviewer’s own CLI read-only with your sign-in, picks the account with the most usage left and saves each review in Results. The changed code goes to the reviewer’s vendor. Up to 2 at a time and 20 an hour.</p>${rows ? `<div class="delegation-list">${rows}</div>` : ''}</section>`;
}
function ledgerTable() {
  return state.ledger.length ? `<div class="table-scroll"><table><thead><tr><th>Time</th><th>Provider / model</th><th>Input</th><th>Output</th><th>Status</th></tr></thead><tbody>${state.ledger.slice(0, 100).map(row => `<tr><td>${new Date(row.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td><strong class="ledger-provider">${accountMark(row.provider)}${escape(providerName(row.provider))}</strong><small>${escape(row.model)}</small></td><td class="mono">${number(row.usage?.input)}</td><td class="mono">${number(row.usage?.output)}</td><td><span class="ledger-status ${row.status}">${escape(row.status)}</span></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-ledger"><span class="empty-illustration">${icon('chart')}</span><h3>No API requests yet</h3><p>Requests made here will appear below.</p><button class="secondary" data-page="api">Open API workspace ${icon('arrow')}</button></div>`;
}
function renderUsage() {
  const summary = state.summary;
  const subscriptions = [...(state.usageAccounts || state.accounts || [])].sort((a,b) => Number(!!(b.hasUsage || state.limits.some(x => (x.accountId || x.id) === b.id))) - Number(!!(a.hasUsage || state.limits.some(x => (x.accountId || x.id) === a.id))));
  // Only set-up subscriptions are listed; the rest wait behind Add subscription.
  const limitOnly = state.limits.filter(entry => !subscriptions.some(account => account.id === (entry.accountId || (entry.provider === 'codex' ? 'codex:default' : entry.id === 'claude:account' ? 'claude:default' : entry.id)))).map(entry => ({ id: entry.accountId || entry.id, provider: entry.provider, label: entry.name || providerName(entry.provider), hasUsage: true }));
  const hidden = new Set(state.settings.usageHidden || []), shown = new Set(state.settings.usageShown || []);
  const listed = [...subscriptions, ...limitOnly], visible = listed.filter(account => !hidden.has(account.id) && (account.hasUsage || account.inUse || shown.has(account.id)));
  const addable = listed.filter(account => !visible.includes(account));
  const accountCards = visible.map(account => quotaCard(account.provider, account.id, account.label, true, true)).join('') || '<p class="section-note usage-empty">No subscriptions yet. Add one to see its limits.</p>';
  const addPanel = usageAddOpen ? `<div class="usage-add" id="usage-add-panel" role="group" aria-label="Add a subscription">${addable.length ? `<p>Installed agents</p><div class="usage-add-list">${addable.map(account => `<button type="button" class="secondary" data-usage-show="${escape(account.id)}">${accountMark(account.provider)}<span>${escape(account.label)}</span></button>`).join('')}</div>` : ''}<p>Another account</p><div class="usage-add-list"><button type="button" class="secondary" data-usage-new-account="codex">${accountMark('codex')}<span>Codex account</span></button><button type="button" class="secondary" data-usage-new-account="claude">${accountMark('claude')}<span>Claude Code account</span></button></div></div>` : '';
  const profileCards = (state.accounts || []).filter(account => account.profile).map(account => `<article class="account-profile-row"><div>${accountMark(account.provider)}<span><strong>${escape(account.label)}</strong><small>${providerName(account.provider)} · ${account.loginCompletedAt ? 'Signed in' : 'Sign-in needed'}</small></span></div><span><button class="subtle" data-action="account-login" data-id="${escape(account.id)}">${account.loginCompletedAt ? 'Sign in again' : 'Sign in'}</button><button class="subtle" data-action="account-rename" data-id="${escape(account.id)}" data-label="${escape(account.label)}">Rename</button><button class="subtle danger" data-action="account-remove" data-id="${escape(account.id)}" aria-label="Remove ${escape(account.label)}">Remove</button></span></article>`).join('');
  return pageHeading('', 'Usage', '', '<button class="secondary" data-action="refresh" ' + (state.refreshing ? 'disabled aria-busy="true"' : '') + '>' + icon('refresh') + (state.refreshing ? 'Checking accounts…' : 'Refresh') + '</button>') +
    '<div class="stats-row usage-stats"><div class="stat"><span>API requests · 30 days</span><strong>' + summary.requests + '</strong></div><div class="stat"><span>API tokens · 30 days</span><strong>' + (summary.unknownUsage && !summary.tokens ? '—' : number(summary.tokens) + (summary.unknownUsage ? '+' : '')) + '</strong></div></div>' +
    `<section class="surface account-switch-settings"><div class="section-label"><div><h2>Subscriptions</h2><p>Account-wide limits, checked every two minutes.</p></div><button type="button" class="secondary" data-action="usage-add" aria-expanded="${usageAddOpen}" aria-controls="usage-add-panel">${icon('plus')}Add subscription</button></div>${addPanel}<div class="usage-grid">${accountCards}</div><h2>Account switching</h2><form id="account-profile-form" class="account-profile-form"><label>Provider<select name="provider" ${accountProfileCreated ? 'disabled' : ''}><option value="codex" ${accountProfileDraft.provider === 'codex' ? 'selected' : ''}>Codex</option><option value="claude" ${accountProfileDraft.provider === 'claude' ? 'selected' : ''}>Claude Code</option></select></label><label>Account name<input name="label" required maxlength="64" autocomplete="off" value="${escape(accountProfileDraft.label)}" ${accountProfileCreated ? 'disabled' : ''}></label><button class="secondary" type="submit" ${accountProfileBusy ? 'disabled' : ''}>${accountProfileCreated ? 'Retry sign-in' : 'Add account'}</button>${accountProfileCreated ? '<p class="field-hint">This account is saved. Retry sign-in to open its console.</p>' : ''}<p class="form-error" role="alert">${escape(accountProfileDraft.error)}</p></form><div class="account-profile-list">${profileCards || '<p class="section-note">No additional accounts.</p>'}</div><div class="account-switch-threshold"><label>Offer a switch at <input type="number" min="50" max="100" data-setting="accountSwitchThreshold" value="${state.settings.accountSwitchThreshold ?? 90}">%</label><label><input type="checkbox" data-setting="autoSwitchAccounts" ${state.settings.autoSwitchAccounts ? 'checked' : ''}>Switch automatically while idle</label><p class="field-hint">Automatic switching is off by default. It needs fresh usage for both accounts and an idle console.</p></div><p class="section-note">Use subscriptions within provider terms. Switching accounts must respect each provider’s rate limits and restrictions.</p></section>${delegationSection()}<section class="ledger-panel"><div class="section-label"><div><h2>API requests</h2><p>Requests made through Paddock.</p></div><button class="subtle" data-action="export">Export</button></div>${ledgerTable()}<div class="ledger-foot">${state.ledger.length > 100 ? 'Latest 100 shown. Export includes all records. ' : ''}Tool steps count as separate requests.</div></section>`;
}
function messageUsageTable() { return usageView.render(); }

function renderApi() {
  const profiles = state.shared.profiles;
  if (!profiles.some(x => x.id === selectedApi)) selectedApi = profiles[0]?.id || '';
  const profile = profiles.find(x => x.id === selectedApi);
  const hasKey = profile && (!profile.keyId || state.vault.entries.some(x => x.id === profile.keyId));
  return pageHeading('', 'API', 'Your shared tools and instructions are included.') + '<div class="api-columns"><form id="api-form" class="surface api-form"><h2>New request</h2><label>Project<select name="projectId"><option value="">No project</option>' + (state.projects || []).filter(x => x.status !== 'archived').map(x => '<option value="' + escape(x.id) + '">' + escape(x.name) + '</option>').join('') + '</select></label><label>API<select name="provider">' + profiles.map(x => '<option value="' + escape(x.id) + '" ' + (x.id === selectedApi ? 'selected' : '') + '>' + escape(x.name) + '</option>').join('') + '</select></label><div class="key-state ' + (hasKey ? 'saved' : '') + '">' + icon('lock') + (hasKey ? profile.keyId ? 'Key connected' : 'No key required' : 'Add a profile and enter or select its key in Settings → API.') + '</div><label>Model<input name="model" required maxlength="150" placeholder="Model ID" autocomplete="off"></label><label>Prompt<textarea name="prompt" rows="9" required maxlength="100000" placeholder="What are we working on?"></textarea></label><label>Max output tokens per step<input type="number" name="maxOutput" min="16" max="32768" value="1024" required></label><p class="field-hint">Each request starts fresh. Up to 8 model steps with tools.</p><p id="api-error" class="form-error" role="alert"></p><button type="submit" class="primary wide" ' + (!hasKey || apiBusy ? 'disabled' : '') + '>' + icon('arrow') + (apiBusy ? 'Working…' : 'Send') + '</button></form><section class="surface response-panel"><div class="section-label"><h2>Response</h2><span id="response-meta" class="small-label"></span></div><pre id="api-response">' + escape(outputText || 'Your response will appear here.') + '</pre></section></div>';
}
function renderTools() { return sharedViews(state, { escape, icon, pageHeading }).tools(); }
// Connections and integration states shown by the Tools lists, without live status.
const toolListKey = () => JSON.stringify([state.shared.connections.map(x => [x.id, x.enabled, x.integration]), (state.integrations || []).map(x => [x.id, x.connected, x.ready, x.enabled])]);
let renderedToolList = '';
function refreshToolSections() {
  if (page !== 'tools') return;
  renderedToolList = toolListKey();
  const drafts = [...document.querySelectorAll('.integrations input, .integrations select')].map(field => [field.name, field.value]);
  const focusedSetup = document.activeElement?.dataset.integrationSetup;
  const template = document.createElement('template'); template.innerHTML = renderTools();
  for (const selector of ['.integrations', '.connection-list', '.setup-requests']) document.querySelector(selector)?.replaceWith(template.content.querySelector(selector));
  for (const [name, value] of drafts) { const field = document.querySelector(`.integrations [name="${name}"]`); if (field) field.value = value; }
  if (focusedSetup) document.querySelector(`[data-integration-setup="${focusedSetup}"]`)?.focus({ preventScroll: true });
}
function renderInstructions() { return sharedViews(state, { escape, icon, pageHeading }).instructions(); }
function renderLaunchDefaults() {
  const defaults = state.settings.consoleDefaults;
  return `<form id="console-defaults-form" class="surface"><h2>Console defaults</h2><p class="field-hint">Used when you click +.</p><div class="form-pair"><label>Agent or shell<select name="provider">${consoleProviders().map(provider => `<option value="${provider}" ${defaults.provider === provider ? 'selected' : ''}>${providerName(provider)}</option>`).join('')}</select></label><label id="default-permissions">Permissions<select name="permissions" data-setting="agentPermissions"><option value="unrestricted" ${state.settings.agentPermissions === 'unrestricted' ? 'selected' : ''}>Unrestricted</option><option value="default" ${state.settings.agentPermissions !== 'unrestricted' ? 'selected' : ''}>Agent defaults</option></select></label></div><label>Project folder<div class="folder-input"><input name="cwd" required value="${escape(defaults.cwd)}"><button type="button" data-action="pick-folder" aria-label="Choose default project folder">${icon('folder')}</button></div></label><label>Name <span class="optional">optional</span><input name="name" maxlength="64" value="${escape(defaults.name)}" placeholder="Uses the folder name"></label><label id="default-command">Custom command<textarea name="command" rows="3" maxlength="4000" spellcheck="false" placeholder="The command to run">${escape(defaults.command)}</textarea></label><p id="default-provider-hint" class="field-hint"></p><p class="form-error" role="alert"></p><button type="submit" class="primary">Save defaults</button></form>`;
}
function renderBaseSettings() {
  const installed = (state.agents || []).map(agent => '<div class="connection-row"><span>' + escape(agent.name) + '</span><span>' + (agent.installed ? 'Installed' : 'Not installed') + '</span><button class="subtle" data-docs="' + agent.id + '">Guide</button></div>').join('');
  return pageHeading('', 'Settings', '') + '<div class="settings-layout"><section class="surface"><h2>Desktop</h2><label class="toggle-row"><span><strong>Keep HUD above other apps</strong><small>Other windows can cover the HUD when this is off.</small></span><input type="checkbox" data-setting="hudAlwaysOnTop" ' + (state.settings.hudAlwaysOnTop ? 'checked' : '') + '></label><label class="toggle-row"><span><strong>Notify when an agent needs you</strong></span><input type="checkbox" data-setting="notifications" ' + (state.settings.notifications ? 'checked' : '') + '></label><label class="toggle-row"><span><strong>Confirm before ending a console</strong><small>Turn off to end or remove the selected console without a prompt.</small></span><input type="checkbox" data-setting="confirmConsoleEnd" ' + (state.settings.confirmConsoleEnd !== false ? 'checked' : '') + '></label><label class="toggle-row"><span><strong>Keep PC awake while agents work</strong><small>Your screen can still turn off.</small></span><input type="checkbox" data-setting="keepAwakeWhileWorking" ' + (state.settings.keepAwakeWhileWorking ? 'checked' : '') + '></label></section><section class="surface"><div class="section-label"><h2>Agents</h2><button class="primary" data-action="agent-setup">Set up agents</button></div>' + installed + '<button class="secondary danger" data-action="quit">Quit Paddock</button></section></div>';
}
function renderShortcutSettings() {
  return '<section class="surface"><h2>Shortcuts</h2><div class="shortcut-row"><span>Show or collapse</span><kbd>Ctrl Alt Space</kbd></div><div class="shortcut-row"><span>Open a console</span><kbd>Ctrl Alt 1-9</kbd></div><div class="shortcut-row"><span>Restore expanded console</span><kbd>Ctrl Shift Enter</kbd></div><p class="field-hint">Close hides Paddock in the system tray. Consoles keep running. Use Quit to stop the app.</p></section>';
}
function renderSettingsCategory() {
  const base = document.createElement('template'); base.innerHTML = renderBaseSettings();
  const sections = [...base.content.querySelectorAll('.settings-layout > .surface')];
  const views = sharedViews(state, { escape, icon, pageHeading });
  let content;
  if (page === 'appearance') content = renderAppearanceSettings();
  else if (page === 'console-settings') content = '<div class="settings-column">' + renderLaunchDefaults() + renderKeyboardSettings() + '</div><div class="settings-column">' + renderGridSettings() + (sections[1]?.outerHTML || '') + '</div>';
  else if (page === 'devices') content = (remoteHosts?.html() || '') + (phone?.renderSettings() || '');
  else if (page === 'api-settings') content = views.apis();
  else if (page === 'tools') { content = renderTools(); renderedToolList = toolListKey(); }
  else if (page === 'instructions') content = renderInstructions();
  else content = '<div class="settings-general-columns"><div class="settings-column">' + (sections[0]?.outerHTML || '') + renderShortcutSettings() + '</div><div class="settings-column">' + renderStartupSettings() + renderProjectSettings() + renderResultsSettings() + '</div></div>' + (updates?.render() || '');
  return settingsShell(page, `<div class="settings-layout${page === 'console-settings' ? ' settings-console-grid' : ''}">${content}</div>`, icon('close'), state.settings.trimStyle || 'classic');
}
function renderStartupSettings() {
  return `<section class="surface"><h2>Startup</h2><label class="toggle-row"><span><strong>Restore previous consoles</strong><small>Reopen your panels and folders. Saved agent chats resume; shells and custom commands restart.</small></span><input type="checkbox" data-setting="restoreConsoles" ${state.settings.restoreConsoles ? 'checked' : ''}></label><label class="toggle-row"><span><strong>Keep scrollback in Codex consoles</strong><small>Codex runs inline, so you can scroll up and select text to copy. Applies to Codex consoles opened after the change.</small></span><input type="checkbox" data-setting="codexScrollback" ${state.settings.codexScrollback !== false ? 'checked' : ''}></label><p id="workspace-error" class="form-error" role="alert">${escape(state.workspaceError || '')}</p></section>`;
}
function renderResultsSettings() {
  return `<section class="surface"><h2>Results</h2><p class="field-hint">Agents save the documents, images, designs, reports and exports you ask them to create. Add other files from Results.</p><label class="toggle-row"><span><strong>Also capture file changes</strong><small>Copy code diffs and changed images after each turn.</small></span><input type="checkbox" data-setting="autoSaveResults" ${state.settings.autoSaveResults === true ? 'checked' : ''}></label><p class="field-hint">Optional. Turning this off stops current captures. Requested outputs and files you add are still saved.</p></section>`;
}
function renderProjectSettings() {
  return `<section class="surface" id="project-settings"><h2>Projects</h2><label class="toggle-row"><span><strong>Suggest project setup</strong><small>Ask when a chat has no project. “Don't ask again” turns this off.</small></span><input type="checkbox" data-setting="suggestProjects" ${state.settings.suggestProjects !== false ? 'checked' : ''}></label><button class="subtle" data-page="projects">View project progress ${icon('arrow')}</button></section>`;
}
function renderAppearanceSettings() {
  const options = (choices, selected) => choices.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
  const theme = state.settings.trimStyle || 'classic', stars = starLevel();
  return `<section class="surface"><h2>Theme</h2><p class="field-hint">Colors the sidebar, buttons, settings and every console. Each console can still use its own theme: click the color dot in its header.</p>
    <fieldset class="theme-choices"><legend class="sr-only">Theme</legend>${themeChoices.map(([id, label]) => `<label class="theme-choice" data-frame="${id}"><input type="radio" name="theme" data-setting="trimStyle" value="${id}" ${id === theme ? 'checked' : ''}><span class="theme-chip" aria-hidden="true"></span><span><strong>${label}</strong><small>${consoleTheme(id).detail}</small></span></label>`).join('')}</fieldset>
    <div class="settings-theme-preview">${appearance.preview(theme)}</div></section>
  <section class="surface"><h2>Lighting</h2>
    <label>Effect<select data-setting="lighting">${options(lightingStyles, state.settings.lighting || 'static')}</select></label>
    <p class="field-hint">Wave sends one color wave across every console and the sidebar edge. Reactive lights a console when you type in it or it prints output.</p>
    <label>Speed<select data-setting="lightingSpeed">${options([['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], state.settings.lightingSpeed || 'normal')}</select></label>
    <label>Trim width<select data-setting="trimWidth">${options([1, 2, 3, 4, 6].map(value => [String(value), `${value} px`]), String(state.settings.trimWidth || 1))}</select></label>
  </section>
  <section class="surface"><h2>Sky</h2>
    <label class="star-scale">Stars <output id="star-level-name">${starLevels[stars]}</output><input type="range" min="0" max="4" step="1" value="${stars}" data-setting="starDensity" aria-valuetext="${starLevels[stars]}"></label>
    <p class="field-hint">More stars are brighter. Arctic shows snow, Inferno embers and Cyber falling data. Console apps can cover them with their own backgrounds.</p>
    <label class="toggle-row"><span><strong>Theme textures</strong><small>Painted backgrounds behind each console, such as frost for Arctic and lava for Inferno.</small></span><input type="checkbox" data-setting="themeTextures" ${state.settings.themeTextures !== false ? 'checked' : ''}></label>
    <label class="toggle-row"><span><strong>Ambient motion</strong><small>Drifting stars, shooting stars and lighting effects.</small></span><input type="checkbox" data-setting="ambientMotion" ${state.settings.ambientMotion !== false ? 'checked' : ''}></label>
  </section>
  <section class="surface"><h2>Consoles</h2>
    <label class="toggle-row"><span><strong>Console animations</strong><small>Theme openings and session effects.</small></span><input type="checkbox" data-setting="launchEffect" ${state.settings.launchEffect !== false ? 'checked' : ''}></label>
    <label class="toggle-row"><span><strong>Blink cursor</strong></span><input type="checkbox" data-setting="cursorBlink" ${state.settings.cursorBlink ? 'checked' : ''}></label>
  </section>`;
}
function starLevel() {
  const value = state.settings.starDensity;
  return Number.isInteger(value) && value >= 0 && value <= 4 ? value : state.settings.panelStars === false ? 0 : 2;
}
function ensureBackdropSky(region, slot) {
  region.dataset.frame = state.settings.trimStyle || 'classic';
  if (region.id === 'content') {
    let layer = region.querySelector(':scope > .page-background-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'page-background-layer';
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '<span class="page-backdrop"></span>';
      region.prepend(layer);
    }
    mountSky(layer, slot);
    return;
  }
  if (!region.querySelector(':scope > .page-backdrop')) region.insertAdjacentHTML('afterbegin', '<span class="page-backdrop" aria-hidden="true"></span>');
  mountSky(region, slot);
}
function renderGridSettings() {
  return `<form id="grid-form" class="surface"><h2>Console grid</h2><div class="form-pair">${[['columns','Columns'],['rows','Rows']].map(([name,label]) => `<label>${label}<input name="${name}" type="number" min="2" max="8" value="${gridSize()[name]}" required></label>`).join('')}</div><p class="field-hint">A full grid makes room or grows when you add a console. Up to 64 panels.</p><p class="form-error" role="alert"></p><button type="submit" class="primary">Apply grid</button></form>`;
}
function renderKeyboardSettings() {
  return `<section class="surface"><h2>Keyboard</h2><div class="shortcut-row"><span>New console</span><kbd>Ctrl Shift N</kbd></div><p class="field-hint">Right-click + to choose a name, agent or folder.</p><label class="toggle-row"><span><strong>Vim controls</strong><small>Use h/j/k/l to move around Paddock.</small></span><input type="checkbox" data-setting="vimControls" ${state.settings.vimControls ? 'checked' : ''}></label><p class="field-hint">Ctrl+Shift+Space returns control to Paddock. Press i to type in a console.</p><button class="subtle" data-action="vim-help">View shortcuts</button></section>`;
}
function renderPage() {
  if (!state) return;
  queueMicrotask(() => vim?.refresh());
  applySidebar();
  projectChats?.sync();
  if ($('#workspace-error')) $('#workspace-error').textContent = state.workspaceError || '';
  const previousProfileForm = $('#account-profile-form');
  if (previousProfileForm) {
    if (accountProfileResetOnRender) accountProfileResetOnRender = false;
    else {
      accountProfileDraft = {
        provider: previousProfileForm.elements.provider.value,
        label: previousProfileForm.elements.label.value,
        error: previousProfileForm.querySelector('.form-error').textContent
      };
      const active = document.activeElement;
      accountProfileFocus = previousProfileForm.contains(active)
        ? { name: active.name || (active.type === 'submit' ? '__submit' : ''), start: active.selectionStart, end: active.selectionEnd }
        : null;
    }
  }
  const consoleView = ['consoles', 'overview'].includes(page);
  if (page === 'vault') page = 'tools';
  const settingsView = isSettingsPage(page), settingsOpening = settingsView && !isSettingsPage(renderedView);
  if (!settingsView) pageBeforeSettings = page;
  if (settingsView) { document.body.dataset.settingsOpen = ''; document.body.style.setProperty('--titlebar-h', $('.titlebar').offsetHeight + 'px'); } else delete document.body.dataset.settingsOpen;
  $('#consoles-page').hidden = !consoleView;
  $('#content').hidden = consoleView;
  $('#content').dataset.view = page;
  $('#launch-folder').hidden = !consoleView || !!expandedId;
  renderScreenshot();
  const view = page === 'api' ? `${page}:${selectedApi}` : page;
  const changed = renderedView !== null && renderedView !== view;
  // Moving between Settings categories keeps the heading and tabs still; only the panel fades.
  const settingsSwitch = changed && isSettingsPage(renderedView) && isSettingsPage(page);
  renderedView = view;
  if (changed && !settingsSwitch) {
    viewAnimation?.cancel();
    if (!windowMoving && state.mode !== 'hud' && !reducedMotion.matches) {
      viewAnimation = $(consoleView ? '#consoles-page' : '#content').animate(
        [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 160, easing: 'cubic-bezier(.22,1,.36,1)' }
      );
    }
  }
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('selected', button.dataset.page === page || button.closest('.sidebar-bottom') && isSettingsPage(page)));
  if (consoleView) { renderConsoles(); return; }
  const renderer = { projects: () => projects.render(), results: () => workbench.render('results'), usage: renderUsage, api: renderApi, tools: renderTools, instructions: renderInstructions, settings: renderSettingsCategory }[page] || renderSettingsCategory;
  const content = $('#content');
  const backgroundLayer = content.querySelector(':scope > .page-background-layer');
  content.innerHTML = (state.storageError ? `<div class="error-banner" role="alert">${escape(state.storageError)}</div>` : '') + (isSettingsPage(page) ? renderSettingsCategory() : renderer());
  if (page === 'usage') {
    const form = $('#account-profile-form');
    if (form) {
      form.elements.provider.value = accountProfileDraft.provider;
      form.elements.label.value = accountProfileDraft.label;
      form.querySelector('.form-error').textContent = accountProfileDraft.error;
      form.elements[accountProfileFocus?.name === '__submit' ? 2 : accountProfileFocus?.name]?.focus({ preventScroll: true });
      const label = form.elements.label;
      if (accountProfileFocus?.name === 'label' && Number.isInteger(accountProfileFocus.start)) label.setSelectionRange(accountProfileFocus.start, accountProfileFocus.end);
    }
    accountProfileFocus = null;
  }
  // #content owns one sky for its lifetime. Keep its canvas node so mountSky's
  // seeded particles, shooting-star schedule and elapsed phase survive redraws.
  if (backgroundLayer) content.prepend(backgroundLayer);
  ensureBackdropSky(content, 57);
  workbench?.mount();
  if (settingsOpening && !windowMoving && !reducedMotion.matches) { viewAnimation?.cancel(); viewAnimation = $('.settings-overlay')?.animate([{ opacity: 0, transform: 'scale(1.03)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' }); }
  if (page === 'appearance') { const preview = $('.settings-content .console-theme-preview'); if (preview) mountSky(preview, 99); }
  if ($('.settings-overlay')) mountSky($('.settings-overlay'), 77);
  lightingChanged();
  if (settingsSwitch && !windowMoving && !reducedMotion.matches) { viewAnimation?.cancel(); viewAnimation = $('.settings-content')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' }); }
  if (page === 'tools') { $('.settings-content .page-heading').insertAdjacentHTML('afterend', imageGenerator.render()); imageGenerator.mount(); }

  if (page === 'usage') { $('#content').insertAdjacentHTML('beforeend', messageUsageTable()); usageView.mount(); }
  if (page === 'usage') $('#content').insertAdjacentHTML('beforeend', imageGenerator.usage());
  if (page === 'console-settings') launchDefaultsFields();
  if (page === 'api') {
    const form = $('#api-form');
    for (const key of ['model', 'prompt', 'maxOutput', 'projectId']) form.elements[key].value = apiDraft[key];

    $('#response-meta').textContent = apiBusy ? 'IN PROGRESS' : responseMeta;
    $('#api-error').textContent = responseError;
  }
}
function hudHtml() {
  const ready = state.sessions.filter(isReady).length;
  const active = state.sessions.filter(x => isOpenConsole(x) && x.alive).length;
  const selected = state.sessions.find(x => x.id === selectedId && isOpenConsole(x) && x.alive) || state.sessions.find(x => isOpenConsole(x) && x.alive);
  const quotaProvider = selected?.provider === 'claude' ? 'claude' : 'codex';
  const quotaAccountId = selected?.accountId || `${quotaProvider}:default`;
  const quota = state.limits.find(x => x.provider === quotaProvider && (x.accountId || (quotaProvider === 'claude' && x.id === 'claude:account' ? 'claude:default' : quotaProvider === 'codex' ? 'codex:default' : null)) === quotaAccountId);
  const weekly = quota?.windows.find(x => x.minutes === 10080), five = quota?.windows.find(x => x.minutes === 300);
  const covered = coveredSlots();
  const slots = Array.from({ length: gridCapacity() }, (_, i) => {
    const item = covered.get(i + 1);
    if (item && item.slot !== i + 1) return '';
    const area = `grid-column:${i % gridSize().columns + 1}/span ${item?.width || 1};grid-row:${Math.floor(i / gridSize().columns) + 1}/span ${item?.height || 1}`;
    const name = state.settings.slotNames?.[i + 1];
    return item ? `<button style="${area}" class="hud-slot ${item.state} ${item.id === selectedId ? 'current' : ''}" data-slot="${i + 1}" data-session="${item.id}" title="${escape(item.name)} · ${labels[item.state]}"><span>${i + 1}</span>${readyIcon(item)}<small>${escape(item.name)}</small></button>` : `<button style="${area}" class="hud-slot empty ${name ? 'named' : ''}" data-action="new" data-slot="${i + 1}" aria-label="Open console ${i + 1}${name ? ': ' + escape(name) : ''}" ${launchHint} ${openingConsole ? 'disabled' : ''}>${newConsoleMark()}${name ? `<small class="hud-slot-name">${escape(name)}</small>` : ''}</button>`;
  }).join('');
  return `<div class="hud-title"><span class="hud-brand" data-window-drag title="Drag to move">${pdMark()}paddock</span><button class="vim-mode" data-action="vim-normal" hidden></button><button class="icon-button" data-action="dashboard" aria-label="Expand dashboard">${icon('expand')}</button><button class="icon-button" data-action="tray" aria-label="Hide in system tray">${icon('close')}</button></div><button class="hud-summary" data-action="dashboard"><div><strong>${ready ? `${ready} ready for you` : active ? `${active} console${active === 1 ? '' : 's'} open` : ''}</strong>${icon('arrow')}</div></button><div class="hud-slots">${slots}</div>${selected ? `<button class="hud-console ${selected.state}" data-session="${selected.id}" data-frame="${escape(state.settings.slotTrims?.[selected.slot] || state.settings.trimStyle)}"><div><span>${shellMark(selected.provider)}${escape(selected.name)}</span>${icon('expand')}</div><pre id="hud-preview">${escape(terminalPreview(selected))}</pre></button>` : `<button class="hud-console empty" data-action="new" aria-label="Open console" ${launchHint} ${openingConsole ? 'disabled' : ''}>${newConsoleMark()}</button>`}<div class="hud-usage" style="--provider-accent:${accountIdentity(quotaProvider).color}"><span class="hud-account">${accountMark(quotaProvider)}${escape(selected?.accountLabel || (quotaProvider === 'claude' ? 'Default Claude' : 'Default Codex'))} <small>${quota ? age(quota.observedAt) : 'Not connected'}</small></span><div><span>5h <b>${remainingPercent(five?.usedPercent) !== null ? number(remainingPercent(five.usedPercent)) + '% left' : 'Unknown'}</b></span><span>Weekly <b>${remainingPercent(weekly?.usedPercent) !== null ? number(remainingPercent(weekly.usedPercent)) + '% left' : 'Unknown'}</b></span></div></div>`;
}
function terminalPreview(session) {
  if (!session) return 'No console selected.';
  const buffer = terminals.get(session.id)?.term.buffer.active;
  if (buffer) {
    const lines = [];
    for (let i = Math.max(0, buffer.baseY + buffer.cursorY - 4); i <= buffer.baseY + buffer.cursorY; i++) {
      const line = buffer.getLine(i)?.translateToString(true); if (line?.trim()) lines.push(line);
    }
    if (lines.length) return lines.slice(-3).join('\n');
  }
  return `${providerName(session.provider)}  /  ${labels[session.state]}\nClick to expand this console.`;
}
let previewTimer;
function updatePreview() {
  if (state.mode !== 'hud' || previewTimer) return;
  previewTimer = setTimeout(() => {
    previewTimer = null;
    const selected = state.sessions.find(x => x.id === selectedId && isOpenConsole(x)) || state.sessions.find(x => isOpenConsole(x));
    if ($('#hud-preview')) $('#hud-preview').textContent = terminalPreview(selected);
  }, 200);
}
let bareFullscreen = false; // set when F11, not a console expansion, entered fullscreen
function receive(next) {
  ++stateReceiveVersion;
  const sessionEffects = [];
  if (state && next.mode !== state.mode) {
    const intent = expansionModeIntent;
    if (!intent || intent.request !== expansionRequest || next.mode !== intent.mode) ++expansionRequest;
  }
  if (state && next.settings.launchEffect !== false && !reducedMotion.matches) {
    for (const previous of state.sessions.filter(isOpenConsole)) {
      const current = next.sessions.find(item => item.id === previous.id);
      if (isOpenConsole(current) && previous.state !== current.state) {
        if (current.state === 'ready' && previous.state !== 'ready') sessionEffects.push([current.id, 'ready']);
        else if (current.state === 'error' && previous.state !== 'error') sessionEffects.push([current.id, 'error']);
      }
      if (isOpenConsole(current)) continue;
      const selector = state.mode === 'hud' ? `.hud-slot[data-session="${previous.id}"]` : `.session-grid [data-console-id="${previous.id}"]`;
      closeConsoleSnapshot($(selector));
    }
  }
  if (state) for (const session of next.sessions) {
    if (session.alive && !session.dismissed && !state.sessions.some(previous => previous.id === session.id && isOpenConsole(previous))) pendingConsoleOpenings.add(session.id);
  }
  for (const id of pendingConsoleOpenings) if (!next.sessions.some(session => session.id === id && session.alive && !session.dismissed)) pendingConsoleOpenings.delete(id);
  if (expandedId && (next.mode === 'hud' || ![...next.sessions, ...(next.codePanels || [])].some(session => session.id === expandedId && isOpenConsole(session)))) {
    expandedId = null;
    ++expansionRequest;
    syncExpandedConsole();
  }
  if (selectedId && ![...next.sessions, ...(next.codePanels || [])].some(session => session.id === selectedId && isOpenConsole(session))) selectedId = null;
  state = next;
  document.body.style.setProperty('--grid-columns', gridSize().columns); document.body.style.setProperty('--grid-rows', gridSize().rows);
  document.body.dataset.trim = state.settings.trimStyle || 'classic';
  ensureBackdropSky($('#sidebar'), 56);
  ensureBackdropSky($('#content'), 57);
  const consolesPage = $('#consoles-page');
  ensureBackdropSky(consolesPage, 55);
  const settingsOverlay = $('.settings-overlay');
  if (settingsOverlay) settingsOverlay.dataset.frame = state.settings.trimStyle || 'classic';
  document.body.dataset.stars = starLevel() ? 'on' : 'off';
  document.body.dataset.lighting = state.settings.lighting || 'static';
  document.body.dataset.textures = state.settings.themeTextures === false ? 'off' : 'on';
  document.body.dataset.speed = state.settings.lightingSpeed || 'normal';
  document.body.dataset.ambient = state.settings.ambientMotion === false ? 'off' : 'on';
  setSkyLevel(starLevel(), state.settings.ambientMotion !== false);
  document.body.dataset.openingMotion = state.settings.launchEffect === false ? 'off' : 'on';
  appearance.syncSettings();
  const trims = [state.settings.trimStyle, ...Object.values(state.settings.slotTrims || {})];
  document.body.dataset.rgb = trims.includes('gamer') ? 'on' : 'off';
  document.body.dataset.pulse = 'off';
  lightingChanged();
  document.body.style.setProperty('--trim-width', (state.settings.trimWidth || 1) + 'px');
  // Only F11 fullscreen hides the title bar; expanding a console keeps it.
  if (document.body.classList.contains('is-fullscreen') && state.mode !== 'fullscreen') bareFullscreen = false;
  document.body.classList.toggle('is-fullscreen', state.mode === 'fullscreen');
  const hideTitlebar = state.mode === 'fullscreen' && bareFullscreen;
  if (document.body.classList.contains('titlebar-hidden') !== hideTitlebar) {
    document.body.classList.toggle('titlebar-hidden', hideTitlebar); document.body.classList.remove('titlebar-peek'); scheduleFits();
  }
  document.body.classList.toggle('steady-cursor', !state.settings.cursorBlink);
  for (const record of terminals.values()) if (record.term.options.cursorBlink !== !!state.settings.cursorBlink) record.term.options.cursorBlink = !!state.settings.cursorBlink;
  const fullscreenButton = $('.window-actions [data-action=fullscreen]');
  if (fullscreenButton.dataset.mode !== state.mode) {
    fullscreenButton.dataset.mode = state.mode;
    fullscreenButton.innerHTML = icon(state.mode === 'fullscreen' ? 'restore' : 'expand');
    fullscreenButton.title = state.mode === 'fullscreen' ? 'Restore window' : 'Fullscreen';
    fullscreenButton.setAttribute('aria-label', fullscreenButton.title);
  }
  workbench?.sync();
  imageGenerator?.sync();
  setup?.receive();
  phone?.receive();
  updates?.sync();
  if (page === 'projects') projects?.refreshCards();
  const providerSelect = $('#one-off-console-form [name=provider]');
  if (providerSelect && !$('#console-chooser').open) for (const provider of consoleProviders()) if (!providerSelect.querySelector(`[value="${provider}"]`)) providerSelect.add(new Option(providerName(provider), provider));
  if ($('#workspace-error')) $('#workspace-error').textContent = state.workspaceError || '';
  document.body.dataset.platform = state.platform || 'win32';
  windowMoving = !!state.transitioning;
  document.body.classList.toggle('window-moving', windowMoving);
  for (const [id, record] of terminals) if (!state.sessions.some(session => session.id === id && isOpenConsole(session))) { record.output.dispose(); record.term.dispose(); record.node.remove(); terminals.delete(id); }
  const hud = state.mode === 'hud';
  $('#dashboard').hidden = hud; $('#hud').hidden = !hud;
  $('#nav-count').textContent = state.sessions.filter(x => isOpenConsole(x) && x.alive).length;
  const readyCount = state.sessions.filter(isReady).length;
  $('#ready-count').textContent = readyCount; $('#ready-count').hidden = !readyCount;
  $('#ready-count').closest('button').setAttribute('aria-label', readyCount ? `Consoles, ${readyCount} ready for you` : 'Consoles');
  const launchFolder = state.settings.consoleDefaults.cwd;
  $('#launch-folder span').textContent = launchFolder.split(/[\\/]/).filter(Boolean).pop() || launchFolder;
  $('#launch-folder').title = `New consoles start in ${launchFolder}`;
  renderScreenshot();
  applySidebar();
  if (page === 'tools') for (const connection of state.shared.connections) {
    const label = document.querySelector(`[data-tool-status="${connection.id}"]`);
    if (label) { label.textContent = !connection.enabled ? 'Disabled' : connection.status ? connection.status.ok ? `${connection.status.count} tools` : 'Check connection' : 'Ready to connect'; label.classList.toggle('connected', !!connection.status?.ok); }
  }
  syncIntegrationJobs(state);
  // A setup call can return before its state update arrives; redraw once it does.
  if (page === 'tools' && renderedToolList && renderedToolList !== toolListKey()) refreshToolSections();
  if (page === 'tools') {
    const section = document.querySelector('.setup-requests');
    const next = JSON.stringify(state.workbench?.setupRequests || []);
    if (section && section.dataset.items !== next) { const template = document.createElement('template'); template.innerHTML = setupRequests(state, escape); template.content.firstElementChild.dataset.items = next; section.replaceWith(template.content.firstElementChild); }
  }
  if (hud && !launchGesture?.active && !$('#console-chooser').open && !document.body.classList.contains('window-dragging')) $('#hud').innerHTML = hudHtml();
  else if (['overview', 'consoles', 'usage'].includes(page)) renderPage();
  for (const [id, effect] of sessionEffects) {
    const panel = state.mode === 'hud'
      ? [...document.querySelectorAll('.hud-console[data-session]')].find(item => item.dataset.session === id)
      : [...document.querySelectorAll('.session-grid .session-card[data-console-id]')].find(item => item.dataset.consoleId === id);
    if (panel) playConsoleStateEffect(panel, effect);
  }
  if (!windowMoving) scheduleFits();
  vim?.refresh();
}
function applySidebar() {
  const collapsed = !!state.settings.sidebarCollapsed, blocked = collapsed || !!expandedId;
  const sidebar = $('#sidebar'), toggle = $('#sidebar-toggle'), titlebar = $('.titlebar'), content = $('#content');
  document.body.style.setProperty('--titlebar-h', titlebar.offsetHeight + 'px');
  const initialized = sidebar.hasAttribute('data-collapsed');
  if (expandedId && (sidebar.contains(document.activeElement) || content.contains(document.activeElement))) {
    if (expandedId) document.querySelector(`.session-card[data-console-id="${CSS.escape(expandedId)}"] [data-action="toggle-console"]`)?.focus({ preventScroll: true });
  }
  sidebar.inert = blocked;
  sidebar.setAttribute('aria-hidden', String(blocked));
  titlebar.inert = false;
  titlebar.removeAttribute('aria-hidden');
  content.inert = !!expandedId;
  toggle.disabled = !!expandedId;
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
const acknowledgments = new Set();
async function acknowledgeSession(id) {
  const needsAttention = state.sessions.some(session => session.id === id && isReady(session));
  if (acknowledgments.has(id) || !needsAttention) return;
  acknowledgments.add(id);
  try { await call('session.acknowledge', id); }
  finally { acknowledgments.delete(id); }
}
async function selectSession(id) {
  const target = openConsole(id);
  if (!target) return false;
  const launchId = target.launchId || null;
  const sameTarget = session => isOpenConsole(session) && (session.launchId || null) === launchId;
  selectedId = id;
  const request = ++expansionRequest;
  const modeIntent = { request, mode: 'fullscreen' };
  expansionModeIntent = modeIntent;
  try {
    if (state.mode !== 'fullscreen' || state.transitioning) await call('mode', 'fullscreen');
    const receiveVersion = stateReceiveVersion;
    const fresh = await call('state');
    const current = stateReceiveVersion === receiveVersion ? fresh : state;
    const latestTarget = [...current.sessions, ...(current.codePanels || [])].find(session => session.id === id);
    if (request !== expansionRequest || current.mode !== 'fullscreen' || current.transitioning || !sameTarget(latestTarget)) return false;
    if (current === fresh) receive(fresh);
    if (request !== expansionRequest || state.mode !== 'fullscreen' || state.transitioning || !sameTarget(openConsole(id))) return false;
    selectedId = id;
    expandedId = id;
    page = 'consoles';
    renderPage();
  } finally {
    if (expansionModeIntent === modeIntent) expansionModeIntent = null;
  }
  await acknowledgeSession(id);
  await terminals.get(id)?.ready;
  if (request === expansionRequest && expandedId === id && openConsole(id)) { fitVisible(); terminals.get(id)?.term.focus(); }
  return true;
}
function restoreExpandedConsole({ focus = true } = {}) {
  if (!expandedId) return false;
  const id = expandedId;
  expandedId = null;
  ++expansionRequest;
  renderPage();
  const control = document.querySelector(`.session-card[data-console-id="${CSS.escape(id)}"] [data-action="toggle-console"]`);
  if (focus && control?.isConnected) control.focus({ preventScroll: true });
  scheduleFits();
  return true;
}
function navigatePage(next) {
  expandedId = null;
  ++expansionRequest;
  syncExpandedConsole();
  page = next;
  renderPage();
}
let fitTimer, fitFrame;
// A theme-specific opening effect, independent of the running process.
function launchBurst(panel) {
  if (state.settings.launchEffect === false || reducedMotion.matches || !panel.isConnected) return;
  openConsoleEffect(panel);
}
function keepFollowing(record) {
  const buffer = record.term.buffer.active;
  if (record.follow && buffer.viewportY < buffer.baseY) record.term.scrollToBottom();
}
function clearTerminalAnchor(record) {
  record.anchorRestoreToken = (record.anchorRestoreToken || 0) + 1;
  record.scrollAnchor?.marker?.dispose();
  record.scrollAnchor = null;
}
function visibleTerminalAnchor(record) {
  const buffer = record.term.buffer.active, start = buffer.viewportY;
  for (let offset = 0; offset < record.term.rows; offset++) {
    const text = buffer.getLine(start + offset)?.translateToString(true).trim();
    if (text) {
      const line = start + offset;
      let logicalLine = line;
      while (logicalLine > 0 && buffer.getLine(logicalLine)?.isWrapped) logicalLine--;
      let marker = null;
      try { marker = record.term.registerMarker(logicalLine - (buffer.baseY + buffer.cursorY)); } catch {}
      return { text, offset, line, logicalLine, cellOffset: (line - logicalLine) * record.term.cols, marker };
    }
  }
  let marker = null;
  try { marker = record.term.registerMarker(start - (buffer.baseY + buffer.cursorY)); } catch {}
  return { text: '', offset: 0, line: start, logicalLine: start, cellOffset: 0, marker };
}
function restoreTerminalAnchor(record, anchor) {
  const buffer = record.term.buffer.active;
  const markerLine = anchor.marker?.line ?? -1;
  const logicalLine = markerLine >= 0 ? markerLine : anchor.logicalLine;
  const rowOffset = Math.floor(anchor.cellOffset / Math.max(1, record.term.cols));
  const target = logicalLine + rowOffset - anchor.offset;
  const boundedTarget = Math.max(0, Math.min(buffer.baseY, target));
  record.term.scrollToLine(boundedTarget);
  return boundedTarget;
}
function scheduleTerminalAnchorRestore(record, anchor) {
  // xterm synchronizes its pixel viewport after reflow; scrolling before that
  // sync applies the line delta to the old viewport position.
  const token = record.anchorRestoreToken = (record.anchorRestoreToken || 0) + 1;
  const settle = (attempt, stable) => requestAnimationFrame(() => {
    if (record.anchorRestoreToken !== token || record.scrollAnchor !== anchor || record.follow || !record.node.isConnected || !record.node.getClientRects().length) return;
    const target = restoreTerminalAnchor(record, anchor), current = record.term.buffer.active;
    const nextStable = current.viewportY === target ? stable + 1 : 0;
    if (attempt < 6 && nextStable < 2) settle(attempt + 1, nextStable);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => settle(0, 0))));
}
function scheduleFits() {
  if (fitFrame) return;
  fitFrame = requestAnimationFrame(() => { fitFrame = null; fitVisible(); });
}
function fitVisible() {
  if (windowMoving || layoutMotion?.active || state?.mode === 'hud') return;
  const visible = ['consoles', 'overview'].includes(page)
    ? expandedId ? [terminals.get(expandedId)] : [...terminals.values()].filter(record => record.node.closest('#consoles-page'))
    : [];
  for (const record of visible) {
    if (!record || record.loading || !record.node.getClientRects().length) continue;
    try {
      const dimensions = `${record.node.clientWidth}:${record.node.clientHeight}:${record.term.options.fontSize}:${devicePixelRatio}`;
      if (record.dimensions === dimensions && !record.repaint) continue;
      if (record.dimensions !== dimensions) {
        const buffer = record.term.buffer.active;
        const wasFollowing = record.follow && buffer.viewportY >= buffer.baseY;
        if (wasFollowing) clearTerminalAnchor(record);
        else if (!record.scrollAnchor || (record.scrollAnchor.marker && record.scrollAnchor.marker.line < 0)) {
          clearTerminalAnchor(record);
          record.scrollAnchor = visibleTerminalAnchor(record);
        }
        const anchor = record.scrollAnchor;
        let fitted = false;
        try {
          // xterm can re-measure the cell width a fraction of a pixel differently,
          // which rounds to one column less at the same size. Reuse the size this
          // console had before at these dimensions so agents are not resized again.
          const known = record.fitted?.get(dimensions);
          if (known) record.term.resize(known.cols, known.rows);
          else {
            record.fit.fit();
            record.fitted ||= new Map();
            if (record.fitted.size > 40) record.fitted.clear();
            record.fitted.set(dimensions, { cols: record.term.cols, rows: record.term.rows });
          }
          if (wasFollowing) keepFollowing(record);
          else { record.follow = false; scheduleTerminalAnchorRestore(record, anchor); }
          fitted = true;
        } finally { if (!fitted && anchor) clearTerminalAnchor(record); }
      } else keepFollowing(record);
      record.dimensions = dimensions;
      if (record.repaint) { record.repaint = false; record.term.refresh(0, record.term.rows - 1); }
      const size = `${record.term.cols}:${record.term.rows}`;
      if (record.size !== size) {
        record.size = size;
        // Agents such as Codex repaint their whole screen on every resize, so
        // report only the size a console settles on after a drag.
        clearTimeout(record.resizeTimer);
        record.resizeTimer = setTimeout(() => {
          if (terminals.get(record.id) !== record || record.size !== `${record.term.cols}:${record.term.rows}`) return;
          call('session.resize', { id: record.id, cols: record.term.cols, rows: record.term.rows }).catch(() => {});
        }, 250);
      }
    } catch {}
  }
}
const SCREENSHOT_DRAG = 'application/x-paddock-screenshot';
function renderScreenshot() {
  const shot = state?.screenshot, button = $('#screenshot-spot');
  button.hidden = !shot || !['consoles', 'overview'].includes(page) || !state.sessions.some(x => isOpenConsole(x) && x.alive);
  if (!shot) return;
  if (button.querySelector('img').getAttribute('src') !== shot.thumb) button.querySelector('img').src = shot.thumb;
  const minutes = shot.at ? Math.round((Date.now() - shot.at) / 60000) : null;
  const when = minutes === null ? 'earlier' : minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
  button.title = `${shot.name} · ${when}\nClick to paste its path into the selected console, or drag it onto a console.`;
  button.setAttribute('aria-label', `Paste latest screenshot (${when}) into the selected console`);
}
function imageConsole(id) {
  const session = state.sessions.find(x => x.id === id);
  return !!session && !session.remoteHostId && (['codex', 'claude', 'custom'].includes(session.provider) || !!state.agents?.some(x => x.id === session.provider));
}
async function pasteScreenshot(id) {
  const record = terminals.get(id);
  if (!record || !state.sessions.some(x => x.id === id && isOpenConsole(x) && x.alive)) { toast('Click a console first, then paste the screenshot.', true); return; }
  record.term.paste(await call('screenshot.path', { id }));
  record.term.focus();
}
// Per-console text size, changed with the A− / A+ buttons in its header.
// A viewer preference: kept in this window's storage, never sent to the PC.
const textSteps = (() => { try { return JSON.parse(localStorage.getItem('console-text-steps') || '{}'); } catch { return {}; } })();
const textSize = (id, compact) => (compact ? 11 : 14) + (textSteps[id] || 0);
function textSizeButtons(id, name) {
  const step = textSteps[id] || 0;
  return `<span class="text-size-buttons" role="group" aria-label="Text size for ${escape(name)}"><button class="icon-button text-size" data-text-size="-1" data-id="${id}" aria-label="Smaller text" title="Smaller text" ${step <= -4 ? 'disabled' : ''}>A<small>−</small></button><button class="icon-button text-size" data-text-size="1" data-id="${id}" aria-label="Larger text" title="Larger text" ${step >= 10 ? 'disabled' : ''}>A<small>+</small></button></span>`;
}
function changeTextSize(id, delta) {
  const step = Math.max(-4, Math.min(10, (textSteps[id] || 0) + delta));
  if (step) textSteps[id] = step; else delete textSteps[id];
  try { localStorage.setItem('console-text-steps', JSON.stringify(textSteps)); } catch { /* keep the size for this session only */ }
  const record = terminals.get(id);
  if (record) { record.term.options.fontSize = textSize(id, record.compact); record.dimensions = null; scheduleFits(); }
  document.querySelectorAll(`[data-text-size][data-id="${id}"]`).forEach(button => { button.disabled = button.dataset.textSize === '1' ? step >= 10 : step <= -4; });
}
function queueTerminalWrite(record, data) {
  const previous = record.writeChain || Promise.resolve();
  const operation = previous.then(() => new Promise(resolve => record.term.write(data, resolve)));
  record.writeChain = operation.catch(() => {});
  return operation;
}
function resetTerminal(record, packet) {
  clearTerminalAnchor(record);
  record.follow = true;
  record.output?.dispose();
  record.launchId = packet.launchId || null;
  const previous = record.writeChain || Promise.resolve();
  const operation = previous.then(() => new Promise(resolve => {
    record.term.reset(); record.launchId = packet.launchId || null;
    if (packet.data) record.term.write(packet.data, () => { keepFollowing(record); resolve(); });
    else resolve();
  }));
  record.writeChain = operation.catch(() => {});
  record.output = terminalOutput((data, done) => queueTerminalWrite(record, data).then(() => { keepFollowing(record); done?.(); }), updatePreview);
  return operation;
}
function mountTerminal(session, host, compact) {
  let record = terminals.get(session.id);
  if (!record) {
    const id = session.id, node = document.createElement('div');
    node.className = 'terminal-instance'; node.dataset.terminalId = id; host.append(node);
    const themeId = state.settings.slotTrims?.[session.slot] || state.settings.trimStyle || 'classic';
    const term = new Terminal({ cols: session.cols || 110, rows: session.rows || 30, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: textSize(session.id, compact), lineHeight: 1.22, cursorBlink: !!state.settings.cursorBlink, scrollback: 3000, allowTransparency: true, disableStdin: !!session.switching, theme: terminalTheme(themeId) });
    const fit = new FitAddon(); term.loadAddon(fit); term.open(node);
    record = { id, term, fit, node, compact, themeId, loading: true, queued: [], follow: true, scrollAnchor: null, launchId: session.launchId || null, writeChain: Promise.resolve() }; terminals.set(id, record);
    record.output = terminalOutput((data, done) => queueTerminalWrite(record, data).then(() => { keepFollowing(record); done?.(); }), updatePreview);
    // Only the user's own scrolling stops a console following new output. Moves,
    // resizes and hidden periods can leave xterm's viewport behind otherwise.
    for (const event of ['wheel', 'keyup', 'pointerup']) node.addEventListener(event, () => requestAnimationFrame(() => {
      const buffer = term.buffer.active; record.follow = buffer.viewportY >= buffer.baseY;
      if (record.follow) clearTerminalAnchor(record);
      else {
        const anchor = visibleTerminalAnchor(record);
        clearTerminalAnchor(record);
        record.scrollAnchor = anchor;
      }
    }), { passive: true });
    term.onData(data => call('session.input', { id, data }).catch(error => toast(error.message, true)));
    fileLinks(term, value => openFile(id, value));
    // Ctrl+V in a local agent console also pastes clipboard images as a file path.
    term.attachCustomKeyEventHandler(e => {
      if (e.type === 'keydown' && (e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyC' && (term.hasSelection() || e.shiftKey)) {
        e.preventDefault(); e.stopPropagation();
        if (term.hasSelection()) call('clipboard.write', term.getSelection()).catch(error => toast(error.message, true));
        return false;
      }
      if (e.type !== 'keydown' || e.code !== 'KeyV' || !e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || !imageConsole(id)) return true;
      e.preventDefault();
      call('screenshot.clipboard', { id }).then(text => { if (text) term.paste(text); }).catch(error => toast(error.message, true));
      return false;
    });
    node.addEventListener('contextmenu', e => {
      if (!term.hasSelection()) return;
      e.preventDefault();
      call('clipboard.menu', term.getSelection()).catch(error => toast(error.message, true));
    });
    node.addEventListener('focusin', () => { selectedId = id; projectChats?.sync(); });
    node.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(SCREENSHOT_DRAG)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    node.addEventListener('drop', e => { if (!e.dataTransfer.types.includes(SCREENSHOT_DRAG)) return; e.preventDefault(); e.stopPropagation(); selectedId = id; pasteScreenshot(id).catch(error => toast(error.message, true)); });
    // A focused console can finish while the user is reading. Wait for their
    // next interaction; terminal output and automatic protocol replies do not count.
    for (const event of ['pointerdown', 'keydown', 'input', 'paste']) node.addEventListener(event, e => {
      if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      acknowledgeSession(id).catch(error => toast(error.message, true));
    }, { capture: true });
    record.ready = call('session.buffer', id).then(buffer => {
      if (terminals.get(id) !== record) return;
      const expectedLaunchId = state.sessions.find(item => item.id === id)?.launchId || null;
      const queued = record.queued.filter(packet => (packet.launchId || null) === expectedLaunchId);
      const resetIndex = queued.findLastIndex(packet => packet.reset);
      let baseline = '', launchId, tail;
      if (resetIndex >= 0) {
        const resetPacket = queued[resetIndex]; launchId = resetPacket.launchId; baseline = resetPacket.data || '';
        tail = queued.slice(resetIndex + 1).filter(packet => packet.launchId === launchId && packet.sequence > resetPacket.sequence);
      } else {
        launchId = expectedLaunchId;
        baseline = (buffer.launchId || null) === expectedLaunchId ? buffer.data : '';
        tail = queued.filter(packet => (!packet.launchId || packet.launchId === launchId) && packet.sequence > (buffer.sequence || 0));
      }
      record.launchId = launchId || null;
      const text = baseline + tail.map(packet => packet.data).join('');
      record.queued = []; record.loading = false;
      if (resetIndex >= 0) resetTerminal(record, { launchId, data: text });
      else queueTerminalWrite(record, text);
      return record.writeChain.then(() => { scheduleFits(); });
    }).catch(error => { record.loading = false; toast(error.message, true); });
  }
  // xterm can pause painting while its node is detached or hidden and miss the
  // resume, leaving a moved console blank. Repaint it on the next fit.
  if (record.node.parentElement !== host) { host.append(record.node); record.repaint = true; scheduleFits(); }
  const themeId = state.settings.slotTrims?.[session.slot] || state.settings.trimStyle || 'classic';
  if (record.themeId !== themeId) { record.term.options.theme = terminalTheme(themeId); record.themeId = themeId; }
  if (record.compact !== compact) {
    record.compact = compact;
    record.term.options.fontSize = textSize(session.id, compact);
    record.dimensions = null;
  }
  record.term.options.disableStdin = !!session.switching;
  record.node.classList.toggle('compact', compact); record.node.hidden = false;
  return record;
}
const terminalResize = new ResizeObserver(() => { clearTimeout(fitTimer); fitTimer = setTimeout(scheduleFits, 80); });
terminalResize.observe($('#consoles-page')); terminalResize.observe($('.session-grid'));
window.dock.onOutput(packet => {
  const record = terminals.get(packet.id); if (!record) return;
  const expectedLaunchId = state?.sessions.find(session => session.id === packet.id)?.launchId || null;
  if ((packet.launchId || null) !== expectedLaunchId) return;
  if (packet.reset) {
    if (record.loading) {
      record.queued.push(packet);
      record.queued = record.queued.filter((item, index, all) => item.reset ? index === all.findLastIndex(candidate => candidate.reset) : true);
      record.launchId = packet.launchId || null;
    } else resetTerminal(record, packet);
    return;
  }
  if ((record.launchId || null) !== (packet.launchId || null)) return;
  const now = performance.now();
  if (state?.settings.launchEffect !== false && (record.lastOutputAt == null || now - record.lastOutputAt > 900) && (record.lastOutputFxAt == null || now - record.lastOutputFxAt > 1500)) {
    const panel = state.mode === 'hud'
      ? [...document.querySelectorAll('.hud-console[data-session]')].find(item => item.dataset.session === packet.id)
      : record.node.closest('.session-card[data-console-id]');
    if ((panel?.dataset.frame || panel?.closest('[data-frame]')?.dataset.frame) === 'cyber') { record.lastOutputFxAt = now; playConsoleStateEffect(panel, 'output'); }
  }
  record.lastOutputAt = now;
  if (document.body.dataset.lighting === 'reactive' && Date.now() - (record.litAt || 0) > 700) { record.litAt = Date.now(); lightUp(record.node.closest('.session-card')); }
  if (record.loading) record.queued.push(packet); else record.output.push(packet.data);
});
document.fonts.ready.then(() => { for (const record of terminals.values()) record.dimensions = null; scheduleFits(); });
window.dock.onSelect(id => selectSession(id).catch(error => toast(error.message, true)));
window.dock.onNotice?.(item => {
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  if (item.destination === 'phone-pairing') { phone.open({ pair: true }); return; }
  workbench.openNotice(item).catch(error => toast(error.message, true));
});
window.dock.onState(receive);

function launchDefaultsFields() {
  const form = $('#console-defaults-form'); if (!form) return;
  const provider = form.elements.provider.value;
  $('#default-command').hidden = provider !== 'custom';
  $('#default-permissions').hidden = !['codex', 'claude'].includes(provider) && !state.agents?.find(x => x.id === provider)?.unrestricted;
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
let remoteHosts;
let chooserModelRequest = 0;
function chooserFields() {
  const form = $('#one-off-console-form'), provider = form.elements.provider.value;
  oneOffShellPicker.sync();
  const agent = ['codex', 'claude'].includes(provider) || !!state.agents?.find(x => x.id === provider)?.model, customModel = agent && form.elements.model.value === '__custom__';
  $('#one-off-model').hidden = !agent; form.elements.model.disabled = !agent;
  $('#one-off-custom-model').hidden = !customModel; form.elements.customModel.disabled = !customModel; form.elements.customModel.required = customModel;
  const permissions = ['codex', 'claude'].includes(provider) || !!state.agents?.find(x => x.id === provider)?.unrestricted;
  $('#one-off-permissions').hidden = !permissions; form.elements.permissions.disabled = !permissions;
  $('#one-off-command').hidden = provider !== 'custom'; form.elements.command.disabled = provider !== 'custom'; form.elements.command.required = provider === 'custom';
}
async function chooserModels() {
  const request = ++chooserModelRequest, form = $('#one-off-console-form'), provider = form.elements.provider.value;
  const select = form.elements.model;
  select.innerHTML = '<option value="">Agent default</option><option value="__custom__">Enter a model…</option>';
  form.elements.customModel.value = ''; chooserFields();
  if (form.elements.remoteHostId.value || !['codex', 'claude'].includes(provider)) return;
  try {
    const models = await call('session.models', provider);
    if (request !== chooserModelRequest || !$('#console-chooser').open) return;
    for (const model of models) select.add(new Option(model.name, model.id), select.lastElementChild);
  } catch { /* A custom model can still be entered when the local list is unavailable. */ }
}
function chooseConsole(button) {
  const dialog = $('#console-chooser');
  if (openingConsole || dialog.open) return;
  const occupied = coveredSlots();
  const slot = Number(button.dataset.slot) || Array.from({ length: gridCapacity() }, (_, i) => i + 1).find(x => !occupied.has(x));
  if (slot && occupied.has(slot)) return;
  const form = $('#one-off-console-form'); form.reset(); form.dataset.slot = slot || '';
  form.elements.remoteHostId.innerHTML = '<option value="">This PC</option>' + (state.sshHosts || []).map(h => `<option value="${escape(h.id)}">${escape(h.name)} (SSH)</option>`).join('');
  $('#chooser-remote-folder').hidden = true;
  form.elements.cwd.closest('label').hidden = false;
  form.elements.provider.innerHTML = consoleProviders().map(p => `<option value="${p}">${providerName(p)}</option>`).join('');
  form.elements.projectId.innerHTML = '<option value="">No project</option>' + (state.projects || []).filter(x => x.status !== 'archived').map(x => `<option value="${escape(x.id)}">${escape(x.name)}${x.category ? ' · ' + escape(x.category) : ''}</option>`).join('');
  $('#chooser-project-folders').hidden = true;
  for (const key of ['provider', 'cwd', 'name', 'command']) form.elements[key].value = state.settings.consoleDefaults[key] || '';
  form.elements.accountId.value = consoleChoices().find(row => row.provider === form.elements.provider.value)?.accountId || '';
  form.elements.name.value = state.settings.slotNames?.[slot] || form.elements.name.value;
  form.elements.permissions.value = state.settings.agentPermissions;
  form.querySelector('details').open = false; form.querySelector('.form-error').textContent = '';
  $('#console-chooser-title').textContent = slot ? `Console ${slot}` : 'New console';
  chooserOpener = button; dialog.showModal(); chooserModels(); form.elements.name.focus();
}
launchGesture = holdToChoose({ onChoose: chooseConsole, disabled: () => openingConsole || $('#console-chooser').open });
function selectProject(id) {
  const form = $('#one-off-console-form'), project = state.projects?.find(x => x.id === id);
  form.elements.projectId.value = id || '';
  $('#chooser-project-folders').hidden = !project;
  if (!project) return;
  form.elements.projectFolder.innerHTML = project.folders.map(x => `<option value="${escape(x.path)}">${escape(x.label || x.path)}</option>`).join('');
  form.elements.cwd.value = project.folders[0].path; form.elements.name.value = project.name;
}
$('#chooser-new-project').addEventListener('click', () => {
  const slot = $('#one-off-console-form').dataset.slot; $('#console-chooser').close();
  projects.edit(undefined, project => { chooseConsole({ dataset: { slot } }); selectProject(project.id); });
});
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
  if (!slot) slot = Array.from({ length: gridCapacity() }, (_, i) => i + 1).find(x => !coveredSlots().has(x));
  if (slot && coveredSlots().has(Number(slot))) { toast('That space is already open.'); return; }
  openingConsole = true;
  document.querySelectorAll('[data-action="new"]').forEach(button => button.disabled = true);
  try {
    // A click on plus can blur an edited title; finish that save before launching.
    await Promise.all(nameSaves.values());
    const session = await call('session.create', { ...overrides, ...(slot ? { slot: Number(slot) } : {}) });
    if (overrides) $('#console-chooser').close();
    if (state.mode === 'hud' || expandedId) await selectSession(session.id);
    else {
      selectedId = session.id; navigatePage('consoles');
      await terminals.get(session.id)?.ready;
      fitVisible(); terminals.get(session.id)?.term.focus();
    }
    return session;
  } catch (error) {
    if (overrides) throw error;
    navigatePage('settings');
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
    const session = state.sessions.find(x => x.slot === slot && isOpenConsole(x));
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
function placeAccountPopover(toggle, menu) {
  const rect = toggle.getBoundingClientRect(), gutter = 8;
  const width = menu.getBoundingClientRect().width || 220;
  const height = menu.getBoundingClientRect().height || 140;
  const left = Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter));
  const top = rect.bottom + height + gutter <= window.innerHeight
    ? rect.bottom + gutter
    : Math.max(gutter, rect.top - height - gutter);
  menu.style.left = `${left}px`; menu.style.top = `${top}px`;
  menu.style.maxHeight = `${Math.max(96, window.innerHeight - gutter * 2)}px`;
}
function repositionAccountPopovers() {
  for (const menu of document.querySelectorAll('.account-menu-items[popover]:popover-open')) {
    const toggle = menu.parentElement?.querySelector('[data-account-menu-toggle]');
    if (toggle?.isConnected) placeAccountPopover(toggle, menu); else menu.hidePopover();
  }
}
const accountMenuPointerGestures = new Map();
const accountMenuHasPointerGesture = menu => [...accountMenuPointerGestures.values()].includes(menu);
function closeAccountMenuIfUnfocused(menu) {
  setTimeout(() => {
    if (menu.matches(':popover-open') && !menu.contains(document.activeElement) && !accountMenuHasPointerGesture(menu)) menu.hidePopover();
  }, 0);
}
document.addEventListener('pointerdown', event => {
  const menu = event.target.closest?.('.account-menu-items[popover]');
  if (!menu) return;
  accountMenuPointerGestures.set(event.pointerId, menu);
}, true);
document.addEventListener('pointerup', event => {
  const menu = accountMenuPointerGestures.get(event.pointerId);
  if (!menu) return;
  setTimeout(() => {
    if (accountMenuPointerGestures.get(event.pointerId) !== menu) return;
    accountMenuPointerGestures.delete(event.pointerId);
    closeAccountMenuIfUnfocused(menu);
  }, 500);
}, true);
document.addEventListener('pointercancel', event => {
  const menu = accountMenuPointerGestures.get(event.pointerId);
  if (!menu) return;
  accountMenuPointerGestures.delete(event.pointerId);
  closeAccountMenuIfUnfocused(menu);
}, true);
document.addEventListener('click', event => {
  const clickedMenu = event.target.closest?.('.account-menu-items[popover]');
  for (const [pointerId, menu] of accountMenuPointerGestures) if (!clickedMenu || clickedMenu === menu) accountMenuPointerGestures.delete(pointerId);
}, true);
window.addEventListener('blur', () => {
  const menus = new Set(accountMenuPointerGestures.values());
  accountMenuPointerGestures.clear();
  for (const menu of menus) if (menu.matches(':popover-open')) menu.hidePopover();
});
window.addEventListener('resize', repositionAccountPopovers);
document.addEventListener('scroll', repositionAccountPopovers, true);
document.addEventListener('click', event => {
  const toggle = event.target.closest('[data-account-menu-toggle]');
  if (!toggle) return;
  const menu = toggle.parentElement?.querySelector('.account-menu-items');
  if (!menu?.showPopover) { toast('This window cannot open the account menu. Update the Paddock web runtime.'); return; }
  event.preventDefault();
  if (menu.matches(':popover-open')) { menu.hidePopover(); return; }
  try {
    menu.showPopover(); placeAccountPopover(toggle, menu);
    toggle.setAttribute('aria-expanded', 'true');
    menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  } catch { toast('The account menu could not be opened.'); }
}, true);
document.addEventListener('toggle', event => {
  const menu = event.target;
  if (!menu.matches?.('.account-menu-items[popover]')) return;
  const toggle = menu.parentElement?.querySelector('[data-account-menu-toggle]');
  toggle?.setAttribute('aria-expanded', String(menu.matches(':popover-open')));
}, true);
document.addEventListener('focusout', event => {
  const menu = event.target.closest?.('.account-menu-items[popover]');
  if (!menu) return;
  closeAccountMenuIfUnfocused(menu);
}, true);
document.addEventListener('keydown', event => {
  const menu = event.target.closest?.('.account-menu-items[popover]');
  if (!menu) return;
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation();
    const toggle = menu.parentElement?.querySelector('[data-account-menu-toggle]');
    menu.hidePopover(); toggle?.focus({ preventScroll: true }); return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const items = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
  if (!items.length) return;
  const current = items.indexOf(document.activeElement);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
    (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  event.preventDefault(); items[index].focus({ preventScroll: true });
}, true);
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.dataset.usageShow || button.dataset.usageHide) {
      const id = button.dataset.usageShow || button.dataset.usageHide, show = !!button.dataset.usageShow;
      const shown = new Set(state.settings.usageShown || []), hidden = new Set(state.settings.usageHidden || []);
      if (show) { shown.add(id); hidden.delete(id); } else { hidden.add(id); shown.delete(id); }
      if (show) usageAddOpen = false;
      await call('settings', { usageShown: [...shown], usageHidden: [...hidden] });
      if (show) void call('refresh').catch(() => {});
      toast(show ? 'Added to Usage. Checking its limits.' : 'Hidden from Usage. Add it again any time.'); return;
    }
    if (button.dataset.usageNewAccount) {
      // renderPage reads the draft back from the form, so set the field itself.
      usageAddOpen = false; const provider = $('#account-profile-form [name=provider]'); if (provider && !provider.disabled) provider.value = button.dataset.usageNewAccount; renderPage();
      const form = $('#account-profile-form'); form?.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' }); form?.elements.label.focus({ preventScroll: true }); return;
    }
    if (button.dataset.delegationStop) { button.disabled = true; await call('workbench.delegation.stop', button.dataset.delegationStop); return; }
    if (button.dataset.page) { navigatePage(button.dataset.page); $('#content').scrollTop = 0; return; }
    if (button.dataset.session) return await selectSession(button.dataset.session);
    if (button.dataset.docs) return await call('docs', button.dataset.docs);
    if (button.dataset.setupApply) {
      button.disabled = true;
      try { await call('workbench.setup.apply', button.dataset.setupApply); state = await call('state'); renderPage(); toast('Connected. Your agents can use it now.'); }
      finally { button.disabled = false; }
      return;
    }
    if (button.dataset.setupDismiss) { await call('workbench.setup.dismiss', button.dataset.setupDismiss); return; }
    if (button.dataset.setupKey) {
      const item = state.workbench.setupRequests.find(x => x.id === button.dataset.setupKey); if (!item) return;
      const field = button.closest('.setup-request').querySelector('[name=newKey]');
      if (!field.value.trim()) { field.focus(); toast('Paste the key first.', true); return; }
      await call('vault.save', { provider: item.config.id, key: field.value.trim(), label: item.config.name || item.config.id }); field.value = '';
      await call('workbench.setup.dismiss', item.id); toast('Key saved and encrypted.'); return;
    }
    if (button.dataset.apiPreset) {
      const preset = apiPresets[button.dataset.apiPreset], form = $('#profile-form');
      form.reset(); form.elements.id.readOnly = false;
      if (!form.elements.keyId.querySelector(`[value="${preset.keyId}"]`)) form.elements.keyId.add(new Option(preset.keyId + ' (paste the key beside this)', preset.keyId));
      for (const [key, value] of Object.entries(preset)) form.elements[key].value = value;
      $('#profile-editor').open = true; form.elements.keyId.focus(); return;
    }
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
    if (button.dataset.textSize) { changeTextSize(button.dataset.id, Number(button.dataset.textSize)); return; }
    if (button.matches('[data-settings-replay]')) { const preview = $('.settings-content .console-theme-preview'); if (preview && state.settings.launchEffect !== false) openConsoleEffect(preview); return; }
    switch (button.dataset.action) {
      case 'close-settings': closeSettings(); break;
      case 'toggle-console':
        if (expandedId === button.dataset.id) restoreExpandedConsole();
        else await selectSession(button.dataset.id);
        break;
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
      case 'agent-setup': setup.open(); break;
      case 'hud': await call('mode', 'hud'); break;
      case 'dashboard': navigatePage('consoles'); await call('mode', 'dashboard'); renderPage(); break;
      case 'fullscreen': await call('mode', state.mode === 'fullscreen' ? 'dashboard' : 'fullscreen'); break;
      case 'minimize': await call('minimize'); break;
      case 'tray': await call('tray'); break;
      case 'refresh': await call('refresh'); break;
      case 'usage-add': usageAddOpen = !usageAddOpen; renderPage(); $('#usage-add-panel button, [data-action=usage-add]')?.focus({ preventScroll: true }); break;
      case 'quit': await call('quit'); break;
      case 'end-session': await call('session.end', button.dataset.id || selectedId); break;
      case 'paste-screenshot': await pasteScreenshot(selectedId); break;
      case 'retry-session': {
        button.disabled = true;
        try { const restored = await call('session.retry', button.dataset.id); if (expandedId === button.dataset.id) { expandedId = restored.id; selectedId = restored.id; } renderPage(); }
        finally { button.disabled = false; }
        break;
      }
      case 'account-switch': {
        const label = button.textContent.trim().replace(/^Switch to\s+/, ''); button.disabled = true;
        await call('session.switch', { id: button.dataset.id, launchId: button.dataset.launchId, targetAccountId: button.dataset.targetAccountId });
        toast(`Switched to ${label}.`); break;
      }
      case 'account-setup': {
        const setup = await call('accounts.setup', { id: button.dataset.id, launchId: button.dataset.launchId, targetAccountId: button.dataset.targetAccountId });
        const menu = button.closest('.account-menu-items[popover]'), toggle = menu?.parentElement?.querySelector('[data-account-menu-toggle]');
        menu?.hidePopover(); toggle?.focus({ preventScroll: true });
        if (setup?.cwd) toast(`Setup console opened in ${setup.cwd}.`);
        break;
      }
      case 'account-switch-dismiss':
        await call('session.switch-dismiss', { id: button.dataset.id, launchId: button.dataset.launchId, offerKey: button.dataset.offerKey }); break;
      case 'account-login': await call('accounts.login', { id: button.dataset.id }); toast('Sign-in console opened.'); break;
      case 'account-remove': {
        try { if (await call('accounts.remove', button.dataset.id)) toast('Account removed.'); }
        catch (error) { toast(error.message, true); }
        break;
      }
      case 'account-rename': {
        accountRenameOpener = button;
        const form = $('#account-rename-form');
        form.dataset.id = button.dataset.id;
        form.elements.label.value = button.dataset.label || '';
        form.querySelector('.form-error').textContent = '';
        $('#account-rename-dialog').showModal();
        form.elements.label.focus(); form.elements.label.select();
        break;
      }
      case 'cancel-account-rename': $('#account-rename-dialog').close(); break;
      case 'export': await call('ledger.export'); break;

    }
  } catch (error) { toast(error.message, true); }
});
document.addEventListener('change', async event => {
  const input = event.target;
  if (input.form?.getAttribute('id') === 'console-defaults-form' && input.name === 'provider') launchDefaultsFields();
  if (input.form?.getAttribute('id') === 'one-off-console-form') {
    if (input.name === 'remoteHostId') {
      const form = input.form, host = state.sshHosts?.find(h => h.id === input.value);
      $('#chooser-remote-folder').hidden = !host;
      form.elements.cwd.closest('label').hidden = !!host;
      form.elements.remoteFolder.value = host?.folder || '.';
      form.elements.provider.innerHTML = (host ? ['shell', ...(host.agents || [])] : consoleProviders()).map(p => `<option value="${p}">${providerName(p)}</option>`).join('');
      form.elements.accountId.value = ''; form.elements.permissions.value = 'default'; $('#one-off-worktree').hidden = !!host; form.elements.worktree.checked = false; chooserModels();
    } else if (input.name === 'provider') {
      // Keep the account only while it belongs to the chosen agent.
      const account = input.form.elements.accountId;
      if (!account.value.startsWith(input.value + ':') && !(state.accounts || []).some(a => a.id === account.value && a.provider === input.value)) account.value = consoleChoices().find(row => row.provider === input.value)?.accountId || '';
      chooserModels();
    }
    else if (input.name === 'model') chooserFields();
    else if (input.name === 'projectId') selectProject(input.value);
    else if (input.name === 'projectFolder') input.form.elements.cwd.value = input.value;
  }
  if (input.form?.getAttribute('id') === 'api-form' && input.name === 'provider') { selectedApi = input.value; renderPage(); }
  if (input.form?.getAttribute('id') === 'tool-form' && input.name === 'type') toolFields();
  if (input.dataset.delegationProvider) {
    const chosen = [...document.querySelectorAll('[data-delegation-provider]')].filter(x => x.checked).map(x => x.dataset.delegationProvider);
    try { await call('settings', { delegationProviders: chosen }); } catch (error) { input.checked = !input.checked; toast(error.message, true); }
  }
  if (input.dataset.setting) {
    const checkbox = input.type === 'checkbox', key = input.dataset.setting, wasFocused = document.activeElement === input;
    const previous = state.settings[key] ?? (checkbox ? !input.checked : input.value);
    input.disabled = true;
    try { await call('settings', { [key]: checkbox ? input.checked : input.value }); }
    catch (error) { if (checkbox) input.checked = previous; else input.value = previous; toast(error.message, true); }
    finally {
      input.disabled = false;
      if (wasFocused && input.isConnected && document.activeElement === document.body) input.focus({ preventScroll: true });
    }
  }
});
document.addEventListener('input', event => {
  const input = event.target;
  if (input.dataset.setting === 'starDensity') { const name = starLevels[Number(input.value)] || ''; $('#star-level-name').textContent = name; input.setAttribute('aria-valuetext', name); }
  if (input.form?.id === 'account-profile-form' && input.name === 'label') { accountProfileDraft.label = input.value; accountProfileDraft.error = ''; }
  if (input.form?.id === 'account-rename-form') input.form.querySelector('.form-error').textContent = '';
  if (input.form?.getAttribute('id') === 'api-form' && ['model', 'prompt', 'maxOutput', 'projectId'].includes(input.name)) apiDraft[input.name] = input.value;
});
document.addEventListener('change', event => {
  const input = event.target;
  if (input.form?.id === 'account-profile-form' && input.name === 'provider') { accountProfileDraft.provider = input.value; accountProfileDraft.error = ''; }
});
document.addEventListener('submit', async event => {
  if (['project-form', 'console-project-form', 'image-generation-form'].includes(event.target.id)) return;
  event.preventDefault(); const form = event.target, data = Object.fromEntries(new FormData(form)); const submit = form.querySelector('[type="submit"]');
  if (form.id === 'account-profile-form') {
    if (accountProfileBusy) return;
    accountProfileBusy = true;
    accountProfileDraft = { provider: data.provider || accountProfileCreated?.provider || 'codex', label: data.label ?? accountProfileCreated?.label ?? '', error: '' };
  }
  if (form.id === 'account-rename-form') {
    if (accountRenameBusy) return;
    accountRenameBusy = true;
  }
  if (submit) submit.disabled = true;
  try {
    if (form.getAttribute('id') === 'account-profile-form') {
      form.querySelector('.form-error').textContent = '';
      if (!accountProfileCreated) {
        const created = await call('accounts.create', { provider: data.provider, label: data.label });
        accountProfileCreated = { id: created.id, provider: data.provider, label: data.label };
      }
      await call('accounts.login', { id: accountProfileCreated.id });
      accountProfileCreated = null;
      accountProfileDraft = { provider: 'codex', label: '', error: '' }; accountProfileFocus = null;
      accountProfileResetOnRender = page === 'usage' && !!$('#account-profile-form');
      toast('Account added. Sign in from the new console.');
    } else if (form.id === 'account-rename-form') {
      await call('accounts.rename', { id: form.dataset.id, label: data.label });
      $('#account-rename-dialog').close();
      toast('Account name updated.');
      const renamed = document.querySelector(`[data-action="account-rename"][data-id="${CSS.escape(form.dataset.id)}"]`);
      if (renamed) renamed.focus({ preventScroll: true });
      else if (accountRenameOpener?.isConnected) accountRenameOpener.focus({ preventScroll: true });
      accountRenameOpener = null;
    } else if (form.getAttribute('id') === 'one-off-console-form') {
      form.querySelector('.form-error').textContent = '';
      const { customModel, projectFolder, ...overrides } = data;
      if (overrides.model === '__custom__') overrides.model = customModel;
      if (!overrides.accountId) delete overrides.accountId;
      await openNew(form.dataset.slot, overrides);
      rememberChoice(data.provider, data.accountId);
    } else if (form.getAttribute('id') === 'grid-form') {
      form.querySelector('.form-error').textContent = '';
      await call('grid.configure', { columns: Number(data.columns), rows: Number(data.rows) }); toast('Grid updated.');
    } else if (form.getAttribute('id') === 'console-defaults-form') {
      form.querySelector('.form-error').textContent = '';
      const { permissions, ...consoleDefaults } = data;
      await call('settings', { consoleDefaults, agentPermissions: permissions }); toast('Defaults saved.');
    } else if (form.getAttribute('id') === 'instructions-form') {
      await call('shared.instructions', data.instructions); renderPage(); toast('Instructions saved.');
    } else if (form.getAttribute('id') === 'tool-form') {
      await call('tools.save', toolPayload(form, data)); renderPage(); toast('Tool saved.');
    } else if (form.getAttribute('id') === 'profile-form') {
      const { newKey, ...profile } = data;
      if (newKey?.trim()) { await call('vault.save', { provider: profile.id, key: newKey.trim(), label: profile.name || profile.id }); profile.keyId = profile.id; }
      await call('profiles.save', profile); renderPage(); toast('API saved.');
    } else if (form.getAttribute('id') === 'api-form') {
      if (apiBusy) return;
      apiBusy = true; responseError = ''; $('#api-error').textContent = ''; $('#response-meta').textContent = 'IN PROGRESS';
      const result = await call('api.send', data); outputText = result.text || result.error;
      responseMeta = result.entry.status.toUpperCase();
      responseError = result.error || '';
    }
  } catch (error) {
    const target = form.getAttribute('id') === 'api-form' ? '#api-error' : `#${form.getAttribute('id')} .form-error`;
    if (form.getAttribute('id') === 'api-form') { responseError = error.message; responseMeta = 'REQUEST NOT SENT'; }
    if (form.getAttribute('id') === 'account-profile-form') accountProfileDraft.error = error.message;
    if (form.id === 'account-rename-form') form.querySelector('.form-error').textContent = error.message;
    if ($(target)) $(target).textContent = error.message; else toast(error.message, true);
  } finally {
    if (form.id === 'account-profile-form') { accountProfileBusy = false; if (page === 'usage') renderPage(); }
    if (form.id === 'account-rename-form') { accountRenameBusy = false; if (submit?.isConnected) submit.disabled = false; }
    if (submit?.isConnected) submit.disabled = false;
    if (form.getAttribute('id') === 'api-form') { apiBusy = false; if (page === 'api') renderPage(); }
  }
});
document.addEventListener('keydown', event => {
  const terminalFocus = !!event.target.closest?.('.xterm');
  const editableFocus = !terminalFocus && !!event.target.closest?.('input,textarea,select,[contenteditable="true"]');
  const returnFromTerminal = event.ctrlKey && event.shiftKey && event.code === 'Enter';
  if (expandedId && event.key === 'Escape' && !editableFocus && !event.defaultPrevented && !document.querySelector('dialog[open], [popover]:popover-open') && (!terminalFocus || returnFromTerminal)) {
    event.preventDefault(); event.stopImmediatePropagation();
    restoreExpandedConsole(); return;
  }
  if (expandedId && returnFromTerminal && !editableFocus && !event.defaultPrevented && !document.querySelector('dialog[open], [popover]:popover-open')) {
    event.preventDefault(); event.stopImmediatePropagation();
    restoreExpandedConsole(); return;
  }
  if (event.key === 'Escape' && isSettingsPage(page) && !event.defaultPrevented && !document.querySelector('dialog[open]') && state?.mode !== 'hud') {
    event.preventDefault(); closeSettings(); return;
  }
  if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === 'KeyN') {
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat) void openNew();
  }
  if (event.key === 'F11') { event.preventDefault(); bareFullscreen = state.mode !== 'fullscreen'; call('mode', bareFullscreen ? 'fullscreen' : 'dashboard'); }
}, true);

// In F11 fullscreen the title bar stays hidden until the pointer reaches the top edge.
document.addEventListener('pointermove', event => {
  if (!document.body.classList.contains('titlebar-hidden')) return;
  if (event.clientY <= 4) document.body.classList.add('titlebar-peek');
  else if (!event.target.closest?.('.titlebar, .shell-picker, [popover]')) document.body.classList.remove('titlebar-peek');
}, { passive: true });

function closeSettings() {
  navigatePage(isSettingsPage(pageBeforeSettings) ? 'consoles' : pageBeforeSettings);
  if (!reducedMotion.matches) $('.workspace')?.animate([{ opacity: .6, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.22,1,.36,1)' });
  $('.sidebar-bottom [data-page=settings]')?.focus({ preventScroll: true });
}
// Lighting runs on one clock: every frame's wave reads its own window position
// and new continuous animations join the existing phase, including its pauses.
let lightingFrame = 0;
const lightingTiming = new WeakMap();
const lightingPaused = new WeakMap();
function lightingChanged() {
  if (lightingFrame) return;
  lightingFrame = requestAnimationFrame(() => {
    lightingFrame = 0;
    for (const node of document.querySelectorAll('.console-skin,.sidebar-edge')) node.style.setProperty('--panel-x', Math.round(node.getBoundingClientRect().left) + 'px');
    const groups = new Map();
    for (const animation of document.getAnimations()) {
      if (!/^light-(wave|breathe|spectrum)$/.test(animation.animationName || '')) continue;
      const group = groups.get(animation.animationName) || [];
      group.push(animation); groups.set(animation.animationName, group);
    }
    for (const group of groups.values()) {
      // Preserve progress when speed changes; ordinary publications leave existing clocks alone.
      for (const animation of group) {
        const previous = lightingTiming.get(animation), duration = animation.effect.getComputedTiming().duration;
        if (previous && previous !== duration && animation.currentTime != null) animation.currentTime *= duration / previous;
      }
      const reference = group.find(animation => lightingTiming.has(animation) && lightingPaused.get(animation) !== true && animation.playState === 'running')
        || group.find(animation => lightingTiming.has(animation) && animation.playState === 'running')
        || group[0];
      for (const animation of group) {
        const resumed = lightingPaused.get(animation) === true && animation.playState === 'running';
        if ((!lightingTiming.has(animation) || resumed) && animation !== reference) {
          const align = () => {
            if (animation.playState === 'idle' || reference.playState === 'idle') return;
            if (reference.startTime != null && reference.playState === 'running' && animation.playState === 'running') animation.startTime = reference.startTime;
            else animation.currentTime = reference.currentTime;
          };
          // Pending animations acquire their start times on the next browser paint.
          if (animation.pending || reference.pending) Promise.all([animation.ready, reference.ready]).then(align, () => {});
          else align();
        }
        lightingTiming.set(animation, animation.effect.getComputedTiming().duration);
        lightingPaused.set(animation, animation.playState === 'paused');
      }
    }
  });
}
addEventListener('resize', lightingChanged);
// Reactive lighting: typing in a console or new output lights its frame.
function lightUp(node) {
  if (!node || document.body.dataset.lighting !== 'reactive') return;
  node.classList.remove('lit'); void node.offsetWidth; node.classList.add('lit');
  clearTimeout(node.litTimer); node.litTimer = setTimeout(() => node.classList.remove('lit'), 1000);
}
document.addEventListener('keydown', event => lightUp(event.target.closest?.('.session-card')), true);
function focusVimSlot(slot) {
  slot = coveredSlots().get(slot)?.slot || slot;
  if (state.mode !== 'hud' && !['consoles', 'overview'].includes(page)) navigatePage('consoles');
  const panel = document.querySelector(state.mode === 'hud' ? `.hud-slot[data-slot="${slot}"]` : `.session-card[data-slot="${slot}"]`);
  panel?.focus({ preventScroll: true });
}
async function vimAction(action, value) {
  if (action === 'page') {
    navigatePage(value);
    if (state.mode === 'hud') await call('mode', 'dashboard');
    if (page === 'consoles') focusVimSlot(vim.slot); else $('#content').focus({ preventScroll: true });
    return;
  }
  if (action === 'sidebar') { await call('settings', { sidebarCollapsed: !state.settings.sidebarCollapsed }); return; }
  if (action === 'fullscreen') { await call('mode', state.mode === 'fullscreen' ? 'dashboard' : 'fullscreen'); return; }
  if (action === 'dock') { await call('mode', 'hud'); focusVimSlot(vim.slot); return; }
  const session = coveredSlots().get(value);
  if (action === 'open') { if (session) await selectSession(session.id); else await openNew(value); }
  else if (action === 'new') await openNew(value);
  else if (action === 'choose') {
    const button = document.querySelector(`${state.mode === 'hud' ? '#hud' : '#consoles-page'} [data-action="new"][data-slot="${value}"]`);
    if (button) chooseConsole(button);
  } else if (action === 'rename') {
    if (state.mode === 'hud') { navigatePage('consoles'); await call('mode', 'dashboard'); renderPage(); }
    else focusVimSlot(value);
    document.querySelector(`#consoles-page .console-name[data-name-slot="${value}"]`)?.focus();
  } else if (action === 'type') {
    if (!isOpenConsole(session) || !session.alive) { toast('Press n to open a console here.'); return; }
    if (state.mode === 'hud') { await selectSession(session.id); return; }
    focusVimSlot(value); selectedId = session.id;
    await terminals.get(session.id)?.ready;
    fitVisible(); terminals.get(session.id)?.term.focus();
  }
}
vim = vimControls({
  context: () => ({ enabled: state?.settings.vimControls === true, view: state?.mode === 'hud' ? 'hud' : expandedId ? 'terminal' : page, sessions: state?.sessions || [], grid: gridSize(), busy: windowMoving || openingConsole }),
  focusSlot: focusVimSlot, action: vimAction, onError: message => toast(message, true)
});
webPanels = webPanelUI({ call, getState: () => state, selectedConsole: () => selectedId, escape, icon, resizeHandles, toast, navigate: navigatePage });
codePanels = codePanelUI({ call, getState: () => state, selectedConsole: () => selectedId, escape, icon, resizeHandles, toast, navigate: navigatePage,
  pasteContext: async (id, text) => {
    const session = state.sessions.find(x => x.id === id && x.alive && !x.switching);
    const record = terminals.get(id);
    if (!session || !record) throw new Error('Open this agent console before adding context.');
    if (!record.term.modes.bracketedPasteMode) { await call('clipboard.write', text); toast('Context copied. Paste it into the console when its prompt is ready.'); return; }
    record.term.paste(text); toast('Context added to the console draft.');
  }
});
phone = mobileUI({ call, escape, icon, getState: () => state, toast, navigate: navigatePage });
projects = projectsUI({ call, getState: () => state, escape, icon, toast, renderPage, openNew, preview: value => openFile(null, value) });
projectChats = consoleProjects({ call, getState: () => state, getView: () => ({ page, selectedId }), projects, navigate: navigatePage, escape, icon, toast });
messageQueue = consoleQueue({ call, getState: () => state, escape, icon, toast, paste: (id, text) => { const record = terminals.get(id); if (!record) throw new Error('This console is no longer open.'); record.term.paste(text); record.term.focus(); }, agentProviders: () => (state?.agents || []).map(x => x.id) });
imageGenerator = imageGenerationUI({ call, getState: () => state, escape, toast });
remoteHosts = sshUI({ call, escape, getState: () => state, toast, render: renderPage });
updates = updatesUI({ call, getState: () => state, escape, icon, toast });
usageView = projectUsage({ getState: () => state, escape, providerName, number, mark: shellMark });
setup = firstRun({ call, escape, icon, pdMark, getState: () => state });
windowDragging(call, () => state);
layoutMotion = consoleMotion({ render: renderConsoles, fit: scheduleFits });
consoleDragging({ call, toast, motion: layoutMotion });
consoleLayoutUI({ call, getState: () => state, motion: layoutMotion, toast });
workbench = workbenchUI({ call, getState: () => state, getPage: () => page, renderPage, escape, toast, selectSession, navigate: navigatePage });
toolFeatures({ call, getState: () => state, navigate: navigatePage, render: refreshToolSections, toast, escape });
try { state = await call('state'); receive(state); renderPage(); } catch (error) { $('#content').textContent = error.message; }
