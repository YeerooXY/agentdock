'use strict';
// One adapter file per provider. This module validates them and derives the
// CLI catalog, the account capability table and the usage source table, so the
// facts live in one place. Adapters are data only; behavior is selected by
// validated strategy references. Usage readers are wired in
// usage-readers.cjs and must match the `usage.reader` references declared here.
const ORDER = ['codex', 'claude', 'antigravity', 'copilot', 'opencode', 'cursor', 'grok', 'kiro', 'qwen', 'kimi', 'cline', 'droid', 'pi', 'strata'];
const { SETTINGS_STRATEGIES } = require('./strategies/index.cjs');
const { deriveScreenProfiles, screenProblem } = require('./screen-profiles.cjs');
const METHODS = ['native-rpc', 'native-command', 'screen', 'documented-api', 'undocumented-api', 'local'];
const UNSUPPORTED_STATES = ['no-reader', 'no-source', 'no-quota'];
const NO_PROFILE_REASON = 'Separate sign-in storage has not been verified for this provider.';
const SESSION_DEFAULTS = Object.freeze({ identityEvents: 'none', persistConversation: false, recentUsageDefaultOnly: false, focusReports: true, steering: false, instructionFiles: Object.freeze(['PADDOCK.md']) });
const CONSOLE_DEFAULTS = Object.freeze({ modelChoices: false, mobileModelChoices: false, liveModelMenu: false, permissions: false });

function check(condition, id, message) { if (!condition) throw new Error(`Provider adapter "${id}": ${message}`); }
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const strings = value => Array.isArray(value) && value.every(text);
function only(object, allowed, id, where) {
  for (const key of Object.keys(object)) check(allowed.includes(key), id, `unknown ${where} field "${key}"`);
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.keys(value)) deepFreeze(value[key]); }
  return value;
}
const copy = value => JSON.parse(JSON.stringify(value));

function validate(adapter, file) {
  const id = adapter?.id;
  check(typeof id === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(id), file, 'id must be a lowercase provider name');
  check(id === file, id, `file name must match id (${file})`);
  only(adapter, ['id', 'catalog', 'launch', 'accounts', 'usage', 'settings', 'session', 'screen', 'console'], id, 'top-level');
  const { catalog, launch, accounts, usage } = adapter;
  if (adapter.screen !== undefined) {
    const problem = screenProblem(adapter.screen);
    check(!problem, id, problem);
    check(adapter.catalog !== null, id, 'screen needs a CLI');
  }
  check(plain(adapter.settings), id, 'settings must be an object');
  only(adapter.settings, ['strategy', 'resumeFlag'], id, 'settings');
  check(SETTINGS_STRATEGIES.includes(adapter.settings.strategy), id, 'unknown settings strategy');
  check(adapter.settings.resumeFlag === undefined || (adapter.settings.strategy === 'cli' && text(adapter.settings.resumeFlag) && /^--[a-z][a-z-]*$/.test(adapter.settings.resumeFlag)), id, 'resumeFlag needs a CLI strategy and a long flag');
  if (adapter.session !== undefined) {
    check(plain(adapter.session), id, 'session must be an object');
    only(adapter.session, Object.keys(SESSION_DEFAULTS), id, 'session');
    const policy = { ...SESSION_DEFAULTS, ...adapter.session };
    check(['none', 'uuid', 'tagged-uuid'].includes(policy.identityEvents), id, 'unknown identity event policy');
    check(typeof policy.persistConversation === 'boolean' && typeof policy.recentUsageDefaultOnly === 'boolean' && typeof policy.focusReports === 'boolean' && typeof policy.steering === 'boolean', id, 'session flags must be booleans');
    check(strings(policy.instructionFiles) && policy.instructionFiles.length > 0 && policy.instructionFiles.length <= 8 && new Set(policy.instructionFiles).size === policy.instructionFiles.length && policy.instructionFiles.every(name => /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/.test(name) && name !== '.' && name !== '..'), id, 'instruction files must be distinct basenames');
  }
  if (adapter.console !== undefined) {
    check(plain(adapter.console), id, 'console must be an object');
    only(adapter.console, Object.keys(CONSOLE_DEFAULTS), id, 'console');
    for (const [key, value] of Object.entries(adapter.console)) check(typeof value === 'boolean', id, `console.${key} must be a boolean`);
    check(adapter.console.mobileModelChoices !== true || adapter.console.modelChoices === true, id, 'mobile model choices need model choices');
    check(adapter.console.modelChoices !== true || catalog !== null, id, 'model choices need a CLI');
  }
  if (catalog !== null) {
    check(plain(catalog), id, 'catalog must be an object or null');
    only(catalog, ['name', 'command', 'aliases', 'install', 'docs', 'auth', 'native', 'windowsBuild'], id, 'catalog');
    check(text(catalog.name) && text(catalog.command) && text(catalog.docs) && text(catalog.auth), id, 'catalog needs name, command, docs and auth');
    check(catalog.aliases === undefined || strings(catalog.aliases), id, 'aliases must be strings');
    check(plain(catalog.install), id, 'catalog.install must be an object');
    only(catalog.install, ['script', 'shScript', 'installArgs', 'npm', 'ignoreScripts'], id, 'install');
    check(text(catalog.install.script) || text(catalog.install.npm), id, 'install needs a script or npm package');
    check(catalog.install.installArgs === undefined || strings(catalog.install.installArgs), id, 'installArgs must be strings');
    check(catalog.windowsBuild === undefined || Number.isInteger(catalog.windowsBuild), id, 'windowsBuild must be an integer');
  }
  check(plain(launch), id, 'launch must be an object');
  only(launch, ['args', 'modelFlag', 'unrestricted', 'mcp'], id, 'launch');
  for (const key of ['args', 'unrestricted']) check(launch[key] === undefined || strings(launch[key]), id, `launch.${key} must be strings`);
  for (const key of ['modelFlag', 'mcp']) check(launch[key] === undefined || text(launch[key]), id, `launch.${key} must be text`);
  check(catalog !== null || Object.keys(launch).length === 0, id, 'a provider without a CLI has no launch settings');
  if (accounts !== null) {
    check(plain(accounts), id, 'accounts must be an object or null');
    check(catalog !== null, id, 'accounts need a CLI');
    only(accounts, ['isolation', 'switch', 'login', 'models', 'resume'], id, 'accounts');
    // An account is separated either by its own folder (isolation) or by
    // switching one fixed system credential (switch), never both.
    check((accounts.isolation === undefined) !== (accounts.switch === undefined), id, 'accounts need isolation or switch');
    if (accounts.isolation !== undefined) check(plain(accounts.isolation) && text(accounts.isolation.env) && text(accounts.isolation.defaultSubdir), id, 'isolation needs env and defaultSubdir');
    else check(plain(accounts.switch) && text(accounts.switch.target), id, 'switch needs a credential target');
    check(plain(accounts.login) && Array.isArray(accounts.login.args), id, 'login needs args');
    check(typeof accounts.models === 'boolean' && typeof accounts.resume === 'boolean', id, 'models and resume must be booleans');
  }
  check(plain(usage), id, 'usage must be an object');
  only(usage, ['reader', 'method', 'precision', 'source', 'nativeHint', 'state', 'accountIds'], id, 'usage');
  check(usage.nativeHint === undefined || text(usage.nativeHint), id, 'nativeHint must be text');
  if (usage.reader !== null) {
    check(usage.reader === id, id, 'usage.reader must reference this provider');
    check(METHODS.includes(usage.method) && ['exact', 'rounded'].includes(usage.precision) && text(usage.source), id, 'a reader needs method, precision and source');
    check(usage.state === undefined, id, 'a provider with a reader has no unsupported state');
  } else {
    check(UNSUPPORTED_STATES.includes(usage.state), id, 'a provider without a reader needs a usage state');
    check(usage.method === undefined && usage.precision === undefined && usage.source === undefined, id, 'method, precision and source belong to a reader');
  }
  check(usage.accountIds === undefined || (usage.state === 'no-quota' && strings(usage.accountIds)), id, 'accountIds apply only to no-quota providers');
  return adapter;
}

function load(loader = id => require(`./${id}.cjs`)) {
  const adapters = ORDER.map(id => deepFreeze(validate(loader(id), id)));
  const claimed = new Map();
  for (const adapter of adapters) for (const accountId of adapter.usage.accountIds || []) {
    check(!claimed.has(accountId), adapter.id, `account ${accountId} is already claimed by ${claimed.get(accountId)}`);
    claimed.set(accountId, adapter.id);
  }
  return adapters;
}

function deriveCatalog(adapters) {
  return adapters.filter(adapter => adapter.catalog).map(({ id, catalog, launch }) => {
    const entry = { id, name: catalog.name, command: catalog.command };
    if (catalog.aliases) entry.aliases = [...catalog.aliases];
    Object.assign(entry, copy(catalog.install));
    entry.docs = catalog.docs; entry.auth = catalog.auth;
    if (launch.args) entry.args = [...launch.args];
    if (launch.modelFlag) entry.model = launch.modelFlag;
    if (launch.mcp) entry.mcp = launch.mcp;
    if (catalog.native) entry.native = true;
    if (catalog.windowsBuild) entry.windowsBuild = catalog.windowsBuild;
    if (launch.unrestricted) entry.unrestricted = [...launch.unrestricted];
    return entry;
  });
}

function deriveConsoleFeatures(adapters) {
  return new Map(adapters.filter(adapter => adapter.catalog).map(adapter => {
    const console = { ...CONSOLE_DEFAULTS, ...adapter.console };
    const { launch } = adapter;
    return [adapter.id, deepFreeze({
      model: console.modelChoices || !!launch.modelFlag,
      modelChoices: console.modelChoices,
      mobileModelChoices: console.mobileModelChoices,
      liveModelMenu: console.liveModelMenu,
      permissions: console.permissions || !!launch.unrestricted?.length
    })];
  }));
}

function deriveCapabilities(adapters) {
  return Object.fromEntries(adapters.filter(adapter => adapter.catalog).map(adapter => {
    const { accounts, usage } = adapter, profiles = accounts !== null;
    return [adapter.id, deepFreeze(copy({
      id: adapter.id, name: adapter.catalog.name, namedProfiles: profiles,
      isolation: profiles ? accounts.isolation || null : null, ...(accounts?.switch ? { switch: accounts.switch } : {}), login: profiles ? accounts.login : null,
      // The usage flag follows the reader reference, never a second list.
      usage: usage.reader !== null, models: profiles ? accounts.models : false, resume: profiles ? accounts.resume : false,
      reason: profiles ? '' : NO_PROFILE_REASON
    }))];
  }));
}

// Where each provider's usage comes from, including providers that have none.
function deriveUsageSources(adapters) {
  const sources = {};
  for (const { id, usage, accounts } of adapters) {
    sources[id] = deepFreeze({ provider: id, reader: usage.reader !== null, state: usage.reader !== null ? 'reader' : usage.state,
      // Extra accounts are only safe once the CLI's separate sign-in storage is verified.
      isolated: accounts !== null, ...(accounts?.switch ? { switched: true } : {}),
      method: usage.method || null, precision: usage.precision || null, source: usage.source || null, nativeHint: usage.nativeHint || null, accountIds: [...(usage.accountIds || [])] });
  }
  return deepFreeze(sources);
}

const adapters = load();
const consoleFeatureMap = deriveConsoleFeatures(adapters);
const consoleFeatures = deepFreeze(Object.fromEntries(consoleFeatureMap));
const NO_CONSOLE_FEATURES = deepFreeze({ model: false, modelChoices: false, mobileModelChoices: false, liveModelMenu: false, permissions: false });
const consoleFeaturesFor = id => consoleFeatureMap.get(id) || NO_CONSOLE_FEATURES;
const catalog = deriveCatalog(adapters);
const capabilities = deriveCapabilities(adapters);
const usageSources = deriveUsageSources(adapters);
const usageProviders = Object.values(usageSources).filter(source => source.reader).map(source => source.provider);
const screenProfiles = deepFreeze(deriveScreenProfiles(adapters));
const byId = id => adapters.find(adapter => adapter.id === id) || null;
const sessionPolicies = new Map(adapters.map(adapter => [adapter.id, deepFreeze({ ...SESSION_DEFAULTS, ...adapter.session })]));
const sessionPolicy = id => sessionPolicies.get(id) || SESSION_DEFAULTS;
const usageSource = id => typeof id === 'string' && Object.hasOwn(usageSources, id) ? usageSources[id] : null;
// A fixed account (such as Strata's local route) can have its own usage state.
const sourceForAccount = account => Object.values(usageSources).find(source => source.accountIds.includes(account?.id)) || usageSource(account?.provider);

module.exports = { ids: Object.freeze([...ORDER]), adapters, catalog, capabilities, consoleFeatures, consoleFeaturesFor, usageSources, usageProviders, screenProfiles, byId, usageSource, sourceForAccount, validate, load, deriveCatalog, deriveCapabilities, deriveUsageSources, deriveScreenProfiles, sessionPolicy, NO_PROFILE_REASON };
