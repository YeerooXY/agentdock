// A native dropdown closes when its element is replaced. Hold page rebuilds
// while one is open and render once it closes.
export function selectHold(render) {
  let openSelect = null, renderHeld = false;
  document.addEventListener('pointerdown', event => {
    const next = event.target instanceof HTMLSelectElement && event.target.closest('#content') ? event.target : null;
    if (openSelect && next !== openSelect && renderHeld) { renderHeld = false; queueMicrotask(render); }
    openSelect = next;
  }, true);
  for (const type of ['change', 'blur', 'keydown']) {
    document.addEventListener(type, event => {
      if (event.target !== openSelect || (type === 'keydown' && !['Escape', 'Enter', 'Tab'].includes(event.key))) return;
      openSelect = null;
      if (renderHeld) { renderHeld = false; queueMicrotask(render); }
    }, true);
  }
  // True when a render must wait for the open dropdown to close.
  return { hold() { if (!openSelect?.isConnected) return false; renderHeld = true; return true; } };
}
