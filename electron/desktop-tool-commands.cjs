'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const { atomicJson, validateKeyId } = require('./storage.cjs');
const { number } = require('./domain.cjs');
const { runApi } = require('./api-run.cjs');
const { NO_VALUE } = require('./command-result.cjs');

function desktopToolCommands(h) {
  const { vault, hub, integrations, mcpCatalog, testMode, publish, dialog, getWindow, getSettings, persistSettings,
    projects, turns, workbench, getApiBusy, setApiBusy, updatePower, root, setLedger, setStorageError, resolveKey } = h;
  return {
    'vault.save': async payload => { vault.set(payload?.provider, payload?.key, payload?.label); hub.writeSummary(); await Promise.allSettled([...hub.clients.keys()].map(id => hub.disconnect(id))); publish(); return NO_VALUE; },
    'vault.remove': async payload => {
      validateKeyId(payload);
      const used = hub.config.imageGeneration?.keyId === payload || hub.config.profiles.some(x => x.keyId === payload) || hub.config.connections.some(x => [x.envKeys, x.headerKeys, x.queryKeys].some(map => Object.values(map || {}).some(ref => ref.key === payload)));
      if (used && !testMode) { const result = await dialog.showMessageBox(getWindow(), { type: 'question', message: 'Remove this key?', detail: 'Connections using it will need another key.', buttons: ['Keep key', 'Remove'], defaultId: 0, cancelId: 0 }); if (result.response !== 1) return NO_VALUE; }
      vault.remove(payload); hub.writeSummary(); await Promise.allSettled([...hub.clients.keys()].map(id => hub.disconnect(id))); publish(); return NO_VALUE;
    },
    'shared.instructions': async payload => { hub.instructions(payload); publish(); return NO_VALUE; },
    'shared.guides': async payload => { hub.setGuides(payload); publish(); return NO_VALUE; },
    'images.settings': async payload => { hub.setImageGeneration(payload); publish(); return NO_VALUE; },
    'integrations.refresh': async () => { integrations.refresh(); publish(); return NO_VALUE; },
    'integrations.setup': async payload => {
      if (testMode && payload?.id !== 'meshy') throw new Error('Software installation is disabled during tests.');
      if (payload?.id === 'meshy' && !vault.list().some(x => x.id === payload.keyId)) throw new Error('Paste your Meshy API key, then connect.');
      const previous = hub.config.connections.find(x => x.id === payload?.id);
      if (previous && previous.integration !== payload.id) throw new Error('A custom tool already uses this ID. Rename it before setting up this integration.');
      const connection = await integrations.prepare(payload?.id, payload);
      await hub.saveConnection(connection); publish(); return NO_VALUE;
    },
    'tools.save': async payload => { await hub.saveConnection(payload); publish(); return NO_VALUE; },
    'catalog.add': async payload => {
      if (testMode) throw new Error('Software installation is disabled during tests.');
      const existing = hub.config.connections.find(x => x.id === payload?.id);
      if (existing && existing.catalog !== payload?.id) throw new Error('A custom tool already uses this ID. Rename it before adding this one.');
      if (payload?.keyId && !vault.list().some(x => x.id === payload.keyId)) throw new Error('Paste the key on this card, then save.');
      await hub.saveConnection(await mcpCatalog.add(payload?.id, { keyId: payload?.keyId })); publish(); return NO_VALUE;
    },
    'tools.policy': async payload => {
      const connection = hub.config.connections.find(x => x.id === payload?.id);
      if (!connection) throw new Error('That tool is no longer connected.');
      const { access, ...limits } = payload.policy || {};
      await hub.saveConnection({ ...connection, enabled: access !== 'off', policy: { ...limits, access: access === 'off' ? connection.policy?.access : access } }); publish(); return NO_VALUE;
    },
    'tools.remove': async payload => { await hub.removeConnection(payload); publish(); return NO_VALUE; },
    'tools.test': async payload => { try { return await hub.test(payload); } finally { publish(); } },
    'tools.catalog': async payload => { try { return await hub.list(payload); } finally { publish(); } },
    'profiles.save': async payload => { hub.saveProfile(payload); publish(); return NO_VALUE; },
    'profiles.remove': async payload => { hub.removeProfile(payload); publish(); return NO_VALUE; },
    'rates.save': async payload => {
      if (!hub.config.profiles.some(x => x.id === payload?.provider)) throw new Error('Choose an API connection.');
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/.test(payload.model || '')) throw new Error('Enter a valid model ID.');
      const rates = {};
      for (const field of ['input', 'output', 'cached', 'cacheWrite']) {
        const value = payload[field] === '' || payload[field] === null || payload[field] === undefined ? null : Number(payload[field]);
        if (value !== null && (number(value) === null || value > 100000)) throw new Error('Rates must be nonnegative USD per million tokens.');
        rates[field] = value;
      }
      persistSettings({ ...getSettings(), rates: { ...getSettings().rates, [`${payload.provider}:${payload.model}`]: rates } }); publish(); return NO_VALUE;
    },
    'api.send': async payload => {
      if (testMode) throw new Error('Paid API requests are disabled during tests.');
      if (getApiBusy()) throw new Error('Wait for the current API request to finish.');
      const profile = hub.config.profiles.find(x => x.id === payload?.provider);
      if (!profile) throw new Error('Choose an API connection.');
      const key = profile.keyId ? resolveKey(profile.keyId) : '';
      const project = payload.projectId ? projects.launch({ projectId: payload.projectId }) : {};
      setApiBusy(true); updatePower();
      const apiOwner = 'api:' + crypto.randomUUID();
      turns.virtual.set(apiOwner, { id: apiOwner, consoleKey: 'api:' + profile.id, projectId: project.projectId || null, name: profile.name, cwd: project.cwd || getSettings().consoleDefaults.cwd, alive: true });
      projects.touch(project.projectId);
      const apiHub = { summary: () => hub.summary({ knowledgeEnabled: workbench.knowledgeAccess.enabled(project.projectId) }) + projects.chatSummary(turns.virtual.get(apiOwner)), invoke: (name, args) => hub.invoke(name, args, apiOwner), completionCheck: () => workbench.completion.check(apiOwner) };
      let result;
      try {
        await turns.begin(apiOwner);
        result = await runApi(payload, key, getSettings().rates[`${profile.id}:${payload.model?.trim()}`], { profile, hub: apiHub, onEntry: entry => {
          entry.projectId = project.projectId || null; entry.consoleName = project.name || profile.name; entry.turnId = turns.context(apiOwner)?.turnId || null;
          setLedger([entry, ...h.getLedger()]);
          try { atomicJson(path.join(root, 'ledger.json'), h.getLedger()); }
          catch { setStorageError('Latest API usage is only in memory. Export it before quitting.'); }
          publish();
        } });
      }
      finally { try { await turns.finish(apiOwner); } finally { turns.virtual.delete(apiOwner); setApiBusy(false); updatePower(); } }
      workbench.alerts.send({ title: result.error || result.entry?.status !== 'completed' ? 'API request needs attention' : 'API response ready', message: `${profile.name}, ${payload.model}`, kind: result.error || result.entry?.status !== 'completed' ? 'error' : 'ready', destination: 'usage' });
      publish(); return result;
    },
    'ledger.export': async () => {
      const result = await dialog.showSaveDialog(getWindow(), { defaultPath: 'paddock-usage.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (!result.canceled && result.filePath) atomicJson(result.filePath, { scope: 'API requests made through Paddock', currency: 'USD', costs: 'estimates', entries: h.getLedger() });
      return NO_VALUE;
    }
  };
}

module.exports = { desktopToolCommands };
