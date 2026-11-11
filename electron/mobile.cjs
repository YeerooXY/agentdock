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
const { MobileAttachments } = require('./mobile-attachments.cjs');
const mobileProjects = require('./mobile-projects.cjs');
const { MobilePreview } = require('./mobile-preview.cjs');
const { consoleCapabilities } = require('./worker-placement.cjs');
const { imageJobs, resumableImageJob } = require('./mobile-images.cjs');
const { StateConnection } = require('./state-sync.cjs');
const { createMobileCommands } = require('./mobile-commands.cjs');
const { screenProfiles } = require('./providers/index.cjs');
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
function mobileSession(item, sessions) {
  const { id, slot, name, provider, alive, state, cols, rows, consoleKey, projectId, remote, updatedAt,
    providerSessionId, model, modelId, effort, settingsAt, requestedSettings, launchId, accountId, accountLabel, switchTargets,
    switching, purpose, draftSupported, worktree, taskId, sliceId, steeringState, steeringSupported, switchMethod } = item;
  return { id, slot, name, provider, alive, state, cols, rows, consoleKey, projectId, remote, updatedAt, providerSessionId, switchMethod: switchMethod || 'none',
    model: modelId || model || null, modelName: model || null, effort: effort || null, settingsAt: settingsAt || null,
    requestedSettings: requestedSettings || null, completionMissing: item.completionMissing === true,
    launchId: launchId || null, accountId: accountId || null, accountLabel: accountLabel || null,
    switchTargets: switchTargets || [], switching: !!switching, purpose: purpose || 'agent', taskId: taskId || null,
    sliceId: sliceId || null, steeringState: steeringState || null, steeringSupported: steeringSupported === true,
    consoleCapabilities: consoleCapabilities(item, sessions.ownerConsoles, !!sessions.workerBridge),
    draftSupported: draftSupported === true,
    ...(worktree && typeof worktree.branch === 'string' && typeof worktree.path === 'string' ? { worktree: { branch: worktree.branch, path: worktree.path } } : {}) };
}
const HEARTBEAT_MS = 15000;
// A phone app in the background can pause for a while; allow about two minutes.
const MAX_MISSED_PONGS = 8;
const WORKER_CONSOLE_READS = new Set(['console.files']);
const WORKER_ACTIONS = new Set(['worker.submit', 'worker.stop']);
const GLOBAL_CONSOLE_ACTIONS = new Set(['console.create', 'console.agents', 'console.worktree.root']);
// Protocol 2 messages on /v2/events; commands arrive as {type: 'request'}.
const STATE_MESSAGES = new Set(['hello', 'subscribe', 'ack', 'resync', 'pong']);
// Phone fields that are not slices yet. v2 phones get them in `extras` frames.
const EXTRA_FIELDS = ['connection', 'previews', 'projects', 'imageJobs', 'imageJobsRunning', 'capabilities', 'alerts', 'unreadResults', 'resultVersion'];
class MobileCompanion extends EventEmitter {
  constructor(root, safeStorage, { sessions, results, alerts, prompts, getUsage, getUsageTurns, refreshUsage, getDefaults, getModels, getSettings, toolsStatus = false, getKey, codePanel, networkScript, program, network, worktrees, endMobileSession, concepts, redactImageText, testMode = false, isTailnet = isTailscale, stateSync = null, getTasks = null, knowledge = null } = {}) {
    super(); this.file = path.join(root, 'mobile.json'); this.crypto = safeStorage;
    this.getTasks = getTasks; this.knowledge = knowledge;
    this.prompts = prompts; this.worktrees = worktrees; this.endMobileSession = endMobileSession; this.concepts = concepts; this.redactImageText = redactImageText;
    this.sessions = sessions; this.results = results; this.getUsage = getUsage; this.getDefaults = getDefaults; this.testMode = testMode;
    this.preview = new MobilePreview(sessions);
    // Opt-in protocol 2: {history, enabled(), options?} (electron/state-sync.cjs).
    this.stateSync = stateSync;
    this.getModels = getModels;
    this.getUsageTurns = getUsageTurns;
    this.refreshUsage = refreshUsage;
    this.getSettings = getSettings; this.toolsStatus = toolsStatus && typeof getSettings === 'function';
    // Tests substitute loopback; the app accepts only Tailscale's 100.64.0.0/10.
    this.tailnet = isTailnet;
    this.attachments = new MobileAttachments();
    this.code = new (require('./mobile-code.cjs').MobileCode)(sessions, codePanel);
    this.commands = this.createCommands();
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
      this.liveAlerts = [...this.liveAlerts.slice(-49), { id: item.id, title: item.title, message: String(item.message || '').slice(0, 200), kind: item.kind, at: item.at, sessionId: item.sessionId || null }];
      this.scheduleState();
    };
    sessions.on('output', this.output); sessions.on('resize', this.resized); sessions.on('changed', this.changed); results.on('changed', this.changed); alerts?.on('notification', this.notification); prompts?.on?.('changed', this.changed);
    sessions.projects?.on?.('changed', this.changed); concepts?.on?.('changed', this.changed);
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
  // Tailscale often gets its address after Paddock starts with Windows; retry until it appears.
  retryStart(delay = 15000) {
    if (this.retryTimer || this.stopped) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.start().catch(() => {}); }, delay); this.retryTimer.unref?.();
  }
  async start() {
    this.stopped = false;
    if (!this.config.enabled || this.server) return;
    if (!this.available()) throw new Error(encryptionUnavailable());
    if (!this.tailnet(this.config.host)) { this.error = 'Phones connect only through Tailscale. Choose this PC’s Tailscale address in Phone setup.'; this.emit('changed'); return; }
    if (!interfaces().some(x => x.address === this.config.host)) { this.error = 'This PC’s Tailscale address is unavailable. Paddock keeps trying; turn on Tailscale on this PC if it is off.'; this.emit('changed'); this.retryStart(); return; }
    if (!this.private.identity) {
      const pems = await require('selfsigned').generate([{ name: 'commonName', value: 'Paddock' }], { keyType: 'ec', curve: 'P-256', algorithm: 'sha256', notBeforeDate: new Date(Date.now() - 60000), notAfterDate: new Date(Date.now() + 5 * 365 * 86400000) });
      this.private.identity = { cert: pems.cert, key: pems.private }; this.persist();
    }
    const server = https.createServer({ cert: this.private.identity.cert, key: this.private.identity.key, minVersion: 'TLSv1.2' }, (req, res) => this.http(req, res));
    const wss = new WebSocketServer({ noServer: true, maxPayload: 70000, perMessageDeflate: false });
    server.on('upgrade', (req, socket, head) => {
      const device = this.authenticate(req);
      const v2 = req.url === '/v2/events';
      if (!device || !(v2 || req.url === '/v1/events') || this.clients.size >= 9) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
      // Only an authenticated phone learns whether protocol 2 is on; it then falls back to v1.
      if (v2 && !this.stateV2()) { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return; }
      wss.handleUpgrade(req, socket, head, ws => this.attach(ws, device, v2));
    });
    server.headersTimeout = 5000; server.requestTimeout = 10000; server.maxConnections = 32;
    try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(this.config.port, this.config.host, () => { server.off('error', reject); resolve(); }); }); }
    catch { wss.close(); this.error = 'The mobile port could not open. Check the address and port.'; this.emit('changed'); throw new Error(this.error); }
    server.on('error', () => { this.error = 'The mobile connection stopped.'; this.emit('changed'); });
    this.server = server; this.wss = wss; this.error = '';
    for (const s of this.sessions.items.values()) this.ensureStream(s.id);
    this.timer = setInterval(() => this.flush(), 100); this.timer.unref();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), HEARTBEAT_MS); this.heartbeatTimer.unref?.(); this.emit('changed');
    await this.network.start({ ...this.config });
  }
  stateV2() { return !!this.stateSync && this.stateSync.enabled?.() !== false; }
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
    if (req.url?.startsWith('/v1/preview/')) {
      if (req.method !== 'GET') { res.writeHead(405); res.end(''); return; }
      if (!this.authenticate(req)) { res.writeHead(401); res.end(''); return; }
      this.preview.handle(req, res); return;
    }
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
  // The v1 `state` payload for /v1/events and the `state` request. v2 phones
  // get the slices from the store and only these extra fields (extrasState).
  publicState() {
    const extras = this.extrasState();
    const { connection, previews, projects, imageJobs, imageJobsRunning, capabilities, alerts, unreadResults, resultVersion } = extras;
    return { connection, previews, projects, imageJobs, imageJobsRunning, capabilities, agentProfiles: screenProfiles, capacity: (this.sessions.grid?.columns || 3) * (this.sessions.grid?.rows || 3), sessions: this.sessions.list().filter(x => !x.dismissed).map(item => mobileSession(item, this.sessions)), queues: {}, prompts: this.prompts?.list() || [], alerts, unreadResults, resultVersion };
  }
  extrasState() {
    const localUrl = `https://${this.config.host}:${this.config.port}`;
    const connection = { url: localUrl };
    connection.name = this.name;
    return { connection, previews: (this.sessions.codePanels?.() || []).filter(p => p.kind === 'web').map(({ id, name, url, state, phoneAllowed }) => ({ id, name, url, state, phoneAllowed: phoneAllowed === true })), projects: (typeof this.sessions.projects?.list === 'function' ? this.sessions.projects.list() || [] : []).filter(x => x.status !== 'archived').map(({ id, name, color }) => ({ id, name, ...(color ? { color } : {}), ...(this.knowledge ? { knowledgeMode: this.knowledge.enabled(id) ? this.knowledge.automatic(id) ? 'automatic' : 'read' : 'off', knowledgeVersion: this.knowledge.upkeep?.epoch || 0 } : {}) })), imageJobs: this.concepts ? imageJobs(this.concepts, this.redactImageText) : [], imageJobsRunning: !!this.concepts?.items.some(x => ['submitting', 'waiting', 'downloading'].includes(x.state)), capabilities: [...(this.concepts ? ['image.jobs'] : []), ...(this.toolsStatus ? ['tools.status'] : []), ...(typeof this.getUsageTurns === 'function' ? ['usage.turns'] : []), ...(mobileProjects.available(this.sessions.projects) ? ['projects.read', ...(this.knowledge ? ['projects.workspace'] : [])] : []), 'code.read', 'results.thumbnails', 'results.actions', 'console.agents', ...(this.worktrees && this.endMobileSession ? ['console.worktree'] : []), 'console.files', 'console.close', 'console.projects', 'console.models', ...(typeof this.sessions.switchSettings === 'function' ? ['console.settings'] : []), 'console.ssh', 'console.manage', 'console.switch', 'console.setup', 'alerts.direct', 'console.attachments', ...(this.prompts ? ['prompts', 'prompts.edit'] : []), ...(this.sessions.workerBridge ? ['worker.submit', 'worker.stop'] : []), ...(this.stateV2() ? ['state.v2'] : []), ...(typeof this.getTasks === 'function' ? ['tasks.actions'] : [])], alerts: this.liveAlerts, unreadResults: this.results.unreadGroups(), resultVersion: digest(this.results.list().map(x => x.id + ':' + x.seenAt + ':' + x.changeCount).join(',')).slice(0, 16) };
  }
  scheduleState() {
    if (!this.server || this.stateTimer) return;
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      const clients = [...this.clients];
      // The full v1 payload is built only while a v1 phone is connected.
      const extras = clients.some(client => client.v2) ? this.extrasState() : null, state = clients.some(client => !client.v2) ? this.publicState() : null;
      for (const client of clients) client.v2 ? this.sendExtras(client, extras) : this.send(client, { type: 'state', state });
    }, 150);
  }
  // Slices reach v2 phones through their StateConnection; the remaining
  // snapshot fields travel in `extras`, sent only when they change.
  sendExtras(client, state = this.extrasState()) {
    const value = Object.fromEntries(EXTRA_FIELDS.map(key => [key, state[key]]));
    const text = JSON.stringify(value);
    if (text === client.extras) return;
    client.extras = text; client.v2.reply({ type: 'extras', value });
  }
  reply(client, value) { return client.v2 ? client.v2.reply(value) : this.send(client, value); }
  send(client, value) {
    if (client.ws.readyState !== WebSocket.OPEN) return false;
    if (client.ws.bufferedAmount > 2 * 1024 * 1024) { client.ws.close(1013, 'Reconnect to catch up'); return false; }
    const text = JSON.stringify(value), buffer = Buffer.from(text), compressed = buffer.length > 512 ? gzipSync(buffer) : null;
    const packet = compressed && compressed.length < buffer.length ? compressed : text;
    this.counters.sent += Buffer.byteLength(packet); client.ws.send(packet); return true;
  }
  // Half-open sockets never close on their own; drop a phone after about two
  // minutes of missed pongs, which leaves room for a backgrounded phone app.
  heartbeat() {
    for (const client of this.clients) {
      if (client.missedPongs >= MAX_MISSED_PONGS) { client.ws.terminate(); continue; }
      client.missedPongs = (client.missedPongs || 0) + 1;
      try { client.ws.ping(); } catch {}
      client.v2?.ping();
    }
  }
  attach(ws, device, v2 = false) {
    if (isPublic(ws._socket?.remoteAddress?.replace('::ffff:', '') || '')) { device.lastInternetAt = Date.now(); this.persist(); }
    for (const old of this.clients) if (old.device.id === device.id) old.ws.close(1000, 'Opened on another connection');
    const client = { ws, device, selected: '', sequence: -1, epoch: 0, saver: true, requests: 0, period: Date.now(), inflight: false, seen: new Set(), missedPongs: 0 };
    ws.on('pong', () => { client.missedPongs = 0; client.v2?.pong(); });
    if (v2) client.v2 = new StateConnection({ history: this.stateSync.history, view: 'phone', transport: 'ws',
      write: data => { this.counters.sent += Buffer.byteLength(data); ws.send(data); }, bufferedAmount: () => ws.bufferedAmount,
      authorized: () => ws.readyState === WebSocket.OPEN && this.clients.has(client) && this.private.devices.includes(client.device),
      close: (code, reason) => ws.close(code, reason), onPong: () => { client.missedPongs = 0; },
      // The heartbeat below owns the two-minute grace for backgrounded phones.
      options: { ...this.stateSync.options, maxMissed: Infinity } });
    this.clients.add(client);
    if (v2) this.sendExtras(client); else this.send(client, { type: 'state', state: this.publicState() });
    this.emit('changed');
    ws.on('message', async (raw, binary) => {
      this.counters.received += raw.length;
      if (Date.now() - client.period >= 1000) { client.period = Date.now(); client.requests = 0; }
      if (binary || ++client.requests > 150) { ws.close(1008, 'Too many requests'); return; }
      let request;
      try {
        request = JSON.parse(raw.toString());
        if (client.v2) {
          if (STATE_MESSAGES.has(request?.type)) { client.missedPongs = 0; client.v2.receive(request); return; }
          if (request?.type !== 'request') { client.v2.error('invalid', 'Unknown message type.'); return; }
        }
        if (typeof request.id !== 'string' || request.id.length > 80 || client.seen.has(request.id)) throw new Error('Duplicate or invalid request.');
        client.seen.add(request.id); if (client.seen.size > 1000) client.seen.delete(client.seen.values().next().value);
        const value = await this.call(client, request.method, request.payload);
        this.reply(client, { type: 'reply', id: request.id, value });
      } catch (error) { this.reply(client, { type: 'reply', id: typeof request?.id === 'string' ? request.id.slice(0, 80) : '', error: error.message || 'The request failed.' }); }
    });
    ws.on('error', () => {}); ws.on('close', () => { client.v2?.dispose(); this.clients.delete(client); this.emit('changed'); });
  }
  createCommands() {
    return createMobileCommands({
      sessions: this.sessions, knowledge: this.knowledge, results: this.results, attachments: this.attachments, code: this.code, concepts: this.concepts,
      authorized: client => client.ws.readyState === WebSocket.OPEN && this.clients.has(client) && this.private.devices.includes(client.device),
      defaults: () => this.getDefaults(), worktrees: () => this.worktrees, endMobileSession: () => this.endMobileSession,
      prompts: () => this.prompts, publicState: () => this.publicState(), persist: () => this.persist(),
      renameDevice: (client, name) => this.rename({ id: client.device.id, name }),
      settings: () => this.getSettings, toolsStatus: () => this.toolsStatus,
      hasModels: () => typeof this.getModels === 'function', models: (...args) => this.getModels(...args),
      tasks: () => typeof this.getTasks === 'function' ? this.getTasks() : null,
      usageTurns: () => this.getUsageTurns, refreshUsage: () => this.refreshUsage, usage: () => this.getUsage()
    });
  }
  async call(client, method, payload = {}) {
    // Closing a WebSocket is a handshake, not an authorization boundary.
    // Frames already buffered can still arrive after revoke/replacement.
    if (client.ws.readyState !== WebSocket.OPEN || !this.clients.has(client) || !this.private.devices.includes(client.device)) {
      throw new Error('This phone connection is no longer authorized.');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid mobile request.');
    const explicitTarget = this.sessions.items.get(payload.id || payload.consoleId);
    const selectedTarget = this.sessions.items.get(client.selected);
    const target = explicitTarget || (!GLOBAL_CONSOLE_ACTIONS.has(method) ? selectedTarget : null);
    if (target?.taskId && (method === 'input' || /^(?:console|queue|attachment|worker)\./.test(method)) &&
        !WORKER_CONSOLE_READS.has(method) && !WORKER_ACTIONS.has(method)) {
      throw new Error('Use the worker composer or Stop worker.');
    }
    return this.commands.call(client, method, payload);
  }
  async flush() {
    for (const client of this.clients) {
      if (!client.selected || client.inflight || Date.now() - (client.lastFlush || 0) < (client.saver ? 250 : 100)) continue;
      // A congested v2 socket keeps its terminal cursor and catches up later.
      if (client.v2?.congested()) continue;
      const stream = this.ensureStream(client.selected); if (!stream) continue;
      client.inflight = true; const selected = client.selected;
      try { const chunk = await stream.read(client.sequence, client.epoch); if (selected !== client.selected) continue;
        const frame = { type: 'terminal', id: selected, ...chunk };
        if ((chunk.data || chunk.reset) && (client.v2 ? await client.v2.terminal(frame) && selected === client.selected : this.send(client, frame))) { client.sequence = chunk.sequence; client.epoch = chunk.epoch; }
      } finally { client.inflight = false; client.lastFlush = Date.now(); }
    }
  }
  revoke(id) { this.private.devices = this.private.devices.filter(x => x.id !== id); for (const client of this.clients) if (client.device.id === id) client.ws.close(1008, 'Phone removed'); this.persist(); }
  async stop() {
    this.stopped = true; clearTimeout(this.retryTimer); this.retryTimer = null;
    clearInterval(this.timer); clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; clearTimeout(this.stateTimer); this.stateTimer = null; this.cancelPairing();
    for (const client of this.clients) client.ws.terminate(); this.clients.clear(); this.wss?.close();
    for (const stream of this.streams.values()) stream.dispose(); this.streams.clear();
    const server = this.server; this.server = null; server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve));
    await this.network.stop(); this.emit('changed');
  }
}
module.exports = { MobileCompanion, interfaces, isPrivate };
