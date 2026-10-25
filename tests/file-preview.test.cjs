'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { preview, resolve } = require('../electron/file-preview.cjs');

function folder(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-preview-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
function fakeTerm(rows, cols = 40) {
  return { cols, buffer: { active: { getLine: i => i < rows.length ? { isWrapped: rows[i].wrapped, translateToString: trim => trim ? rows[i].text.trimEnd() : rows[i].text.padEnd(cols) } : undefined } } };
}

test('previews text, markdown, images, folders and binaries', t => {
  const root = folder(t);
  fs.writeFileSync(path.join(root, 'notes.txt'), 'hello');
  fs.writeFileSync(path.join(root, 'README.md'), '# Title');
  fs.writeFileSync(path.join(root, 'shot.png'), Buffer.from([137, 80, 78, 71]));
  fs.writeFileSync(path.join(root, 'tool.exe'), Buffer.from([77, 90, 0, 1]));
  assert.deepEqual([preview('notes.txt', root).kind, preview('notes.txt', root).text], ['text', 'hello']);
  assert.equal(preview(path.join(root, 'README.md')).kind, 'markdown');
  assert.match(preview('shot.png', root).data, /^data:image\/png;base64,/);
  assert.equal(preview(root).kind, 'folder');
  assert.equal(preview('tool.exe', root).kind, 'binary');
  assert.throws(() => preview('missing.txt', root), /File not found/);
});

test('large text is truncated and line suffixes are ignored', t => {
  const root = folder(t);
  fs.writeFileSync(path.join(root, 'big.log'), 'x'.repeat(300 * 1024));
  const big = preview('big.log', root);
  assert.equal(big.truncated, true); assert.equal(big.text.length, 256 * 1024);
  if (process.platform === 'win32') {
    assert.equal(resolve('"src\\app.js:12:4",', 'C:\\work'), path.resolve('C:\\work', 'src\\app.js'));
    assert.equal(resolve('C:\\a\\b.md'), path.resolve('C:\\a\\b.md'));
  } else {
    assert.equal(resolve('"src/app.js:12:4",', '/work'), path.resolve('/work', 'src/app.js'));
    assert.equal(resolve('/a/b.md'), path.resolve('/a/b.md'));
  }
});

test('finds Windows, quoted, relative and wrapped paths but not URLs', async () => {
  const { findPaths } = await import('../src/file-links.js');
  const one = text => findPaths(fakeTerm([{ text }], 120), 1).map(x => x.value);
  assert.deepEqual(one('Saved C:\\Users\\me\\VMs\\console-password.txt.'), ['C:\\Users\\me\\VMs\\console-password.txt']);
  assert.deepEqual(one('see "C:\\Users\\me\\Pictures\\Screen shots\\a.png" now'), ['"C:\\Users\\me\\Pictures\\Screen shots\\a.png"']);
  assert.deepEqual(one('edited src/app.js:513 and docs\\ssh-hosts.md'), ['src/app.js:513', 'docs\\ssh-hosts.md']);
  assert.deepEqual(one('open https://kiro.dev/docs/cli/installation.html and version 2.33.1'), []);
  const wrapped = fakeTerm([{ text: 'File:  C:\\Users\\me\\VMs\\paddo' }, { text: 'ck-ubuntu\\pw.txt done', wrapped: true }], 28);
  assert.deepEqual(findPaths(wrapped, 2).map(x => x.value), ['C:\\Users\\me\\VMs\\paddock-ubuntu\\pw.txt']);
  assert.deepEqual(findPaths(wrapped, 2)[0].range, { start: { x: 8, y: 1 }, end: { x: 16, y: 2 } });
});
