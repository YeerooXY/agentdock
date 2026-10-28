'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const sections = ['brief', 'research', 'infrastructure', 'roadmap'];
const fields = {
  brief: ['goals', 'audience', 'success'],
  research: ['purpose', 'alternatives', 'niche', 'evidence'],
  infrastructure: ['experience', 'platform', 'language', 'stack', 'reason', 'alternative', 'tradeoff', 'hosting', 'data', 'security', 'operations'],
  roadmap: ['scope', 'excluded', 'milestones'],
};
const clean = (value, limit = 10000) => {
  if (typeof value !== 'string' || value.length > limit || value.includes('\0')) throw new Error('Use valid text within the field limit.');
  return value.trim();
};
function milestones(values) {
  if (!Array.isArray(values) || values.length > 100) throw new Error('Use up to 100 milestones.');
  return values.map(m => ({ text: clean(m.text, 500), acceptance: clean(m.acceptance || '', 1000), done: m.done === true })).filter(m => m.text);
}
function initial() {
  return { version: 1, revision: 1, approvals: {}, brief: { audience: '', success: '' }, research: { purpose: 'public', alternatives: '', niche: '', evidence: '' }, infrastructure: { experience: 'guided', platform: 'web', language: '', stack: '', reason: '', alternative: '', tradeoff: '', hosting: '', data: '', security: '', operations: '' }, scope: '', excluded: '', laterFeatures: [], proposals: {}, skipped: {}, references: [], files: null };
}
// Sections are reviewed independently.
const approved = p => !!p.plan?.approvals.roadmap;
// Plans saved before per-section proposals kept a single proposal field.
function proposals(plan) { return plan.proposals || (plan.proposal ? { [plan.proposal.section]: plan.proposal } : {}); }
function setProposals(plan, value) { plan.proposals = value; delete plan.proposal; }
const currentSection = p => sections.find(s => proposals(p.plan)[s]) || sections.find(s => !p.plan.approvals[s] && !p.plan.skipped?.[s]) || 'roadmap';
function sectionData(p, section) {
  if (!sections.includes(section)) throw new Error('Choose a planning section.');
  if (section === 'brief') return { goals: p.goals, ...p.plan.brief };
  if (section === 'roadmap') return { scope: p.plan.scope, excluded: p.plan.excluded || '', milestones: p.milestones };
  return { ...p.plan[section] };
}
function patch(p, section, changes) {
  if (!sections.includes(section) || !changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Choose a planning section and its fields.');
  const result = sectionData(p, section);
  for (const [key, value] of Object.entries(changes)) {
    if (!fields[section].includes(key)) throw new Error(`This section cannot change ${key}.`);
    result[key] = key === 'milestones' ? milestones(value) : clean(value);
  }
  if (section === 'research' && !['public', 'personal'].includes(result.purpose)) throw new Error('Choose public or personal research.');
  if (section === 'infrastructure' && (!['guided', 'advanced'].includes(result.experience) || !['web', 'desktop', 'android', 'game', 'other'].includes(result.platform))) throw new Error('Choose a valid platform and experience level.');
  return result;
}
function apply(p, section, data) {
  if (section === 'brief') { p.goals = data.goals; p.plan.brief = { audience: data.audience, success: data.success }; }
  else if (section === 'roadmap') { p.plan.scope = data.scope; p.plan.excluded = data.excluded; p.milestones = data.milestones; }
  else p.plan[section] = data;
}
function validate(p, section) {
  const d = sectionData(p, section);
  const required = { brief: ['goals'], research: [], infrastructure: ['stack'], roadmap: ['scope'] }[section];
  const missing = required.find(key => !d[key]?.trim());
  if (missing) throw new Error(`Add ${labels[missing]} before approving, or mark this section Not needed.`);
  if (section === 'research' && !['alternatives', 'niche', 'evidence'].some(key => d[key]?.trim())) throw new Error('Add at least one finding before approving, or mark this section Not needed.');
  if (section === 'roadmap' && (!d.milestones.length || d.milestones.some(m => !m.acceptance))) throw new Error('Add milestones and a completion check for each one.');
}
function checkRevision(p, revision) {
  if (!p?.plan) throw new Error('Open this project’s Roadmap to start guided planning.');
  if (revision !== p.plan.revision) throw new Error('The project changed. Reload this section before saving. Your entered text is still available.');
}
const labels = { goals: 'the goal', stack: 'the tools', scope: 'what is included' };
// A changed section needs review again.
function invalidate(p, section) {
  delete p.plan.approvals[section];
}
function underway(p, { revision }) {
  checkRevision(p, revision);
  if (p.status !== 'planning') throw new Error('Project is not in planning.');
  const next = structuredClone(p), waiting = proposals(next.plan);
  next.plan.skipped ||= {};
  for (const section of sections) if (!next.plan.approvals[section] && !waiting[section] && !next.plan.skipped[section]) next.plan.skipped[section] = Date.now();
  next.status = 'active'; next.plan.revision++; next.updatedAt = Date.now();
  return next;
}
function context(p, section) {
  if (!p?.plan) throw new Error('Open this project’s Roadmap to start guided planning.');
  const selected = section || currentSection(p);
  return { projectId: p.id, name: p.name, status: p.status, revision: p.plan.revision, section: selected, approvedSections: sections.filter(s => p.plan.approvals[s]), notNeeded: sections.filter(s => p.plan.skipped?.[s]), data: sectionData(p, selected), proposal: proposals(p.plan)[selected] || null, waitingProposals: Object.keys(proposals(p.plan)), references: (p.plan.references || []).map(({ id, kind, title, value }) => ({ id, kind, title, value })), laterFeatures: p.plan.laterFeatures, files: p.plan.files };
}
function review(p, { revision, section, changes, action }) {
  checkRevision(p, revision);
  if (!['save', 'approve', 'reject', 'skip', 'unskip'].includes(action)) throw new Error('Choose Save, Approve or Reject.');
  if (!sections.includes(section)) throw new Error('Choose a planning section.');
  const next = structuredClone(p), waiting = proposals(next.plan);
  setProposals(next.plan, waiting); next.plan.skipped ||= {};
  if (action === 'reject') {
    if (!waiting[section]) throw new Error('No proposal is waiting for this section.');
    delete waiting[section];
  } else if (action === 'skip' || action === 'unskip') {
    if (action === 'skip') { next.plan.skipped[section] = Date.now(); delete next.plan.approvals[section]; }
    else delete next.plan.skipped[section];
  } else {
    const data = patch(next, section, changes);
    if (JSON.stringify(data) !== JSON.stringify(sectionData(p, section))) invalidate(next, section);
    apply(next, section, data);
    if (action === 'approve') {
      validate(next, section);
      next.plan.approvals[section] = Date.now(); delete next.plan.skipped[section];
    }
    delete waiting[section];
  }
  next.plan.revision++; next.updatedAt = Date.now();
  return next;
}
function propose(p, { revision, section, changes }, agent) {
  checkRevision(p, revision);
  if (proposals(p.plan)[section]) throw new Error(`A ${section} proposal is waiting for the user. Ask them to review it before proposing another change to this section.`);
  const data = patch(p, section, changes), next = structuredClone(p);
  setProposals(next.plan, { ...proposals(next.plan), [section]: { id: randomUUID(), section, data, agent: String(agent || 'Agent').slice(0, 64), at: Date.now() } });
  next.plan.revision++; next.updatedAt = Date.now();
  return next;
}
function later(p, { revision, text }) {
  checkRevision(p, revision);
  const value = clean(text, 1000), next = structuredClone(p);
  if (!value) throw new Error('Describe the feature.');
  if (next.plan.laterFeatures.some(x => x.text === value)) return p;
  if (next.plan.laterFeatures.length >= 100) throw new Error('Review Later features before adding more.');
  next.plan.laterFeatures.push({ id: randomUUID(), text: value, at: Date.now() });
  next.plan.revision++; next.updatedAt = Date.now(); return next;
}
const REFERENCE_KINDS = ['file', 'image', 'link'];
function addReference(p, { revision, kind, value, title }) {
  checkRevision(p, revision);
  if (!REFERENCE_KINDS.includes(kind)) throw new Error('Choose a file, image or link.');
  const text = clean(value, 2048);
  if (kind === 'link') {
    let url; try { url = new URL(text); } catch { throw new Error('Enter a full web address starting with https://'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter a full web address starting with https://');
  }
  const next = structuredClone(p); next.plan.references ||= [];
  if (next.plan.references.length >= 60) throw new Error('Remove a reference before adding more.');
  next.plan.references.push({ id: randomUUID(), kind, value: text, title: clean(title || '', 200) || text, at: Date.now() });
  next.plan.revision++; next.updatedAt = Date.now(); return next;
}
function removeReference(p, { revision, ref }) {
  checkRevision(p, revision);
  const next = structuredClone(p), before = next.plan.references || [];
  next.plan.references = before.filter(x => x.id !== ref);
  if (next.plan.references.length === before.length) throw new Error('Reference not found.');
  next.plan.revision++; next.updatedAt = Date.now(); return next;
}
function directory(p, create = false) {
  if (!/^[a-f0-9-]{36}$/.test(p.id)) throw new Error('Invalid project ID.');
  let root = fs.realpathSync(p.folders[0].path);
  for (const part of ['.agentdock', 'projects', p.id]) {
    root = path.join(root, part);
    if (create && !fs.existsSync(root)) fs.mkdirSync(root);
    if (fs.existsSync(root)) { const stat = fs.lstatSync(root); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Project planning folder must be a regular directory.'); }
  }
  return root;
}
function writeFiles(p) {
  const root = directory(p, true), d = p.plan;
  const heading = title => `# ${p.name} — ${title}\n\nStatus: ${p.status}\nPlan revision: ${d.revision}\n\nManaged by Paddock. Edit the plan in Projects; these files are readable copies.\n\n`;
  const fieldsText = values => Object.entries(values).map(([key, value]) => `## ${key}\n\n${value || 'Not decided'}\n`).join('\n');
  const docs = {
    'PROJECT.md': heading('Project brief') + fieldsText({ Goals: p.goals, Audience: d.brief.audience, 'Success criteria': d.brief.success })
      + '\n# Research\n\n' + (d.skipped?.research ? 'Not needed.\n' : fieldsText({ 'Similar applications': d.research.alternatives, Niche: d.research.niche, 'Research evidence': d.research.evidence }))
      + '\n# Setup\n\n' + (d.skipped?.infrastructure ? 'Not needed.\n' : fieldsText(d.infrastructure))
      + '\n# References\n\n' + ((d.references || []).map(r => `- ${r.title}: ${r.value}`).join('\n') || 'None.')
      + '\n\nMarketing strategy follows completion. Extra features need user approval.\n',
    'ROADMAP.md': heading('Roadmap') + `Approved sections: ${sections.filter(s => d.approvals[s]).join(', ') || 'None'}\n\n## Included\n\n${d.scope || 'Not approved yet'}\n\n## Not included\n\n${d.excluded || 'Not recorded'}\n\n## Milestones\n\n` + p.milestones.map(m => `- [${m.done ? 'x' : ' '}] ${m.text}\n  - Done when: ${m.acceptance || 'To be agreed'}`).join('\n') + '\n',
    'LATER_FEATURES.md': heading('Later features') + 'These ideas are outside the approved scope. Move an idea into the roadmap only after the user agrees.\n\n' + (d.laterFeatures.map(f => `- ${f.text}`).join('\n') || 'No later features recorded.') + '\n',
  };
  for (const [name, content] of Object.entries(docs)) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw new Error('A planning file was redirected. Restore it before saving project files.'); }
    const temp = path.join(root, `${name}.${randomUUID()}.tmp`);
    try { fs.writeFileSync(temp, content, { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, file); }
    finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  return root;
}
function instructions(p) {
  if (!p.plan) return '\nAsk before adding extra features. Record them as later ideas. Defer marketing strategy until the project is complete.\n';
  return `\n## Project planning rules\nPlan sections: ${sections.map(s => `${s}: ${p.plan.approvals[s] ? 'approved' : p.plan.skipped?.[s] ? 'not needed' : 'draft'}`).join('; ')}.
Current section: ${currentSection(p)}. Plan revision: ${p.plan.revision}.
Use dock/project_plan to retrieve a section. Follow approved decisions and discuss planning details when relevant. Do not treat proposals as approved; only the user can approve them in Projects.
Use dock/add_later_feature for extra ideas and ask before expanding scope. Marketing strategy comes after completion.
Project files: ${directory(p)}. Use dock/project_progress for verified work with the current plan revision.\n`;
}
module.exports = { sections, proposals, addReference, removeReference, initial, milestones, approved, currentSection, sectionData, checkRevision, invalidate, context, review, underway, propose, later, directory, writeFiles, instructions };
