'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { readJson, atomicJson } = require('./storage.cjs');

// User-level skill folders, reviewed 2026-10-25 against each agent's docs and
// the vercel-labs/skills agent table. ~/.agents/skills is the shared Agent
// Skills location; the others serve agents that do not read it.
const targets = [
  { id: 'agents', dir: ['.agents', 'skills'], agents: ['codex', 'gemini', 'copilot', 'cursor', 'opencode', 'kimi', 'cline', 'pi'], always: true },
  { id: 'claude', dir: ['.claude', 'skills'], agents: ['claude'] },
  { id: 'kiro', dir: ['.kiro', 'skills'], agents: ['kiro'] },
  { id: 'qwen', dir: ['.qwen', 'skills'], agents: ['qwen'] },
  { id: 'droid', dir: ['.factory', 'skills'], agents: ['droid'] },
  { id: 'grok', dir: ['.grok', 'skills'], agents: ['grok'] },
  { id: 'antigravity', dir: ['.gemini', 'antigravity', 'skills'], agents: ['antigravity'] }
];
const MANIFEST = '.paddock-skill.json', LIMIT = { files: 2000, bytes: 50 * 1024 * 1024 };
const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text); if (!match) return {};
  return Object.fromEntries(match[1].split(/\r?\n/).map(line => /^([a-z_-]+):\s*(.*)$/i.exec(line)).filter(Boolean).map(([, key, value]) => [key, value.replace(/^(['"])(.*)\1$/, '$2').trim()]));
}
// Relative file list with hashes. Links are skipped so a pack cannot pull in
// files from outside its folder.
function walk(root) {
  const files = {}; let bytes = 0;
  const visit = relative => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const rel = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink() || entry.name === MANIFEST || entry.name === '__pycache__') continue;
      if (entry.isDirectory()) { visit(rel); continue; }
      if (!entry.isFile()) continue;
      const data = fs.readFileSync(path.join(root, rel)); bytes += data.length;
      if (Object.keys(files).length >= LIMIT.files || bytes > LIMIT.bytes) throw Error('This skill pack is too large to install.');
      files[rel] = hash(data);
    }
  };
  visit(''); return { files, bytes };
}
function linkLike(file) { try { const stat = fs.lstatSync(file); return stat.isSymbolicLink(); } catch { return false; } }

class SkillPacks {
  constructor(root, { home = os.homedir(), bundled = path.join(__dirname, '..', 'skills'), getAgents = () => [], downloads = null, onChange = () => {} } = {}) {
    Object.assign(this, { root, home, bundled, getAgents, downloads, onChange });
    this.local = path.join(root, 'skill-packs'); this.file = path.join(root, 'skill-packs.json');
    this.busy = false; this.cache = null;
  }
  // Bundled packs ship with Paddock. Local packs live in the profile folder and
  // never enter the repository or a release.
  packs() {
    const found = new Map();
    for (const [source, base] of [['bundled', this.bundled], ['local', this.local]]) {
      let entries = []; try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch {}
      for (const entry of entries) {
        if (!entry.isDirectory() || !validId(entry.name) || found.has(entry.name)) continue;
        const dir = path.join(base, entry.name);
        let text; try { text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8'); } catch { continue; }
        const meta = frontmatter(text), title = /^# (.+)$/m.exec(text.replace(/^---[\s\S]*?\n---/, ''))?.[1].trim();
        if (meta.name !== entry.name || !meta.description) continue;
        found.set(entry.name, { id: entry.name, name: (title || meta.name).slice(0, 80), description: meta.description.slice(0, 600), source, dir });
      }
    }
    return [...found.values()];
  }
  pack(id) { const item = this.packs().find(x => x.id === id); if (!item) throw Error('Choose an available skill pack.'); return item; }
  targetDir(target) { return path.join(this.home, ...target.dir); }
  // Folders for the agents installed now; the shared folder is always included.
  applicable() {
    const installed = new Set(this.getAgents().filter(x => x.installed).map(x => x.id)), names = new Map(this.getAgents().map(x => [x.id, x.name]));
    return targets.filter(t => t.always || t.agents.some(id => installed.has(id)))
      .map(t => ({ ...t, path: this.targetDir(t), agentNames: t.agents.filter(id => installed.has(id)).map(id => names.get(id) || id) }));
  }
  inspect(pack, folder, expected) {
    const dest = path.join(folder, pack.id);
    if (!fs.existsSync(dest)) return { state: 'not-installed' };
    if (linkLike(dest)) return { state: 'conflict' };
    const manifest = readJson(path.join(dest, MANIFEST), null);
    if (!manifest || manifest.pack !== pack.id || !manifest.files) return { state: 'conflict' };
    const current = walk(dest).files;
    const modified = Object.entries(manifest.files).filter(([rel, sum]) => current[rel] !== sum).map(([rel]) => rel)
      .concat(Object.keys(current).filter(rel => !(rel in manifest.files)));
    if (modified.length) return { state: 'modified', modified: modified.slice(0, 20) };
    return { state: manifest.version === expected ? 'installed' : 'outdated' };
  }
  list() {
    const applicable = this.applicable();
    this.cache = this.packs().map(pack => {
      let version = null, size = 0, error = null;
      try { const files = walk(pack.dir); version = hash(JSON.stringify(Object.entries(files.files).sort())).slice(0, 12); size = files.bytes; } catch (e) { error = e.message; }
      return { id: pack.id, name: pack.name, description: pack.description, source: pack.source, version, size, error,
        targets: applicable.map(t => ({ id: t.id, path: path.join(t.path, pack.id), agents: t.agentNames, ...this.inspect(pack, t.path, version) })) };
    });
    return this.cache;
  }
  snapshot() { if (!this.cache) { try { this.list(); } catch { this.cache = []; } } return { packs: this.cache, busy: this.busy }; }
  record() {
    const installed = [];
    for (const pack of this.cache || []) for (const t of pack.targets) if (['installed', 'outdated', 'modified'].includes(t.state)) installed.push({ pack: pack.id, directory: t.path });
    atomicJson(this.file, installed); this.downloads?.writeReport();
  }
  async run(work) {
    if (this.busy) throw Error('A skill pack change is already running.');
    this.busy = true; this.onChange();
    try { return work(); } finally { this.busy = false; this.list(); this.record(); this.onChange(); }
  }
  install(id) {
    return this.run(() => {
      const pack = this.pack(id), { files } = walk(pack.dir);
      const version = hash(JSON.stringify(Object.entries(files).sort())).slice(0, 12), results = [];
      for (const target of this.applicable()) {
        const status = this.inspect(pack, target.path, version), dest = path.join(target.path, pack.id);
        if (status.state === 'installed') { results.push({ target: target.id, state: 'installed' }); continue; }
        if (status.state === 'conflict') { results.push({ target: target.id, state: 'skipped', reason: `${dest} already exists and was not installed by Paddock. It was left unchanged.` }); continue; }
        if (status.state === 'modified') { results.push({ target: target.id, state: 'skipped', reason: `Files in ${dest} were changed after install. Restore or remove them, then update.` }); continue; }
        if (linkLike(target.path)) { results.push({ target: target.id, state: 'skipped', reason: `${target.path} is a link. It was left unchanged.` }); continue; }
        fs.mkdirSync(target.path, { recursive: true });
        const stage = path.join(target.path, `.${pack.id}.paddock-${crypto.randomUUID().slice(0, 8)}`);
        try {
          for (const rel of Object.keys(files)) {
            const to = path.join(stage, ...rel.split('/')); fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.writeFileSync(to, fs.readFileSync(path.join(pack.dir, ...rel.split('/'))));
          }
          atomicJson(path.join(stage, MANIFEST), { pack: pack.id, version, source: pack.source, installedAt: Date.now(), files });
          if (status.state === 'outdated') { const old = stage + '-old'; fs.renameSync(dest, old); fs.renameSync(stage, dest); fs.rmSync(old, { recursive: true, force: true }); }
          else fs.renameSync(stage, dest);
          results.push({ target: target.id, state: status.state === 'outdated' ? 'updated' : 'installed' });
        } catch (error) {
          fs.rmSync(stage, { recursive: true, force: true });
          results.push({ target: target.id, state: 'failed', reason: `Could not write ${dest}.` });
        }
      }
      return results;
    });
  }
  // Removes only unchanged files Paddock installed. Changed or added files stay.
  uninstall(id) {
    return this.run(() => {
      if (!validId(id)) throw Error('Choose an available skill pack.');
      const results = [];
      for (const target of targets) {
        const dest = path.join(this.targetDir(target), id);
        if (!fs.existsSync(dest) || linkLike(dest)) continue;
        const manifest = readJson(path.join(dest, MANIFEST), null);
        if (!manifest || manifest.pack !== id || !manifest.files) continue;
        const current = walk(dest).files, kept = [];
        for (const [rel, sum] of Object.entries(current)) {
          if (manifest.files[rel] === sum) fs.rmSync(path.join(dest, ...rel.split('/')));
          else kept.push(rel);
        }
        fs.rmSync(path.join(dest, MANIFEST), { force: true });
        // Python caches created by a pack's own scripts are regenerated on demand.
        const prune = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory() && !entry.isSymbolicLink()) entry.name === '__pycache__' ? fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true }) : prune(path.join(dir, entry.name)); if (!fs.readdirSync(dir).length) fs.rmdirSync(dir); };
        prune(dest);
        results.push(kept.length ? { target: target.id, state: 'kept', reason: `Your changed files stay in ${dest}: ${kept.slice(0, 5).join(', ')}${kept.length > 5 ? '…' : ''}` } : { target: target.id, state: 'removed' });
      }
      return results;
    });
  }
}
module.exports = { SkillPacks, targets, frontmatter, MANIFEST };
