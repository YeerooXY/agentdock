'use strict';
const fs = require('node:fs'), path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { inventoryRepository, sourcePathAllowed } = require('./repo-inventory.cjs');
const { safeRead, sensitive } = require('./source-snapshots.cjs');
const { validateSection, STABLE_ID_PATTERN } = require('./knowledge-contracts.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');
const overviewId = rootId => 'sec_overview_' + rootId.slice(0, 24);
function folderFor(access, id, snapshot) {
  const project = access.project(id);
  const folder = project.folders.find(folder => {
    try { const root = fs.realpathSync(folder.path); return !fs.lstatSync(folder.path).isSymbolicLink() && sha(process.platform === 'win32' ? root.toLowerCase() : root) === snapshot.rootId; } catch { return false; }
  });
  if (!folder) throw Error('Documentation source root is no longer authorized.');
  return fs.realpathSync(folder.path);
}
function checkLive(access, id, snapshot, files) {
  const root = folderFor(access, id, snapshot); let bytes = 0;
  for (const file of files) {
    const text = safeRead(root, file.path); bytes += Buffer.byteLength(text);
    if (bytes > 2 * 1024 * 1024) throw Error('Documentation evidence exceeds the live-read budget. Select fewer sources.');
    if (sha(text) !== file.contentHash || sensitive(text)) throw Error('Documentation source changed. Capture the current source before writing.');
  }
}
function initialize(access, id, { folderIndex = 0, paths } = {}) {
  const project = access.project(id), folder = project.folders[folderIndex];
  if (!Number.isInteger(folderIndex) || !folder) throw Error('Choose an existing project folder.');
  let selection = paths;
  let candidates = 0;
  if (!paths) {
    const inventory = inventoryRepository(folder.path, { maxEntries: 20000, maxDepth: 20 });
    const files = inventory.files.filter(file => ['source', 'config', 'docs'].includes(file.kind) && !/^(?:artifacts|test-data|release|verification|captures|screenshots)\//i.test(file.path));
    // Entry documents and manifests precede production source. Everything omitted stays explicit.
    const rank = file => /^(?:README(?:\.md)?|AGENTS\.md|package\.json|pubspec\.yaml|Cargo\.toml|pyproject\.toml|go\.mod)$/i.test(file.path) ? 0 : file.kind === 'source' ? 1 : 2;
    files.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path));
    candidates = files.length; let selectedBytes = 0;
    selection = files.filter(file => { if (file.size > 262144 || selectedBytes + file.size > 1024 * 1024) return false; selectedBytes += file.size; return true; }).slice(0, 128).map(file => file.path);
  }
  if (!Array.isArray(selection) || paths && !selection.length || selection.length > 128 || new Set(selection).size !== selection.length) throw Error('Initialize with 1 to 128 distinct source paths, or omit paths for automatic selection.');
  const captured = access.sourceCapture(id, { folderIndex, ...(selection.length ? { paths: selection } : {}), maxFiles: 128 });
  const snapshot = access.sources.load(id, captured.snapshotId);
  const sections = require('./documentation-map.cjs').buildInitialMap({ snapshot: { ...snapshot, snapshotId: captured.snapshotId, coverage: { ...snapshot.coverage, deferredCount: Math.max(snapshot.coverage.deferredCount || 0, candidates - selection.length) } } });
  const current = access.store.snapshot(id), changes = [];
  for (const section of sections) {
    const prior = current.entries.find(entry => entry.id === section.id);
    if (prior && (prior.deleted || prior.section.provenance.reference !== 'initialize:' + snapshot.rootId)) continue;
    if (!prior || JSON.stringify(prior.section) !== JSON.stringify(section)) changes.push({ id: section.id, expectedVersion: prior?.version || 0, section });
  }
  checkLive(access, id, snapshot, snapshot.files);
  const receipt = changes.length ? access.store.commit(id, { operationId: 'init_' + randomUUID(), changes }) : null;
  access.upkeep?.changed();
  return { projectId: id, snapshotId: captured.snapshotId, receipt, ...state(access, id), coverage: { ...captured.coverage, selectedFiles: snapshot.files.length, candidateFiles: candidates || selection.length, deferredCandidates: Math.max(0, candidates - selection.length), note: 'Initial source directory only. An agent must document responsibilities and connections from exact code; no model call was made.' } };
}
function write(access, id, { snapshotId, operationId, sections } = {}) {
  access.sourceBound(id, snapshotId);
  if (typeof operationId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(operationId) || !Array.isArray(sections) || !sections.length || sections.length > 16 || Buffer.byteLength(JSON.stringify(sections)) > 96000) throw Error('Provide a bounded documentation operation and 1 to 16 sections.');
  const source = access.sources.load(id, snapshotId), current = access.store.snapshot(id), ids = new Set(), used = new Map();
  const changes = sections.map(item => {
    if (item && Object.keys(item).some(key => !['id', 'expectedVersion', 'role', 'title', 'summary', 'sources', 'links'].includes(key))) throw Error('Unsupported documentation fields. Owner intent and approval are separate.');
    if (!item || !STABLE_ID_PATTERN.test(item.id) || ids.has(item.id) || !Number.isSafeInteger(item.expectedVersion) || item.expectedVersion < 0 || !['overview', 'responsibility', 'flow'].includes(item.role) || !Array.isArray(item.sources) || !item.sources.length || item.sources.length > 32 || !Array.isArray(item.links || []) || (item.links || []).length > 32) throw Error('Invalid documentation section or evidence bounds.');
    ids.add(item.id);
    if ((item.role === 'overview' && item.id !== overviewId(source.rootId)) || (item.role !== 'overview' && item.id.startsWith('sec_overview_'))) throw Error('Use the stable overview ID only for an overview role.');
    const prior = current.entries.find(entry => entry.id === item.id);
    if (prior && (prior.deleted || !['inferred', 'observed'].includes(prior.section.provenance.kind) || !/^(?:initialize:|documentation:)/.test(prior.section.provenance.reference) || !prior.section.provenance.reference.endsWith(':' + source.rootId))) throw Error('This identity belongs to a protected or unrelated record. Preserve it.');
    const evidence = item.sources.map(ref => {
      const file = source.files.find(file => file.path === ref.path);
      if (!file) throw Error('Documentation evidence is not in the selected source snapshot.');
      const anchor = ref.anchor || 'file:' + file.contentHash;
      if (anchor !== 'file:' + file.contentHash && !file.symbols.some(symbol => symbol.id === anchor)) throw Error('Documentation anchor does not exist in the source snapshot.');
      used.set(file.sourceId, file);
      return { sourceId: file.sourceId, contentHash: file.contentHash, anchor };
    });
    const section = validateSection({ schemaVersion: 1, id: item.id, kind: 'interpretation', title: item.title, summary: item.summary, sourceSnapshot: snapshotId, freshness: 'unknown', provenance: { kind: 'inferred', reference: 'documentation:' + item.role + ':' + source.rootId }, evidence, sourceRefs: [...new Set(evidence.map(ref => ref.sourceId))], flowRefs: item.links || [] });
    return { id: item.id, expectedVersion: item.expectedVersion, section };
  });
  for (const change of changes) if (change.section.flowRefs.some(ref => !ids.has(ref) && !current.entries.some(entry => entry.id === ref && !entry.deleted))) throw Error('A documentation relationship points to an unavailable section.');
  checkLive(access, id, source, [...used.values()]);
  const receipt = access.store.commit(id, { operationId, changes });
  access.upkeep?.changed();
  return { ...receipt, assurance: { evidenceValidated: true, semanticVerified: false, ownerApproved: false } };
}
function evidenceState(access, id, section, { document, version } = {}) {
  if (!section.sourceSnapshot || !section.evidence.length) return 'unverified';
  try {
    const snapshot = access.sources.load(id, section.sourceSnapshot), files = [...new Set(section.sourceRefs)].map(ref => snapshot.files.find(file => file.sourceId === ref));
    if (files.some(file => !file) || files.length > 128 || section.evidence.some(ref => { const file = files.find(file => file.sourceId === ref.sourceId); return !file || file.contentHash !== ref.contentHash || (ref.anchor !== 'file:' + file.contentHash && !file.symbols.some(symbol => symbol.id === ref.anchor)); })) return 'unverified';
    checkLive(access, id, snapshot, files);
    if (section.id.startsWith('sec_overview_') && access.upkeep?.queue) {
      const doc = document || access.store.snapshot(id), currentVersion = version || doc.entries.find(entry => entry.id === section.id)?.version;
      const receipt = doc.journal.findLast(item => item.versions.some(item => item.id === section.id && item.version === currentVersion));
      if (!receipt) return 'unverified';
      const citedPaths = new Set(files.map(file => file.path));
      // A newly added module may leave all cited files unchanged. Its durable
      // task record invalidates the overview even after generic upkeep commits.
      if (access.upkeep.queue.state(id).some(item => item.rootId === snapshot.rootId && item.enqueuedAt >= receipt.updatedAt && item.touchedPaths.some(file => sourcePathAllowed(file) && !citedPaths.has(file)))) return 'changed';
    }
    return 'matches';
  } catch (error) { return /source changed/.test(error.message) ? 'changed' : 'unavailable'; }
}
function state(access, id) {
  access.project(id);
  const snapshot = access.store.snapshot(id), entries = snapshot.entries.filter(entry => !entry.deleted && /^(?:initialize:|documentation:)/.test(entry.section.provenance.reference));
  const allOverviews = entries.filter(entry => entry.id.startsWith('sec_overview_')), overviews = allOverviews.slice(0, 2);
  return { projectId: id, revision: snapshot.revision, initialized: !!overviews.length, semanticVerified: false,
    overviews: overviews.map(entry => ({ id: entry.id, version: entry.version, title: entry.section.title, summary: entry.section.summary.slice(0, 2400), summaryPreview: entry.section.summary.length > 2400, sourceSnapshot: entry.section.sourceSnapshot, evidence: evidenceState(access, id, entry.section, { document: snapshot, version: entry.version }), kind: entry.section.kind })),
    remainingOverviewIds: allOverviews.slice(2).map(entry => entry.id),
    areas: snapshot.entries.filter(entry => !entry.deleted && entry.section.kind !== 'intent' && entry.section.sourceRefs.length && !entry.id.startsWith('sec_overview_')).slice(0, 32).map(entry => ({ id: entry.id, version: entry.version, title: entry.section.title, evidence: 'not-checked' })),
    note: 'Source matches establish evidence identity, not semantic correctness. Area titles are metadata only: use knowledge_read for their live source evidence. Goals and approvals are stored separately.' };
}
function guide(access, id, { topic = 'retrieval' } = {}) {
  access.project(id);
  if (!['retrieval', 'authoring'].includes(topic)) throw Error('Unknown documentation guide topic.');
  const file = topic === 'authoring' ? ['references', 'managed.md'] : ['SKILL.md'];
  return { name: 'project-documentation', topic, text: fs.readFileSync(path.join(__dirname, '..', 'skills', 'project-documentation', ...file), 'utf8') };
}
module.exports = { initialize, write, state, guide, evidenceState };
