'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { findProgram, nativeCodex } = require('./adapters.cjs');
const { planLayout, planOpening, planGrid, gridSize, occupied } = require('./console-layout.cjs');
const { providers, byId: cliAgents } = require('./cli-catalog.cjs');
const { settingsAdapter } = require('./provider-settings.cjs');
const { cachedAntigravityConversation } = require('./antigravity-session.cjs');
const { prepareCodexSession } = require('./codex-session.cjs');
const { defaultId } = require('./account-profiles.cjs');
const { psQuote, realRoot } = require('./platform.cjs');
const { cleanWorktree } = require('./worktrees.cjs');
const { previewUrl } = require('./web-preview.cjs');
const { ordinaryConsole } = require('./worker-sessions.cjs');
const { consoleCapabilities } = require('./worker-placement.cjs');
const { studyContext, playtimeDirectory } = require('./study-context.cjs');
const { SessionLauncher, publicSession } = require('./session-launch.cjs');
const { SessionEventRuntime } = require('./session-runtime.cjs');
const { AccountSwitching } = require('./account-switching.cjs');
const { sessionPolicy } = require('./providers/index.cjs');

const isPanel = item => ['code', 'web', 'review'].includes(item?.kind);
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/\[\]@+-]{0,199}$/;
// A model applied through switchSettings stays with the console across restores
// until the provider reports a different one (an in-CLI change or a fallback).
function selectedModel(item) {
  const chosen = item.requestedSettings;
  if (!item.providerSessionId || item.remote || item.remoteHostId || settingsAdapter(item.provider).switchMethod !== 'resume' || !MODEL_ID.test(chosen?.model || '')) return null;
  const reported = item.modelId || item.model;
  if (reported && item.settingsAt > chosen.at && ![chosen.model, chosen.resolvedModel].includes(reported)) return null;
  return { model: chosen.model, resolvedModel: MODEL_ID.test(chosen.resolvedModel || '') ? chosen.resolvedModel : chosen.model };
}
function validateConsoleDefaults(raw) {
  if (!providers.includes(raw?.provider)) throw new Error('Choose an agent or shell.');
  const cwd = String(raw.cwd || '').trim();
  if (!path.isAbsolute(cwd) || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Choose an existing project folder.');
  const command = String(raw.command || '');
  if (command.length > 4000 || command.includes('\0') || (raw.provider === 'custom' && !command.trim())) throw new Error('Enter a custom command, up to 4,000 characters.');
  return { provider: raw.provider, cwd, name: String(raw.name || '').trim().slice(0, 64), command };
}

// Sessions remains the public service facade for layout, metadata and lifecycle.
// Process creation, PTY/event runtime and staged account changes have separate
// owners with explicit hosts instead of sharing the former monolithic class body.
class Sessions extends EventEmitter {
  constructor(root, dependencies = {}) {
    super(); this.root = realRoot(root); this.items = new Map(); this.eventTimes = new Map(); this.starting = new Map(); this.codexIdentities = new Map();
    this.pty = dependencies.pty || require('node-pty');
    this.findProgram = dependencies.findProgram || findProgram;
    this.nativeCodex = dependencies.nativeCodex || nativeCodex;
    this.codexScrollback = dependencies.codexScrollback || (() => true);
    this.hub = dependencies.hub;
    this.credentialSwitch = dependencies.credentialSwitch || null;
    this.studyContext = dependencies.studyContext || studyContext;
    this.projects = dependencies.projects;
    this.ssh = dependencies.ssh;
    this.claude = dependencies.claude;
    this.runtime = dependencies.runtime;
    this.cliSetup = dependencies.cliSetup;
    this.agentHome = dependencies.agentHome;
    this.prepareCodexSession = dependencies.prepareCodexSession || prepareCodexSession;
    this.accounts = dependencies.accounts;
    this.draftBridge = dependencies.draftBridge;
    this.getThreadModel = dependencies.getThreadModel || (async () => null);
    this.getModels = dependencies.getModels || (async () => []);
    this.isBusy = dependencies.isBusy || (() => false);
    this.draftQuietMs = dependencies.draftQuietMs ?? 900;
    this.switchOperations = new Map(); this.pendingStages = new Map(); this.loginAccounts = new Map(); this.setupAccounts = new Map();
    this.grid = gridSize(dependencies.grid); this.onLayout = dependencies.onLayout || (() => {});
    this.ownerConsoles = dependencies.ownerConsoles;
    this.contexts = new Map();
    this.refreshProjectContext = () => this.syncProjects();
    this.projects?.on('changed', this.refreshProjectContext);
    this.hub?.on?.('context-changed', this.refreshProjectContext);

    const facade = this;
    this.eventRuntime = new SessionEventRuntime({
      root: this.root, get items() { return facade.items; }, pendingStages: this.pendingStages, loginAccounts: this.loginAccounts,
      setupAccounts: this.setupAccounts, contexts: this.contexts, eventTimes: this.eventTimes, codexIdentities: this.codexIdentities,
      getHub: () => this.hub, getDraftBridge: () => this.draftBridge, getAccounts: () => this.accounts,
      getCredentialSwitch: () => this.credentialSwitch, emit: (...args) => this.emit(...args), listItem: id => this.list().find(item => item.id === id)
    });
    this.launcher = new SessionLauncher({
      root: this.root, get items() { return facade.items; }, starting: this.starting, pendingStages: this.pendingStages, contexts: this.contexts,
      loginAccounts: this.loginAccounts, setupAccounts: this.setupAccounts, events: this.eventRuntime, pty: this.pty, agentHome: this.agentHome,
      isStopping: () => !!this.stopping, getGrid: () => this.grid, layoutItems: () => this.layoutItems(),
      commitLayout: (plan, grid) => this.commitLayout(plan, grid), emit: (...args) => this.emit(...args), listItem: id => this.list().find(item => item.id === id),
      getProjects: () => this.projects, getHub: () => this.hub, getAccounts: () => this.accounts, getCredentialSwitch: () => this.credentialSwitch,
      getDraftBridge: () => this.draftBridge, getRuntime: () => this.runtime, getCliSetup: () => this.cliSetup, getClaude: () => this.claude, getSsh: () => this.ssh,
      findProgram: name => this.findProgram(name), nativeCodex: () => this.nativeCodex(), prepareCodexSession: (...args) => this.prepareCodexSession(...args),
      codexScrollback: () => this.codexScrollback(), studyContext: (...args) => this.studyContext(...args), playtimeDirectory
    });
    this.accountSwitching = new AccountSwitching(this.accountSwitchingHost());
  }

  accountSwitchingHost() {
    const facade = this;
    return {
      root: this.root, get items() { return facade.items; }, pendingStages: this.pendingStages, switchOperations: this.switchOperations,
      loginAccounts: this.loginAccounts, setupAccounts: this.setupAccounts, launcher: this.launcher,
      getAccounts: () => this.accounts, getHub: () => this.hub, getDraftBridge: () => this.draftBridge,
      getModels: (...args) => this.getModels(...args), getThreadModel: (...args) => this.getThreadModel(...args), isBusy: id => this.isBusy(id),
      getDraftQuietMs: () => this.draftQuietMs, emit: (...args) => this.emit(...args), refreshContextFile: item => this.refreshContextFile(item)
    };
  }
  getAccountSwitching() {
    // Keep the prototype helpers usable by focused draft tests that provide only
    // a session and draft bridge without constructing the full service.
    if (!this.accountSwitching) this.accountSwitching = new AccountSwitching(this.accountSwitchingHost());
    return this.accountSwitching;
  }

  layoutItems() { return [...this.items.values()].filter(item => !item.hidden); }
  list() { return [...this.items.values()].filter(item => !isPanel(item)).map(item => ({
    ...publicSession(item),
    consoleCapabilities: consoleCapabilities(item, this.ownerConsoles, !!this.workerBridge),
    switchMethod: item.remote || item.taskId ? 'none' : settingsAdapter(item.provider).switchMethod,
      ...(this.accounts && !item.taskId && settingsAdapter(item.provider).switchMethod === 'resume' && !['login', 'setup'].includes(item.purpose) ? {
      switchTargets: this.accounts.choices(item.provider).filter(x => x.id !== item.accountId).map(({ id, label, loginCompletedAt }) => ({ id, label, ready: id.endsWith(':default') || !!loginCompletedAt }))
    } : {})
  })).sort((a, b) => a.slot - b.slot); }
  codePanels() { return [...this.items.values()].filter(item => isPanel(item) && item.alive).map(publicSession); }
  createReviewPanel(job) {
    if (this.stopping) return null;
    const used = occupied([...this.layoutItems(), ...this.starting.values()], this.grid);
    const slot = Array.from({ length: this.grid.columns * this.grid.rows }, (_, i) => i + 1).find(x => !used.has(x));
    if (!slot) return null;
    const item = { id: crypto.randomUUID(), kind: 'review', provider: 'review', purpose: 'review', alive: true, state: 'open',
      name: `Review, ${job.reviewer.label}`, consoleName: job.consoleName, reviewId: job.id, slot, width: 1, height: 1, cwd: '', consoleKey: crypto.randomUUID() };
    this.items.set(item.id, item); this.emit('changed'); return publicSession(item);
  }
  createCodePanel(raw = {}) {
    if (this.stopping || this.starting.size) throw new Error('Wait for the console to finish opening.');
    const cwd = String(raw.cwd || '');
    if (!path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Choose an existing project folder.');
    const opening = planOpening(this.layoutItems(), raw, this.grid);
    const item = { id: crypto.randomUUID(), kind: 'code', provider: 'code', purpose: 'code', alive: true, state: 'open', name: 'Code', nameMode: 'custom', permissions: 'default', cwd,
      slot: opening.slot, width: opening.width, height: opening.height, codeSourceKey: typeof raw.codeSourceKey === 'string' ? raw.codeSourceKey.slice(0, 100) : null, consoleKey: raw.consoleKey || crypto.randomUUID(), projectId: raw.projectId || null };
    this.commitLayout(opening.plan, opening.grid); this.items.set(item.id, item); this.emit('changed'); return publicSession(item);
  }
  createWebPanel(raw = {}) {
    if (this.stopping || this.starting.size) throw new Error('Wait for the console to finish opening.');
    const url = previewUrl(raw.url), opening = planOpening(this.layoutItems(), raw, this.grid);
    const item = { id: crypto.randomUUID(), kind: 'web', provider: 'web', purpose: 'web', alive: true, state: 'open', name: 'Preview', nameMode: 'custom', permissions: 'default', cwd: '', url, phoneAllowed: false,
      slot: opening.slot, width: opening.width, height: opening.height, codeSourceKey: typeof raw.codeSourceKey === 'string' ? raw.codeSourceKey.slice(0, 100) : null, consoleKey: raw.consoleKey || crypto.randomUUID(), projectId: null };
    this.commitLayout(opening.plan, opening.grid); this.items.set(item.id, item); this.emit('changed'); return publicSession(item);
  }
  setWebUrl(id, url) {
    const item = this.items.get(id); if (!item?.alive || item.kind !== 'web') throw new Error('Open a preview panel first.');
    const next = previewUrl(url); if (next !== item.url) item.phoneAllowed = false;
    item.url = next; this.emit('changed'); return publicSession(item);
  }
  setWebPhoneAllowed(id, allow) {
    const item = this.items.get(id); if (!item?.alive || item.kind !== 'web') throw new Error('Open a preview panel first.');
    if (typeof allow !== 'boolean' || (allow && !item.url)) throw new Error('Enter a local address first.');
    if (allow && !['localhost', '127.0.0.1'].includes(new URL(item.url).hostname)) throw new Error('Use localhost or 127.0.0.1 for phone previews.');
    item.phoneAllowed = allow; this.emit('changed'); return publicSession(item);
  }
  savedConsoles() {
    return [...this.items.values()].filter(x => !x.taskId && !['code', 'web'].includes(x.kind) && (x.alive || x.restoreError) && !x.dismissed && !['login', 'setup', 'review'].includes(x.purpose)).map(x => ({
      slot: x.slot, width: x.width || 1, height: x.height || 1, consoleKey: x.consoleKey || x.id, projectId: x.projectId || null, name: x.name, nameMode: x.nameMode, cwd: x.cwd, provider: x.provider, permissions: x.permissions,
      ...(x.kind === 'code' ? { kind: 'code', codeSourceKey: x.codeSourceKey } : {}),
      ...(x.kind === 'web' ? { kind: 'web', url: x.url, codeSourceKey: x.codeSourceKey } : {}),
      command: x.command || '', model: x.launchModel || '', effort: x.launchEffort ?? null, accountId: cliAgents.has(x.provider) ? x.accountId || defaultId(x.provider) : null, providerSessionId: sessionPolicy(x.provider).persistConversation ? x.providerSessionId : null, claudeTarget: x.claudeTarget,
      ...(x.remote ? { remoteHostId: x.remote.hostId, remoteFolder: x.remote.folder } : {}),
      ...(x.worktree ? { worktree: x.worktree } : {}),
      ...(x.playtimeDataDir ? { playtimeDataDir: x.playtimeDataDir } : {}),
      ...(selectedModel(x) ? { selection: selectedModel(x) } : {})
    })).sort((a, b) => a.slot - b.slot);
  }
  async restore(entry, { recoverAntigravity = false } = {}) {
    if (['code', 'web'].includes(entry.kind) || ['code', 'web'].includes(entry.provider)) return null;
    if (entry.projectId && this.projects && !this.projects.get(entry.projectId)) entry = { ...entry, projectId: null, ...(entry.nameMode === 'project' ? { name: '', nameMode: 'folder' } : {}) };
    // A plain resume does not reapply a model chosen through switchSettings, so
    // the saved selection is passed again. The saved file is validated as untrusted.
    const pin = selectedModel({ ...entry, requestedSettings: entry.selection });
    try {
      if (recoverAntigravity && entry.provider === 'antigravity' && !entry.providerSessionId) entry = { ...entry, providerSessionId: cachedAntigravityConversation(entry.cwd, this.agentHome) };
      const opened = await this.create({ ...entry, permissions: entry.permissions === 'system' ? 'default' : entry.permissions }, { resumeId: entry.providerSessionId, claudeTarget: entry.claudeTarget, accountId: entry.accountId, resumeModel: pin?.model || null });
      const item = pin && this.items.get(opened?.id);
      if (!item) return opened;
      // Launch arguments do not prove the effective model.
      delete item.model; delete item.modelId; delete item.settingsAt;
      item.requestedSettings = { ...pin, effort: item.launchEffort ?? null, at: Date.now(), status: 'awaiting-provider' };
      this.emit('changed');
      return this.list().find(x => x.id === item.id);
    } catch (error) {
      const id = crypto.randomUUID();
      const item = { ...entry, launchModel: entry.model || '', id, alive: false, state: 'error', restoreError: error.message, buffer: `Could not reopen this console.\r\n${error.message}\r\n`, sequence: 0, cols: 110, rows: 30, createdAt: Date.now(), updatedAt: Date.now(), terminal: null };
      if (pin) item.requestedSettings = pin;
      this.items.set(id, item); this.emit('changed');
      return this.list().find(x => x.id === id);
    }
  }
  async retry(id) {
    const item = this.items.get(id);
    if (!item?.restoreError) throw new Error('This console does not need to be reopened.');
    const entry = this.savedConsoles().find(x => x.slot === item.slot);
    this.items.delete(id);
    return this.restore(entry);
  }
  create(raw, options) { return this.createOne(raw, options); }
  createOne(raw, options) { return this.launcher.createOne(raw, options); }
  createLoginConsole(accountId, cwd) { return this.launcher.createLoginConsole(accountId, cwd); }
  createRemote(raw) { return this.launcher.createRemote(raw); }
  createSetupConsole(payload) { return this.getAccountSwitching().createSetupConsole(payload); }

  commitLayout(plan, grid = this.grid) {
    this.onLayout({ plan, grid });
    this.grid = grid;
    for (const placed of plan) if (this.items.has(placed.id)) Object.assign(this.items.get(placed.id), placed);
  }
  setGrid(raw) {
    if (this.starting.size) throw new Error('Wait for the console to open.');
    const { plan, grid } = planGrid(this.layoutItems(), this.grid, raw);
    this.commitLayout(plan, grid); this.emit('changed');
  }

  waitForOutputIdle(...args) { return this.getAccountSwitching().waitForOutputIdle(...args); }
  nativeDraft(...args) { return this.getAccountSwitching().nativeDraft(...args); }
  validateSwitchDraft(...args) { return this.getAccountSwitching().validateSwitchDraft(...args); }
  removeNativeDraftMarker(...args) { return this.getAccountSwitching().removeNativeDraftMarker(...args); }
  captureNativeDraft(...args) { return this.getAccountSwitching().captureNativeDraft(...args); }
  awaitResumeIdentity(...args) { return this.getAccountSwitching().awaitResumeIdentity(...args); }
  confirmCodexResumeIdentity(...args) { return this.getAccountSwitching().confirmCodexResumeIdentity(...args); }
  switchSettings(payload) { return this.getAccountSwitching().switchSettings(payload); }
  switchAccount(payload, settingsSelection) { return this.getAccountSwitching().switchAccount(payload, settingsSelection); }

  write(id, data, { draft = false } = {}) {
    const item = this.items.get(id);
    ordinaryConsole(item);
    if (isPanel(item)) throw new Error(`This is a read-only ${item.kind === 'web' ? 'preview' : item.kind} panel.`);
    if (!item?.alive) return;
    if (item.switching) throw new Error('This console is switching accounts. Your composer draft stays on the phone until switching finishes.');
    if (typeof data !== 'string' || data.length > 65536) throw new Error('Terminal input is too large.');
    if (!sessionPolicy(item.provider).focusReports && (data === '\x1b[I' || data === '\x1b[O')) return;
    if (!draft && data && (!data.startsWith('\x1b') || data.startsWith('\x1b[200~'))) {
      this.ownerInteraction(id, 'typing', { ownerTurn: /[\r\n]/.test(data) || undefined });
    }
    item.terminal.write(data);
    if (!draft && !data.startsWith('\x1b')) item.lastInputAt = Date.now();
    if (!draft && /[\r\n]/.test(data)) this.projects?.touch(item.projectId);
    if (!draft && /[\r\n]/.test(data) && cliAgents.has(item.provider) && !item.remote) { item.state = 'active'; item.updatedAt = Date.now(); this.emit('changed'); }
  }
  ownerInteraction(id, kind, flags = {}) {
    const item = this.items.get(id);
    if (!item || !this.ownerConsoles) return;
    this.ownerConsoles.interaction(item.consoleKey, item.launchId || item.id, kind, { ...flags, trusted: true });
  }
  signal(id, kind) {
    const item = this.items.get(id); if (!item?.alive || !['ready', 'question', 'error'].includes(kind)) return;
    item.state = kind === 'question' ? 'attention' : kind; item.updatedAt = Date.now(); this.emit('changed');
  }
  resize(id, cols, rows) {
    const item = this.items.get(id); if (!item?.alive) return;
    if (item.taskId) return;
    if (isPanel(item)) return;
    cols = Math.max(20, Math.min(500, Math.floor(cols) || 80)); rows = Math.max(5, Math.min(200, Math.floor(rows) || 24));
    if (item.cols === cols && item.rows === rows) return;
    item.cols = cols; item.rows = rows;
    this.emit('resize', { id, cols, rows });
    item.terminal.resize(cols, rows);
  }
  buffer(id) { const item = this.items.get(id); return { data: item?.buffer || '', sequence: item?.sequence || 0, launchId: item?.launchId || null }; }
  refreshContextFile(item) {
    if (isPanel(item)) return;
    if (!this.hub || item.remote) return;
    const names = sessionPolicy(item.provider).instructionFiles;
    let temp;
    try {
      const summary = this.hub.summary({ knowledgeEnabled: this.hub.knowledgeEnabled?.(item.projectId) === true }) + (this.projects?.chatSummary(item) || '') + this.studyContext(item);
      if (this.contexts.get(item.id) === summary) return;
      for (const name of names) {
        const file = path.join(this.root, 'sessions', item.id, name); temp = file + '.tmp';
        fs.writeFileSync(temp, summary, { mode: 0o600 }); fs.renameSync(temp, file);
      }
      this.contexts.set(item.id, summary);
    } catch {
      try { fs.unlinkSync(temp); } catch {}
      this.emit('context-error', 'A chat instruction file could not be refreshed. Use dock_context for the current project.');
    }
  }
  syncProjects() {
    let changed = false;
    for (const item of this.items.values()) {
      if (item.taskId) continue;
      if ((!item.alive && !item.restoreError) || item.dismissed) continue;
      if (item.projectId && this.projects && !this.projects.get(item.projectId)) { item.projectId = null; if (item.nameMode === 'project') item.nameMode = 'folder'; changed = true; }
      const name = item.nameMode === 'project' ? this.projects?.get(item.projectId)?.name : item.nameMode === 'folder' ? path.basename(item.cwd) : item.name;
      if (name && name !== item.name) { item.name = name; this.emit('name-changed', item); changed = true; }
      if (item.alive) this.refreshContextFile(item);
    }
    if (changed) this.emit('changed');
  }
  rename(id, name) {
    const item = this.items.get(id);
    ordinaryConsole(item);
    if (!item || (!item.alive && !item.restoreError)) throw new Error('This console is no longer open.');
    item.nameMode = name ? 'custom' : item.projectId ? 'project' : 'folder';
    item.name = name || this.projects?.get(item.projectId)?.name || path.basename(item.cwd) || `Console ${item.slot}`;
    if (item.alive) this.refreshContextFile(item);
    this.emit('name-changed', item);
    this.emit('changed');
  }
  assignProject(id, projectId, { useProjectName } = {}) {
    const item = this.items.get(id);
    ordinaryConsole(item);
    if (!item || (!item.alive && !item.restoreError) || item.dismissed) throw new Error('This console is no longer open.');
    if (projectId !== null && (typeof projectId !== 'string' || !this.projects?.get(projectId))) throw new Error('Choose an existing project.');
    if (useProjectName != null && typeof useProjectName !== 'boolean') throw new Error('Choose whether to use the project name.');
    item.projectId = projectId;
    if (projectId) item.nameMode = useProjectName === true || (useProjectName == null && item.nameMode !== 'custom') ? 'project' : 'custom';
    else if (item.nameMode === 'project') item.nameMode = 'folder';
    this.syncProjects();
    this.projects?.touch(projectId);
    this.emit('changed');
    return this.list().find(x => x.id === id);
  }
  move(id, slot, beforeMove = () => {}) {
    const item = this.items.get(id);
    if (!item || (!item.alive && !item.restoreError)) throw new Error('This console is no longer open.');
    if (!Number.isInteger(slot) || slot < 1 || slot > this.grid.columns * this.grid.rows) throw new Error('Choose a slot inside the console grid.');
    return this.layout({ id, slot }, beforeMove);
  }
  previewLayout(change) { return planLayout(this.layoutItems(), change, this.grid); }
  layout(change, beforeMove = () => {}) {
    if (this.starting.size) throw new Error('Wait for the new console to open before moving panels.');
    const plan = this.previewLayout(change);
    beforeMove(plan);
    for (const placed of plan) Object.assign(this.items.get(placed.id), placed);
    for (const [id, old] of this.items) if (!old.alive && !old.restoreError && plan.some(x => x.slot === old.slot)) this.items.delete(id);
    this.emit('changed');
  }
  acknowledge(id) { const item = this.items.get(id); if (item && ['ready', 'attention'].includes(item.state)) { item.state = 'open'; this.emit('changed'); } }
  cancelPendingStages(id) {
    for (const [launchId, session] of this.pendingStages) {
      if (session.id !== id) continue;
      this.pendingStages.delete(launchId);
      this.hub?.revoke(id, launchId); this.draftBridge?.unregister(id, launchId);
      try { session.terminal.kill(); } catch {}
    }
  }
  end(id) {
    const item = this.items.get(id); if (!item) return;
    ordinaryConsole(item);
    if (isPanel(item)) { this.items.delete(id); this.emit('changed'); return; }
    if (item.remote) return this.ssh.end(item.remote).then(() => {
      item.dismissed = true;
      if (item.alive) item.terminal.kill(); else this.items.delete(id);
      this.emit('changed');
    }).catch(() => { throw new Error('Could not end the remote job. It may still be running. Reconnect and exit it in the terminal.'); });
    item.dismissed = true; delete item.restoreError;
    this.cancelPendingStages(id);
    if (item.alive) item.terminal.kill();
    else this.items.delete(id);
    this.emit('changed');
  }
  scanEvents() { this.eventRuntime.scanEvents(); }
  updateUsage(recent) { this.eventRuntime.updateUsage(recent); }
  async stop() {
    this.stopping = true;
    this.projects?.off('changed', this.refreshProjectContext);
    this.hub?.off?.('context-changed', this.refreshProjectContext);
    const active = [...this.items.values()].filter(x => x.alive && !x.taskId && !isPanel(x));
    const staged = [...this.pendingStages.values()];
    for (const item of staged) {
      this.pendingStages.delete(item.launchId);
      this.hub?.revoke(item.id, item.launchId); this.draftBridge?.unregister(item.id, item.launchId);
      try { item.terminal.kill(); } catch {}
    }
    if (!active.length && !staged.length) return;
    await new Promise(resolve => {
      const finish = () => { clearTimeout(timeout); this.off('changed', check); resolve(); };
      const check = () => { if ([...active, ...staged].every(x => !x.alive)) finish(); };
      const timeout = setTimeout(finish, 5000);
      this.on('changed', check);
      for (const item of active) { try { item.terminal.kill(); } catch {} }
      check();
    });
  }
}
module.exports = { Sessions, psQuote, validateConsoleDefaults };
