'use strict';

const frameStyles = ['normal', 'classic', 'blue', 'violet', 'void', 'gamer', 'redline', 'hot-pink', 'cyber', 'icy', 'fiery'];
const lightingStyles = ['static', 'breathe', 'wave', 'spectrum', 'reactive'];

function updatedSlotTrims(current, payload, sessions, grid) {
  const slot = payload?.slot;
  if (!Number.isInteger(slot) || slot < 1 || slot > grid.columns * grid.rows) throw new Error('Choose a slot inside the console grid.');
  if (payload.style !== 'default' && !frameStyles.includes(payload.style)) throw new Error('Choose an available console color.');
  const item = sessions.find(x => x.slot === slot && (x.alive || x.restoreError));
  if ((item?.id || null) !== (payload.sessionId || null)) throw new Error('This slot has changed. Open its color control again.');
  const next = { ...current };
  if (payload.style === 'default') delete next[slot]; else next[slot] = payload.style;
  return next;
}

// Move each console's color with it, including swaps. Preserve the color of an
// empty destination in the freed slot, just as the layout keeps its name.
function moveSlotTrims(current, plan, items) {
  const next = { ...current }, origins = plan.map(x => items.get(x.id).slot);
  const displaced = plan.filter(x => !origins.includes(x.slot)).map(x => current?.[x.slot]);
  const freed = origins.filter(slot => !plan.some(x => x.slot === slot));
  for (const slot of origins) delete next[slot];
  for (let i = 0; i < freed.length; i++) {
    if (displaced[i]) next[freed[i]] = displaced[i];
  }
  for (const item of plan) {
    const value = current?.[items.get(item.id).slot];
    if (value) next[item.slot] = value; else delete next[item.slot];
  }
  return next;
}

module.exports = { frameStyles, lightingStyles, updatedSlotTrims, moveSlotTrims };
