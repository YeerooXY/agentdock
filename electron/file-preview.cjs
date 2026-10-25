'use strict';
const fs = require('fs');
const path = require('path');

const IMAGES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
const TEXT_LIMIT = 256 * 1024, IMAGE_LIMIT = 15 * 1024 * 1024;

// Resolves a path printed in a console. Relative paths start at that console's
// folder; a trailing :line or :line:column (as compilers print) is ignored.
function resolve(raw, cwd) {
  let value = String(raw || '').trim().replace(/^["'`(]+|["'`),.;]+$/g, '');
  if (!value || value.length > 1024 || value.includes('\0')) throw new Error('That is not a file path.');
  const located = /^(.*?):(\d+)(?::\d+)?$/.exec(value);
  if (located && !/^[a-zA-Z]$/.test(located[1])) value = located[1];
  if (value.startsWith('~')) value = path.join(require('os').homedir(), value.slice(1));
  return path.resolve(cwd || require('os').homedir(), value);
}

function preview(raw, cwd) {
  const file = resolve(raw, cwd);
  let stat;
  try { stat = fs.statSync(file); } catch { throw new Error(`File not found: ${file}`); }
  const base = { path: file, name: path.basename(file) || file, size: stat.size, modified: stat.mtimeMs };
  if (stat.isDirectory()) return { ...base, kind: 'folder' };
  const ext = path.extname(file).toLowerCase();
  if (IMAGES[ext]) {
    if (stat.size > IMAGE_LIMIT) return { ...base, kind: 'large' };
    return { ...base, kind: 'image', data: `data:${IMAGES[ext]};base64,${fs.readFileSync(file).toString('base64')}` };
  }
  const handle = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(stat.size, TEXT_LIMIT));
    fs.readSync(handle, buffer, 0, buffer.length, 0);
    if (buffer.includes(0)) return { ...base, kind: 'binary' };
    return { ...base, kind: ext === '.md' || ext === '.markdown' ? 'markdown' : 'text', text: buffer.toString('utf8'), truncated: stat.size > TEXT_LIMIT };
  } finally { fs.closeSync(handle); }
}

module.exports = { preview, resolve };
