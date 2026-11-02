'use strict';
// Allowlisted views of the store. The desktop and the phone each get their own
// revisions, so a change the phone cannot see never advances the phone cursor.
// Also holds the legacy adapter that rebuilds today's full desktop snapshot.
const { EventEmitter } = require('node:events');
const { SLICES, SLICE_NAMES, PHONE_SLICES, toCollection, fromCollection, emptyCollection, assertNoSecrets } = require('./state-protocol.cjs');
const { freezeJson, jsonEqual, collectionChange } = require('./state-store.cjs');

const pick = (source, fields) => {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const field of fields) if (source[field] !== undefined) out[field] = source[field];
  return out;
};
const text = value => typeof value === 'string' ? value : null;
const mapCollection = (value, build, keep = () => true) => {
  const list = fromCollection(value).filter(keep).map(build);
  return toCollection(list);
};

// Phone DTOs. Field lists are the contract with mobile/lib (see fixtures/state/dto).
function phoneSession(item) {
  const worktree = item.worktree && typeof item.worktree.branch === 'string' && typeof item.worktree.path === 'string' ? { worktree: { branch: item.worktree.branch, path: item.worktree.path } } : {};
  return {
    id: item.id, slot: item.slot ?? null, name: item.name || '', provider: item.provider || '', alive: !!item.alive, state: item.state || null,
    cols: item.cols ?? null, rows: item.rows ?? null, consoleKey: item.consoleKey || null, projectId: item.projectId || null,
    remote: item.remote ? pick(item.remote, ['hostId', 'name', 'label', 'host']) : null,
    updatedAt: item.updatedAt ?? null, providerSessionId: item.providerSessionId || null,
    model: item.modelId || item.model || null, modelName: item.model || null, effort: item.effort || null, settingsAt: item.settingsAt || null,
    launchId: item.launchId || null, accountId: item.accountId || null, accountLabel: item.accountLabel || null,
    switchTargets: (item.switchTargets || []).map(target => pick(target, ['id', 'label', 'ready'])),
    switching: !!item.switching, purpose: item.purpose || 'agent', taskId: item.taskId || null, sliceId: item.sliceId || null,
    steeringState: item.steeringState || null, steeringSupported: item.steeringSupported === true,
    consoleCapabilities: item.consoleCapabilities || null, draftSupported: item.draftSupported === true,
    switchOffer: item.switchOffer ? pick(item.switchOffer, ['key', 'targetAccountId', 'targetLabel', 'usedPercent', 'minutes', 'resetsAt']) : null,
    ...worktree,
  };
}
const assignment = value => value ? pick(value, ['accountId', 'provider', 'label', 'model', 'effort']) : null;
function phoneTask(job) {
  return {
    id: job.id, parentId: job.parentId || null, projectId: job.projectId || null, title: text(job.title) || '', state: job.state || null,
    workflow: job.workflow || null, split: job.split === true, startedAt: job.startedAt ?? null, finishedAt: job.finishedAt ?? null,
    round: Array.isArray(job.rounds) ? job.rounds.length : 0, maxRounds: job.maxRounds ?? null,
    implementer: assignment(job.implementer), reviewer: assignment(job.reviewer),
    error: text(job.error) || '', resultId: job.resultId || null, unresolved: Array.isArray(job.unresolved) ? job.unresolved.length : 0,
  };
}
function phoneProject(project) {
  return { id: project.id, name: project.name || '', color: project.color || null, status: project.status || 'active',
    progress: project.progress ? pick(project.progress, ['done', 'total']) : null, lastActiveAt: project.lastActiveAt ?? project.createdAt ?? null };
}
const windowFields = ['key', 'label', 'minutes', 'usedPercent', 'remaining', 'resetsAt', 'resetLabel', 'modelGroup', 'unit'];
function phoneUsageAccounts(usage) {
  const accounts = Array.isArray(usage?.usageAccounts) ? usage.usageAccounts : [], checks = Array.isArray(usage?.usageChecks) ? usage.usageChecks : [];
  const limits = Array.isArray(usage?.limits) ? usage.limits : [];
  return toCollection(accounts.map(account => {
    const check = checks.find(item => item.accountId === account.id);
    const rows = limits.filter(row => (row.accountId || `${row.provider}:default`) === account.id);
    return {
      id: account.id, provider: account.provider || '', label: account.label || '', hasUsage: !!account.hasUsage, inUse: !!account.inUse,
      check: check ? { status: check.status || 'unchecked', observedAt: check.observedAt ?? null, message: text(check.message) || '' } : null,
      windows: rows.flatMap(row => (row.windows || []).map(window => ({ ...pick(window, windowFields), observedAt: row.observedAt ?? null }))),
    };
  }));
}
const phonePrompt = item => pick(item, ['id', 'name', 'text', 'projectId', 'createdAt', 'updatedAt']);

// slice -> { deps, build(state) }. A projection slice is rebuilt only when one
// of its dependencies changed in a store commit.
const PHONE = Object.freeze({
  shell: { ...PHONE_SLICES.shell, build: state => ({ capacity: (state.shell?.grid?.columns || 3) * (state.shell?.grid?.rows || 3), version: state.shell?.version || null }) },
  sessions: { ...PHONE_SLICES.sessions, build: state => mapCollection(state.sessions, phoneSession, item => !item.dismissed) },
  queues: { ...PHONE_SLICES.queues, build: state => {
    const out = {};
    for (const [id, queue] of Object.entries(state.queues || {})) out[id] = { paused: !!queue?.paused, entries: (queue?.entries || []).map(entry => pick(entry, ['id', 'text', 'at', 'state', 'error'])) };
    return out;
  } },
  prompts: { ...PHONE_SLICES.prompts, build: state => mapCollection(state.prompts, phonePrompt) },
  projects: { ...PHONE_SLICES.projects, build: state => mapCollection(state.projects, phoneProject, item => item.status !== 'archived') },
  tasks: { ...PHONE_SLICES.tasks, build: state => mapCollection(state.tasks, phoneTask) },
  usage: { ...PHONE_SLICES.usage, build: state => phoneUsageAccounts(state.usage) },
  results: { ...PHONE_SLICES.results, build: state => ({ unread: state.results?.meta?.unread ?? 0, count: state.results?.order?.length || 0 }) },
});
// The desktop sees every slice; secret-named fields never reach the store.
const DESKTOP = Object.freeze(Object.fromEntries(SLICE_NAMES.map(slice => [slice, { kind: SLICES[slice].kind, deps: [slice], build: state => state[slice] }])));

class Projection extends EventEmitter {
  constructor(store, name, definitions) {
    super();
    this.store = store; this.name = name; this.definitions = definitions; this.epoch = store.epoch; this.batch = 0;
    this.values = {}; this.revs = {};
    const state = store.state();
    for (const [slice, definition] of Object.entries(definitions)) { this.values[slice] = this.build(slice, definition, state); this.revs[slice] = 0; }
    this.unsubscribe = store.subscribe(batch => this.update(batch));
  }
  build(slice, definition, state) {
    const value = freezeJson(definition.build(state) ?? (definition.kind === 'collection' ? emptyCollection() : null), `${this.name}.${slice}`);
    assertNoSecrets(value, `${this.name}.${slice}`);
    return value;
  }
  update(batch) {
    const touched = new Set(batch.changes.map(change => change.slice)), state = this.store.state(), changes = [];
    for (const [slice, definition] of Object.entries(this.definitions)) {
      if (!definition.deps.some(dep => touched.has(dep))) continue;
      const before = this.values[slice], after = this.build(slice, definition, state);
      if (jsonEqual(before, after)) continue;
      const baseRev = this.revs[slice], rev = baseRev + 1;
      changes.push(definition.kind === 'collection' ? collectionChange(slice, before, after, baseRev, rev) : { kind: 'replace', slice, baseRev, rev, value: after });
      this.values[slice] = after; this.revs[slice] = rev;
    }
    if (!changes.length) return;
    this.emit('commit', Object.freeze({ epoch: this.epoch, batch: ++this.batch, changes: Object.freeze(changes), revs: Object.freeze({ ...this.revs }) }));
  }
  get(slice) { return this.values[slice]; }
  state() { return { ...this.values }; }
  cursor() { return { epoch: this.epoch, revs: { ...this.revs } }; }
  subscribe(listener) { this.on('commit', listener); return () => this.off('commit', listener); }
  reset(slices = Object.keys(this.definitions)) { return slices.map(slice => ({ kind: 'reset', slice, rev: this.revs[slice], value: this.values[slice] })); }
  dispose() { this.unsubscribe(); this.removeAllListeners(); }
}
const desktopProjection = store => new Projection(store, 'desktop', DESKTOP);
const phoneProjection = store => new Projection(store, 'phone', PHONE);

// ---- Legacy adapter -------------------------------------------------------
// Today's desktop snapshot is split into slice values (grouped by writer) and
// rebuilt from the store. Display codes that must not enter a slice travel in
// `ephemeral`, read live from their service, and are merged back here only.
function withoutCode(value) {
  if (!value || typeof value !== 'object' || !('code' in value)) return value;
  const { code, ...rest } = value; return rest;
}
function ephemeralFromLegacy(raw) {
  return { pairingCode: raw?.mobile?.pendingPairing?.code ?? undefined, meshyCode: raw?.workbench?.meshyAuth?.code ?? undefined };
}
// A slice that cannot be built is reported and left out; the store keeps its
// previous value.
function slicesFromLegacy(raw, onError = (slice, error) => { throw error; }) {
  const workbench = raw.workbench || {};
  const mobile = raw.mobile && raw.mobile.pendingPairing ? { ...raw.mobile, pendingPairing: withoutCode(raw.mobile.pendingPairing) } : raw.mobile;
  const builders = {
    shell: () => ({ platform: raw.platform, mode: raw.mode, transitioning: raw.transitioning, trayHidden: raw.trayHidden, grid: raw.grid,
      storageError: raw.storageError, workspaceError: raw.workspaceError, shortcutAvailable: raw.shortcutAvailable, safeMode: raw.safeMode,
      startupNotices: raw.startupNotices, defaultFolder: raw.defaultFolder, version: raw.version, capabilities: raw.capabilities }),
    preferences: () => (raw.settings),
    sessions: () => (toCollection(raw.sessions || [])),
    panels: () => (toCollection(raw.codePanels || [], { meta: { codeRevision: raw.codeRevision } })),
    queues: () => (raw.queues),
    prompts: () => (toCollection(raw.prompts || [])),
    tasks: () => (toCollection(raw.tasks || [])),
    delegations: () => (toCollection(raw.delegations || [])),
    projects: () => (toCollection(raw.projects || [])),
    projectProposals: () => (toCollection(raw.projectProposals || [])),
    accounts: () => (toCollection(raw.accounts || [], { meta: { providers: raw.accountProviders } })),
    agents: () => (toCollection(raw.agents || [], { meta: { setupBusy: raw.agentSetupBusy } })),
    skills: () => (toCollection(raw.skills?.packs || [], { meta: { busy: raw.skills?.busy } })),
    usage: () => ({ limits: raw.limits, usageAccounts: raw.usageAccounts, usageChecks: raw.usageChecks, refreshing: raw.refreshing, lastRefresh: raw.lastRefresh, accountError: raw.accountError }),
    usageHistory: () => ({ recent: raw.recent, messages: raw.messages, ledger: raw.ledger, summary: raw.summary }),
    results: () => (toCollection(workbench.results || [], { meta: { unread: workbench.unreadResults } })),
    imageJobs: () => (raw.workbench ? { concepts: workbench.concepts, conceptUsage: workbench.conceptUsage, meshyAuth: withoutCode(workbench.meshyAuth) } : null),
    setupRequests: () => (toCollection(workbench.setupRequests || [])),
    tools: () => ({ shared: raw.shared, integrations: raw.integrations, toolCatalog: raw.toolCatalog, toolLimits: raw.toolLimits }),
    keyMetadata: () => (raw.vault),
    sshHosts: () => (toCollection(raw.sshHosts || [])),
    mobileStatus: () => (mobile ?? null),
    updates: () => (raw.updates ?? null),
    screenshots: () => (raw.screenshot ?? null),
  };
  const values = {};
  for (const [slice, build] of Object.entries(builders)) {
    try { values[slice] = build(); } catch (error) { onError(slice, error); }
  }
  return values;
}
function legacySnapshot(state, ephemeral = {}) {
  const shell = state.shell || {}, usage = state.usage || {}, history = state.usageHistory || {}, tools = state.tools || {}, images = state.imageJobs;
  const list = slice => fromCollection(state[slice]);
  let mobile = state.mobileStatus ?? undefined;
  if (mobile?.pendingPairing && ephemeral.pairingCode !== undefined) mobile = { ...mobile, pendingPairing: { ...mobile.pendingPairing, code: ephemeral.pairingCode } };
  const meshyAuth = images?.meshyAuth && ephemeral.meshyCode !== undefined ? { ...images.meshyAuth, code: ephemeral.meshyCode } : images?.meshyAuth;
  return {
    platform: shell.platform, mode: shell.mode, transitioning: shell.transitioning, trayHidden: shell.trayHidden,
    sessions: list('sessions'), codePanels: list('panels'), queues: state.queues ?? {}, prompts: list('prompts'), codeRevision: state.panels?.meta?.codeRevision ?? 0,
    limits: usage.limits ?? [], accounts: list('accounts'), accountProviders: state.accounts?.meta?.providers ?? [],
    recent: history.recent ?? [], accountError: usage.accountError ?? null, refreshing: usage.refreshing ?? false, lastRefresh: usage.lastRefresh ?? 0,
    agents: list('agents'), agentSetupBusy: !!state.agents?.meta?.setupBusy, skills: { packs: list('skills'), busy: !!state.skills?.meta?.busy },
    usageAccounts: usage.usageAccounts ?? [], usageChecks: usage.usageChecks ?? [], delegations: list('delegations'), tasks: list('tasks'),
    sshHosts: list('sshHosts'), capabilities: shell.capabilities, projects: list('projects'), projectProposals: list('projectProposals'),
    messages: history.messages ?? [], mobile,
    workbench: images ? { results: list('results'), unreadResults: state.results?.meta?.unread, concepts: images.concepts, conceptUsage: images.conceptUsage, meshyAuth, setupRequests: list('setupRequests') } : undefined,
    vault: state.keyMetadata ?? undefined,
    ledger: history.ledger ?? [], summary: history.summary, shared: tools.shared ?? undefined, updates: state.updates ?? undefined, grid: shell.grid,
    settings: state.preferences ?? undefined, storageError: shell.storageError, workspaceError: shell.workspaceError, shortcutAvailable: shell.shortcutAvailable,
    safeMode: shell.safeMode, startupNotices: shell.startupNotices,
    integrations: tools.integrations ?? undefined, toolCatalog: tools.toolCatalog ?? [], toolLimits: tools.toolLimits ?? {},
    defaultFolder: shell.defaultFolder, version: shell.version, screenshot: state.screenshots ?? null,
  };
}

module.exports = { PHONE, DESKTOP, Projection, desktopProjection, phoneProjection, phoneSession, phoneTask, phoneProject, phoneUsageAccounts,
  slicesFromLegacy, legacySnapshot, ephemeralFromLegacy };
