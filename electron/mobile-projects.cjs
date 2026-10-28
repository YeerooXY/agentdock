'use strict';
const planning = require('./project-planning.cjs');

function available(store) {
  return ['list', 'get', 'plan'].every(method => typeof store?.[method] === 'function');
}
function summary(project, sessions) {
  const milestones = project.milestones || [];
  return {
    id: project.id, name: project.name, color: project.color || '#89b4ff',
    status: project.status, goals: (project.goals || '').slice(0, 2000),
    nextStep: project.nextStep || '',
    progress: { done: milestones.filter(m => m.done).length, total: milestones.length },
    lastActiveAt: project.lastActiveAt || null,
    consoles: sessions.list().filter(s => s.projectId === project.id && s.alive && !s.dismissed)
      .map(({ id, name }) => ({ id, name })),
  };
}
function readProjects(sessions, id, detail = false) {
  const store = sessions.projects;
  if (!available(store)) throw new Error('This host does not support Projects.');
  if (!detail) return store.list().filter(p => p.status !== 'archived').map(p => summary(p, sessions));
  const project = typeof id === 'string' ? store.get(id) : null;
  if (!project || project.status === 'archived') throw new Error('Project not found or archived.');
  const listed = store.list().find(p => p.id === id) || project;
  return {
    ...summary(listed, sessions),
    milestones: (project.milestones || []).map(({ text, acceptance, done }) => ({ text, acceptance: acceptance || '', done: done === true })),
    // Notes are stored as one string, joined with blank lines. Treat the last
    // three paragraphs as an approximation of entries: a note may itself have
    // blank lines, so this can return fragments. Keep the latest 4,000 chars.
    notes: (project.notes || '').split(/\r?\n\s*\r?\n/).filter(s => s.trim()).slice(-3).join('\n\n').slice(-4000),
    plan: {
      revision: project.plan?.revision ?? null,
      sections: planning.sections.map(section => {
        const context = project.plan ? store.plan(id, section) : null;
        return { name: section, revision: context?.revision ?? null,
          state: context?.proposal ? 'proposal waiting' : context?.approvedSections.includes(section) ? 'approved' : context?.notNeeded.includes(section) ? 'not needed' : 'empty' };
      }),
    },
  };
}
module.exports = { available, readProjects };
