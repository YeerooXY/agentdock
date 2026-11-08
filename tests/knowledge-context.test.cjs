'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { Projects } = require('../electron/projects.cjs');
const { ProjectKnowledge } = require('../electron/project-knowledge.cjs');
const { KnowledgeAccess } = require('../electron/knowledge-access.cjs');
const { buildContext } = require('../electron/knowledge-context.cjs');
const sha = text => createHash('sha256').update(text).digest('hex');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-context-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'auth.js'), 'function authorize(user) { return user.allowed; }\n');
  fs.writeFileSync(path.join(repo, 'other.js'), 'function other() { return 2; }\n');
  const projects = new Projects(root), project = projects.save({ name: 'Context', folders: [{ path: repo }] });
  const store = new ProjectKnowledge(root), settings = { knowledgeMode: 'read' };
  const access = new KnowledgeAccess({ store, getSettings: () => settings, getProjects: () => projects });
  access.upkeep = { dirty: () => [] };
  const capture = () => access.sourceCapture(project.id, { paths: ['auth.js', 'other.js'] });
  const note = (snapshotId, { id = 'sec_auth', summary = 'Authorization requires the owner permission check.', provenance, evidence = true, source = 'auth.js' } = {}) => {
    const file = access.sources.load(project.id, snapshotId).files.find(file => file.path === source);
    const section = { schemaVersion: 1, id, kind: provenance?.kind === 'owner' ? 'intent' : 'interpretation', title: 'Permission obligation', summary, sourceSnapshot: evidence ? snapshotId : null, freshness: 'unknown',
      provenance: provenance || { kind: 'inferred', reference: 'documentation:responsibility:test' },
      sourceRefs: [file.sourceId], evidence: evidence ? [{ sourceId: file.sourceId, contentHash: file.contentHash, anchor: 'file:' + file.contentHash }] : [], flowRefs: [] };
    store.commit(project.id, { operationId: randomUUID(), changes: [{ id, expectedVersion: 0, section }] });
    return section;
  };
  const build = args => buildContext(access, project.id, args);
  return { root, repo, projects, project, store, settings, access, capture, note, build };
}

test('Off and unbound fail before any storage, source or inventory access', t => {
  const f = fixture(t); f.settings.knowledgeMode = 'off'; let reads = 0;
  for (const [object, name] of [[f.store, 'snapshot'], [f.access.sources, 'load'], [f.access, 'sourceCapture'], [f.access, 'inventory']]) t.mock.method(object, name, () => { reads++; throw Error('unexpected storage'); });
  assert.throws(() => f.build({ targets: [{ path: 'auth.js' }] }), /off/);
  assert.throws(() => buildContext(f.access, 'missing'), /existing project/);
  assert.equal(reads, 0);
});

test('known path captures only explicit paths and includes applicable obligation with exact body hashes', t => {
  const f = fixture(t), saved = f.capture(); const section = f.note(saved.snapshotId);
  const packet = f.build({ targets: [{ path: 'auth.js' }] });
  assert.deepEqual(f.access.sources.load(f.project.id, packet.snapshotId).files.map(file => file.path), ['auth.js']);
  assert.equal(packet.sources.length, 1); assert.equal(packet.claims.length, 1);
  assert.deepEqual(packet.claims[0].recorded, section);
  assert.equal(packet.claims[0].sourceEvidence, 'matches'); assert.equal(packet.semanticVerified, false);
  assert.equal(packet.sources[0].text, fs.readFileSync(path.join(f.repo, 'auth.js'), 'utf8'));
  assert.equal(sha(packet.sources[0].text), packet.sources[0].contentHash);
  assert.equal(packet.coverage.dependencies, 'unavailable');
});

test('exact symbol body uses the pinned declaration hash', t => {
  const f = fixture(t), saved = f.capture(), snapshot = f.access.sources.load(f.project.id, saved.snapshotId), symbol = snapshot.files[0].symbols[0];
  assert.ok(symbol);
  const packet = f.build({ snapshotId: saved.snapshotId, targets: [{ path: 'auth.js', symbolId: symbol.id }] });
  assert.equal(packet.sources[0].contentHash, symbol.contentHash);
  assert.equal(sha(packet.sources[0].text), symbol.contentHash);
  assert.throws(() => f.build({ snapshotId: saved.snapshotId, targets: [{ path: 'auth.js', symbolId: 'sym_missing' }] }), /declaration/);
});

for (const mutation of ['changed', 'missing', 'linked']) test(`${mutation} pinned source never returns historical current text or prose`, t => {
  const f = fixture(t), saved = f.capture(); f.note(saved.snapshotId);
  const file = path.join(f.repo, 'auth.js');
  if (mutation === 'changed') fs.writeFileSync(file, 'function changed() { return false; }');
  else {
    fs.unlinkSync(file);
    if (mutation === 'linked') {
      try { fs.symlinkSync(path.join(f.repo, 'other.js'), file); }
      catch (error) { if (error.code === 'EPERM') { t.skip('File symlinks require OS permission.'); return; } throw error; }
    }
  }
  const packet = f.build({ snapshotId: saved.snapshotId, targets: [{ path: 'auth.js' }] });
  assert.equal(packet.sources.length, 0); assert.equal(packet.claims.length, 0);
  assert.ok(packet.handles.some(handle => handle.state === 'stale-or-unavailable'));
  assert.ok(!JSON.stringify(packet).includes('Authorization requires'));
});

test('pending, unknown-maintenance and unverified notes are labelled handles with no semantic prose', t => {
  const f = fixture(t), saved = f.capture(); f.note(saved.snapshotId); f.note(saved.snapshotId, { id: 'sec_unverified', evidence: false });
  for (const upkeep of [{ dirty: () => ['pending'] }, undefined]) {
    f.access.upkeep = upkeep;
    const packet = f.build({ snapshotId: saved.snapshotId, targets: [{ path: 'auth.js' }] });
    assert.equal(packet.claims.length, 0);
    assert.ok(packet.handles.some(handle => /^maintenance-/.test(handle.state)));
    assert.ok(packet.handles.some(handle => handle.state === 'unverified'));
    assert.ok(!JSON.stringify(packet).includes('Authorization requires'));
  }
});

test('query without snapshot returns populated metadata handles without initialization or capture', t => {
  const f = fixture(t), saved = f.capture(); f.note(saved.snapshotId); f.note(saved.snapshotId, { id: 'sec_generated', provenance: { kind: 'inferred', reference: 'initialize:root' } });
  const revision = f.store.snapshot(f.project.id).revision;
  for (const name of ['sourceCapture', 'initialize', 'inventory']) t.mock.method(f.access, name, () => { throw Error('must not initialize'); });
  t.mock.method(f.access.sources, 'load', () => { throw Error('index must not read snapshots'); });
  const packet = f.build({ query: 'permission' });
  assert.deepEqual(packet.handles.map(handle => handle.id), ['sec_auth']);
  assert.equal(packet.handles[0].state, 'not-checked'); assert.equal(packet.snapshotId, null);
  assert.equal(f.store.snapshot(f.project.id).revision, revision);
});

test('owner provenance is retained and keyword suggestions do not force unrelated flows', t => {
  const f = fixture(t), saved = f.capture();
  const owner = f.note(saved.snapshotId, { provenance: { kind: 'owner', reference: 'owner:approved-permissions' } });
  f.note(saved.snapshotId, { id: 'sec_other_flow', source: 'other.js', summary: 'Other flow.' });
  const packet = f.build({ snapshotId: saved.snapshotId, query: 'auth' });
  assert.equal(packet.claims[0].recorded.provenance.kind, 'owner');
  assert.deepEqual(packet.claims[0].recorded, owner);
  assert.ok(!JSON.stringify(packet).includes('sec_other_flow'));
});

test('byte budget defers whole oversized Unicode records, including JSON escaping overhead', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.repo, 'auth.js'), '// ' + '界\\"'.repeat(5000));
  const saved = f.capture(); f.note(saved.snapshotId, { summary: '界'.repeat(7000) });
  const packet = f.build({ snapshotId: saved.snapshotId, targets: [{ path: 'auth.js' }], maxBytes: 4096 });
  assert.ok(Buffer.byteLength(JSON.stringify(packet)) <= 4096);
  assert.equal(packet.sources.length, 0); assert.equal(packet.claims.length, 0);
  assert.equal(packet.handles.length, 2); assert.ok(packet.handles.every(handle => handle.requiredBytes > 4096));
});

test('at most three source bodies or claims, with continuation handles', t => {
  const f = fixture(t), saved = f.capture();
  for (let i = 0; i < 8; i++) f.note(saved.snapshotId, { id: 'sec_note_' + i });
  const packet = f.build({ snapshotId: saved.snapshotId });
  assert.equal(packet.sources.length + packet.claims.length, 3);
  assert.equal(packet.handles.length, 7);
});

test('large populated indexes defer metadata with explicit remaining counts within the budget', t => {
  const f = fixture(t), saved = f.capture();
  for (let i = 0; i < 24; i++) f.note(saved.snapshotId, { id: 'sec_index_' + i, provenance: { kind: 'inferred', reference: 'reference:' + 'x'.repeat(480) } });
  const packet = f.build({ maxBytes: 4096 });
  assert.ok(Buffer.byteLength(JSON.stringify(packet)) <= 4096);
  assert.ok(packet.handles.length > 0); assert.ok(packet.remaining.count > 0);
  assert.equal(packet.handles.length + packet.remaining.count, 24);
  assert.equal(typeof packet.remaining.claimOffset, 'number');
  assert.ok(!JSON.stringify(packet).includes('Authorization requires'));
});

test('a snapshot from another authorized folder cannot supply text for the selected folder', t => {
  const f = fixture(t), other = path.join(f.root, 'second'); fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, 'second.js'), 'function second() {}');
  f.projects.get(f.project.id).folders.push({ path: other, label: 'Second' });
  const saved = f.access.sourceCapture(f.project.id, { folderIndex: 1, paths: ['second.js'] });
  t.mock.method(f.store, 'snapshot', () => { throw Error('unexpected knowledge read'); });
  assert.throws(() => f.build({ snapshotId: saved.snapshotId }), /foreign/);
});

test('traversal, exclusions, malformed IDs, duplicate targets and bounds fail before capture', t => {
  const f = fixture(t); let captures = 0;
  t.mock.method(f.access, 'sourceCapture', () => { captures++; throw Error('unexpected capture'); });
  for (const args of [null, { unknown: true }, { snapshotId: '../bad' }, { folderIndex: -1 }, { maxBytes: 4095 }, { maxBytes: 65537 }, { query: 'x'.repeat(201) }, { targets: Array(9).fill({ path: 'auth.js' }) }, { targets: [{ path: 'auth.js' }, { path: 'auth.js' }] }, ...['../auth.js', '/auth.js', 'C:/auth.js', 'node_modules/x.js', '.env', 'build/auth.js', 'a\\b.js'].map(file => ({ targets: [{ path: file }] }))]) assert.throws(() => f.build(args));
  assert.equal(captures, 0);
});

test('foreign snapshot roots are denied before reading knowledge or source bodies', t => {
  const f = fixture(t), foreign = path.join(f.root, 'foreign'); fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, 'foreign.js'), 'const foreign = true;');
  const saved = f.access.sources.capture(f.project.id, foreign, { paths: ['foreign.js'] });
  t.mock.method(f.store, 'snapshot', () => { throw Error('unexpected knowledge read'); });
  t.mock.method(f.access.sources, 'read', () => { throw Error('unexpected body read'); });
  assert.throws(() => f.build({ snapshotId: saved.snapshotId }), /authorized/);
});

test('policy is rechecked before capture persistence and before return', t => {
  const f = fixture(t), originalExtract = f.access.sources.extract;
  f.access.sources.extract = input => { const value = originalExtract(input); f.settings.knowledgeMode = 'off'; return value; };
  assert.throws(() => f.build({ targets: [{ path: 'auth.js' }] }), /off/);
  assert.equal(fs.existsSync(f.access.sources.root), false);
  f.settings.knowledgeMode = 'read'; f.access.sources.extract = originalExtract;
  const saved = f.capture(), original = f.store.snapshot.bind(f.store);
  t.mock.method(f.store, 'snapshot', id => { const value = original(id); f.settings.knowledgeMode = 'off'; return value; });
  assert.throws(() => f.build({ snapshotId: saved.snapshotId }), /off/);
});

test('live source is rechecked after note selection before returning text', t => {
  const f = fixture(t), saved = f.capture(); f.note(saved.snapshotId);
  const original = f.access.read.bind(f.access);
  t.mock.method(f.access, 'read', (...args) => { const value = original(...args); fs.writeFileSync(path.join(f.repo, 'auth.js'), 'const changed = true;'); return value; });
  const packet = f.build({ snapshotId: saved.snapshotId, targets: [{ path: 'auth.js' }] });
  assert.equal(packet.sources.length, 0); assert.equal(packet.claims.length, 0);
});


test('known paths retain obligations cited only through evidence as explicit handles', t => {
  const f = fixture(t), saved = f.capture(), original = f.note(saved.snapshotId);
  const other = f.access.sources.load(f.project.id, saved.snapshotId).files.find(file => file.path === 'other.js');
  const section = { ...original, evidence: [{ sourceId: other.sourceId, contentHash: other.contentHash, anchor: 'file:' + other.contentHash }] };
  f.store.commit(f.project.id, { operationId: 'evidence_only', changes: [{ id: original.id, expectedVersion: 1, section }] });
  const packet = f.build({ snapshotId: saved.snapshotId, targets: [{ path: 'other.js' }] });
  assert.ok(packet.handles.some(handle => handle.id === original.id), 'Evidence-only obligation must remain discoverable even when its prose cannot be verified.');
  assert.equal(packet.claims.length, 0); assert.ok(!JSON.stringify(packet).includes(original.summary));
});
