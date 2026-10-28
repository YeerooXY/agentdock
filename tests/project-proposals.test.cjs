'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Projects } = require('../electron/projects.cjs');
const { Workbench } = require('../electron/workbench.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'project-proposal-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projects = new Projects(root), session = { id: 'console', name: 'Builder', alive: true, cwd: root };
  const sessions = { items: new Map([[session.id, session]]), assignProject(id, projectId) { this.items.get(id).projectId = projectId; } };
  const alerts = [], bridge = Object.create(Workbench.prototype);
  Object.assign(bridge, { projects, getSessions: () => sessions, getProject: () => root, alerts: { send: value => alerts.push(value) } });
  return { root, projects, session, sessions, bridge, alerts, raw: { name: 'Game', folders: [root], goals: 'Build a game' } };
}

test('proposals validate folders and fields and enforce the waiting limit', t => {
  const f = fixture(t), { projects, raw, root } = f;
  assert.throws(() => projects.proposeProject({ ...raw, name: '' }), /name/i);
  assert.throws(() => projects.proposeProject({ ...raw, folders: [path.join(root, 'missing')] }), /existing project folder/i);
  assert.throws(() => projects.proposeProject({ ...raw, goals: 'x'.repeat(10001) }), /Goals/);
  assert.throws(() => projects.proposeProject({ ...raw, decisions: [{ decision: '' }] }), /decision/i);
  const other = fs.mkdtempSync(path.join(root, 'owned-'));
  projects.save({ name: 'Existing project', folders: [{ path: other }] });
  assert.throws(() => projects.proposeProject({ ...raw, folders: [other] }), /Existing project/);
  for (let i = 0; i < 5; i++) projects.proposeProject(raw);
  assert.throws(() => projects.proposeProject(raw), /5 project proposals/);
  assert.equal(projects.list().length, 1);
});

test('agent proposal waits for acceptance, links its console and approves decisions', async t => {
  const f = fixture(t);
  const result = await f.bridge.invoke('dock/propose_project', { ...f.raw, milestones: [{ text: 'Ship', acceptance: 'Playable' }], decisions: [{ decision: 'Use tabs', reason: 'Preference' }] }, f.session.id);
  assert.equal(f.projects.list().length, 0);
  assert.equal(f.alerts[0].title, 'Project proposed: Game');
  assert.equal(f.alerts[0].kind, 'question'); assert.equal(f.alerts[0].destination, 'projects');
  assert.equal(new Projects(f.root).proposals.length, 1);
  const p = f.projects.acceptProposal(result.proposalId, f.sessions);
  assert.equal(p.status, 'active'); assert.equal(f.session.projectId, p.id);
  assert.equal(p.milestones[0].acceptance, 'Playable');
  assert.equal(p.decisions[0].status, 'approved'); assert.equal(p.decisions[0].by, 'You');
  assert.equal(f.projects.proposals.length, 0);
});

test('dismiss removes the proposal and accepting checks folder ownership again', t => {
  const f = fixture(t), first = f.projects.proposeProject(f.raw, f.session);
  f.projects.dismissProposal(first.id); assert.equal(f.projects.list().length, 0);
  const second = f.projects.proposeProject(f.raw, f.session);
  f.projects.save({ name: 'New owner', folders: [{ path: f.root }] });
  assert.throws(() => f.projects.acceptProposal(second.id, f.sessions), /New owner/);
  assert.equal(f.projects.proposals.length, 1);
});

test('a folder alias already assigned to a project is refused', t => {
  const f = fixture(t), target = fs.mkdtempSync(path.join(f.root, 'owned-')), alias = path.join(f.root, 'alias');
  fs.symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  f.projects.save({ name: 'Existing project', folders: [{ path: target }] });
  assert.throws(() => f.projects.proposeProject({ ...f.raw, folders: [alias] }), /Existing project/);
  assert.equal(f.projects.proposals.length, 0);
});
