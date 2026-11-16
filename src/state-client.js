// Renderer state. The desktop opens a protocol 2 subscription at startup
// (docs/state-protocol.md) and rebuilds today's snapshot shape from the
// slices, so views keep reading one `state` object.
// Views subscribe to the slices they use and are called only when one changed.

import { snapshotFromSlices } from '../electron/state-snapshot.mjs';
export { snapshotFromSlices };
const equal = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function changed(current, change) {
  if (change.kind !== 'patch') return change.value;
  const list = Array.isArray(current) ? current : [];
  const upsert = change.upsert || {}, removed = new Set(change.remove || []);
  const byId = new Map(list.filter(item => !removed.has(item.id)).map(item => [item.id, item]));
  for (const [id, dto] of Object.entries(upsert)) byId.set(id, dto);
  const known = new Set(list.map(item => item.id));
  const ids = change.order || [...list.map(item => item.id), ...Object.keys(upsert).filter(id => !known.has(id))];
  return ids.filter(id => byId.has(id)).map(id => byId.get(id));
}

export function createStateClient() {
  let state = null;
  const revisions = Object.create(null), listeners = new Set();

  function commit(next, slices) {
    state = next;
    for (const slice of slices) revisions[slice] = (revisions[slice] || 0) + 1;
    for (const entry of [...listeners]) if (!entry.slices || slices.some(slice => entry.slices.includes(slice))) entry.fn(state, slices);
  }

  return {
    get: () => state,
    revision: slice => revisions[slice] || 0,
    // Replace everything with a snapshot. Returns the slices whose value changed.
    setLegacy(next, knownSlices) {
      if (knownSlices) { commit(next, knownSlices); return knownSlices; }
      const keys = new Set([...Object.keys(state || {}), ...Object.keys(next || {})]);
      const slices = [...keys].filter(key => !equal(state?.[key], next?.[key]));
      commit(next, slices);
      return slices;
    },
    // One v2 change: patch {upsert, remove, order}, replace {value}, reset {value}.
    applyChange(change) { return this.applyBatch([change]); },
    applyBatch(changes) {
      const next = { ...state }, slices = [];
      for (const change of changes) {
        const value = changed(next[change.slice], change);
        if (equal(next[change.slice], value)) continue;
        next[change.slice] = value;
        if (!slices.includes(change.slice)) slices.push(change.slice);
      }
      if (slices.length) commit(next, slices);
      return slices.length > 0;
    },
    // fn(state, changedSlices); `slices` omitted means every change.
    subscribe(slices, fn) {
      const entry = { slices: slices ? [].concat(slices) : null, fn };
      listeners.add(entry);
      return () => listeners.delete(entry);
    }
  };
}

// ---- Protocol 2 client ------------------------------------------------------
// Mirrors applyServerMessage in electron/state-protocol.cjs. The main process
// validates every message it sends; the checks here only guard the shapes this
// file reads, and anything unexpected asks for a fresh subscription.

// Every desktop slice the snapshot is built from. `alerts` is reserved.
export const DESKTOP_SLICES = Object.freeze(['shell', 'preferences', 'sessions', 'panels', 'queues', 'prompts', 'tasks', 'delegations', 'projects',
  'accounts', 'agents', 'skills', 'usage', 'usageHistory', 'imageJobs', 'setupRequests', 'tools', 'keyMetadata',
  'sshHosts', 'mobileStatus', 'updates', 'screenshots']);
const COLLECTIONS = new Set(['sessions', 'panels', 'prompts', 'tasks', 'delegations', 'projects', 'accounts', 'agents', 'skills',
  'setupRequests', 'sshHosts']);

export function initialProtocolState() { return { epoch: null, subscription: null, slices: [], revs: {}, values: {}, lastBatch: 0 }; }

function validCollection(value) {
  if (!isObject(value) || !isObject(value.byId) || !Array.isArray(value.order)) return false;
  if (value.order.length !== Object.keys(value.byId).length || new Set(value.order).size !== value.order.length) return false;
  return value.order.every(id => own(value.byId, id) && isObject(value.byId[id]));
}
function patchCollection(previous, { upsert, remove, order, meta }) {
  const byId = { ...previous.byId };
  for (const id of remove) delete byId[id];
  for (const [id, item] of Object.entries(upsert)) byId[id] = item;
  let ids = order;
  if (!ids) {
    const gone = new Set(remove);
    ids = previous.order.filter(id => !gone.has(id));
    const present = new Set(ids);
    for (const id of Object.keys(upsert)) if (!present.has(id)) { ids.push(id); present.add(id); }
  }
  const next = { byId, order: [...ids], meta: meta !== undefined ? meta : previous.meta || {} };
  return validCollection(next) ? next : null;
}
function validChange(change, slices) {
  if (!isObject(change) || !slices.includes(change.slice) || !Number.isSafeInteger(change.rev)) return false;
  if (change.kind === 'reset') return own(change, 'value') && (!COLLECTIONS.has(change.slice) || validCollection(change.value));
  if (!Number.isSafeInteger(change.baseRev) || change.rev <= change.baseRev) return false;
  if (change.kind === 'replace') return !COLLECTIONS.has(change.slice) && own(change, 'value');
  return change.kind === 'patch' && COLLECTIONS.has(change.slice) && isObject(change.upsert) && Array.isArray(change.remove);
}

// Pure: returns {state, outcome, ...}. Outcomes as in state-protocol.cjs.
export function applyProtocolMessage(state, message) {
  if (!isObject(message)) return { state, outcome: 'reconnect', error: 'invalid' };
  if (message.type === 'ping') return typeof message.nonce === 'string' ? { state, outcome: 'pong', nonce: message.nonce } : { state, outcome: 'reconnect', error: 'invalid' };
  if (message.type === 'error') return { state, outcome: 'error', error: message.code };
  if (message.type === 'welcome') {
    if (typeof message.epoch !== 'string' || typeof message.subscription !== 'string' || !Array.isArray(message.slices)) return { state, outcome: 'reconnect', error: 'invalid' };
    const keep = state.epoch === message.epoch ? message.slices : [];
    const revs = {}, values = {};
    for (const slice of keep) if (slice in state.revs) { revs[slice] = state.revs[slice]; values[slice] = state.values[slice]; }
    return { state: { epoch: message.epoch, subscription: message.subscription, slices: [...message.slices], revs, values, lastBatch: 0 }, outcome: 'welcome' };
  }
  if (message.type !== 'changes' || !Number.isSafeInteger(message.batch) || message.batch < 1 || !Array.isArray(message.changes) || !message.changes.length) return { state, outcome: 'reconnect', error: 'invalid' };
  if (message.epoch !== state.epoch) return { state, outcome: 'reconnect', error: 'epoch' };
  if (message.subscription !== state.subscription) return { state, outcome: 'ignored', error: 'subscription' };
  if (message.batch <= state.lastBatch) return { state, outcome: 'duplicate', batch: message.batch };
  const revs = { ...state.revs }, values = { ...state.values }, gaps = [], seen = new Set();
  for (const change of message.changes) {
    if (!validChange(change, state.slices) || seen.has(change.slice)) return { state, outcome: 'reconnect', error: 'invalid' };
    seen.add(change.slice);
    if (change.kind === 'reset') { revs[change.slice] = change.rev; values[change.slice] = change.value; continue; }
    if (revs[change.slice] !== change.baseRev) { gaps.push(change.slice); continue; }
    if (change.kind === 'replace') values[change.slice] = change.value;
    else {
      const next = patchCollection(values[change.slice] || { byId: {}, order: [], meta: {} }, change);
      if (!next) { gaps.push(change.slice); continue; }
      values[change.slice] = next;
    }
    revs[change.slice] = change.rev;
  }
  // A batch with any gap changes nothing; the client asks for those slices again.
  if (gaps.length) return { state, outcome: 'resync', slices: gaps };
  return { state: { ...state, revs, values, lastBatch: message.batch }, outcome: 'applied', batch: message.batch };
}

// ---- Snapshot from slices -----------------------------------------------------
// Same output as legacySnapshot in electron/projections.cjs; tests compare both
// with the snapshot main builds from the services. The phone pairing code and
// the Meshy device code are not in any slice; they come from explicit reads.

// ---- Desktop subscription -----------------------------------------------------
//   transport.send(message) -> Promise    (window.dock.state.send)
//   transport.onMessage(fn) -> unsubscribe (window.dock.state.onMessage)
//   read(method) -> Promise<value>         explicit reads for display codes
//   onSnapshot(snapshot)                   called after each applied batch
//   onError(error)                      the subscription failed
// Returns {state(), resume(), stop()}.
export function connectStateV2({ transport, read = async () => null, onSnapshot, onError = () => {}, slices = DESKTOP_SLICES, maxRetries = 3 }) {
  let client = initialProtocolState(), stopped = false, retries = 0;
  const codes = { pairingCode: undefined, meshyCode: undefined }, keys = { pairing: '', meshy: '' };
  const ready = () => slices.every(slice => slice in client.revs);
  // Views get their own copy, as with explicit snapshot reads, so a view that edits its
  // state object cannot change the cached slices.
  const emit = changedSlices => { if (!stopped && ready()) onSnapshot(structuredClone(snapshotFromSlices(client.values, codes)), changedSlices); };
  const fail = error => {
    if (stopped) return;
    stop();
    onError(error instanceof Error ? error : new Error(String(error?.message || error || 'State protocol 2 failed.')));
  };
  const send = message => {
    if (stopped) return;
    let sent;
    try { sent = transport.send(message); } catch (error) { fail(error); return; }
    Promise.resolve(sent).catch(fail);
  };
  const hello = (resume = true) => send({ type: 'hello', protocol: 2, lastRev: resume && client.epoch ? { epoch: client.epoch, revs: { ...client.revs } } : null, slices: [...slices], compression: ['none'] });
  // Codes kept out of the store are read when their status appears or changes.
  function refreshCodes() {
    const pairing = client.values.mobileStatus?.pendingPairing, meshy = client.values.imageJobs?.meshyAuth;
    const pairingKey = pairing ? JSON.stringify(pairing) : '', meshyKey = meshy?.state === 'waiting' ? JSON.stringify(meshy) : '';
    if (pairingKey !== keys.pairing) {
      keys.pairing = pairingKey; codes.pairingCode = undefined;
      if (pairingKey) Promise.resolve(read('mobile.status')).then(value => {
        if (stopped || keys.pairing !== pairingKey || typeof value?.pendingPairing?.code !== 'string') return;
        codes.pairingCode = value.pendingPairing.code; emit();
      }, () => {});
    }
    if (meshyKey !== keys.meshy) {
      keys.meshy = meshyKey; codes.meshyCode = undefined;
      if (meshyKey) Promise.resolve(read('meshy.auth')).then(value => {
        if (stopped || keys.meshy !== meshyKey || typeof value?.code !== 'string') return;
        codes.meshyCode = value.code; emit();
      }, () => {});
    }
  }
  function receive(message) {
    if (stopped) return;
    const result = applyProtocolMessage(client, message);
    client = result.state;
    switch (result.outcome) {
      case 'applied':
        retries = 0;
        send({ type: 'ack', subscription: client.subscription, batch: result.batch });
        refreshCodes(); emit(result.state.lastChanged || message.changes.map(change => change.slice)); return;
      case 'duplicate': send({ type: 'ack', subscription: client.subscription, batch: result.batch }); return;
      case 'resync': send({ type: 'resync', subscription: client.subscription, slices: result.slices }); return;
      case 'pong': send({ type: 'pong', nonce: result.nonce }); return;
      case 'reconnect':
        if (++retries > maxRetries) { fail(new Error(`State protocol 2 kept failing (${result.error}).`)); return; }
        client = initialProtocolState(); hello(false); return;
      case 'error':
        // The main process lost the subscription (for example after a restart of
        // the connection): subscribe again from the cached revisions.
        if (result.error === 'unsupported' || result.error === 'unauthorized' || ++retries > maxRetries) { fail(new Error(`State protocol 2 error: ${result.error}.`)); return; }
        hello(true); return;
      default: return;
    }
  }
  const off = transport.onMessage(receive);
  function stop() { if (stopped) return; stopped = true; try { off?.(); } catch {} }
  hello(false);
  return { state: () => client, resume: () => hello(true), restart: () => { client = initialProtocolState(); hello(false); }, stop, get stopped() { return stopped; } };
}
