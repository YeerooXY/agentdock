'use strict';
// Protocol 2 transport: bounded projection history, per-connection flow control
// and framing for the phone WebSocket (/v2/events) and desktop IPC.
// See docs/state-protocol.md, "Transport".
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const zlib = require('node:zlib');
const { PROTOCOL, ProtocolError, validateClientMessage, isPlainObject } = require('./state-protocol.cjs');

const gzip = promisify(zlib.gzip);
const KiB = 1024, MiB = 1024 * KiB;
const DEFAULTS = Object.freeze({
  historyMs: 30000, historyBytes: 4 * MiB,
  highWater: 512 * KiB, lowWater: 128 * KiB,
  chunkBytes: 128 * KiB, gzipMin: 512, maxReplies: 64, pollMs: 50, maxMissed: 8,
});
// A reassembled chunked batch is at most this large on the client.
const MAX_CHUNK_PARTS = 512, MAX_CHUNK_TOTAL = 32 * MiB;
const isRev = value => Number.isSafeInteger(value) && value >= 0;

// Remembers which ids each projection commit touched (not the values), for
// about 30 s or 4 MiB of serialized changes. A client cursor inside that window
// gets one composed change per slice built from the current values; older
// cursors get a reset.
class ProjectionHistory {
  constructor(projection, { maxAgeMs = DEFAULTS.historyMs, maxBytes = DEFAULTS.historyBytes, now = Date.now } = {}) {
    this.projection = projection; this.maxAgeMs = maxAgeMs; this.maxBytes = maxBytes; this.now = now;
    this.records = new Map(); this.queue = []; this.bytes = 0; this.floor = {};
    for (const slice of Object.keys(projection.definitions)) { this.records.set(slice, []); this.floor[slice] = projection.revs[slice]; }
    this.unsubscribe = projection.subscribe(batch => this.record(batch));
  }
  get epoch() { return this.projection.epoch; }
  record(batch) {
    const at = this.now();
    for (const change of batch.changes) {
      const ids = change.kind === 'patch' ? [...Object.keys(change.upsert), ...change.remove] : null;
      const entry = { slice: change.slice, rev: change.rev, at, ids, order: change.order !== undefined, meta: change.meta !== undefined, bytes: Buffer.byteLength(JSON.stringify(change)) };
      this.records.get(change.slice).push(entry); this.queue.push(entry); this.bytes += entry.bytes;
    }
    this.prune(at);
  }
  prune(at = this.now()) {
    while (this.queue.length && (this.bytes > this.maxBytes || at - this.queue[0].at > this.maxAgeMs)) {
      const entry = this.queue.shift(); this.bytes -= entry.bytes;
      const list = this.records.get(entry.slice);
      if (list[0] === entry) list.shift();
      this.floor[entry.slice] = entry.rev;
    }
  }
  // The change that moves a client from `fromRev` to the current value:
  // null when it is already current, a reset when history cannot cover it.
  change(slice, fromRev) {
    this.prune();
    const projection = this.projection, rev = projection.revs[slice], kind = projection.definitions[slice].kind;
    const reset = () => ({ kind: 'reset', slice, rev, value: projection.get(slice) });
    if (!isRev(fromRev) || fromRev > rev) return reset();
    if (fromRev === rev) return null;
    if (fromRev < this.floor[slice]) return reset();
    const records = this.records.get(slice).filter(entry => entry.rev > fromRev);
    if (!records.length || records[0].rev !== fromRev + 1) return reset();
    const value = projection.get(slice);
    if (kind === 'value') return { kind: 'replace', slice, baseRev: fromRev, rev, value };
    const touched = new Set(records.flatMap(entry => entry.ids));
    const upsert = {}, remove = [];
    // Upsert keys follow the current order, as the store's own patches do.
    for (const id of value.order) if (touched.has(id)) upsert[id] = value.byId[id];
    for (const id of touched) if (!Object.prototype.hasOwnProperty.call(value.byId, id)) remove.push(id);
    const change = { kind: 'patch', slice, baseRev: fromRev, rev, upsert, remove };
    if (records.length > 1 || records.some(entry => entry.order)) change.order = [...value.order];
    if (records.some(entry => entry.meta)) change.meta = value.meta || {};
    return change;
  }
  dispose() { this.unsubscribe(); this.records.clear(); this.queue = []; this.bytes = 0; }
}

// Splits a serialized `changes` message into ordered parts. Each part is sent
// as its own frame; the client applies nothing until it has every part.
function chunkFrames(text, { subscription, batch, chunkBytes = DEFAULTS.chunkBytes }) {
  const parts = [];
  for (let start = 0; start < text.length; start += chunkBytes) parts.push(text.slice(start, start + chunkBytes));
  if (parts.length > MAX_CHUNK_PARTS) throw new ProtocolError('invalid', 'This batch is too large to send.');
  return parts.map((data, index) => ({ type: 'chunk', subscription, batch, part: index + 1, parts: parts.length, data }));
}
function validateChunk(message) {
  if (!isPlainObject(message) || message.type !== 'chunk') throw new ProtocolError('invalid', 'Not a chunk.');
  for (const key of Object.keys(message)) if (!['type', 'subscription', 'batch', 'part', 'parts', 'data'].includes(key)) throw new ProtocolError('invalid', `chunk has an unknown field: ${key}.`);
  if (typeof message.subscription !== 'string' || !message.subscription || message.subscription.length > 64) throw new ProtocolError('invalid', 'chunk needs a subscription.');
  if (!Number.isSafeInteger(message.batch) || message.batch < 1) throw new ProtocolError('invalid', 'chunk needs a batch number.');
  if (!Number.isSafeInteger(message.parts) || message.parts < 2 || message.parts > MAX_CHUNK_PARTS) throw new ProtocolError('invalid', 'chunk parts out of range.');
  if (!Number.isSafeInteger(message.part) || message.part < 1 || message.part > message.parts) throw new ProtocolError('invalid', 'chunk part out of range.');
  if (typeof message.data !== 'string' || !message.data.length) throw new ProtocolError('invalid', 'chunk needs data.');
  return message;
}
// Client-side reassembly reference. Pure: returns {buffer, message?, outcome}.
// outcome: 'partial' (wait), 'complete' (message is the parsed changes
// message; hand it to applyServerMessage), 'reconnect' (bad sequence).
function reassembleChunk(buffer, chunk) {
  try { validateChunk(chunk); } catch { return { buffer: null, outcome: 'reconnect' }; }
  const same = buffer && buffer.subscription === chunk.subscription && buffer.batch === chunk.batch && buffer.parts === chunk.parts;
  // A new batch may replace an abandoned one only from its first part.
  const current = chunk.part === 1 ? { subscription: chunk.subscription, batch: chunk.batch, parts: chunk.parts, data: [], size: 0 } : same ? buffer : null;
  if (!current || current.data.length !== chunk.part - 1) return { buffer: null, outcome: 'reconnect' };
  const next = { ...current, data: [...current.data, chunk.data], size: current.size + chunk.data.length };
  if (next.size > MAX_CHUNK_TOTAL) return { buffer: null, outcome: 'reconnect' };
  if (next.data.length < next.parts) return { buffer: next, outcome: 'partial' };
  let message;
  try { message = JSON.parse(next.data.join('')); } catch { return { buffer: null, outcome: 'reconnect' }; }
  if (!isPlainObject(message) || message.type !== 'changes' || message.subscription !== chunk.subscription || message.batch !== chunk.batch) return { buffer: null, outcome: 'reconnect' };
  return { buffer: null, outcome: 'complete', message };
}

const LANES = ['control', 'reply', 'terminal', 'state'];
// One subscriber connection. `transport` is 'ws' (JSON text or gzip binary
// frames, chunking and water marks) or 'ipc' (structured clone, no framing).
//   write(data)          sends one frame
//   bufferedAmount()     bytes queued in the socket (ws)
//   authorized()         rechecked before every send; false closes
//   close(code, reason)  ends the transport
class StateConnection {
  constructor({ history, view, transport = 'ws', write, bufferedAmount = () => 0, authorized = () => true, close = () => {}, onPong = () => {}, options = {}, timers = { setTimeout, clearTimeout } }) {
    this.history = history; this.projection = history.projection; this.view = view; this.transport = transport;
    this.write = write; this.bufferedAmount = bufferedAmount; this.authorized = authorized; this.closeTransport = close; this.onPong = onPong;
    this.options = { ...DEFAULTS, ...options }; this.timers = timers;
    this.subscription = null; this.slices = []; this.compression = 'none'; this.batch = 0; this.inflight = null;
    this.baseline = {}; this.dirty = new Set();
    this.queues = Object.fromEntries(LANES.map(lane => [lane, []]));
    this.writing = false; this.paused = false; this.poll = null; this.closed = false; this.missed = 0; this.nonce = null;
    this.stats = { batches: 0, resets: 0, chunks: 0, frames: 0, bytes: 0 };
    this.unsubscribe = this.projection.subscribe(batch => this.changed(batch));
  }
  get epoch() { return this.projection.epoch; }
  // ---- Incoming ------------------------------------------------------------
  receive(message) {
    if (this.closed) return;
    let valid;
    try { valid = validateClientMessage(message, this.view); }
    catch (error) {
      const sent = this.error(error.code || 'invalid', error.message);
      if (error.code === 'unsupported') sent.then(() => this.close(1003, 'Unsupported protocol'));
      return;
    }
    this.missed = 0;
    switch (valid.type) {
      case 'hello': return this.hello(valid);
      case 'subscribe': return this.subscribe(valid.slices);
      case 'ack': return this.ack(valid);
      case 'resync': return this.resync(valid);
      case 'pong': if (valid.nonce === this.nonce) this.onPong(); return;
    }
  }
  hello({ lastRev, slices, compression }) {
    const resume = lastRev && lastRev.epoch === this.epoch ? lastRev.revs : {};
    this.compression = this.transport === 'ws' && compression.includes('gzip') ? 'gzip' : 'none';
    const baseline = {};
    for (const slice of slices) baseline[slice] = isRev(resume[slice]) ? resume[slice] : null;
    this.start(slices, baseline);
  }
  subscribe(slices) {
    if (!this.subscription) return this.error('subscription', 'Send hello first.');
    const baseline = {};
    // A batch in flight may or may not have been applied: reset its slices.
    const unsure = new Set(this.inflight ? Object.keys(this.inflight.revs) : []);
    for (const slice of slices) baseline[slice] = slice in this.baseline && !unsure.has(slice) ? this.baseline[slice] : null;
    this.start(slices, baseline);
  }
  start(slices, baseline) {
    this.subscription = crypto.randomUUID(); this.slices = [...slices]; this.baseline = baseline;
    this.batch = 0; this.inflight = null; this.queues.state = []; this.dirty = new Set(slices);
    this.enqueue({ type: 'welcome', protocol: PROTOCOL, epoch: this.epoch, subscription: this.subscription, slices: this.slices, compression: this.compression }, 'control');
    this.pump();
  }
  ack({ subscription, batch }) {
    // Acknowledgements of duplicates or an older subscription change nothing.
    if (subscription !== this.subscription || !this.inflight || batch !== this.inflight.batch) return;
    Object.assign(this.baseline, this.inflight.revs); this.inflight = null;
    this.pump();
  }
  resync({ subscription, slices }) {
    if (subscription !== this.subscription) return;
    // The client rejected the whole batch in flight; it applied none of it.
    if (this.inflight) { for (const slice of Object.keys(this.inflight.revs)) this.dirty.add(slice); this.inflight = null; this.queues.state = []; }
    for (const slice of slices) if (this.slices.includes(slice)) { this.baseline[slice] = null; this.dirty.add(slice); }
    this.pump();
  }
  // ---- State batches -------------------------------------------------------
  changed(batch) {
    if (this.closed || !this.subscription) return;
    for (const change of batch.changes) if (this.slices.includes(change.slice)) this.dirty.add(change.slice);
    this.pump();
  }
  pump() {
    if (this.closed || !this.subscription || this.inflight || !this.dirty.size) return;
    const changes = [], revs = {};
    for (const slice of this.slices) {
      if (!this.dirty.has(slice)) continue;
      const change = this.history.change(slice, this.baseline[slice]);
      if (!change) continue;
      changes.push(change); revs[slice] = change.rev;
      if (change.kind === 'reset') this.stats.resets++;
    }
    this.dirty.clear();
    if (!changes.length) return;
    const message = { type: 'changes', epoch: this.epoch, subscription: this.subscription, batch: ++this.batch, changes };
    this.inflight = { batch: message.batch, revs };
    this.stats.batches++;
    if (this.transport === 'ws') {
      const text = JSON.stringify(message);
      if (Buffer.byteLength(text) > this.options.chunkBytes) {
        const frames = chunkFrames(text, { subscription: this.subscription, batch: message.batch, chunkBytes: this.options.chunkBytes });
        this.stats.chunks += frames.length;
        for (const frame of frames) this.enqueue(frame, 'state');
        return;
      }
    }
    this.enqueue(message, 'state');
  }
  // ---- Outgoing ------------------------------------------------------------
  ping() {
    if (this.closed) return false;
    if (this.missed >= this.options.maxMissed) { this.close(1001, 'No answer'); return false; }
    this.missed++; this.nonce = crypto.randomBytes(9).toString('base64url');
    this.enqueue({ type: 'ping', nonce: this.nonce }, 'control');
    return true;
  }
  pong() { this.missed = 0; }
  error(code, message) { return this.enqueue({ type: 'error', code, message: String(message).slice(0, 500) }, 'control'); }
  // Command replies: reliable and ordered, never coalesced; a full queue closes.
  reply(value) {
    if (this.closed) return Promise.resolve(false);
    if (this.queues.reply.length >= this.options.maxReplies) { this.close(1013, 'Reconnect to catch up'); return Promise.resolve(false); }
    return this.enqueue(value, 'reply');
  }
  // Terminal frames skip a congested socket: the caller keeps its sequence and
  // later reads a replay or checkpoint, so no ANSI fragment is lost.
  congested() { return this.paused || this.queues.terminal.length > 0 || this.bufferedAmount() >= this.options.highWater; }
  terminal(value) { return this.closed ? Promise.resolve(false) : this.enqueue(value, 'terminal'); }
  enqueue(value, lane) {
    return new Promise(resolve => { this.queues[lane].push({ value, resolve }); this.drain(); });
  }
  next() {
    for (const lane of LANES) if (this.queues[lane].length) return this.queues[lane].shift();
    return null;
  }
  schedulePoll() {
    if (this.poll || this.closed) return;
    this.poll = this.timers.setTimeout(() => { this.poll = null; this.drain(); }, this.options.pollMs);
    this.poll?.unref?.();
  }
  async drain() {
    if (this.writing || this.closed) return;
    this.writing = true;
    try {
      while (!this.closed) {
        if (!LANES.some(lane => this.queues[lane].length)) break;
        if (this.transport === 'ws') {
          const buffered = this.bufferedAmount();
          if (buffered >= this.options.highWater) this.paused = true;
          if (this.paused && buffered > this.options.lowWater) { this.schedulePoll(); break; }
          this.paused = false;
        }
        const item = this.next();
        const data = await this.encode(item.value);
        if (this.closed) { item.resolve(false); break; }
        if (!this.authorized()) { item.resolve(false); this.close(1008, 'Phone removed'); break; }
        try { this.write(data); } catch { item.resolve(false); this.close(1011, 'Send failed'); break; }
        this.stats.frames++; this.stats.bytes += typeof data === 'string' || Buffer.isBuffer(data) ? Buffer.byteLength(data) : 0;
        item.resolve(true);
      }
    } finally { this.writing = false; }
  }
  async encode(value) {
    if (this.transport !== 'ws') return value;
    const text = JSON.stringify(value);
    if (this.compression !== 'gzip' || Buffer.byteLength(text) <= this.options.gzipMin) return text;
    const compressed = await gzip(Buffer.from(text));
    return compressed.length < Buffer.byteLength(text) ? compressed : text;
  }
  close(code = 1000, reason = '') {
    if (this.closed) return;
    this.closed = true; this.unsubscribe();
    if (this.poll) { this.timers.clearTimeout(this.poll); this.poll = null; }
    for (const lane of LANES) { for (const item of this.queues[lane]) item.resolve(false); this.queues[lane] = []; }
    try { this.closeTransport(code, reason); } catch {}
  }
  dispose() { this.close(1000, ''); }
}

module.exports = { ProjectionHistory, StateConnection, chunkFrames, validateChunk, reassembleChunk, DEFAULTS, MAX_CHUNK_PARTS, MAX_CHUNK_TOTAL };
