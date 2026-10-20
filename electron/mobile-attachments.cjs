'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_IMAGE = 4 * 1024 * 1024;
function imageType(bytes) {
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 &&
      bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(16) <= 8192 && bytes.readUInt32BE(20) <= 8192) return '.png';
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return '.jpg';
  throw new Error('Choose a PNG or JPEG image.');
}
class MobileAttachments {
  begin(client, session, size) {
    if (client.uploadFinishing) throw new Error('Wait for the image transfer to finish.');
    if (!session?.alive || session.remote || !Number.isSafeInteger(size) || size < 4 || size > MAX_IMAGE) throw new Error('Choose a local console and an image up to 4 MB.');
    const upload = { id: randomUUID(), session, size, bytes: 0, chunks: [], expires: Date.now() + 120000 };
    client.upload = upload;
    return { uploadId: upload.id };
  }
  current(client, payload) {
    const upload = client.upload;
    if (!upload || upload.id !== payload.uploadId || upload.expires < Date.now() ||
        client.selected !== upload.session.id || !upload.session.alive || upload.session.dismissed) {
      delete client.upload; throw new Error('Attachment expired or console changed. Choose the image again.');
    }
    return upload;
  }
  chunk(client, payload) {
    const upload = this.current(client, payload);
    if (payload.offset !== upload.bytes || typeof payload.data !== 'string' || payload.data.length > 44000 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.data)) throw new Error('Invalid image chunk.');
    const bytes = Buffer.from(payload.data, 'base64');
    if (!bytes.length || upload.bytes + bytes.length > upload.size) throw new Error('Image is too large.');
    upload.chunks.push(bytes); upload.bytes += bytes.length;
    return true;
  }
  async finish(client, payload, authorized) {
    if (client.uploadFinishing) throw new Error('Wait for the image transfer to finish.');
    const upload = this.current(client, payload);
    if (upload.bytes !== upload.size) throw new Error('Image transfer is incomplete.');
    delete client.upload;
    client.uploadFinishing = true;
    try { return await this.save(client, upload, authorized); }
    finally { client.uploadFinishing = false; }
  }
  async save(client, upload, authorized) {
    const bytes = Buffer.concat(upload.chunks), ext = imageType(bytes);
    const base = await fs.realpath(upload.session.cwd);
    let folder = base;
    for (const name of ['.agentdock', 'mobile-attachments']) {
      folder = path.join(folder, name);
      await fs.mkdir(folder).catch(error => { if (error.code !== 'EEXIST') throw error; });
      const stat = await fs.lstat(folder);
      if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(folder) !== folder) throw new Error('The attachment folder must not be linked.');
    }
    const names = await fs.readdir(folder);
    if (names.length >= 128) throw new Error('Remove older copies from .agentdock/mobile-attachments on the PC first.');
    let used = 0;
    for (const name of names) used += (await fs.lstat(path.join(folder, name))).size;
    if (used + bytes.length > 64 * 1024 * 1024) throw new Error('This project has 64 MB of phone attachments. Remove older copies on the PC first.');
    if (!authorized() || client.selected !== upload.session.id || !upload.session.alive || upload.session.dismissed) throw new Error('Connection or console changed.');
    const file = path.join(folder, randomUUID() + ext);
    await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
    if (!authorized() || client.selected !== upload.session.id || !upload.session.alive || upload.session.dismissed) {
      await fs.unlink(file); throw new Error('Connection or console changed.');
    }
    return { path: file, size: bytes.length };
  }
}
module.exports = { MobileAttachments, imageType, MAX_IMAGE };
