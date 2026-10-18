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
