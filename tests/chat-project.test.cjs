'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { Projects } = require('../electron/projects.cjs');
const { Sessions } = require('../electron/sessions.cjs');
const { SharedHub } = require('../electron/shared.cjs');
const { Workspace } = require('../electron/workspace.cjs');
const thread = '9c656179-0272-492b-9073-c56e3c091dbb';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-chat-project-')), folder = path.join(root, 'work'); fs.mkdirSync(folder);
  const projects = new Projects(root), hub = new SharedHub(root, { list: () => [] }), launches = [];
  const createSessions = () => new Sessions(root, { projects, hub, nativeCodex: () => 'codex.exe', findProgram: () => process.execPath, prepareCodexSession: async () => [], pty: { spawn(executable, args) {
    const terminal = { onData() {}, onExit() {}, write() { assert.fail('No prompt or command injection'); }, kill() { assert.fail('A title must not stop the console'); } }; launches.push({ args, terminal }); return terminal;
  } } });
  const sessions = createSessions();
  const project = (name, goals) => projects.save({ name, goals, folders: [{ path: folder }] });
  const file = s => path.join(root, 'sessions', s.id, 'PADDOCK.md');
  t.after(async () => { await hub.close(); assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }); });
  return { root, folder, projects, hub, sessions, createSessions, project, launches, file };
}

test('linked titles follow project renames; custom names, PTY, buffer and exact chat remain unchanged', async t => {
  const f = fixture(t), p = f.project('Robonslaught', 'Make a game');
  const auto = await f.sessions.create({ provider: 'codex', cwd: f.folder, projectId: p.id }, { resumeId: thread });
  const custom = await f.sessions.create({ provider: 'shell', cwd: f.folder, projectId: p.id, name: 'Gameplay tests' });
  const live = f.sessions.items.get(auto.id), terminal = live.terminal; live.buffer = 'Existing output';
  assert.equal(auto.name, p.name); assert.equal(auto.nameMode, 'project');
  f.projects.save({ ...p, name: 'Robonslaught demo' });
  assert.equal(live.name, 'Robonslaught demo'); assert.equal(f.sessions.items.get(custom.id).name, 'Gameplay tests');
  assert.equal(live.terminal, terminal); assert.equal(live.buffer, 'Existing output'); assert.equal(live.providerSessionId, thread); assert.equal(f.launches.length, 2);
  assert.match(fs.readFileSync(f.file(auto), 'utf8'), /"projectName": "Robonslaught demo"/);
  f.sessions.rename(auto.id, 'Review'); f.projects.save({ ...f.projects.get(p.id), name: 'Game release' }); assert.equal(live.name, 'Review');
  f.sessions.rename(auto.id, ''); assert.equal(live.nameMode, 'project'); assert.equal(live.name, 'Game release');
});

test('live linking uses explicit project IDs and keeps context files isolated, including duplicate names', async t => {
  const f = fixture(t), a = f.project('Same title', 'FIRST_PROJECT_GOAL'), b = f.project('Same title', 'SECOND_PROJECT_GOAL');
  const plain = await f.sessions.create({ provider: 'shell', cwd: f.folder });
  const custom = await f.sessions.create({ provider: 'shell', cwd: f.folder, name: 'Same title' });
  assert.equal(custom.projectId, null); assert.match(fs.readFileSync(f.file(custom), 'utf8'), /No saved project is linked/);
  f.sessions.assignProject(plain.id, a.id); assert.equal(f.sessions.items.get(plain.id).name, a.name);
  f.sessions.assignProject(custom.id, b.id); assert.equal(f.sessions.items.get(custom.id).nameMode, 'custom');
  assert.match(fs.readFileSync(f.file(plain), 'utf8'), /FIRST_PROJECT_GOAL/); assert.doesNotMatch(fs.readFileSync(f.file(plain), 'utf8'), /SECOND_PROJECT_GOAL/);
  assert.match(fs.readFileSync(f.file(custom), 'utf8'), /SECOND_PROJECT_GOAL/); assert.doesNotMatch(fs.readFileSync(f.file(custom), 'utf8'), /FIRST_PROJECT_GOAL/);
  f.hub.instructions('Use concise answers.'); assert.match(fs.readFileSync(f.file(plain), 'utf8'), /Use concise answers/);
  const before = { ...f.sessions.items.get(plain.id) };
  assert.throws(() => f.sessions.assignProject(plain.id, b.id, { useProjectName: 'yes' }), /whether/); assert.deepEqual(f.sessions.items.get(plain.id), before);
  f.sessions.assignProject(plain.id, b.id, { useProjectName: true });
  assert.match(fs.readFileSync(f.file(plain), 'utf8'), /SECOND_PROJECT_GOAL/); assert.doesNotMatch(fs.readFileSync(f.file(plain), 'utf8'), /FIRST_PROJECT_GOAL/);
  f.projects.remove(b.id); assert.equal(f.sessions.items.get(plain.id).projectId, null); assert.equal(f.sessions.items.get(plain.id).name, path.basename(f.folder));
  assert.match(fs.readFileSync(f.file(plain), 'utf8'), /No saved project is linked/); assert.doesNotMatch(fs.readFileSync(f.file(plain), 'utf8'), /SECOND_PROJECT_GOAL/);
});

test('dock_context returns the live console or API project binding and never chooses by title', async t => {
  const f = fixture(t), a = f.project('Planner', 'FIRST_ONLY'), b = f.project('Planner', 'SECOND_ONLY');
  const console = await f.sessions.create({ provider: 'shell', cwd: f.folder, projectId: a.id });
  const api = { id: 'api:test', projectId: b.id, cwd: f.folder, name: 'API', alive: true };
  f.hub.workbench = { projects: f.projects, turns: { begin: async () => null, session: id => id === api.id ? api : f.sessions.items.get(id), active: new Map() } };
  const context = async owner => (await f.hub.invoke('dock_context', {}, owner)).content[0].text;
  assert.match(await context(console.id), /FIRST_ONLY/); assert.doesNotMatch(await context(console.id), /SECOND_ONLY/);
  assert.match(await context(api.id), /SECOND_ONLY/); assert.doesNotMatch(await context(api.id), /FIRST_ONLY/);
  f.sessions.assignProject(console.id, b.id); assert.match(await context(console.id), /SECOND_ONLY/); assert.doesNotMatch(await context(console.id), /FIRST_ONLY/);
  f.sessions.assignProject(console.id, null); assert.match(await context(console.id), /"projectId": null/); assert.doesNotMatch(await context(console.id), /FIRST_ONLY|SECOND_ONLY/);
});

test('workspace saves title mode and resumes the same conversation after a project rename', async t => {
  const f = fixture(t), p = f.project('Initial name', 'Keep the conversation');
  const session = await f.sessions.create({ provider: 'codex', cwd: f.folder, projectId: p.id }, { resumeId: thread });
  const crypto = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text), decryptString: data => data.toString() };
  const first = new Workspace(f.root, f.sessions, crypto); first.freeze();
  f.projects.save({ ...p, name: 'Current project name' });
  const restored = f.createSessions(), second = new Workspace(f.root, restored, crypto); await second.restore();
  const item = restored.list()[0]; assert.equal(item.name, 'Current project name'); assert.equal(item.nameMode, 'project'); assert.equal(item.consoleKey, session.consoleKey); assert.equal(item.providerSessionId, thread);
  const resumeArgs = f.launches.at(-1).args, resumeIndex = resumeArgs.indexOf('resume');
  assert.deepEqual(resumeArgs.slice(resumeIndex, resumeIndex + 2), ['resume', thread]); second.freeze();
  // Old saved titles that do not match the project are treated as custom.
  const legacy = f.createSessions(); await legacy.restore({ ...f.sessions.savedConsoles()[0], slot: 2, nameMode: undefined, name: 'My legacy title' });
  assert.equal(legacy.list()[0].name, 'My legacy title'); assert.equal(legacy.list()[0].nameMode, 'custom');
});
