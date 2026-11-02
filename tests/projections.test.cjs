'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const P = require('../electron/state-protocol.cjs');
const { StateStore, jsonEqual } = require('../electron/state-store.cjs');
const J = require('../electron/projections.cjs');
const dto = name => require(path.join(__dirname, 'fixtures', 'state', 'dto', name));

function setup() {
  const store = new StateStore({ epoch: 'e1', schedule: () => {} });
  const writers = Object.fromEntries(Object.entries(P.SLICES).map(([slice, { writer }]) => [slice, store.claim(slice, writer)]));
  return { store, writers, desktop: J.desktopProjection(store), phone: J.phoneProjection(store) };
}
// Shape of today's snapshot() in electron/main.cjs, with private display codes.
function legacy() {
  return {
    platform: 'win32', mode: 'dashboard', transitioning: false, trayHidden: false,
    sessions: [{ id: 's1', slot: 1, name: 'Codex', provider: 'codex', alive: true, state: 'active', launchId: 'l1', consoleKey: 'k1', consoleCapabilities: { input: true } }],
    codePanels: [{ id: 'w1', kind: 'web', name: 'Preview' }], queues: { s1: { paused: false, entries: [{ id: 'q1', text: 'next' }] } },
    prompts: [{ id: 'pr1', name: 'Review', text: 'Review this', projectId: null }], codeRevision: 3,
    limits: [{ provider: 'codex', accountId: 'codex:default', observedAt: 5, windows: [{ key: 'w', label: '5 hours', usedPercent: 10, resetsAt: 9 }] }],
    accounts: [{ id: 'codex:default', provider: 'codex', label: 'Codex' }], accountProviders: [{ id: 'codex', label: 'Codex', loginInstruction: '' }],
    recent: [{ id: 'r1', title: 'Chat' }], accountError: null, refreshing: false, lastRefresh: 4,
    agents: [{ id: 'codex', name: 'Codex', installed: true }], agentSetupBusy: false, skills: { packs: [{ id: 'k', name: 'Pack' }], busy: false },
    usageAccounts: [{ id: 'codex:default', provider: 'codex', label: 'Codex', hasUsage: true, inUse: true }], usageChecks: [{ accountId: 'codex:default', status: 'current', observedAt: 5 }],
    delegations: [{ id: 'd1', state: 'done', log: [] }], tasks: [{ id: 't1', title: 'Task', state: 'done', rounds: [] }],
    sshHosts: [{ id: '00000000-0000-4000-8000-000000000000', name: 'box' }], capabilities: { codex: true }, projects: [{ id: 'p1', name: 'P', status: 'active', progress: { done: 0, total: 1 } }, { id: 'p2', name: 'Old', status: 'archived' }],
    projectProposals: [{ id: 'pp1', name: 'Idea' }], messages: [{ at: 1, tokens: 3 }],
    mobile: { enabled: true, devices: [{ id: 'dev', name: 'Phone', connected: false }], pendingPairing: { id: 'pp', name: 'Phone', code: '123456', expires: 9, state: 'pending' } },
    workbench: { results: [{ id: 'res1', title: 'R', seenAt: null }], unreadResults: 1, concepts: [], conceptUsage: {}, meshyAuth: { state: 'waiting', code: 'ABCD-EFGH', url: 'https://example.test/device' }, setupRequests: [{ id: 'sr1', kind: 'tool', config: { id: 'x' } }] },
    vault: { available: true, entries: [{ id: 'openai', provider: 'openai', label: 'OpenAI', savedAt: 1 }] },
    ledger: [{ id: 'l1', cost: 0.1 }], summary: { total: 0.1 }, shared: { instructions: 'Hi', connections: [{ id: 'c', envKeys: { API: { key: 'openai', prefix: '' } } }] }, updates: { state: 'idle' },
    grid: { columns: 3, rows: 2 }, settings: { notifications: true, routing: {} }, storageError: null, workspaceError: null, shortcutAvailable: true, safeMode: false, startupNotices: [],
    integrations: [{ id: 'meshy', ready: false }], toolCatalog: [], toolLimits: { c: { models: [], unit: 'calls' } }, defaultFolder: 'C:/Users/me', version: '0.6.0', screenshot: null,
  };
}
function load(writers, store, raw) {
  for (const [slice, value] of Object.entries(J.slicesFromLegacy(raw))) writers[slice].set(value);
  return store.commit();
}

test('legacy adapter rebuilds the full desktop snapshot from the store', () => {
  const { store, writers, desktop } = setup();
  const raw = legacy();
  load(writers, store, raw);
  const built = J.legacySnapshot(desktop.state(), J.ephemeralFromLegacy(raw));
  assert.ok(jsonEqual(built, raw), JSON.stringify(Object.keys(raw).filter(key => !jsonEqual(built[key], raw[key]))));
  assert.deepEqual(Object.keys(built), Object.keys(raw), 'same field order as before');
});

test('legacy adapter handles the empty startup snapshot', () => {
  const { store, writers, desktop } = setup();
  const raw = { ...legacy(), sessions: [], codePanels: [], prompts: [], tasks: [], projects: [], mobile: undefined, workbench: undefined, vault: undefined, shared: undefined, updates: undefined, settings: undefined, integrations: undefined };
  load(writers, store, raw);
  assert.ok(jsonEqual(J.legacySnapshot(desktop.state(), J.ephemeralFromLegacy(raw)), raw));
});

test('pairing and device codes stay out of every slice', () => {
  const { store, writers, desktop, phone } = setup();
  load(writers, store, legacy());
  const everything = JSON.stringify([store.state(), desktop.state(), phone.state()]);
  assert.ok(!everything.includes('123456'));
  assert.ok(!everything.includes('ABCD-EFGH'));
  assert.equal(store.get('mobileStatus').pendingPairing.code, undefined);
});

test('a builder failure is reported per slice', () => {
  const failed = [];
  const values = J.slicesFromLegacy({ ...legacy(), tasks: [{ id: 'a' }, { id: 'a' }] }, slice => failed.push(slice));
  assert.deepEqual(failed, ['tasks']);
  assert.ok(values.sessions && !('tasks' in values));
  assert.throws(() => J.slicesFromLegacy({ ...legacy(), tasks: [{ id: 'a' }, { id: 'a' }] }), /repeats/);
});

test('phone DTO fixtures match the projection builders', () => {
  for (const [file, build] of [['phone-session.json', J.phoneSession], ['phone-task.json', J.phoneTask], ['phone-project.json', J.phoneProject]]) {
    const { input, output } = dto(file);
    assert.deepEqual(build(input), output, file);
    assert.deepEqual(P.secretPaths(output), [], file);
  }
  const usage = dto('phone-usage-account.json');
  assert.deepEqual(J.phoneUsageAccounts(usage.input).byId[usage.output.id], usage.output);
  assert.ok(!JSON.stringify(usage.output).includes('cookie'));
  assert.ok(!JSON.stringify(dto('phone-session.json').output).includes('sk-test'));
  assert.ok(!JSON.stringify(dto('phone-task.json').output).includes('private criteria'));
});

test('phone projection exposes allowlisted slices only, without secrets', () => {
  const { store, writers, phone } = setup();
  load(writers, store, legacy());
  assert.deepEqual(Object.keys(phone.state()), Object.keys(J.PHONE));
  assert.deepEqual(phone.get('projects').order, ['p1'], 'archived projects stay on the PC');
  assert.deepEqual(phone.get('shell'), { capacity: 6, version: '0.6.0' });
  assert.deepEqual(phone.get('results'), { unread: 1, count: 1 });
  const text = JSON.stringify(phone.state());
  for (const banned of ['envKeys', 'openai', 'C:/Users/me', 'loginInstruction', 'Bearer']) assert.ok(!text.includes(banned), banned);
});

test('desktop and phone revisions are independent', () => {
  const { store, writers, desktop, phone } = setup();
  load(writers, store, legacy());
  const phoneBatches = [], desktopBatches = [];
  phone.subscribe(batch => phoneBatches.push(batch)); desktop.subscribe(batch => desktopBatches.push(batch));
  const phoneCursor = phone.cursor();
  // A private-only change: settings and key metadata are not on the phone.
  writers.preferences.set({ notifications: false }); writers.keyMetadata.set({ available: false, entries: [] });
  store.commit();
  assert.deepEqual(phone.cursor(), phoneCursor);
  assert.equal(phoneBatches.length, 0);
  assert.deepEqual(desktopBatches[0].changes.map(change => change.slice), ['preferences', 'keyMetadata']);
  // A desktop-only session field changes nothing the phone sees.
  writers.sessions.patch({ upsert: { s1: { ...store.get('sessions').byId.s1, cwd: 'C:/x' } } });
  store.commit();
  assert.equal(phoneBatches.length, 0);
  // A visible change bumps the phone once.
  writers.sessions.patch({ upsert: { s1: { ...store.get('sessions').byId.s1, name: 'Renamed' } } });
  store.commit();
  assert.equal(phoneBatches.length, 1);
  assert.deepEqual(phoneBatches[0].changes, [{ kind: 'patch', slice: 'sessions', baseRev: phoneCursor.revs.sessions, rev: phoneCursor.revs.sessions + 1, upsert: { s1: phone.get('sessions').byId.s1 }, remove: [] }]);
  for (const change of phoneBatches[0].changes) P.validateChange(JSON.parse(JSON.stringify(change)), 'phone');
});

test('projection batches are valid protocol changes', () => {
  const { store, writers, desktop, phone } = setup();
  const batches = [];
  desktop.subscribe(batch => batches.push({ ...batch, view: 'desktop' })); phone.subscribe(batch => batches.push({ ...batch, view: 'phone' }));
  load(writers, store, legacy());
  for (const batch of batches) assert.doesNotThrow(() => P.validateServerMessage({ type: 'changes', epoch: batch.epoch, subscription: 's', batch: batch.batch, changes: JSON.parse(JSON.stringify(batch.changes)) }, batch.view));
  assert.ok(batches.some(batch => batch.view === 'phone'));
});
