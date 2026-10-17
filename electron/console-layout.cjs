'use strict';
const live = items => [...items].filter(x => x.alive || x.restoreError);
function gridSize(raw = {}) {
  const columns = raw.columns ?? 3, rows = raw.rows ?? 3;
  if (![columns, rows].every(x => Number.isInteger(x) && x >= 2 && x <= 8)) throw new Error('Use 2 to 8 rows and columns.');
  return { columns, rows };
}
function cells({ slot, width = 1, height = 1 }, grid) {
  const { columns, rows } = gridSize(grid);
  if (![slot, width, height].every(Number.isInteger) || slot < 1 || slot > columns * rows || width < 1 || height < 1 || width > columns || height > rows) throw new Error('Choose a size inside the console grid.');
  const col = (slot - 1) % columns, row = Math.floor((slot - 1) / columns);
  if (col + width > columns || row + height > rows) throw new Error('That console would extend outside the grid.');
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => slot + y * columns + x)).flat();
}
const occupied = (items, grid) => new Set(live(items).flatMap(item => cells(item, grid)));
function planLayout(items, change, grid) {
  const { columns, rows } = gridSize(grid), capacity = columns * rows;
  const current = live(items), item = current.find(x => x.id === change.id);
  if (!item) throw new Error('This console is no longer open.');
  const width = change.width ?? item.width ?? 1, height = change.height ?? item.height ?? 1;
  let slot = change.slot ?? item.slot;
  if (!Number.isInteger(slot) || slot < 1 || slot > capacity) throw new Error('Choose a slot inside the console grid.');
  // Near an edge, anchor the panel inward so its full footprint stays in the grid.
  slot = Math.min(Math.floor((slot - 1) / columns), rows - height) * columns + Math.min((slot - 1) % columns, columns - width) + 1;
  const first = { id: item.id, slot, width, height }, taken = new Set(cells(first, grid));
  const rest = current.filter(x => x.id !== item.id).map(x => ({ id: x.id, slot: x.slot, width: x.width || 1, height: x.height || 1 }));
  if (width * height + rest.reduce((sum, x) => sum + x.width * x.height, 0) > capacity) throw new Error('There isn’t enough room for this size. Shrink another console first.');
  const other = change.slot === undefined ? null : rest.find(x => cells(x, grid).includes(slot));
  rest.sort((a, b) => b.width * b.height - a.width * a.height);
  let attempts = 0;
  const pack = (index, used, result) => {
    if (++attempts > 20000) return null;
    if (index === rest.length) return result;
    const next = rest[index], preferred = next === other ? item.slot : next.slot;
    const candidates = [...new Set([preferred, next.slot, ...Array.from({ length: capacity }, (_, i) => i + 1)])];
    for (const anchor of candidates) {
      const placed = { ...next, slot: anchor }; let area;
      try { area = cells(placed, grid); } catch { continue; }
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
function planOpening(items, raw = {}, size) {
  let grid = gridSize(size), plan = live(items).map(x => ({ id: x.id, slot: x.slot, width: x.width || 1, height: x.height || 1 }));
  const width = raw.width ?? 1, height = raw.height ?? 1;
  const free = () => {
    const used = new Set(plan.flatMap(x => cells(x, grid)));
    return Array.from({ length: grid.columns * grid.rows }, (_, i) => i + 1).find(slot => {
      try { return cells({ slot, width, height }, grid).every(x => !used.has(x)); } catch { return false; }
    });
  };
  if (raw.slot != null) {
    const slot = Number(raw.slot), used = new Set(plan.flatMap(x => cells(x, grid)));
    if (cells({ slot, width, height }, grid).some(x => used.has(x))) throw new Error('That space is already open.');
    return { grid, plan, slot, width, height };
  }
  let slot = free();
  if (!slot && width === 1 && height === 1) {
    const largest = [...plan].sort((a, b) => b.width * b.height - a.width * a.height || b.slot - a.slot).find(x => x.width > 1 || x.height > 1);
    if (largest) { if (largest.width >= largest.height && largest.width > 1) largest.width--; else largest.height--; slot = free(); }
  }
  while (!slot && (grid.rows < 8 || grid.columns < 8)) {
    if (grid.rows < 8) grid = { ...grid, rows: grid.rows + 1 };
    else {
      plan = plan.map(x => ({ ...x, slot: Math.floor((x.slot - 1) / grid.columns) * (grid.columns + 1) + (x.slot - 1) % grid.columns + 1 }));
      grid = { ...grid, columns: grid.columns + 1 };
    }
    slot = free();
  }
  if (!slot) throw new Error('All 64 console spaces are in use. End a console to make room.');
  return { grid, plan, slot, width, height };
}
function planGrid(items, previous, next) {
  const grid = gridSize(next), plan = live(items).map(x => {
    const column = (x.slot - 1) % previous.columns, row = Math.floor((x.slot - 1) / previous.columns);
    const width = x.width || 1, height = x.height || 1;
    if (column + width > grid.columns || row + height > grid.rows) throw new Error('Shrink or move your panels before reducing the grid.');
    return { id: x.id, slot: row * grid.columns + column + 1, width, height };
  });
  const used = new Set();
  // Keep every panel's size; reject a smaller grid that would hide one.
  for (const item of plan) {
    let area;
    try { area = cells(item, grid); } catch { throw new Error('Shrink or move your panels before reducing the grid.'); }
    if (area.some(x => used.has(x))) throw new Error('Move your panels before reducing the grid.');
    area.forEach(x => used.add(x));
  }
  return { grid, plan };
}
module.exports = { cells, occupied, planLayout, planOpening, planGrid, gridSize };
