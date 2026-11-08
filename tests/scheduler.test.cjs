'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events');
const { Scheduler } = require('../electron/scheduler.cjs');
const { OwnerConsoles, AWAY_MS } = require('../electron/owner-consoles.cjs');
const { TaskLoop } = require('../electron/task-loop.cjs');
const { Delegation } = require('../electron/delegation.cjs');
const { LocalAssist } = require('../electron/local-assist.cjs');

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-scheduler-'));
  const scheduler = new Scheduler(root, options);
  t.after(() => { scheduler.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, scheduler };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const request = (id, extra = {}) => ({ id, accountId: id, ...extra });

test('global contention queues in order with position and releases each lease once', async t => {
  const { scheduler } = fixture(t, { getSettings: () => ({ maxParallelTasks: 1 }) });
  const first = await scheduler.acquire(request('first')), order = [];
  const second = scheduler.acquire(request('second')).then(release => { order.push('second'); return release; });
  const third = scheduler.acquire(request('third')).then(release => { order.push('third'); return release; });
  assert.deepEqual(scheduler.pending.map(item => [item.id, item.queuePosition]), [['second', 1], ['third', 2]]);
  assert.equal(scheduler.pending[0].reason, 'Waiting for a free slot (1 of 1 in use)');
  first(); const releaseSecond = await second; first();
  assert.deepEqual(order, ['second']); assert.equal(scheduler.active.size, 1);
  assert.equal(scheduler.jobs.get('third').queuePosition, 1);
  releaseSecond(); (await third)(); assert.deepEqual(order, ['second', 'third']);
  assert.equal(scheduler.active.size, 0);
  const reused = await scheduler.acquire(request('first')); first();
  assert.equal(scheduler.active.size, 1, 'an old release cannot release a new lease for the same job'); reused();
});

test('checkout leases are exclusive, independent of model capacity and recovered after a crash', async t => {
  const { root, scheduler } = fixture(t);
  const repository = path.join(root, 'repository');
  const first = await scheduler.acquire(request('checkout-a', { kind: 'checkout', repository, checkout: true }));
  const second = scheduler.acquire(request('checkout-b', { kind: 'checkout', repository, checkout: true }));
  const worktree = await scheduler.acquire(request('worktree', { repository }));
  assert.equal(scheduler.pending[0].reason, 'Waiting for checkout');
  first(); const next = await second; first(); assert.ok(scheduler.active.has('checkout-b'));
  const saved = fs.readFileSync(scheduler.file, 'utf8'); next(); worktree();
  fs.writeFileSync(scheduler.file, saved);
  const restored = new Scheduler(root); t.after(() => restored.dispose());
  assert.equal(restored.jobs.get('checkout-b').state, 'interrupted');
  const fresh = await restored.acquire(request('fresh-checkout', { kind: 'checkout', repository, checkout: true })); fresh();
});

test('overlapping file leases wait while disjoint subtask files run together', async t => {
  const { root, scheduler } = fixture(t);
  const sub = (id, owns) => request(id, { kind: 'subtask', taskId: 'parent', taskCapacity: 3, repository: root, owns });
  const a = await scheduler.acquire(sub('one', ['src/shared/**']));
  const waiting = scheduler.acquire(sub('two', ['src/shared/file.js']));
  const b = await scheduler.acquire(sub('three', ['tests/other.cjs']));
  assert.equal(scheduler.pending[0].reason, 'Waiting for files'); assert.equal(scheduler.active.size, 2);
  a(); const c = await waiting; a(); assert.equal(scheduler.active.size, 2); b(); c();
});

test('merge lanes allow independent target branches', async t => {
  const { root, scheduler } = fixture(t);
  const first = await scheduler.acquire(request('merge-main', { kind: 'merge-back', repository: root, target: 'main' }));
  const next = await scheduler.acquire(request('merge-release', { kind: 'merge-back', repository: root, target: 'release' }));
  assert.equal(scheduler.active.size, 2); first(); next();
});

test('a lingering subtask process keeps its file lease until confirmed closed', async t => {
  const { root, scheduler } = fixture(t);
  const loop = new TaskLoop(root, { admission: scheduler }); loop.changed = () => {};
  const child = new EventEmitter();
  const parent = { id: 'parent', repo: root, state: 'building', parallelLimit: 2, plan: { contracts: '' } };
  const sub = { id: 'lingering', workFolder: root, owns: ['shared.js'], implementer: {} };
  loop.split.assertBranch = async () => {};
  loop.runTask = async () => { sub.state = 'needs-you'; loop.unconfirmed.set(sub.id, child); };
  await loop.split.buildSubtask(parent, sub, '');
  const waiting = scheduler.acquire(request('next-file', { kind: 'subtask', taskId: 'parent', taskCapacity: 2, repository: root, owns: ['shared.js'] }));
  assert.equal(scheduler.pending[0].reason, 'Waiting for files');
  child.emit('close'); (await waiting)(); assert.equal(scheduler.active.size, 0);
});

test('account quota groups span launchers and unrelated accounts can run', async t => {
  const workers = () => [{ id: 'a', accountId: 'codex:a', quotaGroupId: 'shared', concurrency: 2 },
    { id: 'b', accountId: 'opencode:a', quotaGroupId: 'shared', concurrency: 1 }];
  const { scheduler } = fixture(t, { workers });
  const release = await scheduler.acquire(request('one', { workerId: 'a', accountId: 'codex:a' }));
  const waiting = scheduler.acquire(request('two', { workerId: 'b', accountId: 'opencode:a', accountLabel: 'Work account' }));
  const other = await scheduler.acquire(request('other'));
  assert.equal(scheduler.pending[0].reason, 'Waiting for Work account');
  assert.equal(scheduler.active.size, 2); release(); (await waiting)(); other();
});

test('owner reservations use the one hour away release and never preempt an active turn', async t => {
  let now = 10_000;
  const { root, scheduler } = fixture(t);
  const owners = new OwnerConsoles(root, { now: () => now }); t.after(() => owners.dispose());
  scheduler.owners = owners;
  owners.register({ consoleKey: 'owner', launchId: 'launch', accountId: 'account', ownerCreated: true });
  owners.heartbeat([{ consoleKey: 'owner', launchId: 'launch' }]);
  owners.interaction('owner', 'launch', 'focus', { trusted: true, focused: true });
  const waiting = scheduler.acquire(request('auto', { accountId: 'account', capacity: 1 }));
  assert.equal(scheduler.pending[0].reason, 'Reserved for owner');
  const ownerRelease = await scheduler.acquire(request('owner-turn', { accountId: 'account', capacity: 1, consoleKey: 'owner', automatic: false }));
  assert.equal(scheduler.active.get('owner-turn').owner, true);
  now += AWAY_MS + 1; scheduler.drain(); assert.equal(scheduler.pending.length, 1);
  ownerRelease(); (await waiting)(); assert.equal(scheduler.active.size, 0);
});

test('cancellation removes queued requests and process completion releases the active lease', async t => {
  const { scheduler } = fixture(t, { getSettings: () => ({ maxParallelTasks: 1 }) });
  const release = await scheduler.acquire(request('running'));
  const cancelled = scheduler.acquire(request('cancelled'));
  scheduler.cancel(item => item.id === 'cancelled'); assert.equal(await cancelled, null);
  assert.equal(scheduler.jobs.get('cancelled').state, 'cancelled');
  const next = scheduler.acquire(request('next')); release(); release(); (await next)();
  assert.equal(scheduler.active.size, 0);
});

test('BOM-tolerant restart drops stale leases and preserves interrupted queued requests without replay', async t => {
  const { root, scheduler } = fixture(t, { getSettings: () => ({ maxParallelTasks: 1 }) });
  await scheduler.acquire(request('running'));
  const waiting = scheduler.acquire(request('queued'));
  const file = scheduler.file, saved = fs.readFileSync(file, 'utf8');
  assert.ok(JSON.parse(saved).jobs[0].lease);
  scheduler.dispose(); await waiting; fs.writeFileSync(file, '\uFEFF' + saved);
  const restored = new Scheduler(root); t.after(() => restored.dispose());
  assert.equal(restored.active.size, 0); assert.equal(restored.pending.length, 0);
  assert.deepEqual(restored.snapshot().map(job => [job.state, job.lease]), [['interrupted', null], ['interrupted', null]]);
  const release = await restored.acquire(request('fresh')); release();
});

test('checks and Strata have independent single lanes shared across accounts', async t => {
  const { scheduler } = fixture(t);
  const local = await scheduler.acquire(request('local-a', { local: true }));
  const queuedLocal = scheduler.acquire(request('local-b', { local: true }));
  const checks = await scheduler.acquire(request('checks-a', { kind: 'checks' }));
  const queuedChecks = scheduler.acquire(request('checks-b', { kind: 'docker' }));
  assert.deepEqual(scheduler.pending.map(item => item.reason), ['Waiting for Strata', 'Waiting for checks']);
  local(); (await queuedLocal)(); checks(); (await queuedChecks)();
});

function mockCLI() {
  const calls = [];
  const spawnProcess = (...args) => {
    calls.push(args);
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = { on() {}, end() { queueMicrotask(() => {
      child.stdout.emit('data', JSON.stringify({ type: 'result', result: 'VERDICT: approve\nFINDINGS:\n- none' }) + '\n');
      child.emit('close', 0);
    }); } };
    return child;
  };
  return { calls, spawnProcess };
}
test('builder, reviewer, planner and split subtask turns wait for scheduler admission', async t => {
  const { root, scheduler } = fixture(t, { getSettings: () => ({ maxParallelTasks: 1 }) });
  const cli = mockCLI(), choice = { id: 'claude:a', provider: 'claude', label: 'Claude', executable: 'mock' };
  const loop = new TaskLoop(root, { admission: scheduler, getSettings: () => ({ maxParallelTasks: 1 }), candidates: () => [choice], spawnProcess: cli.spawnProcess });
  loop.changed = () => {};
  const parent = { id: 'parent', state: 'building', workFolder: root, branch: 'main', plan: { contracts: '' }, parallelLimit: 1, maxRounds: 1 };
  loop.jobs.set(parent.id, parent);
  for (const role of ['builder', 'reviewer', 'planner', 'subtask']) {
    const blocker = await scheduler.acquire(request('blocker'));
    const job = { id: role, state: 'implementing', workFolder: root, rounds: [], startedAt: Date.now(), subtaskId: role, implementer: choice };
    const step = { accountId: choice.id, provider: 'claude', label: 'Claude', role };
    let pending;
    if (role === 'subtask') {
      job.parentId = parent.id; loop.split.assertBranch = async () => {};
      loop.runTask = sub => loop.providerTurn(sub, step, 'Bounded work', false);
      pending = loop.split.buildSubtask(parent, job, '');
    } else pending = loop.providerTurn(job, step, 'Bounded work', role !== 'builder');
    await tick(); assert.equal(scheduler.pending.length, 1);
    assert.equal(cli.calls.length, ['builder', 'reviewer', 'planner', 'subtask'].indexOf(role));
    blocker(); await pending; assert.equal(scheduler.active.size, 0);
  }
});

test('cross-agent review and local assist use the same admission queue before provider calls', async t => {
  const { root, scheduler } = fixture(t, { getSettings: () => ({ maxParallelTasks: 1 }) });
  const cli = mockCLI(), folder = path.join(root, 'review'); fs.mkdirSync(folder);
  const delegation = new Delegation(root, { admission: scheduler, getSettings: () => ({}), candidates: () => [{ id: 'claude:a', executable: 'mock' }], environment: () => ({}), spawnProcess: cli.spawnProcess });
  const blocker = await scheduler.acquire(request('blocker'));
  const job = { id: 'review', state: 'running', reviewer: { accountId: 'claude:a', provider: 'claude', label: 'Claude' }, cwd: root, waiters: [], log: [] };
  delegation.jobs.set(job.id, job);
  const review = delegation.run_(job, { brief: 'Review', outFile: path.join(folder, 'reply'), folder });
  let fetches = 0;
  const local = new LocalAssist({ admission: scheduler, getProfiles: () => [{ id: 'strata', protocol: 'chat', url: 'http://127.0.0.1:8080/v1/chat/completions', keyId: '' }],
    fetcher: async url => { fetches++; return { ok: true, json: async () => url.endsWith('/models') ? { data: [{ id: 'local' }] } : { choices: [{ finish_reason: 'stop', message: { content: 'Done' } }] } }; } });
  const assist = local.run({ requestId: 'one', purpose: 'extract', prompt: 'Facts' });
  assert.equal(cli.calls.length, 0); assert.equal(fetches, 0);
  assert.equal(job.queuePosition, 1); assert.equal(scheduler.pending[1].queuePosition, 2);
  blocker(); await review; await assist; await tick();
  assert.equal(cli.calls.length, 1); assert.equal(fetches, 2); assert.equal(job.state, 'done');
  assert.equal(scheduler.active.size, 0);
});

test('task checks wait for their scheduler lane and release it on completion', async t => {
  const { root, scheduler } = fixture(t), cli = mockCLI();
  const loop = new TaskLoop(root, { admission: scheduler, spawnProcess: cli.spawnProcess }); loop.changed = () => {};
  const blocker = await scheduler.acquire(request('checks-block', { kind: 'checks' }));
  const pending = loop.process({ id: 'task', state: 'checking', workFolder: root }, { executable: 'mock', args: [] }, { check: true, environment: {}, step: { startedAt: Date.now() } });
  await tick(); assert.equal(cli.calls.length, 0); blocker(); await pending;
  assert.equal(cli.calls.length, 1); assert.equal(scheduler.active.size, 0);
});


test('failed persistence never grants a process slot and a failed release can be retried', async t => {
  const { scheduler } = fixture(t);
  const persist = scheduler.persist.bind(scheduler);
  scheduler.persist = () => { throw Error('Storage unavailable'); };
  await assert.rejects(scheduler.acquire(request('blocked')), /Storage unavailable/);
  assert.equal(scheduler.active.size, 0); assert.equal(scheduler.pending.length, 0);
  scheduler.persist = persist;
  const release = await scheduler.acquire(request('running'));
  scheduler.persist = () => { throw Error('Storage unavailable'); };
  assert.throws(release, /Storage unavailable/); assert.equal(scheduler.active.size, 1);
  scheduler.persist = persist; release(); assert.equal(scheduler.active.size, 0);
});

test('stopping an active task closes its mock provider and releases admission', async t => {
  const { root, scheduler } = fixture(t);
  let child;
  const loop = new TaskLoop(root, { admission: scheduler,
    candidates: () => [{ id: 'claude:a', executable: 'mock' }],
    killProcess: process => process.emit('close', null),
    spawnProcess: () => {
      child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = { on() {}, end() {} }; return child;
    } });
  loop.changed = () => {}; loop.finalize = async () => {};
  const job = { id: 'cancel-task', state: 'implementing', workFolder: root, rounds: [], unresolved: [] };
  loop.jobs.set(job.id, job);
  const turn = loop.providerTurn(job, { provider: 'claude', accountId: 'claude:a', label: 'Claude' }, 'Work', false);
  await tick(); assert.ok(child); assert.equal(scheduler.active.size, 1);
  await loop.stop(job.id); await turn;
  assert.equal(job.state, 'stopped'); assert.equal(scheduler.active.size, 0);
});


test('five model turns belong to each project and unspecified account caps do not recreate one slot', () => {
  const { admissionReason, resourceProfile } = require('../electron/scheduler.cjs');
  const active = Array.from({ length: 5 }, (_, i) => ({ id: String(i), kind: 'model', projectId: 'first', quotaGroupId: 'same' }));
  const second = resourceProfile({ kind: 'model', projectId: 'second', accountId: 'same' });
  assert.equal(admissionReason(second, active), null);
  assert.match(admissionReason({ ...second, projectId: 'first' }, active), /free slot/);
  assert.equal(admissionReason({ ...second, capacity: 1 }, active), 'Waiting for same');
});
