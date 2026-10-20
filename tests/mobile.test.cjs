'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const net = require('node:net');
const crypto = require('node:crypto');
const { EventEmitter, once } = require('node:events');
const { gunzipSync } = require('node:zlib');
const { WebSocket } = require('ws');
const { MobileCompanion } = require('../electron/mobile.cjs');
const { Results } = require('../electron/results.cjs');
const { AlertEvents } = require('../electron/alerts.cjs');
const { TerminalStream } = require('../electron/mobile-stream.cjs');
const { MobilePush, publicConfig, serviceAccount } = require('../electron/mobile-push.cjs');
const safe = (() => { const key = crypto.randomBytes(32); return { isEncryptionAvailable: () => true, encryptString(value) { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(value), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]); }, decryptString(buffer) { const d = crypto.createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12)); d.setAuthTag(buffer.subarray(12, 28)); return Buffer.concat([d.update(buffer.subarray(28)), d.final()]).toString(); } }; })();
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-mobile-'));
  const sessions = new EventEmitter(); sessions.items = new Map(); sessions.list = () => [...sessions.items.values()]; sessions.writes = []; sessions.write = (id, data) => sessions.writes.push({ id, data }); sessions.acknowledge = id => { sessions.items.get(id).state = 'open'; sessions.emit('changed'); };
  for (let i = 1; i <= 9; i++) sessions.items.set('console-' + i, { id: 'console-' + i, name: 'Console ' + i, alive: true, state: 'ready', cols: 80, rows: 24, slot: i, sequence: 0, buffer: 'Hello ' + i, provider: 'shell' });
  const results = new Results(root, { trash: file => fs.promises.rm(file, { recursive: true, force: true }) }), alerts = new AlertEvents();
  const m = new MobileCompanion(root, safe, { sessions, results, alerts, getDefaults: () => ({}), getUsage: () => ({ limits: [], summary: {} }), testMode: true });
  const reserve = net.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise(r => reserve.close(r));
  await m.configure({ enabled: true, host: '127.0.0.1', port });
  t.after(async () => { await m.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  const request = (route, auth, body = {}, headers = {}) => new Promise((resolve, reject) => { const req = https.request({ hostname: '127.0.0.1', port, path: route, method: 'POST', agent: false, rejectUnauthorized: false, headers: { Authorization: 'Bearer ' + auth, ...headers } }, res => { let text = ''; res.on('data', x => text += x); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text) })); }); req.on('error', reject); req.end(JSON.stringify(body)); });
  const code = (await m.invite()).code, invite = JSON.parse(Buffer.from(code.slice(10), 'base64url'));
  const begin = (secret = invite.secret, key = crypto.randomBytes(32).toString('base64url'), name = 'Test phone') => request('/v1/pair', secret, { name, approval: true, requestKey: key }).then(r => ({ ...r, key }));
  const pair = async () => { const pending = await begin(); assert.equal(pending.status, 202); m.decidePairing({ id: pending.data.id, allow: true }); return request('/v1/pair/status', pending.key, { id: pending.data.id }); };
  return { m, sessions, results, alerts, root, port, invite, request, begin, pair };
}
function client(f, auth) {
  const ws = new WebSocket(`wss://127.0.0.1:${f.port}/v1/events`, { rejectUnauthorized: false, headers: { Authorization: 'Bearer ' + auth } });
  const messages = [], signal = new EventEmitter();
  ws.on('message', (data, binary) => { const m = JSON.parse(binary ? gunzipSync(data).toString() : data.toString()); messages.push(m); signal.emit('message', m); });
  async function wait(filter) {
    const found = messages.find(filter); if (found) return found;
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { signal.off('message', check); reject(Error('Mobile message timeout')); }, 3000); function check(m) { if (filter(m)) { clearTimeout(timer); signal.off('message', check); resolve(m); } } signal.on('message', check); });
  }
  const call = async (method, payload) => { const id = crypto.randomUUID(); ws.send(JSON.stringify({ id, method, payload })); const message = await wait(m => m.type === 'reply' && m.id === id); if (message.error) throw Error(message.error); return message.value; };
  return { ws, wait, messages, call };
}

test('live completion alerts reach paired phones without a stored inbox', async t => {
  const f = await fixture(t), paired = await f.pair(), c = client(f, paired.data.token);
  t.after(() => c.ws.terminate());
  await once(c.ws, 'open');
  await c.wait(x => x.type === 'state');
  const alert = f.alerts.send({ title: 'Review ready', kind: 'ready', sessionId: 'console-1', key: 'completed-turn' });
  f.alerts.send({ title: 'Duplicate', key: 'completed-turn' });
  const delivered = await c.wait(x => x.type === 'state' && x.state.alerts.some(a => a.id === alert.id));
  assert.deepEqual(delivered.state.alerts, [{ id: alert.id, title: 'Review ready', at: alert.at }]);
  assert.equal(fs.existsSync(path.join(f.root, 'inbox.json')), false);
  await c.call('acknowledge', { id: 'console-1' });
  assert.equal(f.sessions.items.get('console-1').state, 'open');
  for (let i = 0; i < 60; i++) f.alerts.send({ title: 'Completion ' + i });
  assert.equal(f.m.publicState().alerts.length, 50);
  assert.equal(f.m.publicState().alerts.at(-1).title, 'Completion 59');
});

test('saved phone names are independent; remote rename cannot target another phone', async t => {
  const f = await fixture(t);
  f.m.rename({ name: 'Studio PC' });
  const a = (await f.pair()).data;
  assert.equal(a.name, 'Studio PC');
  const invite = JSON.parse(Buffer.from((await f.m.invite()).code.slice(10), 'base64url'));
  const pending = await f.begin(invite.secret, undefined, 'Travel phone');
  f.m.decidePairing({ id: pending.data.id, allow: true });
  const b = (await f.request('/v1/pair/status', pending.key, { id: pending.data.id })).data;
  const first = client(f, a.token), second = client(f, b.token);
  await Promise.all([once(first.ws, 'open'), once(second.ws, 'open')]);
  const identity = f.m.private.identity.cert;
  f.m.rename({ name: 'Work PC' });
  f.m.rename({ id: a.id, name: 'Personal phone' });
  assert.equal(await first.call('ping'), true);
  assert.equal((await second.call('state')).connection.name, 'Work PC');
  assert.equal(f.m.private.identity.cert, identity);
  assert.equal(f.m.private.devices.find(x => x.id === a.id).token, a.token);
  await first.call('device.rename', { id: b.id, name: 'My Pixel' });
  assert.equal(f.m.snapshot().devices.find(x => x.id === a.id).name, 'My Pixel');
  assert.equal(f.m.snapshot().devices.find(x => x.id === b.id).name, 'Travel phone');
  assert.throws(() => f.m.rename({ name: ' ' }), /1 to 64/);
  await assert.rejects(first.call('device.rename', { name: 'x'.repeat(65) }), /1 to 64/);
  await assert.rejects(first.call('device.rename', { name: { toString: 'bad' } }), /name/);
  const persisted = JSON.parse(fs.readFileSync(f.m.file, 'utf8'));
  assert.equal(persisted.name, 'Work PC');
  assert.equal(JSON.parse(safe.decryptString(Buffer.from(persisted.encrypted, 'base64'))).devices.length, 2);
  const close = once(first.ws, 'close'); f.m.revoke(a.id); await close;
  assert.equal(await second.call('ping'), true);
  assert.equal(f.m.snapshot().devices.length, 1);
  second.ws.close();
});

test('mobile launch chooses an installed agent once without changing PC defaults', async t => {
  const f = await fixture(t), paired = (await f.pair()).data;
  const c = client(f, paired.token); await once(c.ws, 'open');
  t.after(() => c.ws.close());
  const defaults = { provider: 'codex', model: 'codex-only-model', cwd: f.root, permissions: 'default' };
  f.m.getDefaults = () => defaults;
  f.sessions.cliSetup = { snapshot: () => [{ id: 'claude', installed: true }] };
  const created = [];
  f.sessions.create = raw => { created.push(raw); return { id: 'new' }; };
  assert.ok((await c.call('state')).capabilities.includes('console.agents'));
  assert.equal((await c.call('console.agents')).agents.find(x => x.id === 'claude').installed, true);
  await c.call('console.create', { name: 'Claude project', agent: 'claude', permissions: 'unrestricted', cwd: 'C:\\Windows', command: 'must not execute' });
  assert.deepEqual(created[0], { ...defaults, provider: 'claude', model: '', command: '', name: 'Claude project' });
  assert.equal(defaults.provider, 'codex');
  assert.equal(defaults.model, 'codex-only-model');
  for (const agent of ['custom', 'shell', 'missing', '__proto__', { id: 'claude' }]) {
    await assert.rejects(c.call('console.create', { agent }), /installed/);
  }
  assert.equal(created.length, 1);
});

test('closing a mobile console requires the selected target and confirmation', async t => {
  const f = await fixture(t), paired = (await f.pair()).data;
  const c = client(f, paired.token); await once(c.ws, 'open');
  t.after(() => c.ws.close());
  const ended = [];
  f.sessions.end = id => { ended.push(id); f.sessions.items.get(id).dismissed = true; };
  await c.call('subscribe', { id: 'console-1' });
  await assert.rejects(c.call('console.close', { id: 'console-1' }), /Confirm/);
  await assert.rejects(c.call('console.close', { id: 'console-2', confirm: true }), /Confirm/);
  assert.deepEqual(ended, []);
  await c.call('console.close', { id: 'console-1', confirm: true });
  assert.deepEqual(ended, ['console-1']);
  assert.equal((await c.call('state')).sessions.some(x => x.id === 'console-1'), false);
  assert.equal((await c.call('state')).sessions.length, 8);
  await assert.rejects(c.call('console.close', { id: 'console-1', confirm: true }), /Confirm/);
});

test('mobile projects, current models and trusted SSH hosts use saved settings only', async t => {
  const f = await fixture(t), paired = (await f.pair()).data;
  const c = client(f, paired.token); await once(c.ws, 'open'); t.after(() => c.ws.close());
  const project = { id: 'project', name: 'Game', status: 'active', folders: [{ label: 'Source', path: f.root }] };
  const host = { id: 'vm', name: 'Linux', folder: '/home/dev/work', agents: ['claude'] };
  f.sessions.projects = { list: () => [project], get: id => id === project.id ? project : null };
  f.sessions.ssh = { get: id => id === host.id ? host : null, listMobile: () => [host] };
  f.sessions.cliSetup = { snapshot: () => [{ id: 'codex', installed: true }] };
  f.m.getDefaults = () => ({ provider: 'codex', cwd: f.root });
  f.m.getModels = async () => [{ id: 'current-model', name: 'Current model' }];
  const created = []; f.sessions.create = raw => { created.push(raw); return { id: 'new' }; };
  const choices = await c.call('console.agents');
  assert.equal(choices.projects[0].name, 'Game');
  assert.equal(choices.hosts[0].id, 'vm');
  await assert.rejects(c.call('console.create', { projectId: 'unknown' }), /project/);
  await assert.rejects(c.call('console.create', { projectId: 'project', folderIndex: -1 }), /project/);
  await assert.rejects(c.call('console.create', { model: 'arbitrary' }), /Refresh/);
  assert.equal((await c.call('console.models', { provider: 'codex' })).models[0].id, 'current-model');
  await c.call('console.create', { projectId: 'project', model: 'current-model', cwd: '/not-saved' });
  assert.equal(created[0].cwd, f.root); assert.equal(created[0].name, 'Game'); assert.equal(created[0].model, 'current-model');
  await assert.rejects(c.call('console.create', { hostId: 'untrusted' }), /approved/);
  await assert.rejects(c.call('console.create', { hostId: 'vm', agent: 'codex' }), /installed/);
  await c.call('console.create', { hostId: 'vm', agent: 'claude', remoteFolder: '/unapproved', permissions: 'unrestricted' });
  assert.equal(created[1].remoteFolder, host.folder); assert.equal(created[1].permissions, 'default');
  assert.equal(created.length, 2);
});

test('direct alerts and chunked images stay bound to the authenticated phone and console', async t => {
  const f = await fixture(t), paired = (await f.pair()).data;
  const c = client(f, paired.token); await once(c.ws, 'open'); t.after(() => c.ws.close());
  const device = f.m.private.devices.find(x => x.id === paired.id);
  await c.call('alerts.mode', { direct: true, id: 'another-device' });
  assert.equal(device.directAlerts, true);
  await assert.rejects(c.call('alerts.mode', { direct: 'true' }), /mode/);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
  f.sessions.items.get('console-1').cwd = f.root;
  await assert.rejects(c.call('attachment.begin', { id: 'console-1', size: png.length }), /Select/);
  await c.call('subscribe', { id: 'console-1' });
  const upload = await c.call('attachment.begin', { id: 'console-1', size: png.length });
  await c.call('attachment.chunk', { ...upload, offset: 0, data: png.toString('base64') });
  const saved = await c.call('attachment.finish', upload);
  assert.deepEqual(fs.readFileSync(saved.path), png); assert.deepEqual(f.sessions.writes, []);
  const second = await c.call('attachment.begin', { id: 'console-1', size: png.length });
  await c.call('attachment.chunk', { ...second, offset: 0, data: png.toString('base64') });
  await c.call('subscribe', { id: 'console-2' });
  await assert.rejects(c.call('attachment.finish', second), /changed/);
  assert.equal(fs.readdirSync(path.dirname(saved.path)).length, 1);
  await c.call('subscribe', { id: '' });
  assert.equal([...f.m.clients][0].selected, '');
  assert.equal(await c.call('ping'), true);
});

test('mobile file suggestions are bounded to the selected console folder', async t => {
  const f = await fixture(t), paired = (await f.pair()).data;
  const c = client(f, paired.token); await once(c.ws, 'open');
  t.after(() => c.ws.close());
  const work = path.join(f.root, 'work');
  fs.mkdirSync(path.join(work, 'src'), { recursive: true });
  for (const file of ['index.js', 'other.ts', '.env', '.env.local']) fs.writeFileSync(path.join(work, file), 'private content must never be returned');
  fs.writeFileSync(path.join(work, 'src', 'app.js'), 'private content');
  fs.mkdirSync(path.join(work, '.git'));
  fs.symlinkSync(f.root, path.join(work, 'outside'), 'junction');
  f.sessions.items.get('console-1').cwd = work;
  await assert.rejects(c.call('console.files', { id: 'console-1' }), /Select/);
  await c.call('subscribe', { id: 'console-1' });
  const listing = await c.call('console.files', { id: 'console-1' });
  assert.deepEqual(listing.entries.map(x => x.name), ['src', 'index.js', 'other.ts']);
  assert.ok(!JSON.stringify(listing).includes('private content'));
  assert.ok(!JSON.stringify(listing).includes(f.root));
  assert.equal((await c.call('console.files', { id: 'console-1', query: 'index' })).entries.length, 1);
  assert.deepEqual((await c.call('console.files', { id: 'console-1', directory: 'src' })).entries.map(x => x.path), ['src/app.js']);
  for (const directory of ['..', 'src/../..', '/etc', 'C:/Windows', '..\\', '.git', '.env', 'outside']) {
    await assert.rejects(c.call('console.files', { id: 'console-1', directory }), /folder/i);
  }
  await assert.rejects(c.call('console.files', { id: 'console-2' }), /Select/);
});

test('revoking a phone blocks input already queued behind its close handshake', async t => {
  const f = await fixture(t), paired = (await f.pair()).data;
  const c = client(f, paired.token); await once(c.ws, 'open');
  await c.call('subscribe', { id: 'console-1' });
  const closed = once(c.ws, 'close');
  c.ws.send(JSON.stringify({ id: 'queued-before-revoke', method: 'input', payload: { id: 'console-1', data: 'should-not-run\r' } }));
  f.m.revoke(paired.id);
  await closed;
  assert.deepEqual(f.sessions.writes, [], 'revoked device must not execute buffered input');
});

test('hostile mobile requests cannot replay input, change defaults or reach desktop administration', async t => {
  const f = await fixture(t), paired = (await f.pair()).data;
  const browser = new WebSocket(`wss://127.0.0.1:${f.port}/v1/events`, { rejectUnauthorized: false, headers: { Authorization: 'Bearer ' + paired.token, Origin: 'https://attacker.invalid' } });
  await assert.rejects(once(browser, 'open'), /401/);
  const c = client(f, paired.token); await once(c.ws, 'open');
  for (const method of ['mobile.rename', 'mobile.revoke', 'vault.get', 'settings', 'session.create', '__proto__', 'constructor']) {
    await assert.rejects(c.call(method, { command: 'must not execute', provider: 'shell' }), /unavailable/);
  }
  for (const payload of [null, [], 'input']) await assert.rejects(c.call('input', payload), /Invalid mobile request/);
  f.sessions.create = defaults => { assert.deepEqual(defaults, { name: 'Test' }); return { id: 'created' }; };
  assert.equal((await c.call('console.create', { name: 'Test', provider: 'shell', command: 'must not execute', cwd: 'C:\\Windows' })).id, 'created');
  await c.call('subscribe', { id: 'console-1' });
  const packet = JSON.stringify({ id: 'same-request', method: 'input', payload: { id: 'console-1', data: 'once' } });
  c.ws.send(packet); await c.wait(x => x.id === 'same-request' && !x.error);
  c.ws.send(packet); await c.wait(x => x.id === 'same-request' && x.error);
  assert.equal(f.sessions.writes.length, 1);
  c.ws.send('{invalid'); await c.wait(x => x.type === 'reply' && x.id === '' && x.error);
  assert.equal(await c.call('ping'), true);
  const closed = once(c.ws, 'close'); c.ws.send(Buffer.from('binary request')); await closed;
  assert.equal(f.sessions.writes.length, 1);
});
test('mobile pairing is private, single-use, encrypted at rest, and revocable', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/v1/pair', 'wrong')).status, 401);
  assert.equal((await f.request('/v1/pair', 'é'.repeat(f.invite.secret.length))).status, 401);
  assert.equal((await f.request('/v1/pair', f.invite.secret, {}, { Origin: 'https://evil.example' })).status, 404);
  assert.equal(f.invite.approval, true);
  assert.equal((await f.request('/v1/pair', f.invite.secret, { name: 'Old app' })).status, 426);
  const paired = await f.pair(); assert.equal(paired.status, 200);
  assert.equal((await f.begin(f.invite.secret)).status, 401);
  const saved = fs.readFileSync(f.m.file, 'utf8'); assert.ok(!saved.includes(paired.data.token)); assert.ok(!saved.includes('PRIVATE KEY'));
  assert.equal(crypto.createHash('sha256').update(new crypto.X509Certificate(f.m.private.identity.cert).raw).digest('hex'), f.invite.pin);
  const c = client(f, paired.data.token); await once(c.ws, 'open');
  const firstState = await c.wait(x => x.type === 'state');
  assert.deepEqual(firstState.state.connection, { url: `https://127.0.0.1:${f.port}`, name: f.m.name });
  Object.assign(f.m.config, { mode: 'internet', publicHost: 'dock-test.duckdns.org', externalPort: 47831 });
  const nextState = await c.call('state');
  assert.deepEqual(nextState.connection, { url: 'https://dock-test.duckdns.org:47831', localUrl: `https://127.0.0.1:${f.port}`, name: f.m.name });
  assert.ok(!JSON.stringify(nextState).includes(paired.data.token));
  assert.ok(!JSON.stringify(nextState).includes('PRIVATE KEY'));
  await assert.rejects(c.call('vault.get', { id: 'openai' }), /unavailable/);
  await assert.rejects(c.call('input', { id: 'console-1', data: 'pwd\r' }), /Select/);
  await c.call('subscribe', { id: 'console-1' });
  await c.call('input', { id: 'console-1', data: 'pwd\r' }); assert.deepEqual(f.sessions.writes, [{ id: 'console-1', data: 'pwd\r' }]);
  const closed = once(c.ws, 'close'); f.m.revoke(paired.data.id); await closed;
  const denied = client(f, paired.data.token); await assert.rejects(once(denied.ws, 'open'), /401/);
});
test('QR possession only requests approval; only the requesting phone can claim it', async t => {
  const f = await fixture(t), pending = await f.begin(), id = pending.data.id;
  assert.equal(pending.status, 202); assert.match(pending.data.code, /^\d{6}$/);
  assert.equal(pending.data.token, undefined); assert.equal(f.m.private.devices.length, 0);
  const snapshot = JSON.stringify(f.m.snapshot());
  assert.ok(!snapshot.includes(pending.key)); assert.ok(!snapshot.includes(f.invite.secret)); assert.ok(!snapshot.includes('keyHash'));
  assert.equal(f.m.snapshot().pendingPairing.code, pending.data.code);
  for (const auth of [pending.key, f.invite.secret, pending.data.code]) {
    const denied = client(f, auth); await assert.rejects(once(denied.ws, 'open'), /401/);
  }
  assert.equal((await f.request('/v1/pair/status', pending.key, { id })).status, 202);
  assert.equal((await f.request('/v1/pair/status', f.invite.secret, { id })).status, 401);
  assert.equal((await f.request('/v1/pair/status', pending.key, { id: 'other' })).status, 401);
  assert.equal((await f.request('/v1/pair/status', pending.key, { id }, { Origin: 'https://example.org' })).status, 404);
  assert.equal((await f.request('/v1/pair/approve', pending.key, { id })).status, 404);
  const retry = await f.begin(f.invite.secret, pending.key); assert.equal(retry.data.id, id); assert.equal(retry.data.code, pending.data.code);
  assert.equal((await f.begin(f.invite.secret)).status, 401, 'a second scanner cannot replace the waiting phone');
  assert.throws(() => f.m.decidePairing({ id: 'stale', allow: true }), /no longer/);
  assert.throws(() => f.m.decidePairing({ id, allow: 'true' }), /Allow or Deny/);
  f.m.decidePairing({ id, allow: true });
  assert.equal(f.m.private.devices.length, 0, 'credentials are persisted only when the approved phone claims them');
  assert.equal((await f.request('/v1/pair/status', 'wrong', { id })).status, 401);
  const claimed = await f.request('/v1/pair/status', pending.key, { id }); assert.equal(claimed.status, 200);
  const again = await f.request('/v1/pair/status', pending.key, { id }); assert.deepEqual(again.data, claimed.data); assert.equal(f.m.private.devices.length, 1);
  assert.equal(f.m.snapshot().pendingPairing, null);
  const c = client(f, claimed.data.token); await once(c.ws, 'open');
  await assert.rejects(c.call('mobile.decide-pairing', { id, allow: true }), /unavailable/);
  c.ws.close();
  assert.equal((await f.request('/v1/pair/cancel', pending.key, { id })).status, 200);
  assert.equal(f.m.private.devices.length, 0, 'cancel after a response race revokes the newly issued token');
});

test('denial, expiration, cancellation, a new QR and shutdown cannot grant pending access', async t => {
  const f = await fixture(t);
  for (const action of ['deny', 'expire', 'cancel', 'new-code', 'stop']) {
    if (!f.m.server) await f.m.start();
    const invite = JSON.parse(Buffer.from((await f.m.invite()).code.slice(10), 'base64url'));
    const pending = await f.begin(invite.secret); assert.equal(pending.status, 202);
    const id = pending.data.id;
    if (action === 'deny') f.m.decidePairing({ id, allow: false });
    if (action === 'expire') f.m.pendingPairing.expires = Date.now() - 1;
    if (action === 'cancel') f.m.cancelPairing();
    if (action === 'new-code') await f.m.invite();
    if (action === 'stop') { await f.m.stop(); await f.m.start(); }
    assert.throws(() => f.m.decidePairing({ id, allow: true }), /no longer/);
    assert.equal((await f.request('/v1/pair/status', pending.key, { id })).status, action === 'deny' ? 403 : 401);
    assert.equal(f.m.private.devices.length, 0);
  }
});

test('failed credential storage rolls back approval and a retry can finish safely', async t => {
  const f = await fixture(t), pending = await f.begin(), id = pending.data.id;
  f.m.decidePairing({ id, allow: true });
  const persist = f.m.persist.bind(f.m); f.m.persist = () => { throw Error('Storage unavailable'); };
  assert.equal((await f.request('/v1/pair/status', pending.key, { id })).status, 400);
  assert.equal(f.m.private.devices.length, 0); assert.equal(f.m.pendingPairing.device, undefined);
  f.m.persist = persist;
  assert.equal((await f.request('/v1/pair/status', pending.key, { id })).status, 200);
  assert.equal(f.m.private.devices.length, 1);
});

test('one selected terminal streams and resumes without replaying commands', async t => {
  const f = await fixture(t), paired = await f.pair(), c = client(f, paired.data.token); await once(c.ws, 'open');
  await c.call('subscribe', { id: 'console-2', sequence: -1, epoch: 0 }); const first = await c.wait(x => x.type === 'terminal'); assert.equal(first.id, 'console-2'); assert.ok(first.reset);
  for (let i = 1; i <= 9; i++) { const s = f.sessions.items.get('console-' + i); s.sequence++; f.sessions.emit('output', { id: s.id, sequence: s.sequence, data: '\r\nUpdate ' + i }); }
  const next = await c.wait(x => x.type === 'terminal' && x.sequence === 1); assert.equal(next.id, 'console-2'); assert.equal(next.reset, false); assert.equal(next.data, '\r\nUpdate 2');
  assert.ok(c.messages.filter(x => x.type === 'terminal').every(x => x.id === 'console-2'));
  const closed = once(c.ws, 'close'); c.ws.close(); await closed;
  const s = f.sessions.items.get('console-2'); f.sessions.emit('output', { id: s.id, sequence: ++s.sequence, data: '\r\nOffline change' });
  const d = client(f, paired.data.token); await once(d.ws, 'open');
  await d.call('subscribe', { id: 'console-2', sequence: next.sequence, epoch: next.epoch });
  const resumed = await d.wait(x => x.type === 'terminal'); assert.equal(resumed.data, '\r\nOffline change'); assert.equal(resumed.reset, false); assert.equal(f.sessions.writes.length, 0);
  f.sessions.items.delete('console-2'); f.sessions.emit('changed'); assert.equal(f.m.streams.has('console-2'), false);
  d.ws.close();
});

test('internet mode preserves pairing authentication and device revocation across public peers', async t => {
  const f = await fixture(t);
  const paired = await f.pair();
  const request = { headers: { authorization: 'Bearer ' + paired.data.token }, socket: { remoteAddress: '8.8.8.8' } };
  assert.equal(f.m.authenticate(request), null, 'local mode blocks public peers even with a valid token');
  Object.assign(f.m.config, { mode: 'internet', publicHost: 'test.duckdns.org', externalPort: 49000 });
  assert.equal(f.m.authenticate(request).id, paired.data.id);
  assert.equal(f.m.authenticate({ ...request, headers: { authorization: 'Bearer wrong' } }), null);
  assert.equal(f.m.authenticate({ ...request, headers: { ...request.headers, origin: 'https://evil.example' } }), null);
  assert.equal(f.m.authenticate({ headers: { ...request.headers, 'x-forwarded-for': '192.168.1.1' }, socket: { remoteAddress: '169.254.1.1' } }), null);
  const invite = JSON.parse(Buffer.from((await f.m.invite()).code.slice(10), 'base64url'));
  assert.equal(invite.v, 2); assert.equal(invite.mode, 'internet'); assert.equal(invite.url, 'https://test.duckdns.org:49000'); assert.equal(invite.localUrl, `https://127.0.0.1:${f.port}`); assert.equal(invite.pin, f.invite.pin);
  f.m.revoke(paired.data.id); assert.equal(f.m.authenticate(request), null);
  let allowed = 0; for (let i = 0; i < 1000; i++) allowed += Number(f.m.allowAttempt({ socket: { remoteAddress: '1.1.1.1' } }));
  assert.equal(allowed, 30); assert.ok(f.m.attempts.size < 250);
});
test('terminal checkpoint retains screen modes and resynchronizes after history eviction', async () => {
  const s = new TerminalStream({ buffer: '', sequence: 0, cols: 80, rows: 24 });
  s.write({ sequence: 1, data: '\x1b[?1049h\x1b[31mHello\x1b[0m' });
  const snapshot = await s.read(-1, 0); assert.ok(snapshot.data.includes('Hello')); assert.ok(snapshot.data.includes('\x1b[?1049h')); assert.equal(snapshot.sequence, 1);
  s.history = []; const gap = await s.read(0, snapshot.epoch); assert.equal(gap.reset, true);
  s.resize(40, 15); const resized = await s.read(1, snapshot.epoch); assert.equal(resized.cols, 40); assert.equal(resized.reset, true); s.dispose();
});

test('rapid terminal resizes keep the last requested size and ordered checkpoint dimensions', async () => {
  const s = new TerminalStream({ buffer: '', sequence: 0, cols: 80, rows: 24 });
  try {
    const initial = await s.read(-1, 0);
    const beforeResize = s.read(initial.sequence, initial.epoch);
    s.resize(40, 12);
    s.resize(80, 24);
    const before = await beforeResize;
    assert.equal(before.epoch, initial.epoch, 'a queued resize must not relabel an earlier screen');
    assert.equal(before.cols, 80);
    const after = await s.read(initial.sequence, initial.epoch);
    assert.equal(after.cols, 80);
    assert.equal(after.rows, 24);
    assert.equal(after.reset, true);
  } finally { s.dispose(); }
});

test('mobile parses a resized console redraw at its new width before the next flush', async t => {
  const f = await fixture(t), session = f.sessions.items.get('console-1');
  const stream = f.m.ensureStream(session.id);
  await stream.read(-1, 0);
  session.cols = 120; session.rows = 30;
  f.sessions.emit('output', { id: session.id, sequence: ++session.sequence, data: '\x1b[?1049h\x1b[H\x1b[2J' + 'x'.repeat(110) + 'RIGHT' });
  f.m.ensureStream(session.id);
  const frame = await stream.read(-1, 0);
  assert.equal(frame.cols, 120);
  assert.equal(stream.term.buffer.active.getLine(0).translateToString(true), 'x'.repeat(110) + 'RIGHT');
});
test('Firebase imports validate project/package and push contains no console content', async () => {
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const raw = { type: 'service_account', project_id: 'dock-test-123', client_email: 'sender@dock-test-123.iam.gserviceaccount.com', private_key: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const config = publicConfig({ project_info: { project_id: raw.project_id, project_number: '1234567' }, client: [{ client_info: { android_client_info: { package_name: 'com.yeeroo.agentdock.mobile' }, mobilesdk_app_id: '1:1234567:android:abcdef' }, api_key: [{ current_key: 'AIza' + 'x'.repeat(35) }] }] });
  assert.equal(config.projectId, raw.project_id); assert.throws(() => serviceAccount(raw, 'other-project'), /same Firebase/);
  const calls = [], push = new MobilePush({ credential: () => serviceAccount(raw, config.projectId), fetcher: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ access_token: 'test-bearer', expires_in: 3600 }) }; } });
  await push.send('phone-token', 'event-123');
  assert.equal(calls.length, 2); assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  const body = JSON.parse(calls[1].options.body); assert.equal(body.message.notification.body, 'An agent needs your attention.'); assert.ok(!calls[1].options.body.includes('PRIVATE KEY')); assert.equal(body.message.token, 'phone-token');
  const bad = new MobilePush({ credential: () => raw, fetcher: async () => ({ ok: false }) }); await assert.rejects(bad.send('phone-token'), /Firebase sign-in failed/);
});
