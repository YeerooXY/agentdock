'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MAX_AGE_MS = 15000;
const MAX_DATE_MS = 8640000000000000;
const timestamp = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_DATE_MS;
const iso = value => new Date(value).toISOString();

// Playtime owns this atomic snapshot. Reading it never changes timer state.
function readStudyTimer(directory, course, now = Date.now()) {
  if (!directory || !timestamp(now)) return { status: 'unavailable' };
  let file;
  try {
    file = fs.openSync(path.join(directory, 'study-timer.json'), 'r');
    const info = fs.fstatSync(file);
    if (!info.isFile() || info.size > 16384) return { status: 'unavailable' };
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || value.version !== 1 || !timestamp(value.observedAtMs) ||
        value.observedAtMs > now + 2000 || !['running', 'paused', 'idle'].includes(value.state)) {
      return { status: 'unavailable' };
    }
    // Do not reveal another course's labels, dates or remaining time.
    if (value.state !== 'idle' && (value.courseId !== course.id || value.subject !== course.name)) {
      return { status: 'inactive' };
    }
    if (now - value.observedAtMs > MAX_AGE_MS) {
      return { status: 'stale', observedAt: iso(value.observedAtMs) };
    }
    if (value.state === 'idle') return { status: 'idle', observedAt: iso(value.observedAtMs) };
    if (!['focus', 'break'].includes(value.phase) || !timestamp(value.startedAtMs) ||
        !timestamp(value.phaseEndsAtMs) || value.startedAtMs > value.phaseEndsAtMs ||
        !Number.isInteger(value.focusMinutes) || value.focusMinutes < 5 || value.focusMinutes > 180 ||
        !Number.isInteger(value.breakMinutes) || value.breakMinutes < 1 || value.breakMinutes > 60) {
      return { status: 'unavailable' };
    }
    const durationMs = (value.phase === 'focus' ? value.focusMinutes : value.breakMinutes) * 60000;
    const reference = value.state === 'paused' ? value.pausedAtMs : now;
    if (!timestamp(reference) || (value.state === 'paused' &&
        (reference < value.startedAtMs || reference > value.observedAtMs + 2000))) {
      return { status: 'unavailable' };
    }
    const remainingMs = Math.max(0, value.phaseEndsAtMs - reference);
    if (remainingMs > durationMs + 2000) return { status: 'unavailable' };
    return {
      status: 'available', state: value.state, phase: value.phase,
      observedAt: iso(value.observedAtMs), readAt: iso(now),
      startedAt: iso(value.startedAtMs), phaseEndsAt: iso(value.phaseEndsAtMs),
      ...(value.state === 'paused' ? { pausedAt: iso(reference) } : {}),
      durationMs, remainingMs
    };
  } catch { return { status: 'unavailable' }; }
  finally { if (file !== undefined) fs.closeSync(file); }
}

module.exports = { readStudyTimer, MAX_AGE_MS };
