'use strict';
const fs = require('node:fs'), path = require('node:path'), { createHash } = require('node:crypto');
const valid = name => typeof name === 'string' && name.trim() === name && name.length > 0 && name.length <= 40 && !/[\u0000-\u001f]/.test(name);
const folderFor = (profile, name) => path.join(profile, 'subjects', createHash('sha256').update(name).digest('hex').slice(0, 24));

function createSubject(profile, name) {
  if (!profile || !valid(name)) throw new Error('Choose a subject and a Playtime data folder.');
  const folder = folderFor(profile, name);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'subject.json');
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ version: 1, name }), { flag: 'wx' });
  if (JSON.parse(fs.readFileSync(file, 'utf8')).name !== name) throw new Error('The saved subject does not match.');
  return { folder, name };
}

function subjectAt(profile, directory) {
  if (!profile || !directory) return null;
  try {
    const folder = fs.realpathSync(directory), parent = fs.realpathSync(path.join(profile, 'subjects'));
    const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
    if (!same(path.dirname(folder), parent)) return null;
    const file = path.join(folder, 'subject.json');
    if (fs.statSync(file).size > 1024) return null;
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value.version !== 1 || !valid(value.name) || !same(folder, fs.realpathSync(folderFor(profile, value.name)))) return null;
    return { id: null, name: value.name, folder, custom: true };
  } catch { return null; }
}
module.exports = { createSubject, subjectAt };
