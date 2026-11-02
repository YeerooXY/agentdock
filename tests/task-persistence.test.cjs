'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { TaskLoop } = require('../electron/task-loop.cjs');

function loopFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-persist-'));
  const loop = new TaskLoop(root, { now: () => 1000 });
  t.after(() => { loop.interruptAll(); fs.rmSync(root, { recursive: true, force: true }); });
  const job = { id: 'parent', title: 'T', state: 'passed', repo: root, startedAt: 1, finishedAt: 2, fingerprint: 'a', rounds: [], subtasks: [{ id: 'sub', parentId: 'parent', state: 'done' }], log: [] };
  loop.jobs.set(job.id, job);
  const events = [], errors = [];
  loop.on('changed', event => events.push(event)); loop.on('storage-error', event => errors.push(event));
  return { loop, job, root, events, errors, file: path.join(root, 'tasks', 'parent.json') };
}

test('persist writes the parent once and emits one id/view event', t => {
  const f = loopFixture(t);
  assert.equal(f.loop.persist(f.job), true);
  assert.equal(f.events.length, 1); assert.equal(f.events[0].id, 'parent'); assert.equal(f.events[0].view.id, 'parent');
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).id, 'parent');
});

test('changed is an alias and a subtask persists its parent with a single emission', t => {
  const f = loopFixture(t);
  f.job.subtasks[0].state = 'merged'; f.loop.changed(f.job.subtasks[0]);
  assert.equal(f.events.length, 1); assert.equal(f.events[0].id, 'parent');
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).subtasks[0].state, 'merged');
  assert.ok(!fs.existsSync(path.join(f.root, 'tasks', 'sub.json')));
  f.loop.changed(f.job); assert.equal(f.events.length, 2);
});

test('timer and deadline paths persist once per write', async t => {
  const f = loopFixture(t);
  f.job.state = 'implementing'; f.job.timeLimitMinutes = 1; f.job.split = true; f.job.activeElapsedMs = 0;
  f.loop.split.build = async () => {}; f.loop.startSplit(f.job, false);
  assert.equal(f.events.length, 1); // runStartedAt write
  await f.loop.pending.get('parent');
  assert.equal(f.events.length, 2); // completion write
  assert.equal(f.job.runStartedAt, undefined);
});

test('a failed write reports a storage error and never emits success', t => {
  const f = loopFixture(t);
  fs.mkdirSync(f.file, { recursive: true }); // rename onto a directory fails
  assert.equal(f.loop.persist(f.job), false);
  assert.equal(f.events.length, 0); assert.equal(f.errors.length, 1);
  assert.match(f.errors[0].error, /could not be saved/); assert.equal(f.errors[0].id, 'parent');
  assert.equal(f.loop.changed(f.job.subtasks[0]), false); assert.equal(f.events.length, 0);
  fs.rmSync(f.file, { recursive: true });
  assert.equal(f.loop.persist(f.job), true); assert.equal(f.events.length, 1);
  assert.deepEqual(f.errors.at(-1), { id: 'parent', error: '' });
});

test('an orphaned subtask is a storage error, not a throw', t => {
  const f = loopFixture(t);
  assert.equal(f.loop.persist({ id: 'x', parentId: 'gone' }), false); assert.equal(f.errors.length, 1); assert.equal(f.events.length, 0);
});

test('snapshot is a pure read and verification is scheduled explicitly', async t => {
  const f = loopFixture(t); let refreshes = 0;
  f.loop.refresh = async () => { refreshes++; };
  f.loop.snapshot(); f.loop.snapshot();
  assert.equal(refreshes, 0); assert.equal(f.events.length, 0); assert.ok(!fs.existsSync(f.file));
  await f.loop.verifyRepository(f.root); assert.equal(refreshes, 1);
  await f.loop.startVerification(60_000); assert.equal(refreshes, 2);
  f.loop.stopVerification(); assert.equal(f.loop.verifyTimer, null);
});

test('verifyRepository clears the throttle only for the matching repository', async t => {
  const f = loopFixture(t); let seen;
  f.loop.refresh = async () => { seen = new Set(f.loop.refreshedAt.keys()); };
  f.loop.refreshedAt.set('parent', 5);
  await f.loop.verifyRepository(os.tmpdir()); assert.ok(seen.has('parent'));
  await f.loop.verifyRepository(f.root); assert.ok(!seen.has('parent'));
});

test('a verification result from a changed task generation is discarded', async t => {
  const f = loopFixture(t);
  f.loop.fingerprint = async () => { f.loop.persist(f.job); return 'b'; }; // task changes mid-flight
  f.loop.capture = async () => ({ finalDiff: 'stale-diff' });
  f.loop.record = async () => {};
  await f.loop.refresh('parent');
  assert.equal(f.job.finalDiff, undefined); assert.equal(f.job.state, 'passed');
  assert.equal(f.events.length, 1); // only the mid-flight write
  f.loop.fingerprint = async () => 'b'; f.loop.refreshedAt.clear();
  await f.loop.refresh('parent'); assert.equal(f.job.finalDiff, 'stale-diff');
});
