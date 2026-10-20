'use strict';
const { AlertEvents } = require('../electron/alerts.cjs');
// Two disposable PCs for Android-emulator checks. No real shells, credentials,
// router changes, model calls or Firebase requests are used.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), net = require('node:net');
const { EventEmitter } = require('node:events');
const { MobileCompanion } = require('../electron/mobile.cjs');
const out = path.resolve(__dirname, '../artifacts/multi-device'); fs.mkdirSync(out, { recursive: true });
fs.rmSync(path.join(out, 'stop'), { force: true });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-multi-device-'));
const hosts = [];
const key = crypto.randomBytes(32);
const storage = { isEncryptionAvailable: () => true,
  encryptString(value) { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const encrypted = Buffer.concat([cipher.update(value), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), encrypted]); },
  decryptString(value) { const cipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); cipher.setAuthTag(value.subarray(12, 28)); return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString(); }
};
(async () => {
  for (const name of ['Studio PC', 'Windows VM']) {
    const sessions = new EventEmitter(), results = new EventEmitter(), alerts = new AlertEvents();
    sessions.items = new Map([['console', { id: 'console', slot: 1, name: name === 'Studio PC' ? 'Trader' : 'Game prototype', provider: 'shell', state: 'open', alive: true, cols: 60, rows: 20, buffer: name + '\r\nFixture console ready\r\n', sequence: 0 }]]);
    sessions.list = () => [...sessions.items.values()]; sessions.writes = [];
    sessions.write = (id, data) => { sessions.writes.push(data); const s = sessions.items.get(id); s.buffer += data; sessions.emit('output', { id, data, sequence: ++s.sequence }); };
    sessions.acknowledge = () => {};
    results.items = []; results.unreadGroups = () => 0; results.list = () => [];
    const folder = path.join(root, String(hosts.length)); fs.mkdirSync(folder);
    const mobile = new MobileCompanion(folder, storage, { sessions, results, alerts, testMode: true, getDefaults: () => ({}), getUsage: () => ({ limits: [], summary: {} }) });
    const reserve = net.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise(r => reserve.close(r));
    await mobile.configure({ enabled: true, name, host: '127.0.0.1', port });
    const invite = await mobile.invite();
    mobile.on('pairing-requested', () => mobile.decidePairing({ id: mobile.pendingPairing.id, allow: true }));
    hosts.push({ mobile, sessions, port, name, code: invite.code });
  }
  fs.writeFileSync(path.join(out, 'fixture.json'), JSON.stringify(hosts.map(({ name, port, code }) => ({ name, port, code }))));
  console.log('READY: two isolated test PCs');
  const timer = setInterval(() => {
    fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify(hosts.map(({ mobile, sessions, name }) => ({ name, phones: mobile.snapshot().devices, writes: sessions.writes }))));
    if (fs.existsSync(path.join(out, 'stop'))) { clearInterval(timer); shutdown(); }
  }, 250);
  setTimeout(() => { clearInterval(timer); shutdown(); }, 20 * 60000).unref();
})().catch(async error => { console.error(error.message); await shutdown(); process.exitCode = 1; });
async function shutdown() { for (const { mobile } of hosts) await mobile.stop(); fs.rmSync(root, { recursive: true, force: true }); }
