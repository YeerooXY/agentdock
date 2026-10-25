'use strict';
const { encryptionUnavailable } = require('./platform.cjs');
const { providers } = require('./cli-catalog.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { atomicJson, readJson } = require('./storage.cjs');
const { cells, gridSize } = require('./console-layout.cjs');

// Only launch details and exact conversation IDs are saved. Agent transcripts stay
// with their CLI, and terminal input is never replayed into a restored process.
class Workspace {
  constructor(root, sessions, crypto, { enabled = true, onError = () => {} } = {}) {
    this.file = path.join(root, 'workspace.json'); this.sessions = sessions; this.crypto = crypto;
    this.enabled = enabled; this.onError = onError; this.frozen = false; this.loading = false;
    this.blocked = false; this.lastSaved = null; this.timer = null;
    sessions.on('changed', () => this.schedule());
  }
  available() { return this.crypto.isEncryptionAvailable() && this.crypto.getSelectedStorageBackend?.() !== 'basic_text'; }
  schedule() {
    if (!this.enabled || this.frozen || this.loading || this.blocked || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.save(); }, 150);
    this.timer.unref?.();
  }
  save() {
    clearTimeout(this.timer); this.timer = null;
    if (!this.enabled || this.frozen || this.loading || this.blocked) return;
    try {
      const text = JSON.stringify(this.sessions.savedConsoles());
      if (text + JSON.stringify(this.sessions.grid) === this.lastSaved) return;
      if (!this.available()) throw new Error(encryptionUnavailable('Previous consoles could not be saved.'));
      atomicJson(this.file, { version: 1, grid: this.sessions.grid, savedAt: Date.now(), encrypted: this.crypto.encryptString(text).toString('base64') });
      this.lastSaved = text + JSON.stringify(this.sessions.grid);
      this.onError(null);
    } catch (error) { this.onError(error.message); }
  }
  async restore() {
    if (!this.enabled || this.started) return;
    this.started = true; this.loading = true;
    try {
      const saved = readJson(this.file, null);
      if (!saved) return;
      if (!this.available()) throw new Error(encryptionUnavailable());
      if (saved.version !== 1 || typeof saved.encrypted !== 'string') throw new Error('Unsupported saved workspace.');
      const entries = JSON.parse(this.crypto.decryptString(Buffer.from(saved.encrypted, 'base64')));
      const grid = gridSize(saved.grid), capacity = grid.columns * grid.rows;
      if (!Array.isArray(entries) || entries.length > capacity || new Set(entries.map(x => x?.slot)).size !== entries.length || entries.some(x =>
        !Number.isInteger(x?.slot) || x.slot < 1 || x.slot > capacity || !(providers.includes(x.provider) || (x.provider === 'code' && x.kind === 'code') || (x.provider === 'web' && x.kind === 'web')) ||
        typeof x.cwd !== 'string' || typeof x.name !== 'string' || !['default', 'unrestricted', 'system'].includes(x.permissions) ||
        (x.nameMode != null && !['project', 'folder', 'custom'].includes(x.nameMode)) ||
        (x.command != null && (typeof x.command !== 'string' || x.command.length > 4000 || x.command.includes('\0'))))) throw new Error('Invalid saved workspace.');
      const area = entries.flatMap(item => cells(item, grid));
      if (new Set(area).size !== area.length) throw new Error('Saved consoles overlap.');
      this.sessions.setGrid(grid);
      for (const entry of entries.sort((a, b) => a.slot - b.slot)) await this.sessions.restore(entry);
    } catch {
      // A damaged or undecryptable save must not be overwritten by an empty dock.
      this.blocked = true;
      this.onError('Previous consoles could not be loaded. The saved workspace was kept. Turn restoration off and on to start a new save.');
    } finally { this.loading = false; this.save(); }
  }
  setEnabled(enabled) {
    if (enabled === this.enabled) return;
    clearTimeout(this.timer); this.timer = null;
    if (!enabled) {
      try { fs.unlinkSync(this.file); } catch (error) { if (error.code !== 'ENOENT') throw new Error('The saved workspace could not be removed.'); }
    }
    this.enabled = enabled; this.blocked = false; this.lastSaved = null;
    this.onError(null);
    if (enabled) this.save();
  }
  freeze() {
    this.sessions.scanEvents(); this.save(); this.frozen = true;
    clearTimeout(this.timer); this.timer = null;
  }
}
module.exports = { Workspace };
