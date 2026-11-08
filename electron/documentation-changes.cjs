'use strict';
const { createHash } = require('node:crypto');
const { extractSourceFacts } = require('./source-facts.cjs');
const { sourcePathAllowed } = require('./repo-inventory.cjs');
const sha = text => createHash('sha256').update(text).digest('hex');

function checkedSnapshot(value) {
  if (!value || value.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(value.rootId) || !Array.isArray(value.files) || value.files.length > 512 || typeof value.coverage?.complete !== 'boolean') throw Error('Choose a bounded source snapshot.');
  const paths = new Set(); let bytes = 0;
  for (const file of value.files) {
    if (!sourcePathAllowed(file.path) || paths.has(file.path) || typeof file.text !== 'string' || Buffer.byteLength(file.text) > 262144 || sha(file.text) !== file.contentHash) throw Error('Source snapshot integrity check failed.');
    bytes += Buffer.byteLength(file.text);
    if (bytes > 8 * 1024 * 1024) throw Error('Source snapshot exceeds the byte budget.');
    paths.add(file.path);
  }
  return value;
}
function declarations(file) {
  return file ? extractSourceFacts({ path: file.path, text: file.text }) : null;
}
function planChanges(before, after, sections = []) {
  checkedSnapshot(before); checkedSnapshot(after);
  if (before.rootId !== after.rootId) throw Error('Source roots differ; explicit reconciliation is required.');
  if (!Array.isArray(sections) || sections.length > 500) throw Error('Documentation section limit exceeded.');
  for (const section of sections) if (!section || typeof section.id !== 'string' || !Array.isArray(section.sourceRefs) || !Array.isArray(section.relatedIds)) throw Error('Invalid documentation section metadata.');
  const old = new Map(before.files.map(f => [f.path, f])), current = new Map(after.files.map(f => [f.path, f]));
  const unobservedSections = sections.map(section => ({ id: section.id, paths: section.sourceRefs.filter(ref => !old.has(ref.path) || !current.has(ref.path)).map(ref => ref.path) })).filter(section => section.paths.length);
  const changes = [];
  for (const filePath of [...new Set([...old.keys(), ...current.keys()])].sort()) {
    const base = old.get(filePath), target = current.get(filePath);
    if (base?.contentHash === target?.contentHash) continue;
    // A partial/selected capture never proves that a missing file was deleted.
    const kind = !target ? (after.coverage.complete ? 'removed' : 'unavailable') : !base ? (before.coverage.complete ? 'added' : 'newly-observed') : 'modified';
    const a = declarations(base), b = declarations(target);
    const previous = new Map((a?.symbols || []).map(s => [s.id, s]));
    const next = new Map((b?.symbols || []).map(s => [s.id, s]));
    const symbols = [];
    for (const id of new Set([...previous.keys(), ...next.keys()])) {
      const x = previous.get(id), y = next.get(id);
      if (x?.contentHash !== y?.contentHash) symbols.push({ id, kind: !x ? 'added' : !y ? 'removed' : 'modified', beforeHash: x?.contentHash || null, afterHash: y?.contentHash || null });
    }
    changes.push({ path: filePath, kind, beforeHash: base?.contentHash || null, afterHash: target?.contentHash || null, symbols,
      coverage: { before: a?.coverage || null, after: b?.coverage || null },
      // Syntax fingerprints assist triage only. Comments, ASI, compiler directives
      // and external consumers prevent treating token equality as semantic proof.
      semanticReviewRequired: true });
  }
  const direct = new Set(), affected = [];
  for (const section of sections) {
    const relevant = changes.filter(c => (section.sourceRefs || []).some(ref => ref.path === c.path));
    if (!relevant.length) continue;
    direct.add(section.id);
    affected.push({ id: section.id, address: section.address, reason: 'changed-source-evidence', paths: relevant.map(c => c.path), action: 'review-semantic-fields-only' });
  }
  // Check one hop in both directions. A relationship need not be duplicated by
  // both notes. These are review candidates, not automatic rewrites.
  const outgoing = new Set(sections.filter(s => direct.has(s.id)).flatMap(s => s.relatedIds || []));
  for (const section of sections) if (!direct.has(section.id) && (outgoing.has(section.id) || (section.relatedIds || []).some(id => direct.has(id)))) affected.push({ id: section.id, address: section.address, reason: 'linked-responsibility-changed', action: 'check-handoff-obligations' });
  return { schemaVersion: 1, changes, affected, unobservedSections, reviewComplete: !unobservedSections.length && before.coverage.complete && after.coverage.complete,
    unplacedPaths: changes.filter(c => !sections.some(s => (s.sourceRefs || []).some(r => r.path === c.path))).map(c => c.path),
    modelCalls: 0, writes: 0, instruction: 'Refresh generated facts. Review affected semantic fields and evidence only. Do not regenerate unaffected prose or infer complete dependency coverage.',
    coverage: { before: before.coverage, after: after.coverage, dependencyResolution: 'unavailable' } };
}
module.exports = { checkedSnapshot, planChanges };
