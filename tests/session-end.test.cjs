'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { endSession } = require('../electron/session-end.cjs');

function fixture({ confirmConsoleEnd, response = 1, restoreError = null } = {}) {
  const item = { id: 'console-a', slot: 2, name: 'Trader', alive: !restoreError, restoreError };
  let settings = { slotNames: { 2: 'Trader' }, ...(confirmConsoleEnd === undefined ? {} : { confirmConsoleEnd }) };
  const calls = { dialogs: [], ended: [], saved: [] };
  const options = {
    sessions: { list: () => [{ ...item }], end: async id => { calls.ended.push(id); item.alive = false; } },
    getSettings: () => settings,
    persistSettings: next => { settings = next; calls.saved.push(next); },
    dialog: { showMessageBox: async (_window, config) => { calls.dialogs.push(config); return { response }; } },
    window: {},
    testMode: false
  };
  return { item, calls, options, settings: () => settings, setSettings: value => { settings = value; } };
}

test('default-on console ending asks before stopping and frees its slot name after confirmation', async () => {
  const f = fixture();
  assert.equal(await endSession('console-a', f.options), true);
  assert.equal(f.calls.dialogs.length, 1);
  assert.deepEqual(f.calls.dialogs[0].buttons, ['Keep running', 'End console']);
  assert.deepEqual(f.calls.ended, ['console-a']);
  assert.equal(f.settings().slotNames[2], undefined);
});

test('canceling console end leaves the console and saved slot name unchanged', async () => {
  const f = fixture({ response: 0 });
  assert.equal(await endSession('console-a', f.options), false);
  assert.equal(f.calls.dialogs.length, 1);
  assert.deepEqual(f.calls.ended, []);
  assert.equal(f.settings().slotNames[2], 'Trader');
  assert.deepEqual(f.calls.saved, []);
});

test('turning off confirmation ends directly without opening a dialog', async () => {
  const f = fixture({ confirmConsoleEnd: false });
  assert.equal(await endSession('console-a', f.options), true);
  assert.deepEqual(f.calls.dialogs, []);
  assert.deepEqual(f.calls.ended, ['console-a']);
  assert.equal(f.settings().slotNames[2], undefined);
});

test('a restore error is removed with a saved-console confirmation label', async () => {
  const f = fixture({ restoreError: 'Folder is missing.' });
  assert.equal(await endSession('console-a', f.options), true);
  assert.deepEqual(f.calls.dialogs[0].buttons, ['Keep saved console', 'Remove saved console']);
  assert.equal(f.calls.dialogs[0].detail, 'This removes the saved console details. No process is running.');
});

test('an ended stale ID cannot be ended again', async () => {
  const f = fixture(); f.item.alive = false;
  await assert.rejects(endSession('console-a', f.options), /Console not found/);
  assert.deepEqual(f.calls.dialogs, []);
  assert.deepEqual(f.calls.ended, []);
});

test('confirmation rechecks a moved console and preserves the replacement slot name', async () => {
  const f = fixture();
  let decide;
  f.options.dialog.showMessageBox = async (_window, config) => {
    f.calls.dialogs.push(config);
    return new Promise(resolve => { decide = resolve; });
  };
  f.setSettings({ slotNames: { 2: 'Replacement', 3: 'Trader' }, confirmConsoleEnd: true });
  const ending = endSession('console-a', f.options);
  await Promise.resolve();
  f.item.slot = 3;
  const replacement = { id: 'console-b', slot: 2, alive: true, name: 'Replacement' };
  f.options.sessions.list = () => [f.item, replacement].map(item => ({ ...item }));
  decide({ response: 1 });
  assert.equal(await ending, true);
  assert.deepEqual(f.calls.ended, ['console-a']);
  assert.equal(f.settings().slotNames[2], 'Replacement');
  assert.equal(f.settings().slotNames[3], undefined);
});

test('a target ended while its confirmation is open cannot stop a replacement', async () => {
  const f = fixture();
  let decide;
  f.options.dialog.showMessageBox = async (_window, config) => {
    f.calls.dialogs.push(config);
    return new Promise(resolve => { decide = resolve; });
  };
  const ending = endSession('console-a', f.options);
  await Promise.resolve();
  f.item.alive = false;
  const replacement = { id: 'console-b', slot: 2, alive: true, name: 'Replacement' };
  f.options.sessions.list = () => [f.item, replacement].map(item => ({ ...item }));
  decide({ response: 1 });
  assert.equal(await ending, false);
  assert.deepEqual(f.calls.ended, []);
  assert.equal(f.settings().slotNames[2], 'Trader');
  assert.deepEqual(f.calls.saved, []);
});

test('a clean worktree can be removed after its console stops; one with changes is kept', async () => {
  const worktree = { repository: '/repo', path: '/data/worktrees/repo/header-abc123', branch: 'paddock/header-abc123', base: 'a'.repeat(40) };
  for (const [dirty, response, removed] of [[false, 2, true], [false, 1, false], [true, 1, false]]) {
    const f = fixture({ response }), order = [];
    f.item.worktree = worktree;
    f.options.sessions.end = async id => { order.push('end'); f.calls.ended.push(id); f.item.alive = false; };
    f.options.worktrees = { status: async () => ({ dirty, ahead: 2 }), remove: async value => { order.push('remove'); assert.equal(value, worktree); } };
    assert.equal(await endSession('console-a', f.options), true);
    const { buttons, detail } = f.calls.dialogs[0];
    assert.deepEqual(buttons, dirty ? ['Keep running', 'End console'] : ['Keep running', 'End console', 'End and remove worktree']);
    assert.match(detail, dirty ? /uncommitted changes, so Paddock keeps it/ : /keeps the branch paddock\/header-abc123 and its 2 commits/);
    assert.deepEqual(order, removed ? ['end', 'remove'] : ['end'], 'removal happens only after the process stops');
  }
});
