'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const taxonomy = require('../skills/project-documentation/assets/taxonomy.json');
const ADDRESS = /^[0-7](?:\.[1-9]\d{0,3}){0,2}$/;
const ID = /^[a-z][a-z0-9_-]{0,95}$/;
const HEADINGS = ['Responsibility', 'State ownership', 'Rules and obligations', 'Effects and failures', 'Connections', 'Verification', 'Gaps'];
const sha = value => createHash('sha256').update(value).digest('hex');

function relative(value) {
  if (typeof value !== 'string' || !value || value.length > 500 || /[\\:\x00-\x1f]/.test(value) || value.startsWith('/') || value.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Choose a bounded relative documentation path.');
  return value;
}
function rootPath(root) {
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Choose an existing repository directory without a root link.');
  return fs.realpathSync(root);
}
function checkedPath(root, rel) {
  relative(rel); let current = root;
  for (const part of rel.split('/')) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw Error('Documentation paths cannot contain links.');
  }
  return current;
}
function readJson(root, rel) {
  const file = checkedPath(root, rel), stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw Error('Documentation metadata exceeds its limit.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function createFile(root, rel, text) {
  const file = checkedPath(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true }); checkedPath(root, rel);
  fs.writeFileSync(file, text, { flag: 'wx' });
}
function replaceText(root, rel, text, expected) {
  const file = checkedPath(root, rel);
  if (sha(fs.readFileSync(file)) !== expected) return false;
  const temp = rel + '.' + randomUUID() + '.tmp';
  try {
    createFile(root, temp, text);
    if (sha(fs.readFileSync(checkedPath(root, rel))) !== expected) return false;
    fs.renameSync(checkedPath(root, temp), file);
    return true;
  } finally { const target = checkedPath(root, temp); if (fs.existsSync(target)) fs.unlinkSync(target); }
}
function replaceManifest(root, rel, data, expected) {
  if (!replaceText(root, rel, JSON.stringify(data, null, 2) + '\n', expected)) throw Error('Documentation changed; read it again before writing.');
}
function renderIndex(map) {
  if (!Array.isArray(map.sections) || map.sections.length > 500) throw Error('Invalid documentation map or section limit.');
  const escape = text => text.replace(/[\\`*_[\]{}()#+.!<>|&~=\-]/g, '\\$&');
  const sections = map.sections.slice();
  for (const section of sections) {
    if (!section || typeof section.id !== 'string' || !ID.test(section.id) || typeof section.address !== 'string' || !ADDRESS.test(section.address) || section.address.split('.').length !== 3 || typeof section.title !== 'string' || !section.title.trim() || section.title.length > 160 || /[\x00-\x1f\x7f]/.test(section.title)) throw Error('Invalid documentation section.');
    relative(section.document);
  }
  sections.sort((a, b) => {
    const left = a.address.split('.').map(Number), right = b.address.split('.').map(Number);
    return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
  });
  const lines = ['# Application map', '', 'Section metadata: [map.json](map.json).', ''];
  if (!sections.length) lines.push('State: uninspected.', '');
  let category, group;
  for (const section of sections) {
    const parts = section.address.split('.'), nextCategory = parts[0], nextGroup = parts.slice(0, 2).join('.');
    for (const [address, previous, level] of [[nextCategory, category, '##'], [nextGroup, group, '###']]) {
      if (address === previous) continue;
      const heading = taxonomy.entries.find(e => e.address === address);
      if (!heading) throw Error('Address is outside the taxonomy.');
      lines.push(`${level} ${address} ${escape(heading.title)}`, '');
    }
    category = nextCategory; group = nextGroup;
    const link = section.document.split('/').map(part => encodeURIComponent(part).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
    lines.push(`- [${section.address} ${escape(section.title)}](${link}) (Stable ID: \`${section.id}\`)`, '');
  }
  return lines.join('\n');
}
function withMapLock(root, action) {
  const rel = 'docs/knowledge/.write.lock', file = checkedPath(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true }); checkedPath(root, rel);
  let fd;
  try { fd = fs.openSync(file, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw Error('Documentation writer is locked. Wait for it, or inspect an interrupted writer before removing its lock.'); throw error; }
  try { return action(); } finally { fs.closeSync(fd); fs.unlinkSync(file); }
}
function scaffold(root, options = {}) {
  root = rootPath(root);
  if (!fs.existsSync(checkedPath(root, 'docs/knowledge/map.json'))) checkCanonical(root);
  return withMapLock(root, () => createScaffold(root, options));
}
function checkCanonical(root) {
  for (const existing of ['docs/application-map.md', 'docs/application-map.json', 'docs/knowledge-map.json', 'docs/architecture-map.md', 'docs/knowledge/index.md']) {
    if (fs.existsSync(checkedPath(root, existing))) throw Error(`Existing documentation at ${existing}; adopt its navigation before creating another map.`);
  }
}
function createScaffold(root, { folders = false } = {}) {
  root = rootPath(root);
  const manifest = 'docs/knowledge/map.json';
  if (fs.existsSync(checkedPath(root, manifest))) {
    if (folders) for (const item of taxonomy.entries.filter(e => e.parentId === null)) fs.mkdirSync(checkedPath(root, `docs/knowledge/${item.address}`), { recursive: true });
    return { created: false, manifest, folders, modelCalls: 0, note: 'Existing map preserved.' };
  }
  checkCanonical(root);
  const data = { schemaVersion: 1, taxonomyVersion: taxonomy.taxonomyVersion, sections: [] };
  createFile(root, manifest, JSON.stringify(data, null, 2) + '\n');
  createFile(root, 'docs/knowledge/index.md', renderIndex(data));
  if (folders) for (const item of taxonomy.entries.filter(e => e.parentId === null)) fs.mkdirSync(checkedPath(root, `docs/knowledge/${item.address}`), { recursive: true });
  return { created: true, manifest, folders, sectionCount: 0, modelCalls: 0 };
}
function addSection(root, options = {}) {
  root = rootPath(root);
  return withMapLock(root, () => createSection(root, options));
}
function createSection(root, { address, title, id } = {}) {
  root = rootPath(root);
  if (!ADDRESS.test(address) || address.split('.').length !== 3) throw Error('Choose a three-level documentation address.');
  if (typeof title !== 'string' || !title.trim() || title.length > 160 || /[\r\n\x00-\x1f]/.test(title)) throw Error('Choose a short section title.');
  const topic = taxonomy.entries.find(e => e.address === address);
  const parent = taxonomy.entries.find(e => e.address === address.split('.').slice(0, 2).join('.'));
  if (!topic && !parent?.extensible) throw Error('Choose a defined topic or an extensible domain/journey branch.');
  id = id || 'sec_' + sha(address + '\0' + title).slice(0, 24);
  if (!ID.test(id)) throw Error('Invalid stable section ID.');
  const rel = 'docs/knowledge/map.json', old = fs.readFileSync(checkedPath(root, rel)), data = readJson(root, rel);
  if (data.schemaVersion !== 1 || data.taxonomyVersion !== taxonomy.taxonomyVersion || !Array.isArray(data.sections) || data.sections.length >= 500) throw Error('Invalid documentation map or section limit.');
  const existing = data.sections.find(e => e.id === id || e.address === address);
  if (existing) {
    if (existing.id === id && existing.address === address && existing.title === title) return { created: false, section: existing, indexUpdated: false };
    throw Error('Section ID or address is already assigned; preserve existing identities.');
  }
  const document = address.split('.').slice(0, 2).join('/') + '/' + id + '.md';
  const section = { id, address, title, status: 'uninspected', document, sourceRefs: [], relatedIds: [] };
  const oldIndex = renderIndex(data), indexRel = 'docs/knowledge/index.md';
  const newIndex = renderIndex({ ...data, sections: [...data.sections, section] });
  const indexStat = fs.lstatSync(checkedPath(root, indexRel), { throwIfNoEntry: false });
  const indexMatches = indexStat?.isFile() && indexStat.size <= 1024 * 1024 && fs.readFileSync(checkedPath(root, indexRel), 'utf8') === oldIndex;
  createFile(root, 'docs/knowledge/' + document, `# ${address} ${title}\n\nStable ID: ${id}\n\n` + HEADINGS.map(h => `## ${h}\n\nUninspected.\n`).join('\n'));
  // A failed manifest publish leaves the new note for inspection; never deletes owner files.
  data.sections.push(section); replaceManifest(root, rel, data, sha(old));
  const indexUpdated = !!indexMatches && replaceText(root, indexRel, newIndex, sha(oldIndex));
  return { created: true, section, indexUpdated, modelCalls: 0 };
}
module.exports = { taxonomy, ADDRESS, ID, HEADINGS, relative, rootPath, checkedPath, readJson, renderIndex, scaffold, addSection };
