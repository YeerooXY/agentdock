'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { work, outputs, knowledge, report } = require('../electron/mobile-project-workspace.cjs');
test('phone workspace binds legacy folders, rejects foreign explicit IDs and bounds exposed fields', () => {
  const jobs = [{ id: 'legacy', repo: 'folder', title: 'Legacy', criteria: 'Brief', finalDiff: 'PRIVATE' }, { id: 'foreign', projectId: 'other', repo: 'folder', title: 'Foreign' }];
  const h = { sessions: { projects: { get: id => id === 'project' ? { id } : null, forFolder: folder => folder === 'folder' ? { id: 'project' } : null } },
    tasks: () => ({ snapshot: () => jobs, jobs: new Map(jobs.map(job => [job.id, job])), executionHistory: { read: () => 'report' } }),
    results: { list: () => [{ id: 'own', project: 'folder', title: 'Output' }, { id: 'foreign', projectId: 'other', project: 'folder' }] },
    knowledge: { enabled: () => false, directory: () => { throw Error('Off must not read'); } } };
  assert.deepEqual(work(h, 'project').map(item => item.id), ['legacy']); assert.equal('finalDiff' in work(h, 'project')[0], false);
  assert.deepEqual(outputs(h, 'project').map(item => item.id), ['own']); assert.deepEqual(knowledge(h, 'project'), { mode: 'off', items: [] });
  assert.equal(report(h, { id: 'project', taskId: 'legacy' }), 'report'); assert.throws(() => report(h, { id: 'project', taskId: 'foreign' }), /does not belong/);
  assert.throws(() => outputs(h, 'missing'), /not found/);
});
