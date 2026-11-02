const { test } = require('node:test');
const assert = require('node:assert/strict');
test('chats sharing a folder or name stay separate and completed turns sort newest first', async () => {
  const { resultChatKey, resultGroups, resultTurnTitle } = await import('../src/results-model.js');
  const a = { id: 'a', consoleKey: 'one', consoleName: 'Same name', project: 'C:/Projects', groupId: 't1', at: 1 };
  const b = { ...a, id: 'b', consoleKey: 'two', groupId: 't2', at: 3 };
  assert.notEqual(resultChatKey(a), resultChatKey(b));
  assert.equal(resultChatKey(a), resultChatKey({ ...a, consoleName: 'Renamed', project: 'C:/Other' }));
  assert.deepEqual(resultGroups([a, b]).map(x => x[0].id), ['b', 'a']);
  assert.equal(resultTurnTitle([{ kind: 'code', title: '2 changed files' }, { kind: 'report', title: 'Checks complete', ext: '.md' }]), 'Checks complete');
});
test('gallery partitions projects before turns and never treats a console name as a project', async () => {
  const { resultGroups, projectLabel } = await import('../src/results-model.js');
  const base = { consoleKey: 'slot-1', consoleName: 'Learning application', groupId: 'turn-1', project: 'C:\\Projects' };
  assert.equal(projectLabel(base), 'Projects');
  const items = [...Array(80)].map((_,i) => ({ ...base, id: String(i), projectId: 'dock' }));
  items.push({ ...base, id: 'learning', projectId: 'learning' });
  assert.deepEqual(resultGroups(items).map(x => x.length), [80,1]);
  assert.equal(projectLabel(items[0], [{ id: 'dock', name: 'Paddock' }]), 'Paddock');
});

test('revision badges show commit and branch together, retain detached/unknown states and separate repositories', async () => {
  const { revisionLabel, resultRevision, turnRevisions } = await import('../src/results-model.js');
  const start = { repository: '/dock', branch: 'main', commit: 'a'.repeat(40), dirty: true };
  const end = { ...start, commit: 'b'.repeat(40), dirty: false };
  assert.equal(revisionLabel(resultRevision({ git: start, gitEnd: end })), 'main at bbbbbbbb');
  assert.equal(revisionLabel(start), 'main at aaaaaaaa, with uncommitted changes');
  assert.equal(revisionLabel({ commit: start.commit, detached: true }), 'Detached HEAD at aaaaaaaa');
  assert.equal(revisionLabel({ branch: 'main', unborn: true }), 'main, no commits yet');
  assert.equal(revisionLabel({ branch: 'main' }), 'main, commit unavailable');
  assert.equal(revisionLabel(null), 'Revision unavailable');
  assert.equal(turnRevisions([{ git: start, gitEnd: end }, { git: start, gitEnd: end }, { git: { ...end, repository: '/other' } }]).length, 2);
});

test('project folders count each unviewed file and sort unread folders before newer viewed folders', async () => {
  const { resultFolders } = await import('../src/results-model.js');
  const projects = [{ id: 'game', name: 'Robonslaught', color: '#aabbcc' }];
  const items = [
    { id: 'a', projectId: 'game', project: 'C:/Game', at: 10, seenAt: null },
    { id: 'b', projectId: 'game', project: 'C:/OldName', at: 20, seenAt: 1 },
    { id: 'c', projectId: 'game', at: 15, seenAt: null },
    { id: 'd', project: 'C:/Projects/Paddock', at: 100, seenAt: 1 },
    { id: 'e', project: '/Projects/Research', at: 30, seenAt: null },
    { id: 'f', at: 40, seenAt: 1 }, { id: 'g', at: 5, seenAt: null },
  ];
  const folders = resultFolders(items, projects);
  assert.deepEqual(folders.map(({ name, count, unviewed, at }) => [name, count, unviewed, at]), [
    ['Other', 2, 1, 40], ['Research', 1, 1, 30], ['Robonslaught', 3, 2, 20], ['Paddock', 1, 0, 100],
  ]);
  assert.equal(folders.find(folder => folder.key === 'game').project.color, '#aabbcc');
  items.filter(item => item.projectId === 'game').forEach(item => item.seenAt = 50);
  assert.equal(resultFolders(items, projects).find(folder => folder.key === 'game').unviewed, 0);
  assert.deepEqual(resultFolders([]), []);
});

test('a folder-only result joins the project that owns its folder', async () => {
  const { projectKey, resultFolders, resultGroups, projectLabel } = await import('../src/results-model.js');
  const projects = [{ id: 'dock', name: 'Agentdock', folders: [{ path: 'C:\\Users\\me\\Projects\\agent-dock' }] }];
  const bound = { id: 'a', projectId: 'dock', project: 'C:/Users/me/Projects/agent-dock', consoleKey: 'one', groupId: 't1', at: 2 };
  const pathOnly = { id: 'b', project: 'c:\\users\\me\\projects\\agent-dock\\src', consoleKey: 'one', groupId: 't1', at: 1 };
  assert.equal(projectKey(pathOnly, projects), 'dock');
  assert.equal(projectLabel(pathOnly, projects), 'Agentdock');
  assert.deepEqual(resultFolders([bound, pathOnly], projects).map(folder => [folder.key, folder.name, folder.count]), [['dock', 'Agentdock', 2]]);
  assert.deepEqual(resultGroups([bound, pathOnly], projects).map(group => group.length), [2]);
  assert.equal(projectKey({ project: 'C:/Elsewhere' }, projects), 'c:/elsewhere', 'unregistered folders compare case-insensitively on Windows');
  assert.equal(projectKey({ projectId: 'deleted', project: 'C:/Users/me/Projects/agent-dock' }, projects), 'deleted', 'an explicit binding is kept');
});

test('the phone unread count groups a folder-only result with its project like the renderer', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { Results } = require('../electron/results.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-results-'));
  try {
    const results = new Results(root, { projectFor: folder => /agent-dock/i.test(folder) ? 'dock' : null });
    const turn = { consoleKey: 'one', groupId: 't1', seenAt: null };
    results.items = [{ ...turn, id: 'a', projectId: 'dock', project: 'C:/Projects/agent-dock' }, { ...turn, id: 'b', project: 'C:\\Projects\\Agent-Dock' }];
    assert.equal(results.unreadGroups(), 1);
    results.items.push({ ...turn, id: 'c', project: 'C:/Other' }, { ...turn, id: 'd', project: 'c:\\other\\' });
    assert.equal(results.unreadGroups(), 2, 'unregistered folders differing only in case and slashes share a group');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
