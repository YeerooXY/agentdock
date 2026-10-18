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

export const resultRevision = item => item?.gitEnd || item?.git || null;
export function revisionLabel(git) {
  if (!git?.branch && !git?.commit) return 'Revision unavailable';
  const head = git.branch || (git.detached ? 'Detached HEAD' : 'Branch unavailable');
  return `${head} · ${git.commit ? git.commit.slice(0, 8) : git.unborn ? 'No commits yet' : 'Commit unavailable'}${git.dirty === true ? ' · Uncommitted changes' : ''}`;
}
export function turnRevisions(items) {
  const revisions = new Map();
  for (const item of items) {
    const git = resultRevision(item);
    if (git) revisions.set(JSON.stringify([git.repository || '', git.branch, git.commit, git.dirty]), git);
  }
  return [...revisions.values()];
}
