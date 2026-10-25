'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { previewUrl, isLocal } = require('../electron/web-preview.cjs');

test('preview addresses are limited to local servers', () => {
  assert.equal(previewUrl('localhost:5173'), 'http://localhost:5173/');
  assert.equal(previewUrl('5173'), 'http://localhost:5173/');
  assert.equal(previewUrl(' http://127.0.0.1:3000/app?x=1 '), 'http://127.0.0.1:3000/app?x=1');
  assert.equal(previewUrl('https://[::1]:8443/'), 'https://[::1]:8443/');
  assert.equal(previewUrl(''), '');
  for (const bad of ['https://example.com', 'http://localhost.example.com', 'file:///C:/x.html', 'javascript:alert(1)', 'http://user:pw@localhost:1/', 'http://192.168.1.5:3000', 'http://0.0.0.0:3000'])
    assert.throws(() => previewUrl(bad), /local/, bad);
  assert.equal(isLocal('http://localhost:5173/x'), true);
  assert.equal(isLocal('https://example.com/'), false);
  assert.equal(isLocal('not a url'), false);
});

test('a preview panel is saved and restored with its address and linked console', async t => {
  const { Sessions } = require('../electron/sessions.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-web-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sessions = new Sessions(root, { pty: { spawn() { return { onData() {}, onExit() {}, kill() {} }; } }, findProgram: () => null });
  const panel = sessions.createWebPanel({ url: 'localhost:5173', codeSourceKey: 'console-a' });
  assert.equal(panel.kind, 'web');
  assert.equal(panel.url, 'http://localhost:5173/');
  assert.equal(sessions.list().some(x => x.id === panel.id), false, 'panels are not consoles');
  assert.deepEqual(sessions.codePanels().map(x => x.id), [panel.id]);
  assert.throws(() => sessions.write(panel.id, 'x'), /preview panel/);
  assert.throws(() => sessions.setWebUrl(panel.id, 'https://example.com'), /local servers only/);
  sessions.setWebUrl(panel.id, '127.0.0.1:8080/docs');
  const saved = sessions.savedConsoles().find(x => x.kind === 'web');
  assert.deepEqual({ url: saved.url, provider: saved.provider, codeSourceKey: saved.codeSourceKey }, { url: 'http://127.0.0.1:8080/docs', provider: 'web', codeSourceKey: 'console-a' });
  const restored = new Sessions(path.join(root, 'b'), { pty: { spawn() { return { onData() {}, onExit() {}, kill() {} }; } }, findProgram: () => null });
  const again = await restored.restore(saved);
  assert.equal(again.url, 'http://127.0.0.1:8080/docs');
  assert.equal(await restored.restore({ ...saved, url: 'https://example.com' }), null, 'a tampered address is not restored');
  sessions.end(panel.id);
  assert.equal(sessions.codePanels().length, 0);
});
