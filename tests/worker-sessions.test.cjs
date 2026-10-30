'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { Sessions } = require('../electron/sessions.cjs');
const { TaskLoop } = require('../electron/task-loop.cjs');
const { OwnerConsoles } = require('../electron/owner-consoles.cjs');
const { WorkerSessions } = require('../electron/worker-sessions.cjs');
const { WorkerPlacement } = require('../electron/worker-placement.cjs');
const { MessageQueue } = require('../electron/message-queue.cjs');
const { CapacityReservations } = require('../electron/capacity-reservations.cjs');
const { MobileCompanion } = require('../electron/mobile.cjs');
const { endSession } = require('../electron/session-end.cjs');

function fixture(t, script = [], { visible = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-worker-'));
  const sessions = new Sessions(root, { pty: {}, grid: { columns: 2, rows: 2 } });
  const owners = new OwnerConsoles(root), unbind = owners.bind(sessions);
  const spawned = [], saved = [];
  const account = { id: 'codex:default', provider: 'codex', label: 'Test', executable: 'mock-cli' };
  const loop = new TaskLoop(root, { candidates: () => [account], environment: () => ({}),
    run: () => { throw new Error('Real processes are prohibited.'); },
    spawnProcess(executable, args, options) {
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.kill = () => { child.killed = true; child.emit('close', null); };
      const call = { executable, args, options, child, prompt: '' }, action = script.shift(); spawned.push(call);
      child.stdin = { on() {}, end(text) { call.prompt = text; queueMicrotask(() => {
        action?.inspect?.(call);
        if (action?.hold) return;
        if (action?.error) return child.emit('error', new Error('mock spawn error'));
        if (action?.output) child.stdout.emit('data', action.output);
        child.emit('close', action?.code ?? 0);
      }); } };
      return child;
    }, killProcess: child => child.kill() });
  loop.changes = async () => ({ files: [], untracked: [], diff: '', baselineChanges: [], trackedFiles: [] });
  loop.fingerprint = async () => 'same-tree'; loop.capture = async () => true;
  loop.record = async job => { saved.push(job.state); };
  const placement = visible ? new WorkerPlacement({ grid: () => sessions.grid,
    mainItems: () => [...sessions.layoutItems(), ...sessions.starting.values()],
    protectedConsole: key => owners.isProtected(key) }) : null;
  const bridge = new WorkerSessions(sessions, loop, { placement });
  const job = { id: 'task', projectId: 'project', repo: root, workFolder: root, state: 'implementing',
    title: 'Worker test', criteria: 'Apply steering', sourceRevision: 'base', baseline: 'base',
    workflow: 'current', startedAt: Date.now(), deadlineAt: Date.now() + 60000,
    timeLimitMinutes: 5, maxRounds: 1, rounds: [], steeringSequence: 0,
    checks: 'mock-check', implementer: { accountId: account.id, provider: account.provider, label: account.label },
    reviewer: null, log: [], unresolved: [], why: {} };
  loop.jobs.set(job.id, job);
  t.after(async () => {
    loop.interruptAll(); await Promise.all([...loop.cancellations.values(), ...loop.pending.values()]);
    unbind(); owners.dispose(); fs.rmSync(root, { recursive: true, force: true });
  });
  const open = () => bridge.open(job, job.implementer);
  const payload = (item, text = 'Use the requested file.', submissionId = 'message-1') => ({ id: item.id,
    consoleKey: item.consoleKey, launchId: item.launchId, text, submissionId });
  return { root, sessions, owners, loop, job, bridge, spawned, saved, open, payload };
}
async function until(check) {
  for (let count = 0; count < 100; count++) { if (check()) return; await new Promise(resolve => setImmediate(resolve)); }
  assert.ok(check(), 'The mocked operation did not start.');
}

test('one CLI worker consumes queued steering after exit and before checks', async t => {
  const f = fixture(t, [{ hold: true }, { inspect: call => assert.match(call.prompt, /Owner steering 1:\nChange the button\./) }, {}]);
  const running = f.loop.runTask(f.job, 'mock-check');
  await until(() => f.spawned.length === 1);
  const worker = f.sessions.items.get(f.job.workerSession.id), originalKey = worker.consoleKey;
  const stale = f.payload(worker, 'Change the button.');
  assert.equal(f.bridge.submit(stale).status, 'queued');
  assert.equal(f.bridge.submit(stale).sequence, 1, 'lost replies do not duplicate delivery');
  assert.equal(f.spawned.length, 1, 'no second agent while the batch is running');
  assert.equal(f.job.workerSteering[0].status, 'queued');
  f.spawned[0].child.emit('close', 0); await running;
  assert.equal(f.spawned.length, 3, 'builder, continuation, then checks');
  assert.equal(f.job.state, 'passed'); assert.equal(f.job.rounds.length, 1, 'steering is not a solution retry');
  assert.equal(f.job.rounds[0].steeringSequenceConsumed, 1);
  assert.equal(f.job.workerSteering[0].status, 'acknowledged');
  assert.equal(f.sessions.items.get(worker.id).consoleKey, originalKey);
  assert.notEqual(worker.launchId, stale.launchId);
  assert.throws(() => f.bridge.submit(stale), /worker changed/);
  assert.ok(f.sessions.items.has(worker.id), 'owner-touched completed workers stay open');
  assert.doesNotMatch(fs.readFileSync(path.join(f.root, 'tasks', 'task.json'), 'utf8'), /Change the button/);
});

test('steering arriving during checks prevents passing or reviewer calls', async t => {
  const f = fixture(t, [{}, { hold: true }]);
  f.job.reviewer = { accountId: 'reviewer', provider: 'claude', label: 'Review' };
  const running = f.loop.runTask(f.job, 'mock-check'); await until(() => f.spawned.length === 2);
  f.bridge.submit(f.payload(f.sessions.items.get(f.job.workerSession.id)));
  f.spawned[1].child.emit('close', 0); await running;
  assert.equal(f.job.state, 'needs-you'); assert.equal(f.spawned.length, 2);
  assert.match(f.job.error, /steering needs a builder turn/);
});

test('uncertain steering is shown without replaying or blocking a later successful attempt', async t => {
  const f = fixture(t, [{ hold: true }, { code: 1 }, { inspect: call => assert.doesNotMatch(call.prompt, /Uncertain instruction/) }, {}]);
  const running = f.loop.runTask(f.job, 'mock-check'); await until(() => f.spawned.length === 1);
  f.bridge.submit(f.payload(f.sessions.items.get(f.job.workerSession.id), 'Uncertain instruction'));
  f.spawned[0].child.emit('close', 0); await running;
  assert.equal(f.job.state, 'failed'); assert.equal(f.spawned.length, 2);
  assert.equal(f.job.workerSteering[0].status, 'uncertain'); assert.equal(f.bridge.pending(f.job), false);
  assert.equal(f.bridge.unconsumed(f.job), false);
  f.job.state = 'implementing';
  await f.loop.runTask(f.job, 'mock-check', { additionalRounds: true });
  assert.equal(f.job.state, 'passed'); assert.equal(f.spawned.length, 4);
  assert.equal(f.job.workerSteering[0].status, 'uncertain');
  assert.equal(f.sessions.items.get(f.job.workerSession.id).steeringState, 'Delivery unconfirmed');
});

test('worker guards reject direct input, generic close, switching, setup and every queue action after promotion', async t => {
  const f = fixture(t), item = f.open(), queue = new MessageQueue(f.sessions);
  f.sessions.ownerInteraction(item.id, 'click');
  assert.equal(f.owners.records.get(item.consoleKey).ownerManaged, true);
  assert.throws(() => f.sessions.write(item.id, 'stop'), /worker composer/);
  assert.throws(() => f.sessions.end(item.id), /Stop worker/);
  await assert.rejects(endSession(item.id, { sessions: f.sessions,
    dialog: { showMessageBox() { assert.fail('Generic close must not open a worker confirmation.'); } },
    getSettings() { assert.fail('Generic close must reject before changing settings.'); } }), /Stop worker/);
  await assert.rejects(f.sessions.switchAccount({ id: item.id, launchId: item.launchId }), /Stop worker/);
  await assert.rejects(f.sessions.createSetupConsole({ id: item.id, launchId: item.launchId }), /Stop worker/);
  for (const change of [() => queue.add(item.id, 'x'), () => queue.edit(item.id, 'e', 'x'),
    () => queue.remove(item.id, 'e'), () => queue.move(item.id, 'e', 1), () => queue.pause(item.id, false)]) assert.throws(change, /worker composer/);
  await assert.rejects(queue.sendNow(item.id, 'e'), /worker composer/);
  assert.deepEqual(f.sessions.savedConsoles(), [], 'workers never restore as a second interactive agent');
});

test('stale and older phone requests cannot bypass worker guards or confirmed Stop', async t => {
  const f = fixture(t, [{ hold: true }]), running = f.loop.runTask(f.job, 'mock-check');
  await until(() => f.spawned.length === 1);
  const item = f.sessions.items.get(f.job.workerSession.id), device = {}, client = { ws: { readyState: 1 }, device, selected: item.id };
  const mobile = { sessions: f.sessions, clients: new Set([client]), private: { devices: [device] } };
  const call = (method, payload) => MobileCompanion.prototype.call.call(mobile, client, method, payload);
  for (const method of ['input', 'console.close', 'console.switch', 'console.setup', 'console.rename', 'console.project',
    'console.models', 'console.worktree', 'console.worktree.root', 'console.worktree.status',
    'attachment.begin', 'attachment.chunk', 'attachment.finish', 'attachment.future',
    'queue.add', 'queue.edit', 'queue.remove', 'queue.move', 'queue.pause', 'queue.send', 'queue.future']) {
    await assert.rejects(call(method, { id: item.id, confirm: true, data: 'x' }), /worker composer/);
  }
  for (const method of ['console.models', 'console.worktree', 'attachment.chunk', 'attachment.finish']) {
    await assert.rejects(call(method, {}), /worker composer/, 'legacy requests without a console ID cannot bypass the selected worker');
  }
  await assert.rejects(call('worker.submit', { ...f.payload(item), launchId: 'old' }), /worker changed/);
  await assert.rejects(call('worker.stop', { ...f.payload(item), confirm: true, sliceId: 'wrong' }), /Confirm Stop worker/);
  await assert.rejects(call('worker.stop', { ...f.payload(item), launchId: 'old', confirm: true, sliceId: f.job.id }), /worker changed/);
  assert.equal(f.spawned[0].child.killed, undefined);
  await call('worker.stop', { ...f.payload(item), confirm: true, sliceId: f.job.id }); await running;
  assert.equal(f.job.state, 'stopped'); assert.equal(f.spawned[0].child.killed, true);
  assert.ok(f.sessions.items.has(item.id), 'explicit Stop preserves the owner panel');
});

test('full grids run hidden without changing owner rectangles or using an interactive PTY', t => {
  const f = fixture(t);
  for (let slot = 1; slot <= 4; slot++) f.sessions.items.set('owner-' + slot,
    { id: 'owner-' + slot, consoleKey: 'owner-' + slot, launchId: 'launch-' + slot,
      projectId: 'other-project', alive: true, slot, width: 1, height: 1, name: 'Owner', provider: 'shell' });
  f.sessions.emit('changed');
  const before = JSON.stringify(f.sessions.layoutItems()), grid = { ...f.sessions.grid };
  const item = f.open(); assert.equal(item.hidden, true); assert.equal(item.slot, null);
  assert.equal(JSON.stringify(f.sessions.layoutItems()), before); assert.deepEqual(f.sessions.grid, grid);
  assert.equal(f.sessions.previewLayout({ id: 'owner-1', slot: 1 }).length, 4);
  f.bridge.process(f.job, true); f.bridge.process(f.job, false);
  assert.ok(f.sessions.items.has(item.id), 'presentation does not kill execution');
});

test('deadline exhaustion preserves the process and named Stop remains usable', async t => {
  const f = fixture(t, [{ hold: true }]), running = f.loop.runTask(f.job, 'mock-check');
  await until(() => f.spawned.length === 1);
  const item = f.sessions.items.get(f.job.workerSession.id);
  f.loop.deadline(f.job); assert.equal(f.job.state, 'needs-you');
  assert.equal(f.spawned[0].child.killed, undefined); assert.equal(item.processAlive, true);
  await f.bridge.stop({ ...f.payload(item), confirm: true, sliceId: f.job.id }); await running;
  assert.equal(f.spawned[0].child.killed, true);
});

test('pending worker steering receives owner capacity instead of starving behind its reservation', async t => {
  const f = fixture(t), item = f.open();
  f.owners.heartbeat([{ consoleKey: item.consoleKey, launchId: item.launchId }]);
  const admission = new CapacityReservations(f.owners); t.after(() => admission.dispose());
  f.loop.admission = admission;
  f.bridge.submit(f.payload(item));
  const messages = f.bridge.take(f.job);
  const release = await f.loop.acquireProvider(f.job, { ...f.job.implementer, ownerSteering: true });
  assert.equal(typeof release, 'function'); assert.equal(admission.active.get(f.job.id).owner, true);
  f.bridge.acknowledge(f.job, messages, true); release();
});

test('owner steering wakes a worker waiting for its first automatic slot without a duplicate launch', async t => {
  const f = fixture(t, [{ inspect: call => assert.match(call.prompt, /Owner steering 1/) }, {}]);
  f.sessions.items.set('owner', { id: 'owner', consoleKey: 'owner', launchId: 'owner-launch',
    accountId: 'codex:default', projectId: 'other-project', alive: true, slot: 1, provider: 'codex', purpose: 'agent', name: 'Owner', width: 1, height: 1 });
  f.sessions.emit('changed'); f.sessions.ownerInteraction('owner', 'typing', { draft: true });
  const admission = new CapacityReservations(f.owners); t.after(() => admission.dispose());
  f.loop.admission = admission;
  const before = { ...f.sessions.items.get('owner') };
  const running = f.loop.runTask(f.job, 'mock-check');
  await until(() => admission.pending.length === 1);
  assert.equal(f.spawned.length, 0); assert.equal(f.job.queueReason, 'Reserved for owner');
  const worker = f.sessions.items.get(f.job.workerSession.id);
  f.bridge.submit(f.payload(worker)); await running;
  assert.equal(f.spawned.length, 2); assert.equal(f.job.state, 'passed');
  assert.deepEqual(f.sessions.items.get('owner'), before);
});

test('untouched completion waits for renderer activity reconciliation and confirmed exit', async t => {
  const f = fixture(t, [{}, {}]);
  await f.loop.runTask(f.job, 'mock-check');
  const item = f.sessions.items.get(f.job.workerSession.id);
  assert.ok(item, 'unknown renderer activity is protected'); assert.deepEqual(f.saved, ['passed']);
  f.loop.unconfirmed.set(f.job.id, new EventEmitter());
  f.owners.heartbeat([{ consoleKey: item.consoleKey, launchId: item.launchId }]);
  assert.ok(f.sessions.items.has(item.id), 'an unconfirmed process cannot be cleaned up');
  f.loop.unconfirmed.delete(f.job.id);
  f.owners.heartbeat([{ consoleKey: item.consoleKey, launchId: item.launchId }]);
  assert.equal(f.sessions.items.has(item.id), false);
});

test('completion saves the outcome before removing an untouched worker', async t => {
  const f = fixture(t, [{}, {}]);
  let saved; const gate = new Promise(resolve => { saved = resolve; });
  f.loop.record = () => gate;
  const running = f.loop.runTask(f.job, 'mock-check');
  await until(() => f.job.state === 'passed');
  const item = f.sessions.items.get(f.job.workerSession.id);
  f.owners.heartbeat([{ consoleKey: item.consoleKey, launchId: item.launchId }]);
  assert.ok(f.sessions.items.has(item.id), 'report saving is still pending');
  saved(); await running;
  assert.equal(f.sessions.items.has(item.id), false);
});

test('file-prompt adapters do not write mailbox steering to plaintext files', t => {
  const f = fixture(t); f.job.implementer.provider = 'opencode';
  const item = f.open();
  assert.equal(item.steeringSupported, false);
  assert.throws(() => f.bridge.submit(f.payload(item, 'PRIVATE STEERING')), /Steering is unavailable/);
  assert.equal(f.job.workerSteering, undefined);
  assert.equal(f.bridge.pending(f.job), false);
});

test('owner moves can swap worker and protected consoles, including during owner interaction', t => {
  const f = fixture(t);
  f.sessions.items.set('owner', { id: 'owner', consoleKey: 'owner', launchId: 'owner-launch',
    alive: true, slot: 1, width: 1, height: 1, provider: 'shell', purpose: 'agent' });
  f.sessions.emit('changed');
  const item = f.open(); assert.equal(item.slot, 2);
  f.sessions.move(item.id, 1);
  assert.equal(f.sessions.items.get('owner').slot, 2); assert.equal(item.slot, 1);
  f.owners.heartbeat([...f.sessions.items.values()].map(item => ({ consoleKey: item.consoleKey, launchId: item.launchId })));
  f.sessions.move('owner', 1, () => f.sessions.ownerInteraction(item.id, 'click'));
  assert.equal(f.sessions.items.get('owner').slot, 1); assert.equal(item.slot, 2);
});

test('production workers remain hidden until row 6 supplies a presentation adapter', async t => {
  const f = fixture(t, [{}, {}], { visible: false });
  await f.loop.runTask(f.job, 'mock-check');
  const item = f.sessions.items.get(f.job.workerSession.id);
  assert.equal(item.hidden, true); assert.equal(item.slot, null);
  assert.equal(f.sessions.layoutItems().length, 0); assert.equal(f.job.state, 'passed');
  assert.equal(f.bridge.placement, null);
});

test('restart classifies volatile queued and delivering steering as uncertain without replaying', t => {
  const f = fixture(t);
  f.job.state = 'needs-you';
  f.job.workerSteering = ['delivering', 'queued', 'uncertain', 'acknowledged'].map((status, index) =>
    ({ id: 'message-' + index, sequence: index + 1, sliceId: f.job.id, status }));
  f.loop.persist(f.job);
  const restored = new TaskLoop(f.root, { spawnProcess() { assert.fail('Restart must not launch a worker.'); },
    run() { assert.fail('Restart must not launch a process.'); } });
  t.after(() => restored.interruptAll());
  const loaded = restored.jobs.get(f.job.id);
  assert.deepEqual(loaded.workerSteering.map(event => event.status), ['uncertain', 'uncertain', 'uncertain', 'acknowledged']);
  const persisted = JSON.parse(fs.readFileSync(path.join(f.root, 'tasks', 'task.json'), 'utf8'));
  assert.deepEqual(persisted.workerSteering, loaded.workerSteering);
  const bridge = new WorkerSessions(f.sessions, restored);
  loaded.workerSteering.pop(); // The remaining uncertain events impose no dispatch gate.
  assert.equal(bridge.unconsumed(loaded), false); assert.equal(bridge.brief(loaded), '');
  assert.equal(loaded.state, 'needs-you');
});

test('reviewer stdin includes acknowledged steering and excludes uncertain and queued messages', async t => {
  const f = fixture(t, [{ inspect: call => {
    assert.match(call.prompt, /Acknowledged instruction/);
    assert.doesNotMatch(call.prompt, /Uncertain instruction|Still queued instruction/);
  }, output: JSON.stringify({ type: 'result', result: 'VERDICT: approve' }) + '\n' }]);
  const item = f.open();
  f.bridge.submit(f.payload(item, 'Uncertain instruction', 'uncertain'));
  f.bridge.acknowledge(f.job, f.bridge.take(f.job), false);
  f.bridge.submit(f.payload(item, 'Acknowledged instruction', 'acknowledged'));
  f.bridge.acknowledge(f.job, f.bridge.take(f.job), true);
  f.bridge.submit(f.payload(item, 'Still queued instruction', 'queued'));
  f.job.state = 'reviewing';
  f.loop.candidates = () => [{ id: 'reviewer', executable: 'mock-review', provider: 'claude', label: 'Review' }];
  const reply = await f.loop.provider(f.job, { accountId: 'reviewer', provider: 'claude', label: 'Review', startedAt: Date.now() }, 'Review this revision.', true);
  assert.equal(reply.verdict, 'approve'); assert.equal(f.spawned.length, 1);
});

test('worker summaries use progress redaction for environment values and echoed brief lines', async t => {
  const f = fixture(t, [{ output: JSON.stringify({ type: 'item.completed', item: { type: 'agent_message',
    text: 'Summary references plain-provider-value.\nPrivate acceptance criterion content.' } }) + '\n' }, {}]);
  f.loop.environment = () => ({ FAKE_PROVIDER_SECRET: 'plain-provider-value' });
  f.job.criteria = 'Private acceptance criterion content.';
  const packets = []; f.sessions.on('output', packet => packets.push(packet));
  await f.loop.runTask(f.job, 'mock-check');
  const item = f.sessions.items.get(f.job.workerSession.id);
  assert.match(item.buffer, /Summary references \[redacted\]/);
  assert.doesNotMatch(item.buffer, /plain-provider-value|Private acceptance criterion content/);
  assert.doesNotMatch(JSON.stringify(packets), /plain-provider-value|Private acceptance criterion content/);
});

test('desktop Stop in test mode never opens a modal', async t => {
  const f = fixture(t, [{ hold: true }]), running = f.loop.runTask(f.job, 'mock-check');
  await until(() => f.spawned.length === 1);
  const item = f.sessions.items.get(f.job.workerSession.id);
  await f.bridge.stopDesktop(f.payload(item), { testMode: true, confirm() { assert.fail('Headless tests cannot open a modal.'); } });
  await running;
  assert.equal(f.job.state, 'stopped'); assert.equal(f.spawned[0].child.killed, true);
});

test('desktop Stop confirms the named slice and revalidates its launch after the dialog', async t => {
  const f = fixture(t, [{ hold: true }]), running = f.loop.runTask(f.job, 'mock-check');
  await until(() => f.spawned.length === 1);
  const item = f.sessions.items.get(f.job.workerSession.id), old = f.payload(item);
  await assert.rejects(f.bridge.stopDesktop(old, { confirm: async named => {
    assert.equal(named.name, f.job.title); f.bridge.begin(f.job); return true;
  } }), /worker changed/);
  assert.equal(f.spawned[0].child.killed, undefined);
  assert.equal(await f.bridge.stopDesktop(f.payload(item), { confirm: async () => false }), false);
  assert.equal(f.spawned[0].child.killed, undefined);
  await f.bridge.stopDesktop(f.payload(item), { confirm: async () => true }); await running;
});

test('desktop and phone projections publish worker support and deny missing support', t => {
  const f = fixture(t), item = f.open();
  const mobile = { config: { host: '127.0.0.1', port: 1 }, name: 'Test', sessions: f.sessions,
    results: { unreadGroups: () => [], list: () => [] }, liveAlerts: [] };
  for (const support of [true, false, undefined]) {
    item.steeringSupported = support;
    const desktop = f.sessions.list().find(session => session.id === item.id);
    const phone = MobileCompanion.prototype.publicState.call(mobile).sessions.find(session => session.id === item.id);
    assert.equal(desktop.consoleCapabilities.steering, support === true);
    assert.equal(phone.consoleCapabilities.steering, support === true);
    assert.equal(phone.steeringSupported, support === true);
    assert.equal(desktop.consoleCapabilities.stopWorker, true); assert.equal(phone.consoleCapabilities.stopWorker, true);
  }
});
