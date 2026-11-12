'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Workbench } = require('../electron/workbench.cjs');
const { Turns } = require('../electron/turns.cjs');
const { SharedHub } = require('../electron/shared.cjs');
const { Projects } = require('../electron/projects.cjs');
const { DOCK_TOOLS } = require('../electron/tool-contract.cjs');

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'paddock-context-revision-'));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), parent); fs.rmSync(root, { recursive: true, force: true }); });
  const session = { id: 'owner', consoleKey: 'chat', launchId: 'launch-1', provider: 'codex', cwd: root, alive: true };
  const wb = new Workbench(root, {}, { nativeImage: {} }, { getSessions: () => ({ items: new Map([[session.id, session]]) }), getProject: () => root, onChange() {} });
  wb.turns = new Turns({ getSession: () => session });
  wb.projects = new Projects(root);
  const project = wb.projects.save({ name: 'Fixture', goals: 'Implement the requested feature', folders: [{ path: root }] });
  session.projectId = project.id;
  const hub = new SharedHub(root, { list: () => [] }, { workbench: wb });
  const context = async args => {
    const text = (await hub.invoke('dock_context', args || {}, session.id)).content[0].text;
    return { text, ...JSON.parse(text.split('\n')[0]) };
  };
  return { root, session, wb, hub, project, context };
}

test('caller revision omits unchanged instructions without starting a tracked turn', async t => {
  const f = fixture(t), first = await f.context({ includeProject: true });
  assert.equal(f.wb.turns.active.size, 0);
  assert.equal(first.unchanged, false); assert.equal(first.projectContextIncluded, true);
  assert.match(first.text, /Paddock shared instructions|Project details/);
  const second = await f.context({ includeProject: true, sinceContextRevision: first.contextRevision });
  assert.equal(second.unchanged, true); assert.deepEqual(second.contextRevision, first.contextRevision);
  assert.doesNotMatch(second.text, /Paddock shared instructions|Project details/);
  assert.ok(second.text.length < first.text.length / 4, `${second.text.length}/${first.text.length}`);
  assert.equal(f.wb.turns.active.size, 0);
  assert.doesNotMatch(second.text, /Current turnId|finish_turn/);
});

test('missing and obsolete receipts resend context independently for each caller', async t => {
  const f = fixture(t), first = await f.context();
  assert.equal((await f.context({ sinceContextRevision: first.contextRevision })).unchanged, true);
  assert.equal((await f.context()).unchanged, false, 'another caller has not acknowledged these instructions');
  f.hub.config.instructions += '\nKeep the existing file names.';
  const changed = await f.context({ sinceContextRevision: first.contextRevision });
  assert.equal(changed.unchanged, false); assert.match(changed.text, /Keep the existing file names/);
  assert.equal((await f.context({ sinceContextRevision: first.contextRevision })).unchanged, false);
  assert.equal((await f.context({ sinceContextRevision: changed.contextRevision })).unchanged, true);
});

test('launch, project, folder and profile identities invalidate context receipts', async t => {
  const f = fixture(t), first = await f.context();
  for (const [field, value] of [['launchId', 'launch-2'], ['consoleKey', 'another-chat'], ['cwd', os.tmpdir()], ['playtimeDataDir', os.tmpdir()], ['projectId', null]]) {
    const previous = f.session[field]; f.session[field] = value;
    assert.equal((await f.context({ sinceContextRevision: first.contextRevision })).unchanged, false, field);
    f.session[field] = previous;
  }
});

test('one context call supplies project details while preserving user approval', async t => {
  const f = fixture(t);
  f.wb.projects.get(f.project.id).decisions.push({ text: 'PROPOSED_ONLY', status: 'proposed' });
  const plain = await f.context();
  const full = await f.context({ includeProject: true, sinceContextRevision: plain.contextRevision });
  assert.equal(full.unchanged, true); assert.equal(full.projectUnchanged, false); assert.equal(full.projectContextIncluded, true);
  assert.doesNotMatch(full.text, /PROPOSED_ONLY/);
  assert.equal(f.wb.projects.get(f.project.id).decisions[0].status, 'proposed');
});

test('approved decisions and plan edits replace previously acknowledged project details', async t => {
  const f = fixture(t), first = await f.context({ includeProject: true });
  f.wb.projects.decide(f.project.id, { action: 'add', text: 'Use the existing theme' });
  const decision = await f.context({ includeProject: true, sinceContextRevision: first.contextRevision });
  assert.equal(decision.unchanged, true); assert.equal(decision.projectUnchanged, false); assert.match(decision.text, /Use the existing theme/);
  assert.doesNotMatch(decision.text, /Paddock shared instructions/);
  const project = f.wb.projects.get(f.project.id);
  project.plan = { ...project.plan, scope: 'Only the selected dialog', revision: 'changed-revision' };
  project.lastProgress = { summary: 'The latest verified change' };
  const plan = await f.context({ includeProject: true, sinceContextRevision: decision.contextRevision });
  assert.equal(plan.unchanged, true); assert.equal(plan.projectUnchanged, false); assert.match(plan.text, /Only the selected dialog/);
  assert.match(plan.text, /The latest verified change/);
});

test('permission and optional shared-policy changes invalidate receipts', async t => {
  const f = fixture(t);
  f.hub.config.connections = [{ id: 'fixture', name: 'Fixture', enabled: true, type: 'stdio', policy: { access: 'allowed', dailyBudget: null } }];
  const first = await f.context();
  f.hub.config.connections[0].policy.access = 'ask';
  const permission = await f.context({ sinceContextRevision: first.contextRevision });
  assert.equal(permission.unchanged, false); assert.match(permission.text, /ask first/);
  const original = f.hub.fullSummary.bind(f.hub);
  f.hub.fullSummary = () => original() + '\nChanged optional preview policy.';
  assert.equal((await f.context({ sinceContextRevision: permission.contextRevision })).unchanged, false);
});

test('live study state is always refreshed without repeating static course instructions', async t => {
  const f = fixture(t); let tick = 0;
  f.hub.studyContextSnapshot = () => ({ instructions: '\nCOURSE_RULES', state: {
    courseId: 'cpp', readAt: String(++tick), timer: { status: 'available', remainingMs: 5000 - tick },
    reflections: { status: 'available', recent: [{ text: 'Reflection ' + tick }] }
  } });
  const first = await f.context(), second = await f.context({ sinceContextRevision: first.contextRevision });
  assert.equal(second.unchanged, true); assert.doesNotMatch(second.text, /COURSE_RULES/);
  assert.match(second.text, /"remainingMs":4998/); assert.match(second.text, /Reflection 2/);
  f.hub.studyContextSnapshot = () => ({ instructions: '\nCOURSE_RULES', state: { reflections: { status: 'unavailable', recent: [] }, timer: { status: 'stale' } } });
  const unavailable = await f.context({ sinceContextRevision: first.contextRevision });
  assert.equal(unavailable.unchanged, true); assert.match(unavailable.text, /unavailable/); assert.match(unavailable.text, /stale/);
  assert.doesNotMatch(unavailable.text, /Reflection [12]|remainingMs/);
});

test('invalid receipt options fail before starting tracked work and schema exposes the contract', async t => {
  const f = fixture(t);
  for (const args of [{ sinceContextRevision: 'bad' }, { sinceContextRevision: 'a'.repeat(64), detail: 'study' }, { includeProject: 'yes' }, { includeProject: true, detail: 'project' }]) {
    await assert.rejects(f.context(args), /sinceContextRevision|includeProject/);
    assert.equal(f.wb.turns.active.size, 0);
  }
  const schema = DOCK_TOOLS.find(tool => tool.name === 'dock_context').inputSchema;
  assert.equal(schema.properties.sinceContextRevision.properties.instructions.pattern, '^[a-f0-9]{64}$');
  assert.equal(schema.properties.includeProject.type, 'boolean');
  const description = DOCK_TOOLS.find(tool => tool.name === 'dock_context').description;
  assert.doesNotMatch(description, /finish_turn/);
  assert.doesNotMatch(f.hub.summary(), /finish_turn|project_progress|save_result/);
});
