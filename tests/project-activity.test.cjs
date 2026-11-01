const { test } = require('node:test');
const assert = require('node:assert/strict');
test('project cards derive activity from current records and the most specific folder', async () => {
  const { projectActivity } = await import('../src/project-activity.js');
  const state = { projects: [{ id: 'workspace', folders: [{ path: 'C:\\Projects' }], lastActiveAt: 10 }, { id: 'child', folders: [{ path: 'C:\\Projects\\Site' }], lastActiveAt: 20 }],
    sessions: [{ cwd: 'c:/projects/site/src', alive: true }, { cwd: 'C:/Projects/Site', alive: true, taskId: 'worker' }],
    tasks: [{ repo: 'C:/Projects/Site', state: 'checking', startedAt: 30 }, { repo: 'C:/Projects/Site', state: 'needs-you', finishedAt: 40 }, { repo: 'C:/Projects/Site-other', state: 'stopped', finishedAt: 45 }],
    workbench: { results: [{ id: 'one', project: 'C:/Projects/Site', at: 35 }, { id: 'two', projectId: 'child', project: 'C:/Elsewhere', at: 36, updatedAt: 50 }] } };
  const summary = projectActivity(state);
  assert.equal(summary.get('child').consoles, 1); assert.equal(summary.get('child').running, 1); assert.equal(summary.get('child').attention, 1);
  assert.equal(summary.get('child').lastActiveAt, 50); assert.equal(summary.get('child').latestResult.id, 'two');
  assert.equal(summary.get('workspace').running, 0); assert.equal(summary.get('workspace').lastActiveAt, 45);
  state.tasks[0].state = 'accepted'; state.workbench.results.pop(); state.sessions[0].alive = false;
  const updated = projectActivity(state).get('child');
  assert.equal(updated.running, 0); assert.equal(updated.consoles, 0); assert.equal(updated.latestResult.id, 'one');
  assert.equal(state.projects[1].lastActiveAt, 20, 'Derived state does not rewrite project notes or milestones');
});
test('project activity respects POSIX case and does not fall through an explicit missing binding', async () => {
  const { projectActivity } = await import('../src/project-activity.js');
  const state = { projects: [{ id: 'one', folders: [{ path: '/work/Site' }] }], tasks: [{ repo: '/work/site', state: 'checking' }, { projectId: 'deleted', repo: '/work/Site', state: 'checking' }] };
  assert.equal(projectActivity(state).get('one').running, 0);
});
