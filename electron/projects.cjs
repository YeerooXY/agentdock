'use strict';
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { readJson, atomicJson } = require('./storage.cjs');
const planning = require('./project-planning.cjs');
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
  list() { return this.items.map(x => ({ ...x, color: projectColor(x.color, x.id), progress: { done: x.milestones.filter(m => m.done).length, total: x.milestones.length } })).sort((a, b) => (b.lastActiveAt || b.createdAt) - (a.lastActiveAt || a.createdAt)); }
  get(id) { return this.items.find(x => x.id === id); }
  commit(items) { atomicJson(this.file, items); this.items = items; this.emit('changed'); }
  save(raw) {
    const before = raw.id ? this.get(raw.id) : null;
    if (raw.id && !before) throw new Error('Project not found.');
    const name = text(raw.name, 64, 'Name'); if (!name) throw new Error('Give the project a name.');
    if (raw.color !== undefined && (typeof raw.color !== 'string' || !/^#[\da-f]{6}$/i.test(raw.color))) throw new Error('Choose a valid project color.');
    if (!['planning', 'active', 'paused', 'complete', 'archived'].includes(raw.status || 'active')) throw new Error('Choose a project status.');
    if (!Array.isArray(raw.folders) || raw.folders.length < 1 || raw.folders.length > 20) throw new Error('Add 1 to 20 project folders.');
    const folders = raw.folders.map(x => ({ label: text(x.label || '', 64, 'Folder label'), path: folder(x.path) }));
    if (!Array.isArray(raw.milestones || []) || (raw.milestones || []).length > 100) throw new Error('Use up to 100 milestones.');
    const milestones = planning.milestones(raw.milestones || []);
    const item = { id: before?.id || randomUUID(), name, category: text(raw.category || '', 60, 'Category'), goals: text(raw.goals || '', 10000, 'Goals'), approach: text(raw.approach || '', 10000, 'Plan'), notes: text(raw.notes || '', 20000, 'Notes'), nextStep: text(raw.nextStep || '', 1000, 'Next step'), status: raw.status || 'active', folders, milestones, createdAt: before?.createdAt || Date.now(), updatedAt: Date.now(), lastActiveAt: before?.lastActiveAt || null };
    item.color = projectColor(raw.color ?? before?.color, item.id);
    if (before?.plan) {
      planning.checkRevision(before, raw.revision);
      item.plan = structuredClone(before.plan);
      if (item.goals !== before.goals) planning.invalidate(item, 'brief');
      if (JSON.stringify(item.milestones) !== JSON.stringify(before.milestones)) planning.invalidate(item, 'roadmap');
      if (!planning.approved(item) && ['active', 'complete'].includes(item.status)) item.status = 'planning';
      item.plan.revision++;
    } else if (raw.guided) {
      item.plan = planning.initial(); item.status = 'planning';
      item.plan.brief.audience = text(raw.audience || '', 10000, 'Audience');
      item.plan.brief.success = text(raw.success || '', 10000, 'Success criteria');
    }
    return this.store(item);
  }
  store(item) {
    this.commit([item, ...this.items.filter(x => x.id !== item.id)]);
    if (item.plan) {
      const saved = structuredClone(item);
      try { saved.plan.files = { directory: planning.writeFiles(saved), revision: saved.plan.revision, error: '' }; }
      catch (error) { saved.plan.files = { ...saved.plan.files, error: `Plan saved in Dock. Project files could not be updated: ${error.message}` }; }
      this.commit(this.items.map(x => x.id === saved.id ? saved : x));
    }
    return this.list().find(x => x.id === item.id);
  }
  plan(id, section) { return planning.context(this.get(id), section); }
  review(id, raw) { return this.store(planning.review(this.get(id), raw)); }
  propose(id, raw, agent) { return this.store(planning.propose(this.get(id), raw, agent)); }
  addLater(id, raw) { return this.store(planning.later(this.get(id), raw)); }
  beginPlan(id) {
    const before = this.get(id); if (!before) throw new Error('Project not found.');
    if (before.plan) return before;
    return this.store({ ...before, plan: planning.initial(), status: 'planning', updatedAt: Date.now() });
  }
  syncPlan(id) { const p = this.get(id); if (!p?.plan) throw new Error('Project plan not found.'); return this.store(p); }
  folderPath(id, index = 0, planFiles = false) {
    const p = this.get(id); if (!p) throw new Error('Project not found.');
    if (planFiles) return folder(planning.directory(p));
    if (!Number.isInteger(index) || !p.folders[index]) throw new Error('Project folder not found.');
    return folder(p.folders[index].path);
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
    let nextStep = raw.nextStep == null ? item.nextStep : text(raw.nextStep, 1000, 'Next step');
    const notes = raw.note ? text([item.notes, text(raw.note, 2000, 'Progress note')].filter(Boolean).join('\n\n'), 20000, 'Notes') : item.notes;
    const milestones = item.milestones.map(x => ({ ...x }));
    if (raw.milestone != null) {
      if (item.plan) { planning.checkRevision(item, raw.revision); if (!planning.approved(item)) throw new Error('Approve the roadmap before completing milestones.'); }
      if (!Number.isInteger(raw.milestone) || !milestones[raw.milestone]) throw new Error('Choose an existing milestone.');
      milestones[raw.milestone].done = raw.done === true;
      if (item.plan && raw.nextStep == null) nextStep = milestones.find(m => !m.done)?.text || 'Review project completion';
    }
    const updated = { ...item, nextStep, notes, milestones, updatedAt: Date.now(), lastActiveAt: Date.now() };
    if (item.plan) updated.plan = { ...item.plan, revision: item.plan.revision + 1 };
    return this.store(updated);
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
      ? 'This is the project explicitly linked to this chat. Use its ID and project context, even when the chat has a custom title. If a request points to a different project, ask the user to change the link before project-specific work. Refresh dock_context each turn; an earlier chat message or title does not override the current binding.\n'
      : 'No saved project is linked to this chat. Do not guess one from the chat title or earlier conversation. Use the launch directory and the user’s explicit instructions; ask which project or folder they mean when the target is unclear. The console folder button lets the user choose a project.\n') + this.summary(p?.id);
  }
  summary(id) {
    const p = this.get(id); if (!p) return '';
    return '\n\n## Current project\n' + JSON.stringify({ id: p.id, name: p.name, category: p.category, status: p.status, goals: p.goals, approach: p.approach, nextStep: p.nextStep, notes: p.notes, milestones: p.milestones, folders: p.folders, lastActiveAt: p.lastActiveAt }, null, 2) + '\nUse this project brief as context. Keep progress honest: only mark a milestone done after verifying it. Use dock/project_progress to record a completed milestone, a brief progress note or the next step. Refresh with dock_context at the start of each task.\n' + planning.instructions(p);
  }
}
module.exports = { Projects };
