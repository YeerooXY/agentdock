'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { stopConsole } = require('../electron/console-control.cjs');
test('console controls require owner approval and revalidate launch identity', async () => {
  const item = { id: 'a', launchId: 'launch', projectId: 'project', alive: true, name: 'Test' }, calls = [];
  const sessions = { items: new Map([['a', item]]), write: (...args) => calls.push(args), end: id => calls.push(id) };
  const args = { id: 'a', launchId: 'launch' }, caller = { projectId: 'project' };
  await stopConsole({ sessions, caller, confirm: async () => false }, args); assert.equal(calls.length, 0);
  await stopConsole({ sessions, caller, confirm: async () => true }, args); assert.deepEqual(calls, [['a', '\x03']]);
  await assert.rejects(stopConsole({ sessions, caller, confirm: async () => { item.launchId = 'new'; return true; } }, args), /changed/);
  assert.equal(calls.length, 1);
  await assert.rejects(stopConsole({ sessions, caller: { projectId: 'elsewhere' }, confirm: async () => true }, { ...args, launchId: 'new' }), /this project/);
});
