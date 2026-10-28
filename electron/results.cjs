'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { atomicJson, readJson } = require('./storage.cjs');
const { previewArchive } = require('./result-archive.cjs');
const { cleanGit } = require('./git-context.cjs');
const { captureChanges } = require('./capture-files.cjs');
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
    // Older captures did not store the count. Read only our bounded code reports,
    // so empty snapshot diagnostics do not become prominent gallery cards.
    for (const item of this.items) if (item.kind === 'code' && item.ext === '.json' && (item.captureFilterVersion !== 1 || !Object.hasOwn(item, 'gitEnd')) && item.size < 2 * 1024 * 1024) {
      try {
        const report = JSON.parse(fs.readFileSync(this.path(item.id), 'utf8'));
        if (Array.isArray(report.changes)) {
          item.changeCount = captureChanges(report.changes).length;
          item.captureExcludedOnly = report.changes.length > 0 && item.changeCount === 0;
          item.captureFilterVersion = 1;
          if (/^\d+ changed files?$/.test(item.title)) item.title = `${item.changeCount} changed ${item.changeCount === 1 ? 'file' : 'files'}`;
        }
        item.git ||= cleanGit(report.git?.before);
        item.gitEnd = cleanGit(report.git?.after);
      } catch {}
    }
    this.trash = trash; this.nativeImage = nativeImage; this.deleting = false;
  }
  list() { return this.items.filter(x => !x.captureExcludedOnly).map(x => ({ ...x, image: imageExtensions.has(x.ext) })); }
  groupKey(item) { return JSON.stringify([item.projectId || item.project || '', item.consoleKey || item.sessionId || item.source || 'Dock', item.groupId || item.id]); }
  unreadGroups() { return new Set(this.list().filter(x => !x.seenAt).map(x => this.groupKey(x))).size; }
  markSeen(ids) {
    if (!Array.isArray(ids) || ids.length > 1000) throw new Error('Choose results to mark as seen.');
    const seen = new Set(ids), at = Date.now();
    if (this.items.some(x => seen.has(x.id) && !x.seenAt)) this.persist(this.items.map(x => seen.has(x.id) ? { ...x, seenAt: x.seenAt || at } : x));
  }
  renameConsole(consoleKey, name) {
    // A slot can be reused for another project. Historical attribution is immutable.
  }
  finishGit(turnId, consoleKey, repository, git) {
    const end = cleanGit(git); if (!end || end.repository !== repository) return;
    this.persist(this.items.map(item => item.groupId === turnId && item.consoleKey === consoleKey && item.git?.repository === repository ? { ...item, gitEnd: end } : item));
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
  add(raw, { project = '', projectId = null, sessionId = null, consoleKey = null, consoleName = '', trusted = false, turnId = '', git = null } = {}) {
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
    item.projectId = projectId;
    if (item.kind === 'code' && ext === '.json') { try { const report = JSON.parse(buffer.toString('utf8')); if (Array.isArray(report.changes)) { item.changeCount = captureChanges(report.changes).length; item.captureExcludedOnly = report.changes.length > 0 && item.changeCount === 0; item.captureFilterVersion = 1; if (/^\d+ changed files?$/.test(item.title)) item.title = `${item.changeCount} changed ${item.changeCount === 1 ? 'file' : 'files'}`; } item.gitEnd = cleanGit(report.git?.after); } catch {} }
    if (git) item.git = cleanGit(git);
    this.persist([item, ...this.items]); return item;
  }
  preview(id, thumbnail = false, entry = null) {
    const item = this.items.find(x => x.id === id), file = this.path(id);
    if (item.ext === '.zip') return previewArchive(file, { entry, thumbnail, nativeImage: this.nativeImage });
    if (item.kind === 'code' && item.ext === '.json' && item.size < 2 * 1024 * 1024) {
      const diff = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { diff: { ...diff, changes: captureChanges(diff.changes) } };
    }
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
  updateText(id, raw) {
    const item = this.items.find(x => x.id === id);
    if (!item || item.ext !== '.md' || typeof raw.text !== 'string' || Buffer.byteLength(raw.text) > 2 * 1024 * 1024) throw new Error('The report could not be updated.');
    const file = this.path(id), temp = file + '.tmp';
    try { fs.writeFileSync(temp, raw.text, { mode: 0o600 }); fs.renameSync(temp, file); }
    finally { try { fs.unlinkSync(temp); } catch {} }
    const updated = { ...item, size: Buffer.byteLength(raw.text), status: raw.status, summary: short(raw.summary, 1500) };
    this.persist(this.items.map(x => x.id === id ? updated : x)); return updated;
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
module.exports = { Results, inside };
