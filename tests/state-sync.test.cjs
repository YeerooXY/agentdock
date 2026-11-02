'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const https = require('node:https');
const crypto = require('node:crypto');
const { EventEmitter, once } = require('node:events');
const { gunzipSync } = require('node:zlib');
const { WebSocket } = require('ws');
const P = require('../electron/state-protocol.cjs');
const { StateStore } = require('../electron/state-store.cjs');
const { desktopProjection, phoneProjection } = require('../electron/projections.cjs');
const { ProjectionHistory, StateConnection, chunkFrames, reassembleChunk, validateChunk } = require('../electron/state-sync.cjs');

const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

function setup({ epoch = 'epoch-a', view = 'desktop', history = {}, now } = {}) {
  const store = new StateStore({ epoch, schedule: fn => fn() });
  const writers = Object.fromEntries(Object.entries(P.SLICES).map(([slice, { writer }]) => [slice, store.claim(slice, writer)]));
  const projection = view === 'phone' ? phoneProjection(store) : desktopProjection(store);
  const log = new ProjectionHistory(projection, { ...history, ...(now ? { now } : {}) });
  return { store, writers, projection, history: log };
}
// A client that follows the reference rules and records what it received.
function connect(env, { transport = 'ipc', view = 'desktop', options = {}, buffered = () => 0, authorized = () => true, autoAck = true } = {}) {
  const sent = [], closed = [];
  let client = P.initialClientState(view), chunks = null;
  const connection = new StateConnection({ history: env.history, view, transport, options, bufferedAmount: buffered, authorized,
    write: data => sent.push(data), close: (code, reason) => closed.push({ code, reason }) });
  const outcomes = [];
  const apply = message => {
    if (message.type === 'chunk') {
      const result = reassembleChunk(chunks, message); chunks = result.buffer;
      if (result.outcome !== 'complete') { outcomes.push(result.outcome); return; }
      message = result.message;
    }
    const result = P.applyServerMessage(client, message); client = result.state; outcomes.push(result.outcome);
    if (result.outcome === 'applied' && autoAck) connection.receive({ type: 'ack', subscription: client.subscription, batch: result.batch });
    if (result.outcome === 'duplicate') connection.receive({ type: 'ack', subscription: client.subscription, batch: result.batch });
    if (result.outcome === 'resync') connection.receive({ type: 'resync', subscription: client.subscription, slices: result.slices });
    if (result.outcome === 'pong') connection.receive({ type: 'pong', nonce: result.nonce });
  };
  let read = 0;
  const pump = async () => {
    // gzip runs on the thread pool; wait until two quiet rounds pass.
    for (let round = 0, quiet = 0; round < 200 && quiet < 2; round++) {
      await settle();
      if (transport === 'ws') await new Promise(r => setTimeout(r, 5));
      if (read >= sent.length) { quiet++; continue; }
      quiet = 0;
      while (read < sent.length) {
        const data = sent[read++];
        apply(typeof data === 'string' ? JSON.parse(data) : Buffer.isBuffer(data) ? JSON.parse(gunzipSync(data).toString()) : data);
      }
    }
  };
  return { connection, sent, closed, outcomes, pump, get state() { return client; }, set state(value) { client = value; },
    hello: (slices, lastRev = null, compression = ['none']) => connection.receive({ type: 'hello', protocol: 2, lastRev, slices, compression }) };
}
const cursor = state => ({ epoch: state.epoch, revs: { ...state.revs } });
const matches = (c, env, slices) => { for (const slice of slices) { assert.deepEqual(c.state.values[slice], JSON.parse(JSON.stringify(env.projection.get(slice))), slice); assert.equal(c.state.revs[slice], env.projection.revs[slice]); } };

test('fresh hello gets welcome and resets; later writes arrive as patches', async () => {
  const env = setup();
  env.writers.sessions.set(P.toCollection([{ id: 'a', name: 'A' }]));
  const c = connect(env); c.hello(['sessions', 'usage']); await c.pump();
  assert.deepEqual(c.outcomes.slice(0, 2), ['welcome', 'applied']);
  matches(c, env, ['sessions', 'usage']);
  env.writers.sessions.patch({ upsert: { b: { id: 'b', name: 'B' } } }); await c.pump();
  const last = c.sent.at(-1);
  assert.equal(last.changes[0].kind, 'patch'); assert.deepEqual(Object.keys(last.changes[0].upsert), ['b']);
  matches(c, env, ['sessions']);
  // A slice outside the subscription never reaches the client.
  env.writers.tasks.set(P.toCollection([{ id: 't' }])); await c.pump();
  assert.ok(!c.sent.some(m => m.type === 'changes' && m.changes.some(x => x.slice === 'tasks')));
});

test('resume from lastRev sends only what changed, including deletions', async () => {
  const env = setup();
  env.writers.sessions.set(P.toCollection([{ id: 'a' }, { id: 'b' }, { id: 'c' }]));
  const first = connect(env); first.hello(['sessions', 'shell']); await first.pump();
  const saved = cursor(first.state), values = first.state.values;
  first.connection.dispose();
  env.writers.sessions.patch({ remove: ['b'] });
  env.writers.sessions.patch({ upsert: { d: { id: 'd' } } });
  const second = connect(env);
  second.state = { ...P.initialClientState(), epoch: saved.epoch, revs: saved.revs, values };
  second.hello(['sessions', 'shell'], saved); await second.pump();
  const batch = second.sent.find(m => m.type === 'changes');
  assert.equal(batch.changes.length, 1);
  assert.equal(batch.changes[0].kind, 'patch');
  assert.deepEqual(batch.changes[0].remove, ['b']);
  assert.deepEqual(Object.keys(batch.changes[0].upsert), ['d']);
  matches(second, env, ['sessions']);
  // Nothing changed for an already current client.
  const third = connect(env);
  third.state = { ...P.initialClientState(), epoch: saved.epoch, revs: { ...second.state.revs }, values: second.state.values };
  third.hello(['sessions'], cursor(second.state)); await third.pump();
  assert.deepEqual(third.sent.map(m => m.type), ['welcome']);
});

test('history older than its window falls back to reset', async () => {
  let now = 0;
  const env = setup({ now: () => now, history: { maxAgeMs: 30000 } });
  const first = connect(env); first.hello(['sessions']); await first.pump();
  const saved = cursor(first.state); first.connection.dispose();
  env.writers.sessions.set(P.toCollection([{ id: 'x' }]));
  now = 31000; env.writers.sessions.set(P.toCollection([{ id: 'y' }]));
  const second = connect(env); second.state = { ...P.initialClientState(), epoch: saved.epoch, revs: saved.revs, values: first.state.values };
  second.hello(['sessions'], saved); await second.pump();
  assert.equal(second.sent.find(m => m.type === 'changes').changes[0].kind, 'reset');
  matches(second, env, ['sessions']);
  // The byte bound also prunes.
  const small = setup({ history: { maxBytes: 200 } });
  const c = connect(small); c.hello(['sessions']); await c.pump(); const at = cursor(c.state); c.connection.dispose();
  for (let i = 0; i < 10; i++) small.writers.sessions.patch({ upsert: { ['s' + i]: { id: 's' + i, text: 'x'.repeat(50) } } });
  assert.ok(small.history.bytes <= 200);
  assert.equal(small.history.change('sessions', at.revs.sessions).kind, 'reset');
});

test('restart: a cursor from another epoch gets a new welcome and resets', async () => {
  const env = setup({ epoch: 'epoch-b' });
  env.writers.sessions.set(P.toCollection([{ id: 'a' }]));
  const c = connect(env);
  c.state = { ...P.initialClientState(), epoch: 'epoch-a', subscription: 'old', slices: ['sessions'], revs: { sessions: 9 }, values: { sessions: P.emptyCollection() } };
  c.hello(['sessions'], { epoch: 'epoch-a', revs: { sessions: 9 } }); await c.pump();
  const batch = c.sent.find(m => m.type === 'changes');
  assert.equal(batch.changes[0].kind, 'reset');
  assert.equal(c.state.epoch, 'epoch-b');
  matches(c, env, ['sessions']);
  // A claimed revision ahead of the server is reset too.
  const d = connect(env); d.hello(['sessions'], { epoch: 'epoch-b', revs: { sessions: 99 } }); await d.pump();
  assert.equal(d.sent.find(m => m.type === 'changes').changes[0].kind, 'reset');
});

test('slow acknowledgements: one batch in flight, later writes coalesce from the acked baseline', async () => {
  const env = setup();
  const c = connect(env, { autoAck: false }); c.hello(['sessions', 'queues']); await c.pump();
  const first = c.sent.find(m => m.type === 'changes');
  for (let i = 0; i < 5; i++) env.writers.sessions.patch({ upsert: { ['s' + i]: { id: 's' + i } } });
  env.writers.queues.set({ a: { paused: true, entries: [] } });
  env.writers.sessions.patch({ remove: ['s0'] });
  await c.pump();
  assert.equal(c.sent.filter(m => m.type === 'changes').length, 1, 'nothing more until the ack');
  c.connection.receive({ type: 'ack', subscription: c.state.subscription, batch: first.batch });
  // A repeated ack changes nothing.
  c.connection.receive({ type: 'ack', subscription: c.state.subscription, batch: first.batch });
  await c.pump();
  const batches = c.sent.filter(m => m.type === 'changes');
  assert.equal(batches.length, 2);
  const sessions = batches[1].changes.find(x => x.slice === 'sessions');
  assert.equal(sessions.baseRev, 0);
  assert.deepEqual(Object.keys(sessions.upsert), ['s1', 's2', 's3', 's4']);
  assert.deepEqual(sessions.remove, ['s0']);
  assert.deepEqual(sessions.order, ['s1', 's2', 's3', 's4']);
  assert.equal(batches[1].changes.find(x => x.slice === 'queues').kind, 'replace');
  c.connection.receive({ type: 'ack', subscription: c.state.subscription, batch: batches[1].batch });
  matches(c, env, ['sessions', 'queues']);
});

test('gap: the client resyncs and the server resets those slices; duplicates are re-acknowledged', async () => {
  const env = setup();
  const c = connect(env); c.hello(['sessions']); await c.pump();
  // Corrupt the client's revision so the next patch has a gap.
  c.state = { ...c.state, revs: { sessions: 42 } };
  env.writers.sessions.patch({ upsert: { a: { id: 'a' } } }); await c.pump();
  assert.ok(c.outcomes.includes('resync'));
  const last = c.sent.filter(m => m.type === 'changes').at(-1);
  assert.equal(last.changes[0].kind, 'reset');
  matches(c, env, ['sessions']);
  // Replaying an applied batch is a duplicate and changes nothing.
  const before = c.state; const replay = P.applyServerMessage(c.state, last);
  assert.equal(replay.outcome, 'duplicate'); assert.equal(replay.state, before);
});

test('subscribe issues a new subscription and resets only new slices', async () => {
  const env = setup();
  env.writers.sessions.set(P.toCollection([{ id: 'a' }]));
  const c = connect(env); c.hello(['sessions']); await c.pump();
  const old = c.state.subscription;
  c.connection.receive({ type: 'subscribe', slices: ['sessions', 'tasks'] }); await c.pump();
  assert.notEqual(c.state.subscription, old);
  const batch = c.sent.filter(m => m.type === 'changes').at(-1);
  assert.deepEqual(batch.changes.map(x => [x.slice, x.kind]), [['tasks', 'reset']]);
  matches(c, env, ['sessions', 'tasks']);
  // Acks for the old subscription are ignored.
  c.connection.receive({ type: 'ack', subscription: old, batch: 1 });
  // Invalid messages get an error, not a crash.
  c.connection.receive({ type: 'nope' }); await settle();
  assert.equal(c.closed.length, 0);
  c.connection.receive({ type: 'hello', protocol: 1, lastRev: null, slices: ['sessions'], compression: ['none'] }); await settle();
  assert.deepEqual(c.sent.filter(m => m.type === 'error').map(m => m.code), ['invalid', 'unsupported']);
  assert.equal(c.closed.length, 1);
});

test('oversized resets are chunked and reassembled atomically; gzip is negotiated', async () => {
  const env = setup({ view: 'phone' });
  const items = Array.from({ length: 200 }, (_, i) => ({ id: 'p' + i, name: 'Project ' + i + ' ' + 'n'.repeat(100), status: 'active' }));
  env.writers.projects.set(P.toCollection(items));
  const c = connect(env, { transport: 'ws', view: 'phone', options: { chunkBytes: 4096 } });
  c.hello(['projects', 'shell'], null, ['gzip', 'none']); await c.pump();
  const frames = c.sent.map(data => typeof data === 'string' ? JSON.parse(data) : JSON.parse(gunzipSync(data).toString()));
  assert.equal(frames[0].compression, 'gzip');
  const chunks = frames.filter(m => m.type === 'chunk');
  assert.ok(chunks.length > 3);
  assert.ok(c.sent.some(Buffer.isBuffer), 'large frames are gzip binary');
  assert.deepEqual(chunks.map(m => m.part), chunks.map((_, i) => i + 1));
  assert.ok(c.outcomes.filter(x => x === 'partial').length === chunks.length - 1);
  matches(c, env, ['projects', 'shell']);
  // Reassembly refuses a missing part.
  const parts = chunkFrames(JSON.stringify(frames.find(m => m.type === 'chunk') ? { type: 'changes' } : {}), { subscription: 's', batch: 1, chunkBytes: 4 });
  const first = reassembleChunk(null, parts[0]);
  assert.equal(first.outcome, 'partial');
  assert.equal(reassembleChunk(first.buffer, parts[2]).outcome, 'reconnect');
  assert.throws(() => validateChunk({ ...parts[0], extra: 1 }));
});

test('transport.json chunk cases replay through the reference reassembly', () => {
  const fixture = require('./fixtures/state/transport.json');
  for (const item of fixture.chunks) {
    let buffer = null; const outcomes = []; let message;
    for (const chunk of item.chunks) { const result = reassembleChunk(buffer, chunk); buffer = result.buffer; outcomes.push(result.outcome); if (result.message) message = result.message; }
    assert.deepEqual(outcomes, item.expect, item.name);
    if (item.message) assert.deepEqual(message, item.message, item.name);
  }
  const { DEFAULTS, MAX_CHUNK_PARTS, MAX_CHUNK_TOTAL } = require('../electron/state-sync.cjs');
  assert.deepEqual(fixture.limits, { highWater: DEFAULTS.highWater, lowWater: DEFAULTS.lowWater, chunkBytes: DEFAULTS.chunkBytes, maxParts: MAX_CHUNK_PARTS, maxTotal: MAX_CHUNK_TOTAL, pingSeconds: 15, missedPings: 8 });
});

test('water marks pause sends above 512 KiB and resume below 128 KiB; replies keep priority', async () => {
  const env = setup({ view: 'phone' });
  let buffered = 0;
  const c = connect(env, { transport: 'ws', view: 'phone', buffered: () => buffered, options: { pollMs: 5 } });
  buffered = 600 * 1024;
  c.hello(['sessions']); await settle();
  assert.equal(c.sent.length, 0); assert.equal(c.connection.paused, true); assert.ok(c.connection.congested());
  buffered = 200 * 1024; await new Promise(r => setTimeout(r, 20));
  assert.equal(c.sent.length, 0, 'still above the low-water mark');
  c.connection.reply({ type: 'reply', id: 'r1', value: true });
  buffered = 100 * 1024; await new Promise(r => setTimeout(r, 20));
  const types = c.sent.map(data => JSON.parse(data).type);
  assert.deepEqual(types.slice(0, 3), ['welcome', 'reply', 'changes']);
  // A full reply queue closes the connection instead of dropping replies.
  buffered = 600 * 1024;
  for (let i = 0; i < 70; i++) c.connection.reply({ type: 'reply', id: 'x' + i, value: i });
  assert.equal(c.closed.at(-1).code, 1013);
});

test('revocation is checked before every send', async () => {
  const env = setup();
  let allowed = true;
  const c = connect(env, { authorized: () => allowed }); c.hello(['sessions']); await c.pump();
  const count = c.sent.length;
  allowed = false;
  env.writers.sessions.patch({ upsert: { a: { id: 'a' } } }); await settle();
  assert.equal(c.sent.length, count);
  assert.equal(c.closed.at(-1).code, 1008);
  assert.equal(c.connection.closed, true);
});

test('server pings carry a nonce; missed pongs close after the grace', async () => {
  const env = setup();
  const c = connect(env, { options: { maxMissed: 3 } }); c.hello(['shell']); await c.pump();
  c.connection.ping(); await c.pump();
  assert.ok(c.outcomes.includes('pong')); assert.equal(c.connection.missed, 0);
  const silent = connect(env, { options: { maxMissed: 3 } });
  for (let i = 0; i < 3; i++) assert.equal(silent.connection.ping(), true);
  assert.equal(silent.connection.ping(), false);
  assert.equal(silent.closed.at(-1).code, 1001);
});

// ---- Phone WebSocket ------------------------------------------------------
const { MobileCompanion } = require('../electron/mobile.cjs');
const { Results } = require('../electron/results.cjs');
const { AlertEvents } = require('../electron/alerts.cjs');
const { isTailscale } = require('../electron/mobile-address.cjs');
const safe = (() => { const key = crypto.randomBytes(32); return { isEncryptionAvailable: () => true, encryptString(value) { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(value), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]); }, decryptString(buffer) { const d = crypto.createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12)); d.setAuthTag(buffer.subarray(12, 28)); return Buffer.concat([d.update(buffer.subarray(28)), d.final()]).toString(); } }; })();
async function phone(t, { enabled = true } = {}) {
  t.mock.method(os, 'networkInterfaces', () => ({ loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] }));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-v2-'));
  const sessions = new EventEmitter(); sessions.items = new Map(); sessions.list = () => [...sessions.items.values()]; sessions.write = () => {}; sessions.acknowledge = () => {};
  sessions.items.set('c1', { id: 'c1', name: 'Console', alive: true, state: 'ready', cols: 80, rows: 24, slot: 1, sequence: 0, buffer: 'Hello', provider: 'shell' });
  const env = setup({ view: 'phone', epoch: crypto.randomUUID() });
  const state = { enabled };
  const m = new MobileCompanion(root, safe, { sessions, results: new Results(root, { trash: file => fs.promises.rm(file, { recursive: true, force: true }) }), alerts: new AlertEvents(),
    getDefaults: () => ({}), getUsage: () => ({}), testMode: true, isTailnet: ip => ip === '127.0.0.1' || isTailscale(ip), stateSync: { history: env.history, enabled: () => state.enabled } });
  const reserve = net.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise(r => reserve.close(r));
  await m.configure({ enabled: true, host: '127.0.0.1', port });
  t.after(async () => { await m.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  const request = (route, auth, body) => new Promise((resolve, reject) => { const req = https.request({ hostname: '127.0.0.1', port, path: route, method: 'POST', agent: false, rejectUnauthorized: false, headers: { Authorization: 'Bearer ' + auth } }, res => { let text = ''; res.on('data', x => text += x); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text) })); }); req.on('error', reject); req.end(JSON.stringify(body)); });
  const invite = JSON.parse(Buffer.from((await m.invite()).code.slice(10), 'base64url'));
  const key = crypto.randomBytes(32).toString('base64url');
  const pending = await request('/v1/pair', invite.secret, { name: 'Phone', approval: true, requestKey: key });
  m.decidePairing({ id: pending.data.id, allow: true });
  const token = (await request('/v1/pair/status', key, { id: pending.data.id })).data.token;
  const open = (route = '/v2/events') => {
    const ws = new WebSocket(`wss://127.0.0.1:${port}${route}`, { rejectUnauthorized: false, headers: { Authorization: 'Bearer ' + token } });
    const messages = [], signal = new EventEmitter();
    ws.on('message', (data, binary) => { const message = JSON.parse(binary ? gunzipSync(data).toString() : data.toString()); messages.push(message); signal.emit('message', message); });
    const wait = filter => { const found = messages.find(filter); if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('timeout')), 3000); signal.on('message', function check(message) { if (filter(message)) { clearTimeout(timer); signal.off('message', check); resolve(message); } }); }); };
    return { ws, messages, wait, send: value => ws.send(JSON.stringify(value)) };
  };
  return { m, env, state, open, sessions };
}

test('/v2/events: hello, changes, ack, commands and extras on an authenticated phone', async t => {
  const f = await phone(t);
  const c = f.open(); t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  const extras = await c.wait(m => m.type === 'extras');
  assert.ok(extras.value.capabilities.includes('state.v2'));
  assert.ok(!c.messages.some(m => m.type === 'state'), 'no v1 snapshot frames');
  c.send({ type: 'hello', protocol: 2, lastRev: null, slices: ['sessions', 'tasks'], compression: ['gzip', 'none'] });
  const welcome = await c.wait(m => m.type === 'welcome');
  assert.equal(welcome.epoch, f.env.projection.epoch);
  const first = await c.wait(m => m.type === 'changes');
  assert.deepEqual(first.changes.map(x => x.kind), ['reset', 'reset']);
  c.send({ type: 'ack', subscription: welcome.subscription, batch: first.batch });
  f.env.writers.tasks.set(P.toCollection([{ id: 't1', title: 'Task', state: 'running', criteria: 'private' }]));
  const second = await c.wait(m => m.type === 'changes' && m.batch === 2);
  assert.equal(second.changes[0].upsert.t1.title, 'Task');
  assert.ok(!JSON.stringify(second).includes('private'));
  // Commands still work, as {type: 'request'}.
  c.send({ type: 'request', id: 'r1', method: 'ping', payload: {} });
  assert.equal((await c.wait(m => m.type === 'reply' && m.id === 'r1')).value, true);
  // Terminal output streams on the same socket.
  c.send({ type: 'request', id: 'r2', method: 'subscribe', payload: { id: 'c1' } });
  const terminal = await c.wait(m => m.type === 'terminal');
  assert.match(terminal.data, /Hello/);
});

test('/v2/events is refused when protocol 2 is off and for unknown tokens; v1 is unchanged', async t => {
  const f = await phone(t, { enabled: false });
  const c = f.open();
  const [error] = await once(c.ws, 'unexpected-response').then(([, res]) => [res.statusCode]);
  assert.equal(error, 404);
  const v1 = f.open('/v1/events'); t.after(() => v1.ws.terminate()); await once(v1.ws, 'open');
  const state = await v1.wait(m => m.type === 'state');
  assert.ok(!state.state.capabilities.includes('state.v2'));
  f.state.enabled = true;
  const stranger = new WebSocket(c.ws.url, { rejectUnauthorized: false, headers: { Authorization: 'Bearer nope' } });
  const [, res] = await once(stranger, 'unexpected-response');
  assert.equal(res.statusCode, 401);
});

test('/v2/events: revoking the phone stops sends; a backgrounded phone keeps its two-minute grace', async t => {
  const f = await phone(t);
  const c = f.open(); t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  c.send({ type: 'hello', protocol: 2, lastRev: null, slices: ['tasks'], compression: ['none'] });
  await c.wait(m => m.type === 'changes');
  const client = [...f.m.clients][0];
  // A backgrounded phone stops reading: eight missed heartbeats (about two
  // minutes at 15 s) keep the connection open; the ninth closes it.
  c.ws.pause();
  for (let i = 0; i < 8; i++) f.m.heartbeat();
  assert.equal(client.ws.readyState, WebSocket.OPEN);
  assert.equal(client.missedPongs, 8);
  // Back in the foreground, an app-level pong resets the grace.
  c.ws.resume();
  const ping = await c.wait(m => m.type === 'ping');
  client.missedPongs = 5;
  c.send({ type: 'pong', nonce: [...c.messages].reverse().find(m => m.type === 'ping').nonce });
  await new Promise(r => setTimeout(r, 100));
  assert.equal(client.missedPongs, 0); assert.ok(ping.nonce);
  // Revocation: the device is removed; no further changes are written.
  const before = c.messages.length, devices = f.m.private.devices;
  f.m.private.devices = [];
  f.env.writers.tasks.set(P.toCollection([{ id: 't2' }]));
  await once(c.ws, 'close');
  assert.ok(!c.messages.slice(before).some(m => m.type === 'changes'));
  // A phone that never answers is closed after the grace.
  f.m.private.devices = devices;
  const other = f.open(); t.after(() => other.ws.terminate()); await once(other.ws, 'open');
  const silent = [...f.m.clients][0]; silent.missedPongs = 8;
  f.m.heartbeat(); await once(other.ws, 'close');
});
