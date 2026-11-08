'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { scaffold, addSection, renderIndex, taxonomy } = require('../electron/documentation-scaffold.cjs');
const { validateMap } = require('../electron/documentation-validation.cjs');
const { planChanges } = require('../electron/documentation-changes.cjs');
const { run, parse } = require('../scripts/documentation.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-doc-tools-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function map(root) { return JSON.parse(fs.readFileSync(path.join(root, 'docs/knowledge/map.json'), 'utf8')); }
function save(root, value) { fs.writeFileSync(path.join(root, 'docs/knowledge/map.json'), JSON.stringify(value)); }
const sha = text => createHash('sha256').update(text).digest('hex');
const snap = (text, complete = false) => ({ schemaVersion: 1, rootId: 'a'.repeat(64), coverage: { complete, dependencyResolution: 'unavailable' }, files: text === null ? [] : [{ path: 'math.ts', text, contentHash: sha(text) }] });

test('empty initialization writes a short uninspected index without taxonomy placeholders or notes', t => {
  const root = fixture(t); scaffold(root);
  const index = fs.readFileSync(path.join(root, 'docs/knowledge/index.md'), 'utf8');
  assert.equal(index, '# Application map\n\nSection metadata: [map.json](map.json).\n\nState: uninspected.\n');
  assert.equal(index, renderIndex(map(root)));
  for (const item of taxonomy.entries) assert.ok(!index.includes(item.title));
  assert.deepEqual(fs.readdirSync(path.join(root, 'docs/knowledge')).sort(), ['index.md', 'map.json']);
});

test('populated index groups actual sections in numeric order with exact links and stable identities', t => {
  const root = fixture(t); scaffold(root);
  const entries = [
    { address: '2.2.4', title: 'Settings', id: 'sec_settings' },
    { address: '1.3.3', title: 'Cancellation', id: 'sec_cancel' },
    { address: '1.2.10', title: 'Tenth domain', id: 'sec_ten' },
    { address: '1.2.2', title: 'Second domain', id: 'sec_two' }
  ];
  for (const entry of entries) assert.equal(addSection(root, entry).indexUpdated, true);
  const data = map(root), before = JSON.stringify(data), index = fs.readFileSync(path.join(root, 'docs/knowledge/index.md'), 'utf8');
  assert.equal(index, renderIndex(data));
  assert.equal(renderIndex({ ...data, sections: data.sections.slice().reverse() }), index);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(index.split('\n').filter(line => line.startsWith('- ')), [
    '- [1.2.2 Second domain](1/2/sec_two.md) (Stable ID: `sec_two`)',
    '- [1.2.10 Tenth domain](1/2/sec_ten.md) (Stable ID: `sec_ten`)',
    '- [1.3.3 Cancellation](1/3/sec_cancel.md) (Stable ID: `sec_cancel`)',
    '- [2.2.4 Settings](2/2/sec_settings.md) (Stable ID: `sec_settings`)'
  ]);
  assert.deepEqual(index.split('\n').filter(line => /^#{2,3} /.test(line)), [
    '## 1 Backend and core logic', '### 1.2 Domain systems', '### 1.3 Execution and concurrency',
    '## 2 Frontend and interaction', '### 2.2 User actions'
  ]);
  for (const section of data.sections) assert.ok(fs.statSync(path.join(root, 'docs/knowledge', section.document)).isFile());
  assert.equal(addSection(root, entries[0]).indexUpdated, false);
  scaffold(root); assert.equal(fs.readFileSync(path.join(root, 'docs/knowledge/index.md'), 'utf8'), index);
});

test('section creation preserves owner-edited, legacy and missing indexes', t => {
  for (const ownerIndex of ['# Owner navigation\n\n[Guide](guide.md)\n', '# Application map\n\n- 0 Application overview\n', null]) {
    const root = fixture(t); scaffold(root);
    const indexPath = path.join(root, 'docs/knowledge/index.md');
    if (ownerIndex === null) fs.unlinkSync(indexPath); else fs.writeFileSync(indexPath, ownerIndex);
    const result = addSection(root, { address: '1.2.1', title: 'Math' });
    assert.equal(result.created, true); assert.equal(result.indexUpdated, false);
    assert.equal(map(root).sections[0].id, result.section.id);
    if (ownerIndex === null) assert.equal(fs.existsSync(indexPath), false);
    else assert.equal(fs.readFileSync(indexPath, 'utf8'), ownerIndex);
  }
});

test('index escaping preserves literal titles and encodes adopted relative document paths', t => {
  const root = fixture(t); scaffold(root);
  addSection(root, { address: '1.2.1', title: 'Array [x] *value* <tag> & `code` \\ path', id: 'sec_literal' });
  const data = map(root), section = data.sections[0];
  const oldPath = path.join(root, 'docs/knowledge', section.document);
  section.document = '1/2/owner guide (v1) [x] #50%.md';
  fs.renameSync(oldPath, path.join(root, 'docs/knowledge', section.document));
  data.retiredIds = ['sec_retired']; save(root, data);
  const index = renderIndex(data);
  assert.ok(index.includes('Array \\[x\\] \\*value\\* \\<tag\\> \\& \\`code\\` \\\\ path'));
  assert.ok(index.includes('(1/2/owner%20guide%20%28v1%29%20%5Bx%5D%20%2350%25.md)'));
  fs.writeFileSync(path.join(root, 'docs/knowledge/index.md'), index);
  const note = fs.readFileSync(path.join(root, 'docs/knowledge', section.document));
  assert.equal(addSection(root, { address: '1.2.2', title: 'Another domain' }).indexUpdated, true);
  assert.deepEqual(map(root).sections[0], section);
  assert.deepEqual(map(root).retiredIds, ['sec_retired']);
  assert.deepEqual(fs.readFileSync(path.join(root, 'docs/knowledge', section.document)), note);
});

test('index rendering bounds sections and rejects unsafe paths and multiline titles', () => {
  const section = { id: 'sec_one', address: '1.2.1', title: 'One', document: '1/2/one.md' };
  assert.throws(() => renderIndex({ sections: Array(501).fill(section) }), /limit/);
  assert.throws(() => renderIndex({ sections: [{ ...section, document: '../owner.md' }] }), /relative/);
  assert.throws(() => renderIndex({ sections: [{ ...section, title: 'One\n# Heading' }] }), /section/);
});

test('taxonomy is unique, ordered, uninspected metadata with bounded three-level navigation', () => {
  assert.equal(taxonomy.schemaVersion, 1);
  assert.equal(taxonomy.entries.filter(e => e.parentId === null).length, 8);
  const ids = new Set(), addresses = new Set();
  for (const e of taxonomy.entries) {
    assert.equal(e.status, 'uninspected'); assert.ok(e.address.split('.').length <= 3);
    assert.ok(!ids.has(e.id)); assert.ok(!addresses.has(e.address));
    if (e.parentId) assert.ok(ids.has(e.parentId));
    ids.add(e.id); addresses.add(e.address);
  }
});
test('scaffold and section creation are repeatable, sparse, preserve owner files and validate template gaps', t => {
  const root = fixture(t);
  assert.equal(scaffold(root).created, true);
  assert.deepEqual(fs.readdirSync(path.join(root, 'docs/knowledge')).sort(), ['index.md', 'map.json']);
  assert.equal(scaffold(root).created, false);
  const result = addSection(root, { address: '1.3.3', title: 'Cancellation' });
  assert.equal(result.section.status, 'uninspected');
  assert.equal(addSection(root, { address: '1.3.3', title: 'Cancellation' }).created, false);
  assert.throws(() => addSection(root, { address: '1.3.3', title: 'Other' }), /assigned/);
  const report = validateMap(root);
  assert.equal(report.valid, true); assert.equal(report.semanticVerified, false); assert.equal(report.gaps.length, 1);
  const doc = path.join(root, 'docs/knowledge', result.section.document);
  fs.appendFileSync(doc, '\nOwner text.\n');
  scaffold(root); assert.match(fs.readFileSync(doc, 'utf8'), /Owner text/);
});
test('optional folders and extensible branches do not assert implementation', t => {
  const root = fixture(t); scaffold(root, { folders: true });
  for (let i = 0; i < 8; i++) assert.ok(fs.statSync(path.join(root, 'docs/knowledge', String(i))).isDirectory());
  addSection(root, { address: '1.2.40', title: 'Game combat' });
  addSection(root, { address: '2.2.4', title: 'Settings editor' });
  assert.equal(validateMap(root).valid, true);
  assert.throws(() => addSection(root, { address: '1.8.1', title: 'Unknown branch' }), /defined topic/);
  assert.throws(() => addSection(root, { address: '../x', title: 'Bad' }), /address/);
});
test('existing canonical documentation and locks prevent competing writers', t => {
  const root = fixture(t); fs.mkdirSync(path.join(root, 'docs'));
  fs.writeFileSync(path.join(root, 'docs/application-map.md'), 'Owner map');
  assert.throws(() => scaffold(root), /Existing documentation/);
  assert.equal(fs.existsSync(path.join(root, 'docs/knowledge/map.json')), false);
  fs.unlinkSync(path.join(root, 'docs/application-map.md')); scaffold(root);
  fs.writeFileSync(path.join(root, 'docs/knowledge/.write.lock'), 'busy');
  assert.throws(() => addSection(root, { address: '1.3.3', title: 'Cancellation' }), /locked/);
});
test('documentation writers refuse linked ancestors and snapshot storage', t => {
  const root = fixture(t), outside = fixture(t);
  fs.symlinkSync(outside, path.join(root, 'docs'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => scaffold(root), /links/);
  fs.symlinkSync(outside, path.join(root, '.build'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => run(['snapshot', '--root', root]), /links/);
  assert.deepEqual(fs.readdirSync(outside), []);
});
test('validator rejects missing stable identities, fabricated evidence and missing fields', t => {
  const root = fixture(t); scaffold(root); addSection(root, { address: '1.3.3', title: 'Cancellation' });
  const data = map(root); delete data.sections[0].id; data.sections[0].status = 'present';
  save(root, data);
  const report = validateMap(root);
  assert.equal(report.valid, false); assert.ok(report.errors.some(e => /stable ID/.test(e.message)));
  assert.ok(report.errors.some(e => /source evidence/.test(e.message)));
  assert.ok(report.errors.some(e => /uninspected template/.test(e.message)));
});
test('change planning limits direct updates and checks linked handoffs without blanket rewrites', () => {
  const refs = [{ path: 'math.ts', contentHash: 'unused' }];
  const sections = [{ id: 'sec_math', address: '1.2.1', sourceRefs: refs, relatedIds: ['sec_callee'] }, { id: 'flow_math', address: '6.1.1', sourceRefs: [], relatedIds: ['sec_math'] }, { id: 'sec_other', address: '1.2.2', sourceRefs: [{ path: 'other.ts' }], relatedIds: [] }, { id: 'sec_callee', address: '1.2.3', sourceRefs: [], relatedIds: [] }];
  const a = snap('export function add(a: number): number { return a + 1; }');
  assert.equal(planChanges(a, a, sections).changes.length, 0);
  const result = planChanges(a, snap('export function add(a: number): number { return a + 2; }'), sections);
  assert.deepEqual(result.affected.map(e => e.id), ['sec_math', 'flow_math', 'sec_callee']);
  assert.equal(result.changes[0].symbols.length, 1); assert.equal(result.modelCalls, 0); assert.equal(result.writes, 0);
  assert.equal(planChanges(a, snap(null), sections).changes[0].kind, 'unavailable');
  assert.equal(planChanges(a, snap(null, true), sections).changes[0].kind, 'removed');
  assert.throws(() => planChanges(a, { ...a, rootId: 'b'.repeat(64) }), /roots differ/);
});

test('partial captures explicitly name unobserved documented sections and malformed maps cannot report a clean diff', t => {
  const sections = [{ id: 'sec_unseen', address: '1.2.2', sourceRefs: [{ path: 'unseen.ts' }], relatedIds: [] }];
  const a = snap('export function f() {}');
  const result = planChanges(a, a, sections);
  assert.deepEqual(result.changes, []);
  assert.equal(result.reviewComplete, false);
  assert.deepEqual(result.unobservedSections, [{ id: 'sec_unseen', paths: ['unseen.ts'] }]);
  const root = fixture(t); scaffold(root); fs.writeFileSync(path.join(root, 'a.ts'), 'function a(){}');
  const capture = run(['snapshot', '--root', root, '--paths', 'a.ts']); save(root, {});
  assert.throws(() => run(['diff', '--root', root, '--base', capture.snapshotId, '--target', capture.snapshotId]), /Invalid documentation map/);
});

test('validator rejects unavailable evidence and false declaration anchors, and names uncertain gaps', t => {
  const root = fixture(t); scaffold(root); addSection(root, { address: '1.2.1', title: 'Math' });
  fs.writeFileSync(path.join(root, 'math.ts'), 'function add(a: number) { return a; }');
  const pinned = snap(fs.readFileSync(path.join(root, 'math.ts'), 'utf8'));
  pinned.files[0].symbols = require('../electron/source-facts.cjs').extractSourceFacts({ path: 'math.ts', text: pinned.files[0].text }).symbols;
  const data = map(root); data.sections[0].status = 'uncertain';
  data.sections[0].sourceRefs = [{ path: 'math.ts', contentHash: pinned.files[0].contentHash, symbolId: 'made-up' }]; save(root, data);
  assert.ok(validateMap(root, pinned).errors.some(e => /Missing declaration anchor/.test(e.message)));
  data.sections[0].sourceRefs[0].symbolId = ''; save(root, data);
  assert.ok(validateMap(root, pinned).errors.some(e => /Invalid source evidence/.test(e.message)));
  delete data.sections[0].sourceRefs[0].symbolId; save(root, data);
  const missing = validateMap(root, snap(null));
  assert.equal(missing.valid, false); assert.equal(missing.evidenceVerified, false); assert.equal(missing.checkComplete, false);
  assert.ok(missing.gaps.some(g => g.reason === 'uncertain'));
  assert.ok(missing.errors.some(e => /Evidence unavailable/.test(e.message)));
});

test('empty and uninspected maps cannot report completed evidence checks', t => {
  const root = fixture(t); scaffold(root);
  for (let i = 0; i < 2; i++) {
    const result = validateMap(root, snap('function add() {}'));
    assert.equal(result.valid, true); assert.equal(result.evidenceVerified, false);
    assert.equal(result.checkComplete, false); assert.equal(result.verifiedRefs, 0);
    if (!i) addSection(root, { address: '1.2.1', title: 'Math' });
  }
});
test('native CLI completes scaffold, pinned facts, exact extraction, stale validation and diff with no inference', t => {
  const root = fixture(t); fs.writeFileSync(path.join(root, 'math.ts'), 'export function add(a: number): number { return a + 1; }');
  assert.equal(run(['init', '--root', root]).modelCalls, 0);
  run(['add', '--root', root, '--address', '1.2.1', '--title', 'Math']);
  assert.equal(run(['directory', '--root', root, '--address', '1.2']).sections.length, 1);
  assert.equal(run(['directory', '--root', root, '--address', '1.3']).sections.length, 0);
  const before = run(['snapshot', '--root', root, '--paths', 'math.ts']);
  const facts = run(['facts', '--root', root, '--snapshot', before.snapshotId, '--path', 'math.ts']);
  assert.match(facts.symbols[0].signature, /number/);
  assert.match(run(['extract', '--root', root, '--snapshot', before.snapshotId, '--path', 'math.ts', '--symbol', facts.symbols[0].id]).text, /return a \+ 1/);
  const data = map(root); data.sections[0].sourceRefs = [{ path: 'math.ts', contentHash: before.files[0].contentHash, symbolId: facts.symbols[0].id }]; save(root, data);
  assert.equal(run(['validate', '--root', root, '--snapshot', before.snapshotId]).valid, true);
  fs.writeFileSync(path.join(root, 'math.ts'), 'export function add(a: number): number { return a + 2; }');
  assert.equal(run(['validate', '--root', root, '--snapshot', before.snapshotId]).valid, false);
  const after = run(['snapshot', '--root', root, '--paths', 'math.ts']);
  const diff = run(['diff', '--root', root, '--base', before.snapshotId, '--target', after.snapshotId]);
  assert.equal(diff.affected.length, 1); assert.equal(diff.changes.length, 1);
  assert.throws(() => parse(['init', '--root', root, '--unknown']), /Unknown/);
  assert.throws(() => run(['snapshot', '--root', root, '--paths', '../secret.ts']), /relative|excluded/);
});
