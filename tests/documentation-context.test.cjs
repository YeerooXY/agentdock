'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { run } = require('../scripts/documentation.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-context-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'entry.js'), 'export function entry() { return 42; }');
  const invoke = (...args) => run([...args, '--root', root]);
  const seed = () => {
    invoke('init'); const note = invoke('add', '--address', '1.2.1', '--title', 'Delivery obligation', '--id', 'sec_delivery').section;
    const snapshot = invoke('snapshot', '--paths', 'entry.js');
    const map = JSON.parse(fs.readFileSync(path.join(root, 'docs/knowledge/map.json')));
    map.sections[0].status = 'present'; map.sections[0].sourceRefs = [{ path: 'entry.js', contentHash: snapshot.files[0].contentHash }];
    fs.writeFileSync(path.join(root, 'docs/knowledge/map.json'), JSON.stringify(map));
    fs.writeFileSync(path.join(root, 'docs/knowledge', note.document), 'Delivery requires a receipt before the caller sees success.');
    return { snapshot, note };
  };
  return { root, invoke, seed };
}
test('portable context without a map is source-first and creates no documentation', t => {
  const f = fixture(t), context = f.invoke('context', '--paths', 'entry.js');
  assert.equal(context.sources[0].text, 'export function entry() { return 42; }');
  assert.deepEqual(context.claims, []); assert.equal(context.modelCalls, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'docs')), false);
});
test('portable context retrieves canonical obligations without rebasing or duplicating notes', t => {
  const f = fixture(t); f.seed();
  const before = fs.readFileSync(path.join(f.root, 'docs/knowledge/map.json'));
  const index = f.invoke('context', '--query', 'Delivery');
  assert.equal(index.handles[0].id, 'sec_delivery'); assert.match(index.handles[0].location, /^docs\/knowledge\//); assert.equal(index.snapshotId, null);
  const context = f.invoke('context', '--paths', 'entry.js');
  assert.match(context.claims[0].recorded.summary, /receipt before/);
  assert.equal(context.semanticVerified, false); assert.equal(context.coverage.dependencies, 'unavailable');
  assert.deepEqual(fs.readFileSync(path.join(f.root, 'docs/knowledge/map.json')), before);
});
test('portable stale evidence stays a handle even when a fresh source snapshot exists', t => {
  const f = fixture(t); f.seed();
  fs.writeFileSync(path.join(f.root, 'entry.js'), 'export function entry() { return 43; }');
  const context = f.invoke('context', '--paths', 'entry.js', '--max-bytes', '4096');
  assert.equal(context.claims.length, 0); assert.ok(context.handles.some(handle => handle.id === 'sec_delivery'));
  assert.ok(!JSON.stringify(context).includes('receipt before'));
  assert.ok(Buffer.byteLength(JSON.stringify(context)) <= 4096);
});
test('portable retrieval rejects foreign snapshots and escaped documentation paths', t => {
  const f = fixture(t); const { snapshot } = f.seed();
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-foreign-')); t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  const { SourceSnapshots } = require('../electron/source-snapshots.cjs');
  const sources = new SourceSnapshots(path.join(f.root, '.build/documentation'));
  fs.writeFileSync(path.join(other, 'foreign.js'), 'function foreign() {}');
  const foreign = sources.capture('standalone', other, { paths: ['foreign.js'] });
  assert.throws(() => f.invoke('context', '--snapshot', foreign.snapshotId), /foreign/);
  const mapFile = path.join(f.root, 'docs/knowledge/map.json'), map = JSON.parse(fs.readFileSync(mapFile));
  map.sections[0].document = '../../escape.md'; fs.writeFileSync(mapFile, JSON.stringify(map));
  assert.throws(() => f.invoke('context', '--snapshot', snapshot.snapshotId), /relative/);
});
