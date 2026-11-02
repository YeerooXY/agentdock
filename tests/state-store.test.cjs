'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { StateStore, jsonEqual, freezeJson } = require('../electron/state-store.cjs');
const P = require('../electron/state-protocol.cjs');

function manual(options = {}) {
  const ticks = [];
  const store = new StateStore({ epoch: 'e1', schedule: fn => ticks.push(fn), ...options });
  const tick = () => { const pending = ticks.splice(0); for (const fn of pending) fn(); };
  return { store, tick, ticks };
}

test('writes in one tick coalesce into one batch with one bump per slice', () => {
  const { store, tick, ticks } = manual();
  const usage = store.claim('usage', 'usage'), sessions = store.claim('sessions', 'sessions');
  const batches = []; store.subscribe(batch => batches.push(batch));
  usage.set({ n: 1 }); usage.set({ n: 2 }); usage.set({ n: 3 });
  sessions.set(P.toCollection([{ id: 'a' }]));
  sessions.patch({ upsert: { b: { id: 'b' } } });
  assert.equal(ticks.length, 1, 'one scheduled commit per tick');
  tick();
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].changes.map(change => [change.slice, change.baseRev, change.rev]), [['sessions', 0, 1], ['usage', 0, 1]]);
  assert.deepEqual(store.get('usage'), { n: 3 });
  assert.deepEqual(store.get('sessions').order, ['a', 'b']);
  assert.deepEqual(store.cursor(), { epoch: 'e1', revs: { ...Object.fromEntries(P.SLICE_NAMES.map(slice => [slice, 0])), usage: 1, sessions: 1 } });
});

test('unchanged values do not bump revisions or notify', () => {
  const { store } = manual();
  const usage = store.claim('usage', 'usage');
  let count = 0; store.subscribe(() => count++);
  usage.set({ a: [1, 2], b: 'x' }); store.commit();
  usage.set({ b: 'x', a: [1, 2], c: undefined }); assert.equal(store.commit(), null);
  usage.set({ a: [1, 2], b: 'x' }); usage.set({ a: [1, 3], b: 'x' }); usage.set({ a: [1, 2], b: 'x' });
  assert.equal(store.commit(), null, 'a change reverted in the same tick is a no-op');
  assert.equal(store.revision('usage'), 1);
  assert.equal(count, 1);
});

test('collection patches carry only changed items, removals, order and meta', () => {
  const { store } = manual();
  const tasks = store.claim('tasks', 'taskLoop');
  tasks.set(P.toCollection([{ id: 'a', s: 1 }, { id: 'b', s: 1 }, { id: 'c', s: 1 }], { meta: { busy: false } })); store.commit();
  tasks.set(P.toCollection([{ id: 'c', s: 1 }, { id: 'a', s: 2 }, { id: 'd', s: 1 }], { meta: { busy: true } }));
  const [change] = store.commit().changes;
  assert.deepEqual(change, { kind: 'patch', slice: 'tasks', baseRev: 1, rev: 2, upsert: { a: { id: 'a', s: 2 }, d: { id: 'd', s: 1 } }, remove: ['b'], order: ['c', 'a', 'd'], meta: { busy: true } });
  // The envelope applied to the previous value reproduces the new value.
  const client = { ...P.initialClientState(), epoch: 'e1', subscription: 's', slices: ['tasks'], revs: { tasks: 1 }, values: { tasks: P.toCollection([{ id: 'a', s: 1 }, { id: 'b', s: 1 }, { id: 'c', s: 1 }], { meta: { busy: false } }) } };
  const result = P.applyServerMessage(client, { type: 'changes', epoch: 'e1', subscription: 's', batch: 1, changes: [JSON.parse(JSON.stringify(change))] });
  assert.equal(result.outcome, 'applied');
  assert.ok(jsonEqual(result.state.values.tasks, store.get('tasks')));
});

test('patch omits order when the implicit order matches', () => {
  const { store } = manual();
  const tasks = store.claim('tasks', 'taskLoop');
  tasks.set(P.toCollection([{ id: 'a' }])); store.commit();
  tasks.patch({ upsert: { b: { id: 'b' } } });
  const [change] = store.commit().changes;
  assert.equal('order' in change, false);
  assert.equal('meta' in change, false);
});

test('transactions apply together or not at all', () => {
  const { store, tick } = manual();
  const usage = store.claim('usage', 'usage'), history = store.claim('usageHistory', 'usage');
  store.transaction(() => { usage.set({ n: 1 }); history.set({ m: 1 }); });
  tick();
  assert.deepEqual([store.revision('usage'), store.revision('usageHistory')], [1, 1]);
  assert.throws(() => store.transaction(() => { usage.set({ n: 2 }); throw new Error('stop'); }), /stop/);
  assert.equal(store.commit(), null);
  assert.deepEqual(store.get('usage'), { n: 1 });
  assert.throws(() => store.transaction(async () => usage.set({ n: 3 })), /synchronous/);
  assert.equal(store.commit(), null);
  // Nested transactions merge into the outer one; commit waits for the outermost.
  store.transaction(() => { store.transaction(() => usage.set({ n: 4 })); assert.equal(store.commit(), null); history.set({ m: 4 }); });
  const batch = store.commit();
  assert.deepEqual(batch.changes.map(change => change.slice), ['usage', 'usageHistory']);
});

test('each slice has one writer', () => {
  const { store } = manual();
  const writer = store.claim('usage', 'usage');
  assert.throws(() => store.claim('usage', 'other'), /already has a writer/);
  assert.throws(() => store.claim('nope', 'x'), /Unknown slice/);
  assert.throws(() => store.write('usage', 'other', { set: {} }), /does not write/);
  assert.throws(() => writer.patch({ upsert: {} }), /value; use set/);
});

test('stored values are frozen copies', () => {
  const { store } = manual();
  const usage = store.claim('usage', 'usage');
  const input = { nested: { list: [1] } };
  usage.set(input); store.commit();
  input.nested.list.push(2);
  assert.deepEqual(store.get('usage'), { nested: { list: [1] } });
  assert.ok(Object.isFrozen(store.get('usage').nested.list));
  assert.throws(() => { 'use strict'; store.get('usage').nested.x = 1; });
});

test('secret-named fields never enter a slice', () => {
  const strict = manual().store;
  const mobile = strict.claim('mobileStatus', 'mobile');
  assert.throws(() => mobile.set({ devices: [{ id: 'd', token: 'abc' }] }), /private fields/);
  assert.throws(() => mobile.set({ env: { OPENAI_API_KEY: 'sk-x' } }), /private fields/);
  assert.equal(strict.commit(), null);
  const reported = [];
  const lenient = manual({ policy: 'strip', onSecret: (slice, paths) => reported.push([slice, paths]) }).store;
  const sessions = lenient.claim('sessions', 'sessions');
  sessions.set(P.toCollection([{ id: 'a', name: 'A', env: { X: '1' }, auth: { authorization: 'Bearer x', label: 'ok' } }]));
  lenient.commit();
  assert.deepEqual(lenient.get('sessions').byId.a, { id: 'a', name: 'A', auth: { label: 'ok' } });
  assert.deepEqual(reported, [['sessions', ['byId.a.env', 'byId.a.auth.authorization']]]);
});

test('non-JSON values are rejected and JSON normalization is applied', () => {
  const { store } = manual();
  const usage = store.claim('usage', 'usage');
  assert.throws(() => usage.set({ at: new Date() }), /not JSON/);
  assert.throws(() => usage.set(new Map()), /not JSON/);
  usage.set({ a: NaN, b: undefined, c: [undefined] }); store.commit();
  assert.deepEqual(store.get('usage'), { a: null, c: [null] });
  usage.set({ a: NaN, c: [undefined] });
  assert.equal(store.commit(), null, 'normalized equality is a no-op');
  assert.deepEqual(freezeJson({ f: () => 1, x: 1 }), { x: 1 });
});

test('reset lists every slice with its revision', () => {
  const { store } = manual();
  store.claim('usage', 'usage').set({ n: 1 }); store.commit();
  const resets = store.reset(['usage', 'tasks']);
  assert.deepEqual(resets, [{ kind: 'reset', slice: 'usage', rev: 1, value: { n: 1 } }, { kind: 'reset', slice: 'tasks', rev: 0, value: { byId: {}, order: [], meta: {} } }]);
  for (const change of resets) assert.doesNotThrow(() => P.validateChange(change));
});
