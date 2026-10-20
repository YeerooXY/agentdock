'use strict';
// Loopback-only synthetic terminal for the Android emulator. No CLI processes,
// model calls, production credentials, router changes or real Dock sessions.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), net = require('node:net');
const { EventEmitter } = require('node:events');
const { MobileCompanion } = require('../electron/mobile.cjs');
const out = path.resolve(__dirname, '../artifacts/mobile-controls');
fs.mkdirSync(out, { recursive: true });
fs.rmSync(path.join(out, 'stop'), { force: true });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-controls-test-'));
const key = crypto.randomBytes(32);
const storage = {
  isEncryptionAvailable: () => true,
  encryptString(value) {
    const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([c.update(value), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), encrypted]);
  },
  decryptString(value) {
    const c = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
    c.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([c.update(value.subarray(28)), c.final()]).toString();
  }
};
const sessions = new EventEmitter(), results = new EventEmitter(), inbox = new EventEmitter();
const session = { id: 'fixture', slot: 1, name: 'Mobile controls', provider: 'codex', state: 'ready', alive: true, cols: 180, rows: 32, buffer: '', sequence: 0, cwd: root };
fs.mkdirSync(path.join(root, 'src'));
fs.writeFileSync(path.join(root, 'src', 'mobile.dart'), '// Synthetic file, no project data.');
fs.writeFileSync(path.join(root, 'README.md'), '# Fixture');
let menu = false, effort = false, chosen = 0, pending = '', stopped = false, timer, showLinks = false, connections = 0;
function picture() {
  const lines = menu
    ? [effort ? 'Select Reasoning Level for Fixture model' : 'Select Model and Effort', '',
       `${chosen === 0 ? '>' : ' '} 1. ${effort ? 'Low' : 'Fixture model A'}`,
       `${chosen === 1 ? '>' : ' '} 2. ${effort ? 'High' : 'Fixture model B'}`, '',
       'enter select · s session only · esc back']
    : ['\x1b[36;1mMobile verification\x1b[0m', '', 'This paragraph is intentionally wider than a phone. The app should wrap it into readable lines without making the letters smaller or changing the terminal on your computer.', '',
       'Ready to review:', '  • Read and copy console text', '  • Choose commands and project files', '  • Open a Claude console', '',
       `The PC terminal still has ${session.cols} columns.`, '', 'src/mobile.dart', '  final mode = "wrap";', '', 'Synthetic output. No AI requests.'];
  return '\x1b[3J\x1b[2J\x1b[H' + lines.join('\r\n') + (menu ? '' : '\r\n\r\n' +
    (showLinks ? 'https://example.com/login?fixture=true&redirect_uri=https%3A%2F%2Fexample.com%2Fdone&scope=profile+terminal&state=fixture-only\r\n\r\n' : '') + '> ');
}
function draw() {
  const data = picture();
  session.buffer += data;
  sessions.emit('output', { id: session.id, data, sequence: ++session.sequence });
}
session.buffer = picture();
sessions.projects = { list: () => [{ id: 'fixture-project', name: 'Test project', status: 'active', folders: [{ label: 'Source', path: root }] }], get: id => id === 'fixture-project' ? sessions.projects.list()[0] : null };
sessions.ssh = { listMobile: () => [{ id: 'fixture-vm', name: 'Test Linux VM', folder: '/work', agents: ['claude'] }] };
sessions.items = new Map([[session.id, session]]);
sessions.list = () => [...sessions.items.values()];
sessions.writes = [];
sessions.write = (id, data) => {
  if (id !== session.id) throw new Error('Unknown test console');
  sessions.writes.push(data);
  if (menu) {
    if (data === '\x1b[A' || data === '\x1b[B') chosen = 1 - chosen;
    if (data === '\r' || data === 's') {
      if (!effort && session.provider === 'codex') { effort = true; chosen = 0; }
      else menu = false;
    }
    if (data === '\x1b') menu = false;
    draw();
  } else if (data === '\r') {
    menu = ['/model', '/effort'].includes(pending.trim());
    effort = pending.trim() === '/effort'; chosen = 0;
    pending = '';
    draw();
  } else {
    pending += data.replace(/\x1b\[(?:200|201)~/g, '');
    session.buffer += data;
    sessions.emit('output', { id, data, sequence: ++session.sequence });
  }
};
sessions.acknowledge = () => {};
sessions.cliSetup = { snapshot: () => ['codex', 'claude', 'gemini'].map(id => ({ id, installed: true })) };
sessions.create = options => {
  const created = { ...session, id: crypto.randomUUID(), slot: sessions.items.size + 1,
    name: options.name || 'New console', provider: options.provider, buffer: 'Synthetic console ready.\r\n> ', sequence: 0 };
  sessions.items.set(created.id, created); sessions.emit('changed'); return created;
};
sessions.end = id => { sessions.items.delete(id); sessions.emit('changed'); };
inbox.acknowledgeSession = () => {};
results.items = []; results.unreadGroups = () => 0; results.list = () => [];
inbox.items = [];
const mobile = new MobileCompanion(root, storage, {
  sessions, results, inbox, testMode: true,
  getModels: async () => [{ id: 'fixture-model', name: 'Fixture model (test)' }],
  getDefaults: () => ({ provider: 'codex', cwd: root }),
  getUsage: () => ({
    limits: process.env.DOCK_USAGE_FIXTURE === '1' ? [
      { provider: 'codex', name: 'Codex', observedAt: Date.now(), windows: [
        { minutes: 300, usedPercent: 38, resetsAt: Date.now() + 3600000 },
        { minutes: 10080, usedPercent: 0, resetsAt: Date.now() + 86400000 },
      ] },
      { provider: 'claude', name: 'Claude', observedAt: Date.now() - 1800000, windows: [
        { minutes: 300, usedPercent: 100, resetsAt: Date.now() - 3600000 },
        { minutes: 10080, usedPercent: null, resetsAt: null },
      ] },
    ] : [],
    summary: {},
  }),
});
(async () => {
  const reserve = net.createServer();
  await new Promise(r => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port;
  await new Promise(r => reserve.close(r));
  await mobile.configure({ enabled: true, name: 'Verification PC', host: '127.0.0.1', port });
  mobile.server.on('upgrade', () => connections++);
  mobile.on('pairing-requested', () => mobile.decidePairing({ id: mobile.pendingPairing.id, allow: true }));
  const invite = await mobile.invite();
  fs.writeFileSync(path.join(out, 'fixture.json'), JSON.stringify({ port, code: invite.code }));
  console.log('READY: isolated terminal fixture');
  timer = setInterval(() => {
    const control = path.join(out, 'control.json');
    if (fs.existsSync(control)) {
      const action = JSON.parse(fs.readFileSync(control));
      fs.rmSync(control);
      if (Number.isInteger(action.cols) && action.cols >= 40 && action.cols <= 300) {
        session.cols = action.cols;
        sessions.emit('resize', { id: session.id });
      }
      if (['codex', 'claude', 'opencode', 'gemini', 'shell'].includes(action.provider)) session.provider = action.provider;
      if (typeof action.links === 'boolean') showLinks = action.links;
      if (action.alert === true) { inbox.items.unshift({ id: crypto.randomUUID(), at: Date.now(), title: 'Fixture console is ready', kind: 'ready', read: false }); inbox.emit('changed'); }
      menu = false; draw(); sessions.emit('changed');
    }
    const attachments = path.join(root, '.agentdock', 'mobile-attachments');
    fs.writeFileSync(path.join(out, 'observed.json'), JSON.stringify({ cols: session.cols, rows: session.rows, writes: sessions.writes, connections, pairedDevices: mobile.private.devices.length, connectedDevices: mobile.clients.size, selected: [...mobile.clients].map(x => x.selected), directAlerts: mobile.private.devices.map(x => x.directAlerts === true), attachments: fs.existsSync(attachments) ? fs.readdirSync(attachments).length : 0 }));
    if (fs.existsSync(path.join(out, 'stop'))) void shutdown();
  }, 250);
  setTimeout(shutdown, 45 * 60000).unref();
})().catch(async e => { console.error(e.message); await shutdown(); process.exitCode = 1; });
async function shutdown() {
  if (stopped) return;
  stopped = true; clearInterval(timer);
  await mobile.stop();
  const resolved = fs.realpathSync(root), temp = fs.realpathSync(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(temp) || !path.basename(resolved).startsWith('dock-controls-test-')) throw new Error('Unexpected cleanup directory');
  fs.rmSync(resolved, { recursive: true, force: true });
}
