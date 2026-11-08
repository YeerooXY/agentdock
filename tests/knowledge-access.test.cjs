'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { ProjectKnowledge } = require('../electron/project-knowledge.cjs');
const { KnowledgeAccess } = require('../electron/knowledge-access.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-knowledge-access-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo); fs.writeFileSync(path.join(repo, 'run.py'), 'source');
  const project = { id: 'project', folders: [{ path: repo, label: 'Source' }] }, settings = { knowledgeMode: 'off' };
  const store = new ProjectKnowledge(root);
  const access = new KnowledgeAccess({ store, getSettings: () => settings, getProjects: () => ({ get: id => id === project.id ? project : null }) });
  return { root, repo, project, settings, store, access };
}
test('Off blocks inventory, reads and worker context without accessing saved knowledge', t => {
  const { project, settings, store, access } = fixture(t); let calls = 0;
  t.mock.method(store, 'snapshot', () => { calls++; throw new Error('should not read'); });
  t.mock.method(access, 'inventory', () => { calls++; throw new Error('should not scan'); });
  project.knowledgeMode = 'read';
  assert.equal(access.enabled(project.id), false); assert.equal(access.brief({ projectId: project.id }), '');
  for (const run of [() => access.capture(project.id), () => access.directory(project.id), () => access.read(project.id, { ids: ['sec_x'] })]) assert.throws(run, /off/);
  assert.equal(calls, 0);
  settings.knowledgeMode = 'read'; project.knowledgeMode = 'off'; assert.equal(access.brief({ projectId: project.id }), '');
});
test('on-demand capture creates an unverified local summary and contextual worker data', t => {
  const { project, settings, access, store, repo } = fixture(t); settings.knowledgeMode = 'read';
  const saved = access.capture(project.id), id = saved.items[0].id;
  assert.equal(saved.observation.counts.source, 1); assert.equal(saved.observation.contentHashed, false);
  const record = access.read(project.id, { ids: [id] }).items[0].recorded;
  assert.equal(record.sourceSnapshot, null); assert.equal(record.freshness, 'unknown');
  assert.match(record.summary, /not an architecture map/);
  const revision = store.snapshot(project.id).revision; access.capture(project.id); assert.equal(store.snapshot(project.id).revision, revision);
  assert.match(access.brief({ projectId: project.id, title: 'Inventory source' }), /knowledge_context/);
  assert.deepEqual(fs.readdirSync(repo), ['run.py']);
  settings.knowledgeMode = 'off'; assert.equal(access.brief({ projectId: project.id }), '');
  assert.equal(store.snapshot(project.id).revision, revision, 'disabling preserves saved records');
});
test('policy is rechecked before committing a capture and roots are project-bound', t => {
  const { settings, project, store, access } = fixture(t); settings.knowledgeMode = 'read';
  const original = access.inventory;
  access.inventory = (...args) => { const result = original(...args); settings.knowledgeMode = 'off'; return result; };
  assert.throws(() => access.capture(project.id), /off/); assert.equal(store.snapshot(project.id).revision, 0);
  settings.knowledgeMode = 'read';
  assert.throws(() => access.capture(project.id, { folderIndex: 1 }), /folder/);
  assert.throws(() => access.capture('other'), /existing project/);
});


test('enabled worker brief advertises capability without reading stored notes or source', t => {
  const { settings, project, store, access } = fixture(t); settings.knowledgeMode = 'read';
  t.mock.method(store, 'snapshot', () => { throw Error('eager note read'); });
  t.mock.method(access.sources, 'load', () => { throw Error('eager source read'); });
  t.mock.method(access, 'inventory', () => { throw Error('eager inventory'); });
  const brief = access.brief({ projectId: project.id });
  assert.match(brief, /knowledge_context/); assert.ok(brief.length < 650);
  assert.match(access.brief({ projectId: project.id, documentationRole: 'reviewer' }), /read-only/);
});
