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
test('synthetic adapter supports a named profile without changing account storage code or adding usage', t => {
  const descriptor = { id: 'test-provider', name: 'Test Provider', namedProfiles: true, isolation: { env: 'TEST_CONFIG_HOME', defaultSubdir: '.test-provider' }, login: { args: [], instruction: '' }, usage: false, models: false, resume: false, reason: '' };
  const registry = { getAccountProvider: id => id === descriptor.id ? structuredClone(descriptor) : null, listAccountProviders: () => [structuredClone(descriptor)] };
  const { accounts } = fixture(t, { registry });
  const profile = accounts.create(descriptor.id, 'Extra subscription');
  assert.equal(accounts.environment(profile.id, descriptor.id).TEST_CONFIG_HOME, profile.configDir);
  assert.equal(accounts.allChoices().filter(x => x.profile).length, 1);
  assert.equal(accounts.providers()[0].usage, false); assert.equal(accounts.providers()[0].isolation, undefined);
  assert.throws(() => accounts.getAccount(profile.id, 'pi'), /Choose an account/);
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
test('Grok profiles isolate sign-in and MCP configuration without inherited xAI keys', t => {
  const { accounts, root, home } = fixture(t);
  const one = accounts.create('grok', 'Grok Work'), two = accounts.create('grok', 'Grok Personal');
  const env = accounts.environment(one.id, 'grok', { baseEnv: { GROK_HOME: path.join(home, '.grok'), XAI_API_KEY: 'SHARED', GROK_DEPLOYMENT_KEY: 'SHARED', OTHER: 'keep' } });
  assert.equal(env.GROK_HOME, one.configDir); assert.notEqual(one.configDir, two.configDir);
  assert.equal(env.XAI_API_KEY, undefined); assert.equal(env.GROK_DEPLOYMENT_KEY, undefined); assert.equal(env.OTHER, 'keep');
  assert.equal(fs.existsSync(path.join(one.configDir, 'auth.json')), false, 'a new profile starts signed out');
  assert.equal(accounts.defaultConfigDir('grok'), path.join(home, '.grok'));
  assert.equal(accounts.environment('grok:default', 'grok', { baseEnv: { XAI_API_KEY: 'mine' } }).XAI_API_KEY, 'mine', 'the default account keeps its own settings');
  require('../electron/cli-launch.cjs').prepareCli('grok', { directory: root, home, configDir: one.configDir, runtime: { node: process.execPath, tools: path.join(root, 'agent-tools.cjs') }, summary: '', summaryPath: path.join(root, 'context.md') });
  assert.ok(fs.existsSync(path.join(one.configDir, 'config.toml')));
  assert.equal(fs.existsSync(path.join(home, '.grok', 'config.toml')), false);
});
test('migration keeps saved unavailable providers without silently deleting account records', t => {
  const { root, accounts } = fixture(t);
  const profile = accounts.create('pi', 'Keep me');
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
test('sign-in state comes from the login files each adapter declares', t => {
  const { accounts, home } = fixture(t);
  const grok = accounts.create('grok', 'Grok Work');
  assert.equal(accounts.hasCredentials(grok.id, 'grok'), false, 'a new profile is signed out');
  fs.writeFileSync(path.join(grok.configDir, 'auth.json'), '﻿' + JSON.stringify({ 'https://auth.x.ai::u': { refresh_token: 'r' } }));
  assert.equal(accounts.hasCredentials(grok.id, 'grok'), true);
  fs.writeFileSync(path.join(grok.configDir, 'auth.json'), JSON.stringify({ 'https://auth.x.ai::u': { refresh_token: '' } }));
  assert.equal(accounts.hasCredentials(grok.id, 'grok'), false, 'an empty token is not a sign-in');
  fs.mkdirSync(path.join(home, '.grok')); fs.writeFileSync(path.join(home, '.grok', 'auth.json'), JSON.stringify({ a: { key: 'k' } }));
  assert.equal(accounts.hasCredentials('grok:default', 'grok'), true, 'the default account uses the CLI folder');
  assert.equal(accounts.hasCredentials('kiro:default', 'kiro'), null, 'no declared files means unknown');
});
