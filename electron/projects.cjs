'use strict';
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { readJson, atomicJson } = require('./storage.cjs');
const { normalizeKnowledgeMode } = require('./knowledge-policy.cjs');
const projectPalette = ['#89b4ff', '#f19cda', '#8bd6b0', '#f0bf78', '#b8a0f5', '#7ed6d0'];
function projectColor(color, id) {
  if (/^#[\da-f]{6}$/i.test(color || '')) return color.toLowerCase();
  const index = [...String(id || '')].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  return projectPalette[index % projectPalette.length];
}
const text = (value, max, label) => {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new Error(`${label} is too long or invalid.`);
  return value.trim();
};
function folder(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || !fs.existsSync(value) || !fs.statSync(value).isDirectory()) throw new Error('Choose an existing project folder.');
  return path.resolve(value);
}
class Projects extends EventEmitter {
  constructor(root) { super(); this.file = path.join(root, 'projects.json'); this.items = readJson(this.file, []); }
  list() { return this.items.map(item => this.brief(item.id)).sort((a, b) => b.createdAt - a.createdAt); }
  get(id) { return this.items.find(x => x.id === id); }
  forFolder(folderPath) {
    if (!folderPath) return null;
    const key = value => { const resolved = path.resolve(value); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; };
    const target = key(folderPath), matches = this.items.flatMap(p => p.folders.map(f => ({ p, folder: key(f.path) }))).filter(x => target === x.folder || target.startsWith(x.folder + path.sep)).sort((a, b) => b.folder.length - a.folder.length);
    if (!matches.length || matches.some(x => x.folder.length === matches[0].folder.length && x.p.id !== matches[0].p.id)) return null;
    return matches[0].p;
  }
  commit(items) { atomicJson(this.file, items); this.items = items; this.emit('changed'); }
  save(raw) {
    const before = raw.id ? this.get(raw.id) : null;
    if (raw.id && !before) throw new Error('Project not found.');
    const name = text(raw.name, 64, 'Name'); if (!name) throw new Error('Give the project a name.');
    if (raw.color !== undefined && (typeof raw.color !== 'string' || !/^#[\da-f]{6}$/i.test(raw.color))) throw new Error('Choose a valid project color.');
    if (!['planning', 'active', 'paused', 'complete', 'archived'].includes(raw.status || 'active')) throw new Error('Choose a project status.');
    if (!Array.isArray(raw.folders) || raw.folders.length < 1 || raw.folders.length > 20) throw new Error('Add 1 to 20 project folders.');
    const folders = raw.folders.map(x => ({ label: text(x.label || '', 64, 'Folder label'), path: folder(x.path) }));
    const item = { ...before, id: before?.id || randomUUID(), name, category: text(raw.category || '', 60, 'Category'), status: raw.status || 'active', folders, createdAt: before?.createdAt || Date.now(), updatedAt: Date.now() };
    item.knowledgeMode = before?.knowledgeMode || 'inherit';
    item.color = projectColor(raw.color ?? before?.color, item.id);
    return this.store(item);
  }
  store(item) {
    this.commit([item, ...this.items.filter(x => x.id !== item.id)]);
    return this.list().find(x => x.id === item.id);
  }
  folderPath(id, index = 0) {
    const p = this.get(id); if (!p) throw new Error('Project not found.');
    if (!Number.isInteger(index) || !p.folders[index]) throw new Error('Project folder not found.');
    return folder(p.folders[index].path);
  }
  setKnowledgeMode(id, value) {
    const project = this.get(id); if (!project) throw new Error('Project not found.');
    const mode = normalizeKnowledgeMode(value, { project: true });
    return this.store({ ...project, knowledgeMode: mode, updatedAt: Date.now() });
  }
  remove(id) { if (!this.get(id)) throw new Error('Project not found.'); this.commit(this.items.filter(x => x.id !== id)); }
  brief(id) {
    const item = this.get(id); if (!item) return null;
    return { id: item.id, name: item.name, category: item.category || '', color: projectColor(item.color, item.id), status: item.status || 'active',
      folders: item.folders, knowledgeMode: item.knowledgeMode || 'inherit', createdAt: item.createdAt, updatedAt: item.updatedAt };
  }
  launch(raw) {
    if (!raw?.projectId) return { ...raw, projectId: null };
    const item = this.get(raw.projectId); if (!item) throw new Error('Project not found. Choose it again.');
    const nameMode = raw.nameMode || (raw.name?.trim() && raw.name.trim() !== item.name ? 'custom' : 'project');
    return { ...raw, projectId: item.id, nameMode, name: nameMode === 'project' ? item.name : raw.name?.trim() || item.name, cwd: folder(raw.cwd || item.folders[0].path) };
  }
  chatSummary(session) {
    if (!session) return '';
    const p = this.get(session.projectId);
    const binding = { projectId: p?.id || null, projectName: p?.name || null, chatTitle: session.name || '', launchDirectory: session.cwd || '' };
    return '\n\n## Current chat binding\n' + JSON.stringify(binding, null, 2) + '\n' + (p
      ? 'This is the project explicitly linked to this chat. Use its ID and project context, even when the chat has a custom title. If a request points to a different project, ask the user to change the link before project-specific work. An earlier chat message or title does not override the current binding.\n'
      : 'No saved project is linked. Use the launch directory and explicit user instructions; do not infer a project from the chat title.\n');
  }
  summary(id) {
    const p = this.get(id); if (!p) return '';
    return '\n\n## Current project\n' + JSON.stringify(this.brief(id), null, 2);
  }
}
module.exports = { Projects };
