'use strict';
const { desktopMobileCommands } = require('./desktop-mobile-commands.cjs');
const { desktopTaskCommands } = require('./desktop-task-commands.cjs');
const { desktopProjectCommands } = require('./desktop-project-commands.cjs');
const { desktopSessionCommands } = require('./desktop-session-commands.cjs');
const { desktopSettingsCommands } = require('./desktop-settings-commands.cjs');
const { desktopToolCommands } = require('./desktop-tool-commands.cjs');
const { desktopSystemCommands } = require('./desktop-system-commands.cjs');

const FAMILIES = [desktopMobileCommands, desktopTaskCommands, desktopProjectCommands, desktopSessionCommands,
  desktopSettingsCommands, desktopToolCommands, desktopSystemCommands];

// Composition root for renderer domain commands. Transport authorization,
// StateStore sequencing and result/error envelopes intentionally stay in main.
function createDesktopCommands(dependencies) {
  const handlers = new Map();
  for (const family of FAMILIES) {
    for (const [method, handler] of Object.entries(family(dependencies))) {
      if (handlers.has(method)) throw new Error(`Duplicate desktop command: ${method}`);
      handlers.set(method, handler);
    }
  }
  return {
    async call(method, payload) {
      if (typeof method === 'string' && method.startsWith('workbench.')) return dependencies.workbench.call(method.slice(10), payload);
      const handler = handlers.get(method);
      if (!handler) {
        if (typeof method === 'string' && method.startsWith('mobile.')) throw new Error('Unknown mobile action.');
        throw new Error('Unknown action.');
      }
      return handler(payload);
    }
  };
}

module.exports = { createDesktopCommands };
