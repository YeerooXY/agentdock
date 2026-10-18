'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID, createHash } = require('node:crypto');
const { createTwoFilesPatch } = require('diff');
const { EventEmitter } = require('node:events');
const exec = promisify(execFile);
const IMAGE = /\.(png|jpe?g|webp)$/i;
const SKIP = /(^|\/)(\.git|node_modules|\.dart_tool|\.build|build|dist|release|vendor|\.gradle|\.idea|\.next|coverage|\.venv|venv)(\/|$)/i;
const SECRET = /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|credentials?[^/]*|secrets?[^/]*|vault[^/]*|id_rsa|id_ed25519|google-services\.json|[^/]*\.(?:pem|p12|pfx|key|keystore|jks))$/i;
const inside = (root, target) => { const r = path.relative(root, target); return r && !r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r); };
const hash = value => createHash('sha256').update(value).digest('hex');
async function gitInfo(root) {
  const options = { windowsHide: true, maxBuffer: 8192, timeout: 2000 };
  const [branch, head] = await Promise.allSettled([
    exec('git', ['-C', root, 'symbolic-ref', '--quiet', '--short', 'HEAD'], options),
    exec('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], options)
  ]);
  const name = branch.status === 'fulfilled' ? branch.value.stdout.trim() : null;
  const commit = head.status === 'fulfilled' && /^[a-f0-9]{40,64}$/i.test(head.value.stdout.trim()) ? head.value.stdout.trim() : null;
  return name || commit ? { branch: name, commit, detached: !name } : null;
}
// Bound snapshots without touching Git's index, HEAD, or the user's working tree.
async function snapshot(project, { maxFiles = 10000, maxBytes = 32 * 1024 * 1024 } = {}) {
  const root = await fs.realpath(project), files = new Map(), notes = [], git = await gitInfo(root); const deadline = Date.now() + 9000; let complete = true;
  let names;
  try { names = (await exec('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'], { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 8000 })).stdout.split('\0').filter(Boolean); }
  catch {
    notes.push('No Git inventory. Common build and credential folders are excluded.');
    names = [];
    let visited = 0;
    async function walk(dir, prefix = '') {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (++visited >= maxFiles * 2 || names.length >= maxFiles || Date.now() > deadline) { complete = false; return; }
        const name = prefix + entry.name;
        if (SKIP.test(name) || SECRET.test(name) || entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), name + '/');
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
    if (SKIP.test(relative) || SECRET.test(relative)) continue;
    const target = path.resolve(root, name);
    if (!inside(root, target)) continue;
    try {
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || !inside(root, await fs.realpath(target))) continue;
      // The metadata of large/budget-excluded files is reported, never silently called unchanged.
      if (stat.size > 1024 * 1024 || bytes + stat.size > maxBytes) {
        files.set(relative, { signature: `${stat.size}:${stat.mtimeMs}`, omitted: 'Large file or snapshot limit', image: IMAGE.test(relative) }); continue;
      }
      const buffer = await fs.readFile(target); bytes += buffer.length;
      const text = !buffer.includes(0) && !IMAGE.test(relative) ? buffer.toString('utf8') : null;
      // Do not turn credentials accidentally embedded in code into gallery copies.
      if (text && /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{24,}|AKIA[A-Z0-9]{16}|gh[pousr]_[a-zA-Z0-9]{30,})/.test(text)) {
        files.set(relative, { signature: hash(buffer), omitted: 'Possible credential content excluded' }); continue;
      }
      files.set(relative, { signature: hash(buffer), text, image: IMAGE.test(relative), omitted: text === null ? 'Binary file' : null });
    } catch (error) { if (error.code !== 'ENOENT') notes.push(`Could not read ${relative}.`); }
  }
  if (!complete) notes.push('Partial snapshot. Changes outside the captured files are not included.');
  return { root, files, notes, complete, git };
}
class Turns extends EventEmitter {
  constructor(results, { getSession, getSecrets = () => [], enabled = true } = {}) {
    super(); this.results = results; this.getSession = getSession; this.getSecrets = getSecrets;
    this.enabled = enabled;
    this.active = new Map(); this.latest = new Map(); this.queues = new Map(); this.virtual = new Map();
  }
  session(owner) { return this.getSession?.(owner) || this.virtual.get(owner); }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) for (const turn of this.active.values()) {
      turn.capture = false; delete turn.baseline; turn.error = '';
    }
  }
  context(owner) {
    const s = this.session(owner); if (!s) return null;
    const turn = this.active.get(owner) || this.latest.get(owner);
    return { project: s.cwd, projectId: s.projectId || null, sessionId: s.id, consoleKey: s.consoleKey || s.id, consoleName: s.name, ...(turn ? { turnId: turn.id, git: turn.git } : {}) };
  }
  serial(owner, fn) {
    const task = (this.queues.get(owner) || Promise.resolve()).catch(() => {}).then(fn);
    this.queues.set(owner, task); task.finally(() => { if (this.queues.get(owner) === task) this.queues.delete(owner); }).catch(() => {}); return task;
  }
  begin(owner) { return this.serial(owner, async () => {
    if (this.active.has(owner)) return this.active.get(owner).id;
    const session = this.session(owner); if (!session?.alive) return null;
    const turn = { id: randomUUID(), startedAt: Date.now(), consoleName: session.name, overlap: false, baseline: null, error: '', capture: this.enabled };
    this.active.set(owner, turn);
    for (const [other, current] of this.active) {
      if (other === owner) continue;
      const a = path.resolve(this.session(other)?.cwd || ''), b = path.resolve(session.cwd);
      if (a === b || inside(a, b) || inside(b, a)) current.overlap = turn.overlap = true;
    }
    if (turn.capture) {
      try {
        const baseline = await snapshot(session.cwd);
        if (turn.capture && this.enabled) { turn.baseline = baseline; turn.git = baseline.git; }
      } catch { if (turn.capture && this.enabled) turn.error = 'The project baseline could not be read.'; }
    }
    this.emit('started', { owner, id: turn.id }); return turn.id;
  }); }
  finish(owner, status = 'needs-review') { return this.serial(owner, async () => {
    const turn = this.active.get(owner); if (!turn) return null;
    const context = this.context(owner), changes = [], notes = [...(turn.baseline?.notes || [])]; let endGit = turn.git || null;
    if (turn.error) notes.push(turn.error);
    if (turn.overlap) notes.push('Other consoles were active in this folder. Changes are a folder snapshot; authorship may overlap.');
    try {
      if (!turn.capture || !this.enabled) return turn.id;
      if (turn.baseline) {
        const baseline = turn.baseline;
        const after = await snapshot(context.project);
        if (!turn.capture || !this.enabled) return turn.id;
        notes.push(...after.notes);
        endGit = after.git;
        if (turn.git?.branch !== endGit?.branch) notes.push('The Git branch changed during this turn.');
        const redact = value => { for (const secret of this.getSecrets().filter(x => x && x.length > 5)) value = value.split(secret).join('[redacted]'); return value; };
        let imageCount = 0, patchBytes = 0;
        const diffDeadline = Date.now() + 3000;
        for (const file of new Set([...baseline.files.keys(), ...after.files.keys()])) {
          const before = baseline.files.get(file), next = after.files.get(file);
          if (!before && !baseline.complete || !next && !after.complete) continue;
          if (before?.signature === next?.signature) continue;
          if (changes.length >= 1000) { notes.push('Only the first 1,000 changed files are listed. Review the remaining changes in your project.'); break; }
          const change = { file, type: !before ? 'added' : !next ? 'deleted' : 'modified', patch: null, omitted: before?.omitted || next?.omitted || null };
          if (!change.omitted && patchBytes < 1200000 && Date.now() < diffDeadline) {
            const patch = createTwoFilesPatch(file, file, before?.text || '', next?.text || '', '', '', { context: 3, timeout: Math.min(500, Math.max(1, diffDeadline - Date.now())) });
            change.patch = typeof patch === 'string' ? redact(patch) : null;
            if (change.patch === null) change.omitted = 'Diff calculation time limit reached';
            else if (Buffer.byteLength(change.patch) > 200000) { change.patch = null; change.omitted = 'Diff exceeds 200 KB'; }
            else patchBytes += Buffer.byteLength(change.patch);
          } else if (!change.omitted) change.omitted = 'Turn diff limit reached';
          changes.push(change);
          if (next?.image && ++imageCount <= 20 && !this.results.items.some(x => x.groupId === turn.id && x.originalFile === file)) {
            try { this.results.add({ file: path.join(context.project, file), title: path.basename(file), kind: 'screenshot', groupId: turn.id, originalFile: file }, context); } catch { notes.push(`Image not copied: ${file}.`); }
          }
        }
      }
      if (changes.length || notes.length || this.results.items.some(x => x.groupId === turn.id)) {
        const report = { version: 2, turnId: turn.id, startedAt: turn.startedAt, finishedAt: Date.now(), git: { before: turn.git || null, after: endGit }, attribution: turn.overlap ? 'overlapping-folder-activity' : 'folder-during-turn', notes: [...new Set(notes)], changes };
        this.results.add({ text: JSON.stringify(report), ext: '.json', title: `${changes.length} changed ${changes.length === 1 ? 'file' : 'files'}`, kind: 'code', status, summary: turn.overlap ? 'Overlapping console activity' : 'Changes during this turn', groupId: turn.id }, context);
      }
    } catch { this.emit('tracking-error', { owner, message: 'This turn’s code changes could not be saved.' }); }
    finally { this.active.delete(owner); delete turn.baseline; this.latest.set(owner, turn); if (this.latest.size > 100) this.latest.delete(this.latest.keys().next().value); this.emit('finished', { owner, id: turn.id }); }
    return turn.id;
  }); }
}
module.exports = { Turns, snapshot };
