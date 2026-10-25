'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { updatedSlotTrims, moveSlotTrims } = require('../electron/console-appearance.cjs');
const grid = { columns: 3, rows: 3 };
test('color writes reject invalid styles, out-of-grid slots and stale consoles', () => {
  const current = { 2: 'blue' }, sessions = [{ id: 'one', slot: 1, alive: true }];
  assert.deepEqual(updatedSlotTrims(current, { slot: 1, sessionId: 'one', style: 'redline' }, sessions, grid), { 1: 'redline', 2: 'blue' });
  for (const payload of [{ slot: 0, style: 'blue' }, { slot: 10, style: 'blue' }, { slot: 2, style: 'url(evil)' }, { slot: 1, style: 'blue' }, { slot: 2, sessionId: 'one', style: 'blue' }]) {
    assert.throws(() => updatedSlotTrims(current, payload, sessions, grid));
  }
  assert.deepEqual(updatedSlotTrims(current, { slot: 2, style: 'default' }, sessions, grid), {});
  assert.deepEqual(current, { 2: 'blue' }, 'validation and resetting do not mutate the saved object');
});
test('colors follow console swaps, empty-slot displacement and grid reflow', () => {
  const items = new Map([['a', { slot: 1 }], ['b', { slot: 3 }]]), current = { 1: 'redline', 2: 'blue', 3: 'gamer', 9: 'violet' };
  assert.deepEqual(moveSlotTrims(current, [{ id: 'a', slot: 3 }, { id: 'b', slot: 1 }], items), { 1: 'gamer', 2: 'blue', 3: 'redline', 9: 'violet' });
  assert.deepEqual(moveSlotTrims(current, [{ id: 'a', slot: 2 }], items), { 1: 'blue', 2: 'redline', 3: 'gamer', 9: 'violet' });
  assert.deepEqual(moveSlotTrims(current, [{ id: 'a', slot: 4 }, { id: 'b', slot: 5 }], items), { 2: 'blue', 4: 'redline', 5: 'gamer', 9: 'violet' });
  assert.deepEqual(moveSlotTrims({ 2: 'blue' }, [{ id: 'a', slot: 2 }], items), { 1: 'blue' }, 'an inherited color stays inherited when moving into a customized empty slot');
  assert.deepEqual(current, { 1: 'redline', 2: 'blue', 3: 'gamer', 9: 'violet' });
});
