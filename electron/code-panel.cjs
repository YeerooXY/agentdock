'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const { snapshot } = require('./turns.cjs');
const { ignoredCaptureFile, sameSnapshotFile } = require('./capture-files.cjs');
const exec = promisify(execFile);
const MAX_TEXT = 256 * 1024;
const PRIVATE = /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|\.codex|\.claude|\.kiro|\.kimi|\.ssh|credentials?[^/]*|secrets?[^/]*|auth\.json|vault[^/]*|id_rsa|id_ed25519|google-services\.json|[^/]*\.(?:pem|p12|pfx|key|keystore|jks))(\/|$)/i;
const privateContent = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{24,}|AKIA[A-Z0-9]{16}|gh[pousr]_[a-zA-Z0-9]{30,})/;
const permitted = name => !PRIVATE.test(name) && !ignoredCaptureFile(name);
const within = (root, file) => { const r = path.relative(root, file); return r === '' || (!r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r)); };
const key = session => session.consoleKey || session.id;
const git = async (cwd, args) => (await exec('git', ['-c', 'core.fsmonitor=false', '-C', cwd, ...args], { windowsHide: true, timeout: 8000, maxBuffer: 2 * 1024 * 1024 })).stdout;

class CodePanel {
  constructor(sessions, { onChange = () => {}, getSecrets = () => [], getProjects = () => [] } = {}) {
    this.sessions = sessions; this.onChange = onChange; this.getSecrets = getSecrets;
    this.getProjects = getProjects;
    this.baselines = new Map(); this.latest = new Map(); this.pending = new Map(); this.revision = 0;
  }
  panel(id) { const p = this.sessions.items.get(id); if (!p?.alive || p.kind !== 'code') throw new Error('Open a code panel first.'); return p; }
  create(raw = {}, defaultCwd) {
    const source = this.sessions.items.get(raw?.sourceId);
    if (source?.remote || source?.remoteHostId || source?.kind) throw new Error('Choose a local agent console.');
    const cwd = raw?.root !== undefined ? this.explorerRoot(raw.root) : source?.cwd || defaultCwd;
    return this.sessions.createCodePanel({ cwd, codeSourceKey: source && raw?.root === undefined ? key(source) : null, slot: raw?.slot });
  }
  explorerRoot(root) {
    if (typeof root !== 'string' || !path.isAbsolute(root) || root.includes('\0') || root.split(/[\\/]/).includes('..')) throw new Error('Choose an available local folder.');
    const roots = [...this.sessions.list().filter(s => s.alive && !s.remote && !s.remoteHostId && !s.kind).map(s => s.cwd), ...this.getProjects().flatMap(p => p.folders.map(f => f.path))];
    if (!roots.some(p => typeof p === 'string' && path.resolve(p) === path.resolve(root))) throw new Error('Choose an available local folder.');
    return path.resolve(root);
  }
  async list(root, relative = '') {
    root = this.explorerRoot(root);
    if (typeof relative !== 'string' || relative.split(/[\\/]/).includes('..')) throw new Error('Choose a folder inside this root.');
    const panel = { cwd: root, codeSourceKey: null };
    let target, name, all;
    try {
      ({ target, name } = await this.resolve(panel, relative));
      all = await fs.readdir(target, { withFileTypes: true });
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) throw new Error('Choose a folder inside this root.');
      throw error;
    }
    const entries = all.filter(x => !x.isSymbolicLink() && (x.isDirectory() || x.isFile()) && permitted([name, x.name].filter(Boolean).join('/')))
      .map(x => ({ name: x.name, path: [name, x.name].filter(Boolean).join('/'), directory: x.isDirectory() }))
      .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
    return { entries: entries.slice(0, 500), truncated: entries.length > 500 };
  }
  source(panel) { return this.sessions.list().find(s => !s.remote && key(s) === panel.codeSourceKey) || { cwd: panel.cwd, consoleKey: panel.codeSourceKey || panel.cwd, name: path.basename(panel.cwd) }; }
  watched(session) { return this.sessions.codePanels().some(p => p.codeSourceKey ? p.codeSourceKey === key(session) : p.cwd === session.cwd); }
  clean(text) {
    if (typeof text !== 'string' || text.length > MAX_TEXT || text.includes('\0')) return null;
    if (privateContent.test(text)) return null;
    for (const secret of this.getSecrets().filter(v => typeof v === 'string' && v.length > 5)) text = text.split(secret).join('[redacted]');
    return text;
  }
  async resolve(panel, relative = '') {
    if (typeof relative !== 'string' || relative.length > 2000 || path.isAbsolute(relative) || relative.includes('\0') || relative.includes(':')) throw new Error('Choose a file inside this project.');
    const root = await fs.realpath(this.source(panel).cwd), name = relative.replaceAll('\\', '/');
    if (!permitted(name)) throw new Error('Credential and generated files are excluded from the code panel.');
    const target = path.resolve(root, name);
    if (!within(root, target)) throw new Error('Choose a file inside this project.');
    const real = await fs.realpath(target);
    if (!within(root, real)) throw new Error('Links outside this project are excluded.');
    if (!permitted(path.relative(root, real).replaceAll('\\', '/'))) throw new Error('Credential and generated files are excluded from the code panel.');
    return { root, target: real, name };
  }
  async browse(id, relative = '') {
    const panel = this.panel(id), { target, name } = await this.resolve(panel, relative);
    const all = await fs.readdir(target, { withFileTypes: true });
    const items = all.filter(x => !x.isSymbolicLink() && (x.isDirectory() || x.isFile()) && permitted([name, x.name].filter(Boolean).join('/')))
      .map(x => ({ name: x.name, path: [name, x.name].filter(Boolean).join('/'), directory: x.isDirectory() }))
      .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
    return { path: name, items: items.slice(0, 500), truncated: items.length > 500 };
  }
  async read(panel, relative) {
    const { target, root } = await this.resolve(panel, relative), stat = await fs.stat(target);
    if (!stat.isFile() || stat.size > MAX_TEXT) throw new Error('Preview supports text files up to 256 KB.');
    const buffer = await fs.readFile(target);
    if (!within(root, await fs.realpath(target))) throw new Error('The file moved outside this project.');
    const text = this.clean(buffer.includes(0) ? null : buffer.toString('utf8'));
    if (text == null) throw new Error('Binary files and possible credentials have no code preview.');
    return text;
  }
  async begin(session, turn) {
    if (!session || session.remote || session.kind === 'code' || session.kind === 'web' || !this.watched(session)) return;
    try { this.baselines.set(session.id, { id: turn.id, before: await snapshot(session.cwd, { maxFiles: 5000, maxBytes: 8 * 1024 * 1024, exclude: name => !permitted(name) }) }); }
    catch { this.baselines.set(session.id, { id: turn.id, error: true }); }
  }
  remember(sourceKey, report) {
    this.latest.delete(sourceKey); this.latest.set(sourceKey, report);
    while (this.latest.size > 8) this.latest.delete(this.latest.keys().next().value);
    ++this.revision; this.onChange(); return report;
  }
  async finish(session, turn) {
    const captured = this.baselines.get(session?.id); this.baselines.delete(session?.id);
    if (!captured || captured.id !== turn.id || !this.watched(session)) return;
    try {
      if (captured.error) throw new Error();
      const after = await snapshot(session.cwd, { maxFiles: 5000, maxBytes: 8 * 1024 * 1024, exclude: name => !permitted(name) }), before = captured.before;
      const changes = [];
      for (const name of new Set([...before.files.keys(), ...after.files.keys()])) {
        if (!permitted(name)) continue;
        const a = before.files.get(name), b = after.files.get(name);
        if (sameSnapshotFile(a, b) || (!b && !after.complete) || (!a && !before.complete)) continue;
        changes.push({ file: name, type: !a ? 'added' : !b ? 'deleted' : 'modified', before: !a ? '' : this.clean(a.text), after: !b ? '' : this.clean(b.text), omitted: a?.omitted || b?.omitted || null });
        if (changes.length >= 100) break;
      }
      this.remember(key(session), { id: turn.id, mode: 'turn', at: Date.now(), source: session.name, git: { before: before.git, after: after.git }, changes,
        notes: [...new Set([...before.notes, ...after.notes, 'Folder changes during this turn; other editors and agents may contribute.', ...(changes.length >= 100 ? ['Showing the first 100 changed files.'] : [])])] });
    } catch { this.remember(key(session), { id: turn.id, mode: 'turn', at: Date.now(), changes: [], notes: ['This turn could not be captured. Refresh to view current working-tree changes.'] }); }
  }
  async working(panel) {
    const source = this.source(panel), changes = [], notes = [];
    try {
      const root = (await git(source.cwd, ['rev-parse', '--show-toplevel'])).trim();
      const output = await git(source.cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.']);
      const records = output.split('\0').filter(Boolean);
      for (let i = 0; i < records.length && changes.length < 100; i++) {
        const status = records[i].slice(0, 2), repoName = records[i].slice(3), oldName = /[RC]/.test(status) ? records[++i] : repoName;
        const file = path.relative(source.cwd, path.join(root, repoName)).replaceAll('\\', '/');
        if (!file || !within(path.resolve(source.cwd), path.resolve(root, repoName)) || !permitted(file)) continue;
        const previous = path.relative(source.cwd, path.resolve(root, oldName || repoName)).replaceAll('\\', '/');
        if (!within(path.resolve(source.cwd), path.resolve(root, oldName || repoName)) || !permitted(previous)) continue;
        let before = '', after = '', omitted = null;
        if (status !== '??' && status[0] !== 'A') {
          try { before = this.clean(await git(root, ['show', `HEAD:${oldName}`])); } catch { before = null; }
        }
        try { after = await this.read(panel, file); } catch (error) { if (error.code !== 'ENOENT') { after = null; omitted = 'Preview unavailable: large, binary, private or linked file.'; } }
        changes.push({ file, type: /D/.test(status) ? 'deleted' : status === '??' || status[0] === 'A' ? 'added' : /[RC]/.test(status) ? 'renamed' : 'modified', before, after, omitted });
      }
      if (changes.length >= 100) notes.push('Showing the first 100 changed files.');
    } catch { notes.push('No Git changes available. Use Browse files to read this folder.'); }
    return { id: randomUUID(), mode: 'working', at: Date.now(), source: source.name, changes, notes };
  }
  async report(id, refresh = false) {
    const panel = this.panel(id), source = this.source(panel), sourceKey = key(source);
    if (!refresh && this.latest.has(sourceKey)) return this.publicReport(this.latest.get(sourceKey));
    if (!this.pending.has(sourceKey)) {
      const startedRevision = this.revision;
      const task = this.working(panel).then(report => {
        if (this.revision !== startedRevision && this.latest.get(sourceKey)?.mode === 'turn') return this.latest.get(sourceKey);
        return this.remember(sourceKey, report);
      }).finally(() => this.pending.delete(sourceKey)); this.pending.set(sourceKey, task);
    }
    return this.publicReport(await this.pending.get(sourceKey));
  }
  publicReport(report) { return { ...report, changes: report.changes.map(({ before, after, ...item }) => item) }; }
  async file(id, relative, reportId) {
    const panel = this.panel(id);
    if (reportId) {
      const report = this.latest.get(key(this.source(panel)));
      if (report?.id !== reportId) throw new Error('The changes have updated. Refresh the file list.');
      const item = report.changes.find(x => x.file === relative);
      if (!item) throw new Error('Choose a file from these changes.');
      return { ...item, reportId, mode: report.mode };
    }
    return { file: relative, after: await this.read(panel, relative), before: null, mode: 'file' };
  }
}
module.exports = { CodePanel, permitted };
