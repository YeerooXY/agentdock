'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Workbench } = require('../electron/workbench.cjs');
const { Turns } = require('../electron/turns.cjs');
const { SharedHub } = require('../electron/shared.cjs');
const { Sessions } = require('../electron/sessions.cjs');
const { studyCourse } = require('../electron/study-context.cjs');

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'study-lifecycle-'));
  const semesterRoot = path.join(root, 'semester'), folder = path.join(semesterRoot, 'CPP'), profile = path.join(root, 'paddock');
  fs.mkdirSync(folder, { recursive: true }); fs.mkdirSync(profile);
  fs.writeFileSync(path.join(semesterRoot, 'courses.json'), JSON.stringify({ courses: [{ id: 'cpp', folder: 'CPP', shortName: 'C++' }] }));
  const session = { id: crypto.randomUUID(), launchId: crypto.randomUUID(), consoleKey: 'study-chat', name: 'C++', provider: 'codex', purpose: 'agent', cwd: folder, projectId: null, alive: true, state: 'active' };
  const signals = [], sessions = { items: new Map([[session.id, session]]), signal: (id, kind) => signals.push({ id, kind }) }, jobs = new Map();
  const tasks = { jobs, refresh: async () => {}, start: async () => { const job = { id: 'worker', state: 'implementing' }; jobs.set(job.id, job); return job; } };
  const wb = new Workbench(profile, {}, { nativeImage: {} }, { testMode: true, onChange() {}, getSessions: () => sessions, getProject: () => folder, getTasks: () => tasks });
  wb.turns = new Turns(wb.results, { getSession: id => sessions.items.get(id) });
  wb.completion.studyCourse = value => studyCourse(value, { semesterRoot });
  const hub = new SharedHub(profile, { list: () => [] }, { workbench: wb });
  t.after(async () => { await hub.close(); assert.equal(path.dirname(fs.realpathSync(root)), parent); fs.rmSync(root, { recursive: true, force: true }); });
  const invoke = (name, args = {}) => wb.invoke('dock/' + name, args, session.id);
  const complete = (extra = {}) => invoke('finish_turn', { turnId: wb.completion.turn(session.id).id, outcome: 'no-change', summary: 'Checked the requested work.', nextStep: 'Continue studying.', outputs: 'none', ...extra });
  return { root, profile, folder, session, sessions, signals, wb, hub, jobs, tasks, invoke, complete };
}

test('ordinary study responses create no turn or completion and leave explicit ready checks strict', async t => {
  const f = fixture(t);
  for (const event of ['start', 'complete', 'start', 'complete']) {
    assert.deepEqual(await f.invoke('agent_response', { event }), { completion: 'study-continuation', turnId: null });
  }
  assert.equal(f.wb.turns.active.size, 0); assert.equal(f.wb.turns.latest.size, 0);
  assert.equal(fs.existsSync(f.wb.completion.dir), false);
  await assert.rejects(f.invoke('finish_turn'), /Completion check/);
  await assert.rejects(f.invoke('notify', { kind: 'ready' }), /Completion check/);
});

test('linked, non-course, API, remote, worker and shell sessions retain normal completion', async t => {
  for (const extra of [{ projectId: 'linked' }, { cwd: os.tmpdir() }, { provider: undefined }, { remote: {} }, { taskId: 'worker' }, { provider: 'shell' }, { purpose: 'login' }]) {
    const f = fixture(t); Object.assign(f.session, extra);
    assert.equal(f.wb.completion.isStudyConversation(f.session.id), false);
    await assert.rejects(f.invoke('agent_response', { event: 'complete' }), /Completion check/);
  }
  const f = fixture(t); f.session.cwd = f.root;
  await f.invoke('agent_response', { event: 'start' });
  assert.equal(f.wb.turns.active.size, 1);
});

test('explicit work and outputs require a recorded outcome before study can continue quietly', async t => {
  const f = fixture(t);
  await f.hub.invoke('dock_context', {}, f.session.id);
  const active = f.wb.turns.active.get(f.session.id);
  await assert.rejects(f.invoke('agent_response', { event: 'complete' }), /Completion check/);
  assert.equal(f.wb.turns.active.get(f.session.id), active);
  const output = await f.invoke('save_result', { title: 'Exercise notes', text: 'A checked attempt.' });
  assert.equal(output.groupId, active.id);
  await f.complete({ outputs: 'saved', resultIds: [output.id] });
  assert.equal((await f.invoke('agent_response', { event: 'complete' })).completion, 'recorded');
  assert.equal((await f.invoke('agent_response', { event: 'complete' })).completion, 'study-continuation');
  await f.wb.results.remove([output.id]);
  assert.equal((await f.invoke('agent_response', { event: 'complete' })).completion, 'study-continuation');
  await assert.rejects(f.invoke('notify', { kind: 'ready' }), /missing or belongs/);
});

test('a missing output still blocks the first response check of newly completed work', async t => {
  const f = fixture(t), output = await f.invoke('save_result', { title: 'Notes', text: 'Current work.' });
  await f.complete({ outputs: 'saved', resultIds: [output.id] });
  await f.wb.results.remove([output.id]);
  await assert.rejects(f.invoke('agent_response', { event: 'complete' }), /missing or belongs/);
  assert.equal(f.wb.completion.turn(f.session.id).responseChecked, undefined);
  assert.equal(f.wb.completion.canContinueStudy(f.session.id), false);
});

test('saving an output from quiet study starts a tracked task before assigning ownership', async t => {
  const f = fixture(t), output = await f.invoke('save_result', { title: 'Notes', text: 'Saved at the break.' });
  const active = f.wb.turns.active.get(f.session.id);
  assert.ok(active); assert.equal(output.groupId, active.id);
  await assert.rejects(f.invoke('agent_response', { event: 'complete' }), /Completion check/);
  await f.complete({ outputs: 'saved', resultIds: [output.id] });
});

test('a connected tool call acquires tracked work before invoking the provider', async t => {
  const f = fixture(t);
  f.hub.config.connections = [{ id: 'fixture', type: 'stdio', enabled: true }];
  f.hub.policy.check = async (_connection, _tool, args) => ({ args, counted: false });
  f.hub.connect = async () => ({ tools: [{ name: 'operation', inputSchema: { type: 'object', additionalProperties: false } }],
    client: { callTool: async () => {
      assert.equal(f.wb.turns.active.has(f.session.id), true);
      return { content: [{ type: 'text', text: 'Synthetic operation.' }] };
    } } });
  await f.hub.invoke('dock_call', { tool: 'fixture/operation', arguments: {} }, f.session.id);
  await assert.rejects(f.invoke('agent_response', { event: 'complete' }), /Completion check/);
});

test('workers block active and unchecked work while historical worker changes leave later study quiet', async t => {
  const f = fixture(t);
  await f.invoke('start_task', { title: 'Check exercise', criteria: 'Report errors.', implementer: { accountId: 'mock' } });
  assert.deepEqual(f.wb.turns.active.get(f.session.id).taskIds, ['worker']);
  await assert.rejects(f.invoke('agent_response', { event: 'complete' }), /Completion check/);
  await assert.rejects(f.complete(), /unfinished or needs attention/);
  Object.assign(f.jobs.get('worker'), { state: 'passed', resultId: 'worker-report' });
  await f.complete();
  f.jobs.get('worker').state = 'implementing';
  await assert.rejects(f.invoke('agent_response', { event: 'complete' }), /unfinished or needs attention/);
  f.jobs.get('worker').state = 'passed';
  await f.invoke('agent_response', { event: 'complete' });
  f.jobs.get('worker').state = 'implementing';
  assert.equal((await f.invoke('agent_response', { event: 'complete' })).completion, 'study-continuation');
  await f.invoke('start_task', { title: 'Check another exercise', criteria: 'Report errors.', implementer: { accountId: 'mock' } });
  await assert.rejects(f.invoke('agent_response', { event: 'complete' }), /Completion check/);
  await assert.rejects(f.complete(), /unfinished or needs attention/);
});

test('quiet errors leave completed history intact while interrupted active work stays blocked', async t => {
  const f = fixture(t); await f.invoke('start_turn'); await f.complete();
  await f.invoke('agent_response', { event: 'complete' });
  const completed = f.wb.completion.turn(f.session.id);
  f.wb.completion.invalidate(f.session.id);
  await f.invoke('notify', { kind: 'error', message: 'The current answer failed.' });
  assert.deepEqual(f.signals.at(-1), { id: f.session.id, kind: 'error' });
  assert.equal(completed.completionInvalidated, false);
  assert.equal((await f.invoke('agent_response', { event: 'complete' })).completion, 'study-continuation');
  await f.invoke('start_turn'); await f.invoke('finish_turn', { interrupted: true });
  await assert.rejects(f.invoke('agent_response', { event: 'complete' }), /Completion check/);
});

test('error invalidation still applies to active or unchecked study work and closed non-study work', async t => {
  const active = fixture(t); await active.invoke('start_turn');
  const turn = active.wb.completion.turn(active.session.id);
  await active.invoke('notify', { kind: 'error' });
  assert.equal(turn.completionInvalidated, true);
  await assert.rejects(active.invoke('agent_response', { event: 'complete' }), /Completion check/);
  const unchecked = fixture(t); await unchecked.invoke('start_turn'); await unchecked.complete();
  await unchecked.invoke('notify', { kind: 'error' });
  assert.equal(unchecked.wb.completion.turn(unchecked.session.id).completionInvalidated, true);
  await assert.rejects(unchecked.invoke('agent_response', { event: 'complete' }), /changed after/);
  const ordinary = fixture(t); ordinary.session.provider = 'shell';
  await ordinary.invoke('start_turn'); await ordinary.complete();
  await ordinary.invoke('agent_response', { event: 'complete' });
  await ordinary.invoke('notify', { kind: 'error' });
  assert.equal(ordinary.wb.completion.turn(ordinary.session.id).completionInvalidated, true);
  await assert.rejects(ordinary.invoke('agent_response', { event: 'complete' }), /changed after/);
});

test('callback rechecks completion after acquiring the finish queue', async t => {
  const f = fixture(t), output = await f.invoke('save_result', { title: 'Notes', text: 'Current work.' });
  await f.complete({ outputs: 'saved', resultIds: [output.id] });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const queued = f.wb.turns.serial(f.session.id, () => gate);
  const rejected = assert.rejects(f.invoke('agent_response', { event: 'complete' }), /missing or belongs/);
  try { await f.wb.results.remove([output.id]); }
  finally { release(); }
  await queued; await rejected;
  assert.equal(f.wb.completion.turn(f.session.id).responseChecked, undefined);
});

test('a delayed callback cannot close another agent task or reuse a superseded turn', async t => {
  const f = fixture(t); await f.invoke('start_turn'); await f.complete();
  const old = f.wb.completion.turn(f.session.id).id;
  await f.invoke('agent_response', { event: 'complete' });
  assert.equal(f.wb.completion.canContinueStudy(f.session.id, old), true);
  // Starting work is queued before the callback attempts to finish the old ID.
  const starting = f.wb.turns.begin(f.session.id);
  const finishing = f.wb.turns.finish(f.session.id, undefined, old);
  const newer = await starting;
  await assert.rejects(finishing, /new task started/);
  assert.equal(f.wb.turns.active.get(f.session.id).id, newer);
  assert.equal(f.wb.completion.canContinueStudy(f.session.id, old), false);
  await f.complete();
  await assert.rejects(f.wb.turns.finish(f.session.id, undefined, old), /new task started/);
});

function callback(mode, env) {
  const payload = { type: 'agent-turn-complete', hook_event_name: mode, 'thread-id': 'fixture-chat', session_id: 'fixture-chat' };
  return new Promise((resolve, reject) => {
    const file = path.resolve(__dirname, '../electron/agent-event.cjs');
    const child = spawn(process.execPath, mode === 'codex-notify' ? [file, mode, JSON.stringify(payload)] : [file, mode], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = ''; child.stdout.on('data', data => output += data); child.stderr.on('data', data => error += data);
    const timeout = setTimeout(() => { child.kill(); reject(Error('Callback timed out')); }, 10000);
    child.once('error', reject); child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve(output) : reject(Error(error || String(code))); });
    child.stdin.end(mode === 'codex-notify' ? '' : JSON.stringify(payload));
  });
}

for (const mode of ['codex-notify', 'Stop']) test(`${mode} study callback stays quiet and does not clear later work`, async t => {
  const f = fixture(t); f.session.provider = mode === 'Stop' ? 'claude' : 'codex';
  await f.hub.start();
  const env = { ...process.env, ...f.hub.grant(f.session.id, f.session.launchId), PADDOCK_DATA_DIR: f.profile, PADDOCK_SESSION_ID: f.session.id, PADDOCK_LAUNCH_ID: f.session.launchId };
  if (mode === 'Stop') {
    await callback('UserPromptSubmit', env);
    assert.equal(f.wb.turns.active.size, 0, 'A study prompt must not create a work turn');
  }
  assert.equal(await callback(mode, env), '');
  const file = path.join(f.profile, 'events', `${f.session.id}.${f.session.launchId}.state.json`);
  const event = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(event.state, 'open'); assert.equal(event.studyContinuation, true);
  assert.equal(event.summary, undefined); assert.equal(fs.existsSync(f.wb.completion.dir), false);
  const observer = new Sessions(f.profile, { hub: f.hub, pty: {} }); observer.items = f.sessions.items;
  let attention = 0; observer.on('attention', () => attention++);
  observer.scanEvents(); assert.equal(f.session.state, 'open'); assert.equal(attention, 0);
  // Rescan the same delayed event against a new active task in the shared owner.
  observer.eventTimes.clear(); await f.invoke('start_turn'); f.session.state = 'active';
  fs.writeFileSync(file, JSON.stringify({ ...event, providerSessionId: 'updated-fixture-chat' }));
  let changes = 0; observer.on('changed', () => changes++);
  observer.scanEvents(); assert.equal(f.session.state, 'active'); assert.equal(attention, 0);
  assert.equal(f.session.providerSessionId, 'updated-fixture-chat'); assert.equal(changes, 1);
  await callback(mode, env);
  const blocked = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(blocked.state, 'attention'); assert.match(blocked.summary, /Completion check/);
});

test('Codex stays quiet after a checked historical result is deleted', async t => {
  const f = fixture(t); await f.hub.start();
  const env = { ...process.env, ...f.hub.grant(f.session.id, f.session.launchId), PADDOCK_DATA_DIR: f.profile, PADDOCK_SESSION_ID: f.session.id, PADDOCK_LAUNCH_ID: f.session.launchId };
  const output = await f.invoke('save_result', { title: 'Completed notes', text: 'Historical work.' });
  await f.complete({ outputs: 'saved', resultIds: [output.id] });
  await callback('codex-notify', env);
  await f.wb.results.remove([output.id]);
  const file = path.join(f.profile, 'events', `${f.session.id}.${f.session.launchId}.state.json`);
  for (let i = 0; i < 2; i++) {
    assert.equal(await callback('codex-notify', env), '');
    const event = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(event.state, 'open'); assert.equal(event.studyContinuation, true);
  }
});

for (const mode of ['StopFailure', 'SessionEnd']) test(`Claude ${mode} during quiet study preserves checked history`, async t => {
  const f = fixture(t); f.session.provider = 'claude'; await f.hub.start();
  const env = { ...process.env, ...f.hub.grant(f.session.id, f.session.launchId), PADDOCK_DATA_DIR: f.profile, PADDOCK_SESSION_ID: f.session.id, PADDOCK_LAUNCH_ID: f.session.launchId };
  await f.invoke('start_turn'); await f.complete(); await callback('Stop', env);
  const historical = f.wb.completion.turn(f.session.id);
  await callback(mode, env);
  const file = path.join(f.profile, 'events', `${f.session.id}.${f.session.launchId}.state.json`);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).state, mode === 'StopFailure' ? 'error' : 'ended');
  assert.equal(historical.completionInvalidated, false);
  await callback('UserPromptSubmit', env); assert.equal(f.wb.turns.active.size, 0);
  assert.equal(await callback('Stop', env), '');
  const resumed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(resumed.state, 'open'); assert.equal(resumed.studyContinuation, true);
});

test('updated source hooks preserve the strict contract of a host without agent_response', async t => {
  const f = fixture(t), originalTools = f.wb.tools();
  f.wb.tools = () => originalTools.filter(tool => tool.name !== 'dock/agent_response');
  await f.hub.start();
  const env = { ...process.env, ...f.hub.grant(f.session.id, f.session.launchId), PADDOCK_DATA_DIR: f.profile, PADDOCK_SESSION_ID: f.session.id, PADDOCK_LAUNCH_ID: f.session.launchId };
  const eventFile = path.join(f.profile, 'events', `${f.session.id}.${f.session.launchId}.state.json`);
  await callback('UserPromptSubmit', env);
  assert.equal(f.wb.turns.active.size, 1);
  await callback('Stop', env);
  assert.equal(JSON.parse(fs.readFileSync(eventFile, 'utf8')).state, 'attention');
  await f.complete(); await callback('Stop', env);
  assert.equal(JSON.parse(fs.readFileSync(eventFile, 'utf8')).state, 'ready');
});
