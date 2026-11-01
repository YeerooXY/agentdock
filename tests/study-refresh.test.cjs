'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { studyContext, studyContextSnapshot, studyRefresh } = require('../electron/study-context.cjs');
const { SharedHub } = require('../electron/shared.cjs');
const { Workbench } = require('../electron/workbench.cjs');
const { Turns } = require('../electron/turns.cjs');
const { DOCK_TOOLS } = require('../electron/tool-contract.cjs');
const NOW = Date.UTC(2026, 9, 31, 18);

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'study-refresh-'));
  const semesterRoot = path.join(root, 'semester'), folder = path.join(semesterRoot, 'CPP'), profile = path.join(root, 'playtime');
  for (const dir of [folder, profile]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(semesterRoot, 'courses.json'), JSON.stringify({ courses: [
    { id: 'cpp', folder: 'CPP', shortName: 'C++' }, { id: 'other', folder: 'Other', shortName: 'Other' }
  ] }));
  fs.mkdirSync(path.join(semesterRoot, 'Other'));
  const db = new DatabaseSync(path.join(profile, 'ledger.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE meta (key TEXT PRIMARY KEY, body TEXT)');
  const save = notes => db.prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run('study-session-notes', JSON.stringify({ version: 1, notes }));
  const note = (text, extra = {}) => ({ subject: 'C++', startMs: 1000, endMs: 2000, text, ...extra });
  save([note('Private functions')]);
  const timer = { version: 1, observedAtMs: NOW, courseId: 'cpp', subject: 'C++', state: 'running', phase: 'focus', startedAtMs: NOW - 60000, phaseEndsAtMs: NOW + 240000, focusMinutes: 5, breakMinutes: 1 };
  const saveTimer = changes => fs.writeFileSync(path.join(profile, 'study-timer.json'), JSON.stringify({ ...timer, ...changes }));
  saveTimer();
  const session = { id: 'study', provider: 'codex', purpose: 'agent', alive: true, cwd: folder, playtimeDataDir: profile, projectId: null };
  const refresh = (options = {}, owner = session) => studyRefresh(owner, { semesterRoot, now: NOW, ...options });
  t.after(() => { db.close(); assert.equal(path.dirname(fs.realpathSync(root)), parent); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, semesterRoot, folder, profile, db, save, note, session, refresh, saveTimer };
}

test('reflection deltas use each caller revision and include edits, deletions and WAL commits', t => {
  const f = fixture(t), first = f.refresh();
  assert.match(first.reflections.revision, /^[a-f0-9]{64}$/);
  assert.equal(f.refresh({ sinceReflectionRevision: first.reflections.revision }).reflections.unchanged, true);
  f.save([f.note('Const handling')]);
  const changed = f.refresh({ sinceReflectionRevision: first.reflections.revision });
  assert.equal(changed.reflections.recent[0].text, 'Const handling');
  assert.notEqual(changed.reflections.revision, first.reflections.revision);
  assert.equal(f.refresh({ sinceReflectionRevision: changed.reflections.revision }).reflections.unchanged, true);
  // Another caller's read cannot consume this caller's change.
  assert.deepEqual(f.refresh({ sinceReflectionRevision: first.reflections.revision }).reflections, changed.reflections);
  assert.equal(f.refresh().reflections.recent[0].text, 'Const handling');
  f.save([]);
  assert.deepEqual(f.refresh({ sinceReflectionRevision: changed.reflections.revision }).reflections.recent, []);
});

test('unavailable reflection stores never reuse available history or imply an empty fresh start', t => {
  const f = fixture(t), first = f.refresh();
  f.db.prepare('UPDATE meta SET body=?').run('broken');
  const bad = f.refresh({ sinceReflectionRevision: first.reflections.revision });
  assert.equal(bad.reflections.status, 'unavailable');
  assert.notEqual(bad.reflections.revision, first.reflections.revision);
  assert.equal(f.refresh({ sinceReflectionRevision: bad.reflections.revision }).reflections.unchanged, undefined);
  const absent = path.join(f.root, 'absent');
  assert.equal(f.refresh({}, { ...f.session, playtimeDataDir: absent }).reflections.status, 'unavailable');
  assert.equal(fs.existsSync(absent), false);
});

test('reflection revisions are scoped to course and profile; excluded sessions expose no history', t => {
  const f = fixture(t), first = f.refresh();
  f.save([f.note('Private functions'), f.note('OTHER_PRIVATE', { subject: 'Other' })]);
  assert.equal(f.refresh().reflections.revision, first.reflections.revision);
  const other = f.refresh({ sinceReflectionRevision: first.reflections.revision }, { ...f.session, cwd: path.join(f.semesterRoot, 'Other') });
  assert.equal(other.reflections.recent[0].text, 'OTHER_PRIVATE');
  assert.notEqual(other.reflections.revision, first.reflections.revision);
  const secondProfile = path.join(f.root, 'second-profile');
  fs.mkdirSync(secondProfile);
  const second = new DatabaseSync(path.join(secondProfile, 'ledger.sqlite'));
  try {
    second.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, body TEXT)');
    second.prepare('INSERT INTO meta VALUES (?, ?)').run('study-session-notes', JSON.stringify({ version: 1, notes: [f.note('Private functions')] }));
    assert.notEqual(f.refresh({}, { ...f.session, playtimeDataDir: secondProfile }).reflections.revision, first.reflections.revision);
  } finally { second.close(); }
  for (const extra of [{ remote: {} }, { taskId: 'worker' }, { kind: 'web' }, { purpose: 'login' }, { cwd: f.root }]) {
    assert.deepEqual(f.refresh({}, { ...f.session, ...extra }), { status: 'inactive' });
  }
});

test('light refresh preserves fresh, paused, stale, inactive and expired timer states', t => {
  const f = fixture(t), revision = f.refresh().reflections.revision;
  assert.equal(f.refresh({ now: NOW + 1000, sinceReflectionRevision: revision }).timer.remainingMs, 239000);
  f.saveTimer({ state: 'paused', pausedAtMs: NOW - 1000 });
  assert.equal(f.refresh({ now: NOW + 10000, sinceReflectionRevision: revision }).timer.remainingMs, 241000);
  assert.equal(f.refresh({ now: NOW + 15001 }).timer.status, 'stale');
  f.saveTimer({ phaseEndsAtMs: NOW - 1 });
  const expired = f.refresh().timer;
  assert.equal(expired.remainingMs, 0); assert.equal(expired.phase, 'focus');
  f.saveTimer({ courseId: 'other', subject: 'Other' });
  assert.deepEqual(f.refresh().timer, { status: 'inactive' });
  f.saveTimer({ state: 'idle' });
  assert.equal(f.refresh().timer.status, 'idle');
});

test('unlinked lightweight reads create no turn, Git capture, completion, project touch or shared instructions', async t => {
  const f = fixture(t), wb = new Workbench(f.root, {}, { nativeImage: {} }, { getSessions: () => ({ items: new Map([[f.session.id, f.session]]) }), getProject: () => f.folder, onChange() {} });
  wb.turns = new Turns(wb.results, { getSession: () => f.session });
  wb.projects = { touch: () => assert.fail('Read-only refresh touched a project') };
  const hub = new SharedHub(f.root, { list: () => [] }, { workbench: wb }); t.after(() => hub.close());
  hub.studyRefresh = (session, options) => f.refresh(options, session);
  const call = args => hub.invoke('dock_context', { detail: 'study', ...args }, f.session.id);
  const first = JSON.parse((await call({})).content[0].text);
  const compact = (await call({ sinceReflectionRevision: first.reflections.revision })).content[0].text;
  assert.equal(first.courseId, 'cpp'); assert.equal(first.projectId, null);
  assert.equal(wb.turns.active.size, 0); assert.equal(wb.turns.latest.size, 0); assert.equal(wb.turns.queues.size, 0);
  assert.equal(fs.existsSync(wb.completion.dir), false);
  assert.doesNotMatch(compact, /Paddock shared instructions|Private functions|Current turnId/);
  assert.ok(compact.length < 650, compact.length);
  await assert.rejects(call({ sinceReflectionRevision: 'invalid' }), /sinceReflectionRevision/);
  await assert.rejects(hub.invoke('dock_context', { sinceReflectionRevision: first.reflections.revision }, f.session.id), /detail: study/);
  // A concurrent agent's tracked work remains untouched by a study refresh.
  await wb.turns.begin(f.session.id);
  const active = wb.turns.active.get(f.session.id); active.taskIds = ['pending-worker']; active.completionInvalidated = true;
  await call({ sinceReflectionRevision: first.reflections.revision });
  assert.equal(wb.turns.active.get(f.session.id), active);
  assert.deepEqual(active.taskIds, ['pending-worker']); assert.equal(active.completionInvalidated, true);
});

test('startup context and tool schema describe the same study cadence and revision', t => {
  const f = fixture(t), text = studyContext(f.session, { semesterRoot: f.semesterRoot, now: NOW });
  const startup = JSON.parse(text.split('```json\n')[1].split('\n```')[0]);
  assert.equal(startup.reflections.revision, f.refresh().reflections.revision);
  assert.match(text, /Ordinary answers need no context call/);
  assert.doesNotMatch(text, /start of every study turn/);
  const schema = DOCK_TOOLS.find(tool => tool.name === 'dock_context').inputSchema;
  assert.ok(schema.properties.detail.enum.includes('study'));
  assert.equal(schema.properties.sinceReflectionRevision.pattern, '^[a-f0-9]{64}$');
});

test('task snapshots separate stable course instructions from real timer and WAL reflection changes', t => {
  const f = fixture(t), options = { semesterRoot: f.semesterRoot, now: NOW };
  const first = studyContextSnapshot(f.session, options);
  assert.match(first.instructions, /Ordinary answers need no context call/);
  assert.doesNotMatch(first.instructions, /Private functions|"remainingMs"|"observedAt"/);
  assert.equal(first.state.reflections.recent[0].text, 'Private functions');
  assert.equal(first.state.timer.remainingMs, 240000);
  f.save([f.note('Updated reflection')]);
  const second = studyContextSnapshot(f.session, { ...options, now: NOW + 1000 });
  assert.equal(second.instructions, first.instructions);
  assert.equal(second.state.reflections.recent[0].text, 'Updated reflection');
  assert.equal(second.state.timer.remainingMs, 239000);
  const stale = studyContextSnapshot(f.session, { ...options, now: NOW + 15001 });
  assert.equal(stale.state.timer.status, 'stale');
  assert.equal(stale.instructions, first.instructions);
  fs.writeFileSync(path.join(f.folder, 'COURSE.md'), '# Course');
  assert.notEqual(studyContextSnapshot(f.session, options).instructions, first.instructions);
  assert.deepEqual(studyContextSnapshot({ ...f.session, taskId: 'worker' }, options), { instructions: '', state: null });
});
