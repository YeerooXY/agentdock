'use strict';
const { createHash } = require('node:crypto');

const SHA256 = /^[a-f0-9]{64}$/, GIT_REVISION = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const INVENTORY_BOUNDS = { maxEntries: 20000, maxDepth: 20 };
const sha = text => createHash('sha256').update(text).digest('hex');

// Proves one relayed operation has no source change, using only task evidence and snapshots.
// No model, provider or budget is involved. Any failed or missing check returns proven:false and the
// operation stays unsettled. Empty touchedPaths alone never prove anything.
function proveNoSourceChange({ job, record, folder, sources, inventory, safeRead }) {
  const no = reason => ({ proven: false, reason });
  if (!job || !record || job.id !== record.taskId || job.projectId !== record.projectId) return no('task-mismatch');
  const delta = job.pendingDocDelta;
  if (!delta || delta.operationId !== record.operationId || delta.relayed !== true) return no('delta-mismatch');

  // Terminal success with no live process and a settled merge-back for worktrees.
  if (!['passed', 'accepted'].includes(job.state) || !job.finishedAt || job.processPid) return no('task-not-terminal-success');
  if (job.workflow === 'worktree' && job.mergeBack?.state !== 'completed') return no('merge-back-incomplete');

  // Positive, explicit evidence that the task changed nothing.
  if (!Array.isArray(job.changedFiles) || job.changedFiles.length) return no('changes-listed-or-unknown');
  if (job.diffError !== '' || job.finalDiff !== '' || job.diffStat !== 'No task changes.') return no('diff-not-empty');
  if (!Array.isArray(record.touchedPaths) || record.touchedPaths.length) return no('paths-listed');
  if (job.documentationEvidence !== undefined) {
    const evidence = job.documentationEvidence;
    if (!evidence || evidence.schemaVersion !== 1 || evidence.complete !== true || evidence.omittedCount !== 0 || evidence.changedCount !== 0) return no('enumeration-incomplete');
    const stored = record.deltaEvidence;
    if (!stored || stored.complete !== true || stored.omittedCount !== 0 || stored.changedCount !== 0) return no('delta-evidence-mismatch');
  } else if (record.deltaEvidence !== undefined) return no('delta-evidence-mismatch');

  // The fingerprint and baseline must match the queued delta.
  if (typeof job.fingerprint !== 'string' || !SHA256.test(job.fingerprint) || record.diffHash !== job.fingerprint || delta.diffHash !== job.fingerprint) return no('fingerprint-mismatch');
  if (typeof job.baseline !== 'string' || !GIT_REVISION.test(job.baseline)) return no('baseline-invalid');

  // Snapshots must be present, match the authorized root, and be complete for the base.
  const documentation = job.documentation;
  if (!documentation?.enabled || documentation.error || documentation.rootId !== record.rootId || record.rootId !== delta.rootId) return no('documentation-root-mismatch');
  if (!SHA256.test(record.baseSnapshot || '') || record.baseSnapshot !== documentation.baseSnapshot || record.baseSnapshot !== delta.baseSnapshot) return no('base-snapshot-missing');
  if (!SHA256.test(record.targetSnapshot || '') || record.targetSnapshot !== delta.targetSnapshot) return no('target-snapshot-missing');
  const base = sources.load(record.projectId, record.baseSnapshot);
  const target = sources.load(record.projectId, record.targetSnapshot);
  if (base.rootId !== record.rootId || target.rootId !== record.rootId) return no('snapshot-root-mismatch');
  if (!base.coverage?.complete || base.coverage.selectionOnly || base.coverage.omittedCount !== 0 || !base.coverage.inventoryId) return no('base-enumeration-incomplete');
  if (target.files.length || target.coverage?.inventoryId !== base.coverage.inventoryId) return no('target-changed');

  // Current source must match the base: same enumerated metadata and the same content hash for every base file.
  const current = inventory(folder, INVENTORY_BOUNDS);
  if (!current.coverage.complete || current.inventoryId !== base.coverage.inventoryId) return no('source-inventory-changed');
  for (const file of base.files) {
    let text;
    try { text = safeRead(folder, file.path); } catch { return no('source-unreadable'); }
    if (sha(text) !== file.contentHash) return no('source-content-changed');
  }

  return { proven: true, receipt: { mode: 'proven-no-change', evidence: record.deltaEvidence ? 'task-evidence' : 'legacy-task', baseSnapshot: record.baseSnapshot,
    targetSnapshot: record.targetSnapshot, inventoryId: current.inventoryId, sourceFiles: base.files.length } };
}

module.exports = { proveNoSourceChange, INVENTORY_BOUNDS };
