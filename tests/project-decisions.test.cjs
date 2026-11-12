'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { Projects } = require('../electron/projects.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-decisions-')), folder = path.join(root, 'work'); fs.mkdirSync(folder);
  const projects = new Projects(root), p = projects.save({ name: 'Robonslaught', goals: 'Make a game', folders: [{ path: folder }] });
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  return { root, folder, projects, p };
}

test('rejected decisions stay out of context; edit, add and remove work', t => {
  const { projects, p } = fixture(t);
  const id = projects.decide(p.id, { action: 'add', text: 'Tabs' }).decisions[0].id;
  projects.decide(p.id, { decisionId: id, action: 'reject' });
  assert.doesNotMatch(projects.summary(p.id), /Tabs/);
  projects.decide(p.id, { decisionId: id, action: 'edit', text: 'Spaces, two wide', reason: 'Matches the engine' });
  assert.equal(projects.get(p.id).decisions[0].status, 'rejected');
  const added = projects.decide(p.id, { action: 'add', text: 'No 8 GB build per step' }).decisions[1];
  assert.equal(added.status, 'approved'); assert.equal(added.by, 'You');
  assert.match(projects.summary(p.id), /No 8 GB build per step/);
  projects.decide(p.id, { decisionId: added.id, action: 'remove' });
  assert.equal(projects.get(p.id).decisions.length, 1);
  assert.throws(() => projects.decide(p.id, { decisionId: 'missing', action: 'approve' }), /not found/);
  assert.throws(() => projects.decide(p.id, { decisionId: id, action: 'delete-all' }), /Choose approve/);
});
