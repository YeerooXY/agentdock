'use strict';
const { STABLE_ID_PATTERN } = require('./knowledge-contracts.cjs');

// These views expose persisted metadata, not verified source or semantic truth.
const assurance = Object.freeze({ sourceVerified: false, semanticVerified: false,
  coverage: 'Stored section metadata only. Source inventory and freshness have not been verified.' });
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${label}.`);
  return value;
}
function checkRevision(snapshot, revision) {
  if (revision !== undefined && revision !== snapshot.revision) throw new Error('Knowledge changed. Read the directory again.');
}
function directory(snapshot, { cursor, limit = 20 } = {}) {
  integer(limit, 1, 100, 'directory limit');
  let offset = 0;
  if (cursor !== undefined) {
    if (typeof cursor !== 'string' || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error('Invalid knowledge cursor.');
    let page;
    try { page = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); } catch { throw new Error('Invalid knowledge cursor.'); }
    if (!page || Object.keys(page).sort().join(',') !== 'offset,projectId,revision' || page.projectId !== snapshot.projectId) throw new Error('Invalid knowledge cursor.');
    checkRevision(snapshot, page.revision);
    offset = integer(page.offset, 0, 1000, 'directory offset');
  }
  const entries = snapshot.entries.filter(entry => !entry.deleted).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (offset > entries.length) throw new Error('Invalid knowledge cursor.');
  const items = entries.slice(offset, offset + limit).map(({ id, version, section }) => ({
    id, version, title: section.title, kind: section.kind, recordedFreshness: section.freshness,
    sourceSnapshot: section.sourceSnapshot, sourceRefCount: section.sourceRefs.length, flowRefCount: section.flowRefs.length
  }));
  const end = offset + items.length;
  return { projectId: snapshot.projectId, revision: snapshot.revision, assurance, items,
    total: entries.length, retiredCount: snapshot.entries.length - entries.length,
    nextCursor: end < entries.length ? Buffer.from(JSON.stringify({ projectId: snapshot.projectId, revision: snapshot.revision, offset: end })).toString('base64url') : null };
}
function readSections(snapshot, { ids, revision, maxBytes = 32768 } = {}) {
  integer(maxBytes, 2048, 262144, 'knowledge byte budget');
  checkRevision(snapshot, revision);
  if (!Array.isArray(ids) || !ids.length || ids.length > 32 || ids.some(id => typeof id !== 'string' || !STABLE_ID_PATTERN.test(id)) || new Set(ids).size !== ids.length) throw new Error('Choose 1 to 32 distinct knowledge section IDs.');
  const index = new Map(snapshot.entries.map(entry => [entry.id, entry]));
  const out = { projectId: snapshot.projectId, revision: snapshot.revision, assurance, items: [], missingIds: [], retiredIds: [], remainingIds: [], requiredBytes: null, decompositionRequired: false };
  for (const id of ids) {
    const entry = index.get(id);
    if (!entry) out.missingIds.push(id);
    else if (entry.deleted) out.retiredIds.push(id);
    else out.remainingIds.push(id);
  }
  const liveIds = out.remainingIds;
  const records = liveIds.map(id => { const { version, section } = index.get(id); return { id, version, recorded: section }; });
  // requiredBytes always describes a solo read, with no unrelated IDs or
  // continuation metadata. Retrying exactly that budget must make progress.
  const soloBytes = records.map(item => bytes({ ...out, items: [item], missingIds: [], retiredIds: [], remainingIds: [] }));
  // Full sections are included or deferred. Semantic prose is never truncated.
  for (let count = records.length; count >= 0; count--) {
    const candidate = { ...out, items: records.slice(0, count), remainingIds: liveIds.slice(count),
      requiredBytes: count < records.length ? Math.max(2048, soloBytes[count]) : null,
      decompositionRequired: count < records.length && soloBytes[count] > 262144 };
    if (bytes(candidate) <= maxBytes) return candidate;
  }
  throw new Error('Knowledge metadata exceeds the byte budget. Increase maxBytes.');
}
module.exports = { directory, readSections };
