// Interface icons. Each SVG gets its own gradient id so the theme accents
// apply per icon.
const paths = {
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  terminal: '<path d="m5 7 5 5-5 5m8 0h6"/>',
  chart: '<path d="M4 20V10m8 10V4m8 16v-7"/>',
  api: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-5 2 2-18"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  restore: '<path d="M8 3v5H3m13-5v5h5M3 16h5v5m8 0v-5h5"/>',
  corner: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M13 4v7h8"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8m0-13v5h-5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  power: '<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 4h7a2 2 0 0 1 2 2v10H3Z"/>',
  folders: '<path d="M7 4h4l2 3h7a1 1 0 0 1 1 1v10M3 8h5l2 3h7a1 1 0 0 1 1 1v8H3Z"/>',
  clipboard: '<path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m8 12 2 2 5-5M8 18h7"/>',
  result: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6m-12 6 3 3 5-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  minus: '<path d="M5 12h14"/>',
  menu: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  dock: '<path d="M8 3.5H5.5a2 2 0 0 0-2 2V8m13-4.5h2.5a2 2 0 0 1 2 2V8m0 8v2.5a2 2 0 0 1-2 2H16m-8 0H5.5a2 2 0 0 1-2-2V16"/><path d="m12 6 1.8 4.2L18 12l-4.2 1.8L12 18l-1.8-4.2L6 12l4.2-1.8Z"/>',
  star: '<path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7Z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h7M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.7 5.7 3.7 9s-1.2 6.3-3.7 9c-2.5-2.7-3.7-5.7-3.7-9S9.5 5.7 12 3Z"/>'
};
let iconSequence = 0;
export const icon = (name, cls = '') => { const id = `accent-icon-${++iconSequence}`; return `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#${id})" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop class="icon-blue"/><stop offset="1" class="icon-pink"/></linearGradient></defs>${paths[name] || paths.terminal}</svg>`; };
// The "Pa" tile. Its edge and letters follow the current theme's accents.
export const pdMark = (cls = '') => { const id = `pd-mark-${++iconSequence}`; return `<svg class="pd-mark ${cls}" viewBox="0 0 256 256" aria-hidden="true"><defs><linearGradient id="${id}" x1="20" y1="20" x2="236" y2="236" gradientUnits="userSpaceOnUse"><stop class="icon-blue"/><stop offset="1" class="icon-pink"/></linearGradient></defs><rect x="10" y="10" width="236" height="236" rx="50" fill="#0e0c1c"/><rect x="17" y="17" width="222" height="222" rx="44" fill="none" stroke="url(#${id})" stroke-width="10"/><g fill="none" stroke="url(#${id})" stroke-width="20"><path d="M70 188V76h34a29 29 0 0 1 0 58H70" stroke-linejoin="round"/><circle cx="158" cy="159" r="25"/><path d="M183 134v56"/></g></svg>`; };
