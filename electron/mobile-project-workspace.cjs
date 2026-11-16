'use strict';
function project(h, id) {
  const value = typeof id === 'string' && h.sessions.projects?.get(id);
  if (!value || value.status === 'archived') throw Error('Project not found or archived.');
  return value;
}
function knowledge(h, id, options = {}) {
  project(h, id);
  if (!h.knowledge?.enabled(id)) return { mode: 'off', items: [] };
  return { ...h.knowledge.directory(id, { limit: 20, ...(options.cursor ? { cursor: options.cursor } : {}) }), ...(typeof h.knowledge.state === 'function' ? { application: h.knowledge.state(id) } : {}), mode: h.knowledge.automatic(id) ? 'automatic' : 'read' };
}
module.exports = { project, knowledge };
