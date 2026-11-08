'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { ProjectKnowledge } = require('../electron/project-knowledge.cjs');
const { KnowledgeAccess } = require('../electron/knowledge-access.cjs');
function fixture(t, empty = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-docs-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  if (!empty) { fs.writeFileSync(path.join(repo, 'app.js'), 'export function start() { return 1; }'); fs.writeFileSync(path.join(repo, 'store.js'), 'export function save(value) { return value; }'); }
  const project = { id: 'project', name: 'Owner project', goals: 'Owner goal', nextStep: 'Owner choice', folders: [{ path: repo }] }, settings = { knowledgeMode: 'read' }, store = new ProjectKnowledge(root);
  const access = new KnowledgeAccess({ store, getSettings: () => settings, getProjects: () => ({ get: id => id === project.id ? project : null }) });
  const init = () => access.initialize('project');
  const proposal = initialized => ({ operationId: 'write_1', snapshotId: initialized.snapshotId, sections: [{ id: initialized.overviews[0].id, expectedVersion: initialized.overviews[0].version, role: 'overview', title: 'Application overview', summary: 'The app entry point starts the local workflow. Persistence is separate.', sources: [{ path: 'app.js' }, { path: 'store.js' }] }] });
  return { root, repo, project, settings, store, access, init, proposal };
}
test('initialize is opt-in, model-free, idempotent and leaves owner files/goals intact', t => {
  const f = fixture(t), before = structuredClone(f.project); f.settings.knowledgeMode = 'off';
  for (const call of [() => f.init(), () => f.access.state('project'), () => f.access.guide('project')]) assert.throws(call, /off/);
  assert.equal(fs.existsSync(path.join(f.root, 'knowledge')), false);
  f.settings.knowledgeMode = 'read'; const initialized = f.init();
  assert.equal(initialized.initialized, true); assert.equal(initialized.overviews[0].evidence, 'matches');
  const revision = f.store.snapshot('project').revision; f.init(); assert.equal(f.store.snapshot('project').revision, revision);
  assert.deepEqual(f.project, before); assert.deepEqual(fs.readdirSync(f.repo), ['app.js', 'store.js']);
  assert.match(f.access.guide('project', { topic: 'authoring' }).text, /knowledge_write/);
});
test('an empty greenfield folder gets an honest map, not an invented application', t => {
  const f = fixture(t, true), value = f.init();
  assert.equal(value.overviews.length, 1); assert.equal(value.overviews[0].kind, 'interpretation');
  assert.equal(value.overviews[0].evidence, 'unverified'); assert.equal(value.overviews[0].sourceSnapshot, null);
  assert.equal(f.store.snapshot('project').entries[0].section.provenance.kind, 'inferred');
});
test('an agent publishes and retrieves connected source-backed notes without owner approval claims', t => {
  const f = fixture(t), initialized = f.init(), data = f.proposal(initialized);
  data.sections.push({ id: 'sec_store', expectedVersion: 0, role: 'responsibility', title: 'Persistence', summary: 'Returns the supplied value.', sources: [{ path: 'store.js' }], links: [data.sections[0].id] });
  data.sections[0].links = ['sec_store'];
  const receipt = f.access.write('project', data); assert.equal(receipt.assurance.ownerApproved, false);
  assert.equal(receipt.assurance.semanticVerified, false); assert.deepEqual(f.access.write('project', data), receipt);
  const read = f.access.read('project', { ids: ['sec_store'] }); assert.equal(read.items[0].sourceEvidence, 'matches');
  assert.equal(read.items[0].recorded.freshness, 'unknown'); assert.deepEqual(read.items[0].recorded.flowRefs, [data.sections[0].id]);
  const brief = f.access.brief({ projectId: 'project', title: 'Unrelated request' });
  assert.match(brief, /knowledge_context/); assert.ok(!brief.includes(data.sections[0].summary));
  fs.writeFileSync(path.join(f.repo, 'store.js'), 'export function save() { throw Error(); }');
  assert.equal(f.access.read('project', { ids: ['sec_store'] }).items[0].sourceEvidence, 'changed');
  assert.equal(f.access.state('project').overviews[0].evidence, 'changed');
});
test('writes reject stale source, missing anchors/links and version conflicts atomically', t => {
  const f = fixture(t), initialized = f.init(), data = f.proposal(initialized), revision = f.store.snapshot('project').revision;
  data.sections[0].sources[0].anchor = 'imaginary'; assert.throws(() => f.access.write('project', data), /anchor/); delete data.sections[0].sources[0].anchor;
  data.sections[0].links = ['sec_missing']; assert.throws(() => f.access.write('project', data), /relationship/); delete data.sections[0].links;
  data.sections[0].expectedVersion = 99; assert.throws(() => f.access.write('project', data), /version|conflict/i); data.sections[0].expectedVersion = initialized.overviews[0].version;
  fs.writeFileSync(path.join(f.repo, 'app.js'), 'changed'); assert.throws(() => f.access.write('project', data), /source changed/);
  assert.equal(f.store.snapshot('project').revision, revision);
});
test('authored overviews survive initialize and owner intent/foreign identities stay protected', t => {
  const f = fixture(t), initialized = f.init(), data = f.proposal(initialized); f.access.write('project', data);
  f.init(); assert.equal(f.access.state('project').overviews[0].summary, data.sections[0].summary);
  const intent = { schemaVersion: 1, id: 'sec_intent', kind: 'intent', title: 'Owner intent', summary: 'Keep this goal.', sourceSnapshot: null, freshness: 'unknown', provenance: { kind: 'owner', reference: 'owner' }, evidence: [], sourceRefs: [], flowRefs: [] };
  f.store.commit('project', { operationId: 'owner_record', changes: [{ id: intent.id, expectedVersion: 0, section: intent }] });
  data.operationId = 'overwrite'; data.sections[0] = { ...data.sections[0], role: 'responsibility', id: intent.id, expectedVersion: 1 };
  assert.throws(() => f.access.write('project', data), /protected/);
  f.project.folders = []; assert.throws(() => f.access.write('project', data), /authorized/);
});


test('reserved overview IDs cannot be created or rewritten with another role', t => {
  const f = fixture(t), initialized = f.init(), data = f.proposal(initialized);
  data.sections[0].role = 'responsibility'; assert.throws(() => f.access.write('project', data), /overview/);
  data.sections[0].id = 'sec_overview_fake'; data.sections[0].expectedVersion = 0;
  assert.throws(() => f.access.write('project', data), /overview/);
  assert.equal(f.access.state('project').areas[0].evidence, 'not-checked');
});


test('managed additions invalidate an overview even after the maintenance batch is committed', t => {
  const f = fixture(t), initialized = f.init(), data = f.proposal(initialized), receipt = f.access.write('project', data);
  const source = f.access.sources.load('project', initialized.snapshotId);
  f.access.upkeep = { queue: { state: () => [{ rootId: source.rootId, enqueuedAt: receipt.updatedAt + 1, touchedPaths: ['new-module.js'], status: 'committed' }] }, dirty: () => [] };
  assert.equal(f.access.state('project').overviews[0].evidence, 'changed');
  assert.equal(f.access.read('project', { ids: [data.sections[0].id] }).items[0].sourceEvidence, 'changed');
});
