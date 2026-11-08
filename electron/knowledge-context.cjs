'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { safeRead } = require('./source-snapshots.cjs');
const { sourcePathAllowed } = require('./repo-inventory.cjs');
const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && !Object.getOwnPropertySymbols(value).length && Object.values(Object.getOwnPropertyDescriptors(value)).every(desc => !desc.get && !desc.set);
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const hashPattern = /^[a-f0-9]{64}$/;
const allowedPath = value => sourcePathAllowed(value) && !/[<>"|?*\x7f]/.test(value) && !value.split('/').some(part => /[. ]$/.test(part));

function validate(args) {
  if (!isPlainObject(args) || Object.keys(args).some(key => !['snapshotId', 'folderIndex', 'query', 'targets', 'maxBytes'].includes(key))) throw Error('Invalid context arguments.');
  const { snapshotId, folderIndex = 0, query = '', targets = [], maxBytes = 16384 } = args;
  if (snapshotId !== undefined && (typeof snapshotId !== 'string' || !hashPattern.test(snapshotId))) throw Error('Invalid source snapshot identity.');
  if (!Number.isSafeInteger(folderIndex) || folderIndex < 0 || folderIndex > 19 || typeof query !== 'string' || query.length > 200 || /[\x00-\x1f]/.test(query) || !Number.isSafeInteger(maxBytes) || maxBytes < 4096 || maxBytes > 65536) throw Error('Invalid context bounds.');
  if (!Array.isArray(targets) || Object.keys(targets).length !== targets.length || targets.length > 8 || targets.some(target => !isPlainObject(target) || Object.keys(target).some(key => !['path', 'symbolId'].includes(key)) || !allowedPath(target.path) || target.symbolId !== undefined && (typeof target.symbolId !== 'string' || !target.symbolId.length || target.symbolId.length > 2000 || /[\x00-\x1f\x7f]/.test(target.symbolId))) || new Set(targets.map(target => JSON.stringify([target.path, target.symbolId || null]))).size !== targets.length) throw Error('Choose up to 8 distinct allowed source targets.');
  return { snapshotId, folderIndex, query, targets, maxBytes };
}

function buildContext(access, projectId, args = {}) {
  // Policy precedes every saved-data or source lookup, including argument errors.
  access.project(projectId);
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(projectId)) throw Error('Invalid project identity.');
  const options = validate(args), { folderIndex, query, targets, maxBytes } = options;
  const authorizedRoot = () => {
    const folder = access.project(projectId).folders[folderIndex];
    if (!folder || fs.lstatSync(folder.path).isSymbolicLink() || !fs.statSync(folder.path).isDirectory()) throw Error('Choose an authorized project folder without a root link.');
    return fs.realpathSync(folder.path);
  };
  const root = authorizedRoot(), rootId = sha(process.platform === 'win32' ? root.toLowerCase() : root);
  const recheck = () => { if (authorizedRoot() !== root) throw Error('Project source root changed.'); };
  let { snapshotId } = options, pinned;
  if (!snapshotId && targets.length) {
    recheck();
    snapshotId = access.sourceCapture(projectId, { folderIndex, paths: [...new Set(targets.map(target => target.path))], maxFiles: 8 }).snapshotId;
  }
  if (snapshotId) {
    access.sourceBound(projectId, snapshotId);
    pinned = access.sources.load(projectId, snapshotId);
    if (pinned.rootId !== rootId) throw Error('Source snapshot belongs to a foreign project folder.');
  }
  const document = access.store.snapshot(projectId);
  const words = query.toLowerCase().match(/[\p{L}\p{N}_]+/gu) || [];
  const matches = text => !words.length || words.some(word => text.toLowerCase().includes(word));
  const entries = document.entries.filter(entry => !entry.deleted && !/^(?:initialize:|inventory:|area:)/.test(entry.section.provenance.reference) && !entry.id.startsWith('sec_inventory_'));
  const selected = pinned ? (targets.length ? targets : pinned.files.filter(file => allowedPath(file.path) && matches(file.path + ' ' + file.symbols.map(symbol => symbol.name).join(' '))).map(file => ({ path: file.path }))) : [];
  const sourceIds = new Set(selected.map(target => pinned.files.find(file => file.path === target.path)?.sourceId).filter(Boolean));
  const notes = entries.filter(entry => pinned ? [...entry.section.sourceRefs, ...entry.section.evidence.map(ref => ref.sourceId)].some(ref => sourceIds.has(ref)) || (!targets.length && words.length && matches(entry.section.title + ' ' + entry.section.summary)) : matches(entry.section.title + ' ' + entry.section.summary)).sort((a, b) => a.id.localeCompare(b.id));
  const out = { projectId, revision: document.revision, snapshotId: snapshotId || null, semanticVerified: false,
    coverage: { dependencies: 'unavailable', selection: 'partial', semantics: 'unverified' }, sources: [], claims: [], handles: [],
    unknowns: ['Keyword selection is partial. Source identity does not verify semantic claims.'], remaining: { count: 0, sourceOffset: null, claimOffset: null } };
  const live = file => {
    recheck();
    if (!allowedPath(file.path) || sha(safeRead(root, file.path)) !== file.contentHash) throw Error('Source is stale or unavailable.');
  };
  let bodies = 0;
  const defer = (handle, kind, offset) => {
    out.handles.push(handle);
    if (bytes(out) > maxBytes - 128) {
      out.handles.pop(); out.remaining.count++;
      if (out.remaining[kind + 'Offset'] === null) out.remaining[kind + 'Offset'] = offset;
    }
  };
  const include = (list, item) => {
    if (bodies >= 3) return false;
    list.push(item);
    // Reserve space for continuation metadata before admitting whole text.
    if (bytes(out) > maxBytes - 512) { list.pop(); return false; }
    bodies++; return true;
  };
  for (const [index, target] of selected.entries()) {
    const file = pinned.files.find(file => file.path === target.path);
    const handle = { type: 'source', snapshotId, ...target, state: 'deferred' };
    if (!file) { defer({ ...handle, state: 'missing' }, 'source', index); continue; }
    if (!allowedPath(file.path)) throw Error('Source path is excluded by policy.');
    if (target.symbolId !== undefined && !file.symbols.some(symbol => symbol.id === target.symbolId)) throw Error('Source declaration is not in this snapshot.');
    if (bodies >= 3) { defer(handle, 'source', index); continue; }
    try { live(file); } catch { defer({ ...handle, state: 'stale-or-unavailable' }, 'source', index); continue; }
    const body = access.sources.read(projectId, { snapshotId, ...target, maxBytes: 65536 });
    if (!body.complete || !include(out.sources, { ...body, sourceId: file.sourceId, state: 'current' })) defer({ ...handle, requiredBytes: body.requiredBytes }, 'source', index);
  }
  for (const [index, entry] of notes.entries()) {
    const handle = { type: 'claim', id: entry.id, version: entry.version, title: entry.section.title, provenance: entry.section.provenance, ...(entry.location ? { location: entry.location } : {}), state: pinned ? 'deferred' : 'not-checked' };
    if (!pinned || bodies >= 3) { defer(handle, 'claim', index); continue; }
    const read = access.read(projectId, { ids: [entry.id], revision: document.revision, maxBytes: 65536 });
    const item = read.items[0];
    if (!item) { defer({ ...handle, requiredBytes: read.requiredBytes }, 'claim', index); continue; }
    const state = item.sourceEvidence !== 'matches' ? item.sourceEvidence : item.maintenance?.state !== 'clear' ? 'maintenance-' + (item.maintenance?.state || 'unknown') : 'current';
    if (state !== 'current') { defer({ ...handle, state: state || 'unverified' }, 'claim', index); continue; }
    if (!include(out.claims, { ...item, state: 'current', semanticVerified: false })) defer({ ...handle, requiredBytes: bytes(item) }, 'claim', index);
  }
  // Revalidate after note reads too: those can observe changes or policy updates.
  recheck();
  if (snapshotId) access.sourceBound(projectId, snapshotId);
  for (const claim of [...out.claims]) {
    const checked = access.read(projectId, { ids: [claim.id], revision: document.revision, maxBytes: 65536 }).items[0];
    if (!checked || checked.sourceEvidence !== 'matches' || checked.maintenance?.state !== 'clear') {
      out.claims.splice(out.claims.indexOf(claim), 1);
      defer({ type: 'claim', id: claim.id, version: claim.version, state: 'stale-or-unavailable' }, 'claim', notes.findIndex(entry => entry.id === claim.id));
    }
  }
  for (const source of [...out.sources]) {
    try { live(pinned.files.find(file => file.path === source.path)); }
    catch { out.sources.splice(out.sources.indexOf(source), 1); defer({ type: 'source', snapshotId, path: source.path, symbolId: source.symbolId, state: 'stale-or-unavailable' }, 'source', selected.findIndex(target => target.path === source.path)); }
  }
  recheck();
  if (bytes(out) > maxBytes) throw Error('Context metadata exceeds the byte budget. Select fewer targets.');
  return out;
}
module.exports = { buildContext };
