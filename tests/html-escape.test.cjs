const { test } = require('node:test');
const assert = require('node:assert/strict');

test('one escape helper renders 0 and false as text and null as nothing', async () => {
  const { escapeHtml } = await import('../src/html-escape.js');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(false), 'false');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
});
