'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readStudyTimer, MAX_AGE_MS } = require('../electron/study-timer.cjs');
const { studyContext } = require('../electron/study-context.cjs');
const NOW = Date.UTC(2026, 9, 31, 17);
const course = { id: 'cpp_koschek', name: 'C++ · labor' };

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'study-timer-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const file = path.join(directory, 'study-timer.json');
  const value = {
    version: 1, observedAtMs: NOW, courseId: course.id, subject: course.name,
    state: 'running', phase: 'focus', startedAtMs: NOW - 60000,
    phaseEndsAtMs: NOW + 240000, pausedAtMs: null, focusMinutes: 5, breakMinutes: 1
  };
  const save = changes => fs.writeFileSync(file, JSON.stringify({ ...value, ...changes }));
  save();
  return { directory, file, value, save };
}

test('live countdown advances between reads without changing the snapshot', t => {
  const f = fixture(t), bytes = fs.readFileSync(f.file);
  const first = readStudyTimer(f.directory, course, NOW);
  assert.equal(first.status, 'available');
  assert.equal(first.remainingMs, 240000);
  assert.equal(first.durationMs, 300000);
  assert.equal(first.phase, 'focus');
  assert.equal(readStudyTimer(f.directory, course, NOW + 5000).remainingMs, 235000);
  assert.deepEqual(fs.readFileSync(f.file), bytes);
});

test('paused time is frozen and resumes from a new phase deadline', t => {
  const f = fixture(t);
  f.save({ state: 'paused', pausedAtMs: NOW - 1000 });
  assert.equal(readStudyTimer(f.directory, course, NOW).remainingMs, 241000);
  assert.equal(readStudyTimer(f.directory, course, NOW + 10000).remainingMs, 241000);
  f.save({ observedAtMs: NOW + 10000, phaseEndsAtMs: NOW + 251000 });
  assert.equal(readStudyTimer(f.directory, course, NOW + 10000).remainingMs, 241000);
});

test('break, idle and expired boundaries remain distinct', t => {
  const f = fixture(t);
  f.save({ phase: 'break', phaseEndsAtMs: NOW + 30000 });
  const state = readStudyTimer(f.directory, course, NOW);
  assert.equal(state.phase, 'break');
  assert.equal(state.durationMs, 60000);
  assert.equal(state.remainingMs, 30000);
  f.save({ phaseEndsAtMs: NOW - 1 });
  assert.equal(readStudyTimer(f.directory, course, NOW).remainingMs, 0);
  assert.equal(readStudyTimer(f.directory, course, NOW).phase, 'focus');
  f.save({ state: 'idle', phase: null, courseId: null, subject: null });
  assert.deepEqual(readStudyTimer(f.directory, course, NOW), { status: 'idle', observedAt: new Date(NOW).toISOString() });
});

test('stale, missing and malformed snapshots never invent a countdown', t => {
  const f = fixture(t);
  assert.equal(readStudyTimer(f.directory, course, NOW + MAX_AGE_MS + 1).status, 'stale');
  for (const changes of [{ version: 2 }, { observedAtMs: NOW + 3000 }, { phase: 'unknown' },
    { phaseEndsAtMs: null }, { startedAtMs: -1 }, { state: 'paused', pausedAtMs: null },
    { focusMinutes: 500 }, { phaseEndsAtMs: NOW + 99999999 }]) {
    f.save(changes);
    assert.deepEqual(readStudyTimer(f.directory, course, NOW), { status: 'unavailable' });
  }
  fs.writeFileSync(f.file, 'x'.repeat(16385));
  assert.deepEqual(readStudyTimer(f.directory, course, NOW), { status: 'unavailable' });
  fs.unlinkSync(f.file);
  assert.deepEqual(readStudyTimer(f.directory, course, NOW), { status: 'unavailable' });
  assert.equal(fs.existsSync(f.file), false);
});

test('other courses and profiles cannot expose an active timer', t => {
  const f = fixture(t);
  const result = readStudyTimer(f.directory, { id: 'other', name: 'Other course' }, NOW);
  assert.deepEqual(result, { status: 'inactive' });
  assert.deepEqual(readStudyTimer(path.join(f.directory, 'absent'), course, NOW), { status: 'unavailable' });
});

test('existing study consoles get fresh timer data in their normal context', t => {
  const f = fixture(t), root = path.join(f.directory, 'semester');
  const folder = path.join(root, 'CPP');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(root, 'courses.json'), JSON.stringify({ courses: [{ ...course, shortName: course.name, folder: 'CPP' }] }));
  const session = { cwd: folder, playtimeDataDir: f.directory, purpose: 'agent' };
  const data = now => JSON.parse(studyContext(session, { semesterRoot: root, now }).split('```json\n')[1].split('\n```')[0]);
  assert.equal(data(NOW).timer.remainingMs, 240000);
  assert.equal(data(NOW + 1000).timer.remainingMs, 239000);
  assert.equal(studyContext({ ...session, taskId: 'worker' }, { semesterRoot: root, now: NOW }), '');
});
