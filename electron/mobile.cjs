'use strict';
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { EventEmitter } = require('node:events');
const { WebSocketServer, WebSocket } = require('ws');
const { readJson, atomicJson } = require('./storage.cjs');
const { TerminalStream } = require('./mobile-stream.cjs');
const { MobilePush, publicConfig, serviceAccount } = require('./mobile-push.cjs');
const { isPrivate, isPublic, internetOptions } = require('./mobile-address.cjs');
const { MobileNetwork } = require('./mobile-network.cjs');
const token = () => crypto.randomBytes(32).toString('base64url');
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const match = (value, stored) => {
  if (typeof value !== 'string' || typeof stored !== 'string') return false;
  const a = Buffer.from(value), b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
function interfaces() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, addresses]) => addresses.filter(a => a.family === 'IPv4' && isPrivate(a.address)).map(a => ({ name, address: a.address, tailscale: /^100\./.test(a.address), local: a.internal }))).sort((a, b) => Number(b.tailscale) - Number(a.tailscale));
}
class MobileCompanion extends EventEmitter {
  constructor(root, safeStorage, { sessions, results, inbox, getUsage, getDefaults, getKey, networkScript, program, network, testMode = false } = {}) {
    super(); this.file = path.join(root, 'mobile.json'); this.crypto = safeStorage;
    this.sessions = sessions; this.results = results; this.inbox = inbox; this.getUsage = getUsage; this.getDefaults = getDefaults; this.testMode = testMode;
    this.config = readJson(this.file, { enabled: false, host: '', port: 47831 });
    this.config.mappingId ||= crypto.randomUUID();
    this.network = network || new MobileNetwork({ getKey, script: networkScript, program, testMode, changed: () => this.emit('changed') });
    this.attempts = new Map(); this.attemptPeriod = Date.now(); this.attemptTotal = 0;
    this.private = { devices: [] }; this.clients = new Set(); this.streams = new Map(); this.sent = new Set(); this.counters = { sent: 0, received: 0 }; this.error = ''; this.pairing = null;
    if (this.config.encrypted) { try { this.private = JSON.parse(safeStorage.decryptString(Buffer.from(this.config.encrypted, 'base64'))); } catch { this.error = 'Mobile credentials could not be unlocked. Set up this PC again.'; this.config.enabled = false; } }
    this.push = new MobilePush({ credential: () => this.private.firebase?.credential });
    this.output = packet => {
      const existing = this.streams.has(packet.id), stream = this.ensureStream(packet.id);
      // A newly created stream already includes this packet in session.buffer.
      if (existing) stream?.write(packet);
    };
    this.resized = ({ id }) => { this.ensureStream(id); this.scheduleState(); };
    this.changed = () => {
      for (const [id, stream] of this.streams) if (!sessions.items.has(id) || sessions.items.get(id).dismissed) { stream.dispose(); this.streams.delete(id); }
      this.scheduleState();
    };
    this.alerts = () => {
      for (const item of inbox.items.filter(x => !x.read && ['ready', 'question', 'error'].includes(x.kind))) {
        if (this.sent.has(item.id)) continue; this.sent.add(item.id);
        if (this.config.enabled && !testMode) this.sendPush(item.id).catch(() => {});
      }
      if (this.sent.size > 500) this.sent = new Set(inbox.items.map(x => x.id));
    };
    for (const item of inbox.items) this.sent.add(item.id);
    sessions.on('output', this.output); sessions.on('resize', this.resized); sessions.on('changed', this.changed); results.on('changed', this.changed); inbox.on('changed', this.alerts);
  }
  available() { return this.crypto.isEncryptionAvailable() && this.crypto.getSelectedStorageBackend?.() !== 'basic_text'; }
  persist() {
    if (!this.available()) throw new Error('Windows credential encryption is unavailable.');
    this.config.encrypted = this.crypto.encryptString(JSON.stringify(this.private)).toString('base64'); atomicJson(this.file, this.config); this.emit('changed');
  }
  snapshot() { return { enabled: !!this.server, host: this.config.host, port: this.config.port, mode: this.config.mode || 'local', publicHost: this.config.publicHost || '', externalPort: this.config.externalPort || 47831, routerMode: this.config.routerMode || 'manual', duckKeyId: this.config.duckKeyId || '', network: this.network.snapshot(), interfaces: interfaces(), error: this.error, devices: this.private.devices.map(({ id, name, at, pushToken, lastInternetAt }) => ({ id, name, at, lastInternetAt, alerts: !!pushToken, connected: [...this.clients].some(x => x.device.id === id) })), push: { project: this.private.firebase?.public.projectId || '', configured: !!this.private.firebase?.credential, error: this.push.error, lastSent: this.push.lastSent }, pairingExpires: this.pairing?.expires || 0, bytes: this.counters }; }
  async configure({ enabled, host, port = 47831, ...remote }) {
    if (!enabled) { await this.stop(); this.config.enabled = false; this.persist(); return; }
    if (!interfaces().some(x => x.address === host) || !isPrivate(host)) throw new Error('Choose this PC’s private network address.');
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a port from 1024 to 65535.');
    if (!this.available()) throw new Error('Windows credential encryption is unavailable.');
    const options = internetOptions(remote);
    if (options.mode === 'internet' && (host.startsWith('127.') || /^100\./.test(host))) throw new Error('Use your Wi-Fi or Ethernet address for direct internet.');
    const changed = host !== this.config.host || port !== this.config.port || ['mode', 'publicHost', 'externalPort'].some(key => options[key] !== this.config[key]);
    if (changed) { for (const device of this.private.devices) delete device.lastInternetAt; this.network.state.firewall = ''; }
    await this.stop(); Object.assign(this.config, { enabled: true, host, port }, options); this.persist(); await this.start();
  }
  async start() {
    if (!this.config.enabled || this.server) return;
    if (!this.available()) throw new Error('Windows credential encryption is unavailable.');
    if (!interfaces().some(x => x.address === this.config.host)) { this.error = 'That network address is unavailable. Choose another address in Phone setup.'; this.emit('changed'); return; }
    if (!this.private.identity) {
      const pems = await require('selfsigned').generate([{ name: 'commonName', value: 'Agent Dock' }], { keyType: 'ec', curve: 'P-256', algorithm: 'sha256', notBeforeDate: new Date(Date.now() - 60000), notAfterDate: new Date(Date.now() + 5 * 365 * 86400000) });
      this.private.identity = { cert: pems.cert, key: pems.private }; this.persist();
    }
    const server = https.createServer({ cert: this.private.identity.cert, key: this.private.identity.key, minVersion: 'TLSv1.2' }, (req, res) => this.http(req, res));
    const wss = new WebSocketServer({ noServer: true, maxPayload: 70000, perMessageDeflate: false });
    server.on('upgrade', (req, socket, head) => {
      const device = this.authenticate(req);
      if (!device || req.url !== '/v1/events' || this.clients.size >= 9) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
      wss.handleUpgrade(req, socket, head, ws => this.attach(ws, device));
    });
    server.headersTimeout = 5000; server.requestTimeout = 10000; server.maxConnections = 32;
    try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(this.config.port, this.config.host, () => { server.off('error', reject); resolve(); }); }); }
    catch { wss.close(); this.error = 'The mobile port could not open. Check the address and port.'; this.emit('changed'); throw new Error(this.error); }
    server.on('error', () => { this.error = 'The mobile connection stopped.'; this.emit('changed'); });
    this.server = server; this.wss = wss; this.error = '';
    for (const s of this.sessions.items.values()) this.ensureStream(s.id);
    this.timer = setInterval(() => this.flush(), 100); this.timer.unref(); this.emit('changed');
    await this.network.start({ ...this.config });
  }
  acceptsPeer(req) {
    const address = req.socket.remoteAddress?.replace('::ffff:', '') || '';
    return !req.headers.origin && (isPrivate(address) || this.config.mode === 'internet' && isPublic(address));
  }
  allowAttempt(req) {
    const now = Date.now();
    if (now - this.attemptPeriod > 60000) { this.attemptPeriod = now; this.attemptTotal = 0; this.attempts.clear(); }
    if (++this.attemptTotal > 240) return false;
    const address = req.socket.remoteAddress || '', count = (this.attempts.get(address) || 0) + 1;
    this.attempts.set(address, count); return count <= 30;
  }
  authenticate(req) {
    if (!this.acceptsPeer(req) || !this.allowAttempt(req)) return null;
    const bearer = req.headers.authorization?.replace(/^Bearer /, '');
    return this.private.devices.find(x => match(bearer, x.token)) || null;
  }
  async invite() {
    if (!this.server) throw new Error('Enable the mobile connection first.');
    if (this.private.devices.length >= 9) throw new Error('Remove an old phone before pairing another.');
    this.pairing = { secret: token(), expires: Date.now() + 5 * 60000, attempts: 0 };
    const cert = new crypto.X509Certificate(this.private.identity.cert);
    const localUrl = `https://${this.config.host}:${this.config.port}`;
    const invite = { v: this.config.mode === 'internet' ? 2 : 1, url: localUrl, pin: digest(cert.raw), secret: this.pairing.secret, expires: this.pairing.expires };
    if (this.config.mode === 'internet') Object.assign(invite, { mode: 'internet', url: `https://${this.config.publicHost}:${this.config.externalPort}`, localUrl });
    this.emit('changed'); return { code: 'agentdock:' + Buffer.from(JSON.stringify(invite)).toString('base64url'), expires: invite.expires };
  }
  async http(req, res) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST' || req.url !== '/v1/pair' || !this.acceptsPeer(req)) { res.writeHead(404); res.end('{}'); return; }
    if (!this.allowAttempt(req)) { res.writeHead(429); res.end('{}'); return; }
    const p = this.pairing;
    if (!p || p.expires < Date.now() || ++p.attempts > 20 || !match(req.headers.authorization?.replace(/^Bearer /, ''), p.secret)) { res.writeHead(401); res.end('{}'); return; }
    let text = '';
    try {
      for await (const chunk of req) { text += chunk; if (text.length > 2048) throw new Error(); }
      const data = JSON.parse(text), name = String(data.name || 'Android phone').replace(/[\x00-\x1f]/g, '').trim().slice(0, 64);
      if (this.pairing !== p || p.expires < Date.now()) throw new Error();
      const device = { id: crypto.randomUUID(), name, token: token(), at: Date.now(), pushToken: '' };
      this.private.devices.push(device); this.pairing = null; this.persist();
      res.end(JSON.stringify({ id: device.id, token: device.token, name: os.hostname(), v: 1 }));
    } catch { res.writeHead(400); res.end('{}'); }
  }
  ensureStream(id) {
    const s = this.sessions.items.get(id); if (!s || s.dismissed || !this.server) return null;
    if (!this.streams.has(id)) this.streams.set(id, new TerminalStream(s));
    const stream = this.streams.get(id); stream.resize(s.cols, s.rows); return stream;
  }
  publicState() {
    return { capacity: (this.sessions.grid?.columns || 3) * (this.sessions.grid?.rows || 3), sessions: this.sessions.list().map(({ id, slot, name, provider, alive, state, cols, rows, consoleKey }) => ({ id, slot, name, provider, alive, state, cols, rows, consoleKey })), unreadResults: this.results.unreadGroups(), resultVersion: digest(this.results.items.map(x => x.id + ':' + x.seenAt).join(',')).slice(0, 16) };
  }
  scheduleState() {
    if (!this.server || this.stateTimer) return;
    this.stateTimer = setTimeout(() => { this.stateTimer = null; const state = this.publicState(); for (const client of this.clients) this.send(client, { type: 'state', state }); }, 150);
  }
  send(client, value) {
    if (client.ws.readyState !== WebSocket.OPEN) return false;
    if (client.ws.bufferedAmount > 2 * 1024 * 1024) { client.ws.close(1013, 'Reconnect to catch up'); return false; }
    const text = JSON.stringify(value), buffer = Buffer.from(text), compressed = buffer.length > 512 ? gzipSync(buffer) : null;
    const packet = compressed && compressed.length < buffer.length ? compressed : text;
    this.counters.sent += Buffer.byteLength(packet); client.ws.send(packet); return true;
  }
  attach(ws, device) {
    if (isPublic(ws._socket?.remoteAddress?.replace('::ffff:', '') || '')) { device.lastInternetAt = Date.now(); this.persist(); }
    for (const old of this.clients) if (old.device.id === device.id) old.ws.close(1000, 'Opened on another connection');
    const client = { ws, device, selected: '', sequence: -1, epoch: 0, saver: true, requests: 0, period: Date.now(), inflight: false, seen: new Set() };
    this.clients.add(client); this.send(client, { type: 'state', state: this.publicState() }); this.emit('changed');
    ws.on('message', async (raw, binary) => {
      this.counters.received += raw.length;
      if (Date.now() - client.period >= 1000) { client.period = Date.now(); client.requests = 0; }
      if (binary || ++client.requests > 150) { ws.close(1008, 'Too many requests'); return; }
      let request;
      try {
        request = JSON.parse(raw.toString());
        if (typeof request.id !== 'string' || request.id.length > 80 || client.seen.has(request.id)) throw new Error('Duplicate or invalid request.');
        client.seen.add(request.id); if (client.seen.size > 1000) client.seen.delete(client.seen.values().next().value);
        const value = await this.call(client, request.method, request.payload);
        this.send(client, { type: 'reply', id: request.id, value });
      } catch (error) { this.send(client, { type: 'reply', id: typeof request?.id === 'string' ? request.id.slice(0, 80) : '', error: error.message || 'The request failed.' }); }
    });
    ws.on('error', () => {}); ws.on('close', () => { this.clients.delete(client); this.emit('changed'); });
  }
  async call(client, method, payload = {}) {
    switch (method) {
      case 'state': return this.publicState();
      case 'subscribe': {
        if (payload.id && !this.sessions.items.has(payload.id)) throw new Error('This console is no longer open.');
        client.selected = payload.id || ''; client.sequence = Number.isSafeInteger(payload.sequence) ? payload.sequence : -1; client.epoch = Number.isSafeInteger(payload.epoch) ? payload.epoch : 0; client.saver = payload.saver !== false; client.lastFlush = 0; return true;
      }
      case 'input': {
        if (client.selected !== payload.id || !this.sessions.items.get(payload.id)?.alive) throw new Error('Select an open console first.');
        if (typeof payload.data !== 'string' || payload.data.length > 65536) throw new Error('Input is too large.');
        this.sessions.acknowledge(payload.id); this.inbox.acknowledgeSession(payload.id); this.sessions.write(payload.id, payload.data); return true;
      }
      case 'acknowledge': this.sessions.acknowledge(payload.id); this.inbox.acknowledgeSession(payload.id); return true;
      case 'console.create': {
        const defaults = this.getDefaults(); return this.sessions.create({ ...defaults, name: typeof payload.name === 'string' ? payload.name.slice(0, 64) : defaults.name });
      }
      case 'results.list': return this.results.list().map(({ id, title, kind, status, summary, at, size, image, ext, groupId, sessionId, consoleKey, consoleName, seenAt }) => ({ id, title, kind, status, summary, at, size, image, ext, groupId, sessionId, consoleKey, consoleName, seenAt }));
      case 'results.preview': { const value = await this.results.preview(payload.id, payload.thumbnail !== false, payload.entry); if (JSON.stringify(value).length > 3 * 1024 * 1024) throw new Error('This preview is too large. Open it on your PC.'); return value; }
      case 'results.seen': return this.results.markSeen(payload.ids);
      case 'results.delete': return this.results.remove(payload.ids);
      case 'usage': return this.getUsage();
      case 'push.config': return this.private.firebase?.public || null;
      case 'push.register': {
        if (typeof payload.token !== 'string' || payload.token.length > 4096 || /[\s\x00]/.test(payload.token)) throw new Error('Invalid notification registration.');
        client.device.pushToken = payload.token; this.persist(); return true;
      }
      case 'push.test': if (this.testMode) throw new Error('Push requests are disabled in tests.'); return this.push.send(client.device.pushToken);
      case 'ping': return true;
      default: throw new Error('This mobile action is unavailable.');
    }
  }
  async flush() {
    for (const client of this.clients) {
      if (!client.selected || client.inflight || Date.now() - (client.lastFlush || 0) < (client.saver ? 250 : 100)) continue;
      const stream = this.ensureStream(client.selected); if (!stream) continue;
      client.inflight = true; const selected = client.selected;
      try { const chunk = await stream.read(client.sequence, client.epoch); if (selected !== client.selected) continue;
        if ((chunk.data || chunk.reset) && this.send(client, { type: 'terminal', id: selected, ...chunk })) { client.sequence = chunk.sequence; client.epoch = chunk.epoch; }
      } finally { client.inflight = false; client.lastFlush = Date.now(); }
    }
  }
  configureFirebase(rawPublic, rawPrivate) {
    const options = publicConfig(rawPublic), credential = serviceAccount(rawPrivate, options.projectId);
    if (this.private.firebase?.public.projectId !== options.projectId) for (const device of this.private.devices) device.pushToken = '';
    this.private.firebase = { public: options, credential }; this.push.cached = null; this.persist(); return this.snapshot();
  }
  removeFirebase() { delete this.private.firebase; for (const d of this.private.devices) d.pushToken = ''; this.push.cached = null; this.persist(); }
  async sendPush(id = 'test', deviceId) {
    const devices = this.private.devices.filter(x => x.pushToken && (!deviceId || x.id === deviceId));
    if (!devices.length || !this.private.firebase) { if (id === 'test') throw new Error('Enable alerts on your paired phone first.'); return; }
    const results = await Promise.allSettled(devices.map(x => this.push.send(x.pushToken, id)));
    this.emit('changed'); if (results.some(x => x.status === 'rejected')) throw new Error(this.push.error);
  }
  revoke(id) { this.private.devices = this.private.devices.filter(x => x.id !== id); for (const client of this.clients) if (client.device.id === id) client.ws.close(1008, 'Phone removed'); this.persist(); }
  async stop() {
    clearInterval(this.timer); clearTimeout(this.stateTimer); this.stateTimer = null; this.pairing = null;
    for (const client of this.clients) client.ws.terminate(); this.clients.clear(); this.wss?.close();
    for (const stream of this.streams.values()) stream.dispose(); this.streams.clear();
    const server = this.server; this.server = null; server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve));
    await this.network.stop(); this.emit('changed');
  }
}
module.exports = { MobileCompanion, interfaces, isPrivate };
