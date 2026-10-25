'use strict';
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');

// Live delivery only. Notification history belongs to the operating system;
// Paddock keeps console status and saved Results, with no stored inbox.
class AlertEvents extends EventEmitter {
  constructor() { super(); this.keys = new Set(); }
  send(raw) {
    if (raw.key && this.keys.has(raw.key)) return;
    if (raw.key) {
      this.keys.add(raw.key);
      if (this.keys.size > 256) this.keys.delete(this.keys.values().next().value);
    }
    const text = (value, length) => String(value || '').slice(0, length);
    const item = { id: randomUUID(), at: Date.now(), title: text(raw.title, 180), message: text(raw.message, 1200),
      sessionId: raw.sessionId || null, resultId: raw.resultId || null, reviewId: raw.reviewId || null,
      kind: ['ready', 'question', 'error'].includes(raw.kind) ? raw.kind : 'ready' };
    if (raw.turnId) item.turnId = text(raw.turnId, 80);
    if (['results', 'usage', 'tools', 'projects'].includes(raw.destination)) item.destination = raw.destination;
    this.emit('notification', item);
    return item;
  }
}
module.exports = { AlertEvents };
