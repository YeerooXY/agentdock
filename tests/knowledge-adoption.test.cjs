'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createHash } = require('node:crypto');
const { Projects } = require('../electron/projects.cjs');
const { ProjectKnowledge } = require('../electron/project-knowledge.cjs');
const { KnowledgeAccess } = require('../electron/knowledge-access.cjs');
const sha = text => createHash('sha256').update(text).digest('hex');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-adopt-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo); const text = 'export function run(value) { return value + 1; }'; fs.writeFileSync(path.join(repo, 'run.js'), text);
  const projects = new Projects(root), project = projects.save({ name: 'Pilot', folders: [{ path: repo }] }); const settings = { knowledgeMode: 'read' }, store = new ProjectKnowledge(root);
  const access = new KnowledgeAccess({ store, getSettings: () => settings, getProjects: () => projects });
  const map = { schemaVersion: 1, observations: { files: [{ path: 'run.js', sha256: sha(text) }] }, sections: [{ id: 'sec_run', title: 'Input transformation', responsibility: 'Proposed responsibility: transform a supplied value.', sourceHints: [{ path: 'run.js', symbol: 'run' }] }], flows: [{ id: 'flow_run', sequence: ['sec_run', 'external_caller'], status: 'Proposed; runtime unverified.' }] };
  const save = () => fs.writeFileSync(path.join(repo, 'map.json'), JSON.stringify(map)); save();
  return { access, root, repo, project, settings, store, map, save, text };
}
test('map adoption pins source evidence, retains inferred status and resolves stable IDs', t => {
  const f = fixture(t); f.access.adopt(f.project.id, { mapPath: 'map.json' });
  const page = f.access.directory(f.project.id); assert.equal(page.total, 2);
  const section = f.access.read(f.project.id, { ids: ['sec_run'] }).items[0].recorded;
  assert.equal(section.freshness, 'proposed'); assert.equal(section.provenance.kind, 'inferred');
  const resolved = f.access.resolve(f.project.id, { addresses: [page.items[0].address], directoryViewId: page.directoryViewId });
  assert.equal(resolved.suggestions[0].id, page.items[0].id);
  const source = f.access.resolve(f.project.id, { snapshotId: section.sourceSnapshot, query: 'run' });
  assert.ok(source.source.items[0].sectionIds.includes('sec_run'));
  const bundle = f.access.bundle(f.project.id, { ids: ['sec_run'], snapshotId: section.sourceSnapshot, sources: [{ path: 'run.js' }], maxBytes: 4096 });
  assert.equal(bundle.sources[0].text, f.text); assert.ok(Buffer.byteLength(JSON.stringify(bundle)) <= 4096);
  assert.equal(f.access.adopt(f.project.id, { mapPath: 'map.json' }).revision, 1, 'identical adoption is idempotent');
});
test('stale maps, foreign paths, Off and view mismatch fail without overwriting knowledge', t => {
  const f = fixture(t); f.map.observations.files[0].sha256 = sha('foreign source'); f.save();
  assert.throws(() => f.access.adopt(f.project.id, { mapPath: 'map.json' }), /do not match/); assert.equal(f.store.snapshot(f.project.id).revision, 0);
  assert.throws(() => f.access.adopt(f.project.id, { mapPath: '../map.json' }), /excluded/);
  f.settings.knowledgeMode = 'off'; assert.throws(() => f.access.adopt(f.project.id, { mapPath: 'map.json' }), /off/);
  f.settings.knowledgeMode = 'read'; assert.throws(() => f.access.resolve(f.project.id, { addresses: ['1'], directoryViewId: 'old' }), /view changed/);
});
test('bundle defers whole over-budget source by requested index', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.repo, 'large.js'), '// ' + 'x'.repeat(12000));
  const captured = f.access.sourceCapture(f.project.id, { paths: ['large.js'] });
  const bundle = f.access.bundle(f.project.id, { snapshotId: captured.snapshotId, sources: [{ path: 'large.js' }], maxBytes: 4096 });
  assert.equal(bundle.sources.length, 0); assert.equal(bundle.remainingSources[0].index, 0); assert.ok(bundle.remainingSources[0].requiredTextBytes > 4096);
  assert.ok(Buffer.byteLength(JSON.stringify(bundle)) <= 4096);
});
