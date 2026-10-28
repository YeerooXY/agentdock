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
const { PromptLibrary } = require('../electron/prompt-library.cjs');
const { isTailscale } = require('../electron/mobile-address.cjs');
const { TerminalStream } = require('../electron/mobile-stream.cjs');
const safe = (() => { const key = crypto.randomBytes(32); return { isEncryptionAvailable: () => true, encryptString(value) { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(value), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]); }, decryptString(buffer) { const d = crypto.createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12)); d.setAuthTag(buffer.subarray(12, 28)); return Buffer.concat([d.update(buffer.subarray(28)), d.final()]).toString(); } }; })();
// CI machines have no Tailscale adapter; loopback stands in for this PC's 100.x address.
const loopbackTailnet = ip => ip === '127.0.0.1' || isTailscale(ip);
async function fixture(t, { withPrompts = false } = {}) {
  // These clients connect only to loopback. Keep the fixture independent of
  // physical adapters and environments that cannot enumerate host networks.
  t.mock.method(os, 'networkInterfaces', () => ({ loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] }));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-mobile-'));
  const sessions = new EventEmitter(); sessions.items = new Map(); sessions.list = () => [...sessions.items.values()]; sessions.writes = []; sessions.write = (id, data) => sessions.writes.push({ id, data }); sessions.acknowledge = id => { sessions.items.get(id).state = 'open'; sessions.emit('changed'); };
  for (let i = 1; i <= 9; i++) sessions.items.set('console-' + i, { id: 'console-' + i, name: 'Console ' + i, alive: true, state: 'ready', cols: 80, rows: 24, slot: i, sequence: 0, buffer: 'Hello ' + i, provider: 'shell' });
  const results = new Results(root, { trash: file => fs.promises.rm(file, { recursive: true, force: true }) }), alerts = new AlertEvents();
  const prompts = withPrompts ? new PromptLibrary(root) : undefined;
  const m = new MobileCompanion(root, safe, { sessions, results, alerts, prompts, getDefaults: () => ({}), getUsage: () => ({ limits: [], summary: {} }), testMode: true, isTailnet: loopbackTailnet });
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

test('projects read RPCs advertise support, exclude archives and expose only summary fields', async t => {
  const f = await fixture(t), paired = await f.pair(), c = client(f, paired.data.token);
  t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  const { Projects } = require('../electron/projects.cjs');
  const store = new Projects(f.root);
  store.items = [
    { id: 'project', name: 'Phone', color: '#89b4ff', status: 'active', goals: 'g'.repeat(2100), nextStep: 'Read plans', lastActiveAt: 123,
      milestones: [{ text: 'Overview', acceptance: 'Cards visible', done: true }, { text: 'Detail', done: false }],
      folders: [{ path: f.root }], credentials: 'SECRET', vault: { key: 'PRIVATE' }, files: '/outside/private' },
    { id: 'archive', name: 'Archived', status: 'archived', milestones: [] },
  ];
  f.sessions.projects = store;
  Object.assign(f.sessions.items.get('console-1'), { projectId: 'project' });
  Object.assign(f.sessions.items.get('console-2'), { projectId: 'project', alive: false });
  Object.assign(f.sessions.items.get('console-3'), { projectId: 'project', dismissed: true });
  assert.ok((await c.call('state')).capabilities.includes('projects.read'));
  assert.deepEqual(await c.call('projects.list'), [{
    id: 'project', name: 'Phone', color: '#89b4ff', status: 'active', goals: 'g'.repeat(2000), nextStep: 'Read plans',
    lastActiveAt: 123, progress: { done: 1, total: 2 }, consoles: [{ id: 'console-1', name: 'Console 1' }],
  }]);
  // A store without normalized colors exercises the mobile fallback as well.
  t.mock.method(store, 'list', () => store.items);
  delete store.items[0].color;
  const detail = await c.call('projects.detail', { id: 'project' });
  assert.equal(detail.color, '#89b4ff');
  assert.deepEqual(detail.consoles, [{ id: 'console-1', name: 'Console 1' }]);
  assert.deepEqual(f.sessions.writes, []);
});

test('project detail trims recent notes and goals and summarizes planning without private context', async t => {
  const f = await fixture(t), paired = await f.pair(), c = client(f, paired.data.token);
  t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  const { Projects } = require('../electron/projects.cjs');
  const planning = require('../electron/project-planning.cjs');
  const store = new Projects(f.root), plan = planning.initial();
  plan.revision = 7; plan.approvals.brief = 1; plan.skipped.research = 1;
  plan.proposals.infrastructure = { section: 'infrastructure', data: { security: 'SECRET' } };
  plan.references = [{ value: '/outside/secret', kind: 'file' }]; plan.files = { directory: '/outside/private' };
  store.items = [{ id: 'project', name: 'Phone', status: 'planning', goals: 'g'.repeat(3000), notes: 'old\n\nsecond\n\nthird\n\nfourth',
    milestones: [{ text: 'Overview', acceptance: 'Cards visible', done: true }], plan }];
  f.sessions.projects = store;
  const before = JSON.stringify(store.items);
  const detail = await c.call('projects.detail', { id: 'project' });
  assert.equal(detail.goals.length, 2000);
  assert.equal(detail.notes, 'second\n\nthird\n\nfourth');
  assert.deepEqual(detail.milestones, [{ text: 'Overview', acceptance: 'Cards visible', done: true }]);
  assert.deepEqual(detail.plan, { revision: 7, sections: [
    { name: 'brief', revision: 7, state: 'approved' }, { name: 'research', revision: 7, state: 'not needed' },
    { name: 'infrastructure', revision: 7, state: 'proposal waiting' }, { name: 'roadmap', revision: 7, state: 'empty' },
  ] });
  assert.doesNotMatch(JSON.stringify(detail), /outside|SECRET|references|directory/);
  assert.equal(JSON.stringify(store.items), before);
  store.items[0].notes = 'old\n\n' + 'a'.repeat(2000) + '\n\n' + 'b'.repeat(2000) + '\n\nlatest';
  const trimmed = await c.call('projects.detail', { id: 'project' });
  assert.equal(trimmed.notes.length, 4000); assert.ok(trimmed.notes.endsWith('latest'));
  assert.ok(!trimmed.notes.includes('old'));
  delete store.items[0].plan;
  const legacy = await c.call('projects.detail', { id: 'project' });
  assert.equal(legacy.plan.revision, null);
  assert.ok(legacy.plan.sections.every(s => s.state === 'empty' && s.revision === null));
  // Planning.context also handles plans saved with the original single proposal field.
  plan.proposal = plan.proposals.infrastructure; delete plan.proposals; store.items[0].plan = plan;
  assert.equal((await c.call('projects.detail', { id: 'project' })).plan.sections[2].state, 'proposal waiting');
});

test('projects read rejects unknown, archived and invalid ids and gates unsupported stores', async t => {
  const f = await fixture(t), paired = await f.pair(), c = client(f, paired.data.token);
  t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  for (const store of [undefined, { list: () => [] }]) {
    f.sessions.projects = store;
    assert.ok(!(await c.call('state')).capabilities.includes('projects.read'));
    await assert.rejects(c.call('projects.list'), /does not support Projects/);
    await assert.rejects(c.call('projects.detail', { id: 'unknown' }), /does not support Projects/);
  }
  const { Projects } = require('../electron/projects.cjs');
  f.sessions.projects = new Projects(f.root);
  f.sessions.projects.items = [{ id: 'archive', status: 'archived', milestones: [] }];
  for (const id of ['unknown', 'archive', null, {}, 42]) {
    await assert.rejects(c.call('projects.detail', { id }), /Project not found or archived/);
  }
  await assert.rejects(c.call('projects.detail'), /Project not found or archived/);
  assert.deepEqual(f.sessions.writes, []);
});

test('code reader is read-only, bounded, local and restricted to console roots', async t => {
  const f = await fixture(t), paired = await f.pair(), c = client(f, paired.data.token);
  t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  const folder = path.join(f.root, 'project');
  fs.mkdirSync(path.join(folder, 'src'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'src', 'hello.js'), 'first\nsecond\n');
  fs.writeFileSync(path.join(folder, '.env'), 'PRIVATE=hidden');
  fs.writeFileSync(path.join(folder, 'large.txt'), Buffer.alloc(256 * 1024 + 1, 'x'));
  fs.writeFileSync(path.join(folder, 'binary.dat'), Buffer.from([65, 0, 66]));
  fs.writeFileSync(path.join(folder, 'private.txt'), '-----BEGIN RSA PRIVATE KEY-----');
  const session = f.sessions.items.get('console-1'); session.cwd = folder;
  assert.ok((await c.call('state')).capabilities.includes('code.read'));
  await c.call('subscribe', { id: session.id });
  const call = (method, file) => c.call(method, { consoleId: session.id, path: file });
  const listing = await call('code.list', '');
  assert.equal(listing.entries[0].name, 'src');
  assert.equal(listing.entries[0].directory, true);
  assert.ok(!listing.entries.some(x => x.name === '.env'));
  const nested = await call('code.list', listing.entries[0].path);
  const read = await call('code.read', nested.entries[0].path);
  assert.equal(read.path, 'src/hello.js');
  assert.equal(read.folder, folder);
  assert.equal(read.text, 'first\nsecond\n');
  assert.equal(read.lines, 3);
  assert.equal(read.size, 13);
  for (const method of ['code.list', 'code.read']) {
    for (const traversal of ['../outside', 'src/../hello.js', '..\\outside', path.join(f.root, 'outside')]) {
      await assert.rejects(call(method, traversal), /inside this project/);
    }
  }
  for (const [file, reason] of [['.env', /excluded/], ['private.txt', /no code preview/], ['binary.dat', /no code preview/], ['large.txt', /256 KB/]]) {
    const value = await call('code.read', file);
    assert.equal(value.text, null); assert.equal(value.lines, 0); assert.match(value.omitted, reason);
  }
  assert.equal((await call('code.read', 'large.txt')).size, 256 * 1024 + 1);
  session.remote = true;
  for (const method of ['code.list', 'code.read']) await assert.rejects(call(method, ''), /local console/);
  session.remote = false; session.remoteHostId = 'ssh';
  await assert.rejects(call('code.read', 'src/hello.js'), /local console/);
  assert.deepEqual(f.sessions.writes, []);
  assert.equal(fs.readFileSync(path.join(folder, '.env'), 'utf8'), 'PRIVATE=hidden');
});

test('code reader lists only its project folders and retains the explorer entry cap', async t => {
  const f = await fixture(t), paired = await f.pair(), c = client(f, paired.data.token);
  t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  const folders = ['a', 'b', 'other'].map(name => path.join(f.root, name));
  for (const folder of folders) fs.mkdirSync(folder);
  for (let i = 0; i < 501; i++) fs.writeFileSync(path.join(folders[0], `${i}.txt`), 'x');
  const session = f.sessions.items.get('console-1');
  session.cwd = folders[0]; session.projectId = 'project';
  f.sessions.projects = { list: () => [{ id: 'project', folders: folders.slice(0, 2).map(path => ({ path })) }] };
  f.sessions.items.get('console-2').cwd = folders[2];
  await c.call('subscribe', { id: session.id });
  const call = value => c.call('code.list', { consoleId: session.id, path: value });
  assert.deepEqual((await call('')).entries.map(x => x.path), folders.slice(0, 2));
  const list = await call(folders[0]);
  assert.equal(list.entries.length, 500); assert.equal(list.truncated, true);
  await assert.rejects(call(folders[2]), /inside this project/);
});

test('phone advertises result actions and bounded image previews with validated input', async t => {
  const f = await fixture(t), paired = await f.pair(), c = client(f, paired.data.token);
  t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  const capabilities = (await c.call('state')).capabilities;
  assert.ok(capabilities.includes('results.thumbnails'));
  assert.ok(capabilities.includes('results.actions'));
  const image = f.results.add({ title: 'Landscape', buffer: Buffer.from('mock image'), ext: '.png' }, { trusted: true });
  const resized = [];
  f.results.nativeImage = { createFromPath: file => {
    assert.equal(file, f.results.path(image.id));
    return {
      isEmpty: () => false, getSize: () => ({ width: 2400, height: 1200 }),
      resize: size => { resized.push(size); return { toDataURL: () => 'data:image/png;base64,bW9jaw==' }; },
    };
  } };
  assert.deepEqual(await c.call('results.preview', { id: image.id, thumbnail: true }), { image: 'data:image/png;base64,bW9jaw==' });
  assert.ok(resized[0].width <= 400 && resized[0].height <= 400);
  for (const id of [null, {}, '../outside', 42]) {
    await assert.rejects(c.call('results.preview', { id, thumbnail: true }), /Choose a result/);
  }
  await assert.rejects(c.call('results.preview', { id: image.id, thumbnail: 'yes' }), /thumbnail option/);
  await assert.rejects(c.call('results.preview', { id: crypto.randomUUID(), thumbnail: true }), /deleted/);
  await assert.rejects(c.call('results.seen', { ids: image.id }), /Choose results/);
  await assert.rejects(c.call('results.delete', { ids: image.id }), /Choose results/);
  await c.call('results.seen', { ids: [image.id] });
  assert.ok((await c.call('results.list')).find(x => x.id === image.id).seenAt);
  const other = f.results.add({ title: 'Report', text: 'keep' });
  assert.deepEqual(await c.call('results.delete', { ids: [image.id] }), { deleted: [image.id], failed: [] });
  assert.deepEqual((await c.call('results.list')).map(x => x.id), [other.id]);
});

test('phone refresh starts the common account refresh and polling reads its progress', async t => {
  const f = await fixture(t), paired = await f.pair(), c = client(f, paired.data.token);
  t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  let calls = 0, refreshing = false, finish;
  f.m.refreshUsage = () => { calls++; refreshing = true; return new Promise(resolve => { finish = () => { refreshing = false; resolve(); }; }); };
  f.m.getUsage = () => ({ refreshing, usageChecks: [{ accountId: 'claude:default', status: refreshing ? 'refreshing' : 'current' }] });
  assert.equal((await c.call('usage', { refresh: true })).refreshing, true);
  assert.equal((await c.call('usage', {})).usageChecks[0].status, 'refreshing');
  assert.equal(calls, 1); finish();
  assert.equal((await c.call('usage', {})).usageChecks[0].status, 'current');
});

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

test('paired phones receive confirmed agent settings and configuration names without credentials', async t => {
  const f = await fixture(t), paired = (await f.pair()).data, c = client(f, paired.token);
  t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  const session = f.sessions.items.get('console-1');
  Object.assign(session, { provider: 'codex', providerSessionId: 'chat-one', model: '6.1 Sol', modelId: 'gpt-6.1-sol', effort: 'medium', settingsAt: 1234 });
  f.m.getModels = async () => [{ id: 'gpt-6.1-sol', name: '6.1 Sol', efforts: ['medium', 'max'], defaultEffort: 'medium' }];
  f.m.getSettings = () => ({ shared: { profiles: [{ id: 'api', name: 'API', url: 'private endpoint', keyId: 'key' }], connections: [{ id: 'tool', name: 'Tool', command: 'private command', envKeys: { TOKEN: 'key' }, enabled: true }], instructions: 'Shared instructions' }, keys: [{ id: 'key', label: 'Key name', value: 'PRIVATE_VALUE', encrypted: 'PRIVATE_ENCRYPTED' }] });
  const snapshot = await c.call('state');
  assert.deepEqual(Object.fromEntries(['providerSessionId', 'model', 'effort', 'settingsAt'].map(key => [key, snapshot.sessions[0][key]])), { providerSessionId: 'chat-one', model: 'gpt-6.1-sol', effort: 'medium', settingsAt: 1234 });
  assert.deepEqual((await c.call('console.models', { provider: 'codex' })).models[0].efforts, ['medium', 'max']);
  const settings = await c.call('settings.summary');
  assert.deepEqual(settings.keys, [{ id: 'key', name: 'Key name' }]);
  assert.equal(settings.instructions, 'Shared instructions');
  assert.ok(!/PRIVATE|private endpoint|private command|envKeys/.test(JSON.stringify(settings)));
  assert.deepEqual(f.sessions.writes, [], 'Reading choices never sends console input');
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

test('phone manages live console metadata with pinned launch identity', async t => {
  const f = await fixture(t), paired = (await f.pair()).data;
  const c = client(f, paired.token); await once(c.ws, 'open');
  t.after(() => c.ws.terminate());
  const session = f.sessions.items.get('console-1');
  Object.assign(session, { consoleKey: 'stable-console', launchId: 'launch-one', projectId: null });
  const projects = [
    { id: 'game', name: 'Game', color: '#ff0000', status: 'active', folders: [{ path: 'private' }] },
    { id: 'other', name: 'Other', status: 'active' },
    { id: 'old', name: 'Old', status: 'archived' },
  ];
  f.sessions.projects = { list: () => projects, get: id => projects.find(x => x.id === id) };
  const changes = [];
  f.sessions.rename = (id, name) => { changes.push(['rename', id, name]); session.name = name; f.sessions.emit('changed'); };
  f.sessions.assignProject = (id, projectId) => { changes.push(['project', id, projectId]); session.projectId = projectId; f.sessions.emit('changed'); return { ...session }; };
  const snapshot = await c.call('state');
  assert.ok(snapshot.capabilities.includes('console.manage'));
  assert.equal(snapshot.sessions[0].projectId, null);
  assert.deepEqual(snapshot.projects, [{ id: 'game', name: 'Game', color: '#ff0000' }, { id: 'other', name: 'Other' }]);
  const target = { id: session.id, consoleKey: session.consoleKey, launchId: session.launchId };
  await c.call('subscribe', { id: session.id });
  // Production history is immutable. Model a mutable result store here to
  // verify the RPC forwards the new name after the session rename succeeds.
  const storedResult = { consoleKey: 'stable-console', consoleName: session.name };
  const resultRenames = [];
  t.mock.method(f.results, 'renameConsole', (consoleKey, name) => {
    assert.equal(session.name, name);
    resultRenames.push({ consoleKey, name });
    if (storedResult.consoleKey === consoleKey) storedResult.consoleName = name;
  });
  await c.call('console.rename', { ...target, name: ' Review ' });
  assert.equal(session.name, 'Review');
  assert.equal(storedResult.consoleName, 'Review');
  assert.deepEqual(resultRenames, [{ consoleKey: 'stable-console', name: 'Review' }]);
  const renameSession = f.sessions.rename;
  f.sessions.rename = () => { throw new Error('Rename failed.'); };
  await assert.rejects(c.call('console.rename', { ...target, name: 'Must not reach results' }), /Rename failed/);
  assert.equal(storedResult.consoleName, 'Review');
  assert.equal(resultRenames.length, 1);
  f.sessions.rename = renameSession;
  for (const name of ['', '   ', 'x'.repeat(65), 'two\nlines', null, 42]) {
    await assert.rejects(c.call('console.rename', { ...target, name }), /name/);
  }
  await c.call('console.project', { ...target, projectId: 'game' });
  assert.equal((await c.call('state')).sessions[0].projectId, 'game');
  await c.call('console.project', { ...target, projectId: 'other' });
  assert.equal(session.projectId, 'other');
  await c.call('console.project', { ...target, projectId: null });
  assert.equal(session.projectId, null);
  for (const projectId of ['old', 'missing', {}, 1, undefined]) {
    await assert.rejects(c.call('console.project', { ...target, projectId }), /project/);
  }
  const count = changes.length;
  for (const method of ['console.rename', 'console.project']) {
    const payload = { ...target, name: 'Changed', projectId: 'game' };
    for (const stale of [{ consoleKey: 'old' }, { launchId: 'old' }, { consoleKey: null }, { launchId: null }, { id: 'missing' }]) {
      await assert.rejects(c.call(method, { ...payload, ...stale }), /This console changed\. Open its menu again\./);
    }
    for (const changed of [{ alive: false }, { dismissed: true }]) {
      Object.assign(session, changed);
      await assert.rejects(c.call(method, payload), /This console changed/);
      Object.assign(session, { alive: true, dismissed: false });
    }
    await c.call('subscribe', { id: 'console-2' });
    await assert.rejects(c.call(method, payload), /This console changed/);
    await c.call('subscribe', { id: session.id });
  }
  assert.equal(changes.length, count);
  session.remote = { hostId: 'vm' };
  // SSH consoles have a unique process id and console key, with no launch id.
  delete session.launchId;
  const remoteTarget = { ...target, launchId: null };
  await assert.rejects(c.call('console.rename', { ...target, name: 'Stale' }), /This console changed/);
  await c.call('console.rename', { ...remoteTarget, name: 'Remote review' });
  await c.call('console.project', { ...remoteTarget, projectId: 'game' });
  assert.equal(session.name, 'Remote review');
  assert.equal(session.projectId, 'game');
  assert.equal(session.launchId, undefined);
  assert.equal(session.alive, true);
  assert.deepEqual(f.sessions.writes, []);
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
  Object.assign(f.m.config, { mode: 'tailscale' });
  const nextState = await c.call('state');
  assert.deepEqual(nextState.connection, { url: `https://127.0.0.1:${f.port}`, name: f.m.name });
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

test('only Tailscale peers are accepted; pairing and revocation still work', async t => {
  const f = await fixture(t);
  const paired = await f.pair();
  const request = address => ({ headers: { authorization: 'Bearer ' + paired.data.token }, socket: { remoteAddress: address } });
  assert.equal(f.m.authenticate(request('8.8.8.8')), null, 'public peers are refused even with a valid token');
  assert.equal(f.m.authenticate(request('100.101.102.103')).id, paired.data.id);
  assert.equal(f.m.authenticate(request('::ffff:100.64.0.9')).id, paired.data.id);
  for (const address of ['8.8.8.8', '192.168.1.20', '169.254.1.1']) assert.equal(f.m.authenticate(request(address)), null, address);
  assert.equal(f.m.authenticate({ ...request('100.64.0.9'), headers: { authorization: 'Bearer wrong' } }), null);
  assert.equal(f.m.authenticate({ ...request('100.64.0.9'), headers: { ...request('').headers, origin: 'https://evil.example' } }), null);
  const invite = JSON.parse(Buffer.from((await f.m.invite()).code.slice(10), 'base64url'));
  assert.equal(invite.v, 1); assert.equal(invite.url, `https://127.0.0.1:${f.port}`); assert.equal(invite.pin, f.invite.pin); assert.equal(invite.localUrl, undefined);
  await assert.rejects(f.m.configure({ enabled: true, host: '127.0.0.1', mode: 'internet' }), /replaced by Tailscale/);
  await assert.rejects(f.m.configure({ enabled: true, host: '127.0.0.1', mode: 'local' }), /Same Wi-Fi connections were removed/);
  // The app itself accepts only 100.64.0.0/10: no loopback, LAN or Wi-Fi peers or addresses.
  f.m.tailnet = isTailscale;
  for (const address of ['127.0.0.1', '192.168.1.20', '10.0.0.4']) assert.equal(f.m.authenticate(request(address)), null, address);
  await assert.rejects(f.m.configure({ enabled: true, host: '127.0.0.1' }), /Tailscale address/);
  f.m.revoke(paired.data.id); assert.equal(f.m.authenticate(request('100.101.102.103')), null);
});
test('saved Wi-Fi and direct-internet connections turn off and ask for Tailscale, keeping paired phones', async t => {
  const f = await fixture(t);
  await f.pair(); await f.m.stop();
  const saved = JSON.parse(fs.readFileSync(f.m.file, 'utf8'));
  const sessions = new EventEmitter(); sessions.items = new Map(); sessions.list = () => [];
  const reopen = () => new MobileCompanion(path.dirname(f.m.file), safe, { sessions, results: new EventEmitter(), alerts: new AlertEvents(), getDefaults: () => ({}), getUsage: () => ({ limits: [], summary: {} }), testMode: true });
  for (const [old, router] of [[{ mode: 'local', host: '192.168.1.5' }, false], [{ mode: 'internet', host: '192.168.1.5', publicHost: 'old.duckdns.org', externalPort: 49000, duckKeyId: 'ddns', routerMode: 'automatic' }, true], [{ mode: undefined, host: '10.0.0.4' }, false]]) {
    fs.writeFileSync(f.m.file, JSON.stringify({ ...saved, ...old, enabled: true }));
    const m = reopen(), state = m.snapshot();
    assert.equal(state.mode, 'tailscale'); assert.equal(state.host, ''); assert.equal(state.publicHost, ''); assert.equal(state.duckKeyId, '');
    assert.equal(m.config.enabled, false);
    assert.match(state.notice, /only through Tailscale/); assert.equal(/port forward/.test(state.notice), router);
    assert.equal(state.devices.length, 1, 'paired phones stay paired');
    await m.start(); assert.equal(m.server, undefined, 'nothing listens on the old address');
    assert.match(reopen().snapshot().notice, /only through Tailscale/, 'the notice stays until Tailscale is set up');
  }
  // A Wi-Fi-era save that already used the Tailscale address keeps working.
  fs.writeFileSync(f.m.file, JSON.stringify({ ...saved, mode: 'local', host: '100.101.102.103', enabled: true }));
  const kept = reopen();
  assert.equal(kept.config.enabled, true); assert.equal(kept.config.host, '100.101.102.103'); assert.equal(kept.snapshot().notice, '');
});
test('terminal checkpoint carries a long answer, not only the last screens', async () => {
  const s = new TerminalStream({ buffer: '', sequence: 0, cols: 80, rows: 24 });
  try {
    s.write({ sequence: 1, data: Array.from({ length: 1500 }, (_, i) => 'answer line ' + i).join('\r\n') });
    const snapshot = await s.read(-1, 0);
    assert.ok(/answer line 0\s/.test(snapshot.data),'start of a 1500-line answer reaches the phone');
    assert.ok(snapshot.data.includes('answer line 1499'));
  } finally { s.dispose(); }
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
test('a saved Firebase sender key and phone registrations are erased on load', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-mobile-'));
  try {
    const saved = { devices: [{ id: 'phone', name: 'Phone', token: 't', pushToken: 'TEST_ONLY_PUSH' }], firebase: { public: { projectId: 'dock-test-123' }, credential: { private_key: 'TEST_ONLY_KEY' } } };
    fs.writeFileSync(path.join(root, 'mobile.json'), JSON.stringify({ enabled: false, host: '', port: 47831, encrypted: safe.encryptString(JSON.stringify(saved)).toString('base64') }));
    const m = new MobileCompanion(root, safe, { sessions: new EventEmitter(), results: new EventEmitter(), alerts: new AlertEvents(), testMode: true });
    assert.equal(m.private.firebase, undefined); assert.equal('pushToken' in m.private.devices[0], false);
    const stored = safe.decryptString(Buffer.from(JSON.parse(fs.readFileSync(path.join(root, 'mobile.json'), 'utf8')).encrypted, 'base64'));
    assert.doesNotMatch(stored, /TEST_ONLY_KEY|TEST_ONLY_PUSH|firebase/); assert.equal(JSON.parse(stored).devices[0].id, 'phone');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a phone queues messages only for the console it has open', async t => {
  const { MessageQueue } = require('../electron/message-queue.cjs');
  const f = await fixture(t), paired = await f.pair(), c = client(f, paired.data.token);
  t.after(() => c.ws.terminate());
  Object.assign(f.sessions.items.get('console-1'), { provider: 'codex', purpose: 'agent', state: 'active' });
  Object.assign(f.sessions.items.get('console-2'), { provider: 'codex', purpose: 'agent', state: 'active' });
  f.m.queue = new MessageQueue(f.sessions);
  await once(c.ws, 'open');
  await c.wait(x => x.type === 'state');
  await assert.rejects(c.call('queue.add', { id: 'console-1', text: 'hi' }), /Select an open console/);
  await c.call('subscribe', { id: 'console-1' });
  const entry = await c.call('queue.add', { id: 'console-1', text: 'Run the tests' });
  await assert.rejects(c.call('queue.add', { id: 'console-2', text: 'elsewhere' }), /Select an open console/);
  assert.deepEqual(f.m.publicState().queues['console-1'].entries.map(x => x.text), ['Run the tests']);
  assert.ok(f.m.publicState().capabilities.includes('console.queue'));
  await c.call('queue.edit', { id: 'console-1', entryId: entry.id, text: 'Run all tests' });
  assert.equal(f.m.publicState().queues['console-1'].entries[0].text, 'Run all tests');
  await assert.rejects(c.call('queue.edit', { id: 'console-2', entryId: entry.id, text: 'Wrong console' }), /Select an open console/);
  await c.call('queue.send', { id: 'console-1', entryId: entry.id });
  await assert.rejects(c.call('queue.edit', { id: 'console-1', entryId: entry.id, text: 'Too late' }), /already sent or removed/);
  assert.deepEqual(f.sessions.writes.map(x => x.data), ['Run all tests', '\r']);
  assert.equal(f.m.publicState().queues['console-1'], undefined);
});

test('phone prompt editing requires a prompt library', async t => {
  const f = await fixture(t), paired = await f.pair(), c = client(f, paired.data.token);
  t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  assert.ok(!f.m.publicState().capabilities.includes('prompts.edit'));
  await assert.rejects(c.call('prompts.save', { name: 'Tests', text: 'Run tests', scope: 'global' }), /Update Paddock/);
  await assert.rejects(c.call('prompts.remove', { id: 'missing' }), /Update Paddock/);
});

test('phone prompt management validates scope, projects and library limits', async t => {
  const f = await fixture(t, { withPrompts: true }), paired = await f.pair(), c = client(f, paired.data.token);
  t.after(() => c.ws.terminate()); await once(c.ws, 'open');
  f.sessions.projects = { get: id => id === 'project-one' ? { id } : id === 'archived' ? { id, status: 'archived' } : null };
  assert.ok(f.m.publicState().capabilities.includes('prompts.edit'));
  const global = await c.call('prompts.save', { name: ' Tests ', text: 'Run tests\r\nReport failures', scope: 'global' });
  await c.wait(x => x.type === 'state' && x.state.prompts.some(p => p.id === global.id));
  assert.equal(global.name, 'Tests'); assert.equal(global.text, 'Run tests\nReport failures'); assert.equal(global.projectId, null);
  const project = await c.call('prompts.save', { name: 'Review', text: 'Review changes', scope: 'project', projectId: 'project-one' });
  assert.equal(project.projectId, 'project-one');
  const created = await c.call('prompts.save', { id: project.id, name: 'New prompt', text: 'New text', scope: 'global' });
  assert.notEqual(created.id, project.id, 'phone-supplied IDs cannot overwrite existing prompts');
  assert.deepEqual(f.m.prompts.list().find(x => x.id === project.id), project);
  await c.call('prompts.remove', { id: created.id });
  for (const payload of [{ scope: 'bad' }, { scope: null }, { scope: 'global', projectId: 'project-one' }]) {
    await assert.rejects(c.call('prompts.save', { name: 'Bad', text: 'Text', ...payload }), /Choose This PC or a project/);
  }
  for (const projectId of ['missing', 'archived', '', null, {}, '../project-one']) {
    await assert.rejects(c.call('prompts.save', { name: 'Bad', text: 'Text', scope: 'project', projectId }), /existing project/);
  }
  for (const [payload, error] of [
    [{ name: '' }, /Name the prompt/],
    [{ name: 'x'.repeat(61) }, /60 characters/],
    [{ text: ' ' }, /Type the prompt text/],
    [{ text: 'x'.repeat(16001) }, /16000 characters/],
  ]) {
    await assert.rejects(c.call('prompts.save', { name: 'Bad', text: 'Text', scope: 'global', ...payload }), error);
  }
  assert.equal(f.m.prompts.list().length, 2, 'rejected prompts do not change the library');
  assert.equal(await c.call('prompts.remove', { id: global.id }), true);
  await c.wait(x => x.type === 'state' && x.state.prompts.some(p => p.id === project.id) && !x.state.prompts.some(p => p.id === global.id));
  assert.deepEqual(new PromptLibrary(f.root).list().map(x => x.id), [project.id]);
  await assert.rejects(c.call('prompts.remove', { id: global.id }), /already removed/);
  assert.deepEqual(f.sessions.writes, [], 'saving and deleting prompts never sends input');
});
