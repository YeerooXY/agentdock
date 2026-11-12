'use strict';
const { normalizeKnowledgeMode, normalizeKnowledgeWorker } = require('./knowledge-policy.cjs');
const { normalizeSkillAuto } = require('./skill-policy.cjs');
const { defaults: routingDefaults, migrateRouting, validateRouting } = require('./task-routing.cjs');

function initialSettings(saved, folder, capabilities) {
  // Normalize saved routing before validation so older settings retain their
  // account/model choices instead of falling back to defaults as a whole.
  let routing;
  try { routing = migrateRouting(saved.routing); } catch { routing = validateRouting(routingDefaults); }
  let knowledgeMode, knowledgeWorker, skillAuto;
  try { knowledgeMode = normalizeKnowledgeMode(saved.knowledgeMode); } catch { knowledgeMode = 'off'; }
  try { knowledgeWorker = normalizeKnowledgeWorker(saved.knowledgeWorker); } catch { knowledgeWorker = null; }
  try { skillAuto = normalizeSkillAuto(saved.skillAuto || {}, { recover: true }); } catch { skillAuto = {}; }
  const defaults = {
    autoResolveTasks: true, hudAlwaysOnTop: false, notifications: true, restoreConsoles: true, confirmConsoleEnd: true, keepAwakeWhileWorking: true, suggestProjects: true, delegationPanels: true,
    agentPermissions: 'default', codexScrollback: true, sidebarCollapsed: false, vimControls: false, trimStyle: 'classic', trimWidth: 1, lighting: 'static', lightingSpeed: 'normal', starDensity: 2, ambientMotion: true, launchEffect: true, cursorBlink: false,
    slotNames: {}, slotTrims: {}, rates: {}, grid: { columns: 3, rows: 3 },
    consoleDefaults: { provider: capabilities.codex ? 'codex' : capabilities.claude ? 'claude' : 'shell', cwd: folder, name: '', command: '' }
  };
  return {
    ...defaults, ...saved, routing, knowledgeMode, knowledgeWorker, skillAuto,
    // Existing installs keep the confirmation unless the user explicitly turns it off.
    confirmConsoleEnd: saved.confirmConsoleEnd !== false,
    // Existing installations keep their settings and do not get a welcome screen.
    setupComplete: typeof saved.setupComplete === 'boolean' ? saved.setupComplete : Object.keys(saved).length > 0,
    consoleDefaults: { ...defaults.consoleDefaults, ...saved.consoleDefaults },
    // Stars became a five-step scale; a switched-off sky stays off.
    starDensity: Number.isInteger(saved.starDensity) ? saved.starDensity : saved.panelStars === false ? 0 : 2,
    // One theme now colors the whole window. A saved RGB accent becomes the
    // RGB theme when the consoles still used the default theme.
    trimStyle: saved.accentStyle === 'rgb' && (!saved.trimStyle || saved.trimStyle === 'classic') ? 'gamer' : saved.trimStyle || 'classic',
    accentStyle: undefined, panelStars: undefined,
    // Automatic account switching was removed; drop its saved keys.
    accountSwitchThreshold: undefined, autoSwitchAccounts: undefined,
    autoSaveResults: undefined, resultsPolicyVersion: undefined
  };
}
module.exports = { initialSettings };
