'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { summarize, hookSummary } = require('../electron/alert-summary.cjs');

test('summaries are one plain line without markdown, capped at a word', () => {
  assert.equal(summarize('## Done\n\n- **CI** is `green` on [Windows](https://x)\n```js\ncode()\n```\nNext: merge.'), 'Done CI is green on Windows Next: merge.');
  const long = summarize('word '.repeat(80));
  assert.ok(long.length <= 180); assert.ok(long.endsWith('…')); assert.doesNotMatch(long, /\s…$/);
  assert.equal(summarize(''), '');
});

test('hook summaries come from what each agent reported', t => {
  assert.equal(hookSummary('codex-notify', { 'last-assistant-message': 'Fixed the **cart** total.' }), 'Fixed the cart total.');
  assert.equal(hookSummary('Notification', { message: 'Claude needs your permission to use Bash' }), 'Claude needs your permission to use Bash');
  assert.equal(hookSummary('PermissionRequest', { tool_name: 'Edit' }), 'Wants to use Edit');
  assert.equal(hookSummary('UserPromptSubmit', { prompt: 'secret prompt' }), '', 'prompts never become alerts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alert-summary-')), file = path.join(dir, 'transcript.jsonl');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(file, [
    { type: 'user', message: { role: 'user', content: 'do it' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Earlier answer.' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Bash' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'All 435 tests pass; merged.' }] } },
  ].map(x => JSON.stringify(x)).join('\n') + '\n');
  assert.equal(hookSummary('Stop', { transcript_path: file }), 'All 435 tests pass; merged.');
  assert.equal(hookSummary('Stop', { transcript_path: 'relative.jsonl' }), '');
  assert.equal(hookSummary('Stop', { transcript_path: path.join(dir, 'missing.jsonl') }), '');
});
