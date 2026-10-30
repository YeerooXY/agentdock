'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WorkerPlacement, consoleCapabilities } = require('../electron/worker-placement.cjs');
const make = (main = [], grid = { columns: 2, rows: 2 }) => {
  const protectedKeys = new Set();
  const placement = new WorkerPlacement({ grid: () => grid, mainItems: () => main, protectedConsole: key => protectedKeys.has(key) });
  const panel = (key, projectId = 'a') => ({ consoleKey: key, launchId: `${key}-launch`, taskId: 'task', projectId });
  const add = (key, projectId) => { const p = panel(key, projectId); placement.reserve(p); return placement.commit(p.consoleKey, p.launchId); };
  return { placement, protectedKeys, panel, add };
};
test('vacant slots and project pages leave grid and existing rectangles unchanged', () => {
  const main = [{ id: 'owner', slot: 1, width: 2, height: 1, alive: true }], original = structuredClone(main);
  const f = make(main); f.placement.selectPage('project:a');
  assert.deepEqual([f.add('a').page, f.add('b').slot, f.add('c').page], ['main', 4, 'project:a']);
  assert.deepEqual(main, original); assert.equal(f.placement.selectedPage, 'project:a');
  assert.equal(f.add('d', 'b').page, 'project:b'); assert.equal(f.add('e').page, 'hidden');
});
test('reservation revalidates occupancy and cap without displacing an owner', () => {
  const main = [], f = make(main); const reserved = f.placement.reserve(f.panel('a'));
  main.push({ id: 'owner', slot: reserved.slot, alive: true });
  assert.equal(f.placement.commit('a', 'a-launch').page, 'hidden');
  assert.equal(main[0].slot, reserved.slot);
  assert.throws(() => f.placement.commit('a', 'a-launch'), /changed/);
});
test('promotion releases cap; lowering cap hides only untouched workers', () => {
  const f = make(); f.placement.setCap(6);
  for (let i = 0; i < 6; i++) f.add(String(i));
  f.protectedKeys.add('5'); f.placement.setCap(4);
  assert.notEqual(f.placement.snapshot().find(p => p.consoleKey === '5').page, 'hidden');
  assert.equal(f.placement.snapshot().filter(p => p.page !== 'hidden').length, 5);
  assert.throws(() => f.placement.hide('5', '5-launch'), /Release/);
  assert.throws(() => f.placement.setCap(3), /4 to 6/);
});
test('mobile capabilities identify workers without advertising unsupported worker actions', () => {
  const owners = { records: new Map([['key', { ownerManaged: true }]]) };
  assert.deepEqual(consoleCapabilities({ taskId: 'task', consoleKey: 'key' }, owners), { worker: true, ownerManaged: true, close: false, switch: false, setup: false, manage: false, queue: false });
  assert.equal(consoleCapabilities({}, owners).close, true);
});

test('an owner interaction wins a placement race', () => {
  const main = [], f = make(main), reservation = f.placement.reserve(f.panel('a'));
  f.protectedKeys.add('a'); main.push({ id: 'owner', slot: reservation.slot, alive: true });
  assert.throws(() => f.placement.commit('a', 'a-launch'), /protected worker/);
  assert.equal(f.placement.snapshot().length, 0);
  assert.equal(f.placement.reservations.get('a').slot, reservation.slot);
  f.placement.cancel('a', 'old-launch');
  assert.throws(() => f.placement.reserve(f.panel('a')), /new worker/);
  f.placement.cancel('a', 'a-launch');
  assert.equal(f.placement.reserve(f.panel('a')).consoleKey, 'a');
});

test('automatic placement never invokes grid replanning', t => {
  const layout = require('../electron/console-layout.cjs');
  const spy = t.mock.method(layout, 'planGrid', () => { throw new Error('Unexpected grid replanning'); });
  const filename = require.resolve('../electron/worker-placement.cjs');
  delete require.cache[filename];
  const { WorkerPlacement: Placement } = require(filename);
  const p = new Placement({ grid: () => ({ columns: 2, rows: 2 }), mainItems: () => [], protectedConsole: () => false });
  for (let i = 0; i < 5; i++) {
    const key = String(i), launchId = key + '-launch';
    p.reserve({ consoleKey: key, launchId, taskId: 't', projectId: 'p' }); p.commit(key, launchId);
  }
  assert.equal(spy.mock.callCount(), 0);
  delete require.cache[filename];
});

test('mobile state exposes per-console worker and owner capabilities', () => {
  const { MobileCompanion } = require('../electron/mobile.cjs');
  const sessions = { grid: { columns: 2, rows: 2 }, ownerConsoles: { records: new Map([['worker', { ownerManaged: true }]]) },
    list: () => [{ id: '1', consoleKey: 'worker', taskId: 'task' }, { id: '2', consoleKey: 'owner' }] };
  const state = MobileCompanion.prototype.publicState.call({ config: { host: '127.0.0.1', port: 1 }, name: 'Test', sessions,
    results: { unreadGroups: () => [], list: () => [] }, liveAlerts: [] });
  assert.deepEqual(state.sessions[0].consoleCapabilities, { worker: true, ownerManaged: true, close: false, switch: false, setup: false, manage: false, queue: false });
  assert.equal(state.sessions[1].consoleCapabilities.close, true);
});

test('owner layout actions can swap and resize protected consoles', t => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { Sessions } = require('../electron/sessions.cjs');
  const { OwnerConsoles } = require('../electron/owner-consoles.cjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-placement-'));
  const owners = new OwnerConsoles(root);
  t.after(() => { owners.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
  const sessions = new Sessions(root, { pty: {}, grid: { columns: 2, rows: 2 } });
  sessions.items.set('one', { id: 'one', consoleKey: 'one', launchId: 'one-launch', alive: true, slot: 1 });
  sessions.items.set('owner', { id: 'owner', consoleKey: 'owner', launchId: 'owner-launch', alive: true, slot: 2 });
  const unbind = owners.bind(sessions); t.after(unbind);
  assert.equal(owners.isProtected('owner'), true);
  assert.equal(sessions.previewLayout({ id: 'one', slot: 2 }).find(p => p.id === 'owner').slot, 1);
  sessions.move('one', 2);
  assert.equal(sessions.items.get('owner').slot, 1);
  sessions.layout({ id: 'one', slot: 1, width: 2, height: 1 });
  assert.equal(sessions.items.get('one').width, 2);
  assert.equal(sessions.items.get('owner').slot, 3);
});
