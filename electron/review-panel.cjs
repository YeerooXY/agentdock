'use strict';

// Closing the grid view never stops its delegation process.
function closeReviewPanel(id, { sessions, getSettings, persistSettings }) {
  const panel = sessions.items.get(id);
  if (panel?.kind !== 'review') throw new Error('Open a review panel first.');
  const settings = getSettings(), slotNames = { ...settings.slotNames };
  delete slotNames[panel.slot];
  persistSettings({ ...settings, slotNames });
  sessions.end(id);
}

module.exports = { closeReviewPanel };
