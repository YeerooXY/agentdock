'use strict';
// Paddock started from inside an agent session must not pass that session's markers to its consoles and workers.
require('./agent-env.cjs').stripInheritedSessionEnv(process.env);
const { app, BrowserWindow, ipcMain, dialog, screen, systemPreferences, globalShortcut, safeStorage, Tray, Menu, nativeImage, Notification, shell, powerSaveBlocker, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { Vault, readJson, atomicJson, validateKeyId } = require('./storage.cjs');
const { SshHosts } = require('./ssh-hosts.cjs');
const { CodexAccount, RecentCodex, findProgram, nativeCodex, findClaude, consoleModels } = require('./adapters.cjs');
const { runtimeFiles } = require('./runtime.cjs');
const { initialSettings } = require('./settings.cjs');
const { validateRouting } = require('./task-routing.cjs');
const { openCodeSignedIn } = require('./opencode-auth.cjs');
const { frameStyles, lightingStyles, updatedSlotTrims, moveSlotTrims } = require('./console-appearance.cjs');
const { CliSetup } = require('./cli-setup.cjs');
const { catalog: cliCatalog, byId: cliAgents } = require('./cli-catalog.cjs');
const { cells: consoleCells, occupied: occupiedCells, planLayout } = require('./console-layout.cjs');
const { Sessions, validateConsoleDefaults } = require('./sessions.cjs');
const { Workspace } = require('./workspace.cjs');
const { Projects } = require('./projects.cjs');
const { MessageUsage, apiMessages } = require('./message-usage.cjs');
const { Updates } = require('./updates.cjs');
const { loginPath } = require('./platform.cjs');
const { Workbench } = require('./workbench.cjs');
const { Delegation, REVIEWERS } = require('./delegation.cjs');
const { TaskLoop } = require('./task-loop.cjs');
const { WorkerSessions } = require('./worker-sessions.cjs');
const { OwnerConsoles } = require('./owner-consoles.cjs');
const { CapacityReservations } = require('./capacity-reservations.cjs');
const { registryFromRouting } = require('./worker-registry.cjs');
const { closeReviewPanel } = require('./review-panel.cjs');
const { resultGitContext } = require('./git-context.cjs');
const { creativeTools } = require('./creative-tools.cjs');
const { Turns } = require('./turns.cjs');
const { MobileCompanion } = require('./mobile.cjs');
const { DockNotifications } = require('./notifications.cjs');
const { completionNotice } = require('./completion-notice.cjs');
const { WorkPower } = require('./power.cjs');
const { runApi } = require('./api-run.cjs');
const { SharedHub } = require('./shared.cjs');
const { ToolIntegrations, definitions: integrationDefinitions, runProgram } = require('./integrations.cjs');
const { McpCatalog, catalog: recommendedTools } = require('./mcp-catalog.cjs');
const { known: policyLimits, budgetUnit } = require('./tool-policy.cjs');
const { ManagedDownloads } = require('./managed-downloads.cjs');
const { SkillPacks } = require('./skill-packs.cjs');
const { validateProvider, validateRequest, ledgerSummary, number, validateExplorerWidth } = require('./domain.cjs');
const { APP_ID, taskbarIcon, developmentShortcuts } = require('./windows-identity.cjs');
const { CodePanel } = require('./code-panel.cjs');
const { Screenshots, clipboardReader } = require('./screenshots.cjs');
const { endSession, endMobileSession } = require('./session-end.cjs');
const { Worktrees, prepareWorktree } = require('./worktrees.cjs');
const { MessageQueue } = require('./message-queue.cjs');
const { PromptLibrary } = require('./prompt-library.cjs');
const { isLocal } = require('./web-preview.cjs');
const filePreview = require('./file-preview.cjs');
const { userDataPath } = require('./user-data.cjs');
const { AccountProfiles, defaultId } = require('./account-profiles.cjs');
const { DraftBridge } = require('./draft-bridge.cjs');
const { accountIdForLimit, thresholdCandidate, automaticSwitchEligible } = require('./account-switching-policy.cjs');
const { SubscriptionUsage, readClaudeUsage, readCopilotUsage, readKiroUsage, readKimiUsage, readOpenCodeUsage, copilotExecutable, usageEnvironment, stopUsageReaders } = require('./subscription-usage.cjs');
const { CrashReport, diagnose, redact, guardStartup } = require('./crash-report.cjs');
app.setName('Paddock');
const appModelId = APP_ID;
if (process.platform === 'win32') app.setAppUserModelId(appModelId);
const testMode = process.argv.includes('--smoke-test');
const testDir = process.argv.find(x => x.startsWith('--data-dir='))?.slice(11);
// Playwright starts Electron with --password-store=basic, which Paddock rejects.
// Linux test runs with an unlocked keyring opt back in to it explicitly.
if (testMode && process.platform === 'linux' && /^(gnome-libsecret|kwallet[56]?)$/.test(process.env.PADDOCK_TEST_PASSWORD_STORE || '')) app.commandLine.appendSwitch('password-store', process.env.PADDOCK_TEST_PASSWORD_STORE);
if (testMode && testDir) app.setPath('userData', testDir);
else app.setPath('userData', userDataPath(app.getPath('appData'), app.getPath('userData')));
// A second launch hands over to the running Paddock; it must not count as a failed start.
const secondInstance = !app.requestSingleInstanceLock() && !testMode;
if (secondInstance) app.quit();
let window, tray, vault, sessions, workspace, projects, messageUsage, updates, account, root, settings, ledger, notifications, hub, integrations, mcpCatalog, workbench, cliSetup, skillPacks, turns, mobile, workPower, ssh, screenshots, accounts, draftBridge;
let codePanel, worktrees, messageQueue, prompts, tasks;
let ownerConsoles, capacityReservations;
let mode = 'dashboard', quitting = false, refreshing = false, lastRefresh = 0, apiBusy = false, subscriptionUsage, usageRefresh;
let modeTarget = null, modeTask, modeSequence = 0, transitioning = false;
let trayHidden = false, windowDrag = null, hiddenBounds = null;
let limits = [], recent = [], accountError = null, capabilities = {}, storageError = null, workspaceError = null, shortcutAvailable = false;
const crash = new CrashReport(app.getPath('userData'));
let safeMode = false, windowReady = false, crashing = false, openCodeAvailable = true;
async function startupStep(name, fn, options = {}) {
  if (crashing) throw new Error('Startup stopped.');
  const before = crash.notices.length;
  const result = await crash.startupStep(name, fn, { ...options, safeMode });
  if (crashing) throw new Error('Startup stopped.');
  if (windowReady && crash.notices.length > before) { try { publish(); } catch {} }
  return result;
}
function restart(safe, immediate = false) {
  const args = process.argv.slice(1).filter(arg => arg !== '--safe-mode');
  if (safe) args.push('--safe-mode');
  app.relaunch({ args }); quitting = true;
  if (immediate) app.exit(1); else app.quit();
}
async function startupCrash(error) {
  if (crashing) return;
  crashing = true;
  crash.log('ERROR', `${crash.step}: ${error?.stack || error}`);
  let report;
  try { report = crash.report(error, { version: app.getVersion(), electron: process.versions.electron, node: process.versions.node, install: app.getAppPath() }); }
  catch { dialog.showErrorBox("Paddock couldn't start", 'Paddock could not save a crash report. Check access to its data folder.'); app.exit(1); return; }
  const detail = `${redact(error?.message || error, crash.home).replace(/[\r\n]+/g, ' ').slice(0, 500)}\nA report was saved to ${report.folder}.`;
  while (true) {
    const { response } = await dialog.showMessageBox({ type: 'error', title: "Paddock couldn't start", message: report.summary, detail, buttons: ['Diagnose with AI', 'Start in safe mode', 'Open report folder', 'Quit'], defaultId: 0, cancelId: 3, noLink: true });
    if (response === 0) {
      try { await diagnose(report.folder, { root: crash.root, dialog, shell }); }
      catch (failure) { crash.log('ERROR', `diagnosis: ${failure?.stack || failure}`); await dialog.showMessageBox({ type: 'error', message: 'The AI agent could not be opened.', detail: 'Open the report folder to view the report.', buttons: ['OK'] }); }
    } else if (response === 1) { restart(true, true); return; }
    else if (response === 2) { await shell.openPath(report.folder); }
    else { app.exit(1); return; }
  }
}
function unexpected(error) {
  if (!windowReady) { void startupCrash(error); return; }
  crash.log('ERROR', `background work: ${error?.stack || error}`);
  const message = 'A background task failed. Details are in the log.';
  if (!crash.notices.includes(message)) crash.notices.push(message);
  try { publish(); } catch {}
}
process.on('uncaughtException', unexpected);
process.on('unhandledRejection', unexpected);
const codexAccounts = new Map(), dismissedThresholdOffers = new Set(), automaticSwitchAttempts = new Set();
const recentReader = new RecentCodex();
const entryFile = path.join(__dirname, '..', 'dist', 'index.html');
const entryUrl = pathToFileURL(entryFile).href;
const projectsFolder = path.join(os.homedir(), 'Projects');
const defaultFolder = fs.existsSync(projectsFolder) && fs.statSync(projectsFolder).isDirectory() ? projectsFolder : os.homedir();
function snapshot() {
  return { platform: process.platform, mode, transitioning, trayHidden, sessions: sessions?.list() || [], codePanels: sessions?.codePanels() || [], queues: messageQueue?.snapshot() || {}, prompts: prompts?.list() || [], codeRevision: codePanel?.revision || 0, limits, accounts: ['codex', 'claude'].flatMap(provider => accounts?.choices(provider) || []), recent, accountError, refreshing, lastRefresh, agents: (cliSetup?.snapshot() || []).map(agent => agent.id === 'opencode' && !openCodeAvailable ? { ...agent, installed: false } : agent), agentSetupBusy: !!cliSetup?.running, skills: skillPacks?.snapshot() || { packs: [], busy: false },
    usageAccounts: usageAccounts(), usageChecks: subscriptionUsage?.snapshot() || [], delegations: workbench?.delegation?.snapshot() || [], tasks: tasks?.snapshot() || [],
    sshHosts: ssh?.list() || [], capabilities, projects: projects?.list() || [], projectProposals: projects?.proposals || [], messages: [...(messageUsage?.items || []), ...apiMessages(ledger || [])].sort((a,b) => b.at - a.at).slice(0, 200), mobile: mobile?.snapshot(), workbench: workbench?.snapshot(), vault: { available: vault?.available() || false, entries: vault?.list() || [] },
    ledger: ledger || [], summary: ledgerSummary(ledger || []), shared: hub?.snapshot(), updates: updates?.snapshot(), grid: sessions?.grid || settings?.grid, settings, storageError, workspaceError, shortcutAvailable, safeMode, startupNotices: crash.notices,
    integrations: integrations?.snapshot(hub?.config.connections || [], vault?.list() || []), toolCatalog: mcpCatalog?.snapshot(hub?.config.connections || []) || [],
    toolLimits: Object.fromEntries((hub?.config.connections || []).map(x => [x.id, { models: policyLimits[x.id]?.models?.order || [], unit: budgetUnit(x.id) }])), defaultFolder, version: app.getVersion(), screenshot: screenshots?.snapshot() || null };
}
// Tools set to Ask me first: the user approves each call. Tests always deny.
async function confirmToolCall({ connection, tool, args }) {
  if (testMode || !window) return false;
  if (!window.isVisible()) window.show();
  const preview = JSON.stringify(args, null, 1);
  const { response } = await dialog.showMessageBox(window, { type: 'question', buttons: ['Allow once', 'Deny'], defaultId: 1, cancelId: 1, noLink: true, title: 'Allow tool call?', message: `An agent wants to use ${connection}: ${tool}`, detail: preview.length > 1500 ? preview.slice(0, 1500) + '…' : preview });
  return response === 0;
}
function publish() { if (window && !window.isDestroyed()) window.webContents.send('dock:state', snapshot()); }
function updatePower() { workPower?.update({ enabled: settings?.keepAwakeWhileWorking === true, sessions: sessions?.list() || [], apiBusy }); }
function persistSettings(next) { atomicJson(path.join(root, 'settings.json'), next); settings = next; updatePower(); }
function revealWindow() {
  if (!window || window.isDestroyed()) return;
  trayHidden = false; window.setSkipTaskbar(false);
  if (window.isMinimized()) window.restore();
  window.show();
  // macOS can place a reshown window elsewhere; return it to where it was hidden.
  if (hiddenBounds && !window.isFullScreen()) window.setBounds(hiddenBounds);
  hiddenBounds = null;
  window.focus(); publish();
}
function hideToTray() {
  if (!tray) { window.minimize(); return; }
  ++modeSequence; modeTarget = null; modeTask = null; transitioning = false; windowDrag = null;
  hiddenBounds = window.isFullScreen() || window.isMaximized() ? null : window.getBounds();
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
  hiddenBounds = null;
  const sequence = ++modeSequence;
  modeTarget = next;
  modeTask = moveWindow(next, sequence).finally(() => {
    if (sequence !== modeSequence) return;
    transitioning = false; modeTarget = null; modeTask = null; publish();
  });
  return modeTask;
}
// macOS animates full screen changes, and setBounds is ignored until they finish.
function fullScreen(on) {
  if (window.isFullScreen() === on) return Promise.resolve();
  // Report the change as unfinished until the native animation ends.
  if (!transitioning) { transitioning = true; publish(); }
  return new Promise(resolve => {
    const event = on ? 'enter-full-screen' : 'leave-full-screen';
    const done = () => { clearTimeout(timer); window.off(event, done); resolve(); };
    const timer = setTimeout(done, 2000);
    window.on(event, done);
    window.setFullScreen(on);
  });
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
  if (window.isFullScreen() && next !== 'fullscreen') { await fullScreen(false); if (!current()) return; window.setBounds(start); }
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
  if (next === 'fullscreen') { await fullScreen(true); if (!current()) return; }
  window.setMinimumSize(next === 'hud' ? 340 : 720, next === 'hud' ? 390 : 520);
  window.setResizable(next !== 'hud');
  window.setAlwaysOnTop(next === 'hud' && settings.hudAlwaysOnTop);
  revealWindow();
}
function usageAccounts() {
  const choices = ['codex', 'claude'].flatMap(provider => accounts?.choices(provider) || []);
  for (const agent of cliSetup?.snapshot() || []) {
    if (!['codex', 'claude'].includes(agent.id) && agent.installed) choices.push({ id: `${agent.id}:default`, provider: agent.id, label: agent.name });
  }
  for (const value of limits) {
    if (value.provider === 'opencode' && !safeMode && !(cliSetup?.snapshot() || []).some(agent => agent.id === 'opencode' && agent.installed)) continue;
    const id = limitAccountId(value);
    if (id && !choices.some(choice => choice.id === id)) choices.push({ id, provider: value.provider, label: value.name || value.provider });
  }
  const checks = subscriptionUsage?.snapshot() || [];
  const known = choice => limits.some(value => limitAccountId(value) === choice.id && value.windows?.length)
    || checks.some(check => check.accountId === choice.id && check.observedAt)
    || !!choice.loginCompletedAt;
  const active = choice => sessions?.list().some(item => item.alive && (item.accountId || `${item.provider}:default`) === choice.id);
  return choices.map(choice => ({ ...choice, hasUsage: choice.provider === 'opencode' || !!known(choice), inUse: !!active(choice) }))
    .sort((a, b) => Number(b.hasUsage) - Number(a.hasUsage) || Number(b.inUse) - Number(a.inUse));
}
function saveUsage(account, values) {
  limits = [...limits.filter(item => limitAccountId(item) !== account.id), ...values];
  try { atomicJson(path.join(root, 'limits.json'), limits); } catch (error) { storageError = error.message; }
  refreshSwitchOffers(); publish(); mobile?.scheduleState();
}
function refreshLimits() {
  if (testMode || safeMode || !subscriptionUsage) return Promise.resolve();
  if (usageRefresh) return usageRefresh;
  refreshing = true; publish();
  usageRefresh = subscriptionUsage.refresh(usageAccounts()).then(checks => {
    accountError = checks.find(check => check.accountId === defaultId('codex'))?.message || null;
    if (checks.some(check => check.status === 'current')) lastRefresh = Date.now();
    refreshSwitchOffers();
  }).finally(() => { refreshing = false; usageRefresh = null; publish(); mobile?.scheduleState(); });
  return usageRefresh;
}
function usageSnapshot() {
  const choices = usageAccounts(), checks = subscriptionUsage?.snapshot() || [];
  // Same rule as the desktop Usage page: set-up subscriptions only, unless hidden.
  const hidden = new Set(settings.usageHidden || []), shown = new Set(settings.usageShown || []);
  const visible = (id, used) => !hidden.has(id) && (used || shown.has(id) || limits.some(item => limitAccountId(item) === id));
  return {
    limits: limits.filter(item => item.provider !== 'opencode' || choices.some(choice => choice.id === limitAccountId(item))).map(item => ({ ...item, accountLabel: choices.find(choice => choice.id === limitAccountId(item))?.label || item.name, usageCheck: checks.find(check => check.accountId === limitAccountId(item)), visible: !hidden.has(limitAccountId(item)) })),
    accounts: choices.map(choice => ({ ...choice, usageCheck: checks.find(check => check.accountId === choice.id), visible: visible(choice.id, !!(choice.hasUsage || choice.inUse)) })),
    usageChecks: checks, refreshing, threshold: settings.accountSwitchThreshold, autoSwitch: settings.autoSwitchAccounts, summary: ledgerSummary(ledger || []),
  };
}
function getCodexAccount(id = defaultId('codex')) {
  if (codexAccounts.has(id)) return codexAccounts.get(id);
  const profile = accounts.getAccount(id, 'codex');
  const env = accounts.environment(id, 'codex', { baseEnv: process.env });
  for (const key of Object.keys(env)) if (/^(?:OPENAI_API_KEY|CODEX_API_KEY|CODEX_ACCESS_TOKEN|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|GOOGLE_API_KEY|GEMINI_API_KEY)$/i.test(key) || key.toLowerCase() === 'electron_run_as_node') delete env[key];
  const reader = new CodexAccount(values => {
    limits = [...limits.filter(item => (item.accountId || (item.provider === 'codex' ? defaultId('codex') : item.accountId)) !== id), ...values];
    try { atomicJson(path.join(root, 'limits.json'), limits); } catch (error) { storageError = error.message; }
    refreshSwitchOffers(); publish();
  }, { env, accountId: id, sqliteHome: profile.profile ? path.join(profile.configDir, 'sqlite') : null });
  codexAccounts.set(id, reader);
  if (id === defaultId('codex')) account = reader;
  return reader;
}
const limitAccountId = accountIdForLimit;
function refreshSwitchOffers() {
  if (safeMode || !sessions || !accounts || !settings) return;
  const threshold = settings.accountSwitchThreshold ?? 90, now = Date.now();
  let changed = false;
  for (const item of sessions.items.values()) {
    if (item.purpose !== 'agent' || !['codex', 'claude'].includes(item.provider) || item.dismissed) continue;
    const accountId = item.accountId || defaultId(item.provider);
    const candidate = thresholdCandidate(limits, accountId, item.provider, threshold, now);
    const target = candidate && item.draftSupported ? (accounts.choices(item.provider) || []).find(choice => choice.id !== accountId && (!choice.profile || !!choice.loginCompletedAt)) : null;
    if (!candidate || !target) {
      if (item.switchOffer) { delete item.switchOffer; changed = true; }
      continue;
    }
    const key = `${accountId}:${item.consoleKey}:${item.providerSessionId}:${candidate.minutes}:${candidate.resetsAt}:${threshold}`;
    if (dismissedThresholdOffers.has(key)) {
      if (item.switchOffer) { delete item.switchOffer; changed = true; }
      continue;
    }
    const nextOffer = target ? { key, targetAccountId: target.id, targetLabel: target.label, usedPercent: candidate.usedPercent, minutes: candidate.minutes, resetsAt: candidate.resetsAt } : null;
    if (JSON.stringify(item.switchOffer || null) !== JSON.stringify(nextOffer)) { if (nextOffer) item.switchOffer = nextOffer; else delete item.switchOffer; changed = true; }
    if (!target) continue;
    const automaticKey = `${accountId}:${item.consoleKey}:${item.providerSessionId}:${candidate.minutes}:${candidate.resetsAt}`;
    if (automaticSwitchAttempts.has(automaticKey)) continue;
    if (!automaticSwitchEligible({ limits, sourceAccountId: accountId, targetAccountId: target.id, provider: item.provider, candidate, threshold, now, enabled: settings.autoSwitchAccounts, state: item.state, busy: item.switching || sessions.isBusy(item.id), draftSupported: item.draftSupported })) continue;
    automaticSwitchAttempts.add(automaticKey);
    sessions.switchAccount({ id: item.id, launchId: item.launchId, targetAccountId: target.id }).catch(error => {
      workbench?.alerts.send({ key: `account-switch-failed:${automaticKey}`, title: 'Account switch failed', message: error?.message || 'The current console is still running.', sessionId: item.id, kind: 'error' });
    });
  }
  if (changed) { publish(); mobile?.scheduleState(); }
}
async function quit() {
  const active = sessions.list().filter(x => x.alive).length;
  if (active && !testMode) {
    const result = await dialog.showMessageBox(window, { type: 'question', buttons: ['Keep running', 'End consoles and quit'], defaultId: 0, cancelId: 0, message: `End ${active} open console${active === 1 ? '' : 's'} and quit?`, detail: settings.restoreConsoles ? 'Your panels will reopen next time. Running tasks stop when you quit.' : 'Use the corner HUD to keep your sessions running in the background.' });
    if (result.response !== 1) return;
  }
  quitting = true; app.quit();
}
app.whenReady().then(() => guardStartup(async () => {
  if (secondInstance) return;
  crash.step = 'preparing the data folder';
  safeMode = crash.begin(process.argv.includes('--safe-mode'));
  // The frameless UI supplies its own controls. Electron's default menu would
  // otherwise take editor keys such as Ctrl+W, Ctrl+R and Ctrl+A from terminals.
  Menu.setApplicationMenu(null);
  if (process.platform === 'darwin') {
    // macOS routes ⌘C, ⌘V and ⌘Q through the menu bar. Keep only those roles,
    // so terminal keys such as Ctrl+W still reach the consoles.
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Paddock', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { label: 'Quit Paddock', accelerator: 'Command+Q', click: () => quit() }] },
      { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }
    ]));
  }
  // Apps opened from the Dock or a desktop launcher get a minimal PATH.
  if (process.platform !== 'win32' && !testMode) await startupStep('Finding installed programs', () => { process.env.PATH = loginPath(); }, { optional: true });
  await startupStep('preparing the data folder', () => { root = app.getPath('userData'); fs.mkdirSync(root, { recursive: true }); root = require('./platform.cjs').realRoot(root); });
  crash.step = 'loading saved data'; crash.log('INFO', crash.step);
  accounts = new AccountProfiles(root);
  worktrees = new Worktrees(root);
  prompts = new PromptLibrary(root);
  draftBridge = new DraftBridge(); await startupStep('Draft bridge', () => draftBridge.start(), { optional: true });
  const runtime = runtimeFiles({ isPackaged: app.isPackaged, resourcesPath: process.resourcesPath, findProgram });
  cliSetup = new CliSetup(root, runtime, { testMode, deferDetection: safeMode, onChange: publish, onDetectError: (agent, error) => {
    crash.log('ERROR', `${agent.name} check: ${error?.stack || error}`);
    const message = `${agent.name} check failed, so ${agent.name} is hidden for now. Details are in the log.`;
    if (!crash.notices.includes(message)) crash.notices.push(message);
    if (windowReady) publish();
  } });
  skillPacks = new SkillPacks(root, { home: process.env.PADDOCK_SKILLS_HOME || os.homedir(), getAgents: () => cliSetup.snapshot(), downloads: new ManagedDownloads(root), onChange: publish });
  let claude = null;
  await startupStep('Claude Code check', () => { claude = findClaude(); }, { optional: true });
  const usageDirectory = path.join(root, 'usage-reader'); fs.mkdirSync(usageDirectory, { recursive: true });
  subscriptionUsage = new SubscriptionUsage({
    readers: {
      codex: choice => getCodexAccount(choice.id).refresh(),
      claude: choice => readClaudeUsage({ executable: cliSetup.executable('claude'), accountId: choice.id, cwd: usageDirectory, env: accounts.environment(choice.id, 'claude', { baseEnv: process.env }) }),
      copilot: choice => readCopilotUsage({ executable: copilotExecutable(cliSetup.executable('copilot')), accountId: choice.id, cwd: usageDirectory, env: usageEnvironment() }),
      kiro: choice => readKiroUsage({ executable: cliSetup.executable('kiro'), accountId: choice.id, cwd: path.join(usageDirectory, 'kiro'), env: usageEnvironment() }),
      kimi: choice => readKimiUsage({ executable: cliSetup.executable('kimi'), accountId: choice.id, cwd: usageDirectory, env: usageEnvironment() }),
      opencode: choice => readOpenCodeUsage({ executable: cliSetup.executable('opencode'), accountId: choice.id, cwd: usageDirectory, env: usageEnvironment(), getKey: () => { const entry = vault.list().find(item => item.id.toLowerCase() === 'opencode' || item.label.toLowerCase() === 'opencode'); return entry ? vault.get(entry.id) : null; } }),
    },
    onReading: saveUsage, onChange: () => { publish(); mobile?.scheduleState(); },
  });
  capabilities = { codex: false, claude: !!claude, claudeLocation: claude?.label, node: !!runtime.node, shell: true };
  await startupStep('Codex check', () => { capabilities.codex = !!nativeCodex(); }, { optional: true });
  const savedSettings = readJson(path.join(root, 'settings.json'), {});
  settings = initialSettings(savedSettings, defaultFolder, capabilities);
  if (savedSettings.resultsPolicyVersion !== settings.resultsPolicyVersion) persistSettings(settings);
  ledger = readJson(path.join(root, 'ledger.json'), []);
  messageUsage = new MessageUsage(root);
  updates = new Updates(root, app.getVersion(), { onChange: publish });
  vault = new Vault(path.join(root, 'vault.json'), safeStorage);
  integrations = new ToolIntegrations(root, runtime, { onChange: publish });
  mcpCatalog = new McpCatalog(root, runtime, { run: runProgram, downloads: new ManagedDownloads(root), onChange: publish });
  workbench = new Workbench(root, runtime, require('electron'), { testMode, onChange: publish, getSessions: () => sessions, getProject: () => settings.consoleDefaults.cwd, getWindow: () => window, getHub: () => hub, getAgents: () => cliSetup.snapshot(), getTasks: () => tasks });
  projects = new Projects(root); projects.on('changed', publish); workbench.projects = projects;
  const taskAccounts = {
    getLimits: () => limits.map(item => ({ ...item, accountId: limitAccountId(item) })),
    candidates: () => REVIEWERS.flatMap(provider => {
      const executable = cliSetup.executable(provider), name = provider === 'claude' ? 'Claude Code' : 'Codex';
      // Kiro has no Paddock account profiles; its own sign-in is used.
      if (provider === 'kiro') return executable ? [{ id: 'kiro:default', provider, label: 'Kiro', executable }] : [];
      return executable ? accounts.choices(provider).filter(choice => !choice.profile || choice.loginCompletedAt)
        .map(choice => ({ id: choice.id, provider, label: choice.profile ? `${name} · ${choice.label}` : name, executable })) : [];
    }),
    environment: (id, provider) => usageEnvironment(provider === 'kiro'
      ? Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith('paddock_')))
      : accounts.environment(id, provider, { baseEnv: process.env })),
    saveResult: async (raw, context) => workbench.results.add(raw, await resultGitContext({}, context || {}, workbench.results.root))
  };
  workbench.delegation = new Delegation(root, { ...taskAccounts, testMode, getSettings: () => settings,
    openPanel: job => sessions?.createReviewPanel(job), panelOpen: id => sessions?.items.get(id)?.kind === 'review' });
  workbench.delegation.on('changed', publish);
  if (!testMode) {
    openCodeAvailable = false;
    await startupStep('OpenCode check', () => { openCodeSignedIn({ executable: cliSetup.executable('opencode') }); openCodeAvailable = true; }, { optional: true, notice: 'OpenCode check failed, so OpenCode is hidden for now. Details are in the log.' });
  }
  ownerConsoles = new OwnerConsoles(root);
  ownerConsoles.on('persistence-error', () => { storageError = 'Console protection could not be saved.'; publish(); });
  capacityReservations = new CapacityReservations(ownerConsoles, {
    workers: () => registryFromRouting({ routing: settings.routing, candidates: testMode ? [] : taskAccounts.candidates() }),
    active: () => [...(sessions?.items.values() || [])]
    .filter(item => item.alive && item.state === 'active' && !item.remote && !item.kind && !item.taskId)
    .map(item => ({ quotaGroupId: ownerConsoles.records.get(item.consoleKey)?.quotaGroupId || item.accountId || `${item.provider}:default`,
      local: ownerConsoles.records.get(item.consoleKey)?.local === true, owner: ownerConsoles.records.get(item.consoleKey)?.ownerTurn === true })) });
  tasks = new TaskLoop(root, { ...taskAccounts, admission: capacityReservations, getSettings: () => settings, candidates: () => {
    if (testMode) return [];
    const choices = taskAccounts.candidates(), executable = cliSetup.executable('opencode');
    if (openCodeAvailable && executable && openCodeSignedIn({ executable })) choices.push({ id: 'opencode:default', provider: 'opencode', label: 'OpenCode', executable });
    return choices;
  },
    environment: (id, provider) => provider === 'opencode' ? usageEnvironment(Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith('paddock_')))) : taskAccounts.environment(id, provider),
    repositories: () => {
      const folders = projects.list().flatMap(project => project.folders.map(folder => ({ path: folder.path, label: `${project.name}${folder.label ? ` / ${folder.label}` : ''}: ${folder.path}` })));
      for (const session of sessions?.items.values() || []) if (session.alive && !session.remote && !session.kind && session.cwd) folders.push({ path: session.cwd, label: `${session.name}: ${session.cwd}` });
      return folders.filter((folder, index) => folders.findIndex(other => process.platform === 'win32' ? other.path.toLowerCase() === folder.path.toLowerCase() : other.path === folder.path) === index);
    },
    saveResult: async (raw, context) => raw.resultId && workbench.results.items.some(item => item.id === raw.resultId)
      ? workbench.results.updateText(raw.resultId, raw)
      : taskAccounts.saveResult(raw, context)
  });
  tasks.on('changed', publish);
  projects.on('tracking-error', message => { storageError = message; publish(); });
  hub = new SharedHub(root, vault, { integrations, workbench, skills: () => skillPacks.snapshot().packs, confirm: confirmToolCall, isLaunchCurrent: owner => {
    const item = sessions?.items.get(owner?.sessionId);
    return !!item?.alive && !item.switching && item.launchId === owner.launchId;
  } }); await startupStep('Shared tools', () => hub.start(), { optional: true });
  ssh = new SshHosts(root);
  sessions = new Sessions(root, { ssh, hub, claude, runtime, cliSetup, projects, accounts, draftBridge, grid: settings.grid, codexScrollback: () => settings.codexScrollback !== false,
    isBusy: id => !!turns?.active.has(id), getThreadModel: (accountId, threadId) => getCodexAccount(accountId).threadModel(threadId), onLayout: ({ grid, plan }) => {
    const slotNames = { ...settings.slotNames };
    for (const item of plan) delete slotNames[sessions.items.get(item.id)?.slot];
    for (const item of plan) slotNames[item.slot] = sessions.items.get(item.id)?.name || '';
    persistSettings({ ...settings, grid, slotNames, slotTrims: moveSlotTrims(settings.slotTrims, plan, sessions.items) });
  } });
  ownerConsoles.bind(sessions, { profile: item => capacityReservations.profile({ accountId: item.accountId || `${item.provider}:default` }) });
  new WorkerSessions(sessions, tasks);
  sessions.on('changed', () => capacityReservations.drain());
  workPower = new WorkPower(powerSaveBlocker);
  sessions.on('changed', updatePower);
  // Shell output does not change session state; recheck so a running build keeps the PC awake.
  setInterval(updatePower, 30000).unref();
  sessions.on('name-changed', item => {
    try { persistSettings({ ...settings, slotNames: { ...settings.slotNames, [item.slot]: item.name } }); }
    catch { storageError = 'The chat title could not be saved to this slot.'; }
  });
  sessions.on('context-error', message => { storageError = message; publish(); });
  sessions.on('message-usage', ({ session, messages }) => { try { messageUsage.record({ ...session, projectName: projects.get(session.projectId)?.name || '' }, messages); } catch { storageError = 'Message usage could not be saved.'; } });
  turns = new Turns(workbench.results, { enabled: settings.autoSaveResults === true, getSession: id => sessions.items.get(id), getSecrets: () => vault.list().flatMap(x => { try { return [vault.get(x.id)]; } catch { return []; } }) });
  workbench.turns = turns;
  codePanel = new CodePanel(sessions, { onChange: publish, getProjects: () => projects.list(), getSecrets: () => vault.list().flatMap(x => { try { return [vault.get(x.id)]; } catch { return []; } }) });
  turns.codePanel = codePanel;
  turns.on('tracking-error', ({ owner, message }) => workbench.alerts.send({ title: 'Code capture needs attention', message, sessionId: owner, kind: 'error' }));
  messageQueue = new MessageQueue(sessions);
  messageQueue.on('changed', publish); prompts.on('changed', publish);
  messageQueue.on('error', ({ id, message }) => workbench.alerts.send({ key: 'queue:' + id + ':' + Date.now(), title: (sessions.items.get(id)?.name || 'Console') + ': queued message not sent', message, sessionId: id, kind: 'error' }));
  mobile = new MobileCompanion(root, safeStorage, { codePanel, sessions, concepts: workbench.concepts, redactImageText: value => hub.redact(value), results: workbench.results, alerts: workbench.alerts, queue: messageQueue, prompts, getUsage: usageSnapshot, getUsageTurns: () => [...(messageUsage?.items || []), ...apiMessages(ledger || [])], refreshUsage: refreshLimits, getDefaults: () => ({ ...settings.consoleDefaults, permissions: settings.agentPermissions }), worktrees, endMobileSession: (id, choice, valid) => endMobileSession(id, choice, valid, { sessions, getSettings: () => settings, persistSettings, worktrees }), getModels: () => getCodexAccount(defaultId('codex')).models(), toolsStatus: true, getSettings: () => { const shared = hub.snapshot(), keys = vault.list(); return { shared, keys, integrations: integrations.snapshot(shared.connections, keys), setupRequests: workbench.snapshot().setupRequests, redact: value => hub.redact(value) }; }, getKey: id => vault.get(id), networkScript: app.isPackaged ? path.join(process.resourcesPath, 'mobile-network.ps1') : path.join(__dirname, 'mobile-network.ps1'), program: process.execPath, testMode });
  mobile.on('changed', publish);
  mobile.on('pairing-requested', () => { if (settings.notifications && !testMode) notifications?.show({ title: 'Approve a phone?', message: 'Compare the codes on your PC and phone before allowing access.', destination: 'phone-pairing' }); });
  if (!testMode) void startupStep('Phone connection', () => mobile.start(), { optional: true }).catch(() => {});
  const savedLimits = readJson(path.join(root, 'limits.json'), [], {
    recoverCorrupt: true,
    onRecovery: () => { storageError = 'Cached usage limits were damaged. The original file was kept with a .corrupt suffix. Limits will refresh when available.'; }
  });
  limits = Array.isArray(savedLimits) ? savedLimits.map(item => item?.provider === 'codex' && !item.accountId ? { ...item, accountId: defaultId('codex') } : item) : [];
  await startupStep('Codex sign-in check', () => getCodexAccount(defaultId('codex')), { optional: true });
  sessions.on('changed', publish);
  sessions.on('changed', refreshSwitchOffers);
  sessions.on('changed', () => { for (const item of sessions.items.values()) if (!item.alive && turns.active.has(item.id)) turns.finish(item.id).catch(() => {}); });
  sessions.on('output', data => { if (window && !window.isDestroyed()) window.webContents.send('dock:output', data); });
  sessions.on('limits', value => {
    const id = limitAccountId(value);
    if (id) saveUsage({ id }, [{ ...value, accountId: id }]);
  });
  sessions.on('attention', session => {
    workbench.alerts.send(completionNotice({ key: `${session.id}:${session.updatedAt}:${session.state}`, title: session.name + (session.state === 'ready' ? ' is ready' : ' needs you'), message: session.summary || '', kind: session.state === 'ready' ? 'ready' : 'question' }, { sessionId: session.id, consoleKey: session.consoleKey || session.id, turnId: session.turnId }, workbench.results.list()));
  });
  const seenExits = new Set();
  sessions.on('changed', () => {
    for (const item of sessions.list()) if (item.purpose !== 'login' && !item.alive && !item.dismissed && (item.restoreError || item.exitCode) && !seenExits.has(item.id)) {
      seenExits.add(item.id); workbench.alerts.send({ key: 'exit:' + item.id, title: item.name + ' stopped', message: item.restoreError || `Exit code ${item.exitCode}`, sessionId: item.id, kind: 'error' });
    }
  });
  // Smoke tests use an empty folder and no clipboard so results do not depend on the user's screenshots.
  screenshots = new Screenshots(root, testMode ? { nativeImage, folders: [path.join(root, 'test-screenshots')] } : { clipboard: clipboardReader(clipboard, nativeImage), nativeImage });
  screenshots.on('changed', publish);
  await startupStep('Screenshot checks', () => screenshots.start(), { optional: true });
  workspace = new Workspace(root, sessions, safeStorage, { enabled: settings.restoreConsoles, readOnly: safeMode, onDiagnostic: error => crash.log('ERROR', `Console restore: ${error?.stack || error}`), onError: message => {
    workspaceError = message;
    if (message) { crash.log('WARN', message); if (!windowReady && !crash.notices.includes(message)) crash.notices.push(message); }
    publish();
  } });
  await startupStep('Console restore', () => workspace.restore(), { optional: true, notice: 'Consoles could not be reopened. The saved workspace was kept. Details are in the log.' });
  crash.step = 'opening the window'; crash.log('INFO', crash.step);
  const windowIcon = path.join(__dirname, '..', 'assets', process.platform === 'win32' && !app.isPackaged ? 'icon.ico' : 'icon.png');
  // macOS keeps its own window buttons; other systems use Paddock's title bar.
  const chrome = process.platform === 'darwin' ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 14 } } : { frame: false };
  window = new BrowserWindow({ width: 1240, height: 840, minWidth: 720, minHeight: 520, ...chrome, show: false, backgroundColor: '#010103', title: 'Paddock', icon: windowIcon,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false } });
  if (process.platform === 'win32') {
    const icon = taskbarIcon({ projectDir: app.getAppPath(), dataDir: root, packaged: app.isPackaged });
    if (!app.isPackaged && !testMode) {
      try {
        developmentShortcuts({ shell, desktop: app.getPath('desktop'), programs: path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'), projectDir: app.getAppPath(), icon });
      } catch (error) { crash.log('WARN', `shortcuts: ${error?.stack || error}`); }
    }
    window.setAppDetails({ appIconPath: icon, appIconIndex: 0,
      relaunchCommand: `"${process.execPath}"${app.isPackaged ? '' : ` "${app.getAppPath()}"`}`, relaunchDisplayName: 'Paddock' });
    // Set the identity after its relaunch properties, before the window is shown.
    window.setAppDetails({ appId: appModelId });
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  // Preview frames stay on local development servers.
  window.webContents.on('will-frame-navigate', event => { if (!event.isMainFrame && !isLocal(event.url)) event.preventDefault(); });
  window.webContents.on('will-redirect', event => { if (!event.isMainFrame && !isLocal(event.url)) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.on('unresponsive', () => ownerConsoles.freeze());
  window.webContents.on('did-start-loading', () => ownerConsoles.freeze());
  window.webContents.on('render-process-gone', () => { ownerConsoles.freeze(); if (!quitting) window.loadFile(entryFile); });
  window.on('close', event => { if (!quitting) { event.preventDefault(); hideToTray(); } });
  window.on('focus', () => { if (!safeMode) void startupStep('Screenshot checks', () => screenshots.refresh(), { optional: true }); });
  let readyShown = false, startupComplete = false;
  const finishWindow = async () => {
    if (!readyShown || !startupComplete || crashing || windowReady) return;
    try { await setMode(process.argv.includes('--hud') && !safeMode ? 'hud' : 'dashboard'); crash.ready(); windowReady = true; }
    catch (error) { void startupCrash(error); }
  };
  window.once('ready-to-show', () => { readyShown = true; void finishWindow(); });
  const iconFile = path.join(__dirname, '..', 'assets', 'icon.png');
  await startupStep('System tray', () => { if (fs.existsSync(iconFile)) {
    tray = new Tray(nativeImage.createFromPath(iconFile)); tray.setToolTip('Paddock');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Paddock', click: revealWindow }, { label: 'Corner HUD', click: () => setMode('hud') }, { type: 'separator' }, { label: 'Quit Paddock', click: quit }]));
    tray.on('click', revealWindow); tray.on('double-click', revealWindow);
    tray.on('balloon-click', () => notifications?.balloonClick?.());
  } }, { optional: true, skipInSafeMode: false });
  notifications = new DockNotifications({ Notification, getTray: () => tray, getWindow: () => window, getMode: () => modeTarget || mode,
    setMode, reveal: revealWindow, publish, getSessions: () => sessions.list(), icon: iconFile });
  workbench.alerts.on('notification', item => { if (settings.notifications && !testMode) notifications.show(item); });
  await startupStep('Keyboard shortcuts', () => {
    shortcutAvailable = !testMode && globalShortcut.register('CommandOrControl+Alt+Space', () => trayHidden ? revealWindow() : setMode((modeTarget || mode) === 'hud' ? 'dashboard' : 'hud'));
    for (let i = 1; !testMode && i <= 9; i++) globalShortcut.register(`CommandOrControl+Alt+${i}`, () => {
      const item = sessions.list().find(x => (x.alive || x.restoreError) && consoleCells(x, sessions.grid).includes(i)); if (!item) return;
      setMode('fullscreen'); window.webContents.send('dock:select', item.id);
    });
  }, { optional: true, skipInSafeMode: false });
  if (!testMode) {
    await startupStep('Recent chats', () => { recent = recentReader.scan(); }, { optional: true });
    void startupStep('Usage checks', () => refreshLimits(), { optional: true }).catch(() => {});
  }
  setInterval(() => { sessions.scanEvents(); }, 1000).unref();
  if (!testMode && !safeMode) {
    setInterval(() => { void startupStep('Recent chats', () => { recent = recentReader.scan(); sessions.updateUsage(recent); publish(); }, { optional: true }); }, 12000).unref();
    setInterval(() => { void startupStep('Usage checks', refreshLimits, { optional: true }); }, 120000).unref();
  }
  if (!safeMode) setInterval(refreshSwitchOffers, 60000).unref();
  ipcMain.on('dock:owner-activity', (event, payload) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== entryUrl) return;
    try {
      if (payload?.kind === 'heartbeat') ownerConsoles.heartbeat(payload.consoles);
      else {
        const item = sessions.items.get(payload?.id);
        if (!item || item.consoleKey !== payload.consoleKey || (item.launchId || item.id) !== payload.launchId) return;
        ownerConsoles.interaction(item.consoleKey, item.launchId || item.id, payload.kind,
          { trusted: true, focused: payload.focused, selection: payload.selection, draft: payload.draft });
      }
    } catch { /* Ignore activity for a console replaced during renderer delivery. */ }
  });
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
          case 'mobile.rename': value = mobile.rename(payload); break;
          case 'mobile.status': value = mobile.snapshot(); publish(); break;
          case 'mobile.check-firewall': await mobile.network.checkFirewall(mobile.config); value = mobile.snapshot(); break;
          case 'mobile.inspect-network': value = await mobile.network.inspect(payload?.host); break;
          case 'mobile.firewall': if (!mobile.server && payload?.remove !== true) throw new Error('Enable the phone connection first.'); value = await mobile.network.firewall(mobile.config, payload?.remove === true); break;
          case 'mobile.windows-network': await shell.openExternal('ms-settings:network-status'); break;
          case 'mobile.router': {
            const gateway = mobile.network.snapshot().gateway;
            if (!gateway || !require('./mobile-address.cjs').isPrivate(gateway)) throw new Error('Check your network first.');
            await shell.openExternal(`http://${gateway}/`); break;
          }
          default: throw new Error('Unknown mobile action.');
        }
        return { ok: true, value };
      }
      if (typeof method === 'string' && method.startsWith('workbench.')) return { ok: true, value: await workbench.call(method.slice(10), payload) };
      switch (method) {
        case 'state': return { ok: true, value: snapshot() };
        case 'restart.normal': {
          if (sessions.list().some(item => item.alive) && !testMode) {
            const { response } = await dialog.showMessageBox(window, { type: 'question', message: 'End open consoles and restart normally?', detail: 'Consoles opened in safe mode are not saved.', buttons: ['Keep running', 'Restart normally'], defaultId: 0, cancelId: 0 });
            if (response !== 1) break;
          }
          restart(false); break;
        }
        case 'tasks.candidates': return { ok: true, value: tasks.choices(payload?.implementer, payload || {}) };
        case 'tasks.start': return { ok: true, value: await tasks.start(payload) };
        case 'tasks.approvePlan': return { ok: true, value: await tasks.approvePlan(payload) };
        case 'tasks.resume': return { ok: true, value: await tasks.resume(payload?.id) };
        case 'tasks.stop': {
          const affected = sessions.list().filter(item => item.taskId === payload?.id && item.processAlive);
          if (affected.length && !testMode) {
            const reply = await dialog.showMessageBox(window, { type: 'question', buttons: ['Keep running', 'Stop workers'], defaultId: 0, cancelId: 0,
              message: 'Stop task workers?', detail: affected.map(item => item.name).join('\n') });
            if (reply.response !== 1) return { ok: true, value: false };
            const current = sessions.list().filter(item => item.taskId === payload?.id && item.processAlive);
            if (current.length !== affected.length || current.some(item => !affected.some(prior => prior.consoleKey === item.consoleKey && prior.launchId === item.launchId))) {
              throw new Error('The task workers changed. Review Stop again.');
            }
          }
          return { ok: true, value: await tasks.stop(payload?.id) };
        }
        case 'worker.submit': return { ok: true, value: sessions.workerBridge.submit(payload) };
        case 'worker.stop': {
          return { ok: true, value: await sessions.workerBridge.stopDesktop(payload, { testMode,
            confirm: async item => (await dialog.showMessageBox(window, { type: 'question', buttons: ['Keep running', 'Stop worker'], defaultId: 0, cancelId: 0,
              message: `Stop worker for ${item.name}?`, detail: 'All work is kept.' })).response === 1 }) };
        }
        case 'tasks.accept': return { ok: true, value: await tasks.accept(payload?.id) };
        case 'tasks.list': await tasks.refresh(); return { ok: true, value: tasks.snapshot() };
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
          if (process.platform === 'linux' && process.env.APPIMAGE) {
            // Replace the running AppImage with the verified download, then restart.
            const target = process.env.APPIMAGE, staged = target + '.update';
            fs.copyFileSync(file, staged); fs.chmodSync(staged, 0o755); fs.renameSync(staged, target);
            quitting = true; app.relaunch({ execPath: target }); app.quit(); break;
          }
          if (process.platform === 'linux') { shell.showItemInFolder(file); break; }
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
        case 'skills.refresh': { const value = skillPacks.list(); publish(); return { ok: true, value }; }
        case 'skills.install': { if (testMode && !process.env.PADDOCK_SKILLS_HOME) throw new Error('Skill installs need a temporary home in tests.'); const value = await skillPacks.install(payload); hub.writeSummary(); return { ok: true, value }; }
        case 'skills.uninstall': { if (testMode && !process.env.PADDOCK_SKILLS_HOME) throw new Error('Skill installs need a temporary home in tests.'); const value = await skillPacks.uninstall(payload); hub.writeSummary(); return { ok: true, value }; }
        case 'agents.refresh': {
          cliSetup.refresh(); skillPacks.list();
          sessions.claude = findClaude();
          capabilities = { ...capabilities, codex: !!nativeCodex(), claude: !!sessions.claude, claudeLocation: sessions.claude?.label };
          publish(); return { ok: true, value: capabilities };
        }
        case 'agents.install': {
          const result = await cliSetup.install(payload); skillPacks.list();
          sessions.claude = findClaude();
          capabilities = { ...capabilities, codex: !!nativeCodex(), claude: !!sessions.claude, claudeLocation: sessions.claude?.label };
          publish(); return { ok: true, value: result };
        }
        case 'ssh.scan': return { ok: true, value: await ssh.scan(payload) };
        case 'ssh.approve': { const value = ssh.approve(payload); publish(); return { ok: true, value }; }
        case 'ssh.check': { const value = await ssh.check(payload); publish(); return { ok: true, value }; }
        case 'ssh.rename': { const value = ssh.rename(payload.id, payload.name); publish(); return { ok: true, value }; }
        case 'ssh.remove': {
          if (sessions.list().some(x => x.remote?.hostId === payload && (x.alive || x.restoreError))) throw new Error('End this host’s consoles before removing it.');
          ssh.remove(payload); publish(); break;
        }
        case 'ssh.keyFile': {
          const picked = await dialog.showOpenDialog(window, { properties: ['openFile'], title: 'Choose an SSH private key (stays on this PC)' });
          return { ok: true, value: picked.filePaths[0] || '' };
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
        case 'explorer.list': return { ok: true, value: await codePanel.list(payload?.root, payload?.path) };
        case 'code.create': {
          const panel = codePanel.create(payload, settings.consoleDefaults.cwd);
          publish(); return { ok: true, value: panel };
        }
        case 'web.create': {
          const source = sessions.items.get(payload?.sourceId);
          const panel = sessions.createWebPanel({ url: payload?.url || '', codeSourceKey: source && !source.kind ? source.consoleKey || source.id : null, slot: payload?.slot });
          publish(); return { ok: true, value: panel };
        }
        case 'web.url': return { ok: true, value: sessions.setWebUrl(payload?.id, payload?.url) };
        case 'web.phone': return { ok: true, value: sessions.setWebPhoneAllowed(payload?.id, payload?.allow) };
        case 'web.open': {
          const panel = sessions.items.get(payload);
          if (panel?.kind !== 'web' || !isLocal(panel.url)) throw new Error('Enter a local address first.');
          await shell.openExternal(panel.url); break;
        }
        case 'code.source': {
          const panel = codePanel.panel(payload?.id), source = sessions.items.get(payload?.sourceId);
          if (!source || source.remote || source.kind === 'code') throw new Error('Choose a local console.');
          panel.codeSourceKey = source.consoleKey || source.id; panel.cwd = source.cwd;
          sessions.emit('changed'); return { ok: true, value: panel };
        }
        case 'code.report': return { ok: true, value: await codePanel.report(payload?.id, payload?.refresh === true) };
        case 'code.browse': return { ok: true, value: await codePanel.browse(payload?.id, payload?.path) };
        case 'code.file': return { ok: true, value: await codePanel.file(payload?.id, payload?.path, payload?.reportId) };
        case 'review.close': {
          closeReviewPanel(payload, { sessions, getSettings: () => settings, persistSettings }); break;
        }
        case 'code.close': case 'web.close': {
          const panel = method === 'code.close' ? codePanel.panel(payload) : sessions.items.get(payload), slotNames = { ...settings.slotNames };
          if (method === 'web.close' && panel?.kind !== 'web') throw new Error('Open a preview panel first.');
          delete slotNames[panel.slot]; persistSettings({ ...settings, slotNames });
          sessions.end(payload); break;
        }
        case 'session.create': {
          payload = payload?.projectId ? projects.launch(payload) : payload;
          const occupied = occupiedCells(sessions.items.values(), sessions.grid);
          const slot = payload?.slot ?? Array.from({ length: sessions.grid.columns * sessions.grid.rows }, (_, i) => i + 1).find(x => !occupied.has(x));
          const { accountId, worktree: ownWorktree, ...launch } = payload || {};
          if (ownWorktree) {
            await prepareWorktree(launch, worktrees, settings.consoleDefaults.cwd);
          }
          // Only a signed-in account of the chosen agent can be launched directly.
          if (accountId !== undefined && !accounts?.choices(launch.provider).some(choice => choice.id === accountId && (!choice.profile || choice.loginCompletedAt))) throw new Error('Choose a signed-in account for this agent.');
          const session = await sessions.create({ ...settings.consoleDefaults, ...(settings.slotNames?.[slot] ? { name: settings.slotNames[slot] } : {}), ...launch, permissions: launch.permissions ?? settings.agentPermissions }, accountId ? { accountId } : undefined);
          persistSettings({ ...settings, slotNames: { ...settings.slotNames, [session.slot]: session.name } }); publish();
          return { ok: true, value: session };
        }
        case 'accounts.create': {
          const profile = accounts.create(payload?.provider, payload?.label);
          publish();
          return { ok: true, value: accounts.choices(profile.provider).find(item => item.id === profile.id) };
        }
        case 'accounts.rename': {
          const renamed = accounts.rename(payload?.id, payload?.label);
          for (const session of sessions.items.values()) if (session.accountId === renamed.id) session.accountLabel = renamed.label;
          publish(); return { ok: true, value: renamed };
        }
        case 'accounts.remove': {
          const profile = accounts.get(payload);
          if (!profile) throw new Error('Account profile not found.');
          if ([...sessions.items.values()].some(item => item.alive && item.accountId === profile.id)) throw new Error('End the consoles using this account first.');
          const { response } = await dialog.showMessageBox(window, { type: 'warning', buttons: ['Keep account', 'Remove account'], defaultId: 0, cancelId: 0, noLink: true,
            message: `Remove ${profile.label}?`, detail: 'Paddock deletes this account\'s sign-in and settings folder. Chats stored with the provider are not affected.' });
          if (response !== 1) break;
          codexAccounts.get(profile.id)?.stop(); codexAccounts.delete(profile.id);
          accounts.remove(profile.id);
          limits = limits.filter(item => limitAccountId(item) !== profile.id);
          try { atomicJson(path.join(root, 'limits.json'), limits); } catch (error) { storageError = error.message; }
          publish(); return { ok: true, value: true };
        }
        case 'accounts.login': {
          const session = await sessions.createLoginConsole(payload?.id, settings.consoleDefaults.cwd);
          publish(); return { ok: true, value: session };
        }
        case 'accounts.setup': {
          const session = await sessions.createSetupConsole(payload);
          publish(); return { ok: true, value: session };
        }
        case 'slot.trim': {
          const slotTrims = updatedSlotTrims(settings.slotTrims, payload, sessions.list(), sessions.grid);
          persistSettings({ ...settings, slotTrims }); publish(); break;
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
        case 'projects.proposal.accept': return { ok: true, value: projects.acceptProposal(payload.id, sessions) };
        case 'projects.proposal.dismiss': projects.dismissProposal(payload.id); return { ok: true };
        case 'projects.decision': { const project = projects.decide(payload.id, payload); publish(); return { ok: true, value: project }; }
        case 'projects.plan.begin': return { ok: true, value: projects.beginPlan(payload.id) };
        case 'projects.plan.review': return { ok: true, value: projects.review(payload.id, payload) };
        case 'projects.plan.underway': return { ok: true, value: projects.underway(payload.id, payload) };
        case 'projects.plan.later': return { ok: true, value: projects.addLater(payload.id, payload) };
        case 'projects.plan.sync': return { ok: true, value: projects.syncPlan(payload.id) };
        case 'projects.plan.reference.add': {
          const raw = payload?.kind === 'screenshot' ? { ...payload, kind: 'file', value: screenshots.file(), title: 'Screenshot ' + new Date().toLocaleString() } : payload;
          return { ok: true, value: projects.addReference(payload.id, raw) };
        }
        case 'projects.plan.reference.remove': return { ok: true, value: projects.removeReference(payload.id, payload) };
        case 'projects.plan.thumb': {
          const item = projects.get(payload?.id)?.plan?.references?.find(x => x.id === payload?.ref && x.kind === 'image');
          if (!item) return { ok: true, value: '' };
          const image = nativeImage.createFromPath(item.value);
          return { ok: true, value: image.isEmpty() ? '' : image.resize({ width: 240, quality: 'good' }).toDataURL() };
        }
        case 'projects.plan.pick': {
          const result = await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'] });
          return { ok: true, value: result.canceled ? [] : result.filePaths.slice(0, 20) };
        }
        case 'open.link': {
          let url; try { url = new URL(String(payload)); } catch { throw new Error('That link is not valid.'); }
          if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only web links can be opened.');
          await shell.openExternal(url.href); break;
        }
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
        case 'session.layout.preview': return { ok: true, value: sessions.previewLayout({ id: payload?.id, slot: payload?.slot, width: payload?.width, height: payload?.height }) };
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
            persistSettings({ ...settings, slotNames, slotTrims: moveSlotTrims(settings.slotTrims, plan, sessions.items) });
          });
          break;
        }
        case 'session.retry': return { ok: true, value: await sessions.retry(payload) };
        case 'session.releaseToHub': ownerConsoles.release(payload?.consoleKey, payload?.launchId); break;
        case 'session.input': sessions.write(payload?.id, payload?.data); break;
        case 'queue.add': return { ok: true, value: messageQueue.add(payload?.id, payload?.text, { ownerRequested: true }) };
        case 'queue.edit': messageQueue.edit(payload?.id, payload?.entryId, payload?.text); break;
        case 'queue.remove': messageQueue.remove(payload?.id, payload?.entryId); break;
        case 'queue.move': messageQueue.move(payload?.id, payload?.entryId, payload?.offset); break;
        case 'queue.pause': messageQueue.pause(payload?.id, payload?.paused === true); break;
        case 'queue.send': await messageQueue.sendNow(payload?.id, payload?.entryId); break;
        case 'prompt.save': return { ok: true, value: prompts.save(payload) };
        case 'prompt.remove': prompts.remove(payload); break;
        case 'clipboard.write': {
          if (typeof payload !== 'string' || payload.length > 1024 * 1024) throw new Error('Select up to 1 MB of text to copy.');
          clipboard.writeText(payload); break;
        }
        case 'clipboard.menu': {
          if (typeof payload !== 'string' || payload.length > 1024 * 1024) throw new Error('Select up to 1 MB of text to copy.');
          Menu.buildFromTemplate([{ label: 'Copy', enabled: !!payload, click: () => clipboard.writeText(payload) }]).popup({ window }); break;
        }
        case 'session.switch': return { ok: true, value: await sessions.switchAccount(payload) };
        case 'session.switch-dismiss': {
          const session = sessions.items.get(payload?.id);
          if (!session || session.launchId !== payload?.launchId || session.switchOffer?.key !== payload?.offerKey) throw new Error('This account switch offer has changed.');
          dismissedThresholdOffers.add(payload.offerKey); delete session.switchOffer; publish(); break;
        }
        case 'screenshot.path': return { ok: true, value: screenshots.pathFor(sessions.items.get(payload?.id)) };
        case 'screenshot.clipboard': return { ok: true, value: await screenshots.paste(sessions.items.get(payload?.id)) };
        case 'file.preview': {
          const item = sessions.items.get(payload?.id);
          if (item?.remote) throw new Error('This file is on the Linux machine. View it from that console, for example with cat.');
          return { ok: true, value: filePreview.preview(payload?.path, item?.cwd) };
        }
        case 'file.open': case 'file.reveal': {
          const file = filePreview.resolve(payload?.path);
          if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
          if (method === 'file.reveal') { shell.showItemInFolder(file); break; }
          const error = await shell.openPath(file); if (error) throw new Error('Windows could not open this file: ' + error);
          break;
        }
        case 'session.resize': sessions.resize(payload?.id, payload?.cols, payload?.rows); break;
        case 'session.buffer': return { ok: true, value: sessions.buffer(payload) };
        case 'session.acknowledge': sessions.acknowledge(payload); break;
        case 'session.end': {
          return { ok: true, value: await endSession(payload, { sessions, getSettings: () => settings, persistSettings, dialog, window, testMode, worktrees }) };
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
          if (payload?.id === 'meshy' && !vault.list().some(x => x.id === payload.keyId)) throw new Error('Paste your Meshy API key, then connect.');
          const previous = hub.config.connections.find(x => x.id === payload?.id);
          if (previous && previous.integration !== payload.id) throw new Error('A custom tool already uses this ID. Rename it before setting up this integration.');
          const connection = await integrations.prepare(payload?.id, payload);
          await hub.saveConnection(connection); publish(); break;
        }
        case 'tools.save': await hub.saveConnection(payload); publish(); break;
        case 'catalog.add': {
          if (testMode) throw new Error('Software installation is disabled during tests.');
          const existing = hub.config.connections.find(x => x.id === payload?.id);
          if (existing && existing.catalog !== payload?.id) throw new Error('A custom tool already uses this ID. Rename it before adding this one.');
          if (payload?.keyId && !vault.list().some(x => x.id === payload.keyId)) throw new Error('Paste the key on this card, then save.');
          await hub.saveConnection(await mcpCatalog.add(payload?.id, { keyId: payload?.keyId })); publish(); break;
        }
        case 'tools.policy': {
          const connection = hub.config.connections.find(x => x.id === payload?.id);
          if (!connection) throw new Error('That tool is no longer connected.');
          const { access, ...limits } = payload.policy || {};
          await hub.saveConnection({ ...connection, enabled: access !== 'off', policy: { ...limits, access: access === 'off' ? connection.policy?.access : access } }); publish(); break;
        }
        case 'tools.remove': await hub.removeConnection(payload); publish(); break;
        case 'tools.test': { try { const result = await hub.test(payload); return { ok: true, value: result }; } finally { publish(); } }
        case 'tools.catalog': { try { return { ok: true, value: await hub.list(payload) }; } finally { publish(); } }
        case 'profiles.save': hub.saveProfile(payload); publish(); break;
        case 'profiles.remove': hub.removeProfile(payload); publish(); break;
        case 'settings': {
          const next = { ...settings };
          if (payload?.routing !== undefined) next.routing = validateRouting(payload.routing);
          if (typeof payload?.hudAlwaysOnTop === 'boolean') next.hudAlwaysOnTop = payload.hudAlwaysOnTop;
          if (typeof payload?.notifications === 'boolean') next.notifications = payload.notifications;
          if (typeof payload?.confirmConsoleEnd === 'boolean') next.confirmConsoleEnd = payload.confirmConsoleEnd;
          if (typeof payload?.keepAwakeWhileWorking === 'boolean') next.keepAwakeWhileWorking = payload.keepAwakeWhileWorking;
          if (typeof payload?.restoreConsoles === 'boolean') {
            if (safeMode && payload.restoreConsoles !== settings.restoreConsoles) throw new Error('Restart normally to change console restoration.');
            next.restoreConsoles = payload.restoreConsoles;
          }
          if (typeof payload?.codexScrollback === 'boolean') next.codexScrollback = payload.codexScrollback;
          if (typeof payload?.autoSaveResults === 'boolean') next.autoSaveResults = payload.autoSaveResults;
          if (payload?.accountSwitchThreshold !== undefined) {
            const threshold = Number(payload.accountSwitchThreshold);
            if (!Number.isInteger(threshold) || threshold < 50 || threshold > 100) throw new Error('Choose a switch threshold from 50% to 100%.');
            next.accountSwitchThreshold = threshold;
          }
          if (typeof payload?.autoSwitchAccounts === 'boolean') next.autoSwitchAccounts = payload.autoSwitchAccounts;
          if (typeof payload?.delegationEnabled === 'boolean') next.delegationEnabled = payload.delegationEnabled;
          if (typeof payload?.delegationPanels === 'boolean') next.delegationPanels = payload.delegationPanels;
          if (payload?.delegationProviders !== undefined) {
            if (!Array.isArray(payload.delegationProviders) || payload.delegationProviders.some(id => !REVIEWERS.includes(id))) throw new Error('Choose reviewers from Claude Code, Codex and Kiro.');
            next.delegationProviders = [...new Set(payload.delegationProviders)];
          }
          // Which subscriptions the Usage page lists; a display preference only.
          for (const key of ['usageShown', 'usageHidden']) if (payload?.[key] !== undefined) {
            const ids = payload[key];
            if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !/^[a-z0-9-]{1,40}:[\w.-]{1,80}$/i.test(id))) throw new Error('Choose subscriptions from the list.');
            next[key] = [...new Set(ids)];
          }
          if (typeof payload?.suggestProjects === 'boolean') next.suggestProjects = payload.suggestProjects;
          if (payload?.explorerWidth !== undefined) {
            next.explorerWidth = validateExplorerWidth(payload.explorerWidth);
          }
          if (typeof payload?.sidebarCollapsed === 'boolean') next.sidebarCollapsed = payload.sidebarCollapsed;
          if (typeof payload?.vimControls === 'boolean') next.vimControls = payload.vimControls;
          if (typeof payload?.cursorBlink === 'boolean') next.cursorBlink = payload.cursorBlink;
          if (payload?.lighting !== undefined) {
            if (!lightingStyles.includes(payload.lighting)) throw new Error('Choose an available lighting effect.');
            next.lighting = payload.lighting;
          }
          if (payload?.lightingSpeed !== undefined) {
            if (!['slow', 'normal', 'fast'].includes(payload.lightingSpeed)) throw new Error('Choose slow, normal or fast lighting.');
            next.lightingSpeed = payload.lightingSpeed;
          }
          if (payload?.starDensity !== undefined) {
            const level = Number(payload.starDensity);
            if (!Number.isInteger(level) || level < 0 || level > 4) throw new Error('Choose a star level from Off to Galaxy.');
            next.starDensity = level;
          }
          if (typeof payload?.ambientMotion === 'boolean') next.ambientMotion = payload.ambientMotion;
          if (typeof payload?.themeTextures === 'boolean') next.themeTextures = payload.themeTextures;
          if (typeof payload?.launchEffect === 'boolean') next.launchEffect = payload.launchEffect;
          if (payload?.trimStyle !== undefined) {
            if (!frameStyles.includes(payload.trimStyle)) throw new Error('Choose an available console trim.');
            next.trimStyle = payload.trimStyle;
          }
          if (payload?.trimWidth !== undefined) {
            const width = Number(payload.trimWidth);
            if (![1, 2, 3, 4, 6].includes(width)) throw new Error('Choose an available trim width.');
            next.trimWidth = width;
          }
          if (payload?.consoleDefaults !== undefined) next.consoleDefaults = validateConsoleDefaults(payload.consoleDefaults);
          if (payload?.agentPermissions !== undefined) {
            if (!['default', 'unrestricted'].includes(payload.agentPermissions)) throw new Error('Choose a supported agent permission mode.');
            next.agentPermissions = payload.agentPermissions;
          }
          workspace.setEnabled(next.restoreConsoles);
          persistSettings(next); turns.setEnabled(settings.autoSaveResults === true); refreshSwitchOffers(); if (mode === 'hud') window.setAlwaysOnTop(settings.hudAlwaysOnTop); publish(); break;
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
          workbench.alerts.send({ title: result.error || result.entry?.status !== 'completed' ? 'API request needs attention' : 'API response ready', message: `${profile.name} · ${payload.model}`, kind: result.error || result.entry?.status !== 'completed' ? 'error' : 'ready', destination: 'usage' });
          publish(); return { ok: true, value: result };
        }
        case 'ledger.export': {
          const result = await dialog.showSaveDialog(window, { defaultPath: 'paddock-usage.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
          if (!result.canceled && result.filePath) atomicJson(result.filePath, { scope: 'API requests made through Paddock', currency: 'USD', costs: 'estimates', entries: ledger }); break;
        }
        case 'external.open': {
          if (typeof payload !== 'string' || payload.length > 4096) throw new Error('Invalid web link.');
          const url = new URL(payload);
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Only web links can open here.');
          await shell.openExternal(url.href); break;
        }
        case 'docs': {
          const urls = { codex: 'https://learn.chatgpt.com/docs/codex/cli', claude: 'https://code.claude.com/docs/en/overview', openai: 'https://developers.openai.com/api/docs/pricing', anthropic: 'https://platform.claude.com/docs/en/about-claude/pricing' };
          Object.assign(urls, { tailscale: 'https://tailscale.com/download', duckdns: 'https://www.duckdns.org/', 'mobile-guide': 'https://github.com/YeerooXY/agentdock/blob/main/docs/android-setup.md', 'android-download': 'https://github.com/YeerooXY/agentdock/releases' });
          for (const item of integrationDefinitions) urls[item.id] = item.docs;
          for (const item of creativeTools) urls[item.id] = item.docs;
          for (const item of recommendedTools) urls[item.id] = item.docs;
          for (const item of cliCatalog) urls[item.id] = item.docs;
          urls.zai = 'https://docs.z.ai/devpack/tool/opencode';
          Object.assign(urls, { 'key-notion': 'https://www.notion.so/profile/integrations', 'key-stripe': 'https://dashboard.stripe.com/apikeys', 'key-github': 'https://github.com/settings/personal-access-tokens/new' });
          if (!urls[payload]) throw new Error('Unknown documentation link.'); await shell.openExternal(urls[payload]); break;
        }
        default: throw new Error('Unknown action.');
      }
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message || 'This action could not be completed.' }; }
  });
  crash.step = 'opening the window'; crash.log('INFO', crash.step);
  await window.loadFile(entryFile);
  startupComplete = true; await finishWindow();
}, startupCrash)).catch(error => { void startupCrash(error); });
app.on('second-instance', () => setMode('dashboard'));
// Clicking the Dock icon reopens a window hidden to the tray.
app.on('activate', () => { if (window && !window.isVisible()) setMode('dashboard'); });
let cleanupStarted = false, cleanupDone = false;
app.on('before-quit', event => {
  if (cleanupDone) return;
  event.preventDefault();
  if (cleanupStarted) return;
  cleanupStarted = true; quitting = true;
  workPower?.dispose();
  workspace?.freeze();
  tasks?.interruptAll();
  capacityReservations?.dispose();
  ownerConsoles?.dispose();
  workbench?.stop();
  // Drain ConPTY exits while the event loop is alive, before Electron tears down its workers.
  (async () => {
    await mobile?.stop();
    await sessions?.stop();
    await draftBridge?.close();
    await hub?.close();
    for (const reader of codexAccounts.values()) reader.stop();
    stopUsageReaders();
    globalShortcut.unregisterAll();
  })().finally(() => { cleanupDone = true; app.quit(); });
});
app.on('window-all-closed', () => { if (testMode || quitting) app.quit(); });
