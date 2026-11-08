// Grid geometry and panel facts shared by the console grid, HUD and chooser.
// No asset or DOM imports, so Node tests can load it.
import { icon } from '../ui/icons.js';

export const launchHint = 'title="Click to open. Hold or right-click to choose." aria-haspopup="dialog"';
export const isOpenConsole = session => !!session && !session.dismissed && (session.alive || session.restoreError);
export const isReady = session => !session.dismissed && session.alive && ['ready', 'attention'].includes(session.state);
export const gridSize = state => state?.grid || { columns: 3, rows: 3 };
export const gridCapacity = state => gridSize(state).columns * gridSize(state).rows;
export const allPanels = state => [...(state?.sessions || []), ...(state?.codePanels || [])].filter(item => !item.hidden && !['code', 'web'].includes(item.kind));
// Every grid cell an open panel covers, mapped to that panel.
export function coveredSlots(state) {
  return new Map(allPanels(state).filter(isOpenConsole).flatMap(x => Array.from({ length: x.height || 1 }, (_, y) => Array.from({ length: x.width || 1 }, (_, dx) => [x.slot + y * gridSize(state).columns + dx, x])).flat()));
}
export function openPanel(state, id) {
  return allPanels(state).find(item => item.id === id && isOpenConsole(item)) || null;
}
export function resizeHandles(slot) {
  return Object.entries({ n: 'top', e: 'right', s: 'bottom', w: 'left', ne: 'top right', nw: 'top left', se: 'bottom right', sw: 'bottom left' }).map(([edge, name]) => `<button class="console-resize" data-resize-edge="${edge}" aria-label="Resize console ${slot} from ${name}" title="Drag to resize. Arrow keys resize one grid cell; Escape cancels."></button>`).join('');
}
export function newConsoleMark() {
  return `<span class="new-console-mark" aria-hidden="true">${icon('plus')}<span class="new-console-label"><span>New console</span></span></span>`;
}
