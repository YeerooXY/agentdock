'use strict';

// Commands tied to the phone's currently subscribed terminal and its bounded
// upload state. The bridge owns authentication before dispatch.
function mobileSessionCommands(h) {
  return {
    'subscribe': async (client, payload) => {
      if (payload.id && !h.sessions.items.has(payload.id)) throw new Error('This console is no longer open.');
      client.selected = payload.id || ''; client.sequence = Number.isSafeInteger(payload.sequence) ? payload.sequence : -1; client.epoch = Number.isSafeInteger(payload.epoch) ? payload.epoch : 0; client.saver = payload.saver !== false; client.lastFlush = 0; return true;
    },
    'input': async (client, payload) => {
      if (client.selected !== payload.id || !h.sessions.items.get(payload.id)?.alive) throw new Error('Select an open console first.');
      if (typeof payload.data !== 'string' || payload.data.length > 65536) throw new Error('Input is too large.');
      h.sessions.acknowledge(payload.id); h.sessions.write(payload.id, payload.data); return true;
    },
    'acknowledge': async (_client, payload) => { h.sessions.acknowledge(payload.id); return true; },
    'attachment.begin': async (client, payload) => {
      if (client.selected !== payload.id) throw new Error('Select a console first.');
      return h.attachments.begin(client, h.sessions.items.get(payload.id), payload.size);
    },
    'attachment.chunk': async (client, payload) => h.attachments.chunk(client, payload),
    'attachment.finish': async (client, payload) => h.attachments.finish(client, payload, () => h.authorized(client))
  };
}

module.exports = { mobileSessionCommands };
