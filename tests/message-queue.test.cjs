'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { MessageQueue, MAX_ENTRIES } = require('../electron/message-queue.cjs');

function fixture() {
  const sessions = new EventEmitter(), writes = [];
  sessions.items = new Map([['a', { id: 'a', alive: true, purpose: 'agent', provider: 'codex', state: 'active', launchId: 'l1' }], ['s', { id: 's', alive: true, purpose: 'agent', provider: 'shell', state: 'open' }]]);
  sessions.write = (id, data, options) => writes.push([id, data, options?.queued === true]);
  const queue = new MessageQueue(sessions, { sendDelay: 5, submitDelay: 0, wait: () => Promise.resolve() });
  const finish = () => { sessions.items.get('a').state = 'ready'; sessions.emit('changed'); };
  const settle = () => new Promise(resolve => setTimeout(resolve, 30));
  return { sessions, writes, queue, finish, settle };
}

test('queued messages are sent in order, one per finished turn', async () => {
  const { sessions, writes, queue, finish, settle } = fixture();
  queue.add('a', 'first'); queue.add('a', 'second');
  await settle(); assert.deepEqual(writes, [], 'nothing is sent while the agent works');
  finish(); await settle();
  assert.deepEqual(writes, [['a', 'first', true], ['a', '\r', true]]);
  assert.deepEqual(queue.snapshot().a.entries.map(x => x.text), ['second']);
  sessions.items.get('a').state = 'ready'; sessions.emit('changed'); await settle();
  assert.equal(writes.length, 2, 'staying ready does not send the next one');
  sessions.items.get('a').state = 'active'; sessions.emit('changed'); finish(); await settle();
  assert.deepEqual(writes.slice(2), [['a', 'second', true], ['a', '\r', true]]);
  assert.equal(queue.snapshot().a, undefined, 'an empty queue disappears');
});

test('a message queued while the agent waits is sent; multi-line text uses bracketed paste', async () => {
  const { sessions, writes, queue, settle } = fixture();
  sessions.items.get('a').state = 'ready';
  sessions.emit('output', { id: 'a', data: 'prompt \x1b[?2004h' });
  queue.add('a', 'one\r\ntwo'); await settle();
  assert.deepEqual(writes, [['a', '\x1b[200~one\ntwo\x1b[201~', true], ['a', '\r', true]]);
});

test('typing after the turn finished, pausing, or ending the console stops automatic sending', async () => {
  const { sessions, writes, queue, finish, settle } = fixture();
  queue.add('a', 'later');
  finish(); sessions.items.get('a').lastInputAt = Date.now() + 1; await settle();
  assert.deepEqual(writes, [], 'the user took over');
  queue.pause('a', true);
  sessions.items.get('a').state = 'active'; sessions.emit('changed'); finish(); await settle();
  assert.deepEqual(writes, [], 'paused');
  queue.pause('a', false); await settle();
  assert.deepEqual(writes, [['a', 'later', true], ['a', '\r', true]], 'resuming while ready sends');
  queue.add('a', 'dropped');
  sessions.items.get('a').alive = false; sessions.emit('changed');
  assert.equal(queue.snapshot().a, undefined, 'an ended console drops its queue');
});

test('queued messages can be edited, reordered, removed and sent now', async () => {
  const { writes, queue } = fixture();
  const one = queue.add('a', 'one'), two = queue.add('a', 'two'), three = queue.add('a', 'three');
  queue.edit('a', two.id, 'TWO'); queue.move('a', three.id, -1); queue.move('a', one.id, -1); queue.remove('a', one.id);
  assert.deepEqual(queue.snapshot().a.entries.map(x => x.text), ['three', 'TWO']);
  await queue.sendNow('a', two.id);
  assert.deepEqual(writes, [['a', 'TWO', true], ['a', '\r', true]], 'send now works while the agent is busy');
  assert.throws(() => queue.edit('a', two.id, 'x'), /already sent or removed/);
  assert.throws(() => queue.add('s', 'hi'), /open agent consoles/);
  assert.throws(() => queue.add('a', '   '), /Type a message/);
  for (let i = 1; i < MAX_ENTRIES; i++) queue.add('a', 'm' + i);
  assert.throws(() => queue.add('a', 'too many'), /up to 20/);
});

test('a console that changes before Enter keeps the typed text unsubmitted', async () => {
  const { sessions, writes, queue } = fixture();
  queue.wait = async () => { sessions.items.get('a').launchId = 'l2'; };
  const entry = queue.add('a', 'hello');
  await assert.rejects(queue.sendNow('a', entry.id), /changed before the queued message was submitted/);
  assert.deepEqual(writes, [['a', 'hello', true]]);
});
