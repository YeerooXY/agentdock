'use strict';

const TASK_SCHEMA_VERSION = 1;
const ATTEMPT_SCHEMA_VERSION = 1;
const STEERING_SCHEMA_VERSION = 1;

function attemptId(ownerId, number) {
  return `${ownerId}-attempt-${number}`;
}

function migrateAttempts(rounds, ownerId) {
  if (!Array.isArray(rounds)) return false;
  let changed = false;
  rounds.forEach((attempt, index) => {
    if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) return;
    if (!attempt.attemptId) { attempt.attemptId = attemptId(ownerId, index + 1); changed = true; }
    if (attempt.schemaVersion !== ATTEMPT_SCHEMA_VERSION) { attempt.schemaVersion = ATTEMPT_SCHEMA_VERSION; changed = true; }
    if (!Number.isInteger(attempt.steeringSequenceConsumed) || attempt.steeringSequenceConsumed < 0) { attempt.steeringSequenceConsumed = 0; changed = true; }
  });
  return changed;
}

function migrateTaskRecord(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return false;
  let changed = false;
  for (const [key, version] of [['schemaVersion', TASK_SCHEMA_VERSION], ['attemptSchemaVersion', ATTEMPT_SCHEMA_VERSION], ['steeringSchemaVersion', STEERING_SCHEMA_VERSION]]) {
    if (task[key] !== version) { task[key] = version; changed = true; }
  }
  for (const key of ['eventSequence', 'steeringSequence']) {
    if (!Number.isInteger(task[key]) || task[key] < 0) { task[key] = 0; changed = true; }
  }
  if (!Array.isArray(task.rounds)) { task.rounds = []; changed = true; }
  changed = migrateAttempts(task.rounds, task.id) || changed;
  if (task.split) {
    if (!Array.isArray(task.subtasks)) { task.subtasks = []; changed = true; }
    for (const slice of task.subtasks) {
      if (!slice || typeof slice !== 'object' || Array.isArray(slice)) continue;
      if (!Array.isArray(slice.rounds)) { slice.rounds = []; changed = true; }
      changed = migrateAttempts(slice.rounds, slice.id || `${task.id}-${slice.subtaskId || 'slice'}`) || changed;
    }
  }
  return changed;
}

module.exports = { TASK_SCHEMA_VERSION, ATTEMPT_SCHEMA_VERSION, STEERING_SCHEMA_VERSION, attemptId, migrateTaskRecord };
