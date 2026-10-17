'use strict';
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { readJson, atomicJson } = require('./storage.cjs');
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
  list() { return this.items.map(x => ({ ...x, progress: { done: x.milestones.filter(m => m.done).length, total: x.milestones.length } })).sort((a, b) => (b.lastActiveAt || b.createdAt) - (a.lastActiveAt || a.createdAt)); }
  get(id) { return this.items.find(x => x.id === id); }
  commit(items) { atomicJson(this.file, items); this.items = items; this.emit('changed'); }
  save(raw) {
    const before = raw.id ? this.get(raw.id) : null;
    if (raw.id && !before) throw new Error('Project not found.');
    const name = text(raw.name, 64, 'Name'); if (!name) throw new Error('Give the project a name.');
    if (!['active', 'paused', 'complete', 'archived'].includes(raw.status || 'active')) throw new Error('Choose a project status.');
    if (!Array.isArray(raw.folders) || raw.folders.length < 1 || raw.folders.length > 20) throw new Error('Add 1 to 20 project folders.');
    const folders = raw.folders.map(x => ({ label: text(x.label || '', 64, 'Folder label'), path: folder(x.path) }));
    if (!Array.isArray(raw.milestones || []) || (raw.milestones || []).length > 100) throw new Error('Use up to 100 milestones.');
    const milestones = (raw.milestones || []).map(x => ({ text: text(x.text, 500, 'Milestone'), done: x.done === true })).filter(x => x.text);
    const item = { id: before?.id || randomUUID(), name, category: text(raw.category || '', 60, 'Category'), goals: text(raw.goals || '', 10000, 'Goals'), approach: text(raw.approach || '', 10000, 'Plan'), notes: text(raw.notes || '', 20000, 'Notes'), nextStep: text(raw.nextStep || '', 1000, 'Next step'), status: raw.status || 'active', folders, milestones, createdAt: before?.createdAt || Date.now(), updatedAt: Date.now(), lastActiveAt: before?.lastActiveAt || null };
    this.commit([item, ...this.items.filter(x => x.id !== item.id)]); return this.list().find(x => x.id === item.id);
  }
  remove(id) { if (!this.get(id)) throw new Error('Project not found.'); this.commit(this.items.filter(x => x.id !== id)); }
  touch(id, at = Date.now()) {
    const item = this.get(id); if (!item || at - (item.lastActiveAt || 0) < 60000) return;
    // Activity is bookkeeping: a failed disk write must not interrupt input or launch.
    try { this.commit(this.items.map(x => x.id === id ? { ...x, lastActiveAt: at } : x)); }
    catch { this.emit('tracking-error', 'Project activity could not be saved.'); }
  }
  progress(id, raw) {
    const item = this.get(id); if (!item) throw new Error('Choose a project for this console first.');
    const nextStep = raw.nextStep == null ? item.nextStep : text(raw.nextStep, 1000, 'Next step');
    const notes = raw.note ? text([item.notes, text(raw.note, 2000, 'Progress note')].filter(Boolean).join('\n\n'), 20000, 'Notes') : item.notes;
    const milestones = item.milestones.map(x => ({ ...x }));
    if (raw.milestone != null) {
      if (!Number.isInteger(raw.milestone) || !milestones[raw.milestone]) throw new Error('Choose an existing milestone.');
      milestones[raw.milestone].done = raw.done === true;
    }
    this.commit(this.items.map(x => x.id === id ? { ...x, nextStep, notes, milestones, updatedAt: Date.now(), lastActiveAt: Date.now() } : x));
    return this.list().find(x => x.id === id);
  }
  launch(raw) {
    if (!raw?.projectId) return { ...raw, projectId: null };
    const item = this.get(raw.projectId); if (!item) throw new Error('Project not found. Choose it again.');
    return { ...raw, projectId: item.id, name: raw.name?.trim() || item.name, cwd: folder(raw.cwd || item.folders[0].path) };
  }
  summary(id) {
    const p = this.get(id); if (!p) return '';
    return '\n\n## Current project\n' + JSON.stringify({ id: p.id, name: p.name, category: p.category, status: p.status, goals: p.goals, approach: p.approach, nextStep: p.nextStep, notes: p.notes, milestones: p.milestones, folders: p.folders, lastActiveAt: p.lastActiveAt }, null, 2) + '\nUse this project brief as context. Keep progress honest: only mark a milestone done after verifying it. Use dock/project_progress to record a completed milestone, a brief progress note or the next step. Refresh with dock_context at the start of each task.\n';
  }
}
module.exports = { Projects };
