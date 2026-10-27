const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../src/ask-agent.js');
const sample = { file: 'src/app.js', from: 4, to: 5, text: 'const x = 1;\nrun(x);', folder: 'Paddock' };

test('formats selected source lines with and without a note', async () => {
  const { formatAskContext: format } = await modulePromise;
  const expected = 'File: src/app.js:4-5  (Paddock)\n```javascript\nconst x = 1;\nrun(x);\n```';
  assert.equal(format(sample), expected);
  assert.equal(format({ ...sample, note: ' Explain this ' }), `Explain this\n\n${expected}`);
  assert.equal(format({ ...sample, note: '   ' }), expected);
});
test('includes branch and diff side, and marks explicitly retained stale snippets', async () => {
  const { formatAskContext: format } = await modulePromise;
  assert.match(format({ ...sample, branch: 'loop/ask-agent', side: 'after' }), /\(Paddock @ loop\/ask-agent, diff after side\)/);
  assert.match(format({ ...sample, stale: true }), /Captured version: the file changed since selection\./);
  assert.doesNotMatch(format(sample), /Captured version/);
});
test('chooses language fences and preserves embedded fences', async () => {
  const { formatAskContext: format } = await modulePromise;
  assert.match(format({ ...sample, file: 'test.py' }), /```python\n/);
  assert.match(format({ ...sample, file: 'README', text: 'plain' }), /\n```\nplain\n```$/);
  assert.match(format({ ...sample, file: 'README.md', text: '```js\nx\n```' }), /\n````markdown\n```js\nx\n```\n````$/);
});
test('enforces the 60,000-character limit on the complete context', async () => {
  const { formatAskContext: format } = await modulePromise;
  const overhead = format({ ...sample, text: '' }).length;
  assert.equal(format({ ...sample, text: 'x'.repeat(60000 - overhead) }).length, 60000);
  assert.throws(() => format({ ...sample, text: 'x'.repeat(60001 - overhead) }), { message: 'Select fewer than 60,000 characters.' });
  assert.throws(() => format({ ...sample, note: 'x'.repeat(60000) }), /Select fewer than 60,000 characters\./);
});
