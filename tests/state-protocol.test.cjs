'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const P = require('../electron/state-protocol.cjs');
const { PHONE } = require('../electron/projections.cjs');
const fixtures = path.join(__dirname, 'fixtures', 'state');
const load = name => require(path.join(fixtures, name));

test('slice fixture matches the protocol table', () => {
  const slices = load('slices.json');
  assert.equal(slices.protocol, P.PROTOCOL);
  assert.deepEqual(slices.slices, JSON.parse(JSON.stringify(P.SLICES)));
  assert.deepEqual(slices.phone, JSON.parse(JSON.stringify(P.PHONE_SLICES)));
  assert.deepEqual(Object.keys(PHONE), Object.keys(P.PHONE_SLICES));
  for (const [slice, { kind }] of Object.entries(PHONE)) assert.equal(kind, P.PHONE_SLICES[slice].kind);
  assert.equal(slices.secretKeyPattern, P.SECRET_KEY.source);
  for (const { writer, kind } of Object.values(P.SLICES)) {
    assert.ok(writer);
    assert.ok(['value', 'collection'].includes(kind));
  }
});

test('valid message fixtures pass validation', () => {
  for (const { name, direction, message, view = 'desktop' } of load('messages.json').valid) {
    const validate = direction === 'client' ? P.validateClientMessage : P.validateServerMessage;
    assert.doesNotThrow(() => validate(message, view), name);
  }
});

test('invalid message fixtures fail with their code', () => {
  for (const { name, direction, message, code, view = 'desktop' } of load('messages.json').invalid) {
    const validate = direction === 'client' ? P.validateClientMessage : P.validateServerMessage;
    assert.throws(() => validate(message, view), error => error instanceof P.ProtocolError && error.code === code, name);
  }
});

test('sequence fixtures replay through the reference client', () => {
  for (const sequence of load('sequences.json')) {
    let state = sequence.start;
    for (const [index, step] of sequence.steps.entries()) {
      const result = P.applyServerMessage(state, step.message);
      const { state: next, ...outcome } = result;
      const { state: expected, ...expectedOutcome } = step.expect;
      assert.deepEqual(outcome, expectedOutcome, `${sequence.name} step ${index}`);
      assert.deepEqual(JSON.parse(JSON.stringify(next)), expected, `${sequence.name} step ${index} state`);
      state = next;
    }
  }
});

test('a rejected batch leaves the client state unchanged', () => {
  const start = { ...P.initialClientState(), epoch: 'e', subscription: 's', slices: ['usage', 'tasks'], revs: { usage: 1, tasks: 1 }, values: { usage: { n: 1 }, tasks: P.emptyCollection() } };
  const result = P.applyServerMessage(start, { type: 'changes', epoch: 'e', subscription: 's', batch: 1, changes: [
    { kind: 'replace', slice: 'usage', baseRev: 1, rev: 2, value: { n: 2 } },
    { kind: 'patch', slice: 'tasks', baseRev: 3, rev: 4, upsert: {}, remove: [] },
  ] });
  assert.equal(result.outcome, 'resync');
  assert.deepEqual(result.slices, ['tasks']);
  assert.equal(result.state, start);
});

test('collections keep implicit order and reject inconsistent shapes', () => {
  const base = P.toCollection([{ id: 'a' }, { id: 'b' }]);
  assert.deepEqual(P.applyPatch(base, { upsert: { c: { id: 'c' }, a: { id: 'a', x: 1 } }, remove: ['b'] }).order, ['a', 'c']);
  assert.throws(() => P.toCollection([{ id: 'a' }, { id: 'a' }]), /repeats/);
  assert.throws(() => P.toCollection([{ name: 'no id' }]), /no id/);
  assert.throws(() => P.validateCollection({ byId: { a: { id: 'a' } }, order: ['a', 'a'], meta: {} }));
  assert.throws(() => P.applyPatch(base, { upsert: {}, remove: [], order: ['a'] }), /order/);
});

test('secret-named fields are found at any depth', () => {
  assert.deepEqual(P.secretPaths({ a: [{ b: { apiKey: 1 } }], env: {}, tokens: 5, inputTokens: 3, key: 'alert-key' }), ['a[0].b.apiKey', 'env']);
  assert.throws(() => P.assertNoSecrets({ devices: [{ token: 'x' }] }), /private fields/);
});

test('JSON validation rejects non-data values', () => {
  assert.throws(() => P.assertJson({ a: () => 1 }));
  assert.throws(() => P.assertJson({ a: new Date() }));
  assert.throws(() => P.assertJson({ a: NaN }));
  const loop = {}; loop.self = loop;
  assert.throws(() => P.assertJson(loop), /circular/);
  assert.doesNotThrow(() => P.assertJson({ a: [1, 'x', null, { b: true }], c: undefined }));
});
