// Project identity is independent of a reusable console slot or its current name.
export const projectKey = item => item.projectId || item.project || 'unassigned';
export const resultGroupKey = item => JSON.stringify([projectKey(item), item.consoleKey || item.sessionId || item.source || 'Dock', item.groupId || item.id]);
export function projectLabel(item, projects = []) {
  const project = item.projectId && projects.find(p => p.id === item.projectId);
  return project?.name || (item.project || '').split(/[\\/]/).filter(Boolean).pop() || 'Unassigned';
}
export function resultGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const key = resultGroupKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()];
}
