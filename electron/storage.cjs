'use strict';
const { secureStore } = require('./platform.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function readJson(file, fallback, { recoverCorrupt = false, onRecovery = () => {} } = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return fallback;
    // Only disposable caches may recover. Settings, credentials and other saves
    // stay strict, and access errors must never be mistaken for corrupt JSON.
    if (recoverCorrupt && error instanceof SyntaxError) {
      const backup = `${file}.${crypto.randomUUID()}.corrupt`;
      try { fs.renameSync(file, backup); }
      catch { throw new Error(`Cannot preserve damaged ${path.basename(file)}. The file was not changed.`); }
      onRecovery(backup);
      return fallback;
    }
    throw new Error(`Cannot read ${path.basename(file)}. The file was preserved.`);
  }
}
function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(data, null, 2)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  }
  finally { try { fs.unlinkSync(temp); } catch {} }
}
class Vault {
  constructor(file, safeStorage) { this.file = file; this.crypto = safeStorage; this.entries = readJson(file, {}); }
  available() {
    return this.crypto.isEncryptionAvailable() && (!this.crypto.getSelectedStorageBackend || this.crypto.getSelectedStorageBackend() !== 'basic_text');
  }
  list() { return Object.entries(this.entries).map(([provider, x]) => ({ id: provider, provider, label: x.label, savedAt: x.savedAt })); }
  set(provider, key, label) {
    validateKeyId(provider);
    if (!this.available()) throw new Error('Windows key encryption is unavailable. No key was saved.');
    if (typeof key !== 'string' || !key.trim() || key.length > 65536 || key.includes('\0')) throw new Error('Enter a key or credential, up to 64 KB.');
    const next = { ...this.entries, [provider]: { label: String(label || provider).slice(0, 70), savedAt: Date.now(), encrypted: this.crypto.encryptString(key).toString('base64') } };
    atomicJson(this.file, next); this.entries = next;
  }
  get(provider) {
    if (!this.available()) throw new Error('Windows key encryption is unavailable.');
    const value = this.entries[provider];
    if (!value) throw new Error('Save a key for this provider in the vault first.');
    try { return this.crypto.decryptString(Buffer.from(value.encrypted, 'base64')); }
    catch { throw new Error(`This key cannot be decrypted with ${secureStore()}. Save it again.`); }
  }
  remove(provider) { const next = { ...this.entries }; delete next[provider]; atomicJson(this.file, next); this.entries = next; }
}
function validateKeyId(id) {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(id || '') || ['constructor', 'prototype', '__proto__'].includes(id)) throw new Error('Use a key ID with letters, numbers, dashes or underscores.');
  return id;
}
module.exports = { readJson, atomicJson, Vault, validateKeyId };
