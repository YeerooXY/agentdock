'use strict';
// State sync contract, protocol 2. Shared by the main-process store, desktop IPC
// and the phone WebSocket. Dart mirrors these rules against tests/fixtures/state.
// See docs/state-protocol.md.

const PROTOCOL = 2;

// One authoritative writer per slice. `kind` decides the change envelope:
// collections ({byId, order, meta}) use patch, values use replace.
const SLICES = Object.freeze({
  shell: { kind: 'value', writer: 'main' },
  preferences: { kind: 'value', writer: 'main' },
  sessions: { kind: 'collection', writer: 'sessions' },
  panels: { kind: 'collection', writer: 'sessions' },
  queues: { kind: 'value', writer: 'messageQueue' },
  prompts: { kind: 'collection', writer: 'prompts' },
  tasks: { kind: 'collection', writer: 'taskLoop' },
  delegations: { kind: 'collection', writer: 'delegation' },
  projects: { kind: 'collection', writer: 'projects' },
  projectProposals: { kind: 'collection', writer: 'projects' },
  accounts: { kind: 'collection', writer: 'accountProfiles' },
  agents: { kind: 'collection', writer: 'cliSetup' },
  skills: { kind: 'collection', writer: 'skillPacks' },
  usage: { kind: 'value', writer: 'usage' },
  usageHistory: { kind: 'value', writer: 'usage' },
  results: { kind: 'collection', writer: 'workbench' },
  imageJobs: { kind: 'value', writer: 'workbench' },
  setupRequests: { kind: 'collection', writer: 'workbench' },
  tools: { kind: 'value', writer: 'sharedHub' },
  keyMetadata: { kind: 'value', writer: 'vault' },
  sshHosts: { kind: 'collection', writer: 'ssh' },
  mobileStatus: { kind: 'value', writer: 'mobile' },
  updates: { kind: 'value', writer: 'updates' },
  screenshots: { kind: 'value', writer: 'screenshots' },
  alerts: { kind: 'collection', writer: 'alerts' },
});
for (const value of Object.values(SLICES)) Object.freeze(value);
const SLICE_NAMES = Object.freeze(Object.keys(SLICES));

// Field names that never enter a slice, a projection or a protocol message.
// Builders must allowlist fields; this guard is the last line of defence.
const SECRET_KEY = /^(?:token|accesstoken|refreshtoken|idtoken|bearertoken|authtoken|devicetoken|pushtoken|secret|clientsecret|password|passphrase|apikey|api_key|privatekey|private_key|authorization|cookie|cookies|env|environment|credential|credentials|pairingcode|pairingsecret|usercode|requestkey|vaultkey)$/i;

const COMPRESSION = Object.freeze(['gzip', 'none']);
const CHANGE_KINDS = Object.freeze(['patch', 'replace', 'reset']);
const ERROR_CODES = Object.freeze(['invalid', 'epoch', 'subscription', 'duplicate', 'gap', 'unauthorized', 'unsupported']);

class ProtocolError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new ProtocolError(code, message); };

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function isPlainObject(value) {
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
const isRev = value => Number.isSafeInteger(value) && value >= 0;
const isId = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const isText = (value, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max;

function onlyKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('invalid', `${label} has an unknown field: ${key}.`);
}
function sliceName(value, label = 'slice') {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(SLICES, value)) fail('invalid', `Unknown ${label}: ${String(value).slice(0, 40)}.`);
  return value;
}
function sliceList(value, label = 'slices') {
  if (!Array.isArray(value) || value.length === 0 || value.length > SLICE_NAMES.length) fail('invalid', `${label} must list known slices.`);
  for (const name of value) sliceName(name);
  if (new Set(value).size !== value.length) fail('invalid', `${label} repeats a slice.`);
  return value;
}

// JSON-compatible data only: no functions, symbols, class instances or cycles.
function assertJson(value, path = 'value', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('invalid', `${path} is not a finite number.`); return; }
  if (Array.isArray(value)) {
    if (seen.has(value)) fail('invalid', `${path} is circular.`);
    seen.add(value); value.forEach((item, index) => assertJson(item, `${path}[${index}]`, seen)); seen.delete(value); return;
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) fail('invalid', `${path} is circular.`);
    seen.add(value);
    for (const [key, item] of Object.entries(value)) if (item !== undefined) assertJson(item, `${path}.${key}`, seen);
    seen.delete(value); return;
  }
  fail('invalid', `${path} is not JSON data.`);
}

// Returns the dotted paths of secret-named fields anywhere inside a value.
function secretPaths(value, path = '', found = [], seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return found;
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item, index) => secretPaths(item, `${path}[${index}]`, found, seen));
  else for (const [key, item] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (SECRET_KEY.test(key)) found.push(next);
    secretPaths(item, next, found, seen);
  }
  return found;
}
function assertNoSecrets(value, label = 'value') {
  const found = secretPaths(value);
  if (found.length) fail('invalid', `${label} contains private fields: ${found.slice(0, 5).join(', ')}.`);
}

function emptyCollection() { return { byId: {}, order: [], meta: {} }; }
function emptyValue(slice) { return SLICES[slice].kind === 'collection' ? emptyCollection() : null; }

function validateCollection(value, label = 'collection') {
  if (!isObject(value)) fail('invalid', `${label} must be {byId, order}.`);
  onlyKeys(value, ['byId', 'order', 'meta'], label);
  if (!isObject(value.byId) || !Array.isArray(value.order)) fail('invalid', `${label} must be {byId, order}.`);
  if (value.meta !== undefined && !isObject(value.meta)) fail('invalid', `${label}.meta must be an object.`);
  const ids = Object.keys(value.byId);
  if (ids.length !== value.order.length || new Set(value.order).size !== value.order.length) fail('invalid', `${label}.order must list each id once.`);
  for (const id of value.order) {
    if (!isId(id) || !Object.prototype.hasOwnProperty.call(value.byId, id)) fail('invalid', `${label}.order lists a missing id.`);
    const item = value.byId[id];
    if (!isObject(item)) fail('invalid', `${label} item ${id} must be an object.`);
    if (item.id !== undefined && String(item.id) !== id) fail('invalid', `${label} item ${id} has a different id.`);
  }
  return value;
}

// Builds {byId, order, meta} from a list. Items keep their own fields.
function toCollection(list, { id = item => item?.id, meta = {} } = {}) {
  if (!Array.isArray(list)) fail('invalid', 'A collection needs a list.');
  const byId = {}, order = [];
  for (const item of list) {
    const raw = id(item);
    if (raw === undefined || raw === null || raw === '') fail('invalid', 'A collection item has no id.');
    const key = String(raw);
    if (Object.prototype.hasOwnProperty.call(byId, key)) fail('invalid', `A collection repeats the id ${key.slice(0, 60)}.`);
    byId[key] = item; order.push(key);
  }
  return { byId, order, meta };
}
const fromCollection = value => value ? value.order.map(id => value.byId[id]) : [];

// The order a client keeps when a patch omits `order`: existing ids minus removed
// ones, then new ids in upsert key order.
function implicitOrder(previous, upsert, remove) {
  const removed = new Set(remove);
  const order = previous.order.filter(id => !removed.has(id));
  const present = new Set(order);
  for (const id of Object.keys(upsert)) if (!present.has(id)) { order.push(id); present.add(id); }
  return order;
}
function applyPatch(previous, { upsert = {}, remove = [], order, meta }) {
  const byId = { ...previous.byId };
  for (const id of remove) delete byId[id];
  for (const [id, item] of Object.entries(upsert)) byId[id] = item;
  const next = { byId, order: order ? [...order] : implicitOrder(previous, upsert, remove), meta: meta !== undefined ? meta : previous.meta || {} };
  return validateCollection(next, 'patched collection');
}

function validateCursor(value, label = 'cursor') {
  if (!isObject(value)) fail('invalid', `${label} must be {epoch, revs}.`);
  onlyKeys(value, ['epoch', 'revs'], label);
  if (!isText(value.epoch, 64)) fail('invalid', `${label}.epoch must be text.`);
  if (!isObject(value.revs)) fail('invalid', `${label}.revs must be an object.`);
  for (const [slice, rev] of Object.entries(value.revs)) { sliceName(slice); if (!isRev(rev)) fail('invalid', `${label}.revs.${slice} must be a revision.`); }
  return value;
}

function validateChange(change) {
  if (!isObject(change) || !CHANGE_KINDS.includes(change.kind)) fail('invalid', 'Unknown change kind.');
  const slice = sliceName(change.slice), kind = SLICES[slice].kind;
  if (!isRev(change.rev)) fail('invalid', 'Change rev must be a revision.');
  if (change.kind === 'reset') {
    onlyKeys(change, ['kind', 'slice', 'rev', 'value'], 'reset');
    if (!('value' in change)) fail('invalid', 'reset needs a value.');
    if (kind === 'collection') validateCollection(change.value, `${slice} reset`);
    assertJson(change.value, `${slice}.value`);
    return change;
  }
  if (!isRev(change.baseRev) || change.rev <= change.baseRev) fail('invalid', 'Change rev must follow baseRev.');
  if (change.kind === 'replace') {
    onlyKeys(change, ['kind', 'slice', 'baseRev', 'rev', 'value'], 'replace');
    if (kind !== 'value') fail('invalid', `${slice} is a collection; use patch.`);
    if (!('value' in change)) fail('invalid', 'replace needs a value.');
    assertJson(change.value, `${slice}.value`);
    return change;
  }
  onlyKeys(change, ['kind', 'slice', 'baseRev', 'rev', 'upsert', 'remove', 'order', 'meta'], 'patch');
  if (kind !== 'collection') fail('invalid', `${slice} is a value; use replace.`);
  if (!isObject(change.upsert) || !Array.isArray(change.remove)) fail('invalid', 'patch needs upsert and remove.');
  for (const [id, item] of Object.entries(change.upsert)) {
    if (!isId(id) || !isObject(item)) fail('invalid', 'patch upsert items must be objects.');
    if (item.id !== undefined && String(item.id) !== id) fail('invalid', `patch item ${id} has a different id.`);
  }
  if (change.remove.some(id => !isId(id)) || new Set(change.remove).size !== change.remove.length) fail('invalid', 'patch remove must list ids once.');
  if (change.remove.some(id => Object.prototype.hasOwnProperty.call(change.upsert, id))) fail('invalid', 'patch cannot upsert and remove the same id.');
  if (change.order !== undefined && (!Array.isArray(change.order) || change.order.some(id => !isId(id)) || new Set(change.order).size !== change.order.length)) fail('invalid', 'patch order must list ids once.');
  if (change.meta !== undefined && !isObject(change.meta)) fail('invalid', 'patch meta must be an object.');
  assertJson(change.upsert, `${slice}.upsert`);
  if (change.meta !== undefined) assertJson(change.meta, `${slice}.meta`);
  return change;
}

function validateClientMessage(message) {
  if (!isObject(message)) fail('invalid', 'A message must be an object.');
  switch (message.type) {
    case 'hello':
      onlyKeys(message, ['type', 'protocol', 'lastRev', 'slices', 'compression'], 'hello');
      if (message.protocol !== PROTOCOL) fail('unsupported', 'Unsupported protocol.');
      if (message.lastRev !== null) validateCursor(message.lastRev, 'hello.lastRev');
      sliceList(message.slices);
      if (!Array.isArray(message.compression) || !message.compression.length || message.compression.some(x => !COMPRESSION.includes(x)) || new Set(message.compression).size !== message.compression.length) fail('invalid', 'hello.compression must list gzip or none.');
      return message;
    case 'subscribe':
      onlyKeys(message, ['type', 'slices'], 'subscribe'); sliceList(message.slices); return message;
    case 'ack':
      onlyKeys(message, ['type', 'subscription', 'batch'], 'ack');
      if (!isText(message.subscription, 64) || !Number.isSafeInteger(message.batch) || message.batch < 1) fail('invalid', 'ack needs a subscription and batch.');
      return message;
    case 'resync':
      onlyKeys(message, ['type', 'subscription', 'slices'], 'resync');
      if (!isText(message.subscription, 64)) fail('invalid', 'resync needs a subscription.');
      sliceList(message.slices); return message;
    case 'pong':
      onlyKeys(message, ['type', 'nonce'], 'pong');
      if (!isText(message.nonce, 64)) fail('invalid', 'pong needs a nonce.');
      return message;
    default: fail('invalid', 'Unknown client message type.');
  }
}

function validateServerMessage(message) {
  if (!isObject(message)) fail('invalid', 'A message must be an object.');
  switch (message.type) {
    case 'welcome':
      onlyKeys(message, ['type', 'protocol', 'epoch', 'subscription', 'slices', 'compression'], 'welcome');
      if (message.protocol !== PROTOCOL) fail('unsupported', 'Unsupported protocol.');
      if (!isText(message.epoch, 64) || !isText(message.subscription, 64)) fail('invalid', 'welcome needs an epoch and subscription.');
      sliceList(message.slices);
      if (!COMPRESSION.includes(message.compression)) fail('invalid', 'welcome.compression must be gzip or none.');
      return message;
    case 'changes': {
      onlyKeys(message, ['type', 'epoch', 'subscription', 'batch', 'changes'], 'changes');
      if (!isText(message.epoch, 64) || !isText(message.subscription, 64)) fail('invalid', 'changes needs an epoch and subscription.');
      if (!Number.isSafeInteger(message.batch) || message.batch < 1) fail('invalid', 'changes needs a batch number.');
      if (!Array.isArray(message.changes) || !message.changes.length) fail('invalid', 'changes needs at least one change.');
      const slices = message.changes.map(change => validateChange(change).slice);
      if (new Set(slices).size !== slices.length) fail('invalid', 'A batch changes each slice once.');
      assertNoSecrets(message.changes, 'changes');
      return message;
    }
    case 'ping':
      onlyKeys(message, ['type', 'nonce'], 'ping');
      if (!isText(message.nonce, 64)) fail('invalid', 'ping needs a nonce.');
      return message;
    case 'error':
      onlyKeys(message, ['type', 'code', 'message'], 'error');
      if (!ERROR_CODES.includes(message.code) || typeof message.message !== 'string' || message.message.length > 500) fail('invalid', 'error needs a known code and a message.');
      return message;
    default: fail('invalid', 'Unknown server message type.');
  }
}

// Client-side reference behaviour. Pure: returns a new state and an outcome.
//   state = { epoch, subscription, slices, revs, values, lastBatch }
// Outcomes: welcome, applied, duplicate, ignored, resync (with slices),
// reconnect (send hello with lastRev null), pong (with nonce), error.
function initialClientState() { return { epoch: null, subscription: null, slices: [], revs: {}, values: {}, lastBatch: 0 }; }

function applyServerMessage(state, message) {
  try { validateServerMessage(message); }
  catch (error) { return { state, outcome: 'reconnect', error: error.code || 'invalid' }; }
  if (message.type === 'ping') return { state, outcome: 'pong', nonce: message.nonce };
  if (message.type === 'error') return { state, outcome: 'error', error: message.code };
  if (message.type === 'welcome') {
    const sameEpoch = state.epoch === message.epoch;
    const keep = new Set(sameEpoch ? message.slices : []);
    const revs = {}, values = {};
    for (const slice of keep) if (slice in state.revs) { revs[slice] = state.revs[slice]; values[slice] = state.values[slice]; }
    return { state: { epoch: message.epoch, subscription: message.subscription, slices: [...message.slices], revs, values, lastBatch: 0 }, outcome: 'welcome' };
  }
  if (message.epoch !== state.epoch) return { state, outcome: 'reconnect', error: 'epoch' };
  if (message.subscription !== state.subscription) return { state, outcome: 'ignored', error: 'subscription' };
  if (message.batch <= state.lastBatch) return { state, outcome: 'duplicate', batch: message.batch };
  const revs = { ...state.revs }, values = { ...state.values }, gaps = [];
  for (const change of message.changes) {
    if (!state.slices.includes(change.slice)) return { state, outcome: 'reconnect', error: 'subscription' };
    if (change.kind === 'reset') { revs[change.slice] = change.rev; values[change.slice] = change.value; continue; }
    if (revs[change.slice] !== change.baseRev) { gaps.push(change.slice); continue; }
    if (change.kind === 'replace') values[change.slice] = change.value;
    else {
      try { values[change.slice] = applyPatch(values[change.slice] || emptyCollection(), change); }
      catch { gaps.push(change.slice); continue; }
    }
    revs[change.slice] = change.rev;
  }
  // Atomic: a batch with any gap changes nothing; the client asks for those slices again.
  if (gaps.length) return { state, outcome: 'resync', slices: gaps };
  return { state: { ...state, revs, values, lastBatch: message.batch }, outcome: 'applied', batch: message.batch };
}

module.exports = {
  PROTOCOL, SLICES, SLICE_NAMES, SECRET_KEY, COMPRESSION, CHANGE_KINDS, ERROR_CODES, ProtocolError,
  isPlainObject, assertJson, secretPaths, assertNoSecrets,
  emptyCollection, emptyValue, validateCollection, toCollection, fromCollection, implicitOrder, applyPatch,
  validateCursor, validateChange, validateClientMessage, validateServerMessage,
  initialClientState, applyServerMessage,
};
