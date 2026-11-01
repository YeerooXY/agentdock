const runningStates = new Set(['planning', 'reviewing-plan', 'building', 'implementing', 'checking', 'reviewing']);
const attentionStates = new Set(['needs-you', 'plan-ready', 'interrupted', 'failed']);
const normalized = value => { const path = String(value || '').replaceAll('\\', '/').replace(/\/+$/, ''); return /^[a-z]:\//i.test(path) || path.startsWith('//') ? path.toLowerCase() : path; };

// Folder matching uses the most specific registered project; explicit bindings win.
export function projectActivity(state) {
  const projects = state.projects || [];
  const owners = projects.flatMap(project => (project.folders || []).map(folder => ({ id: project.id, path: normalized(folder.path) }))).filter(x => x.path).sort((a,b) => b.path.length - a.path.length);
  const owner = item => item.projectId ? projects.find(p => p.id === item.projectId)?.id : owners.find(folder => {
    const value = normalized(item.repo || item.project || item.cwd);
    return value === folder.path || value.startsWith(folder.path + '/');
  })?.id;
  const activity = new Map(projects.map(p => [p.id, { running: 0, attention: 0, consoles: 0, lastActiveAt: p.lastActiveAt || 0, latestResult: null }]));
  for (const item of state.sessions || []) {
    const current = activity.get(owner(item));
    if (current && item.alive && !item.kind && !item.taskId) current.consoles++;
  }
  for (const item of state.tasks || []) {
    const current = activity.get(owner(item)); if (!current) continue;
    if (runningStates.has(item.state)) current.running++;
    if (attentionStates.has(item.state)) current.attention++;
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
