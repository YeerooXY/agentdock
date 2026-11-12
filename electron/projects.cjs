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
  list() { return this.items.map(({ plan, ...x }) => ({ ...x, color: projectColor(x.color, x.id), progress: { done: x.milestones.filter(m => m.done).length, total: x.milestones.length } })).sort((a, b) => (b.lastActiveAt || b.createdAt) - (a.lastActiveAt || a.createdAt)); }
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
    if (!Array.isArray(raw.milestones || []) || (raw.milestones || []).length > 100) throw new Error('Use up to 100 milestones.');
    const milestones = (raw.milestones || []).map(m => ({ text: text(m.text, 500, 'Milestone'), acceptance: text(m.acceptance || '', 1000, 'Completion check'), done: m.done === true })).filter(m => m.text);
    const item = { ...before, id: before?.id || randomUUID(), decisions: before?.decisions || [], name, category: text(raw.category || '', 60, 'Category'), goals: text(raw.goals || '', 10000, 'Goals'), approach: text(raw.approach || '', 10000, 'Plan'), notes: text(raw.notes || '', 20000, 'Notes'), nextStep: text(raw.nextStep || '', 1000, 'Next step'), status: raw.status || 'active', folders, milestones, createdAt: before?.createdAt || Date.now(), updatedAt: Date.now(), lastActiveAt: before?.lastActiveAt || null };
    item.knowledgeMode = before?.knowledgeMode || 'inherit';
    item.color = projectColor(raw.color ?? before?.color, item.id);
    if (before?.lastProgress) item.lastProgress = before.lastProgress;
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
  touch(id, at = Date.now()) {
    const item = this.get(id); if (!item || at - (item.lastActiveAt || 0) < 60000) return;
    // Activity is bookkeeping: a failed disk write must not interrupt input or launch.
    try { this.commit(this.items.map(x => x.id === id ? { ...x, lastActiveAt: at } : x)); }
    catch { this.emit('tracking-error', 'Project activity could not be saved.'); }
  }
  progress(id, raw) {
    const item = this.get(id); if (!item) throw new Error('Choose a project for this console first.');
    const nextStep = raw.nextStep == null ? item.nextStep : text(raw.nextStep, 1000, 'Next step');
    const milestones = item.milestones.map(x => ({ ...x }));
    if (raw.milestone != null) {
      if (!Number.isInteger(raw.milestone) || !milestones[raw.milestone]) throw new Error('Choose an existing milestone.');
      milestones[raw.milestone].done = raw.done === true;
    }
    const updated = { ...item, nextStep, milestones, updatedAt: Date.now(), lastActiveAt: Date.now() };
    return this.store(updated);
  }
  brief(id, worker = false) {
    const p = this.get(id); if (!p) return null;
    const decisions = (p.decisions || []).filter(d => d.status === 'approved').map(d => d.reason ? `${d.text} (${d.reason})` : d.text);
    const clip = (text, length) => String(text || '').slice(0, length);
    return { id: p.id, name: p.name, status: p.status, goals: worker ? p.goals : clip(p.goals, 600), nextStep: clip(p.nextStep, 500),
      ...(worker ? { approach: p.approach, decisions, milestones: p.milestones, references: p.plan?.references || [], scope: p.plan?.scope || '', excluded: p.plan?.excluded || '' }
        : { lastOutcome: clip(p.lastProgress?.summary, 400), approvedDecisions: decisions.length, milestones: { done: p.milestones.filter(x => x.done).length, total: p.milestones.length }, details: 'Use dock_context({includeProject:true}) for saved project details.' }) };
  }
  decide(id, raw) {
    const item = this.get(id); if (!item) throw new Error('Project not found.');
    const decisions = (item.decisions || []).map(d => ({ ...d }));
    const full = () => decisions.filter(d => d.status === 'approved').length >= 100;
    if (raw?.action === 'add') {
      if (full()) throw new Error('Use up to 100 decisions. Remove old ones first.');
      const entry = { id: randomUUID(), text: text(raw.text, 500, 'Decision'), reason: text(raw.reason || '', 1000, 'Reason'), status: 'approved', by: 'You', at: Date.now(), decidedAt: Date.now() };
      if (!entry.text) throw new Error('Describe the decision.');
      return this.store({ ...item, decisions: [...decisions, entry], updatedAt: Date.now() });
    }
    const entry = decisions.find(d => d.id === raw?.decisionId); if (!entry) throw new Error('Decision not found.');
    if (raw.action === 'remove') return this.store({ ...item, decisions: decisions.filter(d => d !== entry), updatedAt: Date.now() });
    if (!['approve', 'reject', 'edit'].includes(raw.action)) throw new Error('Choose approve, reject, edit or remove.');
    if (raw.action === 'approve' && entry.status !== 'approved' && full()) throw new Error('Use up to 100 decisions. Remove old ones first.');
    if (raw.text !== undefined) { entry.text = text(raw.text, 500, 'Decision'); if (!entry.text) throw new Error('Describe the decision.'); }
    if (raw.reason !== undefined) entry.reason = text(raw.reason, 1000, 'Reason');
    if (raw.action !== 'edit') { entry.status = raw.action === 'approve' ? 'approved' : 'rejected'; entry.decidedAt = Date.now(); }
    return this.store({ ...item, decisions, updatedAt: Date.now() });
  }
  launch(raw) {
    if (!raw?.projectId) return { ...raw, projectId: null };
    const item = this.get(raw.projectId); if (!item) throw new Error('Project not found. Choose it again.');
    const nameMode = raw.nameMode || (raw.name?.trim() && raw.name.trim() !== item.name ? 'custom' : 'project');
    return { ...raw, projectId: item.id, nameMode, name: nameMode === 'project' ? item.name : raw.name?.trim() || item.name, cwd: folder(raw.cwd || item.folders[0].path) };
  }
  chatSummary(session, { includeBrief = true } = {}) {
    if (!session) return '';
    const p = this.get(session.projectId);
    const binding = { projectId: p?.id || null, projectName: p?.name || null, chatTitle: session.name || '', launchDirectory: session.cwd || '' };
    return '\n\n## Current chat binding\n' + JSON.stringify(binding, null, 2) + '\n' + (p
      ? 'This is the project explicitly linked to this chat. Use its ID and project context, even when the chat has a custom title. If a request points to a different project, ask the user to change the link before project-specific work. Refresh dock_context at task start; pass your own sinceContextRevision to omit unchanged instructions. An earlier chat message or title does not override the current binding.\n'
      : 'No saved project is linked. Use the launch directory and explicit user instructions; do not infer a project from the chat title.\n') + (p && includeBrief ? '\n## Project brief\n' + JSON.stringify(this.brief(p.id)) : '');
  }
  summary(id) {
    const p = this.get(id); if (!p) return '';
    const decisions = (p.decisions || []).filter(d => d.status === 'approved').map(d => d.reason ? `${d.text} (${d.reason})` : d.text);
    return '\n\n## Current project\n' + JSON.stringify({ id: p.id, name: p.name, category: p.category, status: p.status, goals: p.goals, approach: p.approach, nextStep: p.nextStep, notes: p.notes, milestones: p.milestones, folders: p.folders, lastActiveAt: p.lastActiveAt, decisions }, null, 2);
  }
}
module.exports = { Projects };
