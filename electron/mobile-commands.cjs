'use strict';
const { mobileConsoleCommands } = require('./mobile-console-commands.cjs');
const { mobileSessionCommands } = require('./mobile-session-commands.cjs');
const { mobileContentCommands } = require('./mobile-content-commands.cjs');

// Composition only. Phone authentication, worker policy and request envelopes
// remain in MobileCompanion's transport; these are domain command families.
function createMobileCommands(dependencies) {
  const handlers = new Map();
  for (const family of [mobileConsoleCommands, mobileSessionCommands, mobileContentCommands]) {
    for (const [method, handler] of Object.entries(family(dependencies))) {
      if (handlers.has(method)) throw new Error(`Duplicate mobile command: ${method}`);
      handlers.set(method, handler);
    }
  }
  return {
    async call(client, method, payload) {
      const handler = handlers.get(method);
      if (!handler) throw new Error('This mobile action is unavailable.');
      return handler(client, payload);
    }
  };
}

module.exports = { createMobileCommands };
