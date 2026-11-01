'use strict';
// Deterministic comparison of captured, equivalent accepted runs. No model call.
const fs = require('node:fs');
const { compareUsage } = require('../electron/workflow-comparison.cjs');
const { summarizeUsage } = require('../electron/workflow-usage.cjs');
function read(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(value.entries)) value.usage = summarizeUsage(value.entries);
  return value;
}
if (process.argv.length !== 4) { console.error('Usage: node scripts/compare-workflow-usage.cjs baseline.json candidate.json'); process.exitCode = 1; }
else {
  const result = compareUsage(read(process.argv[2]), read(process.argv[3]));
  console.log(JSON.stringify(result, null, 2));
  if (!result.comparable) process.exitCode = 2;
}
