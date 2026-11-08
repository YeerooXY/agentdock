'use strict';

// Commands tied to the phone's currently subscribed terminal and its bounded
// upload/queue state. The bridge owns authentication before dispatch.
function mobileSessionCommands(h) {
  const queue = async (method, client, payload) => {
    const service = h.queue();
    if (!service) throw new Error('Update Paddock on your PC to queue messages.');
    if (client.selected !== payload.id) throw new Error('Select an open console first.');
    if (method === 'queue.add') return service.add(payload.id, payload.text, { ownerRequested: true });
    if (method === 'queue.edit') {
      try { service.edit(payload.id, payload.entryId, payload.text); }
      catch (error) {
        if (error.message === 'This console has no queued messages.') throw new Error('This queued message was already sent or removed.');
        throw error;
      }
      return true;
    }
    if (method === 'queue.remove') { service.remove(payload.id, payload.entryId); return true; }
    if (method === 'queue.move') { service.move(payload.id, payload.entryId, payload.offset); return true; }
    if (method === 'queue.pause') { service.pause(payload.id, payload.paused === true); return true; }
    await service.sendNow(payload.id, payload.entryId); return true;
  };
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
    'queue.add': (client, payload) => queue('queue.add', client, payload),
    'queue.edit': (client, payload) => queue('queue.edit', client, payload),
    'queue.remove': (client, payload) => queue('queue.remove', client, payload),
    'queue.move': (client, payload) => queue('queue.move', client, payload),
    'queue.pause': (client, payload) => queue('queue.pause', client, payload),
    'queue.send': (client, payload) => queue('queue.send', client, payload),
    'attachment.begin': async (client, payload) => {
      if (client.selected !== payload.id) throw new Error('Select a console first.');
      return h.attachments.begin(client, h.sessions.items.get(payload.id), payload.size);
    },
    'attachment.chunk': async (client, payload) => h.attachments.chunk(client, payload),
    'attachment.finish': async (client, payload) => h.attachments.finish(client, payload, () => h.authorized(client))
  };
}

module.exports = { mobileSessionCommands };
