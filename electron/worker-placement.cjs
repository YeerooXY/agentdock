'use strict';
const { cells, gridSize } = require('./console-layout.cjs');

// Presentation only. Workers and their processes are owned by the task runner.
class WorkerPlacement {
  constructor({ grid, mainItems, protectedConsole = () => true, cap = 4 }) {
    this.grid = grid; this.mainItems = mainItems; this.protectedConsole = protectedConsole;
    this.panels = new Map(); this.reservations = new Map(); this.selectedPage = 'main'; this.setCap(cap);
  }
  setCap(cap) {
    if (!Number.isInteger(cap) || cap < 4 || cap > 6) throw new Error('Choose a worker panel limit from 4 to 6.');
    this.cap = cap;
    // Lowering the limit never hides protected panels or stops a worker.
    const automatic = [...this.panels.values()].filter(p => p.page !== 'hidden' && !this.protectedConsole(p.consoleKey));
    while (automatic.length > cap) { const panel = automatic.pop(); panel.page = 'hidden'; panel.slot = null; }
  }
  selectPage(page) { this.selectedPage = page; }
  pageItems(page) {
    return [...(page === 'main' ? this.mainItems() : []), ...[...this.panels.values()].filter(p => p.page === page),
      ...[...this.reservations.values()].filter(p => p.page === page)];
  }
  vacant(page, width, height) {
    const grid = gridSize(this.grid()), used = new Set();
    for (const p of this.pageItems(page)) {
      if (p.dismissed || (p.alive === false && !p.restoreError)) continue;
      for (const cell of cells(p, grid)) used.add(cell);
    }
    return Array.from({ length: grid.columns * grid.rows }, (_, i) => i + 1).find(slot => {
      try { return cells({ slot, width, height }, grid).every(cell => !used.has(cell)); } catch { return false; }
    });
  }
  reserve(panel) {
    if (!panel?.consoleKey || !panel.projectId || !panel.taskId || !panel.launchId || this.panels.has(panel.consoleKey) || this.reservations.has(panel.consoleKey)) throw new Error('Choose a new worker with a project and launch ID.');
    const width = panel.width ?? 1, height = panel.height ?? 1;
    const count = [...this.panels.values(), ...this.reservations.values()].filter(p => p.page !== 'hidden' && !this.protectedConsole(p.consoleKey)).length;
    let page = 'hidden', slot = null;
    if (count < this.cap) {
      slot = this.vacant('main', width, height); page = 'main';
      if (!slot) { page = `project:${panel.projectId}`; slot = this.vacant(page, width, height); }
      if (!slot) page = 'hidden';
    }
    const reservation = { ...panel, width, height, page, slot: slot || null, alive: true };
    this.reservations.set(panel.consoleKey, reservation);
    return { ...reservation };
  }
  commit(consoleKey, launchId) {
    const item = this.reservations.get(consoleKey);
    if (!item || item.launchId !== launchId) throw new Error('The worker reservation changed.');
    this.reservations.delete(consoleKey);
    // Recheck both the footprint and the cap after owner activity and concurrent openings.
    const count = [...this.panels.values(), ...this.reservations.values()].filter(p => p.page !== 'hidden' && !this.protectedConsole(p.consoleKey)).length;
    if (item.page !== 'hidden') {
      const grid = gridSize(this.grid()), used = new Set();
      for (const p of this.pageItems(item.page)) if (!p.dismissed && (p.alive !== false || p.restoreError)) for (const cell of cells(p, grid)) used.add(cell);
      let valid = false;
      try { valid = cells(item, grid).every(cell => !used.has(cell)); } catch {}
      // A protected reservation is retained on conflict; its caller must cancel it or retry after resolving the conflict.
      if (!valid && this.protectedConsole(item.consoleKey)) { this.reservations.set(consoleKey, item); throw new Error('The protected worker placement changed.'); }
      if (!valid || (count >= this.cap && !this.protectedConsole(item.consoleKey))) { item.page = 'hidden'; item.slot = null; }
    }
    this.panels.set(consoleKey, item); return { ...item };
  }
  cancel(consoleKey, launchId) {
    if (this.reservations.get(consoleKey)?.launchId === launchId) this.reservations.delete(consoleKey);
  }
  hide(consoleKey, launchId) {
    const item = this.panels.get(consoleKey);
    if (!item || item.launchId !== launchId) throw new Error('The worker changed.');
    if (this.protectedConsole(consoleKey)) throw new Error('Release this worker to the hub first.');
    item.page = 'hidden'; item.slot = null;
  }
  snapshot() { return [...this.panels.values()].map(p => ({ ...p })); }
}

function consoleCapabilities(item, owners, bridge = false) {
  const worker = !!item.taskId;
  return { worker, ownerManaged: !!owners?.records?.get(item.consoleKey)?.ownerManaged,
    close: !worker, switch: !worker, setup: !worker, manage: !worker, queue: !worker,
    ...(worker && bridge ? { steering: item.steeringSupported === true && ['codex', 'claude', 'kiro'].includes(item.provider), stopWorker: true } : {}) };
}
module.exports = { WorkerPlacement, consoleCapabilities };
