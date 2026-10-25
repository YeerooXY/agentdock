'use strict';
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { byId: cliAgents } = require('./cli-catalog.cjs');

const MAX_ENTRIES = 20, MAX_TEXT = 16000;
// Waits after a turn finishes so the agent's composer is ready, and gives the
// user a moment to take over by typing first.
const SEND_DELAY_MS = 1500, SUBMIT_DELAY_MS = 150;

function cleanText(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Type a message to queue.');
  if (text.length > MAX_TEXT) throw new Error(`Queued messages can be up to ${MAX_TEXT} characters.`);
  return text.replace(/\r\n?/g, '\n');
}

// One ordered list of messages per agent console. When the console's agent
// reports that its turn finished, the first message is typed and submitted.
// Queues live in memory: after a restart nothing is sent automatically.
class MessageQueue extends EventEmitter {
  constructor(sessions, { sendDelay = SEND_DELAY_MS, submitDelay = SUBMIT_DELAY_MS, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    super();
    Object.assign(this, { sessions, sendDelay, submitDelay, wait });
    this.queues = new Map(); this.states = new Map(); this.paste = new Map(); this.timers = new Map(); this.sending = new Set();
    sessions.on('changed', () => this.watch());
    sessions.on('output', ({ id, data }) => this.trackPaste(id, data));
  }
  snapshot() {
    return Object.fromEntries([...this.queues].map(([id, queue]) => [id, { paused: queue.paused, entries: queue.entries.map(x => ({ ...x })) }]));
  }
  session(id) {
    const item = this.sessions.items.get(id);
    if (!item?.alive || item.dismissed || item.purpose !== 'agent' || !cliAgents.has(item.provider)) throw new Error('Messages can be queued for open agent consoles.');
    return item;
  }
  queue(id, create = false) {
    let queue = this.queues.get(id);
    if (!queue && create) { this.session(id); queue = { paused: false, entries: [] }; this.queues.set(id, queue); }
    if (!queue) throw new Error('This console has no queued messages.');
    return queue;
  }
  entry(id, entryId) {
    const queue = this.queue(id), index = queue.entries.findIndex(x => x.id === entryId);
    if (index < 0) throw new Error('This queued message was already sent or removed.');
    return { queue, index };
  }
  add(id, text) {
    const value = cleanText(text), queue = this.queue(id, true);
    if (queue.entries.length >= MAX_ENTRIES) throw new Error(`A console can queue up to ${MAX_ENTRIES} messages.`);
    const entry = { id: crypto.randomUUID(), text: value, createdAt: Date.now() };
    queue.entries.push(entry); this.changed();
    // Queued while the agent is already waiting: send it as if the turn just finished.
    if (this.sessions.items.get(id)?.state === 'ready') this.schedule(id);
    return entry;
  }
  edit(id, entryId, text) {
    const value = cleanText(text), { queue, index } = this.entry(id, entryId);
    queue.entries[index] = { ...queue.entries[index], text: value }; this.changed();
  }
  remove(id, entryId) {
    const { queue, index } = this.entry(id, entryId);
    queue.entries.splice(index, 1); this.prune(id); this.changed();
  }
  move(id, entryId, offset) {
    const { queue, index } = this.entry(id, entryId), target = Math.max(0, Math.min(queue.entries.length - 1, index + Math.sign(Number(offset) || 0)));
    if (target === index) return;
    const [entry] = queue.entries.splice(index, 1); queue.entries.splice(target, 0, entry); this.changed();
  }
  pause(id, paused) {
    const queue = this.queue(id); queue.paused = paused === true;
    if (!queue.paused && this.sessions.items.get(id)?.state === 'ready') this.schedule(id);
    this.changed();
  }
  clear(id) { if (this.queues.delete(id)) this.changed(); }
  // Explicit "Send now" ignores the pause and the agent state: the user chose it.
  async sendNow(id, entryId) {
    this.session(id); this.entry(id, entryId);
    await this.send(id, entryId);
  }
  watch() {
    for (const [id, item] of this.sessions.items) {
      const previous = this.states.get(id); this.states.set(id, item.state);
      if (item.state === 'ready' && previous !== 'ready' && this.queues.get(id)?.entries.length) this.schedule(id);
    }
    for (const id of [...this.states.keys()]) if (!this.sessions.items.has(id)) this.states.delete(id);
    for (const id of [...this.queues.keys()]) {
      const item = this.sessions.items.get(id);
      if (!item?.alive || item.dismissed) { this.queues.delete(id); clearTimeout(this.timers.get(id)); this.timers.delete(id); this.changed(); }
    }
  }
  schedule(id) {
    clearTimeout(this.timers.get(id));
    const readyAt = Date.now();
    this.timers.set(id, setTimeout(() => {
      this.timers.delete(id);
      const item = this.sessions.items.get(id), queue = this.queues.get(id);
      // Typing in the console after the turn finished means the user took over.
      if (!item?.alive || item.state !== 'ready' || item.switching || !queue || queue.paused || !queue.entries.length || (item.lastInputAt || 0) >= readyAt) return;
      this.send(id, queue.entries[0].id).catch(error => this.emit('error', { id, message: error.message }));
    }, this.sendDelay));
  }
  async send(id, entryId) {
    if (this.sending.has(id)) throw new Error('A queued message is being sent to this console.');
    const item = this.session(id), { queue, index } = this.entry(id, entryId), [entry] = queue.entries.splice(index, 1), launchId = item.launchId;
    this.sending.add(id); this.prune(id); this.changed();
    try {
      const text = this.paste.get(id) ? `\x1b[200~${entry.text}\x1b[201~` : entry.text;
      this.sessions.write(id, text, { queued: true });
      // Keep Enter out of the CLI's paste burst.
      await this.wait(this.submitDelay);
      const current = this.sessions.items.get(id);
      if (current !== item || !current.alive || current.launchId !== launchId) throw new Error('The console changed before the queued message was submitted. Check that console.');
      this.sessions.write(id, '\r', { queued: true });
      this.emit('sent', { id, entry });
    } finally { this.sending.delete(id); }
  }
  // Bracketed paste keeps multi-line messages from being submitted line by line.
  trackPaste(id, data) {
    if (typeof data !== 'string') return;
    const on = data.lastIndexOf('\x1b[?2004h'), off = data.lastIndexOf('\x1b[?2004l');
    if (on > off) this.paste.set(id, true); else if (off > on) this.paste.delete(id);
  }
  prune(id) { if (this.queues.get(id)?.entries.length === 0 && !this.queues.get(id).paused) this.queues.delete(id); }
  changed() { this.emit('changed'); }
}

module.exports = { MessageQueue, MAX_ENTRIES, MAX_TEXT };
