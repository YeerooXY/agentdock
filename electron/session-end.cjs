'use strict';

async function endSession(id, { sessions, getSettings, persistSettings, dialog, window, testMode }) {
  const open = session => !session.dismissed && (session.alive || session.restoreError);
  const sameLaunch = session => (session.launchId || null) === (target.launchId || null);
  const target = sessions.list().find(session => session.id === id && open(session));
  if (!target) throw new Error('Console not found.');

  const current = getSettings();
  if (!testMode && current.confirmConsoleEnd !== false) {
    const savedOnly = !!target.restoreError && !target.alive;
    const { response } = await dialog.showMessageBox(window, {
      type: 'question',
      buttons: [savedOnly ? 'Keep saved console' : 'Keep running', savedOnly ? 'Remove saved console' : 'End console'],
      defaultId: 0,
      cancelId: 0,
      message: `${savedOnly ? 'Remove' : 'End'} “${target.name}”?`,
      detail: savedOnly ? 'This removes the saved console details. No process is running.' : 'This stops the console and any agent running inside it.'
    });
    if (response !== 1) return false;
  }

  const item = sessions.list().find(session => session.id === id && open(session));
  if (!item || !sameLaunch(item) || !!item.alive !== !!target.alive) return false;
  await sessions.end(id);
  const after = sessions.list();
  // A remote stop can finish after a move or another launch. Resolve the
  // stopped launch's final slot and preserve any console now occupying it.
  const stopped = after.find(session => session.id === id && sameLaunch(session) && !open(session));
  const freedSlot = stopped?.slot ?? item.slot, freedName = stopped?.name ?? item.name;
  const replacement = after.some(session => open(session) && session.slot === freedSlot);
  const latest = getSettings(), slotNames = { ...(latest.slotNames || {}) };
  if (!replacement && slotNames[freedSlot] === freedName) {
    delete slotNames[freedSlot];
    persistSettings({ ...latest, slotNames });
  }
  return true;
}

module.exports = { endSession };
