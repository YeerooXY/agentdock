'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const { OwnerConsoles, ownerCapacity, RECENT_MS, HEARTBEAT_MS, PERSIST_MS } = require('../electron/owner-consoles.cjs');
const { atomicJson } = require('../electron/storage.cjs');
const { CapacityReservations } = require('../electron/capacity-reservations.cjs');
const { workerRegistry, routeWorker } = require('../electron/worker-registry.cjs');
const { TaskLoop } = require('../electron/task-loop.cjs');
const { Sessions } = require('../electron/sessions.cjs');
const { MessageQueue } = require('../electron/message-queue.cjs');

function fixture(t, ownerOptions = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-owner-'));
  let time = 2_000_000;
  const owners = new OwnerConsoles(root, { now: () => time, ...ownerOptions });
  const admission = new CapacityReservations(owners, { now: () => time });
  t.after(() => { admission.dispose(); owners.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
  const register = (key, extra = {}) => {
    owners.register({ consoleKey: key, launchId: `${key}-launch`, accountId: 'codex:a', projectId: 'project-a', ...extra });
    owners.heartbeat([{ consoleKey: key, launchId: `${key}-launch` }]);
  };
  const touch = (key, kind = 'click', flags = {}) => owners.interaction(key, `${key}-launch`, kind, { trusted: true, ...flags });
  const request = (id, extra = {}) => admission.acquire({ id, quotaGroupId: 'codex:a', projectId: 'project-a', automatic: true, ...extra });
  return { root, owners, admission, register, touch, request, advance: ms => { time += ms; }, now: () => time };
}

test('trusted interactions promote workers; output, hover, protocol and programmatic focus do not', t => {
  const f = fixture(t);
  f.register('auto');
  for (const kind of ['output', 'hover', 'protocol', 'queued-message', 'programmatic-focus']) assert.equal(f.touch('auto', kind), false);
  assert.equal(f.owners.interaction('auto', 'auto-launch', 'focus'), false);
  assert.equal(f.owners.isProtected('auto'), false);
  for (const kind of ['focus', 'click', 'typing', 'paste', 'scroll', 'selection', 'panel-control']) {
    f.touch('auto', kind); assert.equal(f.owners.isProtected('auto'), true);
    f.owners.release('auto', 'auto-launch');
  }
  assert.throws(() => f.owners.interaction('auto', 'old', 'typing', { trusted: true }), /console changed/);
});

test('owner-created consoles stay protected for their lifetime and completed workers retain promotion', t => {
  const f = fixture(t);
  f.register('owner', { ownerCreated: true }); f.register('worker'); f.touch('worker');
  f.advance(RECENT_MS + 1);
  f.owners.heartbeat([{ consoleKey: 'owner', launchId: 'owner-launch' }, { consoleKey: 'worker', launchId: 'worker-launch' }]);
  assert.equal(f.owners.isProtected('owner'), true); assert.equal(f.owners.isProtected('worker'), true);
  assert.equal(f.owners.reservations().size, 0);
  assert.throws(() => f.owners.release('owner', 'owner-launch'), /until closed/);
  f.owners.release('worker', 'worker-launch'); assert.equal(f.owners.isProtected('worker'), false);
  assert.throws(() => f.owners.close('owner', 'old'), /console changed/);
  f.owners.close('owner', 'owner-launch'); assert.equal(f.owners.records.has('owner'), false);
});

test('protection and reservation survive restart by stable key without saving draft text', t => {
  const f = fixture(t);
  f.register('worker'); f.touch('worker', 'typing', { draft: true, text: 'private draft' });
  const saved = fs.readFileSync(f.owners.file, 'utf8'); assert.ok(!saved.includes('private draft'));
  const restored = new OwnerConsoles(f.root, { now: f.now });
  restored.register({ consoleKey: 'worker', launchId: 'new-launch', projectId: 'project-b', accountId: 'codex:a' });
  assert.equal(restored.isProtected('worker'), true); assert.equal(restored.records.get('worker').activityKnown, false);
  assert.deepEqual([...restored.reservations()], ['codex:a']);
  assert.throws(() => restored.release('worker', 'worker-launch'), /console changed/);
});

test('freeze and missed heartbeats preserve reservations beyond recency expiry until reconciled', t => {
  const f = fixture(t);
  f.register('worker'); f.touch('worker');
  f.advance(HEARTBEAT_MS + 1);
  assert.deepEqual([...f.owners.reservations()], ['codex:a']);
  assert.equal(f.owners.records.get('worker').activityKnown, false);
  f.advance(RECENT_MS + 1);
  assert.deepEqual([...f.owners.reservations()], ['codex:a']);
  f.owners.heartbeat([{ consoleKey: 'worker', launchId: 'worker-launch', focused: false, selection: false, draft: false }]);
  assert.equal(f.owners.reservations().size, 0); assert.equal(f.owners.isProtected('worker'), true);
  f.register('auto'); f.owners.freeze(); assert.equal(f.owners.isProtected('auto'), true);
});

test('reconnection validates all identities and cannot promote or refresh recency', t => {
  const f = fixture(t); f.register('auto');
  f.owners.freeze();
  assert.throws(() => f.owners.heartbeat([{ consoleKey: 'auto', launchId: 'auto-launch' }, { consoleKey: 'missing', launchId: 'old' }]), /console changed/);
  assert.equal(f.owners.records.get('auto').activityKnown, false);
  f.owners.heartbeat([{ consoleKey: 'auto', launchId: 'auto-launch', focused: true, ownerTurn: true }]);
  assert.equal(f.owners.records.get('auto').ownerManaged, false);
  assert.equal(f.owners.records.get('auto').lastInteractionAt, null);
  assert.equal(f.owners.records.get('auto').ownerTurn, false);
});

test('recency-only writes are coalesced while protection and demand flags persist immediately', t => {
  const writes = [], timers = [];
  const f = fixture(t, {
    write: (file, saved) => { writes.push(JSON.parse(JSON.stringify(saved))); atomicJson(file, saved); },
    schedule: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    cancel: timer => { timer.cancelled = true; }
  });
  f.register('worker'); f.touch('worker', 'scroll');
  const initialWrites = writes.length, firstTouch = f.now();
  for (let i = 0; i < 100; i++) { f.advance(1); f.touch('worker', 'scroll'); }
  assert.equal(writes.length, initialWrites); assert.equal(timers.length, 1);
  assert.equal(f.owners.records.get('worker').lastInteractionAt, f.now());
  assert.equal(writes.at(-1).consoles[0].lastInteractionAt, firstTouch);
  f.owners.heartbeat([{ consoleKey: 'worker', launchId: 'worker-launch' }]);
  assert.equal(writes.length, initialWrites, 'an unchanged heartbeat cannot force a recency write');
  f.touch('worker', 'typing', { draft: true });
  assert.equal(writes.length, initialWrites + 1); assert.equal(writes.at(-1).consoles[0].draft, true);
  assert.equal(timers[0].cancelled, true);
  f.advance(1); f.touch('worker', 'scroll');
  const latestTouch = f.now(); f.advance(PERSIST_MS); timers.at(-1).callback();
  assert.equal(writes.length, initialWrites + 2);
  assert.equal(writes.at(-1).consoles[0].lastInteractionAt, latestTouch);
  f.advance(1); f.touch('worker', 'scroll'); f.owners.dispose();
  assert.equal(writes.at(-1).consoles[0].lastInteractionAt, f.now(), 'shutdown flushes pending recency');
});

test('a failed deferred save preserves in-memory protection and can be retried', t => {
  let timer;
  const f = fixture(t, { schedule: callback => { timer = { callback }; return timer; }, cancel() {} });
  f.register('worker'); f.touch('worker'); f.advance(1); f.touch('worker', 'scroll');
  let failures = 0; f.owners.on('persistence-error', () => { failures++; });
  f.owners.write = () => { throw new Error('mock disk failure'); };
  timer.callback();
  assert.equal(failures, 1); assert.equal(f.owners.isProtected('worker'), true);
  assert.equal(f.owners.records.get('worker').lastInteractionAt, f.now());
  f.owners.write = atomicJson; f.owners.flush();
  assert.equal(JSON.parse(fs.readFileSync(f.owners.file)).consoles[0].lastInteractionAt, f.now());
});

test('each demand flag reserves one lane; absence of demand releases capacity without releasing protection', t => {
  const f = fixture(t); f.register('owner', { ownerCreated: true });
  for (const flag of ['focused', 'draft', 'selection', 'pendingSubmission', 'ownerTurn']) {
    const record = f.owners.records.get('owner');
    f.owners.updateFlags(record, { [flag]: true }); record.reserved = f.owners.qualifies(record);
    assert.equal(f.owners.reservations().has('codex:a'), true, flag);
    f.owners.updateFlags(record, { [flag]: false }); record.reserved = f.owners.qualifies(record);
    assert.equal(f.owners.reservations().size, 0, flag);
  }
  f.touch('owner', 'scroll'); f.advance(RECENT_MS);
  f.owners.heartbeat([{ consoleKey: 'owner', launchId: 'owner-launch' }]);
  assert.equal(f.owners.reservations().size, 1);
  f.advance(1); assert.equal(f.owners.reservations().size, 0);
  assert.equal(f.owners.isProtected('owner'), true);
});

test('capacity counts an active owner lane once, across projects and launchers', () => {
  const reservations = new Set(['shared']);
  assert.equal(ownerCapacity({ quotaGroupId: 'shared', capacity: 1, reservations }), 'Reserved for owner');
  assert.equal(ownerCapacity({ quotaGroupId: 'shared', capacity: 2, reservations, active: [{ quotaGroupId: 'shared', owner: true }] }), null);
  assert.equal(ownerCapacity({ quotaGroupId: 'shared', capacity: 2, reservations, active: [{ quotaGroupId: 'shared', hidden: true }] }), 'Reserved for owner');
  assert.equal(ownerCapacity({ quotaGroupId: 'shared', capacity: 1, reservations, automatic: false }), null);
  assert.equal(ownerCapacity({ quotaGroupId: 'different', capacity: 1, reservations }), null);
});

test('admission resolves shared quota groups from worker definitions across launchers', async t => {
  const f = fixture(t);
  f.admission.workers = () => [{ id: 'codex', accountId: 'codex:a', quotaGroupId: 'shared', concurrency: 2 },
    { id: 'opencode', accountId: 'opencode:a', quotaGroupId: 'shared', concurrency: 1 }];
  const first = await f.admission.acquire({ id: 'first', accountId: 'codex:a', automatic: true });
  const second = f.admission.acquire({ id: 'second', accountId: 'opencode:a', automatic: true });
  assert.equal(f.admission.pending[0].quotaGroupId, 'shared');
  assert.equal(f.admission.pending[0].reason, 'Waiting for capacity');
  first(); (await second)();
});

test('partial activity snapshots protect omitted consoles and trusted focus replaces the previous focus', t => {
  const f = fixture(t); f.register('a'); f.register('b');
  f.touch('a', 'focus', { focused: true }); f.touch('b', 'focus', { focused: true });
  assert.equal(f.owners.records.get('a').focused, false);
  f.owners.heartbeat([{ consoleKey: 'b', launchId: 'b-launch' }]);
  assert.equal(f.owners.records.get('a').activityKnown, false); assert.equal(f.owners.isProtected('a'), true);
  assert.equal(f.owners.records.get('b').focused, true);
});

test('admission uses the oldest pending submission and rejects duplicate slots', async t => {
  const f = fixture(t); f.register('first', { ownerCreated: true }); f.register('second', { ownerCreated: true });
  f.touch('first', 'panel-control', { pendingSubmission: true }); f.advance(1);
  f.touch('second', 'panel-control', { pendingSubmission: true });
  const blocker = await f.request('block', { automatic: false });
  await assert.rejects(f.request('block'), /already has/);
  const started = [];
  const later = f.request('later', { consoleKey: 'second', automatic: false }).then(release => { started.push('second'); release(); });
  const earlier = f.request('earlier', { consoleKey: 'first', automatic: false }).then(release => { started.push('first'); release(); });
  blocker(); await Promise.all([later, earlier]); assert.deepEqual(started, ['first', 'second']);
});

test('disposing admission cancels pending work and starts no later request', async t => {
  const f = fixture(t), release = await f.request('running');
  const queued = f.request('queued');
  f.admission.dispose(); assert.equal(await queued, null);
  assert.equal(await f.request('late'), null);
  assert.equal(f.admission.active.size, 1); release(); assert.equal(f.admission.active.size, 0);
});

test('headless routing reserves shared-account capacity for the owner and keeps unknown usage visible', t => {
  const f = fixture(t);
  f.register('owner', { ownerCreated: true, quotaGroupId: 'shared' }); f.touch('owner');
  const workers = workerRegistry({ workers: ['codex', 'opencode'].map(launcher => ({ id: launcher, accountId: `${launcher}:a`,
    quotaGroupId: 'shared', launcher, model: 'gpt-6.1-terra', level: 'L2', roles: { builder: true, reviewer: true },
    canEdit: true, concurrency: 2, unknownAllowance: 1 })) });
  assert.equal(routeWorker({ workers, level: 'L2', owners: f.owners, now: f.now() }).reason, 'Reserved for owner');
  const limits = workers.map(w => ({ accountId: w.accountId, observedAt: f.now(), windows: [{ key: 'week', usedPercent: 30 }] }));
  const routed = routeWorker({ workers, level: 'L2', owners: f.owners, limits, now: f.now() });
  assert.equal(routed.capacity, 2); assert.equal(routed.usage.status, 'fresh');
  assert.equal(routeWorker({ workers, level: 'L2', owners: f.owners, limits, active: [{ quotaGroupId: 'shared', hidden: true }], now: f.now() }).reason, 'Reserved for owner');
  assert.equal(routeWorker({ workers, level: 'L2', owners: f.owners, limits, active: [{ quotaGroupId: 'shared' }, { quotaGroupId: 'shared' }], now: f.now() }).reason, 'Waiting for capacity');
});

test('two-project console priority puts focus before selection and drafts, and older owner work before automation', async t => {
  const f = fixture(t);
  for (const key of ['worker', 'other-owner', 'selection', 'draft', 'recent', 'old']) f.register(key, { ownerCreated: key === 'other-owner', projectId: key === 'other-owner' ? 'project-b' : 'project-a' });
  f.touch('old'); f.advance(RECENT_MS + 1);
  f.touch('worker', 'focus', { focused: true }); f.touch('other-owner', 'typing', { draft: true });
  f.touch('selection', 'selection', { selection: true }); f.touch('draft', 'typing', { draft: true }); f.touch('recent');
  f.admission.setResourcePressure(true);
  const blocker = await f.request('block', { automatic: false });
  const started = [], promises = [];
  for (const key of ['background', 'old', 'recent', 'other-owner', 'draft', 'selection', 'worker']) {
    promises.push(f.request(key, { automatic: key === 'background', consoleKey: key,
      projectId: key === 'other-owner' ? 'project-b' : 'project-a' }).then(release => {
      started.push(key);
      if (key === 'old') {
        f.advance(RECENT_MS + 1);
        f.owners.heartbeat(f.owners.snapshot().map(record => ({ ...record, focused: false, selection: false, draft: false })));
      }
      release();
    }));
  }
  blocker(); f.admission.setResourcePressure(false);
  await Promise.all(promises);
  assert.deepEqual(started, ['worker', 'selection', 'other-owner', 'draft', 'recent', 'old', 'background']);
});

test('pending submissions age within their tier and equal-time requests rotate projects', async t => {
  const f = fixture(t);
  const blocker = await f.request('block');
  const started = [], promises = [];
  for (const [id, projectId] of [['a1', 'a'], ['a2', 'a'], ['a3', 'a'], ['b1', 'b'], ['b2', 'b']]) {
    promises.push(f.request(id, { projectId }).then(release => { started.push(id); release(); }));
  }
  f.advance(1);
  promises.push(f.request('older-tier-later', { projectId: 'c' }).then(release => { started.push('later'); release(); }));
  blocker(); await Promise.all(promises);
  assert.deepEqual(started, ['a1', 'b1', 'a2', 'b2', 'a3', 'later']);
});

test('owner interaction wins pending admission, a frozen draft keeps it queued, and cancellation spawns nothing', async t => {
  const f = fixture(t); f.register('worker');
  const blocker = await f.request('block');
  let started = false;
  const queued = f.request('queued', { onQueued: reason => { if (reason) assert.match(reason, /capacity|Reserved/); } }).then(release => { started = !!release; });
  f.touch('worker', 'typing', { draft: true }); blocker();
  f.owners.freeze(); f.advance(RECENT_MS * 2); f.admission.drain();
  await Promise.resolve(); assert.equal(started, false);
  assert.equal(f.admission.pending[0].reason, 'Reserved for owner');
  f.admission.cancel(item => item.id === 'queued'); await queued; assert.equal(started, false);
});

test('existing turns finish under owner demand and pressure; hidden work counts and release is idempotent', async t => {
  const f = fixture(t); f.register('owner', { ownerCreated: true });
  const release = await f.request('running', { hidden: true });
  f.touch('owner'); f.admission.setResourcePressure(true);
  assert.equal(f.admission.active.size, 1);
  const queued = f.request('next'); release(); release();
  assert.equal(f.admission.active.size, 0); assert.equal(f.admission.pending.length, 1);
  f.admission.cancel(() => true); assert.equal(await queued, null);
});

test('local-model and Docker admission each allow one concurrent invocation across endpoints', async t => {
  const f = fixture(t);
  const local = await f.request('local', { local: true, quotaGroupId: 'endpoint-a' });
  const docker = await f.request('docker', { kind: 'docker' });
  const local2 = f.request('local2', { local: true, quotaGroupId: 'endpoint-b' });
  const docker2 = f.request('docker2', { kind: 'docker' });
  assert.equal(f.admission.pending.length, 2);
  local(); (await local2)(); docker(); (await docker2)();
  assert.equal(f.admission.active.size, 0);
});

test('Docker and anonymous admission never inherit an arbitrary worker profile', async t => {
  const f = fixture(t);
  f.admission.workers = () => [{ local: true, quotaGroupId: 'local', concurrency: 4 }];
  const profile = f.admission.profile({ kind: 'docker', workerId: 'local', accountId: 'local', local: true });
  assert.equal(profile.local, false); assert.equal(profile.capacity, 1);
  assert.equal(f.admission.profile({}).local, false);
  const docker = await f.request('docker', { kind: 'docker' });
  const local = await f.request('model', { local: true, quotaGroupId: 'local' });
  assert.equal(f.admission.active.get('docker').local, false);
  local(); docker();
});

test('owner demand at a different local endpoint reserves the machine-wide lane', async t => {
  const f = fixture(t);
  f.register('local-owner', { ownerCreated: true, quotaGroupId: 'endpoint-a', local: true }); f.touch('local-owner');
  const queued = f.request('local-worker', { quotaGroupId: 'endpoint-b', local: true });
  assert.equal(f.admission.pending[0].reason, 'Reserved for owner');
  f.admission.cancel(() => true); assert.equal(await queued, null);
});

test('session binding tracks owner turns and closure without touching layout, output or process lifecycle', t => {
  const f = fixture(t), sessions = new EventEmitter();
  sessions.items = new Map([['a', { id: 'a', consoleKey: 'key', launchId: 'launch', accountId: 'codex:a', state: 'active', alive: true, slot: 4, width: 2, projectId: 'project-b' }]]);
  const before = JSON.stringify([...sessions.items.values()]); f.owners.bind(sessions);
  const record = f.owners.records.get('key'); assert.equal(record.ownerCreated, true);
  f.owners.interaction('key', 'launch', 'typing', { trusted: true, ownerTurn: true });
  assert.equal(JSON.stringify([...sessions.items.values()]), before);
  sessions.items.get('a').state = 'ready'; sessions.emit('changed'); assert.equal(record.ownerTurn, false);
  sessions.items.get('a').alive = false; sessions.emit('changed'); assert.equal(f.owners.isProtected('key'), true);
  sessions.items.delete('a'); sessions.emit('changed'); assert.equal(f.owners.records.has('key'), false);
});

test('typed and pasted input count; terminal protocol reports and queued delivery do not refresh recency', async t => {
  const f = fixture(t);
  const sessions = new Sessions(f.root, { pty: { spawn() { assert.fail('No process launch'); } } });
  const writes = [];
  sessions.items.set('a', { id: 'a', consoleKey: 'key', launchId: 'launch', accountId: 'codex:a', purpose: 'agent', provider: 'codex', state: 'active', alive: true, terminal: { write: text => writes.push(text) } });
  f.owners.bind(sessions);
  sessions.write('a', '\x1b[I'); assert.equal(f.owners.records.get('key').lastInteractionAt, null);
  sessions.write('a', '\x1b[200~pasted text\x1b[201~');
  assert.equal(f.owners.records.get('key').lastInteractionAt, f.now());
  sessions.write('a', '\r'); assert.equal(f.owners.records.get('key').ownerTurn, true);
  const queue = new MessageQueue(sessions, { submitDelay: 0, wait: () => Promise.resolve() });
  const entry = queue.add('a', 'queued owner text', { ownerRequested: true }); const touched = f.owners.records.get('key').lastInteractionAt;
  f.advance(100); await queue.send('a', entry.id);
  assert.equal(f.owners.records.get('key').lastInteractionAt, touched);
  assert.equal(f.owners.records.get('key').pendingSubmission, false);
  assert.ok(writes.length > 0);
});

test('legacy worker queues cannot bypass steering or refresh owner recency', async t => {
  const f = fixture(t);
  const sessions = new Sessions(f.root, { pty: { spawn() { assert.fail('No process launch'); } } });
  sessions.items.set('a', { id: 'a', consoleKey: 'key', launchId: 'launch', taskId: 'task', accountId: 'codex:a', purpose: 'agent', provider: 'codex', state: 'active', alive: true, terminal: { write() {} } });
  f.owners.bind(sessions);
  f.owners.heartbeat([{ consoleKey: 'key', launchId: 'launch' }]);
  const queue = new MessageQueue(sessions, { submitDelay: 0, wait: () => Promise.resolve() });
  assert.throws(() => queue.add('a', 'automatic message'), /worker composer/);
  let record = f.owners.records.get('key');
  assert.equal(record.ownerManaged, false); assert.equal(record.lastInteractionAt, null);
  assert.equal(record.pendingSubmission, false); assert.equal(f.owners.reservations().size, 0);
  await assert.rejects(queue.send('a', 'old-entry'), /worker composer/);
  assert.equal(record.ownerTurn, false); assert.equal(record.lastInteractionAt, null);
  assert.throws(() => queue.add('a', 'owner submission', { ownerRequested: true }), /worker composer/);
  sessions.ownerInteraction('a', 'click');
  record = f.owners.records.get('key');
  assert.equal(record.ownerManaged, true); assert.equal(record.lastInteractionAt, f.now()); assert.equal(record.pendingSubmission, false);
  const touched = record.lastInteractionAt; f.advance(RECENT_MS + 1);
  f.owners.heartbeat([{ consoleKey: 'key', launchId: 'launch' }]);
  assert.throws(() => queue.add('a', 'background follow-up'), /worker composer/);
  assert.equal(record.lastInteractionAt, touched); assert.equal(record.ownerManaged, true);
  assert.equal(record.pendingSubmission, false); assert.equal(record.ownerTurn, false);
  assert.equal(f.owners.reservations().size, 0);
});

test('TaskLoop admission waits for owner capacity, persists reason and holds unconfirmed process slots', async t => {
  const f = fixture(t); f.register('owner', { ownerCreated: true }); f.touch('owner', 'typing', { draft: true });
  const loop = new TaskLoop(f.root, { admission: f.admission, spawnProcess: () => assert.fail('No process launch'), run: () => assert.fail('No Git') });
  const job = { id: 'job', state: 'implementing' }; loop.jobs.set(job.id, job);
  const pending = loop.acquireProvider(job, { accountId: 'codex:a' });
  assert.equal(job.queueReason, 'Reserved for owner');
  f.advance(RECENT_MS + 1);
  f.owners.heartbeat([{ consoleKey: 'owner', launchId: 'owner-launch', draft: false }]);
  const release = await pending; assert.equal(job.queueReason, undefined);
  const process = new EventEmitter(); loop.unconfirmed.set(job.id, process);
  release(); assert.equal(f.admission.active.size, 1);
  process.emit('close'); assert.equal(f.admission.active.size, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'tasks/job.json'))).queueReason, undefined);
});

test('TaskLoop cancellation returns a null grant and removes pending admission', async t => {
  const f = fixture(t), loop = new TaskLoop(f.root, { admission: f.admission, spawnProcess: () => assert.fail('No process launch'), run: () => assert.fail('No Git') });
  const blocker = await f.request('blocking');
  const job = { id: 'job', state: 'implementing' }; loop.jobs.set(job.id, job);
  const pending = loop.acquireProvider(job, { accountId: 'codex:a' });
  loop.cancelProviderQueue(job); assert.equal(await pending, null); blocker();
  assert.equal(f.admission.pending.length, 0);
  assert.equal(f.admission.active.size, 0);
});

test('cancelled and disposed admission cannot launch a provider while the task remains running', async t => {
  const f = fixture(t), loop = new TaskLoop(f.root, { admission: f.admission, spawnProcess: () => assert.fail('No process launch'), run: () => assert.fail('No Git') });
  const blocker = await f.request('blocking');
  const job = { id: 'job', state: 'implementing' }, step = { accountId: 'codex:a', provider: 'codex' };
  loop.jobs.set(job.id, job);
  loop.process = () => assert.fail('Denied admission must not dispatch');
  const pending = loop.provider(job, step, 'mock brief', false);
  loop.cancelProviderQueue(job); assert.deepEqual(await pending, {});
  f.admission.dispose(); assert.deepEqual(await loop.provider(job, step, 'mock brief', false), {});
  assert.equal(job.state, 'implementing'); blocker();
});

test('OpenCode fingerprints the admitted revision after waiting for capacity', async t => {
  const f = fixture(t), step = { accountId: 'codex:a', provider: 'opencode', label: 'OpenCode', model: 'opencode/mock' };
  const loop = new TaskLoop(f.root, { admission: f.admission, candidates: () => [{ id: step.accountId, executable: '/mock/opencode' }], spawnProcess: () => assert.fail('No process launch'), run: () => assert.fail('No Git') });
  const job = { id: 'job', state: 'implementing', workFolder: f.root }; loop.jobs.set(job.id, job);
  let revision = 'queued-revision'; const fingerprints = [];
  loop.fingerprint = async () => { fingerprints.push(revision); return revision; };
  loop.process = async () => ({ code: 0, openCode: { length: true, text: '', usage: null } });
  const blocker = await f.request('blocking');
  const pending = loop.provider(job, step, 'mock brief', false);
  assert.deepEqual(fingerprints, []);
  revision = 'admitted-revision'; blocker();
  await assert.rejects(pending, /output limit/);
  assert.deepEqual(fingerprints, ['admitted-revision', 'admitted-revision']);
  assert.equal(f.admission.active.size, 0);
});

test('isolated preload ignores synthetic focus and sends only trusted flags and current identities', () => {
  const ipc = new EventEmitter(), sent = [], listeners = new Map(); let loaded, heartbeat;
  ipc.send = (channel, payload) => sent.push({ channel, payload });
  const card = { dataset: { consoleId: 'a' } }, target = { closest: () => card };
  const context = { require: () => ({ contextBridge: { exposeInMainWorld() {} }, ipcRenderer: ipc }),
    window: { addEventListener: (_, callback) => { loaded = callback; }, getSelection: () => '' },
    document: { hasFocus: () => true, activeElement: target, addEventListener: (type, callback) => listeners.set(type, callback) },
    queueMicrotask, setInterval: callback => { heartbeat = callback; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../electron/preload.cjs'), 'utf8'), context);
  ipc.emit('dock:state', {}, { sessions: [{ id: 'a', consoleKey: 'key', launchId: 'launch' }] }); loaded();
  assert.equal(listeners.has('focusin'), false);
  listeners.get('keydown')({ isTrusted: false, type: 'keydown', key: 'x', target }); assert.equal(sent.length, 0);
  heartbeat(); assert.equal(sent.at(-1).payload.consoles[0].focused, false);
  listeners.get('keydown')({ isTrusted: true, type: 'keydown', key: 'x', target });
  const report = sent.at(-1).payload;
  assert.equal(report.consoleKey, 'key'); assert.equal(report.launchId, 'launch'); assert.equal(report.draft, true);
  assert.equal(report.focused, true); assert.ok(!JSON.stringify(report).includes('"key":"x"'));
});
