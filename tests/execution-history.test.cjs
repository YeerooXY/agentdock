'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ExecutionHistory, EXECUTION_HISTORY_SCHEMA_VERSION } = require('../electron/execution-history.cjs');

function fixture(t, initialTime = 1_800_000_000_000) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-exec-history-'));
  let current = initialTime;
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const clock = {
    now: () => current,
    advance(ms = 1000) { current += ms; return current; },
    set(value) { current = value; return current; }
  };
  return { root, clock, history: new ExecutionHistory(root, { now: clock.now }) };
}

test('isolates task and review records sharing the same id and omits file paths from record values', t => {
  const { root, clock, history } = fixture(t);
  const sharedId = 'run_42-alpha';
  const taskOutcome = {
    type: 'task',
    taskId: sharedId,
    verdict: 'ready',
    changedFiles: { count: 1, top: ['src/app.js'] }
  };
  const taskRecord = history.put({
    kind: 'task',
    id: sharedId,
    title: 'Fix the header layout',
    report: '# Fix the header layout\n\nAll checks passed.',
    outcome: taskOutcome
  });
  clock.advance(5000);
  const reviewRecord = history.put({
    kind: 'review',
    id: sharedId,
    title: 'Review by Claude Code',
    report: '# Review by Claude Code\n\nVERDICT: approve'
  });

  assert.deepEqual(fs.readdirSync(path.join(root, 'execution-history')).sort(), [
    `review-${sharedId}.json`,
    `task-${sharedId}.json`
  ]);
  assert.deepEqual(taskRecord, {
    schemaVersion: EXECUTION_HISTORY_SCHEMA_VERSION,
    kind: 'task',
    id: sharedId,
    title: 'Fix the header layout',
    report: '# Fix the header layout\n\nAll checks passed.',
    outcome: taskOutcome,
    revision: 1,
    updatedAt: 1_800_000_000_000
  });
  assert.deepEqual(reviewRecord, {
    schemaVersion: EXECUTION_HISTORY_SCHEMA_VERSION,
    kind: 'review',
    id: sharedId,
    title: 'Review by Claude Code',
    report: '# Review by Claude Code\n\nVERDICT: approve',
    outcome: null,
    revision: 1,
    updatedAt: 1_800_000_005_000
  });
  assert.deepEqual(history.get('task', sharedId), taskRecord);
  assert.deepEqual(history.get('review', sharedId), reviewRecord);
  assert.equal(history.get('task', 'missing-id'), null);
  assert.equal(history.get('review', 'missing-id'), null);
  assert.equal(JSON.stringify(taskRecord).includes(root), false);
  assert.equal(JSON.stringify(reviewRecord).includes(root), false);
});

test('persists across restart and preserves idempotency and revision increments', t => {
  const { root, clock, history } = fixture(t);
  const first = history.put({
    kind: 'task',
    id: 'task-1',
    title: 'Initial report',
    report: 'Round 1 log',
    outcome: { verdict: 'needs-decision', checks: { status: 'passed', summary: 'Checks passed.' } }
  });
  assert.equal(first.revision, 1);
  assert.equal(first.updatedAt, 1_800_000_000_000);

  clock.advance(10_000);
  // Same content with reversed object key order must still be idempotent.
  const repeated = history.put({
    kind: 'task',
    id: 'task-1',
    title: 'Initial report',
    report: 'Round 1 log',
    outcome: { checks: { summary: 'Checks passed.', status: 'passed' }, verdict: 'needs-decision' }
  });
  assert.equal(repeated.revision, 1);
  assert.equal(repeated.updatedAt, 1_800_000_000_000);

  clock.advance(10_000);
  const updated = history.put({
    kind: 'task',
    id: 'task-1',
    title: 'Initial report',
    report: 'Round 2 log',
    outcome: { verdict: 'ready', checks: { status: 'passed', summary: 'Checks passed.' } }
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.updatedAt, 1_800_000_020_000);

  clock.advance(10_000);
  const restarted = new ExecutionHistory(root, { now: clock.now });
  assert.deepEqual(restarted.get('task', 'task-1'), updated);

  const afterRestartRepeat = restarted.put({
    kind: 'task',
    id: 'task-1',
    title: 'Initial report',
    report: 'Round 2 log',
    outcome: { verdict: 'ready', checks: { status: 'passed', summary: 'Checks passed.' } }
  });
  assert.equal(afterRestartRepeat.revision, 2);
  assert.equal(afterRestartRepeat.updatedAt, 1_800_000_020_000);

  const afterRestartChange = restarted.put({
    kind: 'task',
    id: 'task-1',
    title: 'Accepted report',
    report: 'Round 2 log',
    outcome: null
  });
  assert.equal(afterRestartChange.revision, 3);
  assert.equal(afterRestartChange.updatedAt, 1_800_000_030_000);
  assert.equal(afterRestartChange.outcome, null);
});

test('deep-copies and deep-freezes returned records so caller mutation cannot alter stored data', t => {
  const { history } = fixture(t);
  const inputOutcome = {
    verdict: 'ready',
    changedFiles: { count: 2, top: ['a.js', 'b.js'] },
    usage: { cloud: { calls: 1, input: 10, output: 5, cached: 0 } }
  };
  const saved = history.put({
    kind: 'task',
    id: 'immutable-1',
    title: 'Check immutability',
    report: 'Report body',
    outcome: inputOutcome
  });

  // Mutating the caller's input object after put must not affect saved or stored records.
  inputOutcome.verdict = 'failed';
  inputOutcome.changedFiles.top.push('c.js');
  inputOutcome.usage.cloud.calls = 99;

  assert.equal(saved.outcome.verdict, 'ready');
  assert.deepEqual(saved.outcome.changedFiles.top, ['a.js', 'b.js']);
  assert.equal(saved.outcome.usage.cloud.calls, 1);

  assert.equal(Object.isFrozen(saved), true);
  assert.equal(Object.isFrozen(saved.outcome), true);
  assert.equal(Object.isFrozen(saved.outcome.changedFiles), true);
  assert.equal(Object.isFrozen(saved.outcome.changedFiles.top), true);
  assert.equal(Object.isFrozen(saved.outcome.usage.cloud), true);

  assert.throws(() => { saved.title = 'Tampered'; }, TypeError);
  assert.throws(() => { saved.outcome.verdict = 'tampered'; }, TypeError);
  assert.throws(() => { saved.outcome.changedFiles.top.push('tampered.js'); }, TypeError);

  const loaded = history.get('task', 'immutable-1');
  assert.equal(Object.isFrozen(loaded), true);
  assert.equal(Object.isFrozen(loaded.outcome), true);
  assert.equal(Object.isFrozen(loaded.outcome.changedFiles.top), true);
  assert.throws(() => { loaded.report = 'Tampered'; }, TypeError);
  assert.throws(() => { loaded.outcome.changedFiles.count = 999; }, TypeError);
  assert.deepEqual(history.get('task', 'immutable-1'), saved);
});

test('validates all inputs before IO and rejects traversal, bad kinds, bad types, non-finite times, oversize and non-JSON outcomes', t => {
  const { root, clock, history } = fixture(t);

  for (const badRoot of ['', '   ', 'bad\0root', null, undefined, 123, {}]) {
    assert.throws(() => new ExecutionHistory(badRoot));
  }
  assert.throws(() => new ExecutionHistory(root, null));
  assert.throws(() => new ExecutionHistory(root, { now: 'not-a-function' }));

  const validBase = { kind: 'task', id: 'valid_1', title: 'Valid title', report: 'Valid report', outcome: null };

  for (const badKind of ['other', '', null, undefined, 123, {}]) {
    assert.throws(() => history.get(badKind, 'valid_1'), /kind/i);
    assert.throws(() => history.put({ ...validBase, kind: badKind }), /kind/i);
  }

  for (const badId of [
    '', '../escape', '..\\escape', 'a/b', 'a\\b', 'task.json', 'space id', 'bad\0id',
    'a'.repeat(101), '__proto__', 'constructor', 'prototype', null, undefined, 123, {}
  ]) {
    assert.throws(() => history.get('task', badId), /ID/i);
    assert.throws(() => history.put({ ...validBase, id: badId }), /ID/i);
  }

  for (const badEntry of [null, undefined, 'string', 123, []]) {
    assert.throws(() => history.put(badEntry), /object/i);
  }

  for (const badTitle of [null, undefined, 123, {}, [], 'bad\0title', 'x'.repeat(201)]) {
    assert.throws(() => history.put({ ...validBase, title: badTitle }), /Title/i);
  }

  for (const badReport of [
    null, undefined, 123, {}, [], 'bad\0report',
    'x'.repeat(2 * 1024 * 1024 + 1),
    'é'.repeat(1024 * 1024 + 1)
  ]) {
    assert.throws(() => history.put({ ...validBase, report: badReport }), /Report/i);
  }

  const circular = { verdict: 'ready' };
  circular.self = circular;
  const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
  const withAccessor = {};
  Object.defineProperty(withAccessor, 'verdict', { enumerable: true, get: () => 'ready' });
  const withProto = JSON.parse('{"__proto__":{"polluted":true}}');

  for (const badOutcome of [
    'string', 123, true, [], () => {}, new Date(), /regex/,
    { bad: undefined }, { bad: NaN }, { bad: Infinity }, { bad: -Infinity },
    { bad: () => {} }, { bad: Symbol('s') }, { bad: 1n }, { bad: 'null\0byte' },
    circular, { list: sparse }, withAccessor, withProto,
    { huge: 'x'.repeat(256 * 1024) }
  ]) {
    assert.throws(() => history.put({ ...validBase, outcome: badOutcome }), /outcome/i);
  }

  for (const badTime of [NaN, Infinity, -Infinity, '123', null]) {
    clock.set(badTime);
    assert.throws(() => history.put(validBase), /timestamp|finite/i);
  }
  clock.set(1_800_000_000_000);

  // None of the rejected calls above may have created the execution-history directory.
  assert.equal(fs.existsSync(path.join(root, 'execution-history')), false);

  // Exact boundary sizes (100-char id, 200-char title, 2 MiB report) succeed.
  const boundaryRecord = history.put({
    kind: 'review',
    id: 'a'.repeat(100),
    title: 't'.repeat(200),
    report: 'r'.repeat(2 * 1024 * 1024),
    outcome: { zero: -0 }
  });
  assert.equal(boundaryRecord.revision, 1);
  assert.equal(Object.is(boundaryRecord.outcome.zero, 0), true);
});

test('preserves corrupt or unreadable records and keeps the prior valid record when a write fails', t => {
  const { root, clock, history } = fixture(t);
  const dir = path.join(root, 'execution-history');
  const first = history.put({
    kind: 'task',
    id: 'preserve-1',
    title: 'First valid save',
    report: 'Valid report v1',
    outcome: { verdict: 'ready' }
  });
  const file = path.join(dir, 'task-preserve-1.json');

  // Simulate a disk flush failure during an update: prior valid record must remain intact.
  clock.advance(1000);
  const flush = t.mock.method(fs, 'fsyncSync', () => {
    throw Object.assign(new Error('Disk write failed'), { code: 'EIO' });
  });
  assert.throws(() => history.put({
    kind: 'task',
    id: 'preserve-1',
    title: 'Second save fails',
    report: 'Valid report v2',
    outcome: { verdict: 'failed' }
  }), /Disk write failed/);
  flush.mock.restore();

  assert.deepEqual(fs.readdirSync(dir), ['task-preserve-1.json']);
  assert.deepEqual(history.get('task', 'preserve-1'), first);

  // Next update after disk recovery increments from revision 1 to 2.
  const second = history.put({
    kind: 'task',
    id: 'preserve-1',
    title: 'Second save succeeds',
    report: 'Valid report v2',
    outcome: { verdict: 'failed' }
  });
  assert.equal(second.revision, 2);

  // Corrupt raw bytes and structurally invalid records on disk must be preserved untouched.
  const corruptPayloads = [
    Buffer.from('{"schemaVersion":1,"kind":"task"'),
    Buffer.alloc(32),
    Buffer.from(JSON.stringify({ ...second, schemaVersion: 99 })),
    Buffer.from(JSON.stringify({ ...second, id: 'wrong-id' })),
    Buffer.from(JSON.stringify({ ...second, revision: 0 })),
    Buffer.from(JSON.stringify({ ...second, extra: 'unexpected' }))
  ];
  for (const bytes of corruptPayloads) {
    const corruptFile = path.join(dir, 'task-corrupt-case.json');
    fs.writeFileSync(corruptFile, bytes);
    assert.throws(() => history.get('task', 'corrupt-case'), /preserved/i);
    assert.throws(() => history.put({
      kind: 'task',
      id: 'corrupt-case',
      title: 'Must not overwrite corrupt file',
      report: 'Body'
    }), /preserved/i);
    assert.deepEqual(fs.readFileSync(corruptFile), bytes);
  }
});

test('rejects redirected or symlinked archive directories and record files', t => {
  const { root, history } = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-exec-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));

  const dir = path.join(root, 'execution-history');
  fs.symlinkSync(outside, dir, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => history.get('task', 'any'), /redirected/i);
  assert.throws(() => history.put({ kind: 'task', id: 'any', title: 'T', report: 'R' }), /redirected/i);
  fs.rmSync(dir, { recursive: true, force: true });

  // Normal directory with a redirected record entry.
  history.put({ kind: 'task', id: 'good', title: 'Good', report: 'Body' });
  const redirectedRecord = path.join(dir, 'task-redirected.json');
  fs.symlinkSync(outside, redirectedRecord, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => history.get('task', 'redirected'), /redirected/i);
  assert.throws(() => history.put({ kind: 'task', id: 'redirected', title: 'T', report: 'R' }), /redirected/i);
});

test('report pages preserve Unicode and reject changed revisions and invalid ranges', t => {
  const { history } = fixture(t);
  history.put({ kind: 'task', id: 'page', title: 'Report', report: 'abc\u{1F600}xyz' });
  const first = history.read('task', 'page', { limit: 4 });
  assert.equal(first.text, 'abc'); assert.equal(first.nextOffset, 3);
  const next = history.read('task', 'page', { offset: first.nextOffset, limit: 5, revision: first.revision });
  assert.equal(first.text + next.text, 'abc\u{1F600}xyz'); assert.equal(next.nextOffset, null);
  for (const options of [{ offset: 4 }, { offset: -1 }, { offset: 100 }, { limit: 1 }, { limit: 64001 }]) assert.throws(() => history.read('task', 'page', options));
  history.put({ kind: 'task', id: 'page', title: 'Report', report: 'changed' });
  assert.throws(() => history.read('task', 'page', { revision: first.revision }), /changed/);
});
