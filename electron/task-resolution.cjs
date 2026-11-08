'use strict';
const { createHash } = require('node:crypto');
// System disposition records execution evidence; it never creates an owner approval.
function resolutionCandidate(job, { fingerprint, head, live = false } = {}) {
  if (job.automaticResolution !== true || job.state !== 'passed' || job.parentId) return { eligible: false, reason: 'manual-or-incomplete' };
  if (live || !fingerprint || fingerprint !== job.fingerprint || job.diffError || job.unresolved?.length || job.ownershipFindings?.length) return { eligible: false, reason: 'unverified-artifact' };
  const round = job.rounds?.at(-1), check = round?.check, review = round?.review;
  if (!check || check.fingerprint !== fingerprint) return { eligible: false, reason: 'stale-checks' };
  if (job.checks && (check.state !== 'passed' || check.outcome !== 'passed' || check.exitCode !== 0 || check.timedOut || check.command !== job.checks)) return { eligible: false, reason: 'checks-incomplete' };
  if (job.reviewer && (review?.state !== 'done' || review.verdict !== 'approve' || review.findings?.length || review.fingerprint !== fingerprint)) return { eligible: false, reason: 'review-incomplete' };
  const expectedHead = check.head || job.sourceRevision;
  if (!expectedHead || head !== expectedHead) return { eligible: false, reason: 'source-head-changed' };
  if (job.workflow === 'worktree' && !job.checks) return { eligible: false, reason: 'publication-needs-checks', decisionRequired: true };
  const operationId = createHash('sha256').update(JSON.stringify(['task-resolution-v1', job.id, fingerprint, head])).digest('hex');
  return { eligible: true, operationId, actor: 'system', policy: 'authorized-task-v1', fingerprint, head, disposition: job.workflow === 'worktree' ? 'integrated' : job.checks ? 'verified' : 'completed-unverified' };
}
module.exports = { resolutionCandidate };
