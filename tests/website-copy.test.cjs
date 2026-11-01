'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkWebsiteCopy } = require('../electron/website-copy.cjs');
test('known benchmark wording and encoding defects carry evidence and positions', () => {
  const text = 'Home\nBuilt around your day\nOne session at a time.\npÃ©ksÃ©g\nThis website is just a demo.';
  const result = checkWebsiteCopy(text);
  assert.deepEqual([...new Set(result.findings.map(x => x.rule))], ['generic-slogan', 'encoding', 'site-status']);
  assert.equal(result.findings[0].line, 2); assert.equal(result.findings[0].text, 'Built around your day');
  for (const finding of result.findings) assert.equal(text.slice(finding.offset, finding.offset + finding.text.length), finding.text);
});
test('real task labels, availability, product demonstrations and correct Hungarian remain usable', () => {
  assert.deepEqual(checkWebsiteCopy('Classes\nImport PDFs\nBook a demo\nWindows installer unavailable\npékség, hétfő\nPreview your schedule').findings, []);
});
test('promotional reversals and site banners are flagged without rewriting input', () => {
  const result = checkWebsiteCopy("Demo website\nIt's not just a product, it's an experience.");
  assert.equal(result.findings.length, 2); assert.equal(result.findings[1].rule, 'promotional-reversal');
});
test('copy checks are bounded and repeatable', () => {
  assert.throws(() => checkWebsiteCopy('a'.repeat(100001)));
  assert.equal(checkWebsiteCopy('Demo website\n'.repeat(200)).truncated, true);
  assert.equal(checkWebsiteCopy('Demo website').findings.length, 1);
});
