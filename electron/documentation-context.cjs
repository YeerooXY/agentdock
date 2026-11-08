'use strict';
// Portable adapter over the canonical map. It stores no second semantic copy.
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { buildContext } = require('./knowledge-context.cjs');
const { rootPath, checkedPath, readJson, ID, ADDRESS } = require('./documentation-scaffold.cjs');
const { safeRead } = require('./source-snapshots.cjs');
const { sourcePathAllowed } = require('./repo-inventory.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');
function portableContext(root, sources, args = {}) {
  root = rootPath(root);
  const rootId = sha(process.platform === 'win32' ? root.toLowerCase() : root);
  const manifest = 'docs/knowledge/map.json';
  let document, mapHash, entries;
  const noteHashes = new Map();
  const readMap = () => {
    if (document) return document;
    if (!fs.existsSync(checkedPath(root, manifest))) {
      entries = []; document = { revision: 'uninitialized', entries }; return document;
    }
    const map = readJson(root, manifest);
    if (map.schemaVersion !== 1 || map.taxonomyVersion !== 1 || !Array.isArray(map.sections) || map.sections.length > 500) throw Error('Invalid documentation map.');
    const ids = new Set();
    entries = map.sections.map(section => {
      if (!section || typeof section.id !== 'string' || !ID.test(section.id) || ids.has(section.id) || typeof section.address !== 'string' || !ADDRESS.test(section.address) || typeof section.title !== 'string' || !section.title.trim() || section.title.length > 160 || /[\x00-\x1f\x7f]/.test(section.title) || !['present', 'uncertain', 'uninspected'].includes(section.status) || !Array.isArray(section.sourceRefs) || section.sourceRefs.length > 64 || !Array.isArray(section.relatedIds) || section.relatedIds.length > 64) throw Error('Invalid documentation section.');
      ids.add(section.id);
      if (typeof section.document !== 'string' || !section.document.endsWith('.md')) throw Error('Invalid section document.');
      checkedPath(root, 'docs/knowledge/' + section.document);
      for (const ref of section.sourceRefs) if (!ref || !sourcePathAllowed(ref.path) || !/^[a-f0-9]{64}$/.test(ref.contentHash) || ref.symbolId !== undefined && (typeof ref.symbolId !== 'string' || ref.symbolId.length > 1500)) throw Error('Invalid source evidence.');
      return { id: section.id, version: 1, deleted: false, location: 'docs/knowledge/' + section.document, portable: section, section: {
        id: section.id, title: section.title, summary: '', kind: 'interpretation',
        provenance: { kind: 'inferred', reference: 'map:' + manifest },
        sourceRefs: section.sourceRefs.map(ref => 'src_' + sha(rootId + '\0' + ref.path).slice(0, 48)),
        evidence: [], flowRefs: section.relatedIds, sourceSnapshot: null, freshness: 'unknown'
      } };
    }).filter(entry => entry.portable.status !== 'uninspected');
    mapHash = sha(JSON.stringify(map));
    document = { revision: mapHash, entries };
    return document;
  };
  const project = () => {
    if (rootPath(root) !== root) throw Error('Repository root changed.');
    if (mapHash && sha(JSON.stringify(readJson(root, manifest))) !== mapHash) throw Error('Documentation changed during retrieval.');
    for (const [rel, hash] of noteHashes) if (sha(fs.readFileSync(checkedPath(root, rel))) !== hash) throw Error('Documentation changed during retrieval.');
    return { id: 'standalone', folders: [{ path: root }] };
  };
  const sourceBound = (id, snapshotId) => {
    project();
    if (sources.load(id, snapshotId).rootId !== rootId) throw Error('Source snapshot belongs to a foreign repository.');
  };
  let pinned;
  const access = {
    project, sources, store: { snapshot: readMap }, sourceBound,
    sourceCapture: (id, options) => sources.capture(id, root, { ...options, beforePersist: project }),
    read: (id, { ids, revision, maxBytes }) => {
      const doc = readMap(); project();
      if (doc.revision !== revision) throw Error('Documentation revision changed.');
      const items = [];
      for (const sectionId of ids) {
        const entry = entries.find(entry => entry.id === sectionId);
        if (!entry) continue;
        let state = entry.portable.status === 'present' && entry.portable.sourceRefs.length ? 'matches' : 'unverified';
        if (state === 'matches') for (const ref of entry.portable.sourceRefs) {
          try {
            const file = pinned?.files.find(file => file.path === ref.path);
            if (!file || file.contentHash !== ref.contentHash || ref.symbolId && !file.symbols.some(symbol => symbol.id === ref.symbolId)) { state = 'unavailable'; break; }
            if (sha(safeRead(root, ref.path)) !== ref.contentHash) { state = 'changed'; break; }
          } catch { state = 'unavailable'; break; }
        }
        // No note text is read until all of its cited bytes are available/current.
        let summary = '';
        if (state === 'matches') {
          try {
            const file = checkedPath(root, 'docs/knowledge/' + entry.portable.document), stat = fs.lstatSync(file);
            if (!stat.isFile() || stat.size > 65536) throw Error('Unavailable note.');
            summary = fs.readFileSync(file, 'utf8');
            const rel = 'docs/knowledge/' + entry.portable.document, hash = sha(summary);
            if (noteHashes.has(rel) && noteHashes.get(rel) !== hash) throw Error('Documentation changed during retrieval.');
            noteHashes.set(rel, hash);
          } catch { state = 'unavailable'; }
        }
        const item = { id: entry.id, version: entry.version, recorded: { ...entry.section, summary, portable: entry.portable }, sourceEvidence: state, maintenance: { state: 'clear', scope: 'No managed queue in standalone mode.' } };
        if (Buffer.byteLength(JSON.stringify(item)) <= maxBytes) items.push(item);
      }
      project(); return { items };
    }
  };
  // Set the adapter's evidence view when buildContext pins or captures a snapshot.
  const originalBound = access.sourceBound;
  access.sourceBound = (id, snapshotId) => { originalBound(id, snapshotId); pinned = sources.load(id, snapshotId); };
  const packet = buildContext(access, 'standalone', args);
  project(); return { ...packet, modelCalls: 0 };
}
module.exports = { portableContext };
