'use strict';
// Regenerates tests/fixtures/state from these inputs and the reference implementation.
// Run: node scripts/state-fixtures.cjs. Review the diff: fixtures are the contract.
const fs = require('node:fs');
const path = require('node:path');
const repo = path.join(__dirname, '..');
const P = require(path.join(repo, 'electron/state-protocol.cjs'));
const { phoneSession, phoneTask, phoneProject, phoneUsageAccounts, PHONE } = require(path.join(repo, 'electron/projections.cjs'));
const out = path.join(repo, 'tests/fixtures/state');
fs.mkdirSync(path.join(out, 'dto'), { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');

write('slices.json', {
  protocol: P.PROTOCOL,
  slices: P.SLICES,
  views: Object.keys(P.VIEWS),
  phone: P.PHONE_SLICES,
  secretKeyPattern: P.SECRET_KEY.source, secretKeyFlags: P.SECRET_KEY.flags,
  compression: P.COMPRESSION, errorCodes: P.ERROR_CODES,
});

const E = 'epoch-a', S = 'sub-1';
const coll = (...items) => P.toCollection(items);
const messages = {
  valid: [
    { name: 'hello fresh', direction: 'client', message: { type: 'hello', protocol: 2, lastRev: null, slices: ['sessions', 'tasks'], compression: ['gzip', 'none'] } },
    { name: 'hello resume', direction: 'client', message: { type: 'hello', protocol: 2, lastRev: { epoch: E, revs: { sessions: 4, tasks: 2 } }, slices: ['sessions', 'tasks'], compression: ['none'] } },
    { name: 'subscribe', direction: 'client', message: { type: 'subscribe', slices: ['usage'] } },
    { name: 'ack', direction: 'client', message: { type: 'ack', subscription: S, batch: 3 } },
    { name: 'resync', direction: 'client', message: { type: 'resync', subscription: S, slices: ['tasks'] } },
    { name: 'pong', direction: 'client', message: { type: 'pong', nonce: 'n1' } },
    { name: 'welcome', direction: 'server', message: { type: 'welcome', protocol: 2, epoch: E, subscription: S, slices: ['sessions', 'tasks'], compression: 'gzip' } },
    { name: 'changes reset and patch', direction: 'server', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [
      { kind: 'reset', slice: 'sessions', rev: 4, value: coll({ id: 's1', name: 'One' }) },
      { kind: 'patch', slice: 'tasks', baseRev: 2, rev: 3, upsert: { t1: { id: 't1', state: 'done' } }, remove: ['t0'], order: ['t1'] },
    ] } },
    { name: 'changes replace', direction: 'server', message: { type: 'changes', epoch: E, subscription: S, batch: 2, changes: [{ kind: 'replace', slice: 'queues', baseRev: 0, rev: 1, value: { s1: { paused: false, entries: [] } } }] } },
    { name: 'phone hello', direction: 'client', view: 'phone', message: { type: 'hello', protocol: 2, lastRev: null, slices: ['sessions', 'tasks', 'usage', 'projects'], compression: ['gzip', 'none'] } },
    { name: 'phone usage patch', direction: 'server', view: 'phone', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [{ kind: 'patch', slice: 'usage', baseRev: 0, rev: 1, upsert: { 'claude:default': { id: 'claude:default', provider: 'claude', label: 'Claude', hasUsage: true, inUse: false, check: null, windows: [] } }, remove: [] }] } },
    { name: 'ping', direction: 'server', message: { type: 'ping', nonce: 'n1' } },
    { name: 'error', direction: 'server', message: { type: 'error', code: 'unauthorized', message: 'This phone was removed.' } },
  ],
  invalid: [
    { name: 'hello wrong protocol', direction: 'client', code: 'unsupported', message: { type: 'hello', protocol: 1, lastRev: null, slices: ['sessions'], compression: ['none'] } },
    { name: 'hello unknown slice', direction: 'client', code: 'invalid', message: { type: 'hello', protocol: 2, lastRev: null, slices: ['secrets'], compression: ['none'] } },
    { name: 'hello repeated slice', direction: 'client', code: 'invalid', message: { type: 'hello', protocol: 2, lastRev: null, slices: ['tasks', 'tasks'], compression: ['none'] } },
    { name: 'hello bad compression', direction: 'client', code: 'invalid', message: { type: 'hello', protocol: 2, lastRev: null, slices: ['tasks'], compression: ['brotli'] } },
    { name: 'hello negative rev', direction: 'client', code: 'invalid', message: { type: 'hello', protocol: 2, lastRev: { epoch: E, revs: { tasks: -1 } }, slices: ['tasks'], compression: ['none'] } },
    { name: 'ack zero batch', direction: 'client', code: 'invalid', message: { type: 'ack', subscription: S, batch: 0 } },
    { name: 'client unknown field', direction: 'client', code: 'invalid', message: { type: 'pong', nonce: 'n', extra: 1 } },
    { name: 'patch on value slice', direction: 'server', code: 'invalid', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [{ kind: 'patch', slice: 'usage', baseRev: 0, rev: 1, upsert: {}, remove: [] }] } },
    { name: 'replace on collection', direction: 'server', code: 'invalid', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [{ kind: 'replace', slice: 'tasks', baseRev: 0, rev: 1, value: [] }] } },
    { name: 'rev not after baseRev', direction: 'server', code: 'invalid', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [{ kind: 'replace', slice: 'usage', baseRev: 2, rev: 2, value: {} }] } },
    { name: 'slice twice in batch', direction: 'server', code: 'invalid', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [
      { kind: 'replace', slice: 'usage', baseRev: 0, rev: 1, value: {} }, { kind: 'replace', slice: 'usage', baseRev: 1, rev: 2, value: {} }] } },
    { name: 'upsert and remove same id', direction: 'server', code: 'invalid', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [{ kind: 'patch', slice: 'tasks', baseRev: 0, rev: 1, upsert: { a: { id: 'a' } }, remove: ['a'] }] } },
    { name: 'item id differs from key', direction: 'server', code: 'invalid', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [{ kind: 'patch', slice: 'tasks', baseRev: 0, rev: 1, upsert: { a: { id: 'b' } }, remove: [] }] } },
    { name: 'reset collection order mismatch', direction: 'server', code: 'invalid', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [{ kind: 'reset', slice: 'tasks', rev: 1, value: { byId: { a: { id: 'a' } }, order: ['b'], meta: {} } }] } },
    { name: 'secret field in change', direction: 'server', code: 'invalid', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [{ kind: 'replace', slice: 'mobileStatus', baseRev: 0, rev: 1, value: { devices: [{ id: 'd', token: 'abc' }] } }] } },
    { name: 'empty changes', direction: 'server', code: 'invalid', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [] } },
    { name: 'phone cannot subscribe to settings', direction: 'client', view: 'phone', code: 'invalid', message: { type: 'hello', protocol: 2, lastRev: null, slices: ['preferences'], compression: ['gzip'] } },
    { name: 'phone usage is a collection', direction: 'server', view: 'phone', code: 'invalid', message: { type: 'changes', epoch: E, subscription: S, batch: 1, changes: [{ kind: 'replace', slice: 'usage', baseRev: 0, rev: 1, value: {} }] } },
    { name: 'unknown error code', direction: 'server', code: 'invalid', message: { type: 'error', code: 'oops', message: '' } },
  ],
};
write('messages.json', messages);

// Sequences: run the reference client and record outcomes.
const welcome = { type: 'welcome', protocol: 2, epoch: E, subscription: S, slices: ['sessions', 'tasks', 'usage'], compression: 'none' };
const ch = (batch, changes, extra = {}) => ({ type: 'changes', epoch: E, subscription: S, batch, changes, ...extra });
const scripts = [
  { name: 'reset then patch then replace', description: 'Fresh client: welcome, resets, a patch with implicit order, a value replace.', steps: [
    welcome,
    ch(1, [{ kind: 'reset', slice: 'sessions', rev: 3, value: coll({ id: 'a', name: 'A' }, { id: 'b', name: 'B' }) }, { kind: 'reset', slice: 'tasks', rev: 0, value: coll() }, { kind: 'reset', slice: 'usage', rev: 1, value: { accounts: [] } }]),
    ch(2, [{ kind: 'patch', slice: 'sessions', baseRev: 3, rev: 4, upsert: { c: { id: 'c', name: 'C' }, a: { id: 'a', name: 'A2' } }, remove: ['b'] }]),
    ch(3, [{ kind: 'replace', slice: 'usage', baseRev: 1, rev: 2, value: { accounts: [{ id: 'codex:default' }] } }]),
  ] },
  { name: 'explicit order and meta', description: 'A patch that only reorders and changes meta.', steps: [
    welcome,
    ch(1, [{ kind: 'reset', slice: 'tasks', rev: 5, value: P.toCollection([{ id: 'x' }, { id: 'y' }], { meta: { busy: false } }) }]),
    ch(2, [{ kind: 'patch', slice: 'tasks', baseRev: 5, rev: 6, upsert: {}, remove: [], order: ['y', 'x'], meta: { busy: true } }]),
  ] },
  { name: 'duplicate batch ignored', description: 'A batch number at or below the last applied one changes nothing; the client acks again.', steps: [
    welcome,
    ch(1, [{ kind: 'reset', slice: 'usage', rev: 1, value: { n: 1 } }]),
    ch(1, [{ kind: 'reset', slice: 'usage', rev: 9, value: { n: 9 } }]),
  ] },
  { name: 'gap asks for resync atomically', description: 'baseRev mismatch on one slice rejects the whole batch and names the slice.', steps: [
    welcome,
    ch(1, [{ kind: 'reset', slice: 'usage', rev: 1, value: { n: 1 } }, { kind: 'reset', slice: 'tasks', rev: 1, value: coll() }]),
    ch(2, [{ kind: 'replace', slice: 'usage', baseRev: 1, rev: 2, value: { n: 2 } }, { kind: 'patch', slice: 'tasks', baseRev: 4, rev: 5, upsert: { t: { id: 't' } }, remove: [] }]),
    ch(3, [{ kind: 'reset', slice: 'tasks', rev: 5, value: coll({ id: 't' }) }]),
  ] },
  { name: 'deletion', description: 'Removing every item leaves an empty collection.', steps: [
    welcome,
    ch(1, [{ kind: 'reset', slice: 'sessions', rev: 2, value: coll({ id: 'a' }) }]),
    ch(2, [{ kind: 'patch', slice: 'sessions', baseRev: 2, rev: 3, upsert: {}, remove: ['a'] }]),
  ] },
  { name: 'server restart changes epoch', description: 'Changes from another epoch need a fresh hello; a new welcome drops cached slices.', steps: [
    welcome,
    ch(1, [{ kind: 'reset', slice: 'usage', rev: 4, value: { n: 4 } }]),
    ch(2, [{ kind: 'replace', slice: 'usage', baseRev: 4, rev: 5, value: { n: 5 } }], { epoch: 'epoch-b' }),
    { ...welcome, epoch: 'epoch-b', subscription: 'sub-2' },
  ] },
  { name: 'resume in same epoch keeps cache', description: 'A welcome in the same epoch keeps cached values for subscribed slices only.', steps: [
    welcome,
    ch(1, [{ kind: 'reset', slice: 'usage', rev: 4, value: { n: 4 } }, { kind: 'reset', slice: 'tasks', rev: 2, value: coll() }]),
    { ...welcome, subscription: 'sub-2', slices: ['usage'] },
    { type: 'changes', epoch: E, subscription: 'sub-2', batch: 1, changes: [{ kind: 'replace', slice: 'usage', baseRev: 4, rev: 5, value: { n: 5 } }] },
  ] },
  { name: 'stale subscription ignored', description: 'Changes for an old subscription are ignored.', steps: [
    welcome,
    { type: 'changes', epoch: E, subscription: 'sub-0', batch: 1, changes: [{ kind: 'reset', slice: 'usage', rev: 1, value: {} }] },
  ] },
  { name: 'unsubscribed slice reconnects', description: 'A change for a slice outside the subscription is a protocol error.', steps: [
    welcome,
    ch(1, [{ kind: 'reset', slice: 'projects', rev: 1, value: coll() }]),
  ] },
  { name: 'phone view', view: 'phone', description: 'The phone applies its own slice kinds: usage is a collection of accounts.', steps: [
    { ...welcome, slices: ['usage', 'results'] },
    ch(1, [{ kind: 'reset', slice: 'usage', rev: 2, value: coll({ id: 'codex:default', label: 'Codex' }) }, { kind: 'reset', slice: 'results', rev: 1, value: { unread: 0, count: 0 } }]),
    ch(2, [{ kind: 'patch', slice: 'usage', baseRev: 2, rev: 3, upsert: { 'codex:default': { id: 'codex:default', label: 'Codex', inUse: true } }, remove: [] }, { kind: 'replace', slice: 'results', baseRev: 1, rev: 2, value: { unread: 1, count: 1 } }]),
  ] },
  { name: 'ping and error', description: 'Ping is answered with its nonce; error is surfaced.', steps: [
    welcome, { type: 'ping', nonce: 'n7' }, { type: 'error', code: 'unauthorized', message: 'This phone was removed.' },
  ] },
];
const sequences = scripts.map(({ name, description, steps, view = 'desktop' }) => {
  let state = P.initialClientState(view);
  return { name, view, description, start: state, steps: steps.map(message => {
    const result = P.applyServerMessage(state, message); state = result.state;
    const { state: _s, ...outcome } = result;
    return { message, expect: { ...outcome, state } };
  }) };
});
write('sequences.json', sequences);

// Phone DTOs: desktop slice item in, phone DTO out.
const sessionIn = { id: 's1', slot: 2, name: 'Codex', provider: 'codex', alive: true, state: 'active', cols: 120, rows: 30, consoleKey: 'k1', projectId: 'p1',
  remote: null, updatedAt: 1762000000000, providerSessionId: 'thread-1', model: 'GPT-6', modelId: 'gpt-6', effort: 'high', settingsAt: 1762000000000,
  launchId: 'l1', accountId: 'codex:default', accountLabel: 'Codex', switchTargets: [{ id: 'codex:work', label: 'Work', ready: true }], switching: false,
  purpose: 'agent', taskId: null, consoleCapabilities: { input: true, stop: true }, draftSupported: true, cwd: 'C:/Users/me/Projects/x',
  env: { OPENAI_API_KEY: 'sk-test' }, worktree: { branch: 'feature', path: 'C:/w/feature', secretRoot: 'x' } };
const taskIn = { id: 't1', parentId: null, projectId: 'p1', title: 'Fix tests', state: 'reviewing', workflow: 'current', startedAt: 1762000000000, finishedAt: null,
  rounds: [{}, {}], maxRounds: 3, implementer: { accountId: 'codex:default', provider: 'codex', label: 'Codex', model: 'gpt-6', env: { X: '1' } },
  reviewer: null, error: '', resultId: null, unresolved: ['a'], criteria: 'long private criteria', finalDiff: 'diff --git', log: ['line'] };
const projectIn = { id: 'p1', name: 'Paddock', color: '#47c', status: 'active', progress: { done: 1, total: 4 }, lastActiveAt: 1762000000000, createdAt: 1761000000000,
  folders: [{ path: 'C:/Users/me/Projects/agent-dock' }], instructions: 'private' };
const usageIn = { usageAccounts: [{ id: 'claude:default', provider: 'claude', label: 'Claude', hasUsage: true, inUse: true }],
  usageChecks: [{ accountId: 'claude:default', status: 'current', observedAt: 1762000000000, message: '' }],
  limits: [{ provider: 'claude', accountId: 'claude:default', observedAt: 1762000000000, windows: [{ key: 'five-hour', label: '5 hours', minutes: 300, usedPercent: 42, resetsAt: 1762003600000, raw: { cookie: 'x' } }] }] };
write('dto/phone-session.json', { input: sessionIn, output: phoneSession(sessionIn) });
write('dto/phone-task.json', { input: taskIn, output: phoneTask(taskIn) });
write('dto/phone-project.json', { input: projectIn, output: phoneProject(projectIn) });
write('dto/phone-usage-account.json', { input: usageIn, output: phoneUsageAccounts(usageIn).byId['claude:default'] });
console.log('ok');
