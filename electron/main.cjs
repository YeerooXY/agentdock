'use strict';
const { app, BrowserWindow, ipcMain, dialog, screen, systemPreferences, globalShortcut, safeStorage, Tray, Menu, nativeImage, Notification, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { Vault, readJson, atomicJson, validateKeyId } = require('./storage.cjs');
const { CodexAccount, RecentCodex, findProgram, findClaude, consoleModels } = require('./adapters.cjs');
const { Sessions, validateConsoleDefaults } = require('./sessions.cjs');
const { Workspace } = require('./workspace.cjs');
const { runApi } = require('./api-run.cjs');
const { SharedHub } = require('./shared.cjs');
const { validateProvider, validateRequest, ledgerSummary, number } = require('./domain.cjs');
app.setName('Agent Dock');
if (process.platform === 'win32') app.setAppUserModelId(process.execPath);
const testMode = process.argv.includes('--smoke-test');
const testDir = process.argv.find(x => x.startsWith('--data-dir='))?.slice(11);
if (testMode && testDir) app.setPath('userData', testDir);
if (!app.requestSingleInstanceLock() && !testMode) app.quit();
let window, tray, vault, sessions, workspace, account, root, settings, ledger, balloonClick, hub;
let mode = 'dashboard', quitting = false, refreshing = false, lastRefresh = 0, apiBusy = false;
let modeTarget = null, modeTask, modeSequence = 0, transitioning = false;
let limits = [], recent = [], accountError = null, capabilities = {}, storageError = null, workspaceError = null, shortcutAvailable = false;
const recentReader = new RecentCodex();
const entryFile = path.join(__dirname, '..', 'dist', 'index.html');
const entryUrl = pathToFileURL(entryFile).href;
const projectsFolder = path.join(os.homedir(), 'Projects');
const defaultFolder = fs.existsSync(projectsFolder) && fs.statSync(projectsFolder).isDirectory() ? projectsFolder : os.homedir();
function snapshot() {
  return { mode, transitioning, sessions: sessions?.list() || [], limits, recent, accountError, refreshing, lastRefresh,
    capabilities, vault: { available: vault?.available() || false, entries: vault?.list() || [] },
    ledger: ledger || [], summary: ledgerSummary(ledger || []), shared: hub?.snapshot(), settings, storageError, workspaceError, shortcutAvailable,
    defaultFolder, version: app.getVersion() };
}
function publish() { if (window && !window.isDestroyed()) window.webContents.send('dock:state', snapshot()); }
function notifySession(session) {
  const title = `${session.slot}. ${session.name}`;
  const body = session.state === 'ready' ? 'Ready for your review.' : 'Needs your attention.';
  const select = () => { setMode('fullscreen'); window.webContents.send('dock:select', session.id); };
  const fallback = () => {
    if (tray && process.platform === 'win32') { balloonClick = select; tray.displayBalloon({ title, content: body, respectQuietTime: true }); }
  };
  if (!Notification.isSupported()) return fallback();
  const notice = new Notification({ title, body });
  notice.on('click', select); notice.on('failed', fallback); notice.show();
}
function persistSettings(next) { atomicJson(path.join(root, 'settings.json'), next); settings = next; }
function setMode(next) {
  if (!window || window.isDestroyed() || quitting || !['hud', 'dashboard', 'fullscreen'].includes(next)) return Promise.resolve();
  if (modeTarget === next) return modeTask;
  const sequence = ++modeSequence;
  modeTarget = next;
  modeTask = moveWindow(next, sequence).finally(() => {
    if (sequence !== modeSequence) return;
    transitioning = false; modeTarget = null; modeTask = null; publish();
  });
  return modeTask;
}
async function moveWindow(next, sequence) {
  const current = () => sequence === modeSequence && !quitting && window && !window.isDestroyed();
  const start = window.getBounds(), display = screen.getDisplayMatching(start), area = display.workArea;
  const width = Math.min(1240, area.width - 40), height = Math.min(840, area.height - 40);
  const target = next === 'hud' ? { x: area.x + area.width - 388, y: area.y + 18, width: 370, height: 440 }
    : next === 'fullscreen' ? display.bounds
      : { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + (area.height - height) / 2), width, height };
  const changed = next !== mode || Object.keys(target).some(key => start[key] !== target[key]);
  const animation = systemPreferences.getAnimationSettings();
  const animate = changed && window.isVisible() && !window.isMinimized() && animation.shouldRenderRichAnimation && !animation.prefersReducedMotion;
  if (!changed) { window.show(); window.focus(); return; }
  if (animate) {
    transitioning = true; publish();
    await new Promise(resolve => setTimeout(resolve, 80));
    if (!current()) return;
  }
  window.setResizable(true);
  // Allow movement through the HUD's smaller dimensions without a size jump.
  window.setMinimumSize(340, 390);
  if (window.isFullScreen() && next !== 'fullscreen') { window.setFullScreen(false); window.setBounds(start); }
  if (window.isMaximized()) { window.unmaximize(); window.setBounds(start); }
  if (window.isMinimized()) window.restore();
  // Keep a way back to the app even when Show Desktop hides the corner HUD.
  window.setSkipTaskbar(false);
  mode = next; publish();
  // Fullscreen uses one native resize under the fade, so terminal text does not stretch.
  if (animate && next !== 'fullscreen') {
    const began = performance.now();
    while (current()) {
      const frameBegan = performance.now();
      const progress = Math.min(1, (frameBegan - began) / 260);
      const eased = 1 - Math.pow(1 - progress, 3);
      window.setBounds(Object.fromEntries(Object.keys(target).map(key => [key, Math.round(start[key] + (target[key] - start[key]) * eased)])));
      if (progress === 1) break;
      await new Promise(resolve => setTimeout(resolve, Math.max(1, 16 - (performance.now() - frameBegan))));
    }
    if (!current()) return;
  }
  window.setBounds(target);
  if (next === 'fullscreen') window.setFullScreen(true);
  window.setMinimumSize(next === 'hud' ? 340 : 720, next === 'hud' ? 390 : 520);
  window.setResizable(next !== 'hud');
  window.setAlwaysOnTop(next === 'hud' && settings.hudAlwaysOnTop);
  window.show(); window.focus();
}
async function refreshLimits() {
  if (refreshing || testMode) return;
  refreshing = true; publish();
  try { await account.refresh(); accountError = null; lastRefresh = Date.now(); }
  catch (error) { accountError = error.message; }
  finally { refreshing = false; publish(); }
}
async function quit() {
  const active = sessions.list().filter(x => x.alive).length;
  if (active && !testMode) {
    const result = await dialog.showMessageBox(window, { type: 'question', buttons: ['Keep running', 'End consoles and quit'], defaultId: 0, cancelId: 0, message: `End ${active} open console${active === 1 ? '' : 's'} and quit?`, detail: settings.restoreConsoles ? 'Your panels will reopen next time. Running tasks stop when you quit.' : 'Use the corner HUD to keep your sessions running in the background.' });
    if (result.response !== 1) return;
  }
  quitting = true; app.quit();
}
app.whenReady().then(async () => {
  root = app.getPath('userData'); fs.mkdirSync(root, { recursive: true });
  const defaults = { hudAlwaysOnTop: false, notifications: true, restoreConsoles: true, agentPermissions: 'default', sidebarCollapsed: false, slotNames: {}, rates: {}, consoleDefaults: { provider: 'codex', cwd: defaultFolder, name: '', command: '' } };
  const savedSettings = readJson(path.join(root, 'settings.json'), {});
  settings = { ...defaults, ...savedSettings, consoleDefaults: { ...defaults.consoleDefaults, ...savedSettings.consoleDefaults } };
  ledger = readJson(path.join(root, 'ledger.json'), []);
  vault = new Vault(path.join(root, 'vault.json'), safeStorage);
  hub = new SharedHub(root, vault); await hub.start();
  const claude = findClaude();
  sessions = new Sessions(root, { hub, claude });
  capabilities = { codex: !!findProgram('codex'), claude: !!claude, claudeLocation: claude?.label, node: !!findProgram('node'), shell: true };
  const savedLimits = readJson(path.join(root, 'limits.json'), []);
  limits = Array.isArray(savedLimits) ? savedLimits : [];
  account = new CodexAccount(values => {
    limits = [...limits.filter(x => x.provider !== 'codex'), ...values];
    try { atomicJson(path.join(root, 'limits.json'), limits); } catch (error) { storageError = error.message; }
    publish();
  });
  sessions.on('changed', publish);
  sessions.on('output', data => { if (window && !window.isDestroyed()) window.webContents.send('dock:output', data); });
  sessions.on('limits', value => {
    limits = [...limits.filter(x => x.id !== value.id), value];
    try { atomicJson(path.join(root, 'limits.json'), limits); } catch (error) { storageError = error.message; }
    publish();
  });
  sessions.on('attention', session => {
    if (settings.notifications && !testMode) notifySession(session);
  });
  workspace = new Workspace(root, sessions, safeStorage, { enabled: settings.restoreConsoles, onError: message => { workspaceError = message; publish(); } });
  await workspace.restore();
  window = new BrowserWindow({ width: 1240, height: 840, minWidth: 720, minHeight: 520, frame: false, show: false, backgroundColor: '#010103', title: 'Agent Dock', icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.on('render-process-gone', () => { if (!quitting) window.loadFile(entryFile); });
  window.on('close', event => { if (!quitting && !testMode) { event.preventDefault(); setMode('hud'); } });
  window.loadFile(entryFile);
  window.once('ready-to-show', () => setMode(process.argv.includes('--hud') ? 'hud' : 'dashboard'));
  const iconFile = path.join(__dirname, '..', 'assets', 'icon.png');
  if (fs.existsSync(iconFile)) {
    tray = new Tray(nativeImage.createFromPath(iconFile)); tray.setToolTip('Agent Dock');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open dashboard', click: () => setMode('dashboard') }, { label: 'Corner HUD', click: () => setMode('hud') }, { type: 'separator' }, { label: 'Quit Agent Dock', click: quit }]));
    tray.on('double-click', () => setMode((modeTarget || mode) === 'hud' ? 'dashboard' : 'hud'));
    tray.on('balloon-click', () => balloonClick?.());
  }
  shortcutAvailable = !testMode && globalShortcut.register('CommandOrControl+Alt+Space', () => setMode((modeTarget || mode) === 'hud' ? 'dashboard' : 'hud'));
  for (let i = 1; !testMode && i <= 9; i++) globalShortcut.register(`CommandOrControl+Alt+${i}`, () => {
    const item = sessions.list().find(x => x.slot === i); if (!item) return;
    setMode('fullscreen'); window.webContents.send('dock:select', item.id);
  });
  if (!testMode) { recent = recentReader.scan(); refreshLimits(); }
  setInterval(() => { sessions.scanEvents(); }, 1000).unref();
  if (!testMode) {
    setInterval(() => { recent = recentReader.scan(); sessions.updateUsage(recent); publish(); }, 12000).unref();
    setInterval(refreshLimits, 120000).unref();
  }
  ipcMain.handle('dock:call', async (event, method, payload) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== entryUrl) throw new Error('Untrusted client.');
    try {
      switch (method) {
        case 'state': return { ok: true, value: snapshot() };
        case 'mode': await setMode(payload); break;
        case 'minimize': window.minimize(); break;
        case 'quit': await quit(); break;
        case 'refresh': await refreshLimits(); break;
        case 'pickFolder': {
          const suggested = typeof payload?.cwd === 'string' && path.isAbsolute(payload.cwd) && fs.existsSync(payload.cwd) && fs.statSync(payload.cwd).isDirectory() ? payload.cwd : settings.consoleDefaults.cwd;
          const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: 'Choose a launch folder', defaultPath: suggested });
          return { ok: true, value: result.filePaths[0] || null };
        }
        case 'session.create': {
          const occupied = new Set(sessions.list().filter(x => x.alive || x.restoreError).map(x => x.slot));
          const slot = payload?.slot ?? Array.from({ length: 9 }, (_, i) => i + 1).find(x => !occupied.has(x));
          return { ok: true, value: await sessions.create({ ...settings.consoleDefaults, ...(settings.slotNames?.[slot] ? { name: settings.slotNames[slot] } : {}), ...payload, permissions: payload?.permissions ?? settings.agentPermissions }) };
        }
        case 'slot.name': {
          const slot = payload?.slot;
          if (!Number.isInteger(slot) || slot < 1 || slot > 9) throw new Error('Choose a console slot from 1 to 9.');
          if (typeof payload.name !== 'string' || payload.name.length > 64 || /[\x00-\x1f\x7f]/.test(payload.name)) throw new Error('Use a name up to 64 characters, on one line.');
          const item = sessions.list().find(x => x.slot === slot && (x.alive || x.restoreError));
          if ((item?.id || null) !== (payload.sessionId || null)) throw new Error('This slot has changed. Try naming it again.');
          const name = payload.name.trim(), slotNames = { ...settings.slotNames };
          if (name) slotNames[slot] = name; else delete slotNames[slot];
          persistSettings({ ...settings, slotNames });
          if (item) sessions.rename(item.id, name); else publish();
          break;
        }
        case 'session.models': return { ok: true, value: consoleModels(payload) };
        case 'session.retry': return { ok: true, value: await sessions.retry(payload) };
        case 'session.input': sessions.write(payload?.id, payload?.data); break;
        case 'session.resize': sessions.resize(payload?.id, payload?.cols, payload?.rows); break;
        case 'session.buffer': return { ok: true, value: sessions.buffer(payload) };
        case 'session.acknowledge': sessions.acknowledge(payload); break;
        case 'session.end': {
          const item = sessions.list().find(x => x.id === payload);
          if (!item) throw new Error('Console not found.');
          const result = testMode ? { response: 1 } : await dialog.showMessageBox(window, { type: 'question', buttons: ['Keep running', 'End console'], defaultId: 0, cancelId: 0, message: `End “${item.name}”?`, detail: 'This stops the console and any agent running inside it.' });
          if (result.response === 1) sessions.end(payload); break;
        }
        case 'vault.save': vault.set(payload?.provider, payload?.key, payload?.label); hub.writeSummary(); await Promise.allSettled([...hub.clients.keys()].map(id => hub.disconnect(id))); publish(); break;
        case 'vault.remove': {
          validateKeyId(payload);
          const used = hub.config.profiles.some(x => x.keyId === payload) || hub.config.connections.some(x => [x.envKeys, x.headerKeys, x.queryKeys].some(map => Object.values(map || {}).some(ref => ref.key === payload)));
          if (used && !testMode) { const result = await dialog.showMessageBox(window, { type: 'question', message: 'Remove this key?', detail: 'Connections using it will need another key.', buttons: ['Keep key', 'Remove'], defaultId: 0, cancelId: 0 }); if (result.response !== 1) break; }
          vault.remove(payload); hub.writeSummary(); await Promise.allSettled([...hub.clients.keys()].map(id => hub.disconnect(id))); publish(); break;
        }
        case 'shared.instructions': hub.instructions(payload); publish(); break;
        case 'tools.save': await hub.saveConnection(payload); publish(); break;
        case 'tools.remove': await hub.removeConnection(payload); publish(); break;
        case 'tools.test': { try { const result = await hub.test(payload); return { ok: true, value: result }; } finally { publish(); } }
        case 'profiles.save': hub.saveProfile(payload); publish(); break;
        case 'profiles.remove': hub.removeProfile(payload); publish(); break;
        case 'settings': {
          const next = { ...settings };
          if (typeof payload?.hudAlwaysOnTop === 'boolean') next.hudAlwaysOnTop = payload.hudAlwaysOnTop;
          if (typeof payload?.notifications === 'boolean') next.notifications = payload.notifications;
          if (typeof payload?.restoreConsoles === 'boolean') next.restoreConsoles = payload.restoreConsoles;
          if (typeof payload?.sidebarCollapsed === 'boolean') next.sidebarCollapsed = payload.sidebarCollapsed;
          if (payload?.consoleDefaults !== undefined) next.consoleDefaults = validateConsoleDefaults(payload.consoleDefaults);
          if (payload?.agentPermissions !== undefined) {
            if (!['default', 'unrestricted'].includes(payload.agentPermissions)) throw new Error('Choose a supported agent permission mode.');
            next.agentPermissions = payload.agentPermissions;
          }
          workspace.setEnabled(next.restoreConsoles);
          persistSettings(next); if (mode === 'hud') window.setAlwaysOnTop(settings.hudAlwaysOnTop); publish(); break;
        }
        case 'rates.save': {
          if (!hub.config.profiles.some(x => x.id === payload?.provider)) throw new Error('Choose an API connection.');
          if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(payload.model || '')) throw new Error('Enter a valid model ID.');
          const rates = {};
          for (const field of ['input', 'output', 'cached', 'cacheWrite']) {
            const value = payload[field] === '' || payload[field] === null || payload[field] === undefined ? null : Number(payload[field]);
            if (value !== null && (number(value) === null || value > 100000)) throw new Error('Rates must be nonnegative USD per million tokens.');
            rates[field] = value;
          }
          persistSettings({ ...settings, rates: { ...settings.rates, [`${payload.provider}:${payload.model}`]: rates } }); publish(); break;
        }
        case 'api.send': {
          if (testMode) throw new Error('Paid API requests are disabled during tests.');
          if (apiBusy) throw new Error('Wait for the current API request to finish.');
          const profile = hub.config.profiles.find(x => x.id === payload?.provider);
          if (!profile) throw new Error('Choose an API connection.');
          const key = profile.keyId ? vault.get(profile.keyId) : '';
          apiBusy = true;
          let result;
          try { result = await runApi(payload, key, settings.rates[`${profile.id}:${payload.model?.trim()}`], { profile, hub, onEntry: entry => {
            ledger = [entry, ...ledger];
            try { atomicJson(path.join(root, 'ledger.json'), ledger); }
            catch { storageError = 'Latest API usage is only in memory. Export it before quitting.'; }
            publish();
          } }); }
          finally { apiBusy = false; }
          publish(); return { ok: true, value: result };
        }
        case 'ledger.export': {
          const result = await dialog.showSaveDialog(window, { defaultPath: 'agent-dock-usage.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
          if (!result.canceled && result.filePath) atomicJson(result.filePath, { scope: 'API requests made through Agent Dock', currency: 'USD', costs: 'estimates', entries: ledger }); break;
        }
        case 'docs': {
          const urls = { codex: 'https://learn.chatgpt.com/docs/codex/cli', claude: 'https://code.claude.com/docs/en/overview', openai: 'https://developers.openai.com/api/docs/pricing', anthropic: 'https://platform.claude.com/docs/en/about-claude/pricing' };
          if (!urls[payload]) throw new Error('Unknown documentation link.'); await shell.openExternal(urls[payload]); break;
        }
        default: throw new Error('Unknown action.');
      }
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message || 'This action could not be completed.' }; }
  });
}).catch(error => { dialog.showErrorBox('Agent Dock could not start', error.message); app.quit(); });
app.on('second-instance', () => setMode('dashboard'));
let cleanupStarted = false, cleanupDone = false;
app.on('before-quit', event => {
  if (cleanupDone) return;
  event.preventDefault();
  if (cleanupStarted) return;
  cleanupStarted = true; quitting = true;
  workspace?.freeze();
  // Drain ConPTY exits while the event loop is alive, before Electron tears down its workers.
  (async () => {
    await sessions?.stop();
    await hub?.close();
    account?.stop();
    globalShortcut.unregisterAll();
  })().finally(() => { cleanupDone = true; app.quit(); });
});
app.on('window-all-closed', () => { if (testMode || quitting) app.quit(); });
