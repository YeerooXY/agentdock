'use strict';
const fs = require('node:fs'), path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { TextDecoder } = require('node:util');
const { inventoryRepository, sourcePathAllowed } = require('./repo-inventory.cjs');
const HASH = /^[a-f0-9]{64}$/, ID = /^[A-Za-z0-9_-]{1,100}$/;
const sha = value => createHash('sha256').update(value).digest('hex');
const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };
const sensitive = text => /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})|\b(?:password|api[_-]?key|access[_-]?token|client[_-]?secret)["']?\s*[:=]\s*(?:["'][^"'\r\n]+["']|[^\s,"'{}]{12,})/i.test(text);
function relative(value) {
  if (typeof value !== 'string' || value.length > 1000 || value.includes('\\') || value.startsWith('/') || /[:\x00-\x1f]/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Choose a relative source path from the inventory.');
  return value;
}
function safeRead(root, file) {
  relative(file);
  const target = path.join(root, file); let cursor = root;
  for (const part of file.split('/')) { cursor = path.join(cursor, part); if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('Linked source paths are unavailable.'); }
  if (!inside(root, fs.realpathSync(target))) throw Error('Source path leaves the project folder.');
  const before = fs.lstatSync(target);
  if (!before.isFile() || before.size > 262144) throw Error('Source file exceeds the 256 KiB limit or is unavailable.');
  const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || !opened.isFile()) throw Error('Source changed during capture.');
    const bytes = Buffer.alloc(262145); let count = 0, read;
    while (count < bytes.length && (read = fs.readSync(fd, bytes, count, bytes.length - count, null))) count += read;
    const after = fs.fstatSync(fd), linked = fs.lstatSync(target);
    if (count > 262144 || count !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || linked.isSymbolicLink() || linked.ino !== opened.ino || linked.dev !== opened.dev || !inside(root, fs.realpathSync(target))) throw Error('Source changed during capture.');
    const data = bytes.subarray(0, count), text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
    if (text.includes('\0') || !Buffer.from(text).equals(data)) throw Error('Source is not exact UTF-8 text.');
    return text;
  } finally { fs.closeSync(fd); }
}
class SourceSnapshots {
  constructor(root, { extract, isSensitive = sensitive } = {}) { this.base = path.resolve(root); this.root = path.join(this.base, 'knowledge-sources'); this.extract = extract || (value => require('./source-facts.cjs').extractSourceFacts(value)); this.isSensitive = isSensitive; }
  file(projectId, snapshotId) {
    if (!ID.test(projectId) || !HASH.test(snapshotId)) throw Error('Invalid project or source snapshot identity.');
    const target = path.join(this.root, projectId, snapshotId + '.json');
    let cursor = this.base;
    for (const part of ['', 'knowledge-sources', projectId, snapshotId + '.json']) { if (part) cursor = path.join(cursor, part); try { if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('Linked source storage is unavailable.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    return target;
  }
  capture(projectId, folder, { paths, maxFiles = 128, identityRootId, beforePersist = () => {}, inventoryBounds = { maxEntries: 20000, maxDepth: 20 } } = {}) {
    if (!ID.test(projectId) || !Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 512) throw Error('Invalid source capture bounds.');
    const inventory = inventoryRepository(folder, inventoryBounds);
    const canonical = fs.realpathSync(folder);
    if (paths !== undefined && (!Array.isArray(paths) || paths.length > 512 || new Set(paths).size !== paths.length)) throw Error('Choose 1 to 512 distinct source paths.');
    const available = new Map(inventory.files.filter(f => ['source', 'config', 'docs'].includes(f.kind)).map(f => [f.path, f]));
    if (paths?.some(file => !sourcePathAllowed(relative(file)))) throw Error('Source path is excluded or unavailable under the source selection policy.');
    const rank = { source: 0, config: 1, docs: 2 };
    const selected = paths || [...available.keys()].sort((a, b) => rank[available.get(a).kind] - rank[available.get(b).kind] || a.localeCompare(b)), files = [], omitted = []; let bytes = 0, storedBytes = 0;
    for (const file of selected.slice(0, maxFiles)) {
      try {
        const text = safeRead(canonical, file);
        if (this.isSensitive(text)) { omitted.push({ path: file, reason: 'sensitive-content' }); continue; }
        if (bytes + Buffer.byteLength(text) > 8 * 1024 * 1024) { omitted.push({ path: file, reason: 'byte-budget' }); continue; }
        const extracted = this.extract({ path: file, text });
        const record = { path: file, text, contentHash: sha(text), symbols: extracted.symbols, coverage: extracted.coverage, language: extracted.language, extractor: extracted.extractor };
        const encodedBytes = Buffer.byteLength(JSON.stringify(record));
        if (storedBytes + encodedBytes > 16 * 1024 * 1024) { omitted.push({ path: file, reason: 'storage-budget' }); continue; }
        files.push(record); bytes += Buffer.byteLength(text); storedBytes += encodedBytes;
      } catch { omitted.push({ path: file, reason: 'unavailable-or-changed' }); }
    }
    if (fs.lstatSync(folder).isSymbolicLink() || fs.realpathSync(folder) !== canonical) throw Error('Project folder changed during capture.');
    const workingCopyId = sha(process.platform === 'win32' ? canonical.toLowerCase() : canonical);
    if (identityRootId !== undefined && !HASH.test(identityRootId)) throw Error('Invalid source root identity.');
    const rootId = identityRootId || workingCopyId;
    for (const file of files) file.sourceId = 'src_' + sha(rootId + '\0' + file.path).slice(0, 48);
    const payload = { schemaVersion: 1, projectId, rootId, workingCopyId, files, coverage: { complete: !paths && inventory.coverage.complete && !omitted.length && selected.length <= maxFiles, selectionOnly: !!paths, inventoryId: inventory.inventoryId, excludedByInventory: inventory.coverage.excluded, omitted: omitted.slice(0, 128), omittedCount: omitted.length, deferredPaths: selected.slice(maxFiles, maxFiles + 128), deferredCount: Math.max(0, selected.length - maxFiles), dependencyResolution: 'unavailable', note: 'Immutable selected UTF-8 sources. Signatures are syntax facts; dynamic dependencies and type resolution are unverified.' } };
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized) > 20 * 1024 * 1024) throw Error('Source snapshot exceeds the storage budget. Select fewer files.');
    const snapshotId = sha(serialized), target = this.file(projectId, snapshotId);
    beforePersist();
    fs.mkdirSync(path.dirname(target), { recursive: true }); this.file(projectId, snapshotId);
    const temp = path.join(path.dirname(target), randomUUID() + '.tmp');
    try {
      const fd = fs.openSync(temp, 'wx', 0o600);
      try { fs.writeFileSync(fd, serialized); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      // Publish a complete immutable file only if the destination is absent.
      try { fs.linkSync(temp, target); } catch (error) { if (error.code !== 'EEXIST') throw error; this.load(projectId, snapshotId); }
    } finally { try { fs.unlinkSync(temp); } catch {} }
    return this.describe(snapshotId, payload);
  }
  load(projectId, snapshotId) {
    const target = this.file(projectId, snapshotId), stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 20 * 1024 * 1024) throw Error('Source snapshot is unavailable.');
    const payload = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (sha(JSON.stringify(payload)) !== snapshotId || payload.projectId !== projectId || payload.schemaVersion !== 1) throw Error('Source snapshot integrity check failed.');
    return payload;
  }
  describe(snapshotId, payload) { return { snapshotId, projectId: payload.projectId, rootId: payload.rootId, files: payload.files.map(file => ({ path: file.path, sourceId: file.sourceId, contentHash: file.contentHash, language: file.language, symbolCount: file.symbols.length, coverage: file.coverage })), coverage: payload.coverage }; }
  resolve(projectId, { snapshotId, query = '', limit = 30, cursor = 0 } = {}) {
    if (typeof query !== 'string' || query.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(cursor) || cursor < 0) throw Error('Invalid source query bounds.');
    const payload = this.load(projectId, snapshotId), matches = [];
    for (const file of payload.files) for (const symbol of file.symbols) if (!query || `${file.path} ${symbol.name}`.toLowerCase().includes(query.toLowerCase())) matches.push({ path: file.path, ...symbol });
    const items = []; let bytes = 0;
    for (const item of matches.slice(cursor, cursor + limit)) {
      const size = Buffer.byteLength(JSON.stringify(item));
      if (bytes + size > 32768) break;
      items.push(item); bytes += size;
    }
    const next = cursor + items.length;
    return { snapshotId, items, total: matches.length, nextCursor: next < matches.length ? next : null,
      requiredBytes: !items.length && matches[cursor] ? Buffer.byteLength(JSON.stringify(matches[cursor])) : null,
      decompositionRequired: !items.length && !!matches[cursor],
      files: payload.files.filter(file => !query || file.path.toLowerCase().includes(query.toLowerCase())).slice(0, Math.min(limit, 20)).map(file => ({ path: file.path, sourceId: file.sourceId, contentHash: file.contentHash, symbolCount: file.symbols.length, syntaxStatus: file.coverage?.status || 'unknown' })), coverage: { complete: payload.coverage.complete, selectionOnly: payload.coverage.selectionOnly, omittedCount: payload.coverage.omittedCount, deferredCount: payload.coverage.deferredCount, dependencyResolution: 'unavailable' } };
  }
  read(projectId, { snapshotId, path: filePath, symbolId, maxBytes = 32768 } = {}) {
    if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 262144) throw Error('Invalid exact source budget.');
    const payload = this.load(projectId, snapshotId), file = payload.files.find(f => f.path === relative(filePath));
    if (!file) throw Error('Source path is not in this snapshot.');
    const symbol = symbolId === undefined ? null : file.symbols.find(s => s.id === symbolId);
    if (symbolId !== undefined && !symbol) throw Error('Source declaration is not in this snapshot.');
    const text = symbol ? file.text.slice(symbol.start, symbol.end) : file.text, contentHash = sha(text);
    if (contentHash !== (symbol?.contentHash || file.contentHash)) throw Error('Source declaration integrity check failed.');
    const requiredBytes = Buffer.byteLength(text);
    return { snapshotId, path: file.path, symbolId: symbol?.id || null, contentHash, fileHash: file.contentHash, exact: true, encoding: 'utf-8', text: requiredBytes <= maxBytes ? text : null, requiredBytes, complete: requiredBytes <= maxBytes, startByte: symbol ? Buffer.byteLength(file.text.slice(0, symbol.start)) : 0, endByte: symbol ? Buffer.byteLength(file.text.slice(0, symbol.end)) : Buffer.byteLength(file.text), coverage: file.coverage };
  }
}
module.exports = { SourceSnapshots, safeRead, sensitive };
