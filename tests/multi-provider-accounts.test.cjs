'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { AccountProfiles } = require('../electron/account-profiles.cjs');
const { Sessions } = require('../electron/sessions.cjs');

function fixture(t, options = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-provider-profiles-')));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  const accounts = new AccountProfiles(root, { home, env: {}, ...options });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, home, accounts };
}
test('Gemini profiles isolate native home, MCP configuration and token storage independently of usage', t => {
  const { accounts, home } = fixture(t);
  const one = accounts.create('gemini', 'Work'), two = accounts.create('gemini', 'Personal');
  const env = accounts.environment(one.id, 'gemini', { baseEnv: {
    GEMINI_CLI_HOME: home, GEMINI_API_KEY: 'DO_NOT_INHERIT', GOOGLE_APPLICATION_CREDENTIALS: '/shared.json',
    GEMINI_FORCE_FILE_STORAGE: 'false', GEMINI_FORCE_ENCRYPTED_FILE_STORAGE: 'false', OTHER: 'keep'
  } });
  assert.notEqual(one.configDir, two.configDir);
  assert.equal(path.join(env.GEMINI_CLI_HOME, '.gemini'), one.configDir);
  assert.equal(env.GEMINI_API_KEY, undefined); assert.equal(env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(env.GEMINI_FORCE_FILE_STORAGE, 'true'); assert.equal(env.GEMINI_FORCE_ENCRYPTED_FILE_STORAGE, 'true');
  assert.equal(env.OTHER, 'keep'); assert.equal(accounts.provider('gemini').usage, false);
  assert.equal(accounts.defaultConfigDir('gemini'), path.join(home, '.gemini'));
  assert.equal(accounts.choices('gemini').length, 3);
});
test('synthetic adapter supports a named profile without changing account storage code or adding usage', t => {
  const descriptor = { id: 'test-provider', name: 'Test Provider', namedProfiles: true, isolation: { env: 'TEST_CONFIG_HOME', defaultSubdir: '.test-provider' }, login: { args: [], instruction: '' }, usage: false, models: false, resume: false, reason: '' };
  const registry = { getAccountProvider: id => id === descriptor.id ? structuredClone(descriptor) : null, listAccountProviders: () => [structuredClone(descriptor)] };
  const { accounts } = fixture(t, { registry });
  const profile = accounts.create(descriptor.id, 'Extra subscription');
  assert.equal(accounts.environment(profile.id, descriptor.id).TEST_CONFIG_HOME, profile.configDir);
  assert.equal(accounts.allChoices().filter(x => x.profile).length, 1);
  assert.equal(accounts.providers()[0].usage, false); assert.equal(accounts.providers()[0].isolation, undefined);
  assert.throws(() => accounts.getAccount(profile.id, 'gemini'), /Choose an account/);
});
test('Pi profiles isolate authentication, defaults and session paths without inherited API keys', t => {
  const { accounts, root, home } = fixture(t);
  const one = accounts.create('pi', 'Pi Work'), two = accounts.create('pi', 'Pi Personal');
  const env = accounts.environment(one.id, 'pi', { baseEnv: { PI_CODING_AGENT_DIR: '/shared', PI_CODING_AGENT_SESSION_DIR: '/shared-sessions', OPENROUTER_API_KEY: 'SHARED_TOKEN' } });
  assert.equal(env.PI_CODING_AGENT_DIR, one.configDir); assert.notEqual(one.configDir, two.configDir);
  assert.equal(env.PI_CODING_AGENT_SESSION_DIR, undefined); assert.equal(env.OPENROUTER_API_KEY, undefined);
  assert.equal(fs.existsSync(path.join(one.configDir, 'auth.json')), false, 'creating a profile does not copy default credentials');
  require('../electron/cli-launch.cjs').prepareCli('pi', { directory: root, home, configDir: one.configDir, runtime: { node: process.execPath, tools: path.join(root, 'agent-tools.cjs') }, summary: '', summaryPath: path.join(root, 'context.md') });
  assert.ok(fs.existsSync(path.join(one.configDir, 'mcp.json')));
  assert.equal(fs.existsSync(path.join(home, '.pi', 'agent', 'mcp.json')), false);
});
test('migration keeps saved unavailable providers without silently deleting account records', t => {
  const { root, accounts } = fixture(t);
  const profile = accounts.create('gemini', 'Keep me');
  const saved = JSON.parse(fs.readFileSync(path.join(root, 'agent-accounts.json')));
  saved.profiles[0].provider = 'unavailable-provider';
  fs.writeFileSync(path.join(root, 'agent-accounts.json'), JSON.stringify(saved));
  const reopened = new AccountProfiles(root, { home: root, env: {} });
  assert.equal(reopened.list()[0].id, profile.id);
  assert.equal(reopened.allChoices().find(x => x.id === profile.id).profile, true);
  assert.throws(() => reopened.getAccount(profile.id, 'unavailable-provider'), /kept/);
  assert.throws(() => reopened.create('cursor', 'Unsafe shared sign-in'), /not been verified/);
  saved.profiles[0].provider = 'cursor';
  fs.writeFileSync(path.join(root, 'agent-accounts.json'), JSON.stringify(saved));
  const knownUnavailable = new AccountProfiles(root, { home: root, env: {} });
  assert.ok(knownUnavailable.choices('cursor').find(x => x.id === profile.id).unavailableReason);
});
test('Gemini login and ordinary launch use the selected profile and restoration retains it', async t => {
  const { root, home, accounts } = fixture(t);
  const profile = accounts.create('gemini', 'Gemini Work'), calls = [];
  const hub = { summary: () => '', config: { profiles: [] }, grant: () => ({}), on() {}, revoke() {} };
  const sessions = new Sessions(root, { accounts, hub, agentHome: home, findProgram: () => process.execPath,
    cliSetup: { executable: () => process.execPath }, runtime: { node: process.execPath, tools: path.join(root, 'unused-tool.cjs') },
    pty: { spawn(command, args, options) {
      const terminal = { onData() {}, onExit(fn) { this.exit = fn; }, kill() {}, resize() {} };
      calls.push({ command, args, options, terminal }); return terminal;
    } } });
  const login = await sessions.createLoginConsole(profile.id, root);
  assert.equal(calls[0].options.env.GEMINI_CLI_HOME, path.dirname(profile.configDir));
  calls[0].terminal.exit({ exitCode: 0 });
  assert.equal(accounts.get(profile.id).loginCompletedAt, null, 'closing an unauthenticated console is not successful sign-in');
  sessions.end(login.id);
  const next = await sessions.createLoginConsole(profile.id, root);
  fs.writeFileSync(path.join(profile.configDir, 'gemini-credentials.json'), 'ENCRYPTED_TEST_FIXTURE');
  calls[1].terminal.exit({ exitCode: 0 });
  assert.ok(accounts.get(profile.id).loginCompletedAt);
  sessions.end(next.id);
  const launch = await sessions.create({ provider: 'gemini', cwd: root }, { accountId: profile.id });
  assert.equal(launch.accountId, profile.id);
  assert.equal(calls.at(-1).options.env.GEMINI_CLI_HOME, path.dirname(profile.configDir));
  assert.ok(fs.existsSync(path.join(profile.configDir, 'settings.json')));
  assert.equal(fs.existsSync(path.join(home, '.gemini', 'settings.json')), false);
  assert.equal(sessions.savedConsoles().find(x => x.consoleKey === launch.consoleKey).accountId, profile.id);
  const pi = accounts.create('pi', 'Pi Work');
  const piLogin = await sessions.createLoginConsole(pi.id, root);
  fs.writeFileSync(path.join(pi.configDir, 'auth.json'), '{}');
  calls.at(-1).terminal.exit({ exitCode: 0 });
  assert.equal(accounts.get(pi.id).loginCompletedAt, null, 'an empty native auth object is not sign-in evidence');
  sessions.end(piLogin.id);
  await sessions.createLoginConsole(pi.id, root);
  fs.writeFileSync(path.join(pi.configDir, 'auth.json'), JSON.stringify({ fixture: { type: 'api_key', key: 'TEST_ONLY' } }));
  calls.at(-1).terminal.exit({ exitCode: 0 });
  assert.ok(accounts.get(pi.id).loginCompletedAt);
});
