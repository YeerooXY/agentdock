'use strict';

function available(store) {
  return ['list', 'get'].every(method => typeof store?.[method] === 'function');
}
function summary(project, sessions) {
  return {
    id: project.id, name: project.name, color: project.color || '#89b4ff',
    status: project.status,
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
  return summary(project, sessions);
}
module.exports = { available, readProjects };
