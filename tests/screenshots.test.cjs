'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { Screenshots, clipboardReader } = require('../electron/screenshots.cjs');

function fakeImage(bytes) {
  return { isEmpty: () => !bytes, toBitmap: () => Buffer.from(bytes || ''), toPNG: () => Buffer.from('png:' + bytes), resize() { return this; }, toDataURL: () => 'data:image/png;base64,AA==' };
}
function fixture(t, clip = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-shots-')), folder = path.join(root, 'Screen shots');
  fs.mkdirSync(folder);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Electron 44 clipboard: async read() of W3C-style items, no readImage().
  const clipboard = {
    image: clip, text: '',
    async read() { return this.image ? [{ types: ['text/plain', 'image/png'], getType: async () => new Blob([this.image]) }] : [{ types: ['text/plain'], getType: async () => new Blob([this.text]) }]; },
    async readText() { return this.text; },
  };
  const nativeImage = { createFromPath: () => fakeImage('file'), createFromBuffer: buffer => fakeImage(buffer.toString()) };
  const shots = new Screenshots(root, { clipboard: clipboardReader(clipboard, nativeImage), nativeImage, folders: [folder] });
  return { root, folder, clipboard, shots };
}
const open = { alive: true, provider: 'claude' };

test('picks the newest screenshot file and quotes paths with spaces', async t => {
  const { folder, shots } = fixture(t);
  fs.writeFileSync(path.join(folder, 'old.png'), 'a'); fs.utimesSync(path.join(folder, 'old.png'), new Date(1000), new Date(1000));
  fs.writeFileSync(path.join(folder, 'new.png'), 'b'); fs.writeFileSync(path.join(folder, 'notes.txt'), 'c');
  await shots.refresh();
  assert.equal(shots.snapshot().name, 'new.png');
  assert.equal(shots.pathFor(open), `"${path.join(folder, 'new.png')}"`);
});

test('a new clipboard snip is saved once and only app-saved files are pruned', async t => {
  const { root, folder, clipboard, shots } = fixture(t);
  fs.writeFileSync(path.join(folder, 'old.png'), 'a'); fs.utimesSync(path.join(folder, 'old.png'), new Date(1000), new Date(1000));
  await shots.refresh({ initial: true });
  clipboard.image = 'snip';
  await shots.refresh();
  assert.equal(shots.snapshot().source, 'clipboard');
  const saved = path.join(root, 'screenshots'), keep = path.join(saved, 'mine.png');
  fs.mkdirSync(saved); fs.writeFileSync(keep, 'x');
  for (let i = 0; i < 25; i++) fs.writeFileSync(path.join(saved, `screenshot-20260101-0000${String(i).padStart(2, '0')}-abcdef.png`), 'x');
  const first = shots.file();
  assert.equal(shots.file(), first);
  assert.equal(fs.readFileSync(first, 'utf8'), 'png:snip');
  assert.ok(fs.existsSync(keep));
  assert.equal(fs.readdirSync(saved).filter(x => x.startsWith('screenshot-')).length, 20);
  assert.ok(fs.existsSync(path.join(folder, 'old.png')));
});

test('an image already on the clipboard at startup does not beat a screenshot file', async t => {
  const { folder, shots } = fixture(t, 'earlier');
  fs.writeFileSync(path.join(folder, 'shot.png'), 'a'); fs.utimesSync(path.join(folder, 'shot.png'), new Date(1000), new Date(1000));
  await shots.refresh({ initial: true });
  assert.equal(shots.snapshot().name, 'shot.png');
});

test('refuses SSH consoles, closed consoles and missing screenshots', async t => {
  const { folder, shots } = fixture(t);
  await shots.refresh();
  assert.throws(() => shots.pathFor(open), /No screenshot yet/);
  fs.writeFileSync(path.join(folder, 'a.png'), 'a'); await shots.refresh();
  assert.throws(() => shots.pathFor({ alive: true, remote: { hostId: 'vm' } }), /SSH consoles/);
  assert.throws(() => shots.pathFor({ alive: false }), /open console/);
  fs.rmSync(path.join(folder, 'a.png'));
  assert.throws(() => shots.pathFor(open), /moved or deleted/);
});

test('WSL Claude consoles receive a /mnt path', { skip: process.platform !== 'win32' && 'WSL is Windows only' }, async t => {
  const { folder, shots } = fixture(t);
  fs.writeFileSync(path.join(folder, 'a.png'), 'a'); await shots.refresh();
  const value = shots.pathFor({ alive: true, provider: 'claude', claudeTarget: { kind: 'wsl' } });
  assert.match(value, /^"\/mnt\/[a-z]\/.*\/Screen shots\/a\.png"$/);
});

test('plain PowerShell/CMD consoles are refused with a clear message', async t => {
  const { folder, shots } = fixture(t);
  fs.writeFileSync(path.join(folder, 'a.png'), 'a'); await shots.refresh();
  assert.throws(() => shots.pathFor({ alive: true, provider: 'shell' }), process.platform === 'win32' ? /PowerShell and CMD cannot open images/ : /plain shell cannot open images/);
  assert.match(shots.pathFor({ alive: true, provider: 'kiro' }), /a\.png/);
});

test('Ctrl+V pastes a clipboard image as a saved path and text as text', async t => {
  const { root, clipboard, shots } = fixture(t);
  clipboard.text = 'plain text';
  assert.equal(await shots.paste(open), 'plain text');
  clipboard.image = 'pasted';
  const value = await shots.paste(open);
  assert.ok(value.includes(path.join(root, 'screenshots')));
  await assert.rejects(shots.paste({ alive: true, provider: 'shell' }), /cannot open images/);
});
