'use strict';

function initialSettings(saved, folder, capabilities) {
  const defaults = {
    hudAlwaysOnTop: false, notifications: true, restoreConsoles: true, confirmConsoleEnd: true, keepAwakeWhileWorking: true, autoSaveResults: false, suggestProjects: true, delegationPanels: true,
    agentPermissions: 'default', codexScrollback: true, sidebarCollapsed: false, vimControls: false, trimStyle: 'classic', trimWidth: 1, lighting: 'static', lightingSpeed: 'normal', starDensity: 2, ambientMotion: true, launchEffect: true, cursorBlink: false,
    slotNames: {}, slotTrims: {}, rates: {}, accountSwitchThreshold: 90, autoSwitchAccounts: false, grid: { columns: 3, rows: 3 },
    consoleDefaults: { provider: capabilities.codex ? 'codex' : capabilities.claude ? 'claude' : 'shell', cwd: folder, name: '', command: '' }
  };
  return {
    ...defaults, ...saved,
    // Existing installs keep the confirmation unless the user explicitly turns it off.
    confirmConsoleEnd: saved.confirmConsoleEnd !== false,
    // Move the old default-on capture setting to requested outputs once.
    // An explicit opt-in under this policy survives subsequent restarts.
    resultsPolicyVersion: 1,
    autoSaveResults: saved.resultsPolicyVersion === 1 && saved.autoSaveResults === true,
    // Existing installations keep their settings and do not get a welcome screen.
    setupComplete: typeof saved.setupComplete === 'boolean' ? saved.setupComplete : Object.keys(saved).length > 0,
    consoleDefaults: { ...defaults.consoleDefaults, ...saved.consoleDefaults },
    accountSwitchThreshold: Number.isInteger(saved.accountSwitchThreshold) && saved.accountSwitchThreshold >= 50 && saved.accountSwitchThreshold <= 100 ? saved.accountSwitchThreshold : 90,
    autoSwitchAccounts: saved.autoSwitchAccounts === true,
    // Stars became a five-step scale; a switched-off sky stays off.
    starDensity: Number.isInteger(saved.starDensity) ? saved.starDensity : saved.panelStars === false ? 0 : 2,
    // One theme now colors the whole window. A saved RGB accent becomes the
    // RGB theme when the consoles still used the default theme.
    trimStyle: saved.accentStyle === 'rgb' && (!saved.trimStyle || saved.trimStyle === 'classic') ? 'gamer' : saved.trimStyle || 'classic',
    accentStyle: undefined, panelStars: undefined
  };
}
module.exports = { initialSettings };
