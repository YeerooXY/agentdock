'use strict';
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { knowledgeMode, assertKnowledgeRead } = require('./knowledge-policy.cjs');
const reader = require('./knowledge-reader.cjs');
const { SourceSnapshots } = require('./source-snapshots.cjs');
const { inventoryRepository } = require('./repo-inventory.cjs');
const { boundedText } = require('./execution-history.cjs');

// One policy boundary for agent tools, desktop reads and dispatch-time context.
class KnowledgeAccess {
  constructor({ store, getSettings, getProjects, inventory = inventoryRepository }) {
    Object.assign(this, { store, getSettings, getProjects, inventory });
    this.sources = new SourceSnapshots(store.root);
  }
  project(id) {
    const project = this.getProjects()?.get(id);
    if (!project) throw new Error('Link this console to an existing project first.');
    assertKnowledgeRead(this.getSettings(), project);
    return project;
  }
  enabled(id) {
    const project = this.getProjects()?.get(id);
    try { return !!project && knowledgeMode(this.getSettings(), project) !== 'off'; }
    catch { return false; }
  }
  automatic(id) { const project = this.getProjects()?.get(id); try { return !!project && knowledgeMode(this.getSettings(), project) === 'automatic'; } catch { return false; } }
  maintenance(id, section) {
    if (!this.upkeep) return { state: 'unknown', obligations: [] };
    try { const obligations = this.upkeep.dirty(id, section); return { state: obligations.length ? 'pending' : 'clear', obligationCount: obligations.length }; }
    catch { return { state: 'unavailable', obligations: [], note: 'Maintenance evidence could not be checked.' }; }
  }
  directory(id, args) { this.project(id); const snapshot = this.store.snapshot(id), value = reader.directory(snapshot, args); const entries = snapshot.entries.filter(entry => !entry.deleted).sort((a, b) => a.id < b.id ? -1 : 1);
    const directoryViewId = createHash('sha256').update(JSON.stringify([id, snapshot.revision, entries.map(entry => entry.id)])).digest('hex');
    return { ...value, directoryViewId, items: value.items.map(item => ({ ...item, address: String(entries.findIndex(entry => entry.id === item.id) + 1) })).map(item => ({ ...item, maintenance: this.maintenance(id, snapshot.entries.find(entry => entry.id === item.id).section) })), maintenance: (() => { try { return this.upkeep?.status(id) || null; } catch { return { state: 'unavailable' }; } })() }; }
  read(id, args = {}) {
    this.project(id); const snapshot = this.store.snapshot(id), value = reader.readSections(snapshot, args);
    const annotate = item => ({ ...item, maintenance: this.maintenance(id, item.recorded), sourceEvidence: require('./knowledge-authoring.cjs').evidenceState(this, id, item.recorded, { document: snapshot, version: item.version }) });
    const out = { ...value, items: value.items.map(annotate) }, budget = args.maxBytes || 32768;
    while (true) {
      if (out.remainingIds.length) {
      const entry = snapshot.entries.find(item => item.id === out.remainingIds[0]);
      const solo = { ...out, items: [annotate({ id: entry.id, version: entry.version, recorded: entry.section })], missingIds: [], retiredIds: [], remainingIds: [], requiredBytes: null, decompositionRequired: false };
      out.requiredBytes = Math.max(2048, Buffer.byteLength(JSON.stringify(solo))); out.decompositionRequired = out.requiredBytes > 262144;
      }
      if (!out.items.length || Buffer.byteLength(JSON.stringify(out)) <= budget) break;
      const item = out.items.pop(); out.remainingIds.unshift(item.id);
    }
    return out;
  }

  capture(id, { folderIndex = 0 } = {}) {
    const project = this.project(id);
    if (!Number.isInteger(folderIndex) || folderIndex < 0 || !project.folders[folderIndex]) throw new Error('Choose an existing project folder.');
    const folder = project.folders[folderIndex];
    const observation = this.inventory(folder.path, { maxEntries: 10000, maxDepth: 12 });
    // Recheck the live switch before committing. Capture performs no model call.
    this.project(id);
    const rootKey = createHash('sha256').update(path.resolve(folder.path)).digest('hex').slice(0, 20);
    const sectionId = `sec_inventory_${rootKey}`;
    const prior = this.store.snapshot(id).entries.find(entry => entry.id === sectionId);
    const areas = [...new Set(observation.files.map(file => file.path.includes('/') ? file.path.split('/')[0] : '<root>'))].slice(0, 20);
    const summary = `Local metadata inventory. ${observation.files.length} file paths observed. Roles: ${JSON.stringify(observation.counts)}. Top-level areas: ${areas.join(', ')}. Coverage: ${observation.coverage.complete ? 'complete within the declared filter' : 'partial: ' + observation.coverage.reasons.join(', ')}. ${observation.coverage.excluded} entries excluded. Source contents were not read; this is not an architecture map or source snapshot.`;
    const section = { schemaVersion: 1, id: sectionId, kind: 'interpretation', title: boundedText(`Inventory: ${folder.label || path.basename(folder.path)}`, 240),
      summary, sourceSnapshot: null, freshness: 'unknown', provenance: { kind: 'inferred', reference: `inventory:${observation.inventoryId}` }, evidence: [], sourceRefs: [], flowRefs: [] };
    if (prior?.deleted) throw new Error('This inventory identity was retired. Choose a different project folder.');
    if (!prior || JSON.stringify(prior.section) !== JSON.stringify(section)) this.store.commit(id, {
      operationId: randomUUID(), changes: [{ id: sectionId, expectedVersion: prior?.version || 0, section }]
    });
    return { ...this.directory(id, { limit: 20 }), observation: { inventoryId: observation.inventoryId, contentHashed: false, sourceSnapshot: null, counts: observation.counts, coverage: observation.coverage } };
  }
  sourceCapture(id, { folderIndex = 0, ...options } = {}) {
    const project = this.project(id);
    if (!Number.isInteger(folderIndex) || folderIndex < 0 || !project.folders[folderIndex]) throw Error('Choose an existing project folder.');
    return this.sources.capture(id, project.folders[folderIndex].path, { ...options, beforePersist: () => this.project(id) });
  }
  sourceBound(id, snapshotId) {
    const project = this.project(id), snapshot = this.sources.load(id, snapshotId);
    const authorized = project.folders.some(folder => {
      try { const fs = require('node:fs'), actual = fs.realpathSync(folder.path); return !fs.lstatSync(folder.path).isSymbolicLink() && createHash('sha256').update(process.platform === 'win32' ? actual.toLowerCase() : actual).digest('hex') === snapshot.rootId; }
      catch { return false; }
    });
    if (!authorized) throw Error('Source snapshot root is no longer authorized for this project.');
  }
  sourceResolve(id, args) { this.sourceBound(id, args.snapshotId); return this.sources.resolve(id, args); }
  sourceRead(id, args) { this.sourceBound(id, args.snapshotId); return this.sources.read(id, args); }
  adopt(id, args) { return require('./knowledge-adoption.cjs').adoptMap(this, id, args); }
  initialize(id, args) { return require('./knowledge-authoring.cjs').initialize(this, id, args); }
  write(id, args) { return require('./knowledge-authoring.cjs').write(this, id, args); }
  state(id) { return require('./knowledge-authoring.cjs').state(this, id); }
  guide(id, args) { return require('./knowledge-authoring.cjs').guide(this, id, args); }
  context(id, args) { return require('./knowledge-context.cjs').buildContext(this, id, args); }
  resolve(id, { query = '', snapshotId, directoryViewId, addresses } = {}) {
    this.project(id); if (typeof query !== 'string' || query.length > 200) throw Error('Invalid knowledge query.');
    const snapshot = this.store.snapshot(id), entries = snapshot.entries.filter(entry => !entry.deleted).sort((a, b) => a.id < b.id ? -1 : 1);
    const viewId = createHash('sha256').update(JSON.stringify([id, snapshot.revision, entries.map(entry => entry.id)])).digest('hex');
    if (addresses && (directoryViewId !== viewId || !Array.isArray(addresses) || addresses.length > 32)) throw Error('Directory view changed or address lookup is invalid. Read the directory again.');
    const selectedIds = addresses ? addresses.map(address => { const item = entries[Number(address) - 1]; if (!/^[1-9][0-9]*$/.test(address) || !item) throw Error('Unknown directory address.'); return item.id; }) : [];
    const suggestions = entries.filter(entry => selectedIds.includes(entry.id) || !addresses && `${entry.section.title} ${entry.section.summary}`.toLowerCase().includes(query.toLowerCase())).slice(0, 20).map(entry => ({ id: entry.id, title: entry.section.title, address: String(entries.indexOf(entry) + 1), match: addresses ? 'directory-address' : 'keyword-suggestion' }));
    const source = snapshotId ? this.sourceResolve(id, { snapshotId, query, limit: 20 }) : null;
    if (source) {
      const pinned = this.sources.load(id, snapshotId);
      for (const hit of source.items) {
        const file = pinned.files.find(file => file.path === hit.path);
        hit.sectionIds = entries.filter(entry => entry.section.sourceRefs.includes(file.sourceId)).map(entry => entry.id);
        hit.coverageGap = hit.sectionIds.length === 0;
      }
    }
    return { projectId: id, revision: snapshot.revision, directoryViewId: viewId, suggestions, source, coverage: 'Keyword suggestions are not responsibility proofs. Unmapped source is an explicit coverage gap.' };
  }
  bundle(id, { ids = [], snapshotId, sources = [], maxBytes = 32768 } = {}) {
    this.project(id);
    if (!Array.isArray(ids) || ids.length > 16 || !Array.isArray(sources) || sources.length > 16 || !Number.isInteger(maxBytes) || maxBytes < 4096 || maxBytes > 262144) throw Error('Invalid knowledge bundle bounds.');
    const out = { projectId: id, knowledge: ids.length ? this.read(id, { ids, maxBytes: Math.max(2048, Math.floor(maxBytes / 2)) }) : null, sources: [], remainingSources: [], snapshotId: snapshotId || null,
      assurance: 'Selected saved notes are unverified interpretations. Source excerpts are exact only for their pinned snapshot. Dependency context and selection can be incomplete.' };
    for (const [index, source] of sources.entries()) {
      const value = this.sourceRead(id, { snapshotId, path: source.path, symbolId: source.symbolId, maxBytes: Math.min(262144, maxBytes) });
      const selected = { ...value, selectionIndex: index };
      if (!value.complete || Buffer.byteLength(JSON.stringify({ ...out, sources: [...out.sources, selected] })) > maxBytes - 1024) out.remainingSources.push({ index, requiredTextBytes: value.requiredBytes });
      else out.sources.push(selected);
    }
    while (out.sources.length && Buffer.byteLength(JSON.stringify(out)) > maxBytes) { const source = out.sources.pop(); out.remainingSources.unshift({ index: source.selectionIndex, requiredTextBytes: source.requiredBytes }); }
    if (Buffer.byteLength(JSON.stringify(out)) > maxBytes) throw Error('Bundle metadata exceeds the budget. Request fewer entries.');
    return out;
  }
  brief(job) {
    if (!this.enabled(job.projectId)) return '';
    const readOnly = ['reviewer', 'planner'].includes(job.documentationRole) ? 'Documentation review is read-only. ' : '';
    return readOnly + 'Use source tools first. Project knowledge is optional: dock/knowledge_context returns bounded sources and applicable note handles on demand. A known path can still have cross-system obligations. Notes may be stale or incomplete; verify source. Existing task completion queues upkeep; do not rewrite documentation inline unless requested. Use dock/knowledge_guide topic authoring only for explicit documentation work.';
  }
}
module.exports = { KnowledgeAccess };
