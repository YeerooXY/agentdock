'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { TASK_SCHEMA_VERSION, ATTEMPT_SCHEMA_VERSION, STEERING_SCHEMA_VERSION, attemptId, migrateTaskRecord } = require('../electron/task-contracts.cjs');
const { TaskLoop } = require('../electron/task-loop.cjs');

test('interrupted task migration versions attempts without changing their assignments or progress', () => {
  const task = {
    id: 'task-1', state: 'interrupted', split: true,
    implementer: { accountId: 'codex:default', model: 'gpt-6.1-terra' },
    rounds: [{ number: 1, implement: { state: 'done' }, review: { state: 'running' } }],
    subtasks: [{ id: 'task-1-first', subtaskId: 'first', state: 'interrupted', implementer: { accountId: 'claude:default', model: 'claude-sonnet-5' }, rounds: [{ number: 1, implement: { state: 'done' } }] }]
  };
  const assignments = structuredClone([task.implementer, task.subtasks[0].implementer]);
  assert.equal(migrateTaskRecord(task), true);
  assert.equal(task.schemaVersion, TASK_SCHEMA_VERSION); assert.equal(task.attemptSchemaVersion, ATTEMPT_SCHEMA_VERSION);
  assert.equal(task.steeringSchemaVersion, STEERING_SCHEMA_VERSION);
  assert.equal(task.rounds[0].attemptId, 'task-1-attempt-1'); assert.equal(task.rounds[0].schemaVersion, ATTEMPT_SCHEMA_VERSION);
  assert.equal(task.subtasks[0].rounds[0].steeringSequenceConsumed, 0);
  assert.deepEqual([task.implementer, task.subtasks[0].implementer], assignments);
  assert.equal(task.state, 'interrupted'); assert.equal(task.rounds[0].review.state, 'running');
  assert.equal(migrateTaskRecord(task), false);
});

test('migrated attempt IDs match new rounds, stay unique across slices and retries, and preserve saved IDs', () => {
  const task = { id: 'task-1', split: true, rounds: [{ number: 1 }, { number: 2 }], subtasks: [
    { id: 'task-1-task', subtaskId: 'task', rounds: [{ number: 1 }, { number: 2 }] },
    { id: 'task-1-first', subtaskId: 'first', rounds: [{ number: 1 }, { number: 2 }] },
    { subtaskId: 'second', rounds: [{ number: 1 }] },
    { id: 'task-1-third', subtaskId: 'third', rounds: [{ number: 1, attemptId: 'saved-attempt-id' }] }
  ] };
  migrateTaskRecord(task);
  const ids = [task, ...task.subtasks].flatMap(owner => owner.rounds.map(round => round.attemptId));
  assert.deepEqual(ids, [attemptId(task.id, 1), attemptId(task.id, 2),
    attemptId('task-1-task', 1), attemptId('task-1-task', 2), attemptId('task-1-first', 1), attemptId('task-1-first', 2),
    attemptId('task-1-second', 1), 'saved-attempt-id']);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(migrateTaskRecord(task), false);
});

test('startup persists migrated interruptions before asynchronous recovery without launching workers', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-contracts-'));
  let loop;
  t.after(async () => {
    if (loop) await Promise.all(loop.pending.values());
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'tasks'));
  const implementer = { accountId: 'claude:default', model: 'claude-sonnet-5' };
  const task = { id: 'restart-task', state: 'implementing', split: true, startedAt: 1, workFolder: root, implementer,
    rounds: [{ number: 1, startedAt: 1, implement: { ...implementer, state: 'running', startedAt: 1 } }],
    subtasks: [{ id: 'restart-task-first', subtaskId: 'first', state: 'checking', startedAt: 1, implementer,
      rounds: [{ number: 1, startedAt: 1, check: { state: 'running', startedAt: 1 } }] }] };
  const file = path.join(root, 'tasks', `${task.id}.json`);
  fs.writeFileSync(file, JSON.stringify(task));
  loop = new TaskLoop(root, { now: () => 100, spawnProcess: () => assert.fail('Startup must not launch a worker.'),
    run: (_program, _args, _options, callback) => callback(new Error('Mock Git unavailable.')) });
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(stored.state, 'interrupted'); assert.equal(stored.rounds[0].implement.state, 'interrupted');
  assert.equal(stored.subtasks[0].state, 'interrupted'); assert.equal(stored.subtasks[0].rounds[0].check.state, 'interrupted');
  assert.deepEqual(stored.implementer, implementer); assert.deepEqual(stored.subtasks[0].implementer, implementer);
  assert.equal(stored.rounds[0].attemptId, 'restart-task-attempt-1');
  assert.equal(stored.subtasks[0].rounds[0].attemptId, 'restart-task-first-attempt-1');
  assert.equal(migrateTaskRecord(stored), false);
  await Promise.all(loop.pending.values());
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).state, 'interrupted');
});
