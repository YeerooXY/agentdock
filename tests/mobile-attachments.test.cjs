'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MobileAttachments, MAX_IMAGE } = require('../electron/mobile-attachments.cjs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
test('image uploads stay in the selected workspace and validate size, ordering and type', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'dock-image-'))); // CI temp folders can be short names or symlinks
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const service = new MobileAttachments(), session = { id: 'one', alive: true, cwd: root }, client = { selected: 'one' };
  assert.throws(() => service.begin(client, session, MAX_IMAGE + 1));
  assert.throws(() => service.begin(client, { ...session, remote: {} }, 10));
  const { uploadId } = service.begin(client, session, png.length);
  assert.throws(() => service.chunk(client, { uploadId, offset: 1, data: png.toString('base64') }));
  service.chunk(client, { uploadId, offset: 0, data: png.toString('base64') });
  const saved = await service.finish(client, { uploadId }, () => true);
  assert.ok(saved.path.startsWith(path.join(root, '.agentdock', 'mobile-attachments') + path.sep));
  assert.deepEqual(await fs.readFile(saved.path), png);
  const invalid = Buffer.from('<script>fake image</script>');
  const second = service.begin(client, session, invalid.length);
  service.chunk(client, { ...second, offset: 0, data: invalid.toString('base64') });
  await assert.rejects(service.finish(client, second, () => true), /PNG or JPEG/);
});
test('revocation, changed console and linked folders cannot save an attachment', async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'dock-image-'))); // CI temp folders can be short names or symlinks
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'dock-image-outside-'));
  t.after(() => Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(outside, { recursive: true, force: true })]));
  const service = new MobileAttachments(), session = { id: 'one', alive: true, cwd: root }, client = { selected: 'one' };
  const prepare = () => { const payload = service.begin(client, session, png.length); service.chunk(client, { ...payload, offset: 0, data: png.toString('base64') }); return payload; };
  let payload = prepare();
  await assert.rejects(service.finish(client, payload, () => false), /changed/);
  payload = prepare(); client.selected = 'two';
  await assert.rejects(service.finish(client, payload, () => true), /changed/);
  client.selected = 'one';
  await fs.rmdir(path.join(root, '.agentdock', 'mobile-attachments'));
  await fs.rmdir(path.join(root, '.agentdock'));
  await fs.symlink(outside, path.join(root, '.agentdock'), process.platform === 'win32' ? 'junction' : 'dir');
  payload = prepare();
  await assert.rejects(service.finish(client, payload, () => true), /linked/);
  assert.deepEqual(await fs.readdir(outside), []);
});
