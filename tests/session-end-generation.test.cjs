'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { endSession } = require('../electron/session-end.cjs');

function fixture() {
  const target = { id: 'a', launchId: 'launch-a', slot: 2, name: 'First console', alive: true };
  const items = [target], ended = [];
  let settings = { confirmConsoleEnd: true, slotNames: { 2: 'First console' } };
  const hooks = { confirm: () => {}, stop: () => {} };
  const options = {
    sessions: {
      // Production returns snapshots, not its mutable session objects.
      list: () => items.map(item => ({ ...item })),
      end: async id => { ended.push(id); target.alive = false; target.dismissed = true; delete target.restoreError; await hooks.stop(); }
    },
    getSettings: () => settings,
    persistSettings: next => { settings = next; },
    dialog: { showMessageBox: async () => { await hooks.confirm(); return { response: 1 }; } },
    window: {}, testMode: false
  };
  return { target, items, ended, hooks, options, settings: () => settings };
}

test('a dismissed console is unavailable even while its process exit is pending', async () => {
  const f = fixture(); f.target.dismissed = true;
  let prompted = false; f.hooks.confirm = () => { prompted = true; };
  await assert.rejects(endSession('a', f.options), /Console not found/);
  assert.equal(prompted, false); assert.deepEqual(f.ended, []);
  assert.equal(f.settings().slotNames[2], 'First console');
});

test('an old confirmation does not stop a newly launched process in the same console', async () => {
  const f = fixture();
  f.hooks.confirm = () => { f.target.launchId = 'launch-b'; };
  assert.equal(await endSession('a', f.options), false);
  assert.deepEqual(f.ended, []); assert.equal(f.target.alive, true);
  assert.equal(f.settings().slotNames[2], 'First console');
});

test('removing saved details does not stop a process that opened during confirmation', async () => {
  const f = fixture(); f.target.alive = false; f.target.restoreError = 'Folder unavailable'; delete f.target.launchId;
  f.hooks.confirm = () => { f.target.alive = true; f.target.launchId = 'launch-b'; delete f.target.restoreError; };
  assert.equal(await endSession('a', f.options), false);
  assert.deepEqual(f.ended, []); assert.equal(f.target.alive, true);
});

test('a replacement launch keeps its slot name when the earlier stop finishes', async () => {
  const f = fixture();
  f.hooks.stop = () => {
    f.items[0] = { ...f.target, launchId: 'launch-b', alive: true, dismissed: false };
  };
  assert.equal(await endSession('a', f.options), true);
  assert.deepEqual(f.ended, ['a']);
  assert.equal(f.settings().slotNames[2], 'First console');
});

test('a console moved during an asynchronous stop frees its final slot only', async () => {
  const f = fixture();
  f.hooks.stop = () => {
    f.target.slot = 4;
    f.items.push({ id: 'b', launchId: 'launch-b', slot: 2, name: 'Replacement', alive: true });
    f.settings().slotNames = { 2: 'Replacement', 4: 'First console' };
  };
  assert.equal(await endSession('a', f.options), true);
  assert.deepEqual(f.ended, ['a']);
  assert.deepEqual(f.settings().slotNames, { 2: 'Replacement' });
});
