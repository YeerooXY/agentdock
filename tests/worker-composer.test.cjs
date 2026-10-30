'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function fixture(call) {
  const errors = [];
  const source = fs.readFileSync(path.join(__dirname, '../src/worker-composer.js'), 'utf8')
    .replace("import './worker-composer.css';", '').replace('export function workerComposer', 'function workerComposer');
  const factory = vm.runInNewContext(source + '\nworkerComposer;', {
    crypto: { randomUUID: require('node:crypto').randomUUID },
    document: { createElement() {
      const fields = { textarea: { value: '', listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } },
        button: {}, '[role="status"]': {} };
      return { dataset: {}, listeners: {}, querySelector: selector => fields[selector],
        addEventListener(name, fn) { this.listeners[name] = fn; } };
    } }
  });
  const composer = factory({ call, escape: text => String(text).replaceAll('<', '&lt;'), toast: text => errors.push(text) });
  const card = () => ({ form: null, insertions: 0, querySelector(selector) {
    if (selector === '[data-worker-composer]') return this.form;
    return { after: form => { this.form = form; this.insertions++; } };
  } });
  const worker = { id: 'worker', consoleKey: 'key', launchId: 'launch-1', taskId: 'task', name: 'Slice A', consoleCapabilities: { steering: true } };
  return { composer, card, worker, errors };
}
const submit = form => form.listeners.submit({ preventDefault() {} });
function type(form, value) { const input = form.querySelector('textarea'); input.value = value; input.listeners.input(); return input; }

test('worker output and status updates retain the composer, draft and selection', () => {
  const f = fixture(async () => ({})), card = f.card(); f.composer.sync(card, f.worker);
  const input = type(card.form, 'Keep this draft'); input.selectionStart = 5; input.selectionEnd = 9;
  const form = card.form;
  for (let index = 0; index < 5; index++) f.composer.sync(card, { ...f.worker, steeringState: 'Queued' });
  assert.equal(card.form, form); assert.equal(card.insertions, 1);
  assert.equal(input.value, 'Keep this draft'); assert.equal(input.selectionStart, 5); assert.equal(input.selectionEnd, 9);
  const reopened = f.card(); f.composer.sync(reopened, f.worker);
  assert.equal(reopened.form.querySelector('textarea').value, 'Keep this draft');
  const other = f.card(); f.composer.sync(other, { ...f.worker, consoleKey: 'other-project' });
  assert.equal(other.form.querySelector('textarea').value, '');
});

test('a lost reply preserves the draft and retries with the same submission identity', async () => {
  const calls = []; let fail = true;
  const f = fixture(async (method, payload) => { calls.push(payload); if (fail) throw new Error('Connection lost'); return { status: 'queued' }; });
  const card = f.card(); f.composer.sync(card, f.worker); const input = type(card.form, 'Steering');
  await submit(card.form); assert.equal(input.value, 'Steering'); assert.deepEqual(f.errors, ['Connection lost']);
  fail = false; await submit(card.form);
  assert.equal(calls[0].submissionId, calls[1].submissionId); assert.equal(calls[0].launchId, 'launch-1');
  assert.equal(input.value, ''); assert.equal(card.form.querySelector('[role="status"]').textContent, 'Queued');
  type(card.form, 'Steering'); await submit(card.form);
  assert.notEqual(calls[2].submissionId, calls[1].submissionId, 'a new owner submission has a new ID');
});

test('an acknowledged submission cannot clear a newer draft or submit into a replacement launch', async () => {
  let finish; const calls = [], gate = new Promise(resolve => { finish = resolve; });
  const f = fixture(async (method, payload) => { calls.push(payload); return gate; });
  const card = f.card(); f.composer.sync(card, f.worker); const input = type(card.form, 'First message');
  const sending = submit(card.form);
  f.composer.sync(card, { ...f.worker, launchId: 'launch-2' });
  type(card.form, 'New draft'); finish({ status: 'acknowledged' }); await sending;
  assert.equal(input.value, 'New draft'); assert.equal(calls.length, 1); assert.equal(calls[0].launchId, 'launch-1');
});

test('worker composers disable submission for missing or unsupported steering', async () => {
  const f = fixture(async () => assert.fail('Unsupported worker input must not be sent.'));
  for (const capabilities of [undefined, {}, { steering: false }]) {
    const card = f.card(); f.composer.sync(card, { ...f.worker, consoleCapabilities: capabilities });
    assert.equal(card.form.querySelector('textarea').disabled, true);
    assert.equal(card.form.querySelector('button').disabled, true);
    type(card.form, 'Retain this draft'); await submit(card.form);
    assert.equal(card.form.querySelector('textarea').value, 'Retain this draft');
  }
});
