'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DockNotifications } = require('../electron/notifications.cjs');

test('a retained toast click restores Paddock before opening its console', async () => {
  class Notice extends EventEmitter { static isSupported() { return true; } show() {} close() { this.emit('close'); } }
  const events = [], window = { isDestroyed: () => false, webContents: { send: (...args) => events.push(args) } };
  const center = new DockNotifications({ Notification: Notice, getWindow: () => window, getTray: () => null, getSessions: () => [{ id: 'console-a' }], getMode: () => 'hud', reveal: () => events.push('reveal'), publish: () => events.push('state'), setMode: async value => { await Promise.resolve(); events.push(value); } });
  const item = { id: 'notice-a', sessionId: 'console-a', title: 'Trader needs you', kind: 'question' };
  center.show(item); const notice = [...center.live][0]; assert.ok(notice);
  notice.emit('click'); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['reveal', 'fullscreen', 'reveal', 'state', ['dock:notice', item]]);
  notice.emit('close'); assert.equal(center.live.size, 0);
});

test('ready notifications restore the Results workspace from every window mode', async () => {
  for (const mode of ['hud', 'dashboard', 'fullscreen']) for (const resultId of ['saved-result', null]) {
    const events = [], window = { isDestroyed: () => false, webContents: { send: (...args) => events.push(args) } };
    const center = new DockNotifications({ getWindow: () => window, getSessions: () => [{ id: 'console-a' }], getMode: () => mode, reveal() {}, publish() {}, setMode: async next => events.push(next) });
    const item = { kind: 'ready', sessionId: 'console-a', resultId, turnId: 'turn-a', destination: 'results' };
    await center.open(item);
    assert.deepEqual(events, ['dashboard', ['dock:notice', item]], `${mode}/${resultId}`);
  }
});

test('old ready alerts stay in Results while errors still open the originating console', async () => {
  const events = [], window = { isDestroyed: () => false, webContents: { send: (...args) => events.push(args) } };
  const center = new DockNotifications({ getWindow: () => window, getSessions: () => [{ id: 'a' }], getMode: () => 'fullscreen', reveal() {}, publish() {}, setMode: async next => events.push(next) });
  await center.open({ kind: 'ready', sessionId: 'a' }); assert.equal(events[0], 'dashboard');
  events.length = 0;
  await center.open({ kind: 'error', sessionId: 'a' }); assert.equal(events[0], 'fullscreen');
});

test('result notifications expand the HUD without selecting a stale console', async () => {
  const events = [], window = { isDestroyed: () => false, webContents: { send: (...args) => events.push(args) } };
  const center = new DockNotifications({ getWindow: () => window, getSessions: () => [], getMode: () => 'hud', reveal: () => events.push('reveal'), publish: () => {}, setMode: async value => events.push(value) });
  const item = { resultId: 'result-a', sessionId: 'closed-console' }; await center.open(item);
  assert.equal(events[1], 'dashboard'); assert.deepEqual(events.at(-1), ['dock:notice', item]);
  window.isDestroyed = () => true; const count = events.length; await center.open(item); assert.equal(events.length, count);
});

test('unsupported native notifications use the same activation for the tray balloon', async () => {
  if (process.platform !== 'win32') return;
  let balloon, shown = false;
  const center = new DockNotifications({ Notification: { isSupported: () => false }, getTray: () => ({ displayBalloon: x => balloon = x }), getWindow: () => ({ isDestroyed: () => false, webContents: { send: () => {} } }), getMode: () => 'dashboard', getSessions: () => [], reveal: () => shown = true, publish: () => {}, setMode: async () => {} });
  center.show({ title: 'Review ready', resultId: 'a' }); assert.equal(balloon.title, 'Review ready'); await center.balloonClick(); assert.equal(shown, true);
});
