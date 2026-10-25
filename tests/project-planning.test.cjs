'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Projects } = require('../electron/projects.cjs');
const { Workbench } = require('../electron/workbench.cjs');
const { Sessions } = require('../electron/sessions.cjs');
function fixture(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'dock-planning-'))); // CI temp folders can be symlinks or short names
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }); });
  const folder = path.join(root, 'app'); fs.mkdirSync(folder);
  const store = new Projects(root); const p = store.save({ name: 'Learning app', guided: true, goals: 'Practice class notes', audience: 'University students', success: 'Complete a practice session', folders: [{ path: folder }], milestones: [{ text: 'Practice prototype' }] });
  const review = (section, changes, action = 'approve') => store.review(p.id, { section, changes, action, revision: store.get(p.id).plan.revision });
  return { root, folder, store, p, review };
}
const infrastructure = { stack: 'TypeScript', reason: 'Browser UI with type checks', alternative: 'JavaScript', tradeoff: 'Less setup, fewer checks', hosting: 'Local PC; no hosting cost', data: 'Local files', security: 'Single local user; no credentials in files', operations: 'Unit tests, build, file backups and restore check' };
const roadmap = { scope: 'Practice one class from local notes', milestones: [{ text: 'Practice prototype', acceptance: 'Import notes and complete a session', done: false }, { text: 'Release check', acceptance: 'Tests and backup restore pass', done: false }] };
function approveAll(f) {
  f.review('brief', {}); f.review('research', { purpose: 'personal', evidence: 'Used only for my own notes.' });
  f.review('infrastructure', infrastructure); return f.review('roadmap', roadmap);
}
test('sections are independent: only the roadmap is needed to start, others can be marked not needed', t => {
  const f = fixture(t); assert.equal(f.p.status, 'planning'); assert.equal(f.p.milestones.length, 1);
  assert.throws(() => f.store.progress(f.p.id, { milestone: 0, done: true, revision: f.p.plan.revision }), /Approve the roadmap/);
  assert.throws(() => f.review('roadmap', { scope: 'Practice', milestones: [{ text: 'Ship' }] }), /completion check/);
  assert.throws(() => f.review('roadmap', { scope: '', milestones: roadmap.milestones }), /what is included/);
  let p = f.review('roadmap', roadmap); assert.equal(p.status, 'active'); assert.deepEqual(Object.keys(p.plan.approvals), ['roadmap']);
  assert.equal(p.nextStep, 'Practice prototype');
  assert.throws(() => f.review('research', {}), /at least one finding|Not needed/);
  p = f.review('research', {}, 'skip'); assert.ok(p.plan.skipped.research); assert.equal(p.status, 'active');
  assert.throws(() => f.review('roadmap', {}, 'skip'), /needed to start/);
  p = f.review('infrastructure', { stack: 'TypeScript and Electron' }); assert.ok(p.plan.approvals.infrastructure);
  p = f.review('research', {}, 'unskip'); assert.equal(p.plan.skipped.research, undefined);
  assert.equal(new Projects(f.root).get(p.id).status, 'active');
  assert.match(fs.readFileSync(path.join(p.plan.files.directory, 'ROADMAP.md'), 'utf8'), /## Not included/);
});
test('the roadmap records what is not included', t => {
  const f = fixture(t), p = f.review('roadmap', { ...roadmap, excluded: 'Shared libraries and accounts' });
  assert.equal(p.plan.excluded, 'Shared libraries and accounts');
  assert.match(fs.readFileSync(path.join(p.plan.files.directory, 'ROADMAP.md'), 'utf8'), /Shared libraries and accounts/);
});
test('references: links are validated, files are copied into the plan folder and removed with the reference', t => {
  const f = fixture(t), source = path.join(f.root, 'shot.png'); fs.writeFileSync(source, 'png');
  assert.throws(() => f.store.addReference(f.p.id, { revision: f.store.get(f.p.id).plan.revision, kind: 'link', value: 'javascript:alert(1)' }), /web address/);
  let p = f.store.addReference(f.p.id, { revision: f.store.get(f.p.id).plan.revision, kind: 'link', value: 'https://example.org/app', title: 'Example' });
  p = f.store.addReference(f.p.id, { revision: p.plan.revision, kind: 'file', value: source });
  const image = p.plan.references.find(x => x.kind === 'image');
  assert.ok(image.value.startsWith(path.join(p.plan.files.directory, 'references') + path.sep)); assert.equal(fs.readFileSync(image.value, 'utf8'), 'png');
  assert.throws(() => f.store.addReference(f.p.id, { revision: p.plan.revision, kind: 'file', value: f.root }), /not a folder/);
  assert.equal(f.store.plan(f.p.id).references.length, 2);
  assert.match(fs.readFileSync(path.join(p.plan.files.directory, 'PROJECT.md'), 'utf8'), /Example: https:\/\/example.org\/app/);
  p = f.store.removeReference(f.p.id, { revision: p.plan.revision, ref: image.id });
  assert.equal(fs.existsSync(image.value), false); assert.equal(fs.existsSync(source), true); assert.equal(p.plan.references.length, 1);
});
test('agent proposals cannot approve, replace pending proposals, overwrite user edits or change another project', async t => {
  const f = fixture(t), original = f.store.plan(f.p.id);
  const sessions = new Map([['agent', { id: 'agent', name: 'Planner', alive: true, cwd: f.folder, projectId: f.p.id }]]);
  const bridge = Object.create(Workbench.prototype); Object.assign(bridge, { projects: f.store, getSessions: () => ({ items: sessions }), getProject: () => f.folder, alerts: { send() {} } });
  await bridge.invoke('dock/propose_project_plan', { revision: original.revision, section: 'brief', changes: { goals: 'Reviewed goal' } }, 'agent');
  assert.equal(f.store.get(f.p.id).goals, 'Practice class notes'); assert.deepEqual(f.store.get(f.p.id).plan.approvals, {});
  assert.throws(() => f.store.propose(f.p.id, { revision: f.store.get(f.p.id).plan.revision, section: 'brief', changes: { goals: 'Overwrite' } }, 'Second agent'), /waiting for the user/);
  f.store.propose(f.p.id, { revision: f.store.get(f.p.id).plan.revision, section: 'roadmap', changes: { excluded: 'Accounts' } }, 'Second agent');
  assert.deepEqual(Object.keys(f.store.get(f.p.id).plan.proposals).sort(), ['brief', 'roadmap']);
  assert.throws(() => f.store.review(f.p.id, { revision: original.revision, section: 'brief', changes: { goals: 'Old save' }, action: 'save' }), /project changed/);
  f.review('brief', { goals: 'User edited goal' }); assert.equal(f.store.get(f.p.id).goals, 'User edited goal');
  assert.throws(() => f.store.propose(f.p.id, { revision: f.store.get(f.p.id).plan.revision, section: 'brief', changes: { status: 'active' } }), /cannot change/);
  await assert.rejects(bridge.invoke('dock/project_plan', {}, 'unknown'), /no longer open/);
  const other = f.store.save({ name: 'Another project', guided: true, folders: [{ path: f.folder }] });
  sessions.set('other-agent', { id: 'other-agent', alive: true, cwd: f.folder, projectId: other.id });
  assert.equal((await bridge.invoke('dock/project_plan', {}, 'other-agent')).projectId, other.id);
  await bridge.invoke('dock/propose_project_plan', { projectId: other.id, revision: f.store.get(f.p.id).plan.revision, section: 'brief', changes: { audience: 'Proposed audience' } }, 'agent');
  assert.deepEqual(f.store.get(other.id).plan.proposals, {}); assert.equal(f.store.get(f.p.id).plan.proposals.brief.data.audience, 'Proposed audience');
  assert.equal(bridge.tools().some(x => x.name.includes('project') && /approve|review/.test(x.name)), false);
});
test('editing approved decisions requires review again and preserves legacy projects', t => {
  const f = fixture(t), active = approveAll(f);
  const changed = f.store.review(active.id, { revision: active.plan.revision, section: 'infrastructure', changes: { stack: 'Changed stack' }, action: 'save' });
  assert.equal(changed.status, 'active'); assert.equal(changed.plan.approvals.infrastructure, undefined); assert.ok(changed.plan.approvals.roadmap);
  const scope = f.store.review(active.id, { revision: changed.plan.revision, section: 'roadmap', changes: { scope: 'Changed scope' }, action: 'save' });
  assert.equal(scope.status, 'planning'); assert.equal(scope.plan.approvals.roadmap, undefined); assert.ok(scope.plan.approvals.brief);
  const legacyPlan = structuredClone(f.store.get(active.id)); legacyPlan.plan.proposal = { id: 'x', section: 'research', data: { niche: 'Old' }, agent: 'A', at: 1 }; delete legacyPlan.plan.proposals;
  assert.equal(require('../electron/project-planning.cjs').context(legacyPlan, 'research').proposal.data.niche, 'Old');
  const legacy = f.store.save({ name: 'Existing project', goals: 'Maintain it', folders: [{ path: f.folder }], status: 'paused' });
  assert.equal(legacy.plan, undefined); assert.equal(new Projects(f.root).get(legacy.id).status, 'paused');
  const converted = f.store.beginPlan(legacy.id); assert.equal(converted.status, 'planning'); assert.equal(converted.goals, 'Maintain it');
});
test('Later features are saved on disk outside scope and persist with the roadmap', t => {
  const f = fixture(t), active = approveAll(f);
  const updated = f.store.addLater(active.id, { revision: active.plan.revision, text: 'Add multiplayer practice later' });
  assert.deepEqual(updated.milestones, active.milestones); assert.equal(updated.status, 'active');
  const directory = updated.plan.files.directory;
  assert.match(fs.readFileSync(path.join(directory, 'LATER_FEATURES.md'), 'utf8'), /multiplayer practice later/);
  assert.doesNotMatch(fs.readFileSync(path.join(directory, 'ROADMAP.md'), 'utf8'), /multiplayer/);
  assert.match(fs.readFileSync(path.join(directory, 'PROJECT.md'), 'utf8'), /University students/);
  assert.match(f.store.summary(updated.id), /one focused question|Follow the user-approved scope/);
  assert.match(f.store.summary(updated.id), /explicit user agreement/);
  const completed = f.store.progress(updated.id, { revision: updated.plan.revision, milestone: 0, done: true });
  assert.equal(completed.nextStep, 'Release check');
  assert.match(fs.readFileSync(path.join(directory, 'ROADMAP.md'), 'utf8'), /\[x\] Practice prototype/);
  assert.equal(new Projects(f.root).get(completed.id).plan.laterFeatures.length, 1);
});
test('redirected planning folders cannot write outside the selected project; failures keep the internal plan', t => {
  const f = fixture(t), directory = f.p.plan.files.directory;
  const external = path.join(f.root, 'external'); fs.mkdirSync(external); fs.writeFileSync(path.join(external, 'ROADMAP.md'), 'KEEP');
  const projectsDir = path.dirname(directory);
  assert.ok(projectsDir.startsWith(f.folder + path.sep)); fs.renameSync(projectsDir, projectsDir + '-original');
  fs.symlinkSync(external, projectsDir, process.platform === 'win32' ? 'junction' : 'dir');
  const p = f.store.addLater(f.p.id, { revision: f.p.plan.revision, text: 'An extra idea' });
  assert.match(p.plan.files.error, /regular directory/); assert.equal(p.plan.laterFeatures.length, 1);
  assert.equal(fs.readFileSync(path.join(external, 'ROADMAP.md'), 'utf8'), 'KEEP');
  fs.unlinkSync(projectsDir); fs.renameSync(projectsDir + '-original', projectsDir);
  assert.equal(f.store.syncPlan(p.id).plan.files.error, '');
});
test('discussion prompt is a Codex argument and is never replayed when resuming a chat', async t => {
  const f = fixture(t), launches = [];
  const sessions = new Sessions(f.root, { projects: f.store, nativeCodex: () => 'codex.exe', findProgram: () => process.execPath, prepareCodexSession: async () => ['-c', 'test=true'], pty: { spawn(executable, args) { launches.push(args); return { onData() {}, onExit() {}, write() { assert.fail('No input injection'); }, kill() {} }; } } });
  await sessions.create({ provider: 'codex', cwd: f.folder, projectId: f.p.id, planDiscussion: 'brief' });
  assert.equal(launches[0].at(-2), '--'); assert.match(launches[0].at(-1), /Ask one focused question and wait/);
  await sessions.create({ provider: 'codex', cwd: f.folder, projectId: f.p.id, planDiscussion: 'brief' }, { resumeId: '9c656179-0272-492b-9073-c56e3c091dbb' });
  assert.ok(launches[1].every(x => !x.includes('Ask one focused question')));
});

test('Claude planning prompts survive native, PowerShell and WSL launch arguments without input injection', async t => {
  const f = fixture(t);
  const installs = [{ kind: 'native', path: 'C:\\Programs\\claude.exe' }, { kind: 'native', path: 'C:\\Programs\\claude.cmd' }, { kind: 'wsl', path: '/home/test/.local/bin/claude', distro: 'Ubuntu' }];
  // PowerShell wrappers and WSL exist only on Windows.
  for (const claude of process.platform === 'win32' ? installs : [{ kind: 'native', path: '/opt/claude/bin/claude' }]) {
    const launches = [];
    const sessions = new Sessions(f.root, { projects: f.store, claude, findProgram: () => process.execPath, pty: { spawn(executable, args) { launches.push({ executable, args }); return { onData() {}, onExit() {}, write() { assert.fail('No input injection'); }, kill() {} }; } } });
    await sessions.create({ provider: 'claude', cwd: f.folder, projectId: f.p.id, planDiscussion: 'infrastructure' });
    assert.match(launches[0].args.join(' '), /dock\/project_plan for section infrastructure/);
    if (claude.kind === 'wsl') assert.equal(launches[0].executable, 'wsl.exe');
    await sessions.create({ provider: 'claude', cwd: f.folder, projectId: f.p.id, planDiscussion: 'infrastructure' }, { resumeId: '9c656179-0272-492b-9073-c56e3c091dbb' });
    assert.ok(launches[1].args.every(arg => !arg.includes('Ask one focused question')));
  }
});
