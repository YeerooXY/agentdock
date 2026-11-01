'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { playtimeDirectory, samePath } = require('./study-context.cjs');
const { createSubject } = require('./study-subject.cjs');

// Accept only course IDs from the local semester's own catalog; never accept a path from a caller.
function courseFromArgs(args, semesterRoot) {
  const options = args.filter(arg => typeof arg === 'string' && arg.startsWith('--study-course='));
  const subjects = args.filter(arg => typeof arg === 'string' && arg.startsWith('--study-subject='));
  if (subjects.length) return subjects.length === 1 && options.length === 0
    ? createSubject(profileFromArgs(args), subjects[0].slice('--study-subject='.length)) : null;
  if (options.length !== 1) return null;
  const id = options[0].slice('--study-course='.length);
  if (!/^[a-z0-9_]{1,40}$/.test(id)) return null;
  const catalog = JSON.parse(fs.readFileSync(path.join(semesterRoot, 'courses.json'), 'utf8'));
  const course = catalog.courses?.find(item => item.id === id);
  if (!course || !/^[A-Za-z0-9_-]+$/.test(course.folder)) return null;
  const folder = path.join(semesterRoot, course.folder);
  if (!fs.statSync(folder).isDirectory()) return null;
  return { folder, name: course.shortName || course.name };
}

function profileFromArgs(args) {
  const options = args.filter(arg => typeof arg === 'string' && arg.startsWith('--study-data-dir='));
  if (options.length > 1) throw new Error('Use one Playtime data folder.');
  return playtimeDirectory(options.length ? options[0].slice('--study-data-dir='.length) : undefined);
}

async function openCourseConsole(course, { sessions, defaults, permissions, dataDirectory }) {
  const profile = playtimeDirectory(dataDirectory);
  let item = sessions.list().find(session => session.alive && !session.kind && !session.remote && !session.taskId &&
    (!session.purpose || session.purpose === 'agent') && session.name === course.name &&
    samePath(path.resolve(session.cwd || '.'), path.resolve(course.folder)) &&
    (profile ? samePath(playtimeDirectory(session.playtimeDataDir) || '', profile) : playtimeDirectory(session.playtimeDataDir) === null));
  if (!item) item = await sessions.create({ ...defaults, cwd: course.folder, name: course.name, nameMode: 'custom',
    projectId: null, permissions, ...(profile ? { playtimeDataDir: profile } : {}) });
  else sessions.refreshContextFile(item);
  return item;
}

module.exports = { courseFromArgs, profileFromArgs, openCourseConsole };
