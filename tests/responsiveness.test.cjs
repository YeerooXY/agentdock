'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { Responsiveness } = require('../electron/responsiveness.cjs');
test('stall logging distinguishes main-loop and terminal delays without input contents', () => {
  let now = 0, sample, canceled = false; const lines = [];
  const monitor = new Responsiveness({ now: () => now, log: line => lines.push(line), schedule: fn => { sample = fn; return {}; }, cancel: () => { canceled = true; } });
  now = 1000; sample(); assert.equal(lines.length, 0);
  now = 3000; sample(); assert.match(lines[0], /main-loop stalled 1000 ms/);
  monitor.report({ kind: 'terminal-write', durationMs: 650, data: 'PRIVATE INPUT' });
  monitor.report({ kind: 'terminal-write', durationMs: 900 });
  monitor.report({ kind: 'arbitrary text', durationMs: 999 });
  assert.equal(lines.length, 2); assert.doesNotMatch(lines.join(''), /PRIVATE|arbitrary/);
  monitor.dispose(); assert.equal(canceled, true);
});
