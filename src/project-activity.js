import { projectResolver } from './project-identity.js';

const runningStates = new Set(['planning', 'reviewing-plan', 'building', 'implementing', 'checking', 'reviewing']);
const attentionStates = new Set(['needs-you', 'plan-ready', 'interrupted', 'failed']);
// electron/task-loop.cjs records this error when Paddock closes during a task.
const closedByApp = item => item.state === 'interrupted' && /^Paddock closed before this task finished/.test(item.error || '');
const taskTime = item => item.startedAt || item.finishedAt || 0;

// A task needs attention while it still matters: closing Paddock is not a task
// problem, and a newer task in the same project replaces an older outcome.
// A plan waiting for approval always counts.
function needsAttention(item, newest) {
  if (!attentionStates.has(item.state) || closedByApp(item)) return false;
  return item.state === 'plan-ready' || taskTime(item) >= newest;
}

export const attentionLabel = count => `${count} ${count === 1 ? 'needs' : 'need'} attention`;

// Folder matching uses the most specific registered project; explicit bindings win.
export function projectActivity(state) {
  const projects = state.projects || [];
  const owner = projectResolver(projects);
  const activity = new Map(projects.map(p => [p.id, { running: 0, attention: 0, consoles: 0, lastActiveAt: p.lastActiveAt || 0, latestResult: null }]));
  for (const item of state.sessions || []) {
    const current = activity.get(owner(item));
    if (current && item.alive && !item.kind && !item.taskId) current.consoles++;
  }
  const tasks = (state.tasks || []).map(item => [item, owner(item)]).filter(([, id]) => activity.has(id));
  const newest = new Map();
  for (const [item, id] of tasks) newest.set(id, Math.max(newest.get(id) || 0, taskTime(item)));
  for (const [item, id] of tasks) {
    const current = activity.get(id);
    if (runningStates.has(item.state)) current.running++;
    if (needsAttention(item, newest.get(id))) current.attention++;
    current.lastActiveAt = Math.max(current.lastActiveAt, item.updatedAt || item.finishedAt || item.startedAt || 0);
  }
  for (const item of state.workbench?.results || []) {
    const current = activity.get(owner(item)); if (!current) continue;
    const at = item.updatedAt || item.at || 0;
    current.lastActiveAt = Math.max(current.lastActiveAt, at);
    if (!current.latestResult || at > (current.latestResult.updatedAt || current.latestResult.at || 0)) current.latestResult = item;
  }
  return activity;
}
