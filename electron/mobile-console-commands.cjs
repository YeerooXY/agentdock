'use strict';
const { consoleChoices, mobileLaunch, consoleFiles, worktreeRoot } = require('./mobile-console.cjs');
const { prepareWorktree } = require('./worktrees.cjs');
const { consoleFeaturesFor } = require('./providers/index.cjs');

// Console and worker mutations. Selection, launch/account identity and phone
// authorization are checked again around asynchronous boundaries.
function mobileConsoleCommands(h) {
  return {
    'worker.submit': async (client, payload) => {
      if (!h.sessions.workerBridge || client.selected !== payload.id) throw new Error('Select a current worker first.');
      h.sessions.workerBridge.current(payload);
      return h.sessions.workerBridge.submit(payload);
    },
    'worker.stop': async (client, payload) => {
      if (!h.sessions.workerBridge || client.selected !== payload.id) throw new Error('Select a current worker first.');
      h.sessions.workerBridge.current(payload);
      return h.sessions.workerBridge.stop(payload);
    },
    'console.worktree.root': async (_client, payload) => {
      const worktrees = h.worktrees(), endMobileSession = h.endMobileSession();
      if (!worktrees || !endMobileSession) throw new Error('Worktrees are unavailable on this PC.');
      if (payload.cwd !== undefined || payload.path !== undefined) throw new Error('Choose a saved project folder.');
      const launch = mobileLaunch(h.sessions, h.defaults(), payload);
      return { root: !launch.remoteHostId && await worktreeRoot(worktrees, launch.cwd) };
    },
    'console.create': async (client, payload) => {
      if (payload.worktree !== undefined && typeof payload.worktree !== 'boolean') throw new Error('Invalid worktree option.');
      const launch = mobileLaunch(h.sessions, h.defaults(), payload);
      if (payload.worktree) {
        const worktrees = h.worktrees(), endMobileSession = h.endMobileSession();
        if (payload.cwd !== undefined || payload.path !== undefined) throw new Error('Choose a saved project folder.');
        if (!worktrees || !endMobileSession) throw new Error('Worktrees are unavailable on this PC.');
        if (launch.remoteHostId || !await worktreeRoot(worktrees, launch.cwd)) throw new Error('Choose a Git repository root on this PC.');
        if (!h.authorized(client)) throw new Error('This phone connection is no longer authorized.');
        await prepareWorktree(launch, worktrees, h.defaults().cwd);
      }
      return h.sessions.create(launch);
    },
    'console.worktree.status': async (client, payload) => {
      const session = h.sessions.items.get(payload.id), worktrees = h.worktrees();
      if (client.selected !== payload.id || !session?.worktree || session.dismissed || (session.launchId || null) !== (payload.launchId || null) || !worktrees) throw new Error('Select the current worktree console.');
      const status = await worktrees.status(session.worktree).catch(() => null);
      if (client.selected !== payload.id || h.sessions.items.get(payload.id) !== session || session.dismissed || (session.launchId || null) !== (payload.launchId || null) || !h.authorized(client)) throw new Error('Console changed.');
      return { dirty: status?.dirty ?? null, ahead: status?.ahead ?? null };
    },
    'console.settings': async (client, payload) => {
      const session = h.sessions.items.get(payload.id);
      if (client.selected !== payload.id || !session?.alive || session.launchId !== payload.launchId || session.consoleKey !== payload.consoleKey || session.accountId !== payload.accountId) throw new Error('This console changed. Reopen the model choices.');
      return h.sessions.switchSettings({ id: payload.id, launchId: payload.launchId, model: payload.model, effort: payload.effort, confirmConversationReload: payload.confirmConversationReload });
    },
    'console.switch': async (client, payload) => {
      const session = h.sessions.items.get(payload.id);
      if (client.selected !== payload.id || !session?.alive || session.launchId !== payload.launchId || session.consoleKey !== payload.consoleKey || session.accountId !== payload.accountId) throw new Error('This console changed. Open its account menu again.');
      return h.sessions.switchAccount({ id: payload.id, launchId: payload.launchId, targetAccountId: payload.targetAccountId });
    },
    'console.rename': async (client, payload) => {
      const session = currentManagedSession(h, client, payload);
      if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.length > 64 || /[\x00-\x1f\x7f]/.test(payload.name)) throw new Error('Use a name from 1 to 64 characters, on one line.');
      h.sessions.rename(payload.id, payload.name.trim());
      h.results.renameConsole(session.consoleKey, session.name);
      return true;
    },
    'console.project': async (client, payload) => {
      currentManagedSession(h, client, payload);
      const project = typeof payload.projectId === 'string' ? h.sessions.projects?.get(payload.projectId) : null;
      if (payload.projectId !== null && (!project || project.status === 'archived')) throw new Error('Choose an existing project on this PC.');
      return h.sessions.assignProject(payload.id, payload.projectId);
    },
    'console.setup': async (client, payload) => {
      const session = h.sessions.items.get(payload.id);
      if (client.selected !== payload.id || !session?.alive || session.launchId !== payload.launchId || session.consoleKey !== payload.consoleKey || session.accountId !== payload.accountId) throw new Error('This console changed. Open its account menu again.');
      return h.sessions.createSetupConsole({ id: payload.id, launchId: payload.launchId, targetAccountId: payload.targetAccountId });
    },
    'console.agents': async () => consoleChoices(h.sessions, h.defaults()),
    'console.models': async (client, payload) => {
      if (!consoleFeaturesFor(payload.provider).mobileModelChoices) return { models: [], livePicker: false };
      const session = payload.id ? h.sessions.items.get(payload.id) : null;
      if (payload.id && (client.selected !== payload.id || !session?.alive || session.provider !== payload.provider || session.launchId !== payload.launchId || session.accountId !== payload.accountId || session.consoleKey !== payload.consoleKey)) throw new Error('This console changed. Reopen the model choices.');
      if (!h.hasModels()) return { models: [], livePicker: false };
      const models = await h.models(payload.provider, session?.accountId);
      if (!h.authorized(client)) throw new Error('Connection changed.');
      if (session && (client.selected !== payload.id || h.sessions.items.get(payload.id) !== session || session.launchId !== payload.launchId || !session.alive)) throw new Error('This console changed. Reopen the model choices.');
      h.sessions.mobileModels ||= new Map();
      h.sessions.mobileModels.set(payload.provider, new Set(models.map(x => x.id)));
      return { models, livePicker: true, settingsSupported: typeof h.sessions.switchSettings === 'function', reloadsConversation: true };
    },
    'console.files': async (client, payload) => {
      const session = h.sessions.items.get(payload.id);
      if (session?.remote) throw new Error('Remote files are available through the SSH terminal.');
      if (client.selected !== payload.id || !session || session.dismissed) throw new Error('Select an open console first.');
      if (client.fileRequest) throw new Error('Wait for the file list.');
      client.fileRequest = true;
      try {
        const value = await consoleFiles(session, payload);
        if (!h.authorized(client) || client.selected !== payload.id || h.sessions.items.get(payload.id) !== session || session.dismissed) throw new Error('Console or connection changed. Reopen Files.');
        return value;
      } finally { client.fileRequest = false; }
    },
    'console.close': async (client, payload) => {
      const session = h.sessions.items.get(payload.id), endMobileSession = h.endMobileSession();
      if (payload.confirm !== true || client.selected !== payload.id || !session || session.dismissed) throw new Error('Confirm closing the selected console.');
      if (session.worktree) {
        if (!endMobileSession || !['keep', 'remove'].includes(payload.worktree) || (session.launchId || null) !== (payload.launchId || null)) throw new Error('Choose how to close this worktree console.');
        const valid = () => h.authorized(client) && client.selected === payload.id && h.sessions.items.get(payload.id) === session && !session.dismissed && (session.launchId || null) === (payload.launchId || null);
        if (!await endMobileSession(payload.id, payload.worktree, valid)) throw new Error('Console changed.');
      } else await h.sessions.end(payload.id);
      client.selected = '';
      return true;
    }
  };
}

function currentManagedSession(h, client, payload) {
  const session = h.sessions.items.get(payload.id);
  if (client.selected !== payload.id || !session?.alive || session.dismissed ||
      typeof payload.consoleKey !== 'string' || !payload.consoleKey ||
      !(typeof payload.launchId === 'string' && payload.launchId || payload.launchId === null && session.remote && !session.launchId) ||
      session.consoleKey !== payload.consoleKey || (session.launchId || null) !== payload.launchId) {
    throw new Error('This console changed. Open its menu again.');
  }
  return session;
}

module.exports = { mobileConsoleCommands };
