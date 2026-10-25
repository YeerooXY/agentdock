'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PromptLibrary } = require('../electron/prompt-library.cjs');

test('saved prompts are created, edited, removed and kept on disk', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-prompts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const library = new PromptLibrary(root);
  const tests = library.save({ name: ' Tests first ', text: 'Write the failing test first.\r\nThen fix it.' });
  const style = library.save({ name: 'Style', text: 'Follow AGENTS.md.', projectId: 'p-1' });
  assert.equal(tests.name, 'Tests first');
  assert.equal(tests.text, 'Write the failing test first.\nThen fix it.');
  assert.equal(tests.projectId, null);
  assert.equal(style.projectId, 'p-1');
  library.save({ id: tests.id, name: 'Tests first', text: 'Changed' });
  library.remove(style.id);
  assert.deepEqual(new PromptLibrary(root).list().map(x => [x.name, x.text]), [['Tests first', 'Changed']]);
  assert.throws(() => library.save({ id: style.id, name: 'Gone', text: 'x' }), /was removed/);
  assert.throws(() => library.save({ name: '', text: 'x' }), /Name the prompt/);
  assert.throws(() => library.save({ name: 'x', text: ' ' }), /Type the prompt/);
  assert.throws(() => library.save({ name: 'x'.repeat(61), text: 'x' }), /up to 60/);
  assert.throws(() => library.remove(style.id), /already removed/);
});

test('a damaged prompts file is preserved, not overwritten', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-prompts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'prompts.json'), '{broken');
  assert.throws(() => new PromptLibrary(root), /Cannot read prompts.json/);
  assert.equal(fs.readFileSync(path.join(root, 'prompts.json'), 'utf8'), '{broken');
});
