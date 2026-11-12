'use strict';
// Browser-only IPC fixture using the shipped slice projection and protocol.
const { slicesFromLegacy } = require('../electron/projections.cjs');
async function installStateTransport(context) {
  await context.exposeFunction('fixtureStateValues', raw => slicesFromLegacy(raw));
  await context.addInitScript(() => {
    let receive, slices = [], batch = 0, subscribed = false, pending = Promise.resolve();
    function publish(raw) {
      if (!subscribed) return;
      pending = pending.then(async () => {
        const values = await window.fixtureStateValues(raw);
        receive({ type: 'changes', epoch: 'fixture', subscription: 'fixture', batch: ++batch,
          changes: slices.map(slice => ({ slice, kind: 'reset', rev: batch, value: values[slice] })) });
      });
      return pending;
    }
    window.fixtureStateTransport = {
      publish,
      async send(message) {
        if (message.type !== 'hello') return;
        slices = message.slices; batch = 0; subscribed = true;
        receive({ type: 'welcome', epoch: 'fixture', subscription: 'fixture', slices });
        const reply = await window.dock.call('state');
        if (!reply.ok) throw new Error(reply.error);
        await publish(reply.value);
      },
      onMessage(callback) { receive = callback; return () => { subscribed = false; }; }
    };
    window.fixtureState = window.fixtureReceive = window.fixtureStateListener = publish;
  });
}
module.exports = { installStateTransport };
