'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { taxonomy, ADDRESS, ID, HEADINGS, rootPath, checkedPath, readJson, relative } = require('./documentation-scaffold.cjs');
const { checkedSnapshot } = require('./documentation-changes.cjs');
const { safeRead } = require('./source-snapshots.cjs');
const { sourcePathAllowed } = require('./repo-inventory.cjs');
const sha = text => createHash('sha256').update(text).digest('hex');

function validateMap(root, snapshot) {
  root = rootPath(root);
  if (snapshot) checkedSnapshot(snapshot);
  const data = readJson(root, 'docs/knowledge/map.json'), errors = [], gaps = []; let verifiedRefs = 0;
  if (data.schemaVersion !== 1 || data.taxonomyVersion !== taxonomy.taxonomyVersion || !Array.isArray(data.sections) || data.sections.length > 500) throw Error('Invalid documentation map schema or section limit.');
  const ids = new Set(), addresses = new Set(), documents = new Set();
  for (const section of data.sections) {
    const label = typeof section?.id === 'string' ? section.id : '<invalid>';
    const fail = message => errors.push({ id: label, message });
    if (!section || typeof section !== 'object' || Array.isArray(section)) { fail('Invalid section record.'); continue; }
    if (typeof section.id !== 'string' || !ID.test(section.id) || ids.has(section.id)) fail('Missing, invalid or duplicate stable ID.');
    ids.add(section.id);
    if (typeof section.address !== 'string' || !ADDRESS.test(section.address) || section.address.split('.').length !== 3 || addresses.has(section.address)) fail('Invalid or duplicate three-level address.');
    addresses.add(section.address);
    const parent = taxonomy.entries.find(e => e.address === String(section.address).split('.').slice(0, 2).join('.'));
    if (!taxonomy.entries.some(e => e.address === section.address) && !parent?.extensible) fail('Address is outside the taxonomy.');
    if (typeof section.title !== 'string' || !section.title.trim() || section.title.length > 160) fail('Missing or invalid title.');
    if (!['uninspected', 'present', 'uncertain'].includes(section.status)) fail('Invalid status. Absence claims require a scoped protocol and are not supported by this file schema.');
    if (!Array.isArray(section.sourceRefs) || section.sourceRefs.length > 64 || !Array.isArray(section.relatedIds) || section.relatedIds.length > 64) { fail('Invalid source or relationship list.'); continue; }
    try {
      relative(section.document);
      if (!section.document.endsWith('.md') || documents.has(section.document)) throw Error('Invalid or duplicate section document.');
      documents.add(section.document);
      const file = checkedPath(root, 'docs/knowledge/' + section.document), stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.size > 65536) throw Error('Section document is missing or exceeds 64 KiB.');
      const text = fs.readFileSync(file, 'utf8');
      if (!text.split(/\r?\n/).includes(`# ${section.address} ${section.title}`)) fail('Document heading differs from its directory entry.');
      if (!text.split(/\r?\n/).includes('Stable ID: ' + section.id)) fail('Document must declare its exact stable ID.');
      for (const heading of HEADINGS) if (!text.split(/\r?\n/).includes('## ' + heading)) fail('Missing field: ' + heading);
      if (section.status === 'present' && /(?:^|\n)Uninspected\.(?:\r?\n|$)/.test(text)) fail('Present sections still contain uninspected template fields.');
    } catch (error) { fail(error.message); }
    if (section.status !== 'uninspected' && !section.sourceRefs.length) fail('Populated sections require source evidence.');
    if (section.status !== 'present') gaps.push({ id: label, reason: section.status });
    for (const ref of section.sourceRefs) {
      if (!ref || !sourcePathAllowed(ref.path) || !/^[a-f0-9]{64}$/.test(ref.contentHash) || (ref.symbolId !== undefined && (typeof ref.symbolId !== 'string' || !ref.symbolId.trim() || ref.symbolId.length > 1500))) { fail('Invalid source evidence.'); continue; }
      if (!snapshot) { gaps.push({ id: label, path: ref.path, reason: 'snapshot-not-supplied' }); continue; }
      const file = snapshot.files.find(f => f.path === ref.path);
      if (!file) { gaps.push({ id: label, path: ref.path, reason: 'source-not-in-snapshot' }); fail('Evidence unavailable in supplied snapshot: ' + ref.path); continue; }
      const evidenceErrors = errors.length;
      if (file.contentHash !== ref.contentHash) fail('Stale source evidence: ' + ref.path);
      if (ref.symbolId && !file.symbols?.some(s => s.id === ref.symbolId)) fail('Missing declaration anchor: ' + ref.symbolId);
      try { if (sha(safeRead(root, ref.path)) !== file.contentHash) fail('Live source differs from snapshot: ' + ref.path); else if (errors.length === evidenceErrors) verifiedRefs++; }
      catch { fail('Live source unavailable: ' + ref.path); }
    }
    if (new Set(section.relatedIds).size !== section.relatedIds.length) fail('Duplicate relationships.');
  }
  for (const section of data.sections) for (const id of Array.isArray(section?.relatedIds) ? section.relatedIds : []) if (!ids.has(id) || id === section.id) errors.push({ id: section.id, message: 'Invalid relationship: ' + id });
  return { valid: errors.length === 0, checkComplete: data.sections.length > 0 && !errors.length && !gaps.length, evidenceVerified: !!snapshot && verifiedRefs > 0 && !errors.length && !gaps.length,
    verifiedRefs, scope: 'Listed sections and cited source only.', sourceCoverage: snapshot?.coverage || null, errors, gaps, sections: data.sections.length, modelCalls: 0, semanticVerified: false };
}
module.exports = { validateMap };
