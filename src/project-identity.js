// One project identity for Projects and activity counts.
// Windows and UNC paths compare case-insensitively; POSIX paths keep their case.
export const normalizedPath = value => {
  const path = String(value || '').replaceAll('\\', '/').replace(/\/+$/, '');
  return /^[a-z]:\//i.test(path) || path.startsWith('//') ? path.toLowerCase() : path;
};

const resolvers = new WeakMap();
// Returns item => project id. An explicit binding wins and never falls through
// to folder matching; otherwise the most specific registered folder owns the path.
export function projectResolver(projects = []) {
  if (resolvers.has(projects)) return resolvers.get(projects);
  const owners = projects.flatMap(project => (project.folders || []).map(folder => ({ id: project.id, path: normalizedPath(folder.path) })))
    .filter(x => x.path).sort((a, b) => b.path.length - a.path.length);
  const resolve = item => {
    if (item.projectId) return projects.find(p => p.id === item.projectId)?.id;
    const value = normalizedPath(item.repo || item.project || item.cwd);
    if (!value) return undefined;
    return owners.find(folder => value === folder.path || value.startsWith(folder.path + '/'))?.id;
  };
  resolvers.set(projects, resolve);
  return resolve;
}

// Grouping key: the bound project id, else the registered project that owns the
// folder, else the normalized folder itself.
export const projectKey = (item, projects = []) =>
  item.projectId || projectResolver(projects)(item) || normalizedPath(item.project) || 'unassigned';
