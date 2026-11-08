'use strict';
const { normalizeKnowledgeMode, normalizeKnowledgeWorker } = require('./knowledge-policy.cjs');
const { validateRouting } = require('./task-routing.cjs');
const { frameStyles, lightingStyles } = require('./console-appearance.cjs');
const { REVIEWERS } = require('./delegation.cjs');
const { validateExplorerWidth } = require('./domain.cjs');
const { findClaude, nativeCodex } = require('./adapters.cjs');
const { validateConsoleDefaults } = require('./sessions.cjs');
const { NO_VALUE } = require('./command-result.cjs');

function desktopSettingsCommands(h) {
  const { getSettings, persistSettings, workspace, stateV2Enabled, endDesktopV2, mobile, turns, getMode, getWindow,
    publish, safeMode, cliSetup, skillPacks, sessions, getCapabilities, setCapabilities, hub, testMode, ssh, dialog } = h;
  return {
    'skills.refresh': async () => { const value = skillPacks.list(); publish(); return value; },
    'skills.automatic': async payload => {
      if (!payload || typeof payload.id !== 'string' || typeof payload.automatic !== 'boolean' || Object.keys(payload).some(key => !['id', 'automatic'].includes(key))) throw new Error('Choose a skill and an automatic-use setting.');
      if (testMode && !process.env.PADDOCK_SKILLS_HOME) throw new Error('Skill changes need a temporary home in tests.');
      const previous = skillPacks.list().find(pack => pack.id === payload.id)?.automatic;
      const value = await skillPacks.setAutomatic(payload.id, payload.automatic);
      try {
        persistSettings({ ...getSettings(), skillAuto: { ...getSettings().skillAuto, [payload.id]: payload.automatic } });
      } catch (error) {
        let recovery = '';
        try {
          const results = await skillPacks.setAutomatic(payload.id, previous);
          if (results.some(result => !['installed', 'updated'].includes(result.state))) recovery = ' Some installed copies could not be restored; check their status.';
        } catch { recovery = ' Installed copies could not be restored; check their status.'; }
        skillPacks.clearAutomaticOverride(payload.id);
        hub.writeSummary(); publish();
        throw Error('The automatic-use preference could not be saved.' + recovery, { cause: error });
      }
      skillPacks.clearAutomaticOverride(payload.id); hub.writeSummary(); publish(); return value;
    },
    'skills.install': async payload => {
      if (testMode && !process.env.PADDOCK_SKILLS_HOME) throw new Error('Skill installs need a temporary home in tests.');
      const value = await skillPacks.install(payload); hub.writeSummary(); return value;
    },
    'skills.uninstall': async payload => {
      if (testMode && !process.env.PADDOCK_SKILLS_HOME) throw new Error('Skill installs need a temporary home in tests.');
      const value = await skillPacks.uninstall(payload); hub.writeSummary(); return value;
    },
    'agents.refresh': async () => { cliSetup.refresh(); skillPacks.list(); return refreshAgents(); },
    'agents.install': async payload => {
      const result = await cliSetup.install(payload); skillPacks.list(); refreshAgents(); return result;
    },
    'ssh.scan': async payload => ssh.scan(payload),
    'ssh.approve': async payload => { const value = ssh.approve(payload); publish(); return value; },
    'ssh.check': async payload => { const value = await ssh.check(payload); publish(); return value; },
    'ssh.rename': async payload => { const value = ssh.rename(payload.id, payload.name); publish(); return value; },
    'ssh.remove': async payload => {
      if (sessions.list().some(x => x.remote?.hostId === payload && (x.alive || x.restoreError))) throw new Error('End this host’s consoles before removing it.');
      ssh.remove(payload); publish(); return NO_VALUE;
    },
    'ssh.keyFile': async () => {
      const picked = await dialog.showOpenDialog(getWindow(), { properties: ['openFile'], title: 'Choose an SSH private key (stays on this PC)' });
      return picked.filePaths[0] || '';
    },
    'settings': async payload => {
      const settings = getSettings(), next = { ...settings };
      if (payload?.knowledgeWorker !== undefined) next.knowledgeWorker = normalizeKnowledgeWorker(payload.knowledgeWorker);
      if (typeof payload?.autoResolveTasks === 'boolean') next.autoResolveTasks = payload.autoResolveTasks;
      if (payload?.knowledgeMode !== undefined) next.knowledgeMode = normalizeKnowledgeMode(payload.knowledgeMode);
      if (payload?.routing !== undefined) next.routing = validateRouting(payload.routing);
      if (typeof payload?.hudAlwaysOnTop === 'boolean') next.hudAlwaysOnTop = payload.hudAlwaysOnTop;
      if (typeof payload?.notifications === 'boolean') next.notifications = payload.notifications;
      if (typeof payload?.confirmConsoleEnd === 'boolean') next.confirmConsoleEnd = payload.confirmConsoleEnd;
      if (typeof payload?.keepAwakeWhileWorking === 'boolean') next.keepAwakeWhileWorking = payload.keepAwakeWhileWorking;
      if (typeof payload?.restoreConsoles === 'boolean') {
        if (safeMode && payload.restoreConsoles !== settings.restoreConsoles) throw new Error('Restart normally to change console restoration.');
        next.restoreConsoles = payload.restoreConsoles;
      }
      if (typeof payload?.codexScrollback === 'boolean') next.codexScrollback = payload.codexScrollback;
      if (typeof payload?.autoSaveResults === 'boolean') next.autoSaveResults = payload.autoSaveResults;
      if (typeof payload?.delegationEnabled === 'boolean') next.delegationEnabled = payload.delegationEnabled;
      if (typeof payload?.delegationPanels === 'boolean') next.delegationPanels = payload.delegationPanels;
      if (payload?.delegationProviders !== undefined) {
        if (!Array.isArray(payload.delegationProviders) || payload.delegationProviders.some(id => !REVIEWERS.includes(id))) throw new Error('Choose a supported reviewer.');
        next.delegationProviders = [...new Set(payload.delegationProviders)];
      }
      for (const key of ['usageShown', 'usageHidden']) if (payload?.[key] !== undefined) {
        const ids = payload[key];
        if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || !/^[a-z0-9-]{1,40}:[\w.-]{1,80}$/i.test(id))) throw new Error('Choose subscriptions from the list.');
        next[key] = [...new Set(ids)];
      }
      if (typeof payload?.suggestProjects === 'boolean') next.suggestProjects = payload.suggestProjects;
      if (typeof payload?.stateSyncV2 === 'boolean') next.stateSyncV2 = payload.stateSyncV2;
      if (payload?.maxParallelTasks !== undefined) {
        const limit = Number(payload.maxParallelTasks);
        if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Choose 1 to 10 tasks at once.');
        next.maxParallelTasks = limit;
      }
      if (payload?.explorerWidth !== undefined) next.explorerWidth = validateExplorerWidth(payload.explorerWidth);
      if (typeof payload?.sidebarCollapsed === 'boolean') next.sidebarCollapsed = payload.sidebarCollapsed;
      if (typeof payload?.vimControls === 'boolean') next.vimControls = payload.vimControls;
      if (typeof payload?.cursorBlink === 'boolean') next.cursorBlink = payload.cursorBlink;
      if (payload?.lighting !== undefined) {
        if (!lightingStyles.includes(payload.lighting)) throw new Error('Choose an available lighting effect.');
        next.lighting = payload.lighting;
      }
      if (payload?.lightingSpeed !== undefined) {
        if (!['slow', 'normal', 'fast'].includes(payload.lightingSpeed)) throw new Error('Choose slow, normal or fast lighting.');
        next.lightingSpeed = payload.lightingSpeed;
      }
      if (payload?.starDensity !== undefined) {
        const level = Number(payload.starDensity);
        if (!Number.isInteger(level) || level < 0 || level > 4) throw new Error('Choose a star level from Off to Galaxy.');
        next.starDensity = level;
      }
      if (typeof payload?.ambientMotion === 'boolean') next.ambientMotion = payload.ambientMotion;
      if (typeof payload?.themeTextures === 'boolean') next.themeTextures = payload.themeTextures;
      if (typeof payload?.launchEffect === 'boolean') next.launchEffect = payload.launchEffect;
      if (payload?.trimStyle !== undefined) {
        if (!frameStyles.includes(payload.trimStyle)) throw new Error('Choose an available console trim.');
        next.trimStyle = payload.trimStyle;
      }
      if (payload?.trimWidth !== undefined) {
        const width = Number(payload.trimWidth);
        if (![1, 2, 3, 4, 6].includes(width)) throw new Error('Choose an available trim width.');
        next.trimWidth = width;
      }
      if (payload?.consoleDefaults !== undefined) next.consoleDefaults = validateConsoleDefaults(payload.consoleDefaults);
      if (payload?.agentPermissions !== undefined) {
        if (!['default', 'unrestricted'].includes(payload.agentPermissions)) throw new Error('Choose a supported agent permission mode.');
        next.agentPermissions = payload.agentPermissions;
      }
      workspace.setEnabled(next.restoreConsoles);
      const v2Was = stateV2Enabled();
      persistSettings(next);
      if (v2Was && !stateV2Enabled()) { endDesktopV2(); for (const client of mobile.clients) if (client.v2) client.ws.close(1012, 'Reconnect'); }
      if (!v2Was && stateV2Enabled()) h.setDesktopLegacy(true);
      turns.setEnabled(getSettings().autoSaveResults === true); if (getMode() === 'hud') getWindow().setAlwaysOnTop(getSettings().hudAlwaysOnTop); publish(); return NO_VALUE;
    }
  };

  function refreshAgents() {
    sessions.claude = findClaude();
    const capabilities = { ...getCapabilities(), codex: !!nativeCodex(), claude: !!sessions.claude, claudeLocation: sessions.claude?.label };
    setCapabilities(capabilities); publish(); return capabilities;
  }
}

module.exports = { desktopSettingsCommands };
