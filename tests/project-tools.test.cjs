'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Projects } = require('../electron/projects.cjs');
const { createProject, openConsole } = require('../electron/project-tools.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-project-tools-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const folder = path.join(root, 'lab'); fs.mkdirSync(folder);
  return { root, folder, projects: new Projects(root) };
}

test('agents create a project once, with a lowered knowledge mode', t => {
  const f = fixture(t);
  const first = createProject(f.projects, { name: 'Lab', folders: [f.folder], knowledgeMode: 'off' });
  assert.equal(first.created, true); assert.equal(first.project.knowledgeMode, 'off'); assert.equal(first.project.folders[0].path, f.folder);
  const again = createProject(f.projects, { name: 'Other name', folders: [f.folder + path.sep] });
  assert.equal(again.created, false); assert.equal(again.project.id, first.project.id); assert.equal(f.projects.list().length, 1);
  assert.equal(createProject(f.projects, { name: 'Lab', folders: [f.folder], knowledgeMode: 'read' }).project.knowledgeMode, 'read');
  assert.equal(createProject(f.projects, { name: 'Lab', folders: [f.folder], knowledgeMode: 'automatic' }).project.knowledgeMode, 'read');
  assert.match(createProject(f.projects, { name: 'Auto', folders: [f.root], knowledgeMode: 'automatic' }).note, /Automatic documentation/);
  assert.throws(() => createProject(f.projects, { name: 'Missing', folders: [path.join(f.root, 'missing')] }), /existing project folder/);
  assert.throws(() => createProject(f.projects, { name: 'Bad mode', folders: [path.join(f.root, 'lab', '..', 'lab2')], knowledgeMode: 'always' }));
});

test('consoles open in the project with the owner default permissions', async t => {
  const f = fixture(t), { project } = createProject(f.projects, { name: 'Lab', folders: [f.folder] });
  let launched;
  const sessions = { create: async raw => { launched = raw; return { id: 's1', name: 'Lab', provider: raw.provider, cwd: f.folder, projectId: raw.projectId, permissions: raw.permissions }; } };
  const settings = { consoleDefaults: { provider: 'codex', cwd: os.homedir(), name: '', command: '' }, agentPermissions: 'default' };
  const opened = await openConsole({ projects: f.projects, sessions, settings }, { projectId: project.id, provider: 'claude', model: 'claude-sonnet-5-5' });
  assert.equal(opened.projectId, project.id); assert.equal(launched.provider, 'claude'); assert.equal(launched.model, 'claude-sonnet-5-5');
  assert.equal(launched.permissions, 'default'); assert.equal(launched.nameMode, 'project');
  assert.equal(launched.cwd, f.folder, 'the project folder overrides the default console folder');
  await assert.rejects(openConsole({ projects: f.projects, sessions, settings }, { projectId: 'missing', provider: 'claude' }), /project_create/);
});

test('knowledge settings go through the Settings commands and require an existing project', async t => {
  const f = fixture(t), { project } = createProject(f.projects, { name: 'Lab', folders: [f.folder] });
  const { knowledgeSettings } = require('../electron/project-tools.cjs'), calls = [];
  const command = async (method, payload) => { calls.push([method, payload]); };
  const worker = { accountId: 'claude:default', model: 'claude-haiku-5-5', funding: 'included' };
  await knowledgeSettings(command, f.projects, { knowledgeMode: 'automatic', worker, projectId: project.id, projectMode: 'inherit' });
  assert.deepEqual(calls, [['settings', { knowledgeWorker: worker, knowledgeMode: 'automatic' }], ['projects.knowledgeMode', { id: project.id, mode: 'inherit' }]]);
  await assert.rejects(knowledgeSettings(command, f.projects, { projectId: 'missing', projectMode: 'read' }), /Project not found/);
  await assert.rejects(knowledgeSettings(command, f.projects, {}), /Choose/);
});
