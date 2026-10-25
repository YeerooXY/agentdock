'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { wslPath } = require('./adapters.cjs');
const { byId: cliAgents } = require('./cli-catalog.cjs');

const IMAGE = /\.(png|jpe?g)$/i;
const KEEP = 20;

// Finds the newest screenshot from the Windows Screenshots folders or the
// clipboard (Win+Shift+S) so it can be pasted into a console as a file path.
// Everything stays on this PC; clipboard images are saved only when used.
class Screenshots extends EventEmitter {
  constructor(root, { clipboard, nativeImage, folders } = {}) {
    super();
    this.clipboard = clipboard; this.nativeImage = nativeImage;
    this.saved = path.join(root, 'screenshots');
    this.folders = folders || [path.join(os.homedir(), 'Pictures', 'Screenshots'), path.join(os.homedir(), 'OneDrive', 'Pictures', 'Screenshots')];
    this.clip = null; this.latest = null; this.thumbs = new Map(); this.watchers = [];
  }
  start() {
    for (const folder of this.folders) {
      try { this.watchers.push(fs.watch(folder, () => this.schedule())); } catch {}
    }
    this.refresh({ initial: true });
  }
  stop() { for (const watcher of this.watchers) watcher.close(); this.watchers = []; clearTimeout(this.timer); }
  schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => this.refresh(), 400); }
  newestFile() {
    let best = null;
    for (const folder of this.folders) {
      let names; try { names = fs.readdirSync(folder); } catch { continue; }
      for (const name of names) {
        if (!IMAGE.test(name)) continue;
        const file = path.join(folder, name);
        try { const stat = fs.statSync(file); if (stat.isFile() && (!best || stat.mtimeMs > best.at)) best = { file, at: stat.mtimeMs, name }; } catch {}
      }
    }
    return best;
  }
  async readClipboard(initial) {
    const image = await this.clipboard?.image();
    if (!image || image.isEmpty()) { this.clip = null; return; }
    const hash = crypto.createHash('sha1').update(image.toBitmap()).digest('hex');
    if (this.clip?.hash === hash) return;
    // An image already on the clipboard at startup is older than any new snip.
    this.clip = { hash, image, at: initial ? 0 : Date.now() };
  }
  // Clipboard reads are async; queue refreshes so two never interleave.
  refresh(options) { this.queue = (this.queue || Promise.resolve()).then(() => this.update(options)).catch(() => {}); return this.queue; }
  async update({ initial = false } = {}) {
    try { await this.readClipboard(initial); } catch { this.clip = null; }
    const file = this.newestFile();
    // Snipping Tool also saves Win+Shift+S captures; prefer that file when it
    // appeared around the same time as the clipboard image.
    const next = file && (!this.clip || file.at >= this.clip.at - 10000) ? { source: 'file', ...file }
      : this.clip ? { source: 'clipboard', at: this.clip.at, name: 'Clipboard image', hash: this.clip.hash } : null;
    const key = next && (next.file || next.hash) + ':' + next.at;
    if (key === this.key) return;
    this.key = key; this.latest = next;
    this.emit('changed');
  }
  thumbnail(item) {
    const key = (item.file || item.hash) + ':' + item.at;
    if (!this.thumbs.has(key)) {
      let data = '';
      try {
        const image = item.source === 'clipboard' ? this.clip.image : this.nativeImage.createFromPath(item.file);
        if (!image.isEmpty()) data = image.resize({ height: 64, quality: 'good' }).toDataURL();
      } catch {}
      this.thumbs.clear(); this.thumbs.set(key, data);
    }
    return this.thumbs.get(key);
  }
  snapshot() {
    const item = this.latest; if (!item) return null;
    return { source: item.source, name: item.name, at: item.at, thumb: this.thumbnail(item) };
  }
  file() {
    const item = this.latest;
    if (!item) throw new Error('No screenshot yet. Press Win+Shift+S to take one.');
    if (item.source === 'file') {
      if (!fs.existsSync(item.file)) { this.refresh(); throw new Error('That screenshot was moved or deleted.'); }
      return item.file;
    }
    return this.save(this.clip.image, item.hash);
  }
  save(image, hash) {
    fs.mkdirSync(this.saved, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const file = path.join(this.saved, `screenshot-${stamp}-${hash.slice(0, 6)}.png`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, image.toPNG());
    this.prune();
    return file;
  }
  format(session, file) {
    const value = session.claudeTarget?.kind === 'wsl' ? wslPath(file) : file;
    return /[\s"'&()^%!;]/.test(value) ? `"${value}"` : value;
  }
  check(session) {
    if (!session?.alive) throw new Error('Choose an open console first.');
    if (session.remote) throw new Error('Screenshots stay on this PC. SSH consoles cannot open PC files yet.');
    if (!agent(session.provider)) throw new Error('PowerShell and CMD cannot open images. Paste into an agent console such as Claude, Codex or Kiro.');
  }
  // Ctrl+V in an agent console: a clipboard image becomes a saved file path,
  // anything else pastes as text. Shell consoles keep their own Ctrl+V.
  async paste(session) {
    const image = await this.clipboard?.image();
    if (image && !image.isEmpty()) {
      this.check(session);
      const hash = crypto.createHash('sha1').update(image.toBitmap()).digest('hex');
      return this.format(session, this.save(image, hash));
    }
    return (await this.clipboard?.text()) || '';
  }
  // Only screenshots this app saved from the clipboard are ever removed.
  prune() {
    let names; try { names = fs.readdirSync(this.saved).filter(name => /^screenshot-[\d-]+-[a-f0-9]{6}\.png$/.test(name)).sort(); } catch { return; }
    for (const name of names.slice(0, Math.max(0, names.length - KEEP))) { try { fs.unlinkSync(path.join(this.saved, name)); } catch {} }
  }
  pathFor(session) {
    this.check(session);
    return this.format(session, this.file());
  }
}
// Electron 44 replaced clipboard.readImage() with the async W3C-style read().
function clipboardReader(clipboard, nativeImage) {
  return {
    async image() {
      if (typeof clipboard.readImage === 'function') return clipboard.readImage();
      for (const item of await clipboard.read()) {
        const type = item.types.find(t => t === 'image/png') || item.types.find(t => t.startsWith('image/'));
        if (type) return nativeImage.createFromBuffer(Buffer.from(await (await item.getType(type)).arrayBuffer()));
      }
      return null;
    },
    async text() { return clipboard.readText(); },
  };
}
function agent(provider) { return ['codex', 'claude', 'custom'].includes(provider) || cliAgents.has(provider); }

module.exports = { Screenshots, agent, clipboardReader };
