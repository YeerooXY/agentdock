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
  assert.equal(revisionLabel(resultRevision({ git: start, gitEnd: end })), 'main · bbbbbbbb');
  assert.equal(revisionLabel(start), 'main · aaaaaaaa · Uncommitted changes');
  assert.equal(revisionLabel({ commit: start.commit, detached: true }), 'Detached HEAD · aaaaaaaa');
  assert.equal(revisionLabel({ branch: 'main', unborn: true }), 'main · No commits yet');
  assert.equal(revisionLabel({ branch: 'main' }), 'main · Commit unavailable');
  assert.equal(revisionLabel(null), 'Revision unavailable');
  assert.equal(turnRevisions([{ git: start, gitEnd: end }, { git: start, gitEnd: end }, { git: { ...end, repository: '/other' } }]).length, 2);
});
