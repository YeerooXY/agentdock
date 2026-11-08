'use strict';
const { createHash } = require('node:crypto');
const { inventoryRepository } = require('./repo-inventory.cjs');
const { safeRead } = require('./source-snapshots.cjs');
const { validateSection, STABLE_ID_PATTERN } = require('./knowledge-contracts.cjs');
const sha = text => createHash('sha256').update(text).digest('hex');
function adoptMap(access, projectId, { folderIndex = 0, mapPath } = {}) {
  const project = access.project(projectId), folder = project.folders[folderIndex];
  if (!Number.isInteger(folderIndex) || !folder || typeof mapPath !== 'string' || !mapPath.endsWith('.json')) throw Error('Choose a JSON map in an existing project folder.');
  if (!inventoryRepository(folder.path).files.some(file => file.path === mapPath)) throw Error('The map is excluded or outside this project.');
  const text = safeRead(folder.path, mapPath), map = JSON.parse(text), observed = map.observations?.files;
  if (map.schemaVersion !== 1 || !Array.isArray(map.sections) || !map.sections.length || map.sections.length > 24 || !Array.isArray(observed) || !observed.length || observed.length > 128 || !Array.isArray(map.flows || []) || (map.flows || []).length > 8) throw Error('Unsupported or oversized responsibility map.');
  const paths = observed.map(file => file.path);
  if (new Set(paths).size !== paths.length) throw Error('Map source paths must be distinct.');
  const captured = access.sourceCapture(projectId, { folderIndex, paths, maxFiles: 128 });
  const source = access.sources.load(projectId, captured.snapshotId);
  if (source.files.length !== observed.length || observed.some(file => !source.files.some(actual => actual.path === file.path && actual.contentHash === file.sha256))) throw Error('Map source hashes do not match this project. Rebuild the map before adoption.');
  const provenance = { kind: 'inferred', reference: 'map:src_' + sha(captured.rootId + '\0' + mapPath).slice(0, 48) };
  const sections = map.sections.map(section => {
    if (!section || !STABLE_ID_PATTERN.test(section.id) || typeof section.title !== 'string' || typeof section.responsibility !== 'string' || !Array.isArray(section.sourceHints) || !section.sourceHints.length) throw Error('Invalid responsibility section.');
    const files = [...new Set(section.sourceHints.map(hint => hint.path))].map(file => source.files.find(actual => actual.path === file));
    if (files.some(file => !file)) throw Error('Section source hints are not covered by the map snapshot.');
    return validateSection({ schemaVersion: 1, id: section.id, kind: 'interpretation', title: section.title, summary: section.responsibility,
      sourceSnapshot: captured.snapshotId, freshness: 'proposed', provenance,
      evidence: files.map(file => ({ sourceId: file.sourceId, contentHash: file.contentHash, anchor: 'file:' + file.contentHash })),
      sourceRefs: files.map(file => file.sourceId), flowRefs: (map.flows || []).filter(flow => flow.sequence?.includes(section.id)).map(flow => flow.id) });
  });
  for (const flow of map.flows || []) {
    if (!flow || !STABLE_ID_PATTERN.test(flow.id) || !Array.isArray(flow.sequence) || flow.sequence.length > 64 || flow.sequence.some(id => typeof id !== 'string' || !STABLE_ID_PATTERN.test(id))) throw Error('Invalid proposed flow.');
    sections.push(validateSection({ schemaVersion: 1, id: flow.id, kind: 'interpretation', title: 'Flow: ' + flow.id,
      summary: 'Proposed sequence: ' + flow.sequence.join(' -> ') + '. ' + String(flow.status || 'Runtime relationships are unverified.'), sourceSnapshot: captured.snapshotId, freshness: 'proposed', provenance,
      evidence: [], sourceRefs: [], flowRefs: [...new Set(flow.sequence.filter(id => sections.some(section => section.id === id)))] }));
  }
  if (new Set(sections.map(section => section.id)).size !== sections.length) throw Error('Map section IDs must be distinct.');
  const current = access.store.snapshot(projectId), operationId = 'map_' + sha(text + captured.snapshotId);
  const priorReceipt = current.journal.find(receipt => receipt.operationId === operationId);
  if (priorReceipt) {
    if (!sections.every(section => current.entries.some(entry => !entry.deleted && entry.id === section.id && JSON.stringify(entry.section) === JSON.stringify(section)))) throw Error('This adoption was already recorded and later records changed. Those edits were preserved.');
    return { ...priorReceipt, assurance: 'Previously adopted proposed references; semantic claims remain unverified.' };
  }
  const changes = sections.map(section => {
    const prior = current.entries.find(entry => entry.id === section.id);
    if (prior && (prior.deleted || prior.section.provenance.kind !== 'inferred' || prior.section.provenance.reference !== provenance.reference)) throw Error('A map ID belongs to another record or was retired. It was preserved.');
    return { id: section.id, expectedVersion: prior?.version || 0, section };
  });
  access.project(projectId);
  if (sha(safeRead(folder.path, mapPath)) !== sha(text)) throw Error('Responsibility map changed before adoption.');
  const receipt = access.store.commit(projectId, { operationId, changes });
  return { ...receipt, assurance: 'Adopted proposed responsibilities. Source hashes match the pinned selection; semantic boundaries and runtime flows remain unverified.' };
}
module.exports = { adoptMap };
