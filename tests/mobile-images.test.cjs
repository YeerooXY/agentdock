'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { WebSocket } = require('ws');
const { MobileCompanion } = require('../electron/mobile.cjs');
const { Concepts } = require('../electron/concepts.cjs');

test('phone image snapshot is capped, redacted and includes reported usage', async t => {
  const f = fixture(t);
  f.concepts.items = Array.from({ length: 35 }, (_, i) => ({
    id: String(i).padStart(36, '0'), at: i + 1, state: 'complete', provider: 'openai',
    prompt: 'vault-secret API_KEY=private-value ' + 'a'.repeat(400), config: { model: 'model', keyId: 'hidden-key' },
    usage: { input: 0, output: 8, total: null, raw: 'provider-secret' }, credits: null,
    resultId: 'saved', headers: { authorization: 'header-secret' }, response: 'raw-secret',
  }));
  const state = f.mobile.publicState();
  assert.equal(state.imageJobs.length, 30);
  assert.equal(state.imageJobs[0].startedAt, 35);
  assert.equal([...state.imageJobs[0].promptSummary].length, 200);
  assert.deepEqual(state.imageJobs[0].usage, { input: 0, output: 8, total: null, credits: null });
  assert.equal(state.imageJobs[0].resultId, 'saved');
  assert.doesNotMatch(JSON.stringify(state.imageJobs), /vault-secret|private-value|hidden-key|provider-secret|header-secret|raw-secret|headers|response/);
});

test('phone resume requires an accepted interrupted or failed Meshy job and reuses its id', async t => {
  const f = fixture(t), id = 'a'.repeat(36), calls = [];
  f.concepts.items = [{ id, provider: 'meshy', state: 'interrupted', taskId: 'accepted' }];
  f.concepts.launch = (job, submit) => calls.push({ id: job.id, submit });
  assert.equal(f.mobile.publicState().imageJobs[0].canResume, true);
  assert.equal(await f.mobile.call(f.client, 'image.resume', { id }), true);
  assert.deepEqual(calls, [{ id, submit: false }]);
  f.concepts.items[0].state = 'failed';
  assert.equal(f.mobile.publicState().imageJobs[0].canResume, true);
  await f.mobile.call(f.client, 'image.resume', { id });
  assert.deepEqual(calls[1], { id, submit: false });
  for (const change of [{ state: 'complete' }, { state: 'waiting' }, { taskId: null }, { provider: 'openai' }]) {
    Object.assign(f.concepts.items[0], { provider: 'meshy', state: 'interrupted', taskId: 'accepted' }, change);
    assert.equal(f.mobile.publicState().imageJobs[0].canResume, false);
    await assert.rejects(f.mobile.call(f.client, 'image.resume', { id }), /cannot be resumed/);
  }
  await assert.rejects(f.mobile.call(f.client, 'image.resume', { id, prompt: 'new job' }), /Invalid/);
  assert.equal(calls.length, 2);
});

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'image-phone-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sessions = new EventEmitter(); sessions.items = new Map(); sessions.list = () => [];
  const results = new EventEmitter(); results.list = () => []; results.unreadGroups = () => 0;
  const concepts = new Concepts(root, {}, results, {}, {}, {});
  const safe = { isEncryptionAvailable: () => true };
  const mobile = new MobileCompanion(root, safe, { sessions, results, concepts, redactImageText: value => value.replaceAll('vault-secret', '[credential removed]') });
  const device = {}, client = { device, ws: { readyState: WebSocket.OPEN } };
  mobile.private.devices.push(device); mobile.clients.add(client);
  return { mobile, concepts, client };
}
