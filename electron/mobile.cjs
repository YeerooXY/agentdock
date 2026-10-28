'use strict';
const { encryptionUnavailable } = require('./platform.cjs');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { gzipSync } = require('node:zlib');
const { EventEmitter } = require('node:events');
const { WebSocketServer, WebSocket } = require('ws');
const { readJson, atomicJson } = require('./storage.cjs');
const { TerminalStream } = require('./mobile-stream.cjs');
const { isPrivate, isPublic, isTailscale, connectionOptions } = require('./mobile-address.cjs');
const { MobileNetwork } = require('./mobile-network.cjs');
const { consoleChoices, mobileLaunch, consoleFiles } = require('./mobile-console.cjs');
const { consoleModels } = require('./adapters.cjs');
const { MobileAttachments } = require('./mobile-attachments.cjs');
const { settingsSummary } = require('./mobile-settings.cjs');
const mobileProjects = require('./mobile-projects.cjs');
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
function deviceName(value) {
  if (typeof value !== 'string') throw new Error('Enter a device name.');
  const name = value.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  if (!name || [...name].length > 64) throw new Error('Use a name from 1 to 64 characters.');
  return name;
}
class MobileCompanion extends EventEmitter {
  constructor(root, safeStorage, { sessions, results, alerts, queue, prompts, getUsage, refreshUsage, getDefaults, getModels, getSettings, getKey, codePanel, networkScript, program, network, testMode = false, isTailnet = isTailscale } = {}) {
    super(); this.file = path.join(root, 'mobile.json'); this.crypto = safeStorage;
    this.queue = queue; this.prompts = prompts;
    this.sessions = sessions; this.results = results; this.getUsage = getUsage; this.getDefaults = getDefaults; this.testMode = testMode;
    this.getModels = getModels;
    this.refreshUsage = refreshUsage;
    this.getSettings = getSettings;
    // Tests substitute loopback; the app accepts only Tailscale's 100.64.0.0/10.
    this.tailnet = isTailnet;
    this.attachments = new MobileAttachments();
    this.code = new (require('./mobile-code.cjs').MobileCode)(sessions, codePanel);
    this.config = readJson(this.file, { enabled: false, host: '', port: 47831 });
    this.config.mappingId ||= crypto.randomUUID();
    // Phones connect only through Tailscale. A saved Wi-Fi or direct-internet
    // connection turns off until a Tailscale address is chosen; paired phones
    // stay paired and keep this PC's identity.
    if (this.config.host && !this.tailnet(this.config.host) || this.config.mode && this.config.mode !== 'tailscale') {
      const router = this.config.mode === 'internet', keep = this.tailnet(this.config.host);
      Object.assign(this.config, { mode: 'tailscale', publicHost: '', externalPort: 47831, routerMode: 'manual', duckKeyId: '' });
      if (!keep) {
        const configured = !!this.config.host;
        Object.assign(this.config, { enabled: false, host: '' });
        if (configured) this.config.notice = 'Phones now connect only through Tailscale, which other devices on your Wi-Fi cannot reach. Choose this PC’s Tailscale address below, then enter it in the phone app under Connection. Paired phones stay paired.' + (router ? ' Remove the old port forward from your router.' : '');
      }
      atomicJson(this.file, this.config);
    }
    this.notice = this.config.notice || '';
    this.network = network || new MobileNetwork({ getKey, script: networkScript, program, testMode, changed: () => this.emit('changed') });
    this.attempts = new Map(); this.attemptPeriod = Date.now(); this.attemptTotal = 0;
    this.private = { devices: [] }; this.clients = new Set(); this.streams = new Map(); this.liveAlerts = []; this.counters = { sent: 0, received: 0 }; this.error = ''; this.pairing = null; this.pendingPairing = null;
    if (this.config.encrypted) { try { this.private = JSON.parse(safeStorage.decryptString(Buffer.from(this.config.encrypted, 'base64'))); } catch { this.error = 'Mobile credentials could not be unlocked. Set up this PC again.'; this.config.enabled = false; } }
    // Firebase alerts were removed; drop a saved sender key and phone registrations.
    if (this.private.firebase || this.private.devices.some(x => 'pushToken' in x)) {
      delete this.private.firebase; for (const device of this.private.devices) delete device.pushToken;
      try { this.persist(); } catch {}
    }
    this.output = packet => {
      const previous = this.streams.get(packet.id), existing = !!previous;
      const generationChanged = previous && packet.launchId && previous.launchId !== packet.launchId;
      const stream = this.ensureStream(packet.id);
      // A newly created stream already includes this packet in session.buffer.
      if (existing && !generationChanged) stream?.write(packet);
    };
    this.resized = ({ id }) => { this.ensureStream(id); this.scheduleState(); };
    this.changed = () => {
      for (const [id, stream] of this.streams) if (!sessions.items.has(id) || sessions.items.get(id).dismissed || (sessions.items.get(id).launchId && sessions.items.get(id).launchId !== stream.launchId)) {
        const next = sessions.items.get(id); const epoch = stream.epoch + 1; stream.dispose(); this.streams.delete(id);
        if (next && !next.dismissed && this.server) this.streams.set(id, new TerminalStream(next, epoch));
      }
      this.scheduleState();
    };
    this.notification = item => {
      // A bounded, volatile delivery window supports already-paired phone builds.
      // It has no read state, persistence or notification-management API.
      this.liveAlerts = [...this.liveAlerts.slice(-49), { id: item.id, title: item.title, at: item.at }];
      this.scheduleState();
    };
    sessions.on('output', this.output); sessions.on('resize', this.resized); sessions.on('changed', this.changed); results.on('changed', this.changed); alerts?.on('notification', this.notification); queue?.on('changed', this.changed); prompts?.on?.('changed', this.changed);
    sessions.projects?.on?.('changed', this.changed);
  }
  available() { return this.crypto.isEncryptionAvailable() && this.crypto.getSelectedStorageBackend?.() !== 'basic_text'; }
  get name() { return this.config.name || os.hostname(); }
  rename({ id, name } = {}) {
    name = deviceName(name);
    const target = id === undefined ? this.config : this.private.devices.find(x => x.id === id);
    if (!target) throw new Error('This phone is no longer paired.');
    const before = target.name;
    target.name = name;
    try { this.persist(); } catch (error) { target.name = before; throw error; }
    this.scheduleState(); return true;
  }
  persist() {
    if (!this.available()) throw new Error(encryptionUnavailable());
    this.config.encrypted = this.crypto.encryptString(JSON.stringify(this.private)).toString('base64'); atomicJson(this.file, this.config); this.emit('changed');
  }
  snapshot() { const p = this.pendingPairing; return { notice: this.notice || '', name: this.name, enabled: !!this.server, host: this.config.host, port: this.config.port, mode: 'tailscale', publicHost: this.config.publicHost || '', externalPort: this.config.externalPort || 47831, routerMode: this.config.routerMode || 'manual', duckKeyId: this.config.duckKeyId || '', network: this.network.snapshot(), interfaces: interfaces(), error: this.error, devices: this.private.devices.map(({ id, name, at, directAlerts, lastInternetAt }) => ({ id, name, at, lastInternetAt, alerts: !!directAlerts, connected: [...this.clients].some(x => x.device.id === id) })), pairingExpires: this.pairing?.expires || 0, pendingPairing: p && p.expires > Date.now() && ['pending', 'approved'].includes(p.state) ? { id: p.id, name: p.name, code: p.code, expires: p.expires, state: p.state } : null, bytes: this.counters }; }
  async configure({ enabled, host, name, port = 47831, ...remote }) {
    if (this.network.firewallMutation) throw new Error('Wait for the current firewall change to finish before changing the connection.');
    if (!enabled) { await this.stop(); this.config.enabled = false; this.persist(); return; }
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a port from 1024 to 65535.');
    if (!this.available()) throw new Error(encryptionUnavailable());
    const options = connectionOptions(remote);
    if (!interfaces().some(x => x.address === host) || !this.tailnet(host)) throw new Error('Choose this PC’s Tailscale address (100.x). Install Tailscale and sign in if none is listed.');
    if (name !== undefined) options.name = deviceName(name);
    const changed = host !== this.config.host || port !== this.config.port || ['mode', 'publicHost', 'externalPort'].some(key => options[key] !== this.config[key]);
    if (changed) { for (const device of this.private.devices) delete device.lastInternetAt; }
    this.notice = ''; delete this.config.notice;
    await this.stop(); Object.assign(this.config, { enabled: true, host, port }, options); this.persist(); await this.start();
  }
  async start() {
    if (!this.config.enabled || this.server) return;
    if (!this.available()) throw new Error(encryptionUnavailable());
    if (!this.tailnet(this.config.host)) { this.error = 'Phones connect only through Tailscale. Choose this PC’s Tailscale address in Phone setup.'; this.emit('changed'); return; }
    if (!interfaces().some(x => x.address === this.config.host)) { this.error = 'This PC’s Tailscale address is unavailable. Turn on Tailscale on this PC, then try again.'; this.emit('changed'); return; }
    if (!this.private.identity) {
      const pems = await require('selfsigned').generate([{ name: 'commonName', value: 'Paddock' }], { keyType: 'ec', curve: 'P-256', algorithm: 'sha256', notBeforeDate: new Date(Date.now() - 60000), notAfterDate: new Date(Date.now() + 5 * 365 * 86400000) });
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
    if (req.headers.origin) return false;
    return this.tailnet(address);
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
    this.cancelPairing();
    this.pairing = { secret: token(), expires: Date.now() + 5 * 60000, attempts: 0 };
    const cert = new crypto.X509Certificate(this.private.identity.cert);
    const localUrl = `https://${this.config.host}:${this.config.port}`;
    const invite = { v: 1, approval: true, url: localUrl, pin: digest(cert.raw), secret: this.pairing.secret, expires: this.pairing.expires };
    this.emit('changed'); return { code: 'agentdock:' + Buffer.from(JSON.stringify(invite)).toString('base64url'), expires: invite.expires };
  }
  cancelPairing() {
    clearTimeout(this.pairingTimer); this.pairingTimer = null;
    this.pairing = null; this.pendingPairing = null; this.emit('changed');
  }
  decidePairing({ id, allow } = {}) {
    const p = this.pendingPairing;
    if (!p || p.id !== id || p.expires <= Date.now() || p.state !== 'pending') throw new Error('This phone request is no longer waiting.');
    if (typeof allow !== 'boolean') throw new Error('Choose Allow or Deny.');
    if (allow && this.private.devices.length >= 9) throw new Error('Remove an old phone before pairing another.');
    p.state = allow ? 'approved' : 'denied'; this.emit('changed');
  }
  async http(req, res) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST' || !['/v1/pair', '/v1/pair/status', '/v1/pair/cancel'].includes(req.url) || !this.acceptsPeer(req)) { res.writeHead(404); res.end('{}'); return; }
    if (!this.allowAttempt(req)) { res.writeHead(429); res.end('{}'); return; }
    const auth = req.headers.authorization?.replace(/^Bearer /, '') || '', p = this.pairing, pending = this.pendingPairing, initial = req.url === '/v1/pair';
    const validPending = pending && pending.expires > Date.now();
    if (initial ? !(p && p.expires > Date.now() && ++p.attempts <= 20 && match(auth, p.secret)) && !(validPending && match(digest(auth), pending.inviteHash)) : !(validPending && match(digest(auth), pending.keyHash))) { res.writeHead(401); res.end('{}'); return; }
    let text = '';
    try {
      for await (const chunk of req) { text += chunk; if (text.length > 2048) throw new Error(); }
      const data = JSON.parse(text);
      if (initial) {
        if (data.approval !== true) { res.writeHead(426); res.end(JSON.stringify({ error: 'Update the Android app to pair this PC.' })); return; }
        if (!/^[A-Za-z0-9_-]{43}$/.test(data.requestKey || '')) throw new Error();
        // A lost initial response may retry on the other route. Only the same
        // phone's random request key can recover that pending request.
        let request = this.pendingPairing;
        if (request && request.expires > Date.now() && match(digest(auth), request.inviteHash) && match(digest(data.requestKey), request.keyHash)) {
          if (request.state === 'denied') { res.writeHead(403); res.end('{}'); return; }
        } else {
          if (!p || this.pairing !== p || p.expires <= Date.now() || !match(auth, p.secret)) { res.writeHead(401); res.end('{}'); return; }
          const name = String(data.name || 'Android phone').replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 64) || 'Android phone';
          request = { id: crypto.randomUUID(), name, code: String(crypto.randomInt(100000, 1000000)), keyHash: digest(data.requestKey), inviteHash: digest(p.secret), expires: Date.now() + 120000, state: 'pending' };
          this.pairing = null; this.pendingPairing = request;
          clearTimeout(this.pairingTimer); this.pairingTimer = setTimeout(() => { if (this.pendingPairing === request) this.cancelPairing(); }, 120000); this.pairingTimer.unref();
          this.emit('changed'); this.emit('pairing-requested');
        }
        res.writeHead(202); res.end(JSON.stringify({ id: request.id, code: request.code, expires: request.expires, status: 'pending' })); return;
      }
      if (this.pendingPairing !== pending || pending.expires <= Date.now() || data.id !== pending.id) { res.writeHead(401); res.end('{}'); return; }
      if (req.url === '/v1/pair/cancel') {
        if (pending.device) this.revoke(pending.device.id);
        this.cancelPairing(); res.end('{}'); return;
      }
      if (pending.state === 'denied') { res.writeHead(403); res.end('{}'); return; }
      if (pending.state === 'pending') { res.writeHead(202); res.end(JSON.stringify({ status: 'pending' })); return; }
      if (!pending.device) {
        if (this.private.devices.length >= 9) { res.writeHead(409); res.end('{}'); return; }
        const device = { id: crypto.randomUUID(), name: pending.name, token: token(), at: Date.now() };
        this.private.devices.push(device);
        try { this.persist(); } catch (error) { this.private.devices = this.private.devices.filter(x => x !== device); throw error; }
        pending.device = device; pending.state = 'claimed'; this.emit('changed');
      }
      const device = pending.device;
      res.end(JSON.stringify({ id: device.id, token: device.token, name: this.name, v: 2 }));
    } catch { res.writeHead(400); res.end('{}'); }
  }
  ensureStream(id) {
    const s = this.sessions.items.get(id); if (!s || s.dismissed || !this.server) return null;
    const current = this.streams.get(id);
    if (current && s.launchId && current.launchId !== s.launchId) { const epoch = current.epoch + 1; current.dispose(); this.streams.delete(id); this.streams.set(id, new TerminalStream(s, epoch)); }
    else if (!current) this.streams.set(id, new TerminalStream(s));
    const stream = this.streams.get(id); stream.resize(s.cols, s.rows); return stream;
  }
  publicState() {
    const localUrl = `https://${this.config.host}:${this.config.port}`;
    const connection = { url: localUrl };
    connection.name = this.name;
    return { connection, projects: (typeof this.sessions.projects?.list === 'function' ? this.sessions.projects.list() || [] : []).filter(x => x.status !== 'archived').map(({ id, name, color }) => ({ id, name, ...(color ? { color } : {}) })), capabilities: [...(mobileProjects.available(this.sessions.projects) ? ['projects.read'] : []), 'code.read', 'results.thumbnails', 'results.actions', 'console.agents', 'console.files', 'console.close', 'console.projects', 'console.models', 'console.ssh', 'console.manage', 'console.switch', 'console.setup', 'alerts.direct', 'console.attachments', ...(this.queue ? ['console.queue'] : []), ...(this.prompts ? ['prompts', 'prompts.edit'] : [])], capacity: (this.sessions.grid?.columns || 3) * (this.sessions.grid?.rows || 3), sessions: this.sessions.list().filter(x => !x.dismissed).map(({ id, slot, name, provider, alive, state, cols, rows, consoleKey, projectId, remote, updatedAt, providerSessionId, model, modelId, effort, settingsAt, launchId, accountId, accountLabel, switchTargets, switching, purpose, draftSupported, switchOffer }) => ({ id, slot, name, provider, alive, state, cols, rows, consoleKey, projectId, remote, updatedAt, providerSessionId, model: modelId || model || null, modelName: model || null, effort: effort || null, settingsAt: settingsAt || null, launchId: launchId || null, accountId: accountId || null, accountLabel: accountLabel || null, switchTargets: switchTargets || [], switching: !!switching, purpose: purpose || 'agent', draftSupported: draftSupported === true, switchOffer: switchOffer || null })), queues: this.queue?.snapshot() || {}, prompts: this.prompts?.list() || [], alerts: this.liveAlerts, unreadResults: this.results.unreadGroups(), resultVersion: digest(this.results.list().map(x => x.id + ':' + x.seenAt + ':' + x.changeCount).join(',')).slice(0, 16) };
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
    // Closing a WebSocket is a handshake, not an authorization boundary.
    // Frames already buffered can still arrive after revoke/replacement.
    if (client.ws.readyState !== WebSocket.OPEN || !this.clients.has(client) || !this.private.devices.includes(client.device)) {
      throw new Error('This phone connection is no longer authorized.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid mobile request.');
    switch (method) {
      case 'projects.list': return mobileProjects.readProjects(this.sessions);
      case 'projects.detail': return mobileProjects.readProjects(this.sessions, payload.id, true);
      case 'state': return this.publicState();
      case 'device.rename': return this.rename({ id: client.device.id, name: payload.name });
      case 'subscribe': {
        if (payload.id && !this.sessions.items.has(payload.id)) throw new Error('This console is no longer open.');
        client.selected = payload.id || ''; client.sequence = Number.isSafeInteger(payload.sequence) ? payload.sequence : -1; client.epoch = Number.isSafeInteger(payload.epoch) ? payload.epoch : 0; client.saver = payload.saver !== false; client.lastFlush = 0; return true;
      }
      case 'input': {
        if (client.selected !== payload.id || !this.sessions.items.get(payload.id)?.alive) throw new Error('Select an open console first.');
        if (typeof payload.data !== 'string' || payload.data.length > 65536) throw new Error('Input is too large.');
        this.sessions.acknowledge(payload.id); this.sessions.write(payload.id, payload.data); return true;
      }
      case 'acknowledge': this.sessions.acknowledge(payload.id); return true;
      case 'queue.add': case 'queue.edit': case 'queue.remove': case 'queue.move': case 'queue.pause': case 'queue.send': {
        // Queue changes apply only to the console this phone has open.
        if (!this.queue) throw new Error('Update Paddock on your PC to queue messages.');
        if (client.selected !== payload.id) throw new Error('Select an open console first.');
        if (method === 'queue.add') return this.queue.add(payload.id, payload.text);
        if (method === 'queue.edit') {
          try { this.queue.edit(payload.id, payload.entryId, payload.text); }
          catch (error) {
            if (error.message === 'This console has no queued messages.') throw new Error('This queued message was already sent or removed.');
            throw error;
          }
          return true;
        }
        if (method === 'queue.remove') { this.queue.remove(payload.id, payload.entryId); return true; }
        if (method === 'queue.move') { this.queue.move(payload.id, payload.entryId, payload.offset); return true; }
        if (method === 'queue.pause') { this.queue.pause(payload.id, payload.paused === true); return true; }
        await this.queue.sendNow(payload.id, payload.entryId); return true;
      }
      case 'prompts.save': {
        if (!this.prompts) throw new Error('Update Paddock on your PC to manage prompts.');
        const scope = payload.scope === undefined ? (payload.projectId == null ? 'global' : 'project') : payload.scope;
        if (!['global', 'project'].includes(scope) || (scope === 'global' && payload.projectId != null)) throw new Error('Choose This PC or a project for the prompt.');
        const projectId = scope === 'project' ? payload.projectId : null;
        const project = typeof projectId === 'string' && /^[\w-]{1,64}$/.test(projectId) ? this.sessions.projects?.get(projectId) : null;
        if (scope === 'project' && (!project || project.status === 'archived')) throw new Error('Choose an existing project on this PC.');
        return this.prompts.save({ name: payload.name, text: payload.text, projectId });
      }
      case 'prompts.remove': {
        if (!this.prompts) throw new Error('Update Paddock on your PC to manage prompts.');
        this.prompts.remove(payload.id); return true;
      }
      case 'console.create': {
        return this.sessions.create(mobileLaunch(this.sessions, this.getDefaults(), payload));
      }
      case 'console.switch': {
        const session = this.sessions.items.get(payload.id);
        if (client.selected !== payload.id || !session?.alive || session.launchId !== payload.launchId || session.consoleKey !== payload.consoleKey || session.accountId !== payload.accountId) throw new Error('This console changed. Open its account menu again.');
        return this.sessions.switchAccount({ id: payload.id, launchId: payload.launchId, targetAccountId: payload.targetAccountId });
      }
      case 'console.rename': case 'console.project': {
        const session = this.sessions.items.get(payload.id);
        if (client.selected !== payload.id || !session?.alive || session.dismissed ||
            typeof payload.consoleKey !== 'string' || !payload.consoleKey ||
            !(typeof payload.launchId === 'string' && payload.launchId || payload.launchId === null && session.remote && !session.launchId) ||
            session.consoleKey !== payload.consoleKey || (session.launchId || null) !== payload.launchId) {
          throw new Error('This console changed. Open its menu again.');
        }
        if (method === 'console.rename') {
          if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 64 || /[\x00-\x1f\x7f]/.test(payload.name)) throw new Error('Use a name from 1 to 64 characters, on one line.');
          this.sessions.rename(payload.id, payload.name.trim());
          this.results.renameConsole(session.consoleKey, session.name);
          return true;
        }
        const project = typeof payload.projectId === 'string' ? this.sessions.projects?.get(payload.projectId) : null;
        if (payload.projectId !== null && (!project || project.status === 'archived')) throw new Error('Choose an existing project on this PC.');
        return this.sessions.assignProject(payload.id, payload.projectId);
      }
      case 'console.setup': {
        const session = this.sessions.items.get(payload.id);
        if (client.selected !== payload.id || !session?.alive || session.launchId !== payload.launchId || session.consoleKey !== payload.consoleKey || session.accountId !== payload.accountId) throw new Error('This console changed. Open its account menu again.');
        return this.sessions.createSetupConsole({ id: payload.id, launchId: payload.launchId, targetAccountId: payload.targetAccountId });
      }
      case 'console.agents': return consoleChoices(this.sessions, this.getDefaults());
      case 'console.models': {
        if (!['codex', 'claude'].includes(payload.provider)) return { models: [], livePicker: false };
        if (payload.provider === 'claude') return { models: consoleModels('claude').map(x => ({ ...x, efforts: ['low', 'medium', 'high', 'xhigh', 'max'] })), livePicker: false };
        if (!this.getModels) return { models: consoleModels('codex'), livePicker: false };
        let models;
        try { models = await this.getModels(payload.provider); } catch { models = consoleModels(payload.provider); }
        if (client.ws.readyState !== WebSocket.OPEN || !this.clients.has(client) || !this.private.devices.includes(client.device)) throw new Error('Connection changed.');
        this.sessions.mobileModels ||= new Map();
        this.sessions.mobileModels.set(payload.provider, new Set(models.map(x => x.id)));
        return { models, livePicker: true };
      }
      case 'settings.summary': {
        if (!this.getSettings) throw new Error('PC settings are unavailable. Update Paddock on your PC.');
        return settingsSummary(this.getSettings());
      }
      case 'code.list': case 'code.read': {
        const session = this.sessions.items.get(payload.consoleId);
        if (client.selected !== payload.consoleId) throw new Error('Select an open console first.');
        if (client.codeRequest) throw new Error('Wait for the code request.');
        client.codeRequest = true;
        try {
          const roots = JSON.stringify(this.code.roots(session));
          const value = await this.code.call(method, session, payload.path);
          if (client.ws.readyState !== WebSocket.OPEN || !this.clients.has(client) ||
              !this.private.devices.includes(client.device) || client.selected !== payload.consoleId ||
              this.sessions.items.get(payload.consoleId) !== session || session.dismissed ||
              JSON.stringify(this.code.roots(session)) !== roots) throw new Error('Console or connection changed. Reopen Code.');
          return value;
        } finally { client.codeRequest = false; }
      }
      case 'console.files': {
        const session = this.sessions.items.get(payload.id);
        if (session?.remote) throw new Error('Remote files are available through the SSH terminal.');
        if (client.selected !== payload.id || !session || session.dismissed) throw new Error('Select an open console first.');
        if (client.fileRequest) throw new Error('Wait for the file list.');
        client.fileRequest = true;
        try {
          const value = await consoleFiles(session, payload);
          if (client.ws.readyState !== WebSocket.OPEN || !this.clients.has(client) ||
              !this.private.devices.includes(client.device) || client.selected !== payload.id ||
              this.sessions.items.get(payload.id) !== session || session.dismissed) throw new Error('Console or connection changed. Reopen Files.');
          return value;
        } finally { client.fileRequest = false; }
      }
      case 'console.close': {
        const session = this.sessions.items.get(payload.id);
        if (payload.confirm !== true || client.selected !== payload.id || !session || session.dismissed) throw new Error('Confirm closing the selected console.');
        await this.sessions.end(payload.id);
        client.selected = '';
        return true;
      }
      case 'attachment.begin': {
        if (client.selected !== payload.id) throw new Error('Select a console first.');
        return this.attachments.begin(client, this.sessions.items.get(payload.id), payload.size);
      }
      case 'attachment.chunk': return this.attachments.chunk(client, payload);
      case 'attachment.finish': return this.attachments.finish(client, payload, () =>
        client.ws.readyState === WebSocket.OPEN && this.clients.has(client) && this.private.devices.includes(client.device));
      case 'results.list': return this.results.list().map(({ id, title, kind, status, summary, at, size, image, ext, groupId, sessionId, consoleKey, consoleName, seenAt, project, projectId, changeCount, git, gitEnd }) => ({ id, title, kind, status, summary, at, size, image, ext, groupId, sessionId, consoleKey, consoleName, seenAt, project, projectId, changeCount, git, gitEnd }));
      case 'results.preview': {
        if (typeof payload.id !== 'string' || !/^[a-f0-9-]{36}$/.test(payload.id)) throw new Error('Choose a result.');
        if (payload.thumbnail !== undefined && typeof payload.thumbnail !== 'boolean') throw new Error('Invalid thumbnail option.');
        const value = await this.results.preview(payload.id, payload.thumbnail !== false, payload.entry);
        if (JSON.stringify(value).length > 3 * 1024 * 1024) throw new Error('This preview is too large. Open it on your PC.');
        return value;
      }
      case 'results.seen': return this.results.markSeen(payload.ids);
      case 'results.delete': return this.results.remove(payload.ids);
      case 'usage':
        if (payload.refresh === true) this.refreshUsage?.().catch(() => {});
        return this.getUsage();
      case 'alerts.mode':
        if (typeof payload.direct !== 'boolean') throw new Error('Choose a notification mode.');
        client.device.directAlerts = payload.direct; this.persist(); return true;
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
  revoke(id) { this.private.devices = this.private.devices.filter(x => x.id !== id); for (const client of this.clients) if (client.device.id === id) client.ws.close(1008, 'Phone removed'); this.persist(); }
  async stop() {
    clearInterval(this.timer); clearTimeout(this.stateTimer); this.stateTimer = null; this.cancelPairing();
    for (const client of this.clients) client.ws.terminate(); this.clients.clear(); this.wss?.close();
    for (const stream of this.streams.values()) stream.dispose(); this.streams.clear();
    const server = this.server; this.server = null; server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve));
    await this.network.stop(); this.emit('changed');
  }
}
module.exports = { MobileCompanion, interfaces, isPrivate };
