import { projectKey } from './project-identity.js';
export { projectKey };

// Project identity is independent of a reusable console slot or its current name.
// electron/results.cjs groupKey mirrors this key for the phone's unread count.
export const resultGroupKey = (item, projects = []) => JSON.stringify([projectKey(item, projects), item.consoleKey || item.sessionId || item.source || 'Dock', item.groupId || item.id]);
export function projectLabel(item, projects = []) {
  const key = projectKey(item, projects), project = projects.find(p => p.id === key);
  return project?.name || (item.project || '').split(/[\\/]/).filter(Boolean).pop() || 'Unassigned';
}
export function resultFolders(items, projects = []) {
  const folders = new Map();
  for (const item of items) {
    const key = projectKey(item, projects);
    if (!folders.has(key)) {
      const project = projects.find(p => p.id === key);
      folders.set(key, { key, name: item.projectId || item.project ? projectLabel(item, projects) : 'Other', project, count: 0, unviewed: 0, at: 0 });
    }
    const folder = folders.get(key);
    folder.count++;
    if (!item.seenAt) folder.unviewed++;
    folder.at = Math.max(folder.at, item.at || 0);
  }
  return [...folders.values()].sort((a, b) => Number(!!b.unviewed) - Number(!!a.unviewed) || b.at - a.at || a.name.localeCompare(b.name));
}
export function resultGroups(items, projects = []) {
  const groups = new Map();
  for (const item of items) {
    const key = resultGroupKey(item, projects);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].sort((a, b) => Math.max(...b.map(x => x.at || 0)) - Math.max(...a.map(x => x.at || 0)));
}

// Display names and launch folders are not chat identities.
export const resultChatKey = (item, projects = []) => item.consoleKey || item.sessionId || JSON.stringify(['legacy', projectKey(item, projects), item.source || 'Dock']);
export function resultTurnTitle(items) {
  return items.find(x => x.kind !== 'code' && !x.image && x.ext !== '.json')?.title || 'Completed prompt';
}

export const resultRevision = item => item?.gitEnd || item?.git || null;
export function revisionLabel(git) {
  if (!git?.branch && !git?.commit) return 'Revision unavailable';
  const head = git.branch || (git.detached ? 'Detached HEAD' : 'Branch unavailable');
  return `${head}${git.commit ? ` at ${git.commit.slice(0, 8)}` : git.unborn ? ', no commits yet' : ', commit unavailable'}${git.dirty === true ? ', with uncommitted changes' : ''}`;
}
export function turnRevisions(items) {
  const revisions = new Map();
  for (const item of items) {
    const git = resultRevision(item);
    if (git) revisions.set(JSON.stringify([git.repository || '', git.branch, git.commit, git.dirty]), git);
  }
  return [...revisions.values()];
}
