const { test } = require('node:test');
const assert = require('node:assert/strict');
test('gallery partitions projects before turns and never treats a console name as a project', async () => {
  const { resultGroups, projectLabel } = await import('../src/results-model.js');
  const base = { consoleKey: 'slot-1', consoleName: 'Learning application', groupId: 'turn-1', project: 'C:\\Projects' };
  assert.equal(projectLabel(base), 'Projects');
  const items = [...Array(80)].map((_,i) => ({ ...base, id: String(i), projectId: 'dock' }));
  items.push({ ...base, id: 'learning', projectId: 'learning' });
  assert.deepEqual(resultGroups(items).map(x => x.length), [80,1]);
  assert.equal(projectLabel(items[0], [{ id: 'dock', name: 'Agent Dock' }]), 'Agent Dock');
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
