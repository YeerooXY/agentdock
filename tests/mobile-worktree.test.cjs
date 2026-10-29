'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocket } = require('ws');
const { MobileCompanion } = require('../electron/mobile.cjs');
const { endMobileSession } = require('../electron/session-end.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-worktree-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sub = path.join(root, 'sub'); fs.mkdirSync(sub);
  const project = { id: 'p', name: 'Project', folders: [{ path: root }, { path: sub }] };
  const sessions = { items: new Map(), projects: { get: id => id === 'p' ? project : null, list: () => [project] }, create: async options => ({ id: 'new', options }) };
  const worktrees = { repository: async folder => folder === root || folder === sub ? fs.realpathSync.native(root) : null,
    create: async (folder, name) => ({ repository: root, path: path.join(root, 'tree'), branch: 'paddock/test-123', base: 'a'.repeat(40), cwd: path.join(root, 'tree'), name, folder }),
    status: async () => ({ dirty: false, ahead: 1 }) };
  const m = Object.create(MobileCompanion.prototype);
  Object.assign(m, { sessions, worktrees, getDefaults: () => ({ cwd: root }), endMobileSession: async () => true, clients: new Set(), private: { devices: [] } });
  const device = {}, client = { ws: { readyState: WebSocket.OPEN }, device, selected: '' };
  m.clients.add(client); m.private.devices.push(device);
  return { m, client, sessions, worktrees, root, sub };
}

test('worktree RPC accepts saved repository roots and delegates creation', async t => {
  const f = fixture(t), call = (method, payload) => f.m.call(f.client, method, payload);
  assert.deepEqual(await call('console.worktree.root', {}), { root: true });
  assert.deepEqual(await call('console.worktree.root', { projectId: 'p', folderIndex: 1 }), { root: false });
  await assert.rejects(call('console.worktree.root', { path: '/outside' }), /saved project folder/);
  await assert.rejects(call('console.create', { worktree: true, cwd: '/outside' }), /saved project folder/);
  await assert.rejects(call('console.create', { worktree: true, projectId: 'p', folderIndex: 1 }), /repository root/);
  await assert.rejects(call('console.create', { worktree: 'yes' }), /Invalid/);
  const result = await call('console.create', { worktree: true, projectId: 'p' });
  assert.equal(result.options.cwd, path.join(f.root, 'tree'));
  assert.equal(result.options.worktree.branch, 'paddock/test-123');
  f.worktrees.create = async () => { throw new Error('Make a first commit in this repository before opening a worktree.'); };
  await assert.rejects(call('console.create', { worktree: true }), /Make a first commit/);
});

test('worktree close requires a current launch and an explicit choice', async t => {
  const f = fixture(t), call = (method, payload) => f.m.call(f.client, method, payload);
  const tree = { path: '/tree', branch: 'paddock/test', repository: '/repo', base: 'a'.repeat(40) };
  f.sessions.items.set('s', { id: 's', alive: true, launchId: 'one', worktree: tree }); f.client.selected = 's';
  assert.deepEqual(await call('console.worktree.status', { id: 's', launchId: 'one' }), { dirty: false, ahead: 1 });
  await assert.rejects(call('console.close', { id: 's', confirm: true }), /Choose how/);
  await assert.rejects(call('console.close', { id: 's', confirm: true, launchId: 'old', worktree: 'remove' }), /Choose how/);
  let selected; f.m.endMobileSession = async (id, choice, valid) => { selected = [id, choice, valid()]; return true; };
  await call('console.close', { id: 's', confirm: true, launchId: 'one', worktree: 'keep' });
  assert.deepEqual(selected, ['s', 'keep', true]);
});

test('phone close uses desktop checks and refuses dirty or unavailable removal', async () => {
  for (const [dirty, choice] of [[false, 'remove'], [true, 'remove'], [true, 'keep'], [null, 'remove']]) {
    const item = { id: 's', slot: 1, name: 'Console', alive: true, launchId: 'one', worktree: { path: '/tree', branch: 'paddock/test' } };
    const order = [];
    const options = { sessions: { list: () => [{ ...item }], end: async () => { order.push('end'); item.alive = false; } },
      getSettings: () => ({ confirmConsoleEnd: false }), persistSettings: () => {},
      worktrees: { status: async () => { if (dirty === null) throw new Error('Unavailable'); return { dirty, ahead: 0 }; }, remove: async () => order.push('remove') } };
    if (choice === 'remove' && dirty !== false) {
      await assert.rejects(endMobileSession('s', choice, () => true, options), /kept/);
      assert.deepEqual(order, []);
    } else {
      assert.equal(await endMobileSession('s', choice, () => true, options), true);
      assert.deepEqual(order, choice === 'remove' ? ['end', 'remove'] : ['end']);
    }
  }
});

test('published worktree identity excludes internal metadata', t => {
  const f = fixture(t);
  f.sessions.list = () => [{ id: 'desktop', name: 'Desktop', provider: 'shell', worktree: {
    branch: 'paddock/test', path: '/data/tree', repository: '/repo', base: 'secret-base', token: 'secret-token',
  } }];
  f.m.config = { host: 'host', port: 1 }; f.m.results = { unreadGroups: () => [], list: () => [] };
  f.m.liveAlerts = [];
  const session = f.m.publicState().sessions[0];
  assert.deepEqual(session.worktree, { branch: 'paddock/test', path: '/data/tree' });
  assert.doesNotMatch(JSON.stringify(session), /secret|repository/);
});
