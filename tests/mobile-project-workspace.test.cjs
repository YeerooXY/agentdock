'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { project, knowledge } = require('../electron/mobile-project-workspace.cjs');
test('phone workspace binds legacy folders, rejects foreign explicit IDs and bounds exposed fields', () => {
  const jobs = [{ id: 'legacy', repo: 'folder', title: 'Legacy', criteria: 'Brief', finalDiff: 'PRIVATE' }, { id: 'foreign', projectId: 'other', repo: 'folder', title: 'Foreign' }];
  const h = { sessions: { projects: { get: id => id === 'project' ? { id } : null, forFolder: folder => folder === 'folder' ? { id: 'project' } : null } },
    tasks: () => ({ snapshot: () => jobs, jobs: new Map(jobs.map(job => [job.id, job])), executionHistory: { read: () => 'report' } }),
    results: { list: () => [{ id: 'own', project: 'folder', title: 'Output' }, { id: 'foreign', projectId: 'other', project: 'folder' }] },
    knowledge: { enabled: () => false, directory: () => { throw Error('Off must not read'); } } };
  assert.deepEqual(knowledge(h, 'project'), { mode: 'off', items: [] });
  assert.throws(() => project(h, 'missing'), /not found/);
});
