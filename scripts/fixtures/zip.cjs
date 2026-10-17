'use strict';
const { crc32, deflateRawSync } = require('node:zlib');
// Small local ZIP fixtures: no shell tools, downloads, or external archive service.
module.exports = function zipFixture(files) {
  const bodies = [], directory = []; let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name), data = Buffer.from(file.data || ''), packed = deflateRawSync(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(file.flags || 0, 6); header.writeUInt16LE(8, 8); header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(file.size ?? data.length, 22); header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(file.flags || 0, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(file.size ?? data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(file.attributes || 0, 38); central.writeUInt32LE(offset, 42);
    bodies.push(header, name, packed); directory.push(central, name); offset += header.length + name.length + packed.length;
  }
  const index = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...bodies, index, end]);
};
