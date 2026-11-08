'use strict';
const { redactText } = require('./delegation.cjs');
function project(h, id) {
  const value = typeof id === 'string' && h.sessions.projects?.get(id);
  if (!value || value.status === 'archived') throw Error('Project not found or archived.');
  return value;
}
function owner(h, item) { return item.projectId || h.sessions.projects?.forFolder?.(item.repo || item.project || item.cwd)?.id; }
function work(h, id) {
  project(h, id); const jobs = h.tasks?.()?.snapshot?.() || [];
  return jobs.filter(item => owner(h, item) === id).slice(0, 100).map(item => ({ id: item.id, projectId: id, title: redactText(item.title || ''), state: item.state,
    criteria: redactText(item.criteria || '').slice(0, 12000), implementer: item.implementer ? { label: item.implementer.label, model: item.implementer.model } : null,
    size: item.size || null, executionHistory: item.executionHistory || null, resultId: item.resultId || null, resolution: item.resolution ? { state: item.resolution.state, disposition: item.resolution.disposition, actor: item.resolution.actor } : null,
    decisionRequired: item.decisionRequired ? { kind: item.decisionRequired.kind, summary: redactText(item.decisionRequired.summary || '') } : null }));
}
function outputs(h, id) {
  project(h, id);
  return h.results.list().filter(item => owner(h, item) === id && !(item.outcome?.type === 'task' && (String(item.consoleKey || '').startsWith('task-') || item.source === 'Tasks'))).slice(0, 100).map(({ id: resultId, title, kind, status, summary, at, size, image, ext, groupId, consoleKey, consoleName, seenAt }) => ({ id: resultId, projectId: id, title, kind, status, summary, at, size, image, ext, groupId, consoleKey, consoleName, seenAt }));
}
function knowledge(h, id, options = {}) {
  project(h, id);
  if (!h.knowledge?.enabled(id)) return { mode: 'off', items: [] };
  return { ...h.knowledge.directory(id, { limit: 20, ...(options.cursor ? { cursor: options.cursor } : {}) }), ...(typeof h.knowledge.state === 'function' ? { application: h.knowledge.state(id) } : {}), mode: h.knowledge.automatic(id) ? 'automatic' : 'read' };
}
function report(h, { id, taskId, offset, limit, revision }) {
  project(h, id); const tasks = h.tasks?.();
  const job = tasks?.jobs?.get(taskId); if (!job || owner(h, job) !== id) throw Error('Task does not belong to this project.');
  return tasks.executionHistory.read('task', taskId, { offset, limit, revision });
}
module.exports = { project, work, outputs, knowledge, report };
