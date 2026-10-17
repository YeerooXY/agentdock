'use strict';
const path = require('node:path');
const yauzl = require('yauzl');
const images = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const texts = new Set(['.md', '.txt', '.json', '.log', '.html', '.diff', '.patch', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.py', '.cs', '.c', '.cpp', '.h', '.sh', '.ps1', '.yaml', '.yml', '.toml', '.xml', '.csv']);

// Read one bounded entry directly from the saved ZIP. Nothing is extracted,
// executed, or written beside the user's original files.
function previewArchive(file, { entry: requested, thumbnail = false, nativeImage } = {}) {
  if (requested != null && (!Number.isInteger(requested) || requested < 0 || requested >= 400)) throw new Error('Choose a file in this archive.');
  return new Promise((resolve, reject) => {
    let zip, stream, done = false, scanned = 0;
    const entries = [], records = [];
    const timer = setTimeout(() => finish(new Error('Archive preview timed out.')), 5000);
    function finish(error, value) {
      if (done) return; done = true; clearTimeout(timer); stream?.destroy(); zip?.close();
      error ? reject(error) : resolve(value);
    }
    function show(limited = false) {
      if (done) return;
      const archive = { entries, limited };
      const selected = requested != null ? entries[requested] : entries.find(x => x.image && x.previewable) || entries.find(x => x.previewable);
      if (requested != null && !selected) return finish(new Error('This archive file is no longer available.'));
      if (!selected?.previewable) return finish(null, { archive, entry: selected || null, text: selected?.reason || 'No previewable files in this archive.' });
      zip.openReadStream(records[selected.index], (error, source) => {
        if (done) { source?.destroy(); return; }
        if (error) return finish(new Error('This archive file could not be read.'));
        stream = source; const chunks = []; let size = 0;
        const limit = selected.image ? 10 * 1024 * 1024 : 1024 * 1024;
        stream.on('data', chunk => {
          size += chunk.length;
          if (size > limit) return finish(new Error('This archive file is too large to preview.'));
          chunks.push(chunk);
        });
        stream.on('error', () => finish(new Error('This archive file is damaged.')));
        stream.on('end', () => {
          if (done) return;
          try {
            const buffer = Buffer.concat(chunks), result = { archive, entry: selected };
            if (selected.image && nativeImage) {
              const image = nativeImage.createFromBuffer(buffer);
              if (image.isEmpty()) throw new Error('This image could not be read.');
              const { width, height } = image.getSize();
              const scale = Math.min(1, (thumbnail ? 360 : 1440) / width, (thumbnail ? 400 : 1800) / height);
              result.image = image.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }).toDataURL();
            } else if (selected.image) result.text = 'Image preview is unavailable.';
            else if (buffer.includes(0)) result.text = 'This file contains binary data. Use Export to open it in another app.';
            else { result.text = buffer.subarray(0, 100000).toString('utf8'); result.truncated = buffer.length > 100000; }
            finish(null, result);
          } catch (error) { finish(error); }
        });
      });
    }
    yauzl.open(file, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (error, opened) => {
      if (done) { opened?.close(); return; }
      if (error) return finish(new Error('This ZIP could not be read. It may be damaged or encrypted.'));
      zip = opened;
      zip.on('error', () => finish(new Error('This ZIP contains an invalid file.')));
      zip.on('entry', entry => {
        const directory = /\/$/.test(entry.fileName);
        if (!directory) {
          const ext = path.posix.extname(entry.fileName).toLowerCase(), image = images.has(ext);
          const symlink = (entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000;
          const reason = entry.generalPurposeBitFlag & 1 ? 'Encrypted file' : symlink ? 'Link preview unavailable' :
            !image && !texts.has(ext) ? 'Export to open this file' : entry.uncompressedSize > (image ? 10 : 1) * 1024 * 1024 ? 'Too large to preview' : '';
          entries.push({ index: entries.length, name: entry.fileName, ext, size: entry.uncompressedSize, image, previewable: !reason, reason }); records.push(entry);
        }
        if (entries.length >= 400 || ++scanned >= 1000) show(true); else zip.readEntry();
      });
      zip.on('end', () => show(false)); zip.readEntry();
    });
  });
}
module.exports = { previewArchive };
