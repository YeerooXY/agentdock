// The full desktop snapshot rebuilt from state slices. One copy, shared by the
// main process (legacy dock:state fallback and /v1 phones, through require) and
// the renderer (protocol 2 client, through import), so the two cannot drift.
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const items = value => isObject(value) && Array.isArray(value.order) ? value.order.map(id => value.byId[id]) : [];
// The legacy shape of a status that carries a code: the store's one-way
// codeRef removed, the separately fetched code (if any) restored.
function withCode(value, code) {
  if (!value || typeof value !== 'object') return value;
  const { codeRef, ...rest } = value;
  return code !== undefined ? { ...rest, code } : rest;
}
export function snapshotFromSlices(state, ephemeral = {}) {
  const shell = state.shell || {}, usage = state.usage || {}, history = state.usageHistory || {}, tools = state.tools || {}, images = state.imageJobs;
  const list = slice => items(state[slice]);
  let mobile = state.mobileStatus ?? undefined;
  if (mobile?.pendingPairing) mobile = { ...mobile, pendingPairing: withCode(mobile.pendingPairing, ephemeral.pairingCode) };
  const meshyAuth = withCode(images?.meshyAuth, ephemeral.meshyCode);
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
