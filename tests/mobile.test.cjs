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
const { Results, Inbox } = require('../electron/results.cjs');
const { TerminalStream } = require('../electron/mobile-stream.cjs');
const { MobilePush, publicConfig, serviceAccount } = require('../electron/mobile-push.cjs');
const safe = (() => { const key = crypto.randomBytes(32); return { isEncryptionAvailable: () => true, encryptString(value) { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(value), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]); }, decryptString(buffer) { const d = crypto.createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12)); d.setAuthTag(buffer.subarray(12, 28)); return Buffer.concat([d.update(buffer.subarray(28)), d.final()]).toString(); } }; })();
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-mobile-'));
  const sessions = new EventEmitter(); sessions.items = new Map(); sessions.list = () => [...sessions.items.values()]; sessions.writes = []; sessions.write = (id, data) => sessions.writes.push({ id, data }); sessions.acknowledge = id => { sessions.items.get(id).state = 'open'; sessions.emit('changed'); };
  for (let i = 1; i <= 9; i++) sessions.items.set('console-' + i, { id: 'console-' + i, name: 'Console ' + i, alive: true, state: 'ready', cols: 80, rows: 24, slot: i, sequence: 0, buffer: 'Hello ' + i, provider: 'shell' });
  const results = new Results(root, { trash: file => fs.promises.rm(file, { recursive: true, force: true }) }), inbox = new Inbox(root);
  const m = new MobileCompanion(root, safe, { sessions, results, inbox, getDefaults: () => ({}), getUsage: () => ({ limits: [], summary: {} }), testMode: true });
  const reserve = net.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise(r => reserve.close(r));
  await m.configure({ enabled: true, host: '127.0.0.1', port });
  t.after(async () => { await m.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  const request = (route, auth, body = {}, headers = {}) => new Promise((resolve, reject) => { const req = https.request({ hostname: '127.0.0.1', port, path: route, method: 'POST', rejectUnauthorized: false, headers: { Authorization: 'Bearer ' + auth, ...headers } }, res => { let text = ''; res.on('data', x => text += x); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text) })); }); req.on('error', reject); req.end(JSON.stringify(body)); });
  const code = (await m.invite()).code, invite = JSON.parse(Buffer.from(code.slice(10), 'base64url'));
  return { m, sessions, results, inbox, root, port, invite, request };
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
test('mobile pairing is private, single-use, encrypted at rest, and revocable', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/v1/pair', 'wrong')).status, 401);
  assert.equal((await f.request('/v1/pair', 'é'.repeat(f.invite.secret.length))).status, 401);
  assert.equal((await f.request('/v1/pair', f.invite.secret, {}, { Origin: 'https://evil.example' })).status, 404);
  const paired = await f.request('/v1/pair', f.invite.secret, { name: 'Test phone' }); assert.equal(paired.status, 200);
  assert.equal((await f.request('/v1/pair', f.invite.secret)).status, 401);
  const saved = fs.readFileSync(f.m.file, 'utf8'); assert.ok(!saved.includes(paired.data.token)); assert.ok(!saved.includes('PRIVATE KEY'));
  assert.equal(crypto.createHash('sha256').update(new crypto.X509Certificate(f.m.private.identity.cert).raw).digest('hex'), f.invite.pin);
  const c = client(f, paired.data.token); await once(c.ws, 'open');
  await c.wait(x => x.type === 'state');
  await assert.rejects(c.call('vault.get', { id: 'openai' }), /unavailable/);
  await assert.rejects(c.call('input', { id: 'console-1', data: 'pwd\r' }), /Select/);
  await c.call('subscribe', { id: 'console-1' });
  await c.call('input', { id: 'console-1', data: 'pwd\r' }); assert.deepEqual(f.sessions.writes, [{ id: 'console-1', data: 'pwd\r' }]);
  const closed = once(c.ws, 'close'); f.m.revoke(paired.data.id); await closed;
  const denied = client(f, paired.data.token); await assert.rejects(once(denied.ws, 'open'), /401/);
});
test('one selected terminal streams and resumes without replaying commands', async t => {
  const f = await fixture(t), paired = await f.request('/v1/pair', f.invite.secret), c = client(f, paired.data.token); await once(c.ws, 'open');
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
test('terminal checkpoint retains screen modes and resynchronizes after history eviction', async () => {
  const s = new TerminalStream({ buffer: '', sequence: 0, cols: 80, rows: 24 });
  s.write({ sequence: 1, data: '\x1b[?1049h\x1b[31mHello\x1b[0m' });
  const snapshot = await s.read(-1, 0); assert.ok(snapshot.data.includes('Hello')); assert.ok(snapshot.data.includes('\x1b[?1049h')); assert.equal(snapshot.sequence, 1);
  s.history = []; const gap = await s.read(0, snapshot.epoch); assert.equal(gap.reset, true);
  s.resize(40, 15); const resized = await s.read(1, snapshot.epoch); assert.equal(resized.cols, 40); assert.equal(resized.reset, true); s.dispose();
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
