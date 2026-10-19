'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const sections = ['brief', 'research', 'infrastructure', 'roadmap'];
const fields = {
  brief: ['goals', 'audience', 'success'],
  research: ['purpose', 'alternatives', 'niche', 'evidence'],
  infrastructure: ['experience', 'platform', 'language', 'stack', 'reason', 'alternative', 'tradeoff', 'hosting', 'data', 'security', 'operations'],
  roadmap: ['scope', 'milestones'],
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
  return { version: 1, revision: 1, approvals: {}, brief: { audience: '', success: '' }, research: { purpose: 'public', alternatives: '', niche: '', evidence: '' }, infrastructure: { experience: 'guided', platform: 'web', language: '', stack: '', reason: '', alternative: '', tradeoff: '', hosting: '', data: '', security: '', operations: '' }, scope: '', laterFeatures: [], proposal: null, files: null };
}
const approved = p => !!p.plan && sections.every(s => p.plan.approvals[s]);
const currentSection = p => sections.find(s => !p.plan.approvals[s]) || 'roadmap';
function sectionData(p, section) {
  if (!sections.includes(section)) throw new Error('Choose a planning section.');
  if (section === 'brief') return { goals: p.goals, ...p.plan.brief };
  if (section === 'roadmap') return { scope: p.plan.scope, milestones: p.milestones };
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
  else if (section === 'roadmap') { p.plan.scope = data.scope; p.milestones = data.milestones; }
  else p.plan[section] = data;
}
function validate(p, section) {
  const d = sectionData(p, section);
  const required = section === 'brief' ? ['goals', 'audience', 'success'] : section === 'research' ? (d.purpose === 'personal' ? ['evidence'] : ['alternatives', 'niche', 'evidence']) : section === 'infrastructure' ? ['stack', 'reason', 'alternative', 'tradeoff', 'hosting', 'data', 'security', 'operations'] : ['scope'];
  if (required.some(key => !d[key]?.trim())) throw new Error('Complete this section before approving it. Save a draft to return later.');
  if (section === 'roadmap' && (!d.milestones.length || d.milestones.some(m => !m.acceptance))) throw new Error('Add milestones and a completion check for each one.');
}
function checkRevision(p, revision) {
  if (!p?.plan) throw new Error('Open this project’s Roadmap to start guided planning.');
  if (revision !== p.plan.revision) throw new Error('The project changed. Reload this section before saving. Your entered text is still available.');
}
function invalidate(p, section) {
  for (const key of sections.slice(sections.indexOf(section))) delete p.plan.approvals[key];
  if (['active', 'complete'].includes(p.status)) p.status = 'planning';
}
function context(p, section) {
  if (!p?.plan) throw new Error('Open this project’s Roadmap to start guided planning.');
  const selected = section || currentSection(p);
  return { projectId: p.id, name: p.name, status: p.status, revision: p.plan.revision, section: selected, approvedSections: sections.filter(s => p.plan.approvals[s]), data: sectionData(p, selected), proposal: p.plan.proposal, laterFeatures: p.plan.laterFeatures, files: p.plan.files };
}
function review(p, { revision, section, changes, action }) {
  checkRevision(p, revision);
  if (!['save', 'approve', 'reject'].includes(action)) throw new Error('Choose Save, Approve or Reject.');
  const next = structuredClone(p);
  if (action === 'reject') {
    if (!next.plan.proposal || next.plan.proposal.section !== section) throw new Error('No proposal is waiting for this section.');
    next.plan.proposal = null;
  } else {
    const data = patch(next, section, changes);
    if (JSON.stringify(data) !== JSON.stringify(sectionData(p, section))) invalidate(next, section);
    apply(next, section, data);
    if (action === 'approve') {
      if (sections.slice(0, sections.indexOf(section)).some(s => !next.plan.approvals[s])) throw new Error('Approve the earlier sections first.');
      validate(next, section);
      next.plan.approvals[section] = Date.now();
      if (approved(next)) {
        if (next.status === 'planning') next.status = 'active';
        next.nextStep = next.milestones.find(m => !m.done)?.text || 'Review project completion';
      }
    }
    if (next.plan.proposal?.section === section) next.plan.proposal = null;
  }
  next.plan.revision++; next.updatedAt = Date.now();
  return next;
}
function propose(p, { revision, section, changes }, agent) {
  checkRevision(p, revision);
  if (p.plan.proposal) throw new Error('A proposal is waiting for the user. Ask them to review it before proposing another.');
  const data = patch(p, section, changes), next = structuredClone(p);
  next.plan.proposal = { id: randomUUID(), section, data, agent: String(agent || 'Agent').slice(0, 64), at: Date.now() };
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
  const heading = title => `# ${p.name} — ${title}\n\nStatus: ${p.status}\nPlan revision: ${d.revision}\n\nManaged by Agent Dock. Edit the plan in Projects; these files are readable copies.\n\n`;
  const fieldsText = values => Object.entries(values).map(([key, value]) => `## ${key}\n\n${value || 'Not decided'}\n`).join('\n');
  const docs = {
    'PROJECT.md': heading('Project brief') + fieldsText({ Goals: p.goals, Audience: d.brief.audience, 'Success criteria': d.brief.success, 'Similar applications': d.research.alternatives, Niche: d.research.niche, 'Research evidence': d.research.evidence }) + '\n# Infrastructure\n\n' + fieldsText(d.infrastructure) + '\nMarketing strategy follows completion. Extra features need user approval.\n',
    'ROADMAP.md': heading('Roadmap') + `Approved sections: ${sections.filter(s => d.approvals[s]).join(', ') || 'None'}\n\n## Agreed scope\n\n${d.scope || 'Not approved yet'}\n\n## Milestones\n\n` + p.milestones.map(m => `- [${m.done ? 'x' : ' '}] ${m.text}\n  - Done when: ${m.acceptance || 'To be agreed'}`).join('\n') + '\n',
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
  return `\n## Project planning rules\n${approved(p) ? 'Follow the user-approved scope and milestones.' : 'This project is in planning. Discuss it with the user before implementation. Ask one focused question, then wait for their answer. Do not silently fill missing decisions or start implementation.'}
Current section: ${currentSection(p)}. Plan revision: ${p.plan.revision}.
Use dock/project_plan to retrieve the current section. Discuss goals, audience and success criteria, compare real alternatives with source URLs and research dates, then establish the niche. AI guesses are not customer evidence.
For infrastructure, ask about target devices, hosting, data, authentication, backups, deployment and cost constraints. Recommend one language/stack and explain why it fits better than a named alternative. Use plain language for beginners; advanced users choose their language. Non-software projects can document their tools and infrastructure instead.
Agree on a bounded first release and ordered milestones with a concrete completion check for each. Use dock/propose_project_plan for a proposal after the conversation; only the user can approve it in Projects. A tool call is not user approval. Pause for their review.
Use dock/add_later_feature for extra ideas. Do not implement them or expand scope without explicit user agreement and a reviewed roadmap. Marketing strategy comes after completion.
Project files: ${directory(p)}. Use dock/project_progress for verified work after roadmap approval, with the current plan revision.\n`;
}
module.exports = { sections, initial, milestones, approved, currentSection, sectionData, checkRevision, invalidate, context, review, propose, later, directory, writeFiles, instructions };
