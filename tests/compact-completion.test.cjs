'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Workbench } = require('../electron/workbench.cjs');
const { Turns } = require('../electron/turns.cjs');
const { SharedHub } = require('../electron/shared.cjs');
const { Projects } = require('../electron/projects.cjs');
const { taskGuidance } = require('../electron/task-guidance.cjs');
const { runApi } = require('../electron/api-run.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-checkpoint-')), repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projects = new Projects(root), project = projects.save({ name: 'Fixture', goals: 'Build the selected website', folders: [{ path: repo }], notes: 'Historic work. '.repeat(1000) });
  const session = { id: 'owner', consoleKey: 'chat', cwd: repo, projectId: project.id, alive: true };
  const jobs = new Map(), tasks = { jobs, refresh: async () => {}, start: async args => { const job = { ...args, id: 'worker', state: 'implementing' }; jobs.set(job.id, job); return job; } };
  const wb = new Workbench(root, {}, { nativeImage: {} }, { getSessions: () => ({ items: new Map([['owner', session]]) }), getProject: () => repo, getTasks: () => tasks, onChange() {} });
  wb.projects = projects; wb.turns = new Turns({ getSession: () => session });
  const hub = new SharedHub(root, { list: () => [] }, { workbench: wb });
  const call = (name, args = {}) => wb.invoke('dock/' + name, args, session.id);
  const context = async args => (await hub.invoke('dock_context', args || {}, session.id)).content[0].text;
  const complete = (extra = {}) => call('finish_turn', { turnId: wb.completion.turn(session.id).id, outcome: 'changed', summary: 'Implemented and verified the selected layout.', nextStep: 'Review the rendered page.', outputs: 'none', ...extra });
  return { root, projects, project, session, wb, hub, jobs, tasks, call, context, complete };
}

test('task page folder matching picks the closest project and rejects ambiguous bindings', t => {
  const f = fixture(t), child = path.join(f.session.cwd, 'nested'); fs.mkdirSync(child);
  const nested = f.projects.save({ name: 'Nested', goals: 'Fixture', folders: [{ path: child }] });
  assert.equal(f.projects.forFolder(path.join(child, 'src')).id, nested.id);
  assert.equal(f.projects.forFolder(f.session.cwd + '-sibling'), null);
  f.projects.save({ name: 'Ambiguous', goals: 'Fixture', folders: [{ path: child }] });
  assert.equal(f.projects.forFolder(child), null);
});
test('workers receive project decisions and references without accumulated history', t => {
  const f = fixture(t); f.projects.decide(f.project.id, { action: 'add', text: 'Use the selected glass theme' });
  const brief = taskGuidance({}, { title: 'Footer' }, {}, f.projects.brief(f.project.id, true));
  assert.match(brief, /selected glass theme/); assert.match(brief, /completion check/); assert.doesNotMatch(brief, /Historic work/);
});
