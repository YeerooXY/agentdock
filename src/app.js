// Desktop renderer bootstrap. Owns the window-level view state (current page,
// selected and expanded console), state intake, page routing and the shared
// click/submit/keyboard dispatch. Pages live in src/pages, console panels in
// src/console and shared interface helpers in src/ui.
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import { vimControls } from './vim-controls.js';
import { firstRun } from './first-run.js';
import { mobileUI } from './mobile-ui.js';
import { windowDragging } from './window-drag.js';
import { consoleDragging } from './console-drag.js';
import { consoleLayoutUI } from './console-layout-ui.js';
import { consoleMotion } from './console-motion.js';
import { closeConsoleSnapshot, playConsoleStateEffect } from './console-effects.js';
import { consoleAppearance } from './console-appearance.js';
import { workbenchUI } from './workbench-ui.js';
import { toolFeatures, syncIntegrationJobs } from './tool-features.js';
import { projectsUI } from './projects-ui.js';
import { consoleProjects } from './console-projects.js';
import { consolePrompts } from './console-prompts.js';
import { workerComposer } from './worker-composer.js';
import { reviewPanelUI } from './review-panel-ui.js';
import { taskLoopUI } from './task-loop-ui.js';
import { imageGenerationUI } from './image-generation-ui.js';
import { sshUI } from './ssh-ui.js';
import { updatesUI } from './updates-ui.js';
import { isSettingsPage } from './settings-ui.js';
import { filePreviewDialog } from './file-links.js';
import { escapeHtml as escape } from './html-escape.js';
import { patchChildren } from './core/dom.js';
import { createStateClient, connectStateV2 } from './state-client.js';
import { icon, pdMark } from './ui/icons.js';
import { providerNames } from './ui/providers.js';
import { mountShell } from './ui/shell.js';
import { lighting } from './ui/lighting.js';
import { selectHold } from './ui/select-hold.js';
import { startupNotices } from './ui/startup-notices.js';
import { applyTheme, ensureBackdropSky } from './ui/theme-sync.js';
import { formSubmitter } from './ui/form-submit.js';
import { isOpenConsole, isReady, gridSize, gridCapacity, coveredSlots, openPanel, resizeHandles } from './console/panels.js';
import { consoleMarks } from './console/marks.js';
import { consoleTerminals } from './console/terminals.js';
import { consoleGrid } from './console/grid.js';
import { consoleHud } from './console/hud.js';
import { consoleChooser } from './console/chooser.js';
import { slotNames } from './console/slot-names.js';
import { installAccountMenus } from './console/account-menu.js';
import { usagePage } from './pages/usage-page.js';
import { accountSettings } from './pages/accounts-settings.js';
import { toolsPage } from './pages/tools-page.js';
import { settingsPage } from './pages/settings-page.js';

const $ = selector => document.querySelector(selector);
let state, toastTimer;
// Window view state is mutated here; controllers receive live read-only getters.
const view = { page: 'consoles', selectedId: null, expandedId: null, openingConsole: false, windowMoving: false };
const readView = Object.freeze(Object.defineProperties({}, Object.fromEntries(
  Object.keys(view).map(key => [key, { enumerable: true, get: () => view[key] }])
)));
let expansionRequest = 0, expansionModeIntent = null, stateReceiveVersion = 0;
let renderedView = null, viewAnimation, pageBeforeSettings = 'consoles';
let bareFullscreen = false, fullscreenPending = false; // set when F11, not a console expansion, entered fullscreen
const getState = () => state, getPage = () => view.page;
// Feature modules created at the end of startup.
let reviewPanels, setup, workbench, layoutMotion, phone, projects, projectChats, savedPrompts, imageGenerator, updates, taskLoops, remoteHosts, vim;
const viewFade = [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], viewFadeTiming = { duration: 160, easing: 'cubic-bezier(.22,1,.36,1)' };
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

const { providerName, consoleProviders } = providerNames(getState);
const { shellMark, readyIcon } = consoleMarks(providerName);
const workerComposers = workerComposer({ call, escape, toast });
mountShell($('#app'), { consoleProviders, providerName });
const submitForm = formSubmitter(toast);
const lights = lighting();
const notices = startupNotices(getState);
const openFile = filePreviewDialog({ call, toast, icon });
const appearance = consoleAppearance({ call, getState });
const accounts = accountSettings({ getState, call, toast, providerName, getPage, renderPage, navigate: navigatePage, reducedMotion, submitForm });
const renderHold = selectHold(renderPage);
const terminals = consoleTerminals({
  call, toast, getState, view: readView, openFile, acknowledge: acknowledgeSession, lightUp: lights.lightUp, motion: () => layoutMotion,
  selectConsole: id => { view.selectedId = id; projectChats?.sync(); }, onWrite: () => hud.updatePreview()
});
const hud = consoleHud({ getState, view: readView, terminals, providerName, shellMark, readyIcon });
window.dock.onSelect(selection => {
  const id = typeof selection === 'string' ? selection : selection?.id;
  if (!id) return;
  if (selection?.textSize === 'largest') terminals.changeTextSize(id, 10 - terminals.textStep(id));
  selectSession(id).catch(error => toast(error.message, true));
});
window.dock.onNotice?.(item => {
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  if (item.destination === 'phone-pairing') { phone.open({ pair: true }); return; }
  workbench.openNotice(item).catch(error => toast(error.message, true));
});
// State protocol 2 is the default: the main process sends slice changes and
// the snapshot is rebuilt here. Full dock:state snapshots stay the fallback
// (protocol 2 turned off, an older preload, or a failed subscription).
const store = createStateClient();
window.dock.onState(receive);
if (window.dock.state?.send && window.dock.state?.onMessage) {
  connectStateV2({ transport: window.dock.state, read: method => call(method), onSnapshot: receive, onFallback: error => {
    console.warn(`State updates use full snapshots: ${error.message}`);
    window.dock.call('state.legacy').then(result => { if (result?.ok && result.value) receive(result.value); }, () => {});
  } });
}
const chooser = consoleChooser({ call, getState, view: readView, providerName, consoleProviders, shellMark, openSetup: () => setup.open(), projects: () => projects, renderHud: () => hud.render(), openNew });
const names = slotNames({ call, toast, getState });
const accountMenuActions = installAccountMenus({ call, toast });
const grid = consoleGrid({
  getState, view: readView, clearExpanded: () => { view.expandedId = null; }, appearance, terminals, workerComposers, names, providerName, readyIcon, reducedMotion, applySidebar, lightingChanged: lights.changed,
  panels: { reviewPanels: () => reviewPanels, projectChats: () => projectChats, savedPrompts: () => savedPrompts, motion: () => layoutMotion }
});
const usage = usagePage({ getState, call, toast, providerName, renderPage, openNewAccount: provider => accounts.openNewAccount(provider) });
const tools = toolsPage({ getState, receiveState: receive, call, toast, getPage, renderPage, navigate: navigatePage, imageGenerator: () => imageGenerator, submitForm });
const settings = settingsPage({ getState, getPage, call, toast, providerName, consoleProviders, appearance, accounts, tools, submitForm,
  panels: { remoteHosts: () => remoteHosts, phone: () => phone, updates: () => updates } });

function renderPage() {
  if (!state) return;
  if (renderHold.hold()) return;
  queueMicrotask(() => vim?.refresh());
  applySidebar();
  projectChats?.sync();
  if ($('#workspace-error')) $('#workspace-error').textContent = state.workspaceError || '';
  const consoleView = ['consoles', 'overview'].includes(view.page);
  if (view.page === 'vault') view.page = 'tools';
  const page = view.page;
  const settingsView = isSettingsPage(page), settingsOpening = settingsView && !isSettingsPage(renderedView);
  if (!settingsView) pageBeforeSettings = page;
  if (settingsView) { document.body.dataset.settingsOpen = ''; document.body.style.setProperty('--titlebar-h', $('.titlebar').offsetHeight + 'px'); } else delete document.body.dataset.settingsOpen;
  $('#consoles-page').hidden = !consoleView;
  $('#content').hidden = consoleView;
  $('#content').dataset.view = page;
  terminals.renderScreenshot();
  const changed = renderedView !== null && renderedView !== page;
  // Moving between Settings categories keeps the heading and tabs still; only the panel fades.
  const settingsSwitch = changed && isSettingsPage(renderedView) && settingsView;
  renderedView = page;
  let pageFade = false;
  if (changed && !settingsSwitch) {
    viewAnimation?.cancel();
    if (!view.windowMoving && state.mode !== 'hud' && !reducedMotion.matches) {
      // Pages fade in after rendering, without the shared background (see below).
      if (consoleView) viewAnimation = $('#consoles-page').animate(viewFade, viewFadeTiming);
      else pageFade = true;
    }
  }
  document.querySelectorAll('[data-page]').forEach(button => button.classList.toggle('selected', button.dataset.page === (['tasks', 'results'].includes(page) ? 'projects' : page) || button.closest('.sidebar-bottom') && settingsView));
  document.querySelectorAll('.sidebar [data-page]').forEach(button => { if (button.classList.contains('selected') && !button.classList.contains('brand')) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  if (consoleView) { grid.render(); return; }
  const renderer = settingsView ? settings.render : { projects: () => projects.render(), tasks: () => taskLoops.render(), results: () => workbench.render('results'), usage: usage.render }[page] || settings.render;
  const content = $('#content');
  const backgroundLayer = content.querySelector(':scope > .page-background-layer');
  const markup = (state.storageError ? `<div class="error-banner" role="alert">${escape(state.storageError)}</div>` : '') + (['tasks', 'results'].includes(page) ? '<div class="project-actions"><button type="button" class="subtle" data-page="projects">Projects</button></div>' : '') + renderer();
  // The same view is patched in place; a different view is replaced outright.
  if (changed || !content.firstElementChild || content.dataset.patched !== page) { content.innerHTML = markup; content.dataset.patched = page; }
  else patchChildren(content, markup);
  // #content owns one sky for its lifetime. Keep its canvas node so mountSky's
  // seeded particles, shooting-star schedule and elapsed phase survive redraws.
  if (backgroundLayer) content.prepend(backgroundLayer);
  if (!settingsView) ensureBackdropSky(content, 57, state.settings);
  // The background layer is shared by every page; fading it made each switch look like a reload.
  if (pageFade) {
    const fades = [...content.children].filter(el => !el.classList.contains('page-background-layer')).map(el => el.animate(viewFade, viewFadeTiming));
    viewAnimation = { cancel: () => fades.forEach(fade => fade.cancel()) };
  }
  workbench?.mount();
  taskLoops?.mount();
  if (settingsOpening && !view.windowMoving && !reducedMotion.matches) { viewAnimation?.cancel(); viewAnimation = $('.settings-overlay')?.animate([{ opacity: 0, transform: 'scale(1.03)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' }); }
  lights.changed();
  if (settingsSwitch && !view.windowMoving && !reducedMotion.matches) { viewAnimation?.cancel(); viewAnimation = $('.settings-content')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'ease-out' }); }
  tools.mount();
  settings.mount();
}

function receive(next, knownSlices) {
  next = { ...next, sessions: Array.isArray(next.sessions) ? next.sessions : [], codePanels: Array.isArray(next.codePanels) ? next.codePanels : [], delegations: Array.isArray(next.delegations) ? next.delegations : [] };
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
  grid.noteOpenings(state, next);
  const panelsOpen = id => [...next.sessions, ...(next.codePanels || [])].some(session => session.id === id && isOpenConsole(session));
  if (view.expandedId && (next.mode === 'hud' || !panelsOpen(view.expandedId))) {
    view.expandedId = null;
    ++expansionRequest;
    grid.syncExpanded();
  }
  if (view.selectedId && !panelsOpen(view.selectedId)) view.selectedId = null;
  const changedSlices = store.setLegacy(next, knownSlices);
  state = next;
  notices.render();
  if (!knownSlices || knownSlices.includes('preferences')) applyTheme(state, { settingsOpen: isSettingsPage(view.page), appearance, lightingChanged: lights.changed });
  // Only F11 fullscreen hides the title bar; expanding a console keeps it.
  if (document.body.classList.contains('is-fullscreen') && state.mode !== 'fullscreen') bareFullscreen = false;
  document.body.classList.toggle('is-fullscreen', state.mode === 'fullscreen');
  const hideTitlebar = state.mode === 'fullscreen' && bareFullscreen;
  if (document.body.classList.contains('titlebar-hidden') !== hideTitlebar) {
    document.body.classList.toggle('titlebar-hidden', hideTitlebar); document.body.classList.remove('titlebar-peek'); terminals.scheduleFits();
  }
  document.body.classList.toggle('steady-cursor', !state.settings.cursorBlink);
  terminals.receive(state);
  const fullscreenButton = $('.window-actions [data-action=fullscreen]');
  if (fullscreenButton.dataset.mode !== state.mode) {
    fullscreenButton.dataset.mode = state.mode;
    fullscreenButton.innerHTML = icon(state.mode === 'fullscreen' ? 'restore' : 'expand');
    fullscreenButton.title = state.mode === 'fullscreen' ? 'Restore window' : 'Fullscreen';
    fullscreenButton.setAttribute('aria-label', fullscreenButton.title);
  }
  workbench?.sync();
  taskLoops?.sync();
  imageGenerator?.sync();
  setup?.receive();
  phone?.receive();
  updates?.sync();
  projects?.observeKnowledgePolicy();
  if (view.page === 'projects') projects?.refreshCards();
  chooser.syncProviders();
  if ($('#workspace-error')) $('#workspace-error').textContent = state.workspaceError || '';
  document.body.dataset.platform = state.platform || 'win32';
  view.windowMoving = !!state.transitioning;
  document.body.classList.toggle('window-moving', view.windowMoving);
  terminals.disposeClosed(state);
  const hudMode = state.mode === 'hud';
  $('#dashboard').hidden = hudMode; $('#hud').hidden = !hudMode;
  $('#nav-count').textContent = state.sessions.filter(x => isOpenConsole(x) && x.alive).length;
  const readyCount = state.sessions.filter(isReady).length;
  $('#ready-count').textContent = readyCount; $('#ready-count').hidden = !readyCount;
  $('#ready-count').closest('button').setAttribute('aria-label', readyCount ? `Consoles, ${readyCount} ready for you` : 'Consoles');
  terminals.renderScreenshot();
  applySidebar();
  tools.receive();
  syncIntegrationJobs(state);
  tools.afterReceive();
  if (hudMode && !chooser.gestureActive() && !chooser.isOpen() && !document.body.classList.contains('window-dragging')) hud.render();
  else if (['overview', 'consoles', 'usage', 'agent-settings'].includes(view.page) &&
    (knownSlices ? (view.page === 'consoles' ? changedSlices.some(slice => ['sessions', 'panels', 'preferences', 'projects', 'accounts', 'agents', 'shell', 'queues', 'prompts', 'delegations'].includes(slice)) : changedSlices.length > 0) : (changedSlices.length || !['usage', 'agent-settings'].includes(view.page)))) renderPage();
  for (const [id, effect] of sessionEffects) {
    const panel = state.mode === 'hud'
      ? [...document.querySelectorAll('.hud-console[data-session]')].find(item => item.dataset.session === id)
      : [...document.querySelectorAll('.session-grid .session-card[data-console-id]')].find(item => item.dataset.consoleId === id);
    if (panel) playConsoleStateEffect(panel, effect);
  }
  if (!view.windowMoving) terminals.scheduleFits();
  vim?.refresh();
}
function applySidebar() {
  const sidebar = $('#sidebar'), titlebar = $('.titlebar'), content = $('#content');
  document.body.style.setProperty('--titlebar-h', titlebar.offsetHeight + 'px');
  if (view.expandedId && content.contains(document.activeElement)) document.querySelector(`.session-card[data-console-id="${CSS.escape(view.expandedId)}"] [data-action="toggle-console"]`)?.focus({ preventScroll: true });
  sidebar.inert = false;
  sidebar.removeAttribute('aria-hidden');
  titlebar.inert = false;
  titlebar.removeAttribute('aria-hidden');
  content.inert = !!view.expandedId;
  sidebar.dataset.collapsed = 'false';
}

const acknowledgments = new Set();
async function acknowledgeSession(id) {
  const needsAttention = state.sessions.some(session => session.id === id && isReady(session));
  if (acknowledgments.has(id) || !needsAttention) return;
  acknowledgments.add(id);
  try { await call('session.acknowledge', id); }
  finally { acknowledgments.delete(id); }
}
async function focusTerminal(id) {
  await terminals.get(id)?.ready;
  terminals.fitVisible(); terminals.get(id)?.term.focus();
}
// Expands a console in fullscreen. Later expansions, mode changes or a
// relaunched console cancel this one.
async function selectSession(id) {
  const target = openPanel(state, id);
  if (!target) return false;
  const launchId = target.launchId || null;
  const sameTarget = session => isOpenConsole(session) && (session.launchId || null) === launchId;
  view.selectedId = id;
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
    if (request !== expansionRequest || state.mode !== 'fullscreen' || state.transitioning || !sameTarget(openPanel(state, id))) return false;
    view.selectedId = id;
    view.expandedId = id;
    view.page = 'consoles';
    renderPage();
  } finally {
    if (expansionModeIntent === modeIntent) expansionModeIntent = null;
  }
  await acknowledgeSession(id);
  await terminals.get(id)?.ready;
  if (request === expansionRequest && view.expandedId === id && openPanel(state, id)) { terminals.fitVisible(); terminals.get(id)?.term.focus(); }
  return true;
}
function restoreExpandedConsole({ focus = true } = {}) {
  if (!view.expandedId) return false;
  const id = view.expandedId;
  view.expandedId = null;
  ++expansionRequest;
  renderPage();
  const control = document.querySelector(`.session-card[data-console-id="${CSS.escape(id)}"] [data-action="toggle-console"]`);
  if (focus && control?.isConnected) control.focus({ preventScroll: true });
  terminals.scheduleFits();
  return true;
}
function navigatePage(next) {
  view.expandedId = null;
  ++expansionRequest;
  grid.syncExpanded();
  view.page = next;
  renderPage();
}
function closeSettings() {
  navigatePage(isSettingsPage(pageBeforeSettings) ? 'consoles' : pageBeforeSettings);
  if (!reducedMotion.matches) $('.workspace')?.animate([{ opacity: .6, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.22,1,.36,1)' });
  $('.sidebar-bottom [data-page=settings]')?.focus({ preventScroll: true });
}
async function openNew(slot, overrides = null) {
  if (view.openingConsole) return;
  if (!slot) slot = Array.from({ length: gridCapacity(state) }, (_, i) => i + 1).find(x => !coveredSlots(state).has(x));
  if (slot && coveredSlots(state).has(Number(slot))) { toast('That space is already open.'); return; }
  view.openingConsole = true;
  document.querySelectorAll('[data-action="new"]').forEach(button => button.disabled = true);
  try {
    // A click on plus can blur an edited title; finish that save before launching.
    await names.settled();
    const session = await call('session.create', { ...overrides, ...(slot ? { slot: Number(slot) } : {}) });
    if (overrides) chooser.close();
    if (state.mode === 'hud' || view.expandedId) await selectSession(session.id);
    else {
      view.selectedId = session.id; navigatePage('consoles');
      await focusTerminal(session.id);
    }
    return session;
  } catch (error) {
    if (overrides) throw error;
    navigatePage('settings');
    if (state.mode !== 'dashboard') await call('mode', 'dashboard');
    renderPage(); toast(error.message, true);
  } finally {
    view.openingConsole = false;
    document.querySelectorAll('[data-action="new"]').forEach(button => button.disabled = false);
  }
}

// Buttons with a data-action. Page controllers contribute their own actions.
const actions = {
  ...usage.actions, ...accounts.actions, ...tools.actions, ...accountMenuActions,
  'close-settings': () => closeSettings(),
  async 'toggle-console'(button) {
    if (view.expandedId === button.dataset.id) restoreExpandedConsole();
    else await selectSession(button.dataset.id);
  },
  new: button => openNew(button.dataset.slot),
  'cancel-console'() { if (!view.openingConsole) chooser.close(); },
  'vim-normal': () => vim.enterNormal(),
  'vim-help': () => vim.showHelp(),
  async 'pick-folder'(button) {
    const form = button.closest('form');
    const folder = await call('pickFolder', { cwd: form.elements.cwd.value });
    if (folder) { form.elements.cwd.value = folder; form.elements.cwd.dispatchEvent(new Event('input', { bubbles: true })); }
  },
  'agent-setup': () => setup.open(),
  hud: () => call('mode', 'hud'),
  async dashboard() { navigatePage('consoles'); await call('mode', 'dashboard'); renderPage(); },
  fullscreen: () => call('mode', state.mode === 'fullscreen' ? 'dashboard' : 'fullscreen'),
  minimize: () => call('minimize'),
  tray: () => call('tray'),
  refresh: () => call('refresh'),
  quit: () => call('quit'),
  'restart-normal': () => call('restart.normal'),
  'dismiss-startup-notice': button => notices.dismiss(Number(button.dataset.index)),
  // Ending is explicit: workers stop through their task; hiding a console never ends it.
  async 'end-session'(button) {
    const id = button.dataset.id || view.selectedId, worker = state.sessions.find(item => item.id === id && item.taskId);
    if (worker) await call('worker.stop', { id, consoleKey: worker.consoleKey, launchId: worker.launchId });
    else await call('session.end', id);
  },
  'paste-screenshot': () => terminals.pasteScreenshot(view.selectedId),
  async 'retry-session'(button) {
    button.disabled = true;
    try { const restored = await call('session.retry', button.dataset.id); if (view.expandedId === button.dataset.id) { view.expandedId = restored.id; view.selectedId = restored.id; } renderPage(); }
    finally { button.disabled = false; }
  }
};
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    // Controllers return false synchronously when the button is not theirs.
    const pageClick = usage.click(button) || accounts.click(button);
    if (pageClick) { await pageClick; return; }
    if (button.dataset.page) { navigatePage(button.dataset.page); $('#content').scrollTop = 0; return; }
    if (button.dataset.session) return await selectSession(button.dataset.session);
    if (button.dataset.docs) return await call('docs', button.dataset.docs);
    const toolClick = tools.click(button);
    if (toolClick) { await toolClick; return; }
    if (button.dataset.textSize) { terminals.changeTextSize(button.dataset.id, Number(button.dataset.textSize)); return; }
    if (settings.click(button)) return;
    const name = button.dataset.action;
    if (name && Object.hasOwn(actions, name)) await actions[name](button);
  } catch (error) { toast(error.message, true); }
});
// Form submits by form id. Projects, console projects and image generation handle their own.
const submits = {
  ...accounts.submits, ...tools.submits, ...settings.submits,
  'one-off-console-form': (form, data) => submitForm(form, () => chooser.submit(form, data))
};
document.addEventListener('submit', async event => {
  if (['project-form', 'console-project-form', 'image-generation-form'].includes(event.target.id)) return;
  event.preventDefault();
  // A form with a field named "id" shadows form.id, so read the attribute.
  const form = event.target, id = form.getAttribute('id');
  if (id && Object.hasOwn(submits, id)) await submits[id](form, Object.fromEntries(new FormData(form)));
});
document.addEventListener('keydown', event => {
  const terminalFocus = !!event.target.closest?.('.xterm');
  const editableFocus = !terminalFocus && !!event.target.closest?.('input,textarea,select,[contenteditable="true"]');
  const returnFromTerminal = event.ctrlKey && event.shiftKey && event.code === 'Enter';
  if (view.expandedId && event.key === 'Escape' && !editableFocus && !event.defaultPrevented && !document.querySelector('dialog[open], [popover]:popover-open') && (!terminalFocus || returnFromTerminal)) {
    event.preventDefault(); event.stopImmediatePropagation();
    restoreExpandedConsole(); return;
  }
  if (view.expandedId && returnFromTerminal && !editableFocus && !event.defaultPrevented && !document.querySelector('dialog[open], [popover]:popover-open')) {
    event.preventDefault(); event.stopImmediatePropagation();
    restoreExpandedConsole(); return;
  }
  if (event.key === 'Escape' && isSettingsPage(view.page) && !event.defaultPrevented && !document.querySelector('dialog[open]') && state?.mode !== 'hud') {
    event.preventDefault(); closeSettings(); return;
  }
  if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === 'KeyN') {
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat) void openNew();
  }
  if (event.key === 'F11') {
    event.preventDefault(); event.stopPropagation();
    if (event.repeat || state.transitioning || fullscreenPending) return;
    fullscreenPending = true; bareFullscreen = state.mode !== 'fullscreen';
    call('mode', bareFullscreen ? 'fullscreen' : 'dashboard').catch(error => toast(error.message, true)).finally(() => { fullscreenPending = false; });
  }
}, true);
// In F11 fullscreen the title bar stays hidden until the pointer reaches the top edge.
document.addEventListener('pointermove', event => {
  if (!document.body.classList.contains('titlebar-hidden')) return;
  if (event.clientY <= 4) document.body.classList.add('titlebar-peek');
  else if (!event.target.closest?.('.titlebar, .shell-picker, [popover]')) document.body.classList.remove('titlebar-peek');
}, { passive: true });
lights.install();

function focusVimSlot(slot) {
  slot = coveredSlots(state).get(slot)?.slot || slot;
  if (state.mode !== 'hud' && !['consoles', 'overview'].includes(view.page)) navigatePage('consoles');
  const panel = document.querySelector(state.mode === 'hud' ? `.hud-slot[data-slot="${slot}"]` : `.session-card[data-slot="${slot}"]`);
  panel?.focus({ preventScroll: true });
}
async function vimAction(action, value) {
  if (action === 'page') {
    navigatePage(value);
    if (state.mode === 'hud') await call('mode', 'dashboard');
    if (view.page === 'consoles') focusVimSlot(vim.slot); else $('#content').focus({ preventScroll: true });
    return;
  }
  if (action === 'navigation') { $('#sidebar nav [data-page="consoles"]').focus({ preventScroll: true }); return; }
  if (action === 'fullscreen') { await call('mode', state.mode === 'fullscreen' ? 'dashboard' : 'fullscreen'); return; }
  if (action === 'dock') { await call('mode', 'hud'); focusVimSlot(vim.slot); return; }
  const session = coveredSlots(state).get(value);
  if (action === 'open') { if (session) await selectSession(session.id); else await openNew(value); }
  else if (action === 'new') await openNew(value);
  else if (action === 'choose') {
    const button = document.querySelector(`${state.mode === 'hud' ? '#hud' : '#consoles-page'} [data-action="new"][data-slot="${value}"]`);
    if (button) chooser.choose(button);
  } else if (action === 'rename') {
    if (state.mode === 'hud') { navigatePage('consoles'); await call('mode', 'dashboard'); renderPage(); }
    else focusVimSlot(value);
    document.querySelector(`#consoles-page .console-name[data-name-slot="${value}"]`)?.focus();
  } else if (action === 'type') {
    if (!isOpenConsole(session) || !session.alive) { toast('Press n to open a console here.'); return; }
    if (state.mode === 'hud') { await selectSession(session.id); return; }
    focusVimSlot(value); view.selectedId = session.id;
    await focusTerminal(session.id);
  }
}
vim = vimControls({
  context: () => ({ enabled: state?.settings.vimControls === true, view: state?.mode === 'hud' ? 'hud' : view.expandedId ? 'terminal' : view.page, sessions: state?.sessions || [], grid: gridSize(state), busy: view.windowMoving || view.openingConsole }),
  focusSlot: focusVimSlot, action: vimAction, onError: message => toast(message, true)
});
reviewPanels = reviewPanelUI({ call, getState, escape, icon, resizeHandles, toast, openResult: id => workbench.openResult(id) });
phone = mobileUI({ call, escape, icon, getState, toast, navigate: navigatePage });
projects = projectsUI({ call, getState, escape, icon, toast, renderPage, openNew, preview: value => openFile(null, value), openResult: id => workbench.openResult(id), getPage });
projectChats = consoleProjects({ call, getState, getView: () => ({ page: view.page, selectedId: view.selectedId }), projects, navigate: navigatePage, escape, icon, toast });
savedPrompts = consolePrompts({ call, getState, escape, icon, toast, paste: (id, text) => terminals.paste(id, text), agentProviders: () => (state?.agents || []).map(x => x.id) });
imageGenerator = imageGenerationUI({ call, getState, escape, toast });
remoteHosts = sshUI({ call, escape, getState, toast, render: renderPage });
updates = updatesUI({ call, getState, escape, icon, toast });
setup = firstRun({ call, escape, icon, pdMark, getState });
windowDragging(call, getState);
layoutMotion = consoleMotion({ render: grid.render, fit: terminals.scheduleFits });
consoleDragging({ call, toast, motion: layoutMotion });
consoleLayoutUI({ call, getState, motion: layoutMotion, toast });
workbench = workbenchUI({ call, getState, getPage, renderPage, escape, toast, selectSession, navigate: navigatePage });
taskLoops = taskLoopUI({ call, getState, getPage, renderPage, escape, toast, openResult: id => workbench.openResult(id) });
toolFeatures({ call, getState, navigate: navigatePage, render: tools.refreshSections, toast, escape });
try { state = await call('state'); receive(state); renderPage(); } catch (error) { $('#content').textContent = error.message; }
