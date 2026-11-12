'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID, createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { gitInfo } = require('./git-context.cjs');
const { ignoredCaptureFile, sameSnapshotFile } = require('./capture-files.cjs');
const exec = promisify(execFile);
const IMAGE = /\.(png|jpe?g|webp)$/i;
const SECRET = /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|credentials?[^/]*|secrets?[^/]*|vault[^/]*|id_rsa|id_ed25519|google-services\.json|[^/]*\.(?:pem|p12|pfx|key|keystore|jks))$/i;
const inside = (root, target) => { const r = path.relative(root, target); return r && !r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r); };
const hash = value => createHash('sha256').update(value).digest('hex');
// Bound snapshots without touching Git's index, HEAD, or the user's working tree.
async function snapshot(project, { maxFiles = 10000, maxBytes = 32 * 1024 * 1024, exclude = () => false } = {}) {
  const root = await fs.realpath(project), files = new Map(), notes = [], git = await gitInfo(root); const deadline = Date.now() + 9000; let complete = true;
  let names;
  try { names = (await exec('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'], { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 8000 })).stdout.split('\0').filter(Boolean); }
  catch {
    notes.push('No Git inventory. Common build and credential folders are excluded.');
    names = [];
    // A parent workspace may also contain projects without Git. Capturing those
    // recursively assigns their changes to whichever console finishes first.
    const entries = await fs.readdir(root, { withFileTypes: true });
    let workspace = false;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || ignoredCaptureFile(entry.name)) continue;
      try { await fs.lstat(path.join(root, entry.name, '.git')); workspace = true; break; } catch (error) { if (error.code !== 'ENOENT') complete = false; }
    }
    if (workspace) notes.push('Shared workspace: only files directly in this folder are captured. Open a console in the project folder to capture its files.');
    let visited = 0;
    async function walk(dir, prefix = '') {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (++visited >= maxFiles * 2 || names.length >= maxFiles || Date.now() > deadline) { complete = false; return; }
        const name = prefix + entry.name;
        if (ignoredCaptureFile(name) || SECRET.test(name) || exclude(name) || entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (workspace) continue;
          // A workspace containing several repositories is not one project.
          // Never automatically attribute sibling repository work to this turn.
          const child = path.join(dir, entry.name);
          try { await fs.lstat(path.join(child, '.git')); notes.push(`Separate repository excluded: ${name}. Open a console in that project to capture it.`); continue; } catch (error) { if (error.code !== 'ENOENT') { complete = false; continue; } }
          await walk(child, name + '/');
        }
        else if (entry.isFile()) names.push(name);
      }
    }
    await walk(root);
  }
  names = [...new Set(names)].sort();
  if (names.length >= maxFiles) { notes.push(`Inventory limited to ${maxFiles} files.`); complete = false; }
  let bytes = 0;
  for (const name of names.slice(0, maxFiles)) {
    if (Date.now() > deadline) { complete = false; notes.push('Snapshot time limit reached; remaining files were not captured.'); break; }
    const relative = name.replaceAll('\\', '/');
    if (ignoredCaptureFile(relative) || SECRET.test(relative) || exclude(relative)) continue;
    const target = path.resolve(root, name);
    if (!inside(root, target)) continue;
    try {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      const real = await fs.realpath(target), realName = path.relative(root, real).replaceAll('\\', '/');
      if (!inside(root, real) || ignoredCaptureFile(realName) || SECRET.test(realName) || exclude(realName)) continue;
      const metadata = `${stat.size}:${stat.mtimeMs}`;
      // The metadata of large/budget-excluded files is reported, never silently called unchanged.
      if (stat.size > 1024 * 1024 || bytes + stat.size > maxBytes) {
        files.set(relative, { signature: null, metadata, omitted: 'Large file or snapshot limit', image: IMAGE.test(relative) }); continue;
      }
      const buffer = await fs.readFile(target); bytes += buffer.length;
      const text = !buffer.includes(0) && !IMAGE.test(relative) ? buffer.toString('utf8') : null;
      // Do not turn credentials accidentally embedded in code into gallery copies.
      if (text && /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{24,}|AKIA[A-Z0-9]{16}|gh[pousr]_[a-zA-Z0-9]{30,})/.test(text)) {
        files.set(relative, { signature: hash(buffer), metadata, omitted: 'Possible credential content excluded' }); continue;
      }
      files.set(relative, { signature: hash(buffer), metadata, text, image: IMAGE.test(relative), omitted: text === null ? 'Binary file' : null });
    } catch (error) { if (error.code !== 'ENOENT') notes.push(`Could not read ${relative}.`); }
  }
  if (!complete) notes.push('Partial snapshot. Changes outside the captured files are not included.');
  return { root, files, notes, complete, git };
}
class Turns extends EventEmitter {
  constructor({ getSession } = {}) {
    super(); this.getSession = getSession;
    this.active = new Map(); this.latest = new Map(); this.queues = new Map(); this.virtual = new Map();
  }
  session(owner) { return this.getSession?.(owner) || this.virtual.get(owner); }
  context(owner) {
    const s = this.session(owner); if (!s) return null;
    const turn = this.active.get(owner) || this.latest.get(owner);
    return { ...(turn?.context || { project: s.cwd, projectId: s.projectId || null, sessionId: s.id, consoleKey: s.consoleKey || s.id, consoleName: s.name }), ...(turn ? { turnId: turn.id, git: turn.git } : {}) };
  }
  serial(owner, fn) {
    const task = (this.queues.get(owner) || Promise.resolve()).catch(() => {}).then(fn);
    this.queues.set(owner, task); task.finally(() => { if (this.queues.get(owner) === task) this.queues.delete(owner); }).catch(() => {}); return task;
  }
  begin(owner) { return this.serial(owner, async () => {
    if (this.active.has(owner)) return this.active.get(owner).id;
    const session = this.session(owner); if (!session?.alive || session.remote) return null;
    const turn = { id: randomUUID(), startedAt: Date.now(), consoleName: session.name, overlap: false };
    turn.context = { project: session.cwd, projectId: session.projectId || null, sessionId: session.id, consoleKey: session.consoleKey || session.id, consoleName: session.name };
    this.active.set(owner, turn);
    for (const [other, current] of this.active) {
      if (other === owner) continue;
      const a = path.resolve(current.context.project), b = path.resolve(turn.context.project);
      if (a === b || inside(a, b) || inside(b, a)) current.overlap = turn.overlap = true;
    }
    await this.codePanel?.begin(session, turn);
    this.emit('started', { owner, id: turn.id }); return turn.id;
  }); }
  finish(owner) { return this.serial(owner, async () => {
    const turn = this.active.get(owner);
    if (!turn) return this.latest.get(owner)?.id || null;
    try { await this.codePanel?.finish(this.session(owner), turn); }
    finally {
      this.active.delete(owner); this.latest.set(owner, turn);
      if (this.latest.size > 100) this.latest.delete(this.latest.keys().next().value);
      this.emit('finished', { owner, id: turn.id });
    }
    return turn.id;
  }); }

}
module.exports = { Turns, snapshot };
