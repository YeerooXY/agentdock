'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { courseFromArgs, profileFromArgs, openCourseConsole } = require('../electron/course-launch.cjs');

test('resolve only a registered course ID to its folder', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-course-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'Mobile'));
  fs.writeFileSync(path.join(root, 'courses.json'), JSON.stringify({ courses: [{ id: 'mobile', folder: 'Mobile', name: 'Mobile' }, { id: 'bad', folder: '../outside' }] }));
  assert.deepEqual(courseFromArgs(['--study-course=mobile'], root), { folder: path.join(root, 'Mobile'), name: 'Mobile' });
  assert.equal(courseFromArgs(['--study-course=bad'], root), null);
  assert.equal(courseFromArgs(['--study-course=../../outside'], root), null);
  assert.equal(courseFromArgs(['--study-course=mobile', '--study-course=mobile'], root), null);
});

test('Playtime profile arguments preserve spaces and reject relative or duplicate paths', () => {
  const directory = path.join(os.tmpdir(), 'Playtime study profile');
  assert.equal(profileFromArgs([`--study-data-dir=${directory}`]), directory);
  assert.throws(() => profileFromArgs(['--study-data-dir=../other']), /absolute path/);
  assert.throws(() => profileFromArgs([`--study-data-dir=${directory}`, `--study-data-dir=${directory}`]), /one Playtime/);
});

test('course launch reuses its own console and refreshes context without submitting input', async () => {
  const directory = path.join(os.tmpdir(), 'playtime-profile'), folder = path.join(os.tmpdir(), 'Course');
  const items = [], created = [], refreshed = [];
  const sessions = { list: () => items, refreshContextFile: item => refreshed.push(item.id),
    create: async raw => { created.push(raw); const item = { ...raw, id: String(items.length), alive: true }; items.push(item); return item; } };
  const course = { name: 'Architecture', folder };
  const options = { sessions, defaults: { provider: 'codex', nameMode: 'folder' }, permissions: 'default', dataDirectory: directory };
  const first = await openCourseConsole(course, options);
  assert.equal(created[0].nameMode, 'custom');
  assert.equal(created[0].playtimeDataDir, directory);
  assert.equal((await openCourseConsole(course, options)).id, first.id);
  assert.deepEqual(refreshed, [first.id]);
  assert.equal(created.length, 1);
  await openCourseConsole(course, { ...options, dataDirectory: path.join(os.tmpdir(), 'different-profile') });
  assert.equal(created.length, 2, 'separate profiles must not share reflections');
});

test('custom subjects get stable separate folders, study context and reuse without a semester catalogue', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-custom-study-'));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }); });
  const args = ['--study-subject=Soft Skills', `--study-data-dir=${root}`];
  const course = courseFromArgs(args, path.join(root, 'missing-semester'));
  assert.equal(course.name, 'Soft Skills'); assert.equal(path.dirname(course.folder), path.join(root, 'subjects'));
  assert.deepEqual(courseFromArgs(args, root), course);
  const { studyCourse, studyContext } = require('../electron/study-context.cjs');
  const session = { cwd: course.folder, provider: 'codex', playtimeDataDir: root };
  assert.equal(studyCourse(session).id, null);
  assert.match(studyContext(session), /This is a custom subject/);
  assert.match(studyContext(session), /Soft Skills/);
  assert.equal(studyCourse({ ...session, playtimeDataDir: path.join(root, 'other-profile') }), null);
  assert.equal(courseFromArgs([...args, '--study-course=archi'], root), null);
  assert.throws(() => courseFromArgs(['--study-subject=bad\nname', `--study-data-dir=${root}`], root), /Choose a subject/);
  const hostile = courseFromArgs(['--study-subject=../../outside', `--study-data-dir=${root}`], root);
  assert.equal(path.dirname(hostile.folder), path.join(root, 'subjects'), 'labels never become paths');
});
