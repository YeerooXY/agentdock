'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Workbench } = require('../electron/workbench.cjs');
const { Turns } = require('../electron/turns.cjs');
const { SharedHub } = require('../electron/shared.cjs');
const { completionNotice } = require('../electron/completion-notice.cjs');

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'dock-completion-'));
  const project = path.join(root, 'project'), profile = path.join(root, 'profile'); fs.mkdirSync(project); fs.mkdirSync(profile);
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), parent); fs.rmSync(root, { recursive: true, force: true }); });
  const session = { id: crypto.randomUUID(), launchId: crypto.randomUUID(), consoleKey: 'persistent-chat', name: 'Same title', cwd: project, alive: true }, signals = [];
  const sessions = { items: new Map([[session.id, session]]), signal: (id, kind) => signals.push({ id, kind }) };
  const wb = new Workbench(profile, {}, { nativeImage: {} }, { testMode: true, onChange() {}, getSessions: () => sessions, getProject: () => project });
  wb.turns = new Turns(wb.results, { getSession: id => sessions.items.get(id), enabled: false });
  return { root, profile, project, session, sessions, signals, wb,
    invoke: (name, args = {}) => wb.invoke('dock/' + name, args, session.id) };
}

test('ready links the completed turn to its human report despite newer code, data and other chats', async t => {
  const f = fixture(t), { turnId } = await f.invoke('start_turn');
  const report = await f.invoke('save_result', { title: 'Finished work', text: 'Checked changes', kind: 'report' });
  await f.invoke('save_result', { title: 'Machine data', text: '{}', ext: '.json', kind: 'test' });
  f.wb.results.add({ title: 'Code changes', text: '{"changes":[{"file":"app.js"}]}', ext: '.json', kind: 'code' }, f.wb.turns.context(f.session.id));
  f.wb.results.add({ title: 'Other chat', text: 'Unrelated', groupId: turnId }, { project: f.project, consoleKey: 'another-chat', consoleName: f.session.name });
  const notice = await f.invoke('notify', { title: 'Ready' });
  assert.equal(notice.destination, 'results'); assert.equal(notice.turnId, turnId); assert.equal(notice.resultId, report.id);
  assert.equal(f.wb.turns.active.size, 0); assert.deepEqual(f.signals, [{ id: f.session.id, kind: 'ready' }]);
});

test('old completion links stay on their turn after another prompt starts and the console is renamed', async t => {
  const f = fixture(t), { turnId } = await f.invoke('start_turn');
  const report = await f.invoke('save_result', { title: 'First prompt', text: 'First result' });
  const finished = await f.invoke('finish_turn'); assert.equal(finished.turnId, turnId);
  assert.equal((await f.invoke('finish_turn')).turnId, turnId, 'A duplicate stop callback retains the completed identity');
  const notice = await f.invoke('notify', { title: 'First prompt ready' });
  f.session.name = 'Renamed chat'; await f.invoke('start_turn');
  const newer = await f.invoke('save_result', { title: 'Second prompt', text: 'Newer result' });
  const native = completionNotice({ kind: 'ready' }, { sessionId: f.session.id, consoleKey: f.session.consoleKey, turnId }, f.wb.results.list());
  assert.equal(notice.resultId, report.id); assert.equal(native.resultId, report.id); assert.notEqual(native.resultId, newer.id);
});

test('a turn with no saved results never borrows an earlier prompt or another chat', async t => {
  const f = fixture(t); await f.invoke('start_turn');
  await f.invoke('save_result', { title: 'Earlier result', text: 'Earlier' }); await f.invoke('finish_turn');
  const { turnId } = await f.invoke('start_turn');
  const notice = await f.invoke('notify', { title: 'Nothing saved' });
  assert.equal(notice.destination, 'results'); assert.equal(notice.turnId, turnId); assert.equal(notice.resultId, null);
  const unknown = completionNotice({ kind: 'ready' }, { sessionId: f.session.id, consoleKey: f.session.consoleKey }, f.wb.results.list());
  assert.equal(unknown.resultId, null); assert.equal(unknown.destination, 'results');
});

test('questions and errors retain console navigation and questions leave the turn active', async t => {
  const f = fixture(t); await f.invoke('start_turn'); await f.invoke('save_result', { title: 'Pending work', text: 'Pending' });
  const question = await f.invoke('notify', { title: 'Need input', kind: 'question' });
  assert.equal(question.sessionId, f.session.id); assert.equal(question.destination, undefined); assert.equal(question.resultId, null);
  assert.equal(f.wb.turns.active.size, 1);
  const error = await f.invoke('notify', { title: 'Failed', kind: 'error' });
  assert.equal(error.destination, undefined); assert.equal(error.resultId, null); assert.equal(f.wb.turns.active.size, 0);
});

function callback(mode, payload, env) {
  return new Promise((resolve, reject) => {
    const file = path.resolve(__dirname, '../electron/agent-event.cjs');
    const child = spawn(process.execPath, mode === 'codex-notify' ? [file, mode, JSON.stringify(payload)] : [file, mode], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let error = ''; child.stderr.on('data', data => error += data);
    const timer = setTimeout(() => { child.kill(); reject(Error('Fixture callback timed out')); }, 10000);
    child.once('error', reject); child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(error || `Callback exited ${code}`)); });
    child.stdin.end(mode === 'codex-notify' ? '' : JSON.stringify(payload));
  });
}

for (const mode of ['codex-notify', 'Stop']) test(`${mode} callback carries its finished turn through the authenticated bridge`, async t => {
  const f = fixture(t), hub = new SharedHub(f.profile, { list: () => [] }, { workbench: f.wb });
  await hub.start(); t.after(() => hub.close());
  const env = { ...process.env, ...hub.grant(f.session.id, f.session.launchId), PADDOCK_DATA_DIR: f.profile, PADDOCK_SESSION_ID: f.session.id, PADDOCK_LAUNCH_ID: f.session.launchId };
  const { turnId } = await f.invoke('start_turn');
  const report = await f.invoke('save_result', { title: 'Callback report', text: 'Synthetic result' });
  await callback(mode, { type: 'agent-turn-complete', hook_event_name: mode === 'Stop' ? 'Stop' : undefined, 'thread-id': 'fixture-chat', session_id: 'fixture-chat', 'input-messages': ['PRIVATE_PROMPT'], 'last-assistant-message': 'PRIVATE_RESPONSE' }, env);
  const event = JSON.parse(fs.readFileSync(path.join(f.profile, 'events', `${f.session.id}.${f.session.launchId}.state.json`), 'utf8'));
  assert.equal(event.state, 'ready'); assert.equal(event.turnId, turnId); assert.ok(!JSON.stringify(event).includes('PRIVATE_'));
  const notice = completionNotice({ kind: 'ready' }, { sessionId: f.session.id, consoleKey: f.session.consoleKey, turnId: event.turnId }, f.wb.results.list());
  assert.equal(notice.resultId, report.id); assert.equal(f.wb.turns.active.size, 0);
});
