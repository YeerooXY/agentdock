'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { atomicJson, readJson } = require('./storage.cjs');
const { previewArchive } = require('./result-archive.cjs');
const extensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.txt', '.md', '.json', '.log', '.html', '.pdf', '.glb', '.gltf', '.obj', '.stl', '.zip']);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const textExtensions = new Set(['.txt', '.md', '.json', '.log', '.html']);
const inside = (root, file) => { const relative = path.relative(root, file); return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative); };
const short = (value, max = 120) => String(value || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, max);
class Results extends EventEmitter {
  constructor(root, { trash, nativeImage } = {}) {
    super(); this.root = root; this.dir = path.join(root, 'results'); this.file = path.join(this.dir, 'index.json');
    fs.mkdirSync(this.dir, { recursive: true });
    this.items = readJson(this.file, []).filter(x => /^[a-f0-9-]{36}$/.test(x.id) && extensions.has(x.ext)).slice(0, 1000);
    this.trash = trash; this.nativeImage = nativeImage; this.deleting = false;
  }
  list() { return this.items.map(x => ({ ...x, image: imageExtensions.has(x.ext) })); }
  groupKey(item) { return JSON.stringify([item.consoleKey || item.sessionId || item.source || 'Dock', item.groupId || item.id]); }
  unreadGroups() { return new Set(this.items.filter(x => !x.seenAt).map(x => this.groupKey(x))).size; }
  markSeen(ids) {
    if (!Array.isArray(ids) || ids.length > 1000) throw new Error('Choose results to mark as seen.');
    const seen = new Set(ids), at = Date.now();
    if (this.items.some(x => seen.has(x.id) && !x.seenAt)) this.persist(this.items.map(x => seen.has(x.id) ? { ...x, seenAt: x.seenAt || at } : x));
  }
  renameConsole(consoleKey, name) {
    if (this.items.some(x => (x.consoleKey || x.sessionId) === consoleKey && x.consoleName !== name)) this.persist(this.items.map(x => (x.consoleKey || x.sessionId) === consoleKey ? { ...x, consoleName: short(name, 64) } : x));
  }
  persist(next) { atomicJson(this.file, next); this.items = next; this.emit('changed'); }
  directory(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Unknown result.');
    const dir = path.join(this.dir, id);
    if (fs.lstatSync(this.dir).isSymbolicLink() || (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink())) throw new Error('The results folder was redirected.');
    if (fs.existsSync(dir) && path.dirname(fs.realpathSync(dir)) !== fs.realpathSync(this.dir)) throw new Error('Invalid result folder.');
    return dir;
  }
  path(id) {
    const item = this.items.find(x => x.id === id); if (!item) throw new Error('This result was deleted.');
    const file = path.join(this.directory(id), 'result' + item.ext);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('The result file was redirected.');
    return file;
  }
  add(raw, { project = '', sessionId = null, consoleKey = null, consoleName = '', trusted = false, turnId = '', git = null } = {}) {
    if (this.items.length >= 1000) throw new Error('The gallery is full. Delete some saved results first.');
    let buffer, ext;
    if (raw.file) {
      const source = fs.realpathSync(String(raw.file));
      if (!trusted && (!project || !inside(fs.realpathSync(project), source) || inside(fs.realpathSync(this.root), source))) throw new Error('Save the result inside this console’s project first.');
      ext = path.extname(source).toLowerCase();
      if (!extensions.has(ext)) throw new Error('This file type cannot be saved in Results.');
      const stat = fs.statSync(source);
      if (!stat.isFile() || stat.size > 50 * 1024 * 1024) throw new Error('Use a file smaller than 50 MB.');
      buffer = fs.readFileSync(source);
    } else if (Buffer.isBuffer(raw.buffer) && trusted) { buffer = raw.buffer; ext = raw.ext; }
    else {
      if (typeof raw.text !== 'string' || Buffer.byteLength(raw.text) > 2 * 1024 * 1024) throw new Error('Use a text report smaller than 2 MB.');
      buffer = Buffer.from(raw.text); ext = ['.md', '.json', '.txt'].includes(raw.ext) ? raw.ext : '.md';
    }
    if (!extensions.has(ext) || buffer.length > 50 * 1024 * 1024) throw new Error('Unsupported result file.');
    if (this.items.reduce((sum, x) => sum + x.size, 0) + buffer.length > 1024 ** 3) throw new Error('The gallery has reached 1 GB. Delete some saved results first.');
    const item = { id: crypto.randomUUID(), title: short(raw.title || (raw.file && path.basename(raw.file)) || 'Result'), ext, size: buffer.length, at: Date.now(),
      kind: ['screenshot', 'test', 'concept', 'review', 'asset', 'report', 'code'].includes(raw.kind) ? raw.kind : 'report',
      status: ['passed', 'failed', 'needs-review'].includes(raw.status) ? raw.status : 'needs-review',
      summary: short(raw.summary, 1500), project: short(project, 1000), sessionId, consoleKey: consoleKey || sessionId, consoleName: short(consoleName, 64), seenAt: null, reviewId: trusted ? short(raw.reviewId, 80) : null, groupId: short(turnId || raw.groupId, 80), originalFile: raw.file && project ? path.relative(project, raw.file).replaceAll('\\', '/') : null, source: short(raw.source || 'Agent', 60) };
    const dir = this.directory(item.id); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'result' + ext), buffer, { flag: 'wx' });
    if (git) item.git = { branch: short(git.branch, 250) || null, commit: /^[a-f0-9]{40,64}$/i.test(git.commit || '') ? git.commit : null, detached: git.detached === true };
    this.persist([item, ...this.items]); return item;
  }
  preview(id, thumbnail = false, entry = null) {
    const item = this.items.find(x => x.id === id), file = this.path(id);
    if (item.ext === '.zip') return previewArchive(file, { entry, thumbnail, nativeImage: this.nativeImage });
    if (item.kind === 'code' && item.ext === '.json' && item.size < 2 * 1024 * 1024) return { diff: JSON.parse(fs.readFileSync(file, 'utf8')) };
    if (imageExtensions.has(item.ext) && this.nativeImage) {
      const source = this.nativeImage.createFromPath(file);
      if (source.isEmpty()) throw new Error('This image could not be read.');
      const size = source.getSize();
      const scale = Math.min(1, (thumbnail ? 360 : 1440) / size.width, (thumbnail ? 400 : 1800) / size.height);
      return { image: source.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) }).toDataURL() };
    }
    if (textExtensions.has(item.ext)) { const fd = fs.openSync(file, 'r'); try { const buffer = Buffer.alloc(100000); const count = fs.readSync(fd, buffer); return { text: buffer.subarray(0, count).toString('utf8'), truncated: item.size > count }; } finally { fs.closeSync(fd); } }
    return { text: 'Use Export to open this file in another app.' };
  }
  updateReport(id, report) {
    const item = this.items.find(x => x.id === id); if (!item || item.ext !== '.json') return;
    const file = this.path(id); atomicJson(file, report);
    this.persist(this.items.map(x => x.id === id ? { ...x, size: fs.statSync(file).size } : x));
  }
  async remove(ids) {
    if (this.deleting) throw new Error('Deletion is still in progress.');
    if (!Array.isArray(ids) || ids.length > 1000) throw new Error('Choose results to delete.');
    this.deleting = true; const deleted = [], failed = [];
    try {
      for (const id of new Set(ids)) {
        if (!this.items.some(x => x.id === id)) continue;
        try { const dir = this.directory(id); if (fs.existsSync(dir)) await this.trash(dir); if (fs.existsSync(dir)) throw new Error('Saved files are still present.'); deleted.push(id); }
        catch { failed.push(id); }
      }
      this.persist(this.items.filter(x => !deleted.includes(x.id)));
      return { deleted, failed };
    } finally { this.deleting = false; }
  }
}
class Inbox extends EventEmitter {
  constructor(root) { super(); this.file = path.join(root, 'inbox.json'); this.items = readJson(this.file, []).slice(0, 200); }
  save() { atomicJson(this.file, this.items); this.emit('changed'); }
  add(raw) {
    if (raw.key && this.items.some(x => x.key === raw.key)) return;
    const item = { id: crypto.randomUUID(), at: Date.now(), read: false, title: short(raw.title), message: short(raw.message, 1200), sessionId: raw.sessionId || null, resultId: raw.resultId || null, reviewId: raw.reviewId || null, kind: raw.kind || 'ready', key: raw.key || null };
    if (['usage', 'tools'].includes(raw.destination)) item.destination = raw.destination;
    this.items = [item, ...this.items].slice(0, 200); this.save(); this.emit('added', item); return item;
  }
  update({ id, action }) {
    if (action === 'clear-all') this.items = [];
    else if (action === 'clear-read') this.items = this.items.filter(x => !x.read);
    else if (action === 'dismiss') this.items = this.items.filter(x => x.id !== id);
    else if (action === 'read') { const item = this.items.find(x => x.id === id); if (item) item.read = true; }
    else throw new Error('Unknown inbox action.');
    this.save();
  }
  acknowledgeSession(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId) return;
    const unread = this.items.filter(item => item.sessionId === sessionId && !item.read && ['ready', 'question'].includes(item.kind));
    if (!unread.length) return;
    for (const item of unread) item.read = true;
    this.save();
  }
}
module.exports = { Results, Inbox, inside };
