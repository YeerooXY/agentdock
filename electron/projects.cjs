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
  constructor(root) { super(); this.file = path.join(root, 'projects.json'); this.items = readJson(this.file, []); this.proposalFile = path.join(root, 'project-proposals.json'); this.proposals = readJson(this.proposalFile, []); }
  list() { return this.items.map(x => ({ ...x, color: projectColor(x.color, x.id), progress: { done: x.milestones.filter(m => m.done).length, total: x.milestones.length } })).sort((a, b) => (b.lastActiveAt || b.createdAt) - (a.lastActiveAt || a.createdAt)); }
  get(id) { return this.items.find(x => x.id === id); }
  commit(items) { atomicJson(this.file, items); this.items = items; this.emit('changed'); }
  commitProposals(items) { atomicJson(this.proposalFile, items); this.proposals = items; this.emit('changed'); }
  checkFolders(folders) {
    const key = value => { let resolved; try { resolved = fs.realpathSync(value); } catch { resolved = path.resolve(value); } return process.platform === 'win32' ? resolved.toLowerCase() : resolved; };
    const paths = new Set(folders.map(f => key(f.path)));
    const owner = this.items.find(p => p.folders.some(f => paths.has(key(f.path))));
    if (owner) throw new Error(`Folder already belongs to project: ${owner.name}.`);
  }
  proposeProject(raw, session) {
    if (this.proposals.length >= 5) throw new Error('5 project proposals already await review.');
    const name = text(raw.name, 64, 'Name'); if (!name) throw new Error('Give the project a name.');
    if (!Array.isArray(raw.folders) || raw.folders.length < 1 || raw.folders.length > 20) throw new Error('Add 1 to 20 project folders.');
    const folders = raw.folders.map(value => ({ label: '', path: folder(value) }));
    this.checkFolders(folders);
    if (!Array.isArray(raw.milestones || []) || (raw.milestones || []).length > 100) throw new Error('Use up to 100 milestones.');
    const milestones = planning.milestones(raw.milestones || []);
    if (!Array.isArray(raw.decisions || []) || (raw.decisions || []).length > 100) throw new Error('Use up to 100 decisions.');
    const decisions = (raw.decisions || []).map(d => { const value = text(d.decision, 500, 'Decision'); if (!value) throw new Error('Describe the decision.'); return { text: value, reason: text(d.reason || '', 1000, 'Reason') }; });
    const proposal = { id: randomUUID(), name, folders, goals: text(raw.goals, 10000, 'Goals'), category: text(raw.category || '', 60, 'Category'), milestones, decisions, sessionId: session?.id || null, consoleName: String(session?.name || 'Agent').slice(0, 80), createdAt: Date.now() };
    this.commitProposals([...this.proposals, proposal]); return proposal;
  }
  acceptProposal(id, sessions) {
    const proposal = this.proposals.find(p => p.id === id); if (!proposal) throw new Error('Proposal not found.');
    this.checkFolders(proposal.folders);
    const project = this.save({ ...proposal, id: undefined, status: 'active' });
    const now = Date.now();
    const saved = this.store({ ...this.get(project.id), decisions: proposal.decisions.map(d => ({ ...d, id: randomUUID(), status: 'approved', by: 'You', at: now, decidedAt: now })) });
    this.commitProposals(this.proposals.filter(p => p.id !== id));
    const session = sessions?.items.get(proposal.sessionId);
    if (session && !session.dismissed && (session.alive || session.restoreError)) sessions.assignProject(session.id, saved.id);
    return saved;
  }
  dismissProposal(id) { if (!this.proposals.some(p => p.id === id)) throw new Error('Proposal not found.'); this.commitProposals(this.proposals.filter(p => p.id !== id)); }
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
    const item = { id: before?.id || randomUUID(), decisions: before?.decisions || [], name, category: text(raw.category || '', 60, 'Category'), goals: text(raw.goals || '', 10000, 'Goals'), approach: text(raw.approach || '', 10000, 'Plan'), notes: text(raw.notes || '', 20000, 'Notes'), nextStep: text(raw.nextStep || '', 1000, 'Next step'), status: raw.status || 'active', folders, milestones, createdAt: before?.createdAt || Date.now(), updatedAt: Date.now(), lastActiveAt: before?.lastActiveAt || null };
    item.color = projectColor(raw.color ?? before?.color, item.id);
    if (before?.plan) {
      planning.checkRevision(before, raw.revision);
      item.plan = structuredClone(before.plan);
      if (item.goals !== before.goals) planning.invalidate(item, 'brief');
      if (JSON.stringify(item.milestones) !== JSON.stringify(before.milestones)) planning.invalidate(item, 'roadmap');
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
      catch (error) { saved.plan.files = { ...saved.plan.files, error: `Plan saved in Paddock. Project files could not be updated: ${error.message}` }; }
      this.commit(this.items.map(x => x.id === saved.id ? saved : x));
    }
    return this.list().find(x => x.id === item.id);
  }
  plan(id, section) { return planning.context(this.get(id), section); }
  review(id, raw) { return this.store(planning.review(this.get(id), raw)); }
  underway(id, raw) { return this.store(planning.underway(this.get(id), raw)); }
  propose(id, raw, agent) { return this.store(planning.propose(this.get(id), raw, agent)); }
  addLater(id, raw) { return this.store(planning.later(this.get(id), raw)); }
  // Files and images are copied into the project's planning folder so every
  // agent working in the project can read them, even after the original moves.
  addReference(id, raw) {
    const p = this.get(id); if (!p?.plan) throw new Error('Project plan not found.');
    if (raw?.kind === 'link') return this.store(planning.addReference(p, raw));
    const source = String(raw?.value || '');
    let stat; try { stat = fs.statSync(source); } catch { throw new Error('That file could not be found.'); }
    if (!path.isAbsolute(source) || !stat.isFile()) throw new Error('Choose a file, not a folder.');
    if (stat.size > 25 * 1024 * 1024) throw new Error('Reference files can be up to 25 MB.');
    const kind = /\.(png|jpe?g|gif|webp|bmp)$/i.test(source) ? 'image' : 'file';
    const target = path.join(planning.directory(p, true), 'references');
    if (fs.existsSync(target) && (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory())) throw new Error('Project planning folder must be a regular directory.');
    fs.mkdirSync(target, { recursive: true });
    const copy = path.join(target, `${randomUUID().slice(0, 8)}-${path.basename(source).replace(/[^\w.() -]+/g, '_').slice(-120)}`);
    fs.copyFileSync(source, copy, fs.constants.COPYFILE_EXCL);
    try { return this.store(planning.addReference(p, { revision: raw.revision, kind, value: copy, title: raw.title || path.basename(source) })); }
    catch (error) { fs.rmSync(copy, { force: true }); throw error; }
  }
  removeReference(id, raw) {
    const p = this.get(id); if (!p?.plan) throw new Error('Project plan not found.');
    const item = (p.plan.references || []).find(x => x.id === raw?.ref);
    const next = this.store(planning.removeReference(p, raw));
    if (item && item.kind !== 'link') {
      const folder = path.join(planning.directory(p), 'references');
      if (path.dirname(item.value) === folder) fs.rmSync(item.value, { force: true });
    }
    return next;
  }
  beginPlan(id) {
    const before = this.get(id); if (!before) throw new Error('Project not found.');
    if (before.plan) return before;
    return this.store({ ...before, plan: planning.initial(), updatedAt: Date.now() });
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
      if (item.plan) planning.checkRevision(item, raw.revision);
      if (!Number.isInteger(raw.milestone) || !milestones[raw.milestone]) throw new Error('Choose an existing milestone.');
      milestones[raw.milestone].done = raw.done === true;
      if (item.plan && raw.nextStep == null) nextStep = milestones.find(m => !m.done)?.text || 'Review project completion';
    }
    const updated = { ...item, nextStep, notes, milestones, updatedAt: Date.now(), lastActiveAt: Date.now() };
    if (item.plan) updated.plan = { ...item.plan, revision: item.plan.revision + 1 };
    return this.store(updated);
  }
  // Decisions are durable project choices and preferences. Agents can only
  // propose one; the user approves, edits or rejects it in Projects.
  proposeDecision(id, raw, agent) {
    const item = this.get(id); if (!item) throw new Error('Link this chat to a project before proposing a decision.');
    const decisions = item.decisions || [];
    if (decisions.filter(d => d.status === 'proposed').length >= 20) throw new Error('20 decisions already await the user. Ask them to review Projects first.');
    const entry = { id: randomUUID(), text: text(raw?.decision, 500, 'Decision'), reason: text(raw?.reason || '', 1000, 'Reason'), status: 'proposed', by: String(agent || 'An agent').slice(0, 80), at: Date.now() };
    if (!entry.text) throw new Error('Describe the decision.');
    if (decisions.some(d => d.status !== 'rejected' && d.text.toLowerCase() === entry.text.toLowerCase())) throw new Error('This decision is already recorded.');
    return this.store({ ...item, decisions: [...decisions, entry], updatedAt: Date.now() });
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
  chatSummary(session) {
    if (!session) return '';
    const p = this.get(session.projectId);
    const binding = { projectId: p?.id || null, projectName: p?.name || null, chatTitle: session.name || '', launchDirectory: session.cwd || '' };
    return '\n\n## Current chat binding\n' + JSON.stringify(binding, null, 2) + '\n' + (p
      ? 'This is the project explicitly linked to this chat. Use its ID and project context, even when the chat has a custom title. If a request points to a different project, ask the user to change the link before project-specific work. Refresh dock_context each turn; an earlier chat message or title does not override the current binding.\n'
      : 'No saved project is linked to this chat. Do not guess one from the chat title or earlier conversation. Use the launch directory and the user’s explicit instructions; ask which project or folder they mean when the target is unclear. When the user works in a folder that is not a project, you may propose one with dock/propose_project; the user decides whether to create it. The console folder button lets the user choose a project.\n') + this.summary(p?.id);
  }
  summary(id) {
    const p = this.get(id); if (!p) return '';
    const decisions = (p.decisions || []).filter(d => d.status === 'approved').map(d => d.reason ? `${d.text} (${d.reason})` : d.text);
    const waiting = (p.decisions || []).filter(d => d.status === 'proposed').length;
    return '\n\n## Current project\n' + JSON.stringify({ id: p.id, name: p.name, category: p.category, status: p.status, goals: p.goals, approach: p.approach, nextStep: p.nextStep, notes: p.notes, milestones: p.milestones, folders: p.folders, lastActiveAt: p.lastActiveAt, decisions }, null, 2)
      + '\nFollow the approved decisions: they record the user’s choices and preferences for this project. When the user makes a lasting choice (a preference, a rejected approach, a stack or convention), propose it with dock/project_decision; the user approves it in Projects.'
      + (waiting ? ` ${waiting} proposed decision${waiting === 1 ? '' : 's'} await the user’s review; treat them as unapproved.` : '')
      + '\nUse this project brief as context. Keep progress honest: only mark a milestone done after verifying it. Use dock/project_progress to record a completed milestone, a brief progress note or the next step. Refresh with dock_context at the start of each task.\n' + planning.instructions(p);
  }
}
module.exports = { Projects };
