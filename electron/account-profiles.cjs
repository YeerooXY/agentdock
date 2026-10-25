'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { atomicJson, readJson } = require('./storage.cjs');

const PROVIDERS = new Set(['codex', 'claude']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DEFAULT_LABEL = { codex: 'Default Codex', claude: 'Default Claude' };
const envValue = (env, name) => Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
const defaultId = provider => `${provider}:default`;
const cleanLabel = value => {
  const label = typeof value === 'string' ? value.trim() : '';
  if (!label || label.length > 64 || /[\x00-\x1f\x7f]/.test(label)) throw new Error('Enter an account label up to 64 characters.');
  return label;
};

class AccountProfiles {
  constructor(root, { env = process.env, home = os.homedir() } = {}) {
    root = require('./platform.cjs').realRoot(root);
    this.root = path.join(root, 'agent-accounts');
    this.file = path.join(root, 'agent-accounts.json');
    this.env = env;
    this.home = home;
    try { fs.mkdirSync(this.root); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    this.checkedRoot();
    const saved = readJson(this.file, { version: 1, profiles: [] });
    this.profiles = Array.isArray(saved?.profiles) ? saved.profiles.filter(x =>
      x && UUID.test(x.id || '') && PROVIDERS.has(x.provider) && typeof x.label === 'string' && x.label.length <= 64
    ) : [];
  }

  persist() { atomicJson(this.file, { version: 1, profiles: this.profiles }); }
  checkedRoot() {
    const info = fs.lstatSync(this.root), real = fs.realpathSync(this.root), expected = path.resolve(this.root);
    if (!info.isDirectory() || info.isSymbolicLink() || canonical(real) !== canonical(expected)) throw new Error('Account profile storage must be a local folder inside Paddock data.');
    return real;
  }
  list(provider) {
    const profiles = provider ? this.profiles.filter(x => x.provider === provider) : this.profiles;
    return profiles.map(({ id, provider, label, createdAt, loginCompletedAt }) => ({ id, provider, label, createdAt, loginCompletedAt: loginCompletedAt || null }));
  }
  get(id) { return this.profiles.find(x => x.id === id) || null; }
  getAccount(id, provider) {
    if (id === defaultId(provider) && PROVIDERS.has(provider)) return { id, provider, label: DEFAULT_LABEL[provider], profile: false, configDir: this.defaultConfigDir(provider) };
    const profile = this.get(id);
    if (!profile || (provider && profile.provider !== provider)) throw new Error('Choose an account for this provider.');
    return { ...profile, profile: true, configDir: this.directory(profile.id) };
  }
  choices(provider) {
    if (!PROVIDERS.has(provider)) return [];
    return [
      { id: defaultId(provider), provider, label: DEFAULT_LABEL[provider], profile: false },
      ...this.list(provider).map(x => ({ ...x, profile: true }))
    ];
  }
  directory(id) {
    if (!UUID.test(id || '')) throw new Error('Account profile not found.');
    const profile = this.get(id);
    if (!profile) throw new Error('Account profile not found.');
    const target = path.resolve(this.root, id);
    const relative = path.relative(this.root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Account profile path is invalid.');
    const realRoot = this.checkedRoot();
    try { fs.mkdirSync(target); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = fs.lstatSync(target), currentRoot = this.checkedRoot(), realTarget = fs.realpathSync(target);
    if (canonical(realRoot) !== canonical(currentRoot) || !info.isDirectory() || info.isSymbolicLink() || canonical(realTarget) !== canonical(target) || !inside(currentRoot, realTarget)) {
      throw new Error('Account profile folder is linked or unavailable.');
    }
    return realTarget;
  }
  create(provider, label) {
    if (!PROVIDERS.has(provider)) throw new Error('Choose Codex or Claude Code.');
    const profile = { id: crypto.randomUUID(), provider, label: cleanLabel(label), createdAt: Date.now(), loginCompletedAt: null };
    this.checkedRoot();
    const target = path.join(this.root, profile.id);
    fs.mkdirSync(target);
    this.profiles.push(profile);
    this.persist();
    return { ...profile, configDir: this.directory(profile.id) };
  }
  rename(id, label) {
    const profile = this.get(id);
    if (!profile) throw new Error('Account profile not found.');
    profile.label = cleanLabel(label);
    this.persist();
    return this.list().find(x => x.id === id);
  }
  // Deletes the profile and its private sign-in folder. The default accounts
  // (the CLI's own config folders) are never removed here.
  remove(id) {
    const profile = this.get(id);
    if (!profile) throw new Error('Account profile not found.');
    const folder = this.directory(id);
    fs.rmSync(folder, { recursive: true, force: true, maxRetries: 3 });
    this.profiles = this.profiles.filter(x => x.id !== id);
    this.persist();
    return { id, provider: profile.provider, label: profile.label };
  }
  markLoginCompleted(id, completed) {
    const profile = this.get(id);
    if (!profile) return;
    profile.loginCompletedAt = completed ? Date.now() : null;
    this.persist();
  }
  defaultConfigDir(provider) {
    if (provider === 'codex') {
      const configured = envValue(this.env, 'CODEX_HOME');
      return configured ? path.resolve(configured) : path.join(this.home, '.codex');
    }
    const configured = envValue(this.env, 'CLAUDE_CONFIG_DIR');
    if (configured && path.isAbsolute(configured)) return path.resolve(configured);
    return path.join(this.home, '.claude');
  }
  environment(id, provider, { bridge = null, login = false, baseEnv = this.env } = {}) {
    const account = this.getAccount(id, provider);
    const env = { ...baseEnv };
    for (const key of Object.keys(env)) {
      const normalized = key.toLowerCase();
      if (login && normalized.startsWith('paddock_')) delete env[key];
      if (['paddock_draft_url', 'paddock_draft_token', 'paddock_draft_session', 'paddock_draft_launch', 'paddock_draft_roots', 'paddock_draft_provider', 'paddock_real_editor', 'paddock_bridge_url', 'paddock_bridge_token'].includes(normalized)) delete env[key];
      if (account.profile && ['codex_home', 'codex_sqlite_home', 'claude_config_dir'].includes(normalized)) delete env[key];
      if (account.profile && ['codex_access_token', 'codex_api_key', 'openai_api_key', 'openai_base_url', 'codex_base_url', 'anthropic_api_key', 'anthropic_auth_token', 'claude_code_oauth_token', 'anthropic_base_url', 'claude_code_use_bedrock', 'claude_code_use_vertex', 'claude_code_use_foundry'].includes(normalized)) delete env[key];
      if (bridge && !login && ['visual', 'editor'].includes(normalized)) delete env[key];
    }
    if (account.profile && provider === 'codex') {
      const sqlite = path.join(account.configDir, 'sqlite');
      try { fs.mkdirSync(sqlite); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      const sqliteStat = fs.lstatSync(sqlite), sqliteReal = fs.realpathSync(sqlite);
      if (!sqliteStat.isDirectory() || sqliteStat.isSymbolicLink() || canonical(sqliteReal) !== canonical(sqlite) || !inside(account.configDir, sqliteReal)) {
        throw new Error('The managed Codex database folder is linked or unavailable.');
      }
      env.CODEX_HOME = account.configDir;
      env.CODEX_SQLITE_HOME = sqlite;
    } else if (account.profile && provider === 'claude') {
      env.CLAUDE_CONFIG_DIR = account.configDir;
    }
    if (bridge && !login) {
      const editor = bridge.editorCommand;
      env.PADDOCK_DRAFT_URL = bridge.url;
      env.PADDOCK_DRAFT_TOKEN = bridge.token;
      env.PADDOCK_DRAFT_SESSION = bridge.sessionId;
      env.PADDOCK_DRAFT_LAUNCH = bridge.launchId;
      env.PADDOCK_DRAFT_ROOTS = JSON.stringify(bridge.editorRoots || []);
      env.PADDOCK_DRAFT_PROVIDER = bridge.provider || '';
      env.PADDOCK_REAL_EDITOR = editor;
      env.VISUAL = bridge.command;
      env.EDITOR = bridge.command;
    }
    return env;
  }
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function canonical(value) { const result = path.resolve(value).replace(/[\\/]+$/, ''); return process.platform === 'win32' ? result.toLowerCase() : result; }

module.exports = { AccountProfiles, DEFAULT_LABEL, defaultId, inside, envValue };
