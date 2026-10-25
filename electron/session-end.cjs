'use strict';

async function endSession(id, { sessions, getSettings, persistSettings, dialog, window, testMode, worktrees }) {
  const open = session => !session.dismissed && (session.alive || session.restoreError);
  const sameLaunch = session => (session.launchId || null) === (target.launchId || null);
  const target = sessions.list().find(session => session.id === id && open(session));
  if (!target) throw new Error('Console not found.');

  const current = getSettings();
  let removeWorktree = false;
  if (!testMode && current.confirmConsoleEnd !== false) {
    const savedOnly = !!target.restoreError && !target.alive;
    // A worktree console can also remove its folder, but only when nothing is uncommitted.
    const tree = target.worktree && worktrees ? await worktrees.status(target.worktree).catch(() => null) : null;
    const removable = !!tree && !tree.dirty;
    const treeDetail = !target.worktree ? '' : removable
      ? `\n\nIts worktree has no uncommitted changes. Removing it keeps the branch ${target.worktree.branch}${tree.ahead ? ` and its ${tree.ahead} commit${tree.ahead === 1 ? '' : 's'}` : ''} for merging.`
      : `\n\nIts worktree ${tree ? 'has uncommitted changes, so Paddock keeps it' : 'stays'} at ${target.worktree.path} on branch ${target.worktree.branch}.`;
    const { response } = await dialog.showMessageBox(window, {
      type: 'question',
      buttons: [savedOnly ? 'Keep saved console' : 'Keep running', savedOnly ? 'Remove saved console' : 'End console', ...(removable ? ['End and remove worktree'] : [])],
      defaultId: 0,
      cancelId: 0,
      message: `${savedOnly ? 'Remove' : 'End'} “${target.name}”?`,
      detail: (savedOnly ? 'This removes the saved console details. No process is running.' : 'This stops the console and any agent running inside it.') + treeDetail
    });
    if (response !== 1 && response !== 2) return false;
    removeWorktree = response === 2;
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
  // Remove after the process stops, so no agent still holds files in the folder.
  if (removeWorktree) await worktrees.remove(target.worktree);
  return true;
}

module.exports = { endSession };
