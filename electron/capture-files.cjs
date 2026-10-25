'use strict';
// Generated dependencies and Paddock's own metadata are not project edits.
const generatedPath = /(^|\/)(\.git|\.agentdock|\.deps|__pycache__|node_modules|\.dart_tool|\.build|build|dist|release|vendor|\.gradle|\.idea|\.next|coverage|\.venv|venv)(\/|$)/i;
const ignoredCaptureFile = file => generatedPath.test(String(file || '').replaceAll('\\', '/'));
const captureChanges = changes => Array.isArray(changes) ? changes.filter(change => !ignoredCaptureFile(change.file)) : [];
const sameSnapshotFile = (before, after) => !!before && !!after && (
  before.signature != null && after.signature != null
    ? before.signature === after.signature
    : before.metadata != null && before.metadata === after.metadata
);
module.exports = { ignoredCaptureFile, captureChanges, sameSnapshotFile };
