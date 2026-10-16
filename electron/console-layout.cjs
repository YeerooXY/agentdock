'use strict';
const live = items => [...items].filter(x => x.alive || x.restoreError);
function cells({ slot, width = 1, height = 1 }) {
  if (![slot, width, height].every(Number.isInteger) || slot < 1 || slot > 9 || width < 1 || height < 1 || width > 3 || height > 3) throw new Error('Choose a size from 1 × 1 to 3 × 3.');
  const col = (slot - 1) % 3, row = Math.floor((slot - 1) / 3);
  if (col + width > 3 || row + height > 3) throw new Error('That console would extend outside the grid.');
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => slot + y * 3 + x)).flat();
}
const occupied = items => new Set(live(items).flatMap(cells));
function planLayout(items, change) {
  const current = live(items), item = current.find(x => x.id === change.id);
  if (!item) throw new Error('This console is no longer open.');
  const width = change.width ?? item.width ?? 1, height = change.height ?? item.height ?? 1;
  let slot = change.slot ?? item.slot;
  if (!Number.isInteger(slot) || slot < 1 || slot > 9) throw new Error('Choose a console slot from 1 to 9.');
  // Near an edge, anchor the panel inward so its full footprint stays in the grid.
  slot = Math.min(Math.floor((slot - 1) / 3), 3 - height) * 3 + Math.min((slot - 1) % 3, 3 - width) + 1;
  const first = { id: item.id, slot, width, height }, taken = new Set(cells(first));
  const rest = current.filter(x => x.id !== item.id).map(x => ({ id: x.id, slot: x.slot, width: x.width || 1, height: x.height || 1 }));
  if (width * height + rest.reduce((sum, x) => sum + x.width * x.height, 0) > 9) throw new Error('There isn’t enough room for this size. Shrink another console first.');
  const other = change.slot === undefined ? null : rest.find(x => cells(x).includes(slot));
  rest.sort((a, b) => b.width * b.height - a.width * a.height);
  const pack = (index, used, result) => {
    if (index === rest.length) return result;
    const next = rest[index], preferred = next === other ? item.slot : next.slot;
    const candidates = [...new Set([preferred, next.slot, ...Array.from({ length: 9 }, (_, i) => i + 1)])];
    for (const anchor of candidates) {
      const placed = { ...next, slot: anchor }; let area;
      try { area = cells(placed); } catch { continue; }
      if (area.some(x => used.has(x))) continue;
      const found = pack(index + 1, new Set([...used, ...area]), [...result, placed]);
      if (found) return found;
    }
    return null;
  };
  const result = pack(0, taken, [first]);
  if (!result) throw new Error('These console sizes won’t fit together. Shrink another console first.');
  return result;
}
module.exports = { cells, occupied, planLayout };
