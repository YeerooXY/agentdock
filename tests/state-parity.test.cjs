'use strict';
// Protocol 2 parity (A5). A recorded sequence of service snapshots is written
// to the store the way electron/main.cjs does on publish. After every step:
//   desktop: the snapshot rebuilt by src/state-client.js from v2 changes equals
//            the legacy snapshot (and the services' own snapshot);
//   phone:   the v1 map rebuilt from phone slices and extras covers the v1
//            payload that /v1/events sends.
// Includes resync, resume after a lost batch and a restart with a new epoch.
// No network, no model requests.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../electron/state-protocol.cjs');
const { StateStore, jsonEqual } = require('../electron/state-store.cjs');
const J = require('../electron/projections.cjs');
const { ProjectionHistory, StateConnection } = require('../electron/state-sync.cjs');
const { MobileCompanion } = require('../electron/mobile.cjs');
const { consoleCapabilities } = require('../electron/worker-placement.cjs');

const loadClient = () => import('../src/state-client.js');
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const EXTRA_FIELDS = ['connection', 'previews', 'projects', 'imageJobs', 'imageJobsRunning', 'capabilities', 'alerts', 'unreadResults', 'resultVersion'];

// sessions.list() computes consoleCapabilities; the recorded sessions do the same.
const session = fields => ({ ...fields, consoleCapabilities: consoleCapabilities(fields, undefined, false) });
function base() {
  return {
    platform: 'win32', mode: 'dashboard', transitioning: false, trayHidden: false,
    sessions: [session({ id: 's1', slot: 1, name: 'Codex', provider: 'codex', alive: true, state: 'active', cols: 120, rows: 30, launchId: 'l1', consoleKey: 'k1',
      model: 'GPT-6', modelId: 'gpt-6', effort: 'high', accountId: 'codex:default', accountLabel: 'Codex', switchTargets: [{ id: 'codex:work', label: 'Work', ready: true }] })],
    codePanels: [{ id: 'w1', kind: 'web', name: 'Preview', url: 'http://localhost:5173', state: 'open' }], queues: { s1: { paused: false, entries: [{ id: 'q1', text: 'next', createdAt: 3, ownerRequested: false }] } },
    prompts: [{ id: 'pr1', name: 'Review', text: 'Review this', projectId: null, updatedAt: 2 }], codeRevision: 3,
    limits: [{ provider: 'codex', accountId: 'codex:default', observedAt: 5, windows: [{ key: 'w', label: '5 hours', usedPercent: 10, resetsAt: 9 }] }],
    accounts: [{ id: 'codex:default', provider: 'codex', label: 'Codex' }], accountProviders: [{ id: 'codex', label: 'Codex', loginInstruction: '' }],
    recent: [{ id: 'r1', title: 'Chat' }], accountError: null, refreshing: false, lastRefresh: 4,
    agents: [{ id: 'codex', name: 'Codex', installed: true }], agentSetupBusy: false, skills: { packs: [{ id: 'k', name: 'Pack' }], busy: false },
    usageAccounts: [{ id: 'codex:default', provider: 'codex', label: 'Codex', hasUsage: true, inUse: true }], usageChecks: [{ accountId: 'codex:default', status: 'current', observedAt: 5 }],
    delegations: [{ id: 'd1', state: 'done', log: [] }], tasks: [{ id: 't1', title: 'Task', state: 'done', rounds: [] }],
    sshHosts: [{ id: '00000000-0000-4000-8000-000000000000', name: 'box' }], capabilities: { codex: true },
    projects: [{ id: 'p1', name: 'P', status: 'active', color: '#47c', progress: { done: 0, total: 1 } }, { id: 'p2', name: 'Old', status: 'archived' }],
    projectProposals: [{ id: 'pp1', name: 'Idea' }], messages: [{ at: 1, tokens: 3 }],
    mobile: { enabled: true, devices: [{ id: 'dev', name: 'Phone', connected: false }], pendingPairing: { id: 'pp', name: 'Phone', code: '123456', expires: 9, state: 'pending' } },
    workbench: { results: [{ id: 'res1', title: 'R', seenAt: null }], unreadResults: 1, concepts: [], conceptUsage: {}, meshyAuth: { state: 'waiting', code: 'ABCD-EFGH', url: 'https://example.test/device' }, setupRequests: [] },
    vault: { available: true, entries: [{ id: 'openai', provider: 'openai', label: 'OpenAI', savedAt: 1 }] },
    ledger: [{ id: 'l1', cost: 0.1 }], summary: { total: 0.1 }, shared: { instructions: 'Hi', connections: [] }, updates: { state: 'idle' },
    grid: { columns: 3, rows: 2 }, settings: { notifications: true, routing: {} }, storageError: null, workspaceError: null, shortcutAvailable: true, safeMode: false, startupNotices: [],
    integrations: [], toolCatalog: [], toolLimits: {}, defaultFolder: 'C:/Users/me', version: '0.6.0', screenshot: null,
  };
}
// Recorded publishes after the initial one. Each returns the next services snapshot.
const STEPS = [
  ['a console turns ready and a remote console opens', raw => ({ ...raw, sessions: [{ ...raw.sessions[0], state: 'ready', updatedAt: 6 },
    session({ id: 's2', slot: 2, name: 'Box', provider: 'shell', alive: true, state: 'active', cols: 80, rows: 24, launchId: 'l2', consoleKey: 'k2',
      remote: { hostId: 'h1', name: 'box', folder: '/srv/app', tmux: true }, requestedSettings: { model: 'm1', resolvedModel: 'm1', effort: null, at: 3, status: 'awaiting-provider' } })] })],
  ['a console closes; a prompt and the queue change', raw => ({ ...raw, sessions: raw.sessions.filter(item => item.id !== 's1'),
    prompts: [{ ...raw.prompts[0], text: 'Review again', updatedAt: 8 }, { id: 'pr2', name: 'Ship', text: 'Ship it', projectId: 'p1', updatedAt: 9 }],
    queues: { s2: { paused: true, entries: [{ id: 'q2', text: 'later', createdAt: 9, ownerRequested: true }] } } })],
  ['pairing and device codes change', raw => ({ ...raw, mobile: { ...raw.mobile, pendingPairing: { id: 'pp2', name: 'Phone 2', code: '654321', expires: 12, state: 'pending' } },
    workbench: { ...raw.workbench, meshyAuth: { state: 'waiting', code: 'WXYZ-1234', url: 'https://example.test/device' } } })],
  ['settings, results, tasks and order change', raw => ({ ...raw, settings: { notifications: false, routing: {} },
    sessions: [session({ id: 's3', slot: 1, name: 'Claude', provider: 'claude', alive: true, state: 'active', cols: 100, rows: 30, launchId: 'l3', consoleKey: 'k3' }), ...raw.sessions],
    tasks: [{ id: 't2', title: 'Next', state: 'running', rounds: [{}] }, ...raw.tasks],
    workbench: { ...raw.workbench, unreadResults: 0, results: [...raw.workbench.results, { id: 'res2', title: 'S', seenAt: 4 }] } })],
  ['everything empties', raw => ({ ...raw, sessions: [], prompts: [], tasks: [], projects: [], queues: {}, codePanels: [],
    mobile: { enabled: true, devices: [] }, workbench: { ...raw.workbench, meshyAuth: { state: 'signed-in' }, results: [] } })],
];

function environment(epoch) {
  const store = new StateStore({ epoch, schedule: () => {} });
  const writers = Object.fromEntries(Object.entries(P.SLICES).map(([slice, { writer }]) => [slice, store.claim(slice, writer)]));
  const desktop = J.desktopProjection(store), phone = J.phoneProjection(store);
  return { store, writers, desktop, phone, desktopHistory: new ProjectionHistory(desktop), phoneHistory: new ProjectionHistory(phone) };
}
// What publish() does in electron/main.cjs: one transaction, one commit.
function publish(env, raw) {
  const values = J.slicesFromLegacy(raw);
  env.store.transaction(() => { for (const [slice, value] of Object.entries(values)) env.writers[slice].set(value); });
  env.store.commit();
}

// The renderer client over an IPC-like connection (structured clones, no framing).
function desktopWire(S, env, current, { drop = () => false } = {}) {
  const handlers = new Set(), snapshots = [], fallbacks = [];
  let connection;
  const open = target => {
    connection?.dispose();
    connection = new StateConnection({ history: target.desktopHistory, view: 'desktop', transport: 'ipc',
      write: message => { if (drop(message)) return; const copy = structuredClone(message); for (const handler of [...handlers]) handler(copy); } });
  };
  open(env);
  const transport = { send: async message => { connection.receive(structuredClone(message)); return true; }, onMessage: fn => { handlers.add(fn); return () => handlers.delete(fn); } };
  const read = async method => {
    const raw = current();
    if (method === 'mobile.status') return clone(raw.mobile);
    if (method === 'meshy.auth') return clone(raw.workbench?.meshyAuth);
    throw new Error(`Unexpected read: ${method}`);
  };
  const feed = S.connectStateV2({ transport, read, onSnapshot: value => snapshots.push(value), onFallback: error => fallbacks.push(error) });
  return { feed, snapshots, fallbacks, handlers, open, last: () => snapshots.at(-1) };
}
function assertDesktop(wire, env, raw, label) {
  const built = wire.last();
  assert.ok(built, `${label}: no snapshot yet`);
  const legacy = J.legacySnapshot(env.desktop.state(), J.ephemeralFromLegacy(raw));
  const differs = value => Object.keys(raw).filter(key => !jsonEqual(value[key], raw[key]));
  assert.ok(jsonEqual(legacy, raw), `${label}: legacy adapter differs in ${differs(legacy).join(', ')}`);
  assert.ok(jsonEqual(built, raw), `${label}: v2 snapshot differs in ${differs(built).join(', ')}`);
  assert.deepEqual(Object.keys(built), Object.keys(raw), `${label}: field order`);
}

test('the renderer subscribes to every desktop slice the snapshot reads', async () => {
  const S = await loadClient();
  assert.deepEqual([...S.DESKTOP_SLICES].sort(), P.SLICE_NAMES.filter(slice => slice !== 'alerts').sort());
  const env = environment('epoch-a');
  publish(env, base());
  assert.ok(jsonEqual(S.snapshotFromSlices(clone(env.desktop.state()), J.ephemeralFromLegacy(base())), J.legacySnapshot(env.desktop.state(), J.ephemeralFromLegacy(base()))));
});

test('protocol changes pass known slices without reserializing broad legacy state', async () => {
  const S = await loadClient(), client = S.createStateClient();
  client.setLegacy({ sessions: [{ id: 'one' }], usageHistory: Array.from({ length: 100 }, (_, id) => ({ id })) });
  const original = JSON.stringify;
  JSON.stringify = () => { throw new Error('unexpected deep comparison'); };
  try { assert.deepEqual(client.setLegacy({ sessions: [{ id: 'two' }], usageHistory: [{ id: 0 }] }, ['sessions']), ['sessions']); }
  finally { JSON.stringify = original; }
  assert.equal(client.get().sessions[0].id, 'two');
});

test('desktop: v2 changes rebuild the legacy snapshot after every recorded publish', async () => {
  const S = await loadClient();
  const env = environment('epoch-a');
  let raw = base();
  publish(env, raw);
  const wire = desktopWire(S, env, () => raw);
  await settle();
  assertDesktop(wire, env, raw, 'initial reset');
  const first = wire.snapshots.length;
  for (const [label, step] of STEPS) {
    raw = step(raw);
    publish(env, raw);
    await settle();
    assertDesktop(wire, env, raw, label);
  }
  assert.ok(wire.snapshots.length > first, 'changes produced snapshots');
  // A publish that changes nothing sends nothing.
  const count = wire.snapshots.length;
  publish(env, raw); await settle();
  assert.equal(wire.snapshots.length, count);
  assert.deepEqual(wire.fallbacks, []);
});

test('desktop: a rejected batch resyncs, a lost batch resumes and a restart resets', async () => {
  const S = await loadClient();
  let env = environment('epoch-a'), raw = base(), dropping = false;
  publish(env, raw);
  const wire = desktopWire(S, env, () => raw, { drop: message => dropping && message.type === 'changes' });
  await settle();
  assertDesktop(wire, env, raw, 'initial');

  // A batch whose base revision does not match is rejected whole; the client
  // asks for those slices again and the reset puts it back in step.
  const client = wire.feed.state();
  for (const handler of [...wire.handlers]) handler({ type: 'changes', epoch: client.epoch, subscription: client.subscription, batch: client.lastBatch + 1,
    changes: [{ kind: 'replace', slice: 'preferences', baseRev: 999, rev: 1000, value: { notifications: 'wrong' } }] });
  await settle();
  assertDesktop(wire, env, raw, 'after resync');

  // Lost batches: the client misses two publishes, then resumes from its cursor.
  dropping = true;
  raw = STEPS[0][1](raw); publish(env, raw); await settle();
  raw = STEPS[1][1](raw); publish(env, raw); await settle();
  assert.ok(!jsonEqual(wire.last(), raw), 'the dropped batch did not arrive');
  dropping = false;
  wire.feed.resume(); await settle();
  assertDesktop(wire, env, raw, 'after resume');

  // The main process restarts: a new epoch drops the cache and resets every slice.
  raw = STEPS[2][1](raw);
  env = environment('epoch-b'); publish(env, raw);
  wire.open(env); wire.feed.resume(); await settle();
  assertDesktop(wire, env, raw, 'after restart');
  raw = STEPS[3][1](raw); publish(env, raw); await settle();
  assertDesktop(wire, env, raw, 'after restart, next publish');
  assert.deepEqual(wire.fallbacks, []);
});

test('desktop: a failed subscription falls back once and stops', async () => {
  const S = await loadClient();
  const fallbacks = [], off = [];
  const feed = S.connectStateV2({ transport: { send: () => Promise.reject(new Error('State protocol 2 is off.')), onMessage: () => () => off.push(true) },
    onSnapshot: () => assert.fail('no snapshot'), onFallback: error => fallbacks.push(error.message) });
  await settle();
  assert.deepEqual(fallbacks, ['State protocol 2 is off.']);
  assert.equal(off.length, 1);
  assert.equal(feed.stopped, true);
  feed.resume(); await settle();
  assert.equal(fallbacks.length, 1);
});

// ---- Phone ---------------------------------------------------------------
// The v1 payload comes from MobileCompanion.publicState over fake services fed
// by the same snapshot; nothing is opened or listened on.
function fakeMobile(current) {
  const mobile = Object.create(MobileCompanion.prototype);
  Object.assign(mobile, { config: { host: '100.64.0.1', port: 47831, name: 'PC' }, liveAlerts: [], concepts: null, toolsStatus: true,
    stateSync: { enabled: () => true },
    sessions: { list: () => clone(current().sessions), codePanels: () => clone(current().codePanels), get grid() { return current().grid; }, projects: { list: () => clone(current().projects) } },
    queue: { snapshot: () => clone(current().queues) }, prompts: { list: () => clone(current().prompts) },
    results: { unreadGroups: () => current().workbench?.unreadResults ?? 0, list: () => current().workbench?.results || [] } });
  return mobile;
}
// The rebuilt map may carry more (v2-only fields, nulls for absent ones); every
// v1 value must be there unchanged.
function covers(expected, actual, path) {
  if (expected === undefined || expected === null) { assert.ok(actual === undefined || actual === null, `${path}: expected nothing, got ${JSON.stringify(actual)}`); return; }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: expected a list`);
    assert.equal(actual.length, expected.length, `${path}: length`);
    expected.forEach((item, index) => covers(item, actual[index], `${path}[${index}]`)); return;
  }
  if (typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object', `${path}: expected an object`);
    for (const [key, value] of Object.entries(expected)) covers(value, actual[key], `${path}.${key}`); return;
  }
  assert.equal(actual, expected, path);
}
function phoneWire(env) {
  let client = P.initialClientState('phone'), connection;
  const outcomes = [];
  const open = target => {
    connection?.dispose();
    connection = new StateConnection({ history: target.phoneHistory, view: 'phone', transport: 'ipc', write: message => {
      const result = P.applyServerMessage(client, structuredClone(message)); client = result.state; outcomes.push(result.outcome);
      if (result.outcome === 'applied' || result.outcome === 'duplicate') connection.receive({ type: 'ack', subscription: client.subscription, batch: result.batch });
      if (result.outcome === 'resync') connection.receive({ type: 'resync', subscription: client.subscription, slices: result.slices });
    } });
  };
  const hello = resume => connection.receive({ type: 'hello', protocol: 2, lastRev: resume && client.epoch ? { epoch: client.epoch, revs: { ...client.revs } } : null, slices: Object.keys(P.PHONE_SLICES), compression: ['none'] });
  open(env); hello(false);
  return { open, hello, outcomes, values: () => client.values };
}
function assertPhone(wire, mobile, label) {
  const v1 = clone(mobile.publicState());
  const extras = clone(Object.fromEntries(EXTRA_FIELDS.map(key => [key, mobile.extrasState()[key]])));
  const rebuilt = J.phoneLegacyState(clone(wire.values()), extras);
  assert.deepEqual(v1.agentProfiles, require('../electron/providers/index.cjs').screenProfiles, `${label}: v1 served profiles`);
  assert.deepEqual(rebuilt.agentProfiles, v1.agentProfiles, `${label}: profile parity`);
  for (const key of Object.keys(v1)) covers(v1[key], rebuilt[key], `${label}: ${key}`);
  assert.ok(Array.isArray(rebuilt.tasks) && Array.isArray(rebuilt.usage), `${label}: v2-only lists`);
  assert.deepEqual(Object.keys(extras), EXTRA_FIELDS);
  assert.ok(extras.capabilities.includes('state.v2'));
  assert.ok(!JSON.stringify(rebuilt).includes('123456') && !JSON.stringify(rebuilt).includes('ABCD-EFGH'), `${label}: no codes`);
}

test('phone: v2 slices and extras rebuild the v1 payload after every recorded publish', async () => {
  const env = environment('epoch-a');
  let raw = base();
  publish(env, raw);
  const mobile = fakeMobile(() => raw), wire = phoneWire(env);
  await settle();
  assertPhone(wire, mobile, 'initial reset');
  for (const [label, step] of STEPS) {
    raw = step(raw); publish(env, raw); await settle();
    assertPhone(wire, mobile, label);
  }
  assert.ok(!wire.outcomes.includes('reconnect'));
});

test('phone: resume after a dropped socket and a restart keep the v1 payload', async () => {
  let env = environment('epoch-a'), raw = base();
  publish(env, raw);
  const mobile = fakeMobile(() => raw), wire = phoneWire(env);
  await settle();
  // The socket drops; two publishes happen; a new socket resumes from the cursor.
  raw = STEPS[0][1](raw); publish(env, raw);
  raw = STEPS[1][1](raw); publish(env, raw);
  wire.open(env); wire.hello(true); await settle();
  assertPhone(wire, mobile, 'after resume');
  // The PC restarts with a new epoch.
  raw = STEPS[3][1](raw);
  env = environment('epoch-b'); publish(env, raw);
  wire.open(env); wire.hello(true); await settle();
  assertPhone(wire, mobile, 'after restart');
});

test('phone sessions carry the v1 fields the app reads', () => {
  const item = session({ id: 's9', slot: 3, name: 'Box', provider: 'shell', alive: true, state: 'ready', remote: { hostId: 'h', name: 'box', folder: '/srv', tmux: false },
    requestedSettings: { model: 'm', resolvedModel: 'm-1', effort: 'low', at: 1, status: 'awaiting-provider' } });
  const dto = J.phoneSession(item);
  assert.deepEqual(dto.remote, { hostId: 'h', name: 'box', folder: '/srv', tmux: false });
  assert.deepEqual(dto.requestedSettings, item.requestedSettings);
  assert.equal(dto.completionMissing, false);
  assert.equal(J.phoneSession({ ...item, completionMissing: true }).completionMissing, true);
  assert.deepEqual(J.PHONE.queues.build({ queues: { s9: { paused: false, entries: [{ id: 'q', text: 't', createdAt: 1, ownerRequested: true, extra: 'x' }] } } }),
    { s9: { paused: false, entries: [{ id: 'q', text: 't', createdAt: 1, ownerRequested: true }] } });
});
