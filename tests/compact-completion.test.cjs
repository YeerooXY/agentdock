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
  wb.projects = projects; wb.turns = new Turns(wb.results, { getSession: () => session });
  const hub = new SharedHub(root, { list: () => [] }, { workbench: wb });
  const call = (name, args = {}) => wb.invoke('dock/' + name, args, session.id);
  const context = async args => (await hub.invoke('dock_context', args || {}, session.id)).content[0].text;
  const complete = (extra = {}) => call('finish_turn', { turnId: wb.completion.turn(session.id).id, outcome: 'changed', summary: 'Implemented and verified the selected layout.', nextStep: 'Review the rendered page.', outputs: 'none', ...extra });
  return { root, projects, project, session, wb, hub, jobs, tasks, call, context, complete };
}
test('compact context omits history and expands scoped details without starting another turn', async t => {
  const f = fixture(t); f.projects.decide(f.project.id, { action: 'add', text: 'Use the supplied reference' });
  const brief = await f.context(); const id = f.wb.turns.active.get('owner').id;
  assert.ok(brief.length < 5500, brief.length); assert.doesNotMatch(brief, /Historic work/); assert.match(brief, /finish_turn/);
  assert.match(brief, /Preserve keyboard focus/); assert.match(brief, /Focus must not fall to body/);
  const detail = await f.context({ detail: 'project' }); assert.match(detail, /Use the supplied reference/); assert.doesNotMatch(detail, /Historic work/);
  assert.equal(f.wb.turns.active.get('owner').id, id);
  let cursor = 0, history = '';
  do { const page = JSON.parse(await f.context({ detail: 'history', cursor })); history += page.legacyNotes; cursor = page.nextCursor; } while (cursor !== null);
  assert.equal(history, f.project.notes);
  assert.match(await f.context({ detail: 'shared' }), /Use the user's preferred/);
});
test('ready requires checked output ownership and records concise project progress once', async t => {
  const f = fixture(t); await f.context();
  await assert.rejects(f.call('notify', { kind: 'ready' }), /Completion check/);
  await assert.rejects(f.complete(), /detail:"project"/); await f.context({ detail: 'project' });
  await assert.rejects(f.complete({ outputs: 'saved', resultIds: ['other-turn'] }), /missing or belongs/);
  const output = await f.call('save_result', { title: 'Requested output', text: 'The completed document.' });
  await f.complete({ outputs: 'saved', resultIds: [output.id] });
  const updated = f.projects.get(f.project.id); assert.equal(updated.notes, f.project.notes); assert.match(updated.lastProgress.summary, /Implemented/);
  assert.equal(updated.nextStep, 'Review the rendered page.'); assert.equal(f.wb.results.items.length, 1);
  const before = updated.updatedAt; await f.call('finish_turn'); assert.equal(f.projects.get(f.project.id).updatedAt, before);
  await f.call('notify', { kind: 'ready' });
  const record = f.wb.completion.history(f.project.id); assert.equal(record.items.length, 1);
  await f.call('save_result', { title: 'Later edit', text: 'Changed after completion.' });
  await assert.rejects(f.call('notify', { kind: 'ready' }), /changed after/);
});
test('a question records no-change without rewriting the project and cannot complete a later turn', async t => {
  const f = fixture(t); await f.context(); await f.complete({ outcome: 'no-change', summary: 'Answered a status question; no project work changed.', nextStep: 'None' });
  assert.equal(f.projects.get(f.project.id).lastProgress, undefined);
  const old = f.wb.completion.turn('owner').id; await f.context();
  await assert.rejects(f.complete({ turnId: old }), /current turnId/);
  await assert.rejects(f.call('notify', { kind: 'ready' }), /Completion check/);
});

test('completion reports foreground notification advice without a second tool call', async t => {
  const f = fixture(t), signals = [];
  const sessions = f.wb.getSessions(); sessions.signal = (...args) => signals.push(args); f.wb.getSessions = () => sessions;
  let focused = true;
  f.wb.getWindow = () => ({ isDestroyed: () => false, isFocused: () => focused, isVisible: () => true, isMinimized: () => false });
  await f.context();
  const first = await f.complete({ outcome: 'no-change' });
  assert.equal(first.notifyReady, false); assert.equal(first.completion, 'recorded');
  assert.deepEqual(signals, [['owner', 'ready']]);
  focused = false;
  await f.context();
  const second = await f.complete({ outcome: 'no-change' });
  assert.equal(second.notifyReady, true);
  assert.equal(signals.length, 1, 'background completion retains the normal notification path');
});
test('deleted outputs, missing next steps and changed project bindings cannot pass completion', async t => {
  const f = fixture(t); await f.context(); await f.context({ detail: 'project' });
  await assert.rejects(f.complete({ nextStep: ' ' }), /next step/);
  const output = await f.call('save_result', { title: 'Requested file', text: 'Saved content.' });
  await f.complete({ outputs: 'saved', resultIds: [output.id] });
  await f.wb.results.remove([output.id]); await assert.rejects(f.call('notify', { kind: 'ready' }), /missing or belongs/);
  f.session.projectId = 'different'; await assert.rejects(f.complete(), /linked project changed/);
  await f.call('finish_turn', { interrupted: true });
  await assert.rejects(f.call('notify', { kind: 'ready' }), /linked project changed/);
});
test('task page folder matching picks the closest project and rejects ambiguous bindings', t => {
  const f = fixture(t), child = path.join(f.session.cwd, 'nested'); fs.mkdirSync(child);
  const nested = f.projects.save({ name: 'Nested', goals: 'Fixture', folders: [{ path: child }] });
  assert.equal(f.projects.forFolder(path.join(child, 'src')).id, nested.id);
  assert.equal(f.projects.forFolder(f.session.cwd + '-sibling'), null);
  f.projects.save({ name: 'Ambiguous', goals: 'Fixture', folders: [{ path: child }] });
  assert.equal(f.projects.forFolder(child), null);
});
test('delegated tasks carry the linked project and block completion until fresh verification is available', async t => {
  const f = fixture(t); await f.context(); await f.context({ detail: 'project' });
  await f.call('start_task', { title: 'Implement footer', criteria: 'Links work.', implementer: { accountId: 'mock' } });
  assert.equal(f.jobs.get('worker').projectId, f.project.id);
  await assert.rejects(f.complete(), /unfinished or needs attention/);
  Object.assign(f.jobs.get('worker'), { state: 'passed', resultId: 'report', unresolved: [] });
  f.tasks.refresh = async () => { f.jobs.get('worker').state = 'needs-you'; };
  await assert.rejects(f.complete(), /unfinished or needs attention/);
  f.tasks.refresh = async () => {}; f.jobs.get('worker').state = 'passed'; await f.complete();
  Object.assign(f.jobs.get('worker'), { state: 'accepted', unresolved: ['User accepted the remaining layout issue.'] });
  await f.complete(); assert.deepEqual(f.wb.completion.read(f.wb.completion.turn('owner')).tasks[0].acceptedIssues, ['User accepted the remaining layout issue.']);
});
test('a failed task closed with a reason no longer blocks completion; a running one still does', async t => {
  const f = fixture(t); await f.context(); await f.context({ detail: 'project' });
  await f.call('start_task', { title: 'Implement footer', criteria: 'Links work.', implementer: { accountId: 'mock' } });
  Object.assign(f.jobs.get('worker'), { state: 'implementing', dismissedAt: 5 });
  await assert.rejects(f.complete(), /unfinished or needs attention/);
  Object.assign(f.jobs.get('worker'), { state: 'needs-you', dismissedAt: 6, dismissReason: 'Worker made no changes.' });
  await f.complete();
});
test('workers receive project decisions and references without accumulated history', t => {
  const f = fixture(t); f.projects.decide(f.project.id, { action: 'add', text: 'Use the selected glass theme' });
  const brief = taskGuidance({}, { title: 'Footer' }, {}, f.projects.brief(f.project.id, true));
  assert.match(brief, /selected glass theme/); assert.match(brief, /completion check/); assert.doesNotMatch(brief, /Historic work/);
});
test('API completion cannot silently skip its checkpoint or trigger another paid request', async () => {
  let calls = 0;
  const result = await runApi({ model: 'fixture', prompt: 'Question', maxOutput: 100 }, null, null, { profile: { id: 'fixture', protocol: 'chat', url: 'http://localhost:8080/v1/chat/completions' }, hub: { summary: () => '', completionCheck: () => { throw Error('Completion check required'); } }, fetcher: async () => { calls++; return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'Answer' } }] }) }; } });
  assert.equal(result.entry.status, 'incomplete'); assert.match(result.error, /Completion check/); assert.equal(calls, 1);
});
