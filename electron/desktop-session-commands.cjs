'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { atomicJson } = require('./storage.cjs');
const { byId: cliAgents } = require('./cli-catalog.cjs');
const { occupied: occupiedCells } = require('./console-layout.cjs');
const { prepareWorktree } = require('./worktrees.cjs');
const { closeReviewPanel } = require('./review-panel.cjs');
const { updatedSlotTrims, moveSlotTrims } = require('./console-appearance.cjs');
const { endSession } = require('./session-end.cjs');
const { validateConsoleDefaults } = require('./sessions.cjs');
const { strataModels } = require('./local-models.cjs');
const { consoleModels } = require('./adapters.cjs');
const filePreview = require('./file-preview.cjs');
const { NO_VALUE } = require('./command-result.cjs');

function desktopSessionCommands(h) {
  const { sessions, accounts, projects, worktrees, getSettings, persistSettings, publish, dialog, getWindow, cliSetup,
    codePanel, messageQueue, prompts, clipboard, Menu, screenshots, shell, workbench, ownerConsoles, codexAccounts,
    credentialSwitch, root, getLimits, setLimits, setStorageError, limitAccountId } = h;
  return {
    'setup.validate': async payload => validateConsoleDefaults(payload),
    'setup.complete': async payload => {
      const consoleDefaults = validateConsoleDefaults(payload);
      if (cliAgents.has(consoleDefaults.provider) && !cliSetup.executable(consoleDefaults.provider)) throw new Error('Install this agent, then check again. You can also start with PowerShell.');
      const opened = payload.launchNow === true ? await sessions.create({ ...consoleDefaults, permissions: getSettings().agentPermissions }) : null;
      persistSettings({ ...getSettings(), consoleDefaults, setupComplete: true });
      publish(); return opened;
    },
    'pickFolder': async payload => {
      const suggested = typeof payload?.cwd === 'string' && path.isAbsolute(payload.cwd) && fs.existsSync(payload.cwd) && fs.statSync(payload.cwd).isDirectory() ? payload.cwd : getSettings().consoleDefaults.cwd;
      const result = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory'], title: 'Choose a launch folder', defaultPath: suggested });
      return result.filePaths[0] || null;
    },
    'explorer.list': async () => { throw new Error('The file explorer, Code and Preview panels have been removed.'); },
    'code.create': async () => { throw new Error('The file explorer, Code and Preview panels have been removed.'); },
    'web.create': async () => { throw new Error('The file explorer, Code and Preview panels have been removed.'); },
    'review.close': async payload => { closeReviewPanel(payload, { sessions, getSettings, persistSettings }); return NO_VALUE; },
    'code.close': async payload => closePanel('code.close', payload),
    'web.close': async payload => closePanel('web.close', payload),
    'session.create': async payload => {
      payload = payload?.projectId ? projects.launch(payload) : payload;
      const occupied = occupiedCells(sessions.items.values(), sessions.grid);
      const slot = payload?.slot ?? Array.from({ length: sessions.grid.columns * sessions.grid.rows }, (_, i) => i + 1).find(x => !occupied.has(x));
      const { accountId, worktree: ownWorktree, ...launch } = payload || {};
      if (ownWorktree) await prepareWorktree(launch, worktrees, getSettings().consoleDefaults.cwd);
      if (accountId !== undefined && !accounts?.choices(launch.provider).some(choice => choice.id === accountId && (!choice.profile || choice.loginCompletedAt))) throw new Error('Choose a signed-in account for this agent.');
      const settings = getSettings();
      const session = await sessions.create({ ...settings.consoleDefaults, ...(settings.slotNames?.[slot] ? { name: settings.slotNames[slot] } : {}), ...launch, permissions: launch.permissions ?? settings.agentPermissions }, accountId ? { accountId } : undefined);
      persistSettings({ ...getSettings(), slotNames: { ...getSettings().slotNames, [session.slot]: session.name } }); publish();
      return session;
    },
    'accounts.create': async payload => {
      const profile = accounts.create(payload?.provider, payload?.label); publish();
      return accounts.choices(profile.provider).find(item => item.id === profile.id);
    },
    'accounts.rename': async payload => {
      const renamed = accounts.rename(payload?.id, payload?.label);
      for (const session of sessions.items.values()) if (session.accountId === renamed.id) session.accountLabel = renamed.label;
      publish(); return renamed;
    },
    'accounts.remove': async payload => {
      const profile = accounts.get(payload);
      if (!profile) throw new Error('Account profile not found.');
      if ([...sessions.items.values()].some(item => item.alive && item.accountId === profile.id)) throw new Error('End the consoles using this account first.');
      const { response } = await dialog.showMessageBox(getWindow(), { type: 'warning', buttons: ['Keep account', 'Remove account'], defaultId: 0, cancelId: 0, noLink: true,
        message: `Remove ${profile.label}?`, detail: 'Paddock deletes this account\'s sign-in and settings folder. Chats stored with the provider are not affected.' });
      if (response !== 1) return NO_VALUE;
      codexAccounts.get(profile.id)?.stop(); codexAccounts.delete(profile.id);
      await credentialSwitch.remove(profile.provider, profile.id);
      accounts.remove(profile.id);
      const limits = getLimits().filter(item => limitAccountId(item) !== profile.id);
      setLimits(limits);
      try { atomicJson(path.join(root, 'limits.json'), limits); } catch (error) { setStorageError(error.message); }
      publish(); return true;
    },
    'accounts.login': async payload => { const session = await sessions.createLoginConsole(payload?.id, getSettings().consoleDefaults.cwd); publish(); return session; },
    'accounts.setup': async payload => { const session = await sessions.createSetupConsole(payload); publish(); return session; },
    'slot.trim': async payload => {
      const slotTrims = updatedSlotTrims(getSettings().slotTrims, payload, sessions.list(), sessions.grid);
      persistSettings({ ...getSettings(), slotTrims }); publish(); return NO_VALUE;
    },
    'slot.name': async payload => {
      const slot = payload?.slot;
      if (!Number.isInteger(slot) || slot < 1 || slot > sessions.grid.columns * sessions.grid.rows) throw new Error('Choose a slot inside the console grid.');
      if (typeof payload.name !== 'string' || payload.name.length > 64 || /[\x00-\x1f\x7f]/.test(payload.name)) throw new Error('Use a name up to 64 characters, on one line.');
      const item = sessions.list().find(x => x.slot === slot && (x.alive || x.restoreError));
      if ((item?.id || null) !== (payload.sessionId || null)) throw new Error('This slot has changed. Try naming it again.');
      const name = payload.name.trim(), slotNames = { ...getSettings().slotNames };
      if (name) slotNames[slot] = name; else delete slotNames[slot];
      persistSettings({ ...getSettings(), slotNames });
      if (item) { sessions.rename(item.id, name); workbench.results.renameConsole(item.consoleKey || item.id, sessions.items.get(item.id).name); } else publish();
      return NO_VALUE;
    },
    'session.models': async payload => payload === 'opencode' ? strataModels(h.hub.config.profiles) : consoleModels(payload),
    'grid.configure': async payload => { sessions.setGrid(payload); return NO_VALUE; },
    'session.layout.preview': async payload => sessions.previewLayout({ id: payload?.id, slot: payload?.slot, width: payload?.width, height: payload?.height }),
    'session.move': async payload => layoutSession({ id: payload?.id, slot: payload?.slot }),
    'session.layout': async payload => layoutSession({ id: payload?.id, slot: payload?.slot, width: payload?.width, height: payload?.height }),
    'session.retry': async payload => sessions.retry(payload),
    'session.releaseToHub': async payload => { ownerConsoles.release(payload?.consoleKey, payload?.launchId); return NO_VALUE; },
    'session.input': async payload => { sessions.write(payload?.id, payload?.data); return NO_VALUE; },
    'queue.add': async payload => messageQueue.add(payload?.id, payload?.text, { ownerRequested: true }),
    'queue.edit': async payload => { messageQueue.edit(payload?.id, payload?.entryId, payload?.text); return NO_VALUE; },
    'queue.remove': async payload => { messageQueue.remove(payload?.id, payload?.entryId); return NO_VALUE; },
    'queue.move': async payload => { messageQueue.move(payload?.id, payload?.entryId, payload?.offset); return NO_VALUE; },
    'queue.pause': async payload => { messageQueue.pause(payload?.id, payload?.paused === true); return NO_VALUE; },
    'queue.send': async payload => { await messageQueue.sendNow(payload?.id, payload?.entryId); return NO_VALUE; },
    'prompt.save': async payload => prompts.save(payload),
    'prompt.remove': async payload => { prompts.remove(payload); return NO_VALUE; },
    'clipboard.write': async payload => {
      if (typeof payload !== 'string' || payload.length > 1024 * 1024) throw new Error('Select up to 1 MB of text to copy.');
      clipboard.writeText(payload); return NO_VALUE;
    },
    'clipboard.menu': async payload => {
      if (typeof payload !== 'string' || payload.length > 1024 * 1024) throw new Error('Select up to 1 MB of text to copy.');
      Menu.buildFromTemplate([{ label: 'Copy', enabled: !!payload, click: () => clipboard.writeText(payload) }]).popup({ window: getWindow() }); return NO_VALUE;
    },
    'session.switch': async payload => sessions.switchAccount(payload),
    'screenshot.path': async payload => screenshots.pathFor(sessions.items.get(payload?.id)),
    'screenshot.clipboard': async payload => screenshots.paste(sessions.items.get(payload?.id)),
    'file.preview': async payload => {
      const item = sessions.items.get(payload?.id);
      if (item?.remote) throw new Error('This file is on the Linux machine. View it from that console, for example with cat.');
      return filePreview.preview(payload?.path, item?.cwd);
    },
    'file.open': async payload => openFile('file.open', payload),
    'file.reveal': async payload => openFile('file.reveal', payload),
    'session.resize': async payload => { sessions.resize(payload?.id, payload?.cols, payload?.rows); return NO_VALUE; },
    'session.buffer': async payload => sessions.buffer(payload),
    'session.acknowledge': async payload => { sessions.acknowledge(payload); return NO_VALUE; },
    'session.end': async payload => endSession(payload, { sessions, getSettings, persistSettings, dialog, window: getWindow(), testMode: h.testMode, worktrees })
  };

  async function closePanel(method, payload) {
    const panel = method === 'code.close' ? codePanel.panel(payload) : sessions.items.get(payload), slotNames = { ...getSettings().slotNames };
    if (method === 'web.close' && panel?.kind !== 'web') throw new Error('Open a preview panel first.');
    delete slotNames[panel.slot]; persistSettings({ ...getSettings(), slotNames });
    sessions.end(payload); return NO_VALUE;
  }

  async function layoutSession(change) {
    sessions.layout(change, plan => {
      const settings = getSettings(), slotNames = { ...settings.slotNames };
      const previous = new Set(plan.map(x => sessions.items.get(x.id).slot));
      const displaced = plan.filter(x => !previous.has(x.slot) && slotNames[x.slot]).map(x => slotNames[x.slot]);
      const freed = [...previous].filter(slot => !plan.some(x => x.slot === slot));
      for (const placed of plan) delete slotNames[sessions.items.get(placed.id).slot];
      for (let i = 0; i < displaced.length && i < freed.length; i++) slotNames[freed[i]] = displaced[i];
      for (const placed of plan) slotNames[placed.slot] = sessions.items.get(placed.id).name;
      persistSettings({ ...getSettings(), slotNames, slotTrims: moveSlotTrims(getSettings().slotTrims, plan, sessions.items) });
    });
    return NO_VALUE;
  }

  async function openFile(method, payload) {
    const file = filePreview.resolve(payload?.path);
    if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
    if (method === 'file.reveal') { shell.showItemInFolder(file); return NO_VALUE; }
    const error = await shell.openPath(file); if (error) throw new Error('Windows could not open this file: ' + error);
    return NO_VALUE;
  }
}

module.exports = { desktopSessionCommands };
