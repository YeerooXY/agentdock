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

test('agents propose; only approved decisions reach the project context', t => {
  const { projects, p } = fixture(t);
  let saved = projects.proposeDecision(p.id, { decision: 'Use Godot 4, not Unity', reason: 'Smaller builds' }, 'Codex');
  const proposed = saved.decisions[0];
  assert.equal(proposed.status, 'proposed'); assert.equal(proposed.by, 'Codex');
  let summary = projects.summary(p.id);
  assert.doesNotMatch(summary, /Use Godot 4/);
  assert.match(summary, /1 proposed decision await/);
  saved = projects.decide(p.id, { decisionId: proposed.id, action: 'approve' });
  summary = projects.summary(p.id);
  assert.match(summary, /Use Godot 4, not Unity \(Smaller builds\)/);
  assert.doesNotMatch(summary, /proposed decision/);
  assert.match(summary, /dock\/project_decision/);
});

test('rejected decisions stay out of context; edit, add and remove work', t => {
  const { projects, p } = fixture(t);
  const id = projects.proposeDecision(p.id, { decision: 'Tabs' }, 'Claude').decisions[0].id;
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

test('saving the project keeps decisions; duplicates and floods are refused', t => {
  const { projects, p, folder } = fixture(t);
  projects.proposeDecision(p.id, { decision: 'Prefer small commits' }, 'Codex');
  projects.save({ id: p.id, name: 'Robonslaught 2', goals: 'Ship it', folders: [{ path: folder }] });
  assert.equal(projects.get(p.id).decisions.length, 1);
  projects.progress(p.id, { note: 'Did a thing' });
  assert.equal(projects.get(p.id).decisions.length, 1);
  assert.throws(() => projects.proposeDecision(p.id, { decision: 'prefer SMALL commits' }, 'Kiro'), /already recorded/);
  assert.throws(() => projects.proposeDecision(p.id, { decision: '' }, 'Kiro'), /Describe/);
  assert.throws(() => projects.proposeDecision(p.id, { decision: 'x'.repeat(501) }, 'Kiro'), /too long/);
  for (let i = 0; i < 19; i++) projects.proposeDecision(p.id, { decision: `Choice ${i}` }, 'Codex');
  assert.throws(() => projects.proposeDecision(p.id, { decision: 'One more' }, 'Codex'), /20 decisions already await/);
  assert.throws(() => projects.proposeDecision('missing', { decision: 'Anything' }, 'Codex'), /Link this chat/);
  const reloaded = new Projects(path.dirname(projects.file));
  assert.equal(reloaded.get(p.id).decisions.length, 20);
});
