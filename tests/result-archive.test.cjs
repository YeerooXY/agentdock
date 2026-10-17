'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Results } = require('../electron/results.cjs');
const zip = require('../scripts/fixtures/zip.cjs');
function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-zip-')), project = path.join(root, 'project'), store = path.join(root, 'store');
  fs.mkdirSync(project); fs.mkdirSync(store);
  const source = path.join(project, 'evidence.zip'); fs.writeFileSync(source, zip(files));
  const results = new Results(store, { trash: dir => fs.promises.rm(dir, { recursive: true }) });
  const item = results.add({ file: source, title: 'Evidence' }, { project });
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }); });
  return { source, results, item, project, store };
}
test('ZIP previews browse Markdown and code without extraction; deletion removes all saved files', async t => {
  const f = fixture(t, [{ name: 'checks/report.md', data: '# Verified\n\nKeyboard works.' }, { name: 'changes/app.diff', data: '-old\n+new' }]);
  const preview = await f.results.preview(f.item.id);
  assert.equal(preview.archive.entries.length, 2); assert.match(preview.text, /^# Verified/); assert.equal(preview.entry.ext, '.md');
  assert.equal((await f.results.preview(f.item.id, false, 1)).text, '-old\n+new');
  assert.deepEqual(fs.readdirSync(f.project), ['evidence.zip'], 'preview must not extract files into the project');
  const owned = f.results.directory(f.item.id); assert.deepEqual(fs.readdirSync(owned), ['result.zip']);
  assert.deepEqual(await f.results.remove([f.item.id]), { deleted: [f.item.id], failed: [] });
  assert.equal(fs.existsSync(owned), false); assert.ok(fs.existsSync(f.source));
  assert.deepEqual(new Results(f.store).list(), []);
  await assert.rejects(async () => f.results.preview(f.item.id), /deleted/);
});
test('archive traversal and corrupt entry sizes fail without reading or writing outside the saved ZIP', async t => {
  const traversal = fixture(t, [{ name: '../outside.txt', data: 'invalid' }]);
  await assert.rejects(traversal.results.preview(traversal.item.id), /invalid/);
  const malformed = fixture(t, [{ name: 'report.md', data: 'extra data', size: 1 }]);
  await assert.rejects(malformed.results.preview(malformed.item.id), /damaged/);
});
test('encrypted, oversized, and linked members are listed without decompressing them', async t => {
  const f = fixture(t, [{ name: 'large.md', data: 'small', size: 2 * 1024 * 1024 }, { name: 'private.md', flags: 1, data: 'secret' }, { name: 'link.md', data: '../outside', attributes: 0xa0000000 }]);
  const preview = await f.results.preview(f.item.id);
  assert.ok(preview.archive.entries.every(x => !x.previewable)); assert.equal(preview.text, 'No previewable files in this archive.');
  assert.equal((await f.results.preview(f.item.id, false, 1)).text, 'Encrypted file');
  await assert.rejects(async () => f.results.preview(f.item.id, false, 600), /Choose/);
});
