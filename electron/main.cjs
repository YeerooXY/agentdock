'use strict';
const { app, BrowserWindow, ipcMain, dialog, screen, systemPreferences, globalShortcut, safeStorage, Tray, Menu, nativeImage, Notification, shell, powerSaveBlocker } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { Vault, readJson, atomicJson, validateKeyId } = require('./storage.cjs');
const { CodexAccount, RecentCodex, findProgram, nativeCodex, findClaude, consoleModels } = require('./adapters.cjs');
const { runtimeFiles } = require('./runtime.cjs');
const { initialSettings } = require('./settings.cjs');
const { CliSetup } = require('./cli-setup.cjs');
const { catalog: cliCatalog, byId: cliAgents } = require('./cli-catalog.cjs');
const { cells: consoleCells, occupied: occupiedCells, planLayout } = require('./console-layout.cjs');
const { Sessions, validateConsoleDefaults } = require('./sessions.cjs');
const { Workspace } = require('./workspace.cjs');
const { Projects } = require('./projects.cjs');
const { MessageUsage, apiMessages } = require('./message-usage.cjs');
const { Updates } = require('./updates.cjs');
const { Workbench } = require('./workbench.cjs');
const { creativeTools } = require('./creative-tools.cjs');
const { Turns } = require('./turns.cjs');
const { MobileCompanion } = require('./mobile.cjs');
const { DockNotifications } = require('./notifications.cjs');
const { WorkPower } = require('./power.cjs');
const { runApi } = require('./api-run.cjs');
const { SharedHub } = require('./shared.cjs');
const { ToolIntegrations, definitions: integrationDefinitions } = require('./integrations.cjs');
const { validateProvider, validateRequest, ledgerSummary, number } = require('./domain.cjs');
const { APP_ID, taskbarIcon, developmentShortcuts } = require('./windows-identity.cjs');
app.setName('Agent Dock');
const appModelId = APP_ID;
if (process.platform === 'win32') app.setAppUserModelId(appModelId);
const testMode = process.argv.includes('--smoke-test');
const testDir = process.argv.find(x => x.startsWith('--data-dir='))?.slice(11);
if (testMode && testDir) app.setPath('userData', testDir);
if (!app.requestSingleInstanceLock() && !testMode) app.quit();
let window, tray, vault, sessions, workspace, projects, messageUsage, updates, account, root, settings, ledger, notifications, hub, integrations, workbench, cliSetup, turns, mobile, workPower;
let mode = 'dashboard', quitting = false, refreshing = false, lastRefresh = 0, apiBusy = false;
let modeTarget = null, modeTask, modeSequence = 0, transitioning = false;
let trayHidden = false, windowDrag = null;
let limits = [], recent = [], accountError = null, capabilities = {}, storageError = null, workspaceError = null, shortcutAvailable = false;
const recentReader = new RecentCodex();
const entryFile = path.join(__dirname, '..', 'dist', 'index.html');
const entryUrl = pathToFileURL(entryFile).href;
const projectsFolder = path.join(os.homedir(), 'Projects');
const defaultFolder = fs.existsSync(projectsFolder) && fs.statSync(projectsFolder).isDirectory() ? projectsFolder : os.homedir();
function snapshot() {
  return { mode, transitioning, trayHidden, sessions: sessions?.list() || [], limits, recent, accountError, refreshing, lastRefresh, agents: cliSetup?.snapshot() || [], agentSetupBusy: !!cliSetup?.running,
    capabilities, projects: projects?.list() || [], messages: [...(messageUsage?.items || []), ...apiMessages(ledger || [])].sort((a,b) => b.at - a.at).slice(0, 200), mobile: mobile?.snapshot(), workbench: workbench?.snapshot(), vault: { available: vault?.available() || false, entries: vault?.list() || [] },
    ledger: ledger || [], summary: ledgerSummary(ledger || []), shared: hub?.snapshot(), updates: updates?.snapshot(), grid: sessions?.grid || settings?.grid, settings, storageError, workspaceError, shortcutAvailable,
    integrations: integrations?.snapshot(hub?.config.connections || [], vault?.list() || []), defaultFolder, version: app.getVersion() };
}
function publish() { if (window && !window.isDestroyed()) window.webContents.send('dock:state', snapshot()); }
function updatePower() { workPower?.update({ enabled: settings?.keepAwakeWhileWorking === true, sessions: sessions?.list() || [], apiBusy }); }
function persistSettings(next) { atomicJson(path.join(root, 'settings.json'), next); settings = next; updatePower(); }
function revealWindow() {
  if (!window || window.isDestroyed()) return;
  trayHidden = false; window.setSkipTaskbar(false);
  if (window.isMinimized()) window.restore();
  window.show(); window.focus(); publish();
}
function hideToTray() {
  if (!tray) { window.minimize(); return; }
  ++modeSequence; modeTarget = null; modeTask = null; transitioning = false; windowDrag = null;
  trayHidden = true; window.hide(); window.setSkipTaskbar(true); publish();
}
function dragWindow(action, point) {
  if (!['start', 'move', 'end'].includes(action)) throw new Error('Invalid window action.');
  if (action === 'end') { windowDrag = null; publish(); return; }
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || Math.abs(point.x) > 100000 || Math.abs(point.y) > 100000) throw new Error('Invalid window position.');
  if (action === 'start') {
    ++modeSequence; modeTarget = null; modeTask = null; transitioning = false;
    const before = window.getBounds();
    if (window.isFullScreen() || window.isMaximized()) {
      const area = screen.getDisplayMatching(before).workArea;
      const width = Math.min(1240, area.width - 40), height = Math.min(840, area.height - 40);
      window.setFullScreen(false); window.unmaximize();
      window.setBounds({ x: Math.round(point.x - Math.max(0, Math.min(1, (point.x - before.x) / before.width)) * width), y: Math.round(point.y - 22), width, height });
      mode = 'dashboard';
    }
    windowDrag = { point, bounds: window.getBounds() }; publish();
  } else if (windowDrag) {
    window.setPosition(Math.round(windowDrag.bounds.x + point.x - windowDrag.point.x), Math.round(windowDrag.bounds.y + point.y - windowDrag.point.y));
  }
}
function setMode(next) {
  if (next === 'hud' && settings?.setupComplete === false) next = 'dashboard';
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
  if (!changed) { revealWindow(); return; }
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
  revealWindow();
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
  // The frameless UI supplies its own controls. Electron's default menu would
  // otherwise take editor keys such as Ctrl+W, Ctrl+R and Ctrl+A from terminals.
  Menu.setApplicationMenu(null);
  root = app.getPath('userData'); fs.mkdirSync(root, { recursive: true });
  const runtime = runtimeFiles({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, findProgram });
  cliSetup = new CliSetup(root, runtime, { testMode, onChange: publish });
  const claude = findClaude();
  capabilities = { codex: !!nativeCodex(), claude: !!claude, claudeLocation: claude?.label, node: !!runtime.node, shell: true };
  const savedSettings = readJson(path.join(root, 'settings.json'), {});
  settings = initialSettings(savedSettings, defaultFolder, capabilities);
  ledger = readJson(path.join(root, 'ledger.json'), []);
  messageUsage = new MessageUsage(root);
  updates = new Updates(root, app.getVersion(), { onChange: publish });
  vault = new Vault(path.join(root, 'vault.json'), safeStorage);
  integrations = new ToolIntegrations(root, runtime, { onChange: publish });
  workbench = new Workbench(root, runtime, require('electron'), { testMode, onChange: publish, getSessions: () => sessions, getProject: () => settings.consoleDefaults.cwd, getWindow: () => window, getHub: () => hub, getAgents: () => cliSetup.snapshot() });
  projects = new Projects(root); projects.on('changed', publish); workbench.projects = projects;
  projects.on('tracking-error', message => { storageError = message; publish(); });
  hub = new SharedHub(root, vault, { integrations, workbench }); await hub.start();
  sessions = new Sessions(root, { hub, claude, runtime, cliSetup, projects, grid: settings.grid, onLayout: ({ grid, plan }) => {
    const slotNames = { ...settings.slotNames };
    for (const item of plan) delete slotNames[sessions.items.get(item.id)?.slot];
    for (const item of plan) slotNames[item.slot] = sessions.items.get(item.id)?.name || '';
    persistSettings({ ...settings, grid, slotNames });
  } });
  workPower = new WorkPower(powerSaveBlocker);
  sessions.on('changed', updatePower);
  sessions.on('name-changed', item => {
    try { persistSettings({ ...settings, slotNames: { ...settings.slotNames, [item.slot]: item.name } }); }
    catch { storageError = 'The chat title could not be saved to this slot.'; }
  });
  sessions.on('context-error', message => { storageError = message; publish(); });
  sessions.on('message-usage', ({ session, messages }) => { try { messageUsage.record(session, messages); } catch { storageError = 'Message usage could not be saved.'; } });
  turns = new Turns(workbench.results, { enabled: settings.autoSaveResults !== false, getSession: id => sessions.items.get(id), getSecrets: () => vault.list().flatMap(x => { try { return [vault.get(x.id)]; } catch { return []; } }) });
  workbench.turns = turns;
  turns.on('tracking-error', ({ owner, message }) => workbench.inbox.add({ title: 'Code capture needs attention', message, sessionId: owner, kind: 'error' }));
  mobile = new MobileCompanion(root, safeStorage, { sessions, results: workbench.results, inbox: workbench.inbox, getUsage: () => ({ limits, summary: ledgerSummary(ledger || []) }), getDefaults: () => ({ ...settings.consoleDefaults, permissions: settings.agentPermissions }), getKey: id => vault.get(id), networkScript: app.isPackaged ? path.join(process.resourcesPath, 'mobile-network.ps1') : path.join(__dirname, 'mobile-network.ps1'), program: process.execPath, testMode });
  mobile.on('changed', publish);
  mobile.on('pairing-requested', () => { if (settings.notifications && !testMode) notifications?.show({ title: 'Approve a phone?', message: 'Compare the codes on your PC and phone before allowing access.', destination: 'phone-pairing' }); });
  if (!testMode) mobile.start().catch(() => publish());
  const savedLimits = readJson(path.join(root, 'limits.json'), [], {
    recoverCorrupt: true,
    onRecovery: () => { storageError = 'Cached usage limits were damaged. The original file was kept with a .corrupt suffix. Limits will refresh when available.'; }
  });
  limits = Array.isArray(savedLimits) ? savedLimits : [];
  account = new CodexAccount(values => {
    limits = [...limits.filter(x => x.provider !== 'codex'), ...values];
    try { atomicJson(path.join(root, 'limits.json'), limits); } catch (error) { storageError = error.message; }
    publish();
  });
  sessions.on('changed', publish);
  sessions.on('changed', () => { for (const item of sessions.items.values()) if (!item.alive && turns.active.has(item.id)) turns.finish(item.id).catch(() => {}); });
  sessions.on('output', data => { if (window && !window.isDestroyed()) window.webContents.send('dock:output', data); });
  sessions.on('limits', value => {
    limits = [...limits.filter(x => x.id !== value.id), value];
    try { atomicJson(path.join(root, 'limits.json'), limits); } catch (error) { storageError = error.message; }
    publish();
  });
  sessions.on('attention', session => {
    workbench.inbox.add({ key: `${session.id}:${session.updatedAt}:${session.state}`, title: session.name + (session.state === 'ready' ? ' is ready' : ' needs you'), sessionId: session.id, kind: session.state === 'ready' ? 'ready' : 'question' });
  });
  const seenExits = new Set();
  sessions.on('changed', () => {
    for (const item of sessions.list()) if (!item.alive && !item.dismissed && (item.restoreError || item.exitCode) && !seenExits.has(item.id)) {
      seenExits.add(item.id); workbench.inbox.add({ key: 'exit:' + item.id, title: item.name + ' stopped', message: item.restoreError || `Exit code ${item.exitCode}`, sessionId: item.id, kind: 'error' });
    }
  });
  workspace = new Workspace(root, sessions, safeStorage, { enabled: settings.restoreConsoles, onError: message => { workspaceError = message; publish(); } });
  await workspace.restore();
  const windowIcon = path.join(__dirname, '..', 'assets', process.platform === 'win32' && !app.isPackaged ? 'icon.ico' : 'icon.png');
  window = new BrowserWindow({ width: 1240, height: 840, minWidth: 720, minHeight: 520, frame: false, show: false, backgroundColor: '#010103', title: 'Agent Dock', icon: windowIcon,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false } });
  if (process.platform === 'win32') {
    const icon = taskbarIcon({ projectDir: app.getAppPath(), dataDir: root, packaged: app.isPackaged });
    if (!app.isPackaged && !testMode) {
      try {
        developmentShortcuts({ shell, desktop: app.getPath('desktop'), programs: path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'), projectDir: app.getAppPath(), icon });
      } catch (error) { console.warn('Could not update Agent Dock shortcuts:', error.message); }
    }
    window.setAppDetails({ appIconPath: icon, appIconIndex: 0,
      relaunchCommand: `"${process.execPath}"${app.isPackaged ? '' : ` "${app.getAppPath()}"`}`, relaunchDisplayName: 'Agent Dock' });
    // Set the identity after its relaunch properties, before the window is shown.
    window.setAppDetails({ appId: appModelId });
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.on('render-process-gone', () => { if (!quitting) window.loadFile(entryFile); });
  window.on('close', event => { if (!quitting) { event.preventDefault(); hideToTray(); } });
  window.loadFile(entryFile);
  window.once('ready-to-show', () => setMode(process.argv.includes('--hud') ? 'hud' : 'dashboard'));
  const iconFile = path.join(__dirname, '..', 'assets', 'icon.png');
  if (fs.existsSync(iconFile)) {
    tray = new Tray(nativeImage.createFromPath(iconFile)); tray.setToolTip('Agent Dock');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Agent Dock', click: revealWindow }, { label: 'Corner HUD', click: () => setMode('hud') }, { type: 'separator' }, { label: 'Quit Agent Dock', click: quit }]));
    tray.on('click', revealWindow); tray.on('double-click', revealWindow);
    tray.on('balloon-click', () => notifications?.balloonClick?.());
  }
  notifications = new DockNotifications({ Notification, getTray: () => tray, getWindow: () => window, getMode: () => modeTarget || mode,
    setMode, reveal: revealWindow, publish, getSessions: () => sessions.list(), icon: iconFile });
  workbench.inbox.on('added', item => { if (settings.notifications && !testMode) notifications.show(item); });
  shortcutAvailable = !testMode && globalShortcut.register('CommandOrControl+Alt+Space', () => trayHidden ? revealWindow() : setMode((modeTarget || mode) === 'hud' ? 'dashboard' : 'hud'));
  for (let i = 1; !testMode && i <= 9; i++) globalShortcut.register(`CommandOrControl+Alt+${i}`, () => {
    const item = sessions.list().find(x => (x.alive || x.restoreError) && consoleCells(x, sessions.grid).includes(i)); if (!item) return;
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
      if (typeof method === 'string' && method.startsWith('mobile.')) {
        let value;
        switch (method) {
          case 'mobile.configure': await mobile.configure(payload); break;
          case 'mobile.invite': { const invite = await mobile.invite(); value = { ...invite, qr: await require('qrcode').toDataURL(invite.code, { width: 280, margin: 2, errorCorrectionLevel: 'M' }) }; break; }
          case 'mobile.cancel-pairing': mobile.cancelPairing(); break;
          case 'mobile.decide-pairing': mobile.decidePairing(payload); break;
          case 'mobile.revoke': mobile.revoke(payload); break;
          case 'mobile.status': value = mobile.snapshot(); publish(); break;
          case 'mobile.inspect-network': value = await mobile.network.inspect(payload?.host); break;
          case 'mobile.firewall': if (!mobile.server && payload?.remove !== true) throw new Error('Enable the phone connection first.'); value = await mobile.network.firewall(mobile.config, payload?.remove === true); break;
          case 'mobile.windows-network': await shell.openExternal('ms-settings:network-status'); break;
          case 'mobile.router': {
            const gateway = mobile.network.snapshot().gateway;
            if (!gateway || !require('./mobile-address.cjs').isPrivate(gateway)) throw new Error('Check your network first.');
            await shell.openExternal(`http://${gateway}/`); break;
          }
          case 'mobile.test-push': if (testMode) throw new Error('Push requests are disabled in tests.'); await mobile.sendPush('test', payload); break;
          case 'mobile.remove-push': mobile.removeFirebase(); break;
          case 'mobile.import-push': {
            const choose = async title => { const selected = await dialog.showOpenDialog(window, { title, properties: ['openFile'], filters: [{ name: 'Firebase JSON', extensions: ['json'] }] }); if (selected.canceled) return null; const file = selected.filePaths[0]; if (fs.statSync(file).size > 65536) throw new Error('Choose a Firebase configuration under 64 KB.'); try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('This Firebase configuration could not be read.'); } };
            const options = await choose('Choose google-services.json'); if (!options) break;
            const credential = await choose('Choose the Firebase service-account JSON'); if (credential) mobile.configureFirebase(options, credential); break;
          }
          default: throw new Error('Unknown mobile action.');
        }
        return { ok: true, value };
      }
      if (typeof method === 'string' && method.startsWith('workbench.')) return { ok: true, value: await workbench.call(method.slice(10), payload) };
      switch (method) {
        case 'state': return { ok: true, value: snapshot() };
        case 'updates.check': return { ok: true, value: await updates.check() };
        case 'updates.download': if (testMode) throw new Error('Real update downloads are disabled in tests.'); return { ok: true, value: await updates.download() };
        case 'updates.install': {
          if (testMode) throw new Error('Installer launching is disabled in tests.');
          const file = await updates.verifiedFile();
          if (apiBusy) throw new Error('Wait for API work to finish before installing. The download is saved.');
          if (sessions.list().some(x => x.alive)) {
            const answer = await dialog.showMessageBox(window, { type: 'question', buttons: ['Keep working', 'Install update'], defaultId: 0, cancelId: 0, message: 'Install the downloaded update?', detail: 'Running console tasks will stop. Your saved panels can reopen after installation.' });
            if (answer.response !== 1) break;
          }
          const error = await shell.openPath(file); if (error) throw new Error('The installer could not be opened.');
          quitting = true; app.quit(); break;
        }
        case 'mode': await setMode(payload); break;
        case 'minimize': window.minimize(); break;
        case 'tray': hideToTray(); break;
        case 'show': revealWindow(); break;
        case 'window.drag': dragWindow(payload?.action, payload); break;
        case 'quit': await quit(); break;
        case 'refresh': await refreshLimits(); break;
        case 'agents.refresh': {
          cliSetup.refresh();
          sessions.claude = findClaude();
          capabilities = { ...capabilities, codex: !!nativeCodex(), claude: !!sessions.claude, claudeLocation: sessions.claude?.label };
          publish(); return { ok: true, value: capabilities };
        }
        case 'agents.install': {
          const result = await cliSetup.install(payload);
          sessions.claude = findClaude();
          capabilities = { ...capabilities, codex: !!nativeCodex(), claude: !!sessions.claude, claudeLocation: sessions.claude?.label };
          publish(); return { ok: true, value: result };
        }
        case 'setup.validate': return { ok: true, value: validateConsoleDefaults(payload) };
        case 'setup.complete': {
          const consoleDefaults = validateConsoleDefaults(payload);
          if (cliAgents.has(consoleDefaults.provider) && !cliSetup.executable(consoleDefaults.provider)) throw new Error('Install this agent, then check again. You can also start with PowerShell.');
          const opened = payload.launchNow === true ? await sessions.create({ ...consoleDefaults, permissions: settings.agentPermissions }) : null;
          persistSettings({ ...settings, consoleDefaults, setupComplete: true });
          publish(); return { ok: true, value: opened };
        }
        case 'pickFolder': {
          const suggested = typeof payload?.cwd === 'string' && path.isAbsolute(payload.cwd) && fs.existsSync(payload.cwd) && fs.statSync(payload.cwd).isDirectory() ? payload.cwd : settings.consoleDefaults.cwd;
          const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: 'Choose a launch folder', defaultPath: suggested });
          return { ok: true, value: result.filePaths[0] || null };
        }
        case 'session.create': {
          payload = payload?.projectId ? projects.launch(payload) : payload;
          const occupied = occupiedCells(sessions.items.values(), sessions.grid);
          const slot = payload?.slot ?? Array.from({ length: sessions.grid.columns * sessions.grid.rows }, (_, i) => i + 1).find(x => !occupied.has(x));
          const session = await sessions.create({ ...settings.consoleDefaults, ...(settings.slotNames?.[slot] ? { name: settings.slotNames[slot] } : {}), ...payload, permissions: payload?.permissions ?? settings.agentPermissions });
          persistSettings({ ...settings, slotNames: { ...settings.slotNames, [session.slot]: session.name } }); publish();
          return { ok: true, value: session };
        }
        case 'slot.name': {
          const slot = payload?.slot;
          if (!Number.isInteger(slot) || slot < 1 || slot > sessions.grid.columns * sessions.grid.rows) throw new Error('Choose a slot inside the console grid.');
          if (typeof payload.name !== 'string' || payload.name.length > 64 || /[\x00-\x1f\x7f]/.test(payload.name)) throw new Error('Use a name up to 64 characters, on one line.');
          const item = sessions.list().find(x => x.slot === slot && (x.alive || x.restoreError));
          if ((item?.id || null) !== (payload.sessionId || null)) throw new Error('This slot has changed. Try naming it again.');
          const name = payload.name.trim(), slotNames = { ...settings.slotNames };
          if (name) slotNames[slot] = name; else delete slotNames[slot];
          persistSettings({ ...settings, slotNames });
          if (item) { sessions.rename(item.id, name); workbench.results.renameConsole(item.consoleKey || item.id, sessions.items.get(item.id).name); } else publish();
          break;
        }
        case 'projects.save': { const project = projects.save({ ...payload, guided: !payload.id }); publish(); return { ok: true, value: project }; }
        case 'projects.plan.begin': return { ok: true, value: projects.beginPlan(payload.id) };
        case 'projects.plan.review': return { ok: true, value: projects.review(payload.id, payload) };
        case 'projects.plan.later': return { ok: true, value: projects.addLater(payload.id, payload) };
        case 'projects.plan.sync': return { ok: true, value: projects.syncPlan(payload.id) };
        case 'projects.folder': {
          const target = projects.folderPath(payload.id, payload.index ?? 0, payload.planFiles === true);
          const error = await shell.openPath(target); if (error) throw new Error('The project folder could not be opened.');
          return { ok: true, value: target };
        }
        case 'session.project': return { ok: true, value: sessions.assignProject(payload?.id, payload?.projectId, { useProjectName: payload?.useProjectName }) };
        case 'projects.progress': { const project = projects.progress(payload?.id, payload); publish(); return { ok: true, value: project }; }
        case 'projects.remove': {
          projects.remove(payload);
          for (const item of sessions.items.values()) if (item.projectId === payload) item.projectId = null;
          sessions.emit('changed'); publish(); break;
        }
        case 'session.models': return { ok: true, value: consoleModels(payload) };
        case 'grid.configure': sessions.setGrid(payload); break;
        case 'session.layout.preview': return { ok: true, value: planLayout(sessions.items.values(), { id: payload?.id, slot: payload?.slot, width: payload?.width, height: payload?.height }, sessions.grid) };
        case 'session.move':
        case 'session.layout': {
          sessions.layout(method === 'session.move' ? { id: payload?.id, slot: payload?.slot } : { id: payload?.id, slot: payload?.slot, width: payload?.width, height: payload?.height }, plan => {
            const slotNames = { ...settings.slotNames };
            const previous = new Set(plan.map(x => sessions.items.get(x.id).slot));
            const displaced = plan.filter(x => !previous.has(x.slot) && slotNames[x.slot]).map(x => slotNames[x.slot]);
            const freed = [...previous].filter(slot => !plan.some(x => x.slot === slot));
            for (const placed of plan) delete slotNames[sessions.items.get(placed.id).slot];
            for (let i = 0; i < displaced.length && i < freed.length; i++) slotNames[freed[i]] = displaced[i];
            for (const placed of plan) slotNames[placed.slot] = sessions.items.get(placed.id).name;
            persistSettings({ ...settings, slotNames });
          });
          break;
        }
        case 'session.retry': return { ok: true, value: await sessions.retry(payload) };
        case 'session.input': sessions.write(payload?.id, payload?.data); break;
        case 'session.resize': sessions.resize(payload?.id, payload?.cols, payload?.rows); break;
        case 'session.buffer': return { ok: true, value: sessions.buffer(payload) };
        case 'session.acknowledge': sessions.acknowledge(payload); workbench.inbox.acknowledgeSession(payload); break;
        case 'session.end': {
          const item = sessions.list().find(x => x.id === payload);
          if (!item) throw new Error('Console not found.');
          const result = testMode ? { response: 1 } : await dialog.showMessageBox(window, { type: 'question', buttons: ['Keep running', 'End console'], defaultId: 0, cancelId: 0, message: `End “${item.name}”?`, detail: 'This stops the console and any agent running inside it.' });
          if (result.response === 1) { persistSettings({ ...settings, slotNames: { ...settings.slotNames, [item.slot]: item.name } }); sessions.end(payload); } break;
        }
        case 'vault.save': vault.set(payload?.provider, payload?.key, payload?.label); hub.writeSummary(); await Promise.allSettled([...hub.clients.keys()].map(id => hub.disconnect(id))); publish(); break;
        case 'vault.remove': {
          validateKeyId(payload);
          const used = hub.config.imageGeneration?.keyId === payload || hub.config.profiles.some(x => x.keyId === payload) || hub.config.connections.some(x => [x.envKeys, x.headerKeys, x.queryKeys].some(map => Object.values(map || {}).some(ref => ref.key === payload)));
          if (used && !testMode) { const result = await dialog.showMessageBox(window, { type: 'question', message: 'Remove this key?', detail: 'Connections using it will need another key.', buttons: ['Keep key', 'Remove'], defaultId: 0, cancelId: 0 }); if (result.response !== 1) break; }
          vault.remove(payload); hub.writeSummary(); await Promise.allSettled([...hub.clients.keys()].map(id => hub.disconnect(id))); publish(); break;
        }
        case 'shared.instructions': hub.instructions(payload); publish(); break;
        case 'shared.guides': hub.setGuides(payload); publish(); break;
        case 'images.settings': hub.setImageGeneration(payload); publish(); break;
        case 'integrations.refresh': integrations.refresh(); publish(); break;
        case 'integrations.setup': {
          if (testMode && payload?.id !== 'meshy') throw new Error('Software installation is disabled during tests.');
          if (payload?.id === 'meshy' && !vault.list().some(x => x.id === payload.keyId)) throw new Error('Save a Meshy API key in Keys, then choose it here.');
          const previous = hub.config.connections.find(x => x.id === payload?.id);
          if (previous && previous.integration !== payload.id) throw new Error('A custom tool already uses this ID. Rename it before setting up this integration.');
          const connection = await integrations.prepare(payload?.id, payload);
          await hub.saveConnection(connection); publish(); break;
        }
        case 'tools.save': await hub.saveConnection(payload); publish(); break;
        case 'tools.remove': await hub.removeConnection(payload); publish(); break;
        case 'tools.test': { try { const result = await hub.test(payload); return { ok: true, value: result }; } finally { publish(); } }
        case 'tools.catalog': { try { return { ok: true, value: await hub.list(payload) }; } finally { publish(); } }
        case 'profiles.save': hub.saveProfile(payload); publish(); break;
        case 'profiles.remove': hub.removeProfile(payload); publish(); break;
        case 'settings': {
          const next = { ...settings };
          if (typeof payload?.hudAlwaysOnTop === 'boolean') next.hudAlwaysOnTop = payload.hudAlwaysOnTop;
          if (typeof payload?.notifications === 'boolean') next.notifications = payload.notifications;
          if (typeof payload?.keepAwakeWhileWorking === 'boolean') next.keepAwakeWhileWorking = payload.keepAwakeWhileWorking;
          if (typeof payload?.restoreConsoles === 'boolean') next.restoreConsoles = payload.restoreConsoles;
          if (typeof payload?.autoSaveResults === 'boolean') next.autoSaveResults = payload.autoSaveResults;
          if (typeof payload?.suggestProjects === 'boolean') next.suggestProjects = payload.suggestProjects;
          if (typeof payload?.sidebarCollapsed === 'boolean') next.sidebarCollapsed = payload.sidebarCollapsed;
          if (typeof payload?.vimControls === 'boolean') next.vimControls = payload.vimControls;
          if (typeof payload?.cursorBlink === 'boolean') next.cursorBlink = payload.cursorBlink;
          if (payload?.accentStyle !== undefined) {
            if (!['pink-blue', 'blue', 'pink'].includes(payload.accentStyle)) throw new Error('Choose an available accent style.');
            next.accentStyle = payload.accentStyle;
          }
          if (payload?.consoleDefaults !== undefined) next.consoleDefaults = validateConsoleDefaults(payload.consoleDefaults);
          if (payload?.agentPermissions !== undefined) {
            if (!['default', 'unrestricted'].includes(payload.agentPermissions)) throw new Error('Choose a supported agent permission mode.');
            next.agentPermissions = payload.agentPermissions;
          }
          workspace.setEnabled(next.restoreConsoles);
          persistSettings(next); turns.setEnabled(settings.autoSaveResults !== false); if (mode === 'hud') window.setAlwaysOnTop(settings.hudAlwaysOnTop); publish(); break;
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
          const project = payload.projectId ? projects.launch({ projectId: payload.projectId }) : {};
          apiBusy = true; updatePower();
          const apiOwner = 'api:' + require('node:crypto').randomUUID();
          turns.virtual.set(apiOwner, { id: apiOwner, consoleKey: 'api:' + profile.id, projectId: project.projectId || null, name: profile.name, cwd: project.cwd || settings.consoleDefaults.cwd, alive: true });
          projects.touch(project.projectId);
          const apiHub = { summary: () => hub.summary() + projects.chatSummary(turns.virtual.get(apiOwner)), invoke: (name, args) => hub.invoke(name, args, apiOwner) };
          let result;
          try { await turns.begin(apiOwner); result = await runApi(payload, key, settings.rates[`${profile.id}:${payload.model?.trim()}`], { profile, hub: apiHub, onEntry: entry => {
            entry.projectId = project.projectId || null; entry.consoleName = project.name || profile.name; entry.turnId = turns.context(apiOwner)?.turnId || null;
            ledger = [entry, ...ledger];
            try { atomicJson(path.join(root, 'ledger.json'), ledger); }
            catch { storageError = 'Latest API usage is only in memory. Export it before quitting.'; }
            publish();
          } }); }
          finally { try { await turns.finish(apiOwner); } finally { turns.virtual.delete(apiOwner); apiBusy = false; updatePower(); } }
          workbench.inbox.add({ title: result.error || result.entry?.status !== 'completed' ? 'API request needs attention' : 'API response ready', message: `${profile.name} · ${payload.model}`, kind: result.error || result.entry?.status !== 'completed' ? 'error' : 'ready', destination: 'usage' });
          publish(); return { ok: true, value: result };
        }
        case 'ledger.export': {
          const result = await dialog.showSaveDialog(window, { defaultPath: 'agent-dock-usage.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
          if (!result.canceled && result.filePath) atomicJson(result.filePath, { scope: 'API requests made through Agent Dock', currency: 'USD', costs: 'estimates', entries: ledger }); break;
        }
        case 'external.open': {
          if (typeof payload !== 'string' || payload.length > 4096) throw new Error('Invalid web link.');
          const url = new URL(payload);
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Only web links can open here.');
          await shell.openExternal(url.href); break;
        }
        case 'docs': {
          const urls = { codex: 'https://learn.chatgpt.com/docs/codex/cli', claude: 'https://code.claude.com/docs/en/overview', openai: 'https://developers.openai.com/api/docs/pricing', anthropic: 'https://platform.claude.com/docs/en/about-claude/pricing' };
          Object.assign(urls, { tailscale: 'https://tailscale.com/download', duckdns: 'https://www.duckdns.org/', firebase: 'https://console.firebase.google.com/', 'mobile-guide': 'https://github.com/YeerooXY/agentdock/blob/main/docs/android-setup.md', 'android-download': 'https://github.com/YeerooXY/agentdock/releases' });
          for (const item of integrationDefinitions) urls[item.id] = item.docs;
          for (const item of creativeTools) urls[item.id] = item.docs;
          for (const item of cliCatalog) urls[item.id] = item.docs;
          urls.zai = 'https://docs.z.ai/devpack/tool/opencode';
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
  workPower?.dispose();
  workspace?.freeze();
  workbench?.stop();
  // Drain ConPTY exits while the event loop is alive, before Electron tears down its workers.
  (async () => {
    await mobile?.stop();
    await sessions?.stop();
    await hub?.close();
    account?.stop();
    globalShortcut.unregisterAll();
  })().finally(() => { cleanupDone = true; app.quit(); });
});
app.on('window-all-closed', () => { if (testMode || quitting) app.quit(); });
