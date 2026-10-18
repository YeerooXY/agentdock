'use strict';

function initialSettings(saved, folder, capabilities) {
  const defaults = {
    hudAlwaysOnTop: false, notifications: true, restoreConsoles: true, keepAwakeWhileWorking: true, autoSaveResults: true, suggestProjects: true,
    agentPermissions: 'default', sidebarCollapsed: false, vimControls: false, accentStyle: 'pink-blue', cursorBlink: false,
    slotNames: {}, rates: {}, grid: { columns: 3, rows: 3 },
    consoleDefaults: { provider: capabilities.codex ? 'codex' : capabilities.claude ? 'claude' : 'shell', cwd: folder, name: '', command: '' }
  };
  return {
    ...defaults, ...saved,
    // Existing installations keep their settings and do not get a welcome screen.
    setupComplete: typeof saved.setupComplete === 'boolean' ? saved.setupComplete : Object.keys(saved).length > 0,
    consoleDefaults: { ...defaults.consoleDefaults, ...saved.consoleDefaults }
  };
}
module.exports = { initialSettings };
