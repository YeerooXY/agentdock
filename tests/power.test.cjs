'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WorkPower } = require('../electron/power.cjs');

function fixture() {
  const active = new Set(), started = [], stopped = [];
  const power = new WorkPower({
    start(type) { const id = started.length; started.push(type); active.add(id); return id; },
    stop(id) { assert.ok(active.delete(id), 'Only release a live request'); stopped.push(id); }
  });
  return { power, active, started, stopped };
}

test('keeps one sleep request until the last working console finishes', () => {
  const { power, active, started } = fixture();
  const a = { alive: true, state: 'open' }, b = { alive: true, state: 'open' };
  const update = () => power.update({ enabled: true, sessions: [a, b] });
  update(); assert.equal(active.size, 0, 'An open console alone must not block sleep');
  a.state = 'active'; update(); assert.deepEqual([...active], [0]);
  b.state = 'active'; update(); update();
  assert.deepEqual(started, ['prevent-app-suspension'], 'Allow the screen to sleep; do not stack requests');
  a.state = 'ready'; update(); assert.equal(active.size, 1);
  b.state = 'attention'; update(); assert.equal(active.size, 0);
  for (const state of ['open', 'ready', 'attention', 'error', 'ended']) {
    a.state = state; b.state = state; update(); assert.equal(active.size, 0);
  }
  a.state = 'active'; a.alive = false; update(); assert.equal(active.size, 0);
  b.state = 'active'; b.dismissed = true; update(); assert.equal(active.size, 0);
});

test('turning the setting off releases immediately and turning it on follows current work', () => {
  const { power, active, stopped } = fixture();
  const sessions = [{ alive: true, state: 'active' }];
  power.update({ enabled: true, sessions });
  power.update({ enabled: false, sessions }); assert.equal(active.size, 0);
  power.update({ enabled: false, sessions }); assert.deepEqual(stopped, [0]);
  power.update({ enabled: true, sessions }); assert.deepEqual([...active], [1]);
  power.dispose(); assert.equal(active.size, 0);
});

test('API work overlaps console work and shutdown prevents reacquiring a request', () => {
  const { power, active, stopped } = fixture();
  power.update({ enabled: true, apiBusy: true }); assert.equal(active.size, 1);
  const sessions = [{ alive: true, state: 'active' }];
  power.update({ enabled: true, sessions, apiBusy: false }); assert.equal(active.size, 1);
  sessions[0].alive = false;
  power.update({ enabled: true, sessions }); assert.equal(active.size, 0);
  power.update({ enabled: true, apiBusy: true }); assert.equal(active.size, 1);
  power.dispose(); power.dispose(); assert.deepEqual(stopped, [0, 1]);
  power.update({ enabled: true, apiBusy: true }); assert.equal(active.size, 0);
});
