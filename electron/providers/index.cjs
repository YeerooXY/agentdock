'use strict';
// One adapter file per provider. This module validates them and derives the
// CLI catalog, the account capability table and the usage source table, so the
// facts live in one place. Adapters are data only; usage readers are wired in
// usage-readers.cjs and must match the `usage.reader` references declared here.
const ORDER = ['codex', 'claude', 'antigravity', 'copilot', 'opencode', 'cursor', 'grok', 'kiro', 'qwen', 'kimi', 'cline', 'droid', 'pi', 'gemini', 'strata'];
const METHODS = ['native-rpc', 'native-command', 'screen', 'documented-api', 'undocumented-api', 'local'];
const UNSUPPORTED_STATES = ['no-reader', 'no-source', 'no-quota'];
const NO_PROFILE_REASON = 'Separate sign-in storage has not been verified for this provider.';

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
  only(adapter, ['id', 'catalog', 'launch', 'accounts', 'usage'], id, 'top-level');
  const { catalog, launch, accounts, usage } = adapter;
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
    only(accounts, ['isolation', 'login', 'models', 'resume'], id, 'accounts');
    check(plain(accounts.isolation) && text(accounts.isolation.env) && text(accounts.isolation.defaultSubdir), id, 'isolation needs env and defaultSubdir');
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
  const adapters = ORDER.map(id => validate(loader(id), id));
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

function deriveCapabilities(adapters) {
  return Object.fromEntries(adapters.filter(adapter => adapter.catalog).map(adapter => {
    const { accounts, usage } = adapter, profiles = accounts !== null;
    return [adapter.id, deepFreeze(copy({
      id: adapter.id, name: adapter.catalog.name, namedProfiles: profiles,
      isolation: profiles ? accounts.isolation : null, login: profiles ? accounts.login : null,
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
      isolated: accounts !== null,
      method: usage.method || null, precision: usage.precision || null, source: usage.source || null, nativeHint: usage.nativeHint || null, accountIds: [...(usage.accountIds || [])] });
  }
  return deepFreeze(sources);
}

const adapters = load();
const catalog = deriveCatalog(adapters);
const capabilities = deriveCapabilities(adapters);
const usageSources = deriveUsageSources(adapters);
const usageProviders = Object.values(usageSources).filter(source => source.reader).map(source => source.provider);
const byId = id => adapters.find(adapter => adapter.id === id) || null;
const usageSource = id => typeof id === 'string' && Object.hasOwn(usageSources, id) ? usageSources[id] : null;
// A fixed account (such as Strata's local route) can have its own usage state.
const sourceForAccount = account => Object.values(usageSources).find(source => source.accountIds.includes(account?.id)) || usageSource(account?.provider);

module.exports = { adapters, catalog, capabilities, usageSources, usageProviders, byId, usageSource, sourceForAccount, validate, load, deriveCatalog, deriveCapabilities, deriveUsageSources, NO_PROFILE_REASON };
