'use strict';
// Account switching for CLIs that keep their sign-in in one fixed system
// credential (Antigravity: "gemini:antigravity" in Windows Credential Manager).
// Only one account of such a CLI is signed in at a time. Paddock keeps every
// account's sign-in encrypted with safeStorage and places the chosen one in the
// credential before a console or usage check starts. Accounts are told apart by
// the email inside the credential, so a token rewritten by a running CLI is never
// saved under the wrong account.
const fs = require('node:fs');
const path = require('node:path');
const { atomicJson, readJson } = require('./storage.cjs');

class SwitchBusyError extends Error {
  constructor(message) { super(message); this.code = 'switch-busy'; }
}
const defaultId = provider => `${provider}:default`;
const slotName = id => id.endsWith(':default') ? 'default' : id;

function credentialEmail(blob) {
  try {
    const value = JSON.parse(Buffer.from(blob).toString('utf8'));
    const email = value && typeof value === 'object' ? value.id_token_email ?? Object.values(value).find(item => item && typeof item === 'object' && item.id_token_email)?.id_token_email : null;
    return typeof email === 'string' && email.includes('@') ? email.toLowerCase() : null;
  } catch { return null; }
}

class CredentialSwitch {
  // providers: { antigravity: { target: 'gemini:antigravity' } }
  // inUse(provider) returns the account ids of live consoles for that CLI.
  constructor(root, { safeStorage, credentials = require('./windows-credentials.cjs'), providers = {}, inUse = () => [], platform = process.platform } = {}) {
    this.root = path.join(root, 'credential-slots');
    this.file = path.join(root, 'credential-switch.json');
    this.safeStorage = safeStorage; this.credentials = credentials; this.providers = providers; this.inUse = inUse; this.platform = platform;
    const saved = readJson(this.file, { version: 1, active: {} });
    this.active = saved && typeof saved.active === 'object' && saved.active ? { ...saved.active } : {};
    this.queues = new Map();
  }
  handles(provider) { return Object.hasOwn(this.providers, provider); }
  persist() { atomicJson(this.file, { version: 1, active: this.active }); }
  activeAccount(provider) { return this.active[provider] || defaultId(provider); }
  slotPath(provider, accountId) {
    const name = slotName(accountId);
    if (!/^(default|[a-f0-9-]{36})$/i.test(name)) throw new Error('Account not found.');
    return path.join(this.root, provider, name + '.bin');
  }
  checkAvailable() {
    if (this.platform !== 'win32') throw new Error('Switching Antigravity accounts is available on Windows only.');
    if (!this.safeStorage?.isEncryptionAvailable?.()) throw new Error('Secure storage is unavailable, so Paddock cannot keep a second sign-in.');
  }
  loadSlot(provider, accountId) {
    let raw;
    try { raw = fs.readFileSync(this.slotPath(provider, accountId)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    const value = JSON.parse(this.safeStorage.decryptString(raw));
    return { user: value.user, persist: value.persist, blob: Buffer.from(value.blob, 'base64'), email: value.email || null };
  }
  saveSlot(provider, accountId, credential) {
    const file = this.slotPath(provider, accountId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const sealed = this.safeStorage.encryptString(JSON.stringify({ user: credential.user, persist: credential.persist, blob: Buffer.from(credential.blob).toString('base64'), email: credentialEmail(credential.blob) }));
    const temp = file + '.tmp'; fs.writeFileSync(temp, sealed, { mode: 0o600 }); fs.renameSync(temp, file);
  }
  accountIds(provider) {
    let names = [];
    try { names = fs.readdirSync(path.join(this.root, provider)).filter(name => name.endsWith('.bin')).map(name => name.slice(0, -4)); } catch {}
    return names.map(name => name === 'default' ? defaultId(provider) : name);
  }
  // Saves the credential now in the system store under the account it belongs to.
  // The email decides; without one, it belongs to the account Paddock last activated.
  async captureCurrent(provider) {
    const { target } = this.providers[provider];
    const current = await this.credentials.readCredential(target);
    if (!current) return null;
    const email = credentialEmail(current.blob);
    let owner = this.activeAccount(provider);
    if (email) {
      const match = this.accountIds(provider).find(id => { try { return this.loadSlot(provider, id)?.email === email; } catch { return false; } });
      const ownerEmail = (() => { try { return this.loadSlot(provider, owner)?.email || null; } catch { return null; } })();
      if (match) owner = match;
      // An unknown email in the active account's slot that already holds another
      // email: keep both and do not overwrite.
      else if (ownerEmail && ownerEmail !== email) return { email, owner: null };
    }
    this.saveSlot(provider, owner, current);
    return { email, owner };
  }
  run(provider, task) {
    const previous = this.queues.get(provider) || Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    this.queues.set(provider, next.catch(() => {}));
    return next;
  }
  // Puts accountId's sign-in into the system credential. A missing sign-in
  // leaves the CLI signed out, which is how a new account signs in.
  async switchTo(provider, accountId, except = null) {
    this.checkAvailable();
    const busy = [...new Set(this.inUse(provider, except))].filter(id => id !== accountId);
    if (busy.length) throw new SwitchBusyError(`Close the open ${this.providers[provider].name || provider} consoles of the other account first. Only one account can be signed in at a time.`);
    await this.captureCurrent(provider);
    const { target } = this.providers[provider];
    const wanted = this.loadSlot(provider, accountId);
    if (this.activeAccount(provider) === accountId && (!wanted || await this.credentials.readCredential(target))) return;
    if (wanted) await this.credentials.writeCredential(target, wanted);
    else await this.credentials.deleteCredential(target);
    this.active[provider] = accountId; this.persist();
  }
  activate(provider, accountId, { except = null } = {}) {
    if (!this.handles(provider)) return Promise.resolve();
    return this.run(provider, () => this.switchTo(provider, accountId, except));
  }
  // Runs task while accountId is signed in; no other switch can happen meanwhile.
  withAccount(provider, accountId, task) {
    if (!this.handles(provider)) return task();
    return this.run(provider, async () => {
      await this.switchTo(provider, accountId);
      try { return await task(); } finally { await this.returnToDefault(provider).catch(() => {}); }
    });
  }
  async returnToDefault(provider) {
    const fallback = defaultId(provider);
    if (this.activeAccount(provider) === fallback || this.inUse(provider).some(id => id !== fallback)) return;
    await this.switchTo(provider, fallback);
  }
  // After a sign-in console closes: was the account signed in, and as whom.
  async completeLogin(provider, accountId) {
    return this.run(provider, async () => {
      this.checkAvailable();
      const current = await this.credentials.readCredential(this.providers[provider].target);
      if (!current) return { completed: false, email: null };
      const email = credentialEmail(current.blob);
      const taken = email && this.accountIds(provider).find(id => id !== accountId && (() => { try { return this.loadSlot(provider, id)?.email === email; } catch { return false; } })());
      if (taken) return { completed: false, email, duplicate: taken };
      this.saveSlot(provider, accountId, current); this.active[provider] = accountId; this.persist();
      return { completed: true, email };
    });
  }
  // Returns the CLI to its default account when no other account is in use, so
  // a CLI started outside Paddock keeps the account it had.
  release(provider) {
    if (!this.handles(provider)) return Promise.resolve();
    return this.run(provider, () => this.returnToDefault(provider)).catch(() => {});
  }
  async remove(provider, accountId) {
    if (!this.handles(provider)) return;
    await this.run(provider, async () => { if (this.activeAccount(provider) === accountId) await this.switchTo(provider, defaultId(provider)); }).catch(() => {});
    try { fs.rmSync(this.slotPath(provider, accountId), { force: true }); } catch {}
  }
}

module.exports = { CredentialSwitch, SwitchBusyError, credentialEmail };
