'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { readJson, atomicJson } = require('./storage.cjs');
const { catalog, ensureCatalogPack, generateRootSkill } = require('./skill-catalog.cjs');
const policy = require('./skill-policy.cjs');

// User-level skill folders, reviewed 2026-10-25 against each agent's docs and
// the vercel-labs/skills agent table. ~/.agents/skills is the shared Agent
// Skills location; the others serve agents that do not read it.
const targets = [
  { id: 'agents', dir: ['.agents', 'skills'], agents: ['codex', 'copilot', 'cursor', 'opencode', 'kimi', 'cline', 'pi'], always: true },
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
function walk(root, { rejectLinks = false } = {}) {
  const files = {}; let bytes = 0;
  const visit = relative => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const rel = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink()) { if (rejectLinks) throw Error('Linked skill content is unavailable.'); continue; }
      if (entry.name === MANIFEST || entry.name === '__pycache__') continue;
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
function noLinkAncestors(file) {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    if (linkLike(current)) throw Error('Linked skill folders are not read or changed.');
    if (path.dirname(current) === current) return;
  }
}

const UPSTREAM_NAME = 'SKILL.upstream.md';
const GUIDE = { pack: 32 * 1024, total: 48 * 1024, readMax: 64 * 1024 };
const stripFrontmatter = text => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
// Points relative Markdown links at upstream SKILL.md files at their renamed path.
function rewriteLinks(text, rel, renames) {
  const fix = target => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return target;
    const [file, ...rest] = target.split(/(?=[#?])/);
    if (!file) return target;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), file));
    return [...renames].some(rel => rel.toLowerCase() === resolved.toLowerCase()) ? file.replace(/SKILL\.md$/i, UPSTREAM_NAME) + rest.join('') : target;
  };
  return text.replace(/(\]\(<?)([^)\s>]+)/g, (_, open, target) => open + fix(target))
    .replace(/^(\s{0,3}\[[^\]]+\]:\s*<?)(\S+?)(?=>?\s*$)/gm, (_, open, target) => open + fix(target));
}

class SkillPacks {
  constructor(root, { home = os.homedir(), bundled = path.join(__dirname, '..', 'skills'), getAgents = () => [], downloads = null, onChange = () => {}, catalogEntries = catalog, ensurePack = ensureCatalogPack, getPreferences = () => ({}) } = {}) {
    Object.assign(this, { root, home, bundled, getAgents, downloads, onChange, catalogEntries, ensurePack, getPreferences });
    this.local = path.join(root, 'skill-packs'); this.file = path.join(root, 'skill-packs.json');
    this.busy = false; this.cache = null; this.overrides = new Map();
  }
  // Effective automatic flag: a pending setAutomatic value, then the saved
  // preference (settings.skillAuto), then the trusted default.
  automatic(pack) {
    let map = {}; try { const value = this.getPreferences() || {}; map = value.skillAuto && typeof value.skillAuto === 'object' ? value.skillAuto : value; } catch {}
    if (this.overrides.has(pack.id)) { if (map[pack.id] === this.overrides.get(pack.id)) this.overrides.delete(pack.id); else return this.overrides.get(pack.id); }
    return typeof map[pack.id] === 'boolean' ? map[pack.id] : policy.metadata(pack).defaultAuto;
  }
  // Installed content derived from the untouched source and current policy.
  render(pack) {
    const { files: sourceHashes } = walk(pack.dir), out = new Map(), renames = new Set();
    for (const rel of Object.keys(sourceHashes)) out.set(rel, fs.readFileSync(path.join(pack.dir, ...rel.split('/'))));
    for (const rel of out.keys()) if (rel !== 'SKILL.md' && /^skill\.md$/i.test(path.posix.basename(rel))) {
      if ([...out.keys()].some(name => name.toLowerCase() === rel.replace(/SKILL\.md$/i, UPSTREAM_NAME).toLowerCase())) throw Error(`${rel.replace(/SKILL\.md$/i, UPSTREAM_NAME)} already exists in this pack.`);
      renames.add(rel);
    }
    for (const [rel, data] of [...out]) if (/\.md$/i.test(rel)) {
      const text = data.toString('utf8'), next = rewriteLinks(text, rel, renames);
      if (next !== text) out.set(rel, Buffer.from(next));
    }
    for (const rel of renames) { out.set(rel.replace(/SKILL\.md$/i, UPSTREAM_NAME), out.get(rel)); out.delete(rel); }
    const item = this.catalogEntries.find(x => x.id === pack.id && x.entry);
    let upstreamEntry = null;
    if (item) {
      if (!sourceHashes[item.entry]) throw Error('The downloaded skill pack is missing its upstream entry.');
      upstreamEntry = renames.has(item.entry) ? item.entry.replace(/SKILL\.md$/, UPSTREAM_NAME) : item.entry;
      out.set('SKILL.md', Buffer.from(generateRootSkill(item, { automatic: this.automatic(pack), entry: upstreamEntry, trigger: policy.metadata(pack).trigger })));
    } else {
      const automatic = this.automatic(pack), description = automatic ? 'Use when the task matches: ' + policy.metadata(pack).trigger : 'Use when explicitly requested. ' + pack.description;
      const head = `---\nname: ${pack.id}\ndescription: ${JSON.stringify(description.replace(/\s+/g, ' ').trim())}\n${automatic ? '' : 'disable-model-invocation: true\n'}---\n`;
      out.set('SKILL.md', Buffer.from(head + stripFrontmatter(out.get('SKILL.md').toString('utf8'))));
    }
    const files = Object.fromEntries([...out].map(([rel, data]) => [rel, hash(data)]));
    const bytes = [...out.values()].reduce((sum, data) => sum + data.length, 0);
    return { data: out, files, bytes, upstreamEntry, version: hash(JSON.stringify(Object.entries(files).sort())).slice(0, 12) };
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
        const known = this.catalogEntries.find(item => item.id === entry.name);
        found.set(entry.name, { id: entry.name, name: (known?.name || title || meta.name).slice(0, 80), description: (known?.description || meta.description).slice(0, 600), source, dir });
      }
    }
    for (const item of this.catalogEntries) if (!found.has(item.id)) found.set(item.id, { ...item, source: 'catalog', dir: null });
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
    let current;
    try { noLinkAncestors(dest); current = walk(dest, { rejectLinks: true }).files; }
    catch { return { state: 'modified', modified: ['Linked or unreadable installed content'] }; }
    const modified = Object.entries(manifest.files).filter(([rel, sum]) => current[rel] !== sum).map(([rel]) => rel)
      .concat(Object.keys(current).filter(rel => !(rel in manifest.files)));
    if (modified.length) return { state: 'modified', modified: modified.slice(0, 20) };
    return { state: manifest.version === expected ? 'installed' : 'outdated' };
  }
  list() {
    const applicable = this.applicable();
    this.cache = this.packs().map(pack => {
      let version = null, size = 0, error = null, upstreamEntry = null;
      if (pack.dir) try { const rendered = this.render(pack); version = rendered.version; size = rendered.bytes; upstreamEntry = rendered.upstreamEntry; } catch (e) { error = e.message; }
      const entry = this.catalogEntries.find(item => item.id === pack.id);
      const meta = policy.metadata(pack), targetsList = applicable.map(t => ({ id: t.id, path: path.join(t.path, pack.id), agents: t.agentNames, ...this.inspect(pack, t.path, version) }));
      const ready = targetsList.find(t => t.state === 'installed'), any = targetsList.find(t => t.state !== 'not-installed');
      const availability = ready ? 'available' : error ? 'unavailable' : any ? (any.state === 'conflict' ? 'conflict' : any.state) : 'not-installed';
      const availabilityReason = ready ? null : error ? error : any ? `The ${any.state} copy cannot be used for automatic delivery.` : 'The skill is not installed.';
      return { id: pack.id, name: pack.name, description: pack.description, source: pack.source, version, size, error,
        automatic: this.automatic(pack), trigger: meta.trigger, roles: meta.roles, defaultAutomatic: meta.defaultAuto,
        entryPath: ready ? path.join(ready.path, 'SKILL.md') : null, upstreamEntry, availability, availabilityReason,
        group: entry?.group || (pack.id === 'project-documentation' || entry ? 'engineering' : 'other'),
        downloadable: pack.source === 'catalog', upstream: entry ? `https://github.com/${entry.repo}/tree/${entry.commit}` : null,
        setup: entry?.setup || (entry ? 'Uses Paddock routing when available, or the selected native CLI outside Paddock. No additional API key or automatic hooks. New agent sessions load the installed pack.' : pack.id === 'project-documentation' ? 'Maintains numbered source-backed documentation using Paddock Knowledge or standalone repository files. Managed Knowledge stays optional.' : null),
        targets: targetsList };
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
    try { return await work(); } finally { this.busy = false; this.list(); this.record(); this.onChange(); }
  }
  install(id) {
    return this.run(async () => {
      if (this.pack(id).source === 'catalog') await this.ensurePack({ id, localRoot: this.local, downloads: this.downloads });
      return this.publish(this.pack(id), this.applicable(), false);
    });
  }
  updateManaged() {
    return this.run(() => {
      const results = [];
      for (const pack of this.packs().filter(pack => pack.dir)) {
        try { results.push(...this.publish(pack, targets.map(target => ({ ...target, path: this.targetDir(target) })), true).map(result => ({ pack: pack.id, ...result }))); }
        catch (error) { results.push({ pack: pack.id, state: 'failed', reason: error.message }); }
      }
      return results;
    });
  }
  // Writes the rendered pack to each target. Promotion is per target; there is
  // no atomicity across targets. `existingOnly` refreshes managed installs only.
  publish(pack, folders, existingOnly) {
    const rendered = this.render(pack), results = [];
    for (const target of folders) {
      const dest = path.join(target.path, pack.id);
      let status; try { status = this.inspect(pack, target.path, rendered.version); } catch { results.push({ target: target.id, state: 'skipped', reason: `${dest} could not be read. It was left unchanged.` }); continue; }
      if (existingOnly && status.state === 'not-installed') continue;
      if (status.state === 'installed') { results.push({ target: target.id, state: 'installed' }); continue; }
      if (status.state === 'conflict') { results.push({ target: target.id, state: 'skipped', reason: `${dest} already exists and was not installed by Paddock. It was left unchanged.` }); continue; }
      if (status.state === 'modified') { results.push({ target: target.id, state: 'skipped', reason: `Files in ${dest} were changed after install. Restore or remove them, then update.` }); continue; }
      if (linkLike(target.path)) { results.push({ target: target.id, state: 'skipped', reason: `${target.path} is a link. It was left unchanged.` }); continue; }
      results.push(this.promote(pack, target, dest, status, rendered));
    }
    return results;
  }
  promote(pack, target, dest, status, rendered) {
    const stage = path.join(target.path, `.${pack.id}.paddock-${crypto.randomUUID().slice(0, 8)}`), old = stage + '-old';
    const owner = () => { try { return hash(fs.readFileSync(path.join(dest, MANIFEST))); } catch { return null; } };
    const before = owner(), failed = reason => ({ target: target.id, state: 'failed', reason });
    try {
      noLinkAncestors(target.path);
      fs.mkdirSync(target.path, { recursive: true });
      for (const [rel, data] of rendered.data) {
        const to = path.join(stage, ...rel.split('/')); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, data);
      }
      atomicJson(path.join(stage, MANIFEST), { pack: pack.id, version: rendered.version, source: pack.source, installedAt: Date.now(), files: rendered.files });
    } catch {
      fs.rmSync(stage, { recursive: true, force: true });
      return failed(`Could not write ${dest}.`);
    }
    let again; try { again = this.inspect(pack, target.path, rendered.version); } catch { again = { state: 'unreadable' }; }
    let linked = false; try { noLinkAncestors(target.path); } catch { linked = true; }
    if (again.state !== status.state || owner() !== before || linked) {
      fs.rmSync(stage, { recursive: true, force: true });
      return { target: target.id, state: 'skipped', reason: `${dest} changed during the update. It was left unchanged.` };
    }
    if (status.state !== 'outdated') {
      try { fs.renameSync(stage, dest); } catch { fs.rmSync(stage, { recursive: true, force: true }); return failed(`Could not write ${dest}.`); }
      return { target: target.id, state: 'installed' };
    }
    try { fs.renameSync(dest, old); } catch { fs.rmSync(stage, { recursive: true, force: true }); return failed(`Could not replace ${dest}. It was left unchanged.`); }
    try { fs.renameSync(stage, dest); } catch {
      let restoreFailed = false;
      try { fs.renameSync(old, dest); } catch { restoreFailed = true; }
      const result = restoreFailed ? { ...failed(`Could not restore ${dest}. The previous copy is kept at ${old}.`), backup: old } : failed(`Could not update ${dest}. The previous copy was restored.`);
      try { fs.rmSync(stage, { recursive: true, force: true }); }
      catch { result.cleanup = { state: 'failed', reason: `Staging at ${stage} could not be removed.` }; }
      return result;
    }
    const result = { target: target.id, state: 'updated' };
    try { fs.rmSync(old, { recursive: true, force: true }); } catch { result.cleanup = { state: 'failed', reason: `The previous copy at ${old} could not be removed.`, backup: old }; }
    return result;
  }
  // Re-renders managed installs for one pack. New targets and downloads are
  // never created, and the preference itself is saved by the caller.
  async setAutomatic(id, automatic) {
    const previous = this.overrides.get(id);
    try {
      return await this.run(() => {
        if (!validId(id)) throw Error('Choose an available skill pack.');
        if (typeof automatic !== 'boolean') throw Error('Automatic must be on or off.');
        const pack = this.pack(id);
        this.overrides.set(id, automatic);
        if (!pack.dir) return [];
        return this.publish(pack, targets.map(t => ({ ...t, path: this.targetDir(t) })), true);
      });
    } catch (error) {
      if (previous === undefined) this.overrides.delete(id); else this.overrides.set(id, previous);
      throw error;
    }
  }
  clearAutomaticOverride(id) { this.overrides.delete(id); this.list(); }
  // Bounded inline instructions for the roles' selected automatic skills.
  guidance({ role = 'lead', knowledgeEnabled = true } = {}) {
    const listed = this.list();
    const { entries, unavailable } = policy.selectSkills(listed.map(p => ({
      id: p.id, automatic: p.automatic, availability: p.availability, metadata: { trigger: p.trigger, roles: p.roles, defaultAuto: p.defaultAutomatic },
      entryPath: p.entryPath, unavailable: p.availability === 'available' ? '' : p.availabilityReason || 'The skill is not available.'
    })), { role, knowledgeEnabled });
    const blocks = [], missing = unavailable.map(x => ({ ...x })); let total = 0;
    for (const entry of entries) {
      const pack = listed.find(p => p.id === entry.id);
      try {
        const root = this.readGuide({ id: entry.id, path: 'SKILL.md', maxBytes: GUIDE.pack });
        const primary = pack.upstreamEntry ? this.readGuide({ id: entry.id, path: pack.upstreamEntry, maxBytes: GUIDE.pack }) : null;
        const size = root.bytes + (primary ? primary.bytes : 0);
        if (size > GUIDE.pack) { missing.push({ id: entry.id, reason: 'Instructions exceed 32 KiB for one skill.' }); continue; }
        if (total + size > GUIDE.total) { missing.push({ id: entry.id, reason: 'Automatic skill instructions exceed the 48 KiB total.' }); continue; }
        total += size;
        // Worker briefs get verified supplied text only: no installed path, since
        // worker sandboxes deny reads outside their work folder.
        const lead = role === 'lead';
        let text = `### ${entry.id} (revision ${root.revision}, digest ${root.digest.slice(0, 12)})\nUse when: ${entry.trigger}\n${lead ? `Installed at: ${entry.entryPath}` : 'Source: verified instruction text included here. Linked references are not included; the coordinator supplies any needed reference as bounded verified text.'}\n\n${stripFrontmatter(root.text).trim()}\n`;
        if (primary) text += lead
          ? `\n#### Upstream entry ${pack.upstreamEntry}\nRelative links resolve from this file's folder and are not inlined. If a referenced file cannot be read, say so instead of guessing its content.\n\n${stripFrontmatter(primary.text).trim()}\n`
          : `\n#### Upstream entry ${pack.upstreamEntry}\nLinked files are not inlined. If one is needed, the coordinator supplies it as bounded verified text; do not retry denied reads or reopen pack paths.\n\n${stripFrontmatter(primary.text).trim()}\n`;
        blocks.push(text);
      } catch (error) { missing.push({ id: entry.id, reason: error.message }); }
    }
    if (!blocks.length && !missing.length) return '';
    let out = `## Automatic skills\nSelected for the ${role} role. Owner and project instructions take precedence.\n\n${blocks.join('\n')}`;
    if (missing.length) out += `\nUnavailable automatic skills: ${missing.map(x => `${x.id} (${x.reason})`).join('; ')}\n`;
    return out;
  }
  // Reads one Markdown file from an unmodified installed pack. Nothing is run.
  readGuide({ id, path: relative = 'SKILL.md', maxBytes = GUIDE.pack } = {}) {
    if (!validId(id)) throw Error('Choose an available skill pack.');
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > GUIDE.readMax) throw Error('Choose a smaller read limit.');
    const parts = typeof relative === 'string' ? relative.split('/') : [];
    if (!parts.length || parts.some(x => !x || x === '.' || x === '..' || /[\\:\x00-\x1f]/.test(x)) || !/\.md$/i.test(relative) || relative === MANIFEST) throw Error('Choose a Markdown file inside the skill pack.');
    const pack = this.pack(id);
    if (!pack.dir) throw Error('The skill is not installed.');
    const version = this.render(pack).version;
    const states = new Set();
    for (const target of this.applicable()) {
      let status; try { status = this.inspect(pack, target.path, version); } catch { continue; }
      states.add(status.state);
      if (status.state !== 'installed') continue;
      const dest = path.join(target.path, pack.id), manifest = readJson(path.join(dest, MANIFEST), null);
      noLinkAncestors(dest);
      if (!manifest?.files?.[relative]) throw Error('That file is not part of the installed skill.');
      let current = target.path;
      for (const part of [pack.id, ...parts]) { if (linkLike(current)) throw Error('Linked skill folders are not read.'); current = path.join(current, part); }
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isFile()) throw Error('Linked skill folders are not read.');
      if (stat.size > maxBytes) throw Error(`${relative} is larger than ${maxBytes} bytes.`);
      const data = fs.readFileSync(current);
      if (data.length > maxBytes || hash(data) !== manifest.files[relative]) throw Error(`${relative} changed while reading.`);
      const item = this.catalogEntries.find(x => x.id === id);
      return { id, path: relative, text: data.toString('utf8'), bytes: data.length, digest: hash(data), revision: manifest.version, target: target.id,
        provenance: { source: pack.source, installedAt: manifest.installedAt, upstream: item?.repo ? `https://github.com/${item.repo}/tree/${item.commit}` : null, commit: item?.commit || null } };
    }
    if (states.has('outdated')) throw Error('This copy is outdated. Run Update in Tools.');
    if (states.has('modified')) throw Error('Installed skill files were changed after install. Restore or remove those copies, then run Update in Tools.');
    if (states.has('conflict')) throw Error('The skill folder belongs to another installation. Check Folders in Tools.');
    throw Error('The skill is not installed. Run Install in Tools.');
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
