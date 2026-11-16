'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Workbench } = require('../electron/workbench.cjs');
const { Projects } = require('../electron/projects.cjs');
const { SharedHub } = require('../electron/shared.cjs');
const section = require('./fixtures/knowledge/sections.json').greenfieldProposed;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-knowledge-tools-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const projects = new Projects(root), project = projects.save({ name: 'Knowledge fixture', folders: [{ path: repo }] });
  const caller = { id: 'owner', alive: true, cwd: repo, projectId: project.id };
  const sessions = { items: new Map([[caller.id, caller]]) };
  const wb = new Workbench(root, {}, { nativeImage: {} }, { testMode: true, onChange() {}, getSessions: () => sessions, getProject: () => repo, getSettings: () => ({ knowledgeMode: 'read' }) });
  wb.projects = projects;
  return { root, repo, project, projects, caller, wb };
}
function write(wb, projectId, operationId = 'seed', id = section.id) {
  return wb.knowledge.commit(projectId, { operationId, changes: [{ id, expectedVersion: 0, section: { ...structuredClone(section), id } }] });
}
test('knowledge reads are linked-project-only, read-only and do not initialize storage', async t => {
  const { root, repo, project, caller, wb } = fixture(t);
  const names = wb.tools().filter(tool => tool.name.startsWith('dock/knowledge_')).map(tool => tool.name);
  assert.deepEqual(names, ['dock/knowledge_guide', 'dock/knowledge_context', 'dock/knowledge_state', 'dock/knowledge_initialize', 'dock/knowledge_write', 'dock/knowledge_adopt_map', 'dock/knowledge_resolve', 'dock/knowledge_bundle', 'dock/knowledge_source_capture', 'dock/knowledge_source_resolve', 'dock/knowledge_source_extract', 'dock/knowledge_inventory', 'dock/knowledge_directory', 'dock/knowledge_read']);
  const empty = await wb.invoke('dock/knowledge_directory', {}, caller.id);
  assert.equal(empty.projectId, project.id); assert.deepEqual(empty.items, []);
  assert.equal(fs.existsSync(path.join(root, 'knowledge')), false); assert.deepEqual(fs.readdirSync(repo), []);
  assert.deepEqual(wb.results.list(), []);
  await assert.rejects(wb.invoke('dock/knowledge_directory', {}, null), /Link this console/);
  caller.projectId = null;
  await assert.rejects(wb.invoke('dock/knowledge_directory', {}, caller.id), /Link this console/);
  caller.projectId = 'missing';
  await assert.rejects(wb.invoke('dock/knowledge_directory', {}, caller.id), /existing project/);
  caller.alive = false;
  await assert.rejects(wb.invoke('dock/knowledge_directory', {}, caller.id), /no longer open/);
});
test('knowledge tools persist across restart and expose recorded claims with unverified assurance', async t => {
  const { root, repo, project, wb, caller } = fixture(t);
  write(wb, project.id);
  const page = await wb.invoke('dock/knowledge_directory', {}, caller.id);
  assert.equal(page.items[0].id, section.id); assert.equal(page.assurance.sourceVerified, false);
  const read = await wb.invoke('dock/knowledge_read', { ids: [section.id], revision: page.revision }, caller.id);
  assert.deepEqual(read.items[0].recorded, section);
  assert.equal(read.assurance.semanticVerified, false);
  assert.ok(!JSON.stringify(read).includes(root));
  const { ProjectKnowledge } = require('../electron/project-knowledge.cjs');
  wb.knowledge = new ProjectKnowledge(root);
  assert.deepEqual(await wb.invoke('dock/knowledge_read', { ids: [section.id] }, caller.id), read);
  write(wb, project.id, 'second', 'sec_second');
  await assert.rejects(wb.invoke('dock/knowledge_read', { ids: [section.id], revision: page.revision }, caller.id), /changed/);
  assert.deepEqual(fs.readdirSync(repo), []); assert.deepEqual(wb.results.list(), []);
});
test('shared bridge rejects foreign project selectors and mutation fields before reading', async t => {
  const { root, project, wb, caller } = fixture(t);
  write(wb, project.id);
  const hub = new SharedHub(root, { list: () => [] }, { workbench: wb }); await hub.start(); t.after(() => hub.close());
  const grant = hub.grant(caller.id);
  const invoke = async (tool, args) => (await fetch(grant.PADDOCK_BRIDGE_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + grant.PADDOCK_BRIDGE_TOKEN }, body: JSON.stringify({ name: 'dock_call', arguments: { tool, arguments: args } }) })).json();
  const foreign = await invoke('dock/knowledge_directory', { projectId: 'other' });
  assert.equal(foreign.isError, true);
  const contextForeign = await invoke('dock/knowledge_context', { projectId: 'other' });
  assert.equal(contextForeign.isError, true);
  const mutation = await invoke('dock/knowledge_read', { ids: [section.id], changes: [] });
  assert.equal(mutation.isError, true);
  const valid = await invoke('dock/knowledge_read', { ids: [section.id] });
  assert.ok(!valid.isError, JSON.stringify(valid));
  const invalid = await invoke('dock/knowledge_read', { ids: ['../secret'] });
  assert.equal(invalid.isError, true);
});


test('live Off switch removes tools and blocks previously discovered bridge calls', async t => {
  const { root, project, wb, caller } = fixture(t);
  write(wb, project.id);
  assert.ok(wb.tools(caller.id).some(tool => tool.name === 'dock/knowledge_read'));
  const hub = new SharedHub(root, { list: () => [] }, { workbench: wb }); await hub.start(); t.after(() => hub.close());
  const grant = hub.grant(caller.id);
  wb.getSettings = () => ({ knowledgeMode: 'off' });
  assert.ok(!wb.tools(caller.id).some(tool => tool.name.startsWith('dock/knowledge_')));
  await assert.rejects(wb.invoke('dock/knowledge_read', { ids: [section.id] }, caller.id), /off/);
  const result = await (await fetch(grant.PADDOCK_BRIDGE_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + grant.PADDOCK_BRIDGE_TOKEN },
    body: JSON.stringify({ name: 'dock_call', arguments: { tool: 'dock/knowledge_read', arguments: { ids: [section.id] } } }) })).json();
  assert.equal(result.isError, true);
  wb.getSettings = () => ({ knowledgeMode: 'read' });
  assert.equal((await wb.invoke('dock/knowledge_read', { ids: [section.id] }, caller.id)).items.length, 1);
});


test('agent source tools retrieve exact pinned declarations and deny revoked roots', async t => {
  const { project, projects, repo, wb, caller } = fixture(t);
  const text = 'export function answer(value) { return value + 1; }'; fs.writeFileSync(path.join(repo, 'answer.js'), text);
  const capture = await wb.invoke('dock/knowledge_source_capture', { paths: ['answer.js'] }, caller.id);
  const resolved = await wb.invoke('dock/knowledge_source_resolve', { snapshotId: capture.snapshotId, query: 'answer' }, caller.id);
  assert.equal(resolved.items.length, 1);
  fs.writeFileSync(path.join(repo, 'answer.js'), 'new source');
  const read = await wb.invoke('dock/knowledge_source_extract', { snapshotId: capture.snapshotId, path: 'answer.js', symbolId: resolved.items[0].id }, caller.id);
  assert.equal(read.text, text); assert.equal(read.exact, true);
  wb.getSettings = () => ({ knowledgeMode: 'off' });
  await assert.rejects(wb.invoke('dock/knowledge_source_extract', { snapshotId: capture.snapshotId, path: 'answer.js' }, caller.id), /off/);
  wb.getSettings = () => ({ knowledgeMode: 'read' }); projects.get(project.id).folders = [];
  await assert.rejects(wb.invoke('dock/knowledge_source_extract', { snapshotId: capture.snapshotId, path: 'answer.js' }, caller.id), /no longer authorized/);
});


test('bundled authoring protocol initializes and writes only linked project notes, not Results', async t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.repo, 'main.js'), 'export function launch() { return 1; }');
  const guide = await f.wb.invoke('dock/knowledge_guide', { topic: 'authoring' }, f.caller.id); assert.match(guide.text, /expectedVersion/);
  const initialized = await f.wb.invoke('dock/knowledge_initialize', {}, f.caller.id);
  const overview = initialized.overviews[0];
  await f.wb.invoke('dock/knowledge_write', { snapshotId: initialized.snapshotId, operationId: 'agent_docs', sections: [{ id: overview.id, expectedVersion: overview.version, role: 'overview', title: 'Application overview', summary: 'A launch entry returns a value.', sources: [{ path: 'main.js' }] }] }, f.caller.id);
  assert.equal((await f.wb.invoke('dock/knowledge_state', {}, f.caller.id)).overviews[0].summary, 'A launch entry returns a value.');
  assert.deepEqual(f.wb.results.list(), []); assert.deepEqual(fs.readdirSync(f.repo), ['main.js']);
  f.wb.getSettings = () => ({ knowledgeMode: 'off' });
  await assert.rejects(f.wb.invoke('dock/knowledge_write', {}, f.caller.id), /off/);
});

test('review workers cannot initialize or publish project documentation', async t => {
  const f = fixture(t); f.caller.taskId = 'job'; f.caller.sliceId = 'job';
  f.wb.getTasks = () => ({ jobs: new Map([['job', { id: 'job', state: 'reviewing' }]]) });
  for (const tool of ['dock/knowledge_initialize', 'dock/knowledge_write']) await assert.rejects(f.wb.invoke(tool, {}, f.caller.id), /review workers/);
  assert.equal(fs.existsSync(path.join(f.root, 'knowledge')), false);
});


test('bounded context is linked, lazy, and does not publish Results', async t => {
  const f = fixture(t);
  const guide = await f.wb.invoke('dock/knowledge_guide', {}, f.caller.id);
  assert.equal(guide.topic, 'retrieval'); assert.match(guide.text, /knowledge_context/);
  assert.ok(Buffer.byteLength(guide.text) < 3500);
  const empty = await f.wb.invoke('dock/knowledge_context', {}, f.caller.id);
  assert.deepEqual(empty.handles, []); assert.equal(empty.snapshotId, null);
  assert.equal(fs.existsSync(path.join(f.root, 'knowledge')), false);
  fs.writeFileSync(path.join(f.repo, 'entry.js'), 'export function entry() { return 42; }');
  const context = await f.wb.invoke('dock/knowledge_context', { targets: [{ path: 'entry.js' }], maxBytes: 4096 }, f.caller.id);
  assert.equal(context.sources[0].text, 'export function entry() { return 42; }');
  assert.equal(context.semanticVerified, false); assert.deepEqual(f.wb.results.list(), []);
  f.wb.getSettings = () => ({ knowledgeMode: 'off' });
  await assert.rejects(f.wb.invoke('dock/knowledge_context', {}, f.caller.id), /off/);
});
