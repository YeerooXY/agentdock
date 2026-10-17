// Layout previews move the existing terminals. PTYs are resized only after commit.
export function consoleMotion({ render, fit }) {
  let active = false;
  const animations = new Map();
  const grid = () => document.querySelector('.session-grid');
  const panels = () => [...grid().children];
  const key = panel => panel.dataset.consoleId || `empty-${panel.dataset.slot}`;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const capture = () => new Map(panels().filter(p => !p.hidden).map(p => [key(p), p.getBoundingClientRect()]));
  function animate(before) {
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
    if (reduced()) return;
    for (const panel of panels()) {
      const old = before.get(key(panel));
      if (!old || panel.hidden) continue;
      const next = panel.getBoundingClientRect();
      if (!next.width || !next.height || Math.abs(old.x - next.x) + Math.abs(old.y - next.y) + Math.abs(old.width - next.width) + Math.abs(old.height - next.height) < 1) continue;
      const animation = panel.animate([
        { transformOrigin: 'top left', transform: `translate(${old.x - next.x}px,${old.y - next.y}px) scale(${old.width / next.width},${old.height / next.height})` },
        { transformOrigin: 'top left', transform: 'none' }
      ], { duration: 240, easing: 'cubic-bezier(.22,.8,.22,1)' });
      animations.set(panel, animation);
      animation.finished.then(() => { if (animations.get(panel) === animation) animations.delete(panel); }).catch(() => {});
    }
  }
  function preview(plan) {
    if (!active) return;
    const before = capture(), covered = new Set(), { columns } = metrics();
    for (const item of plan) for (let y = 0; y < item.height; y++) for (let x = 0; x < item.width; x++) covered.add(item.slot + y * columns + x);
    for (const panel of panels()) {
      const item = plan.find(x => x.id === panel.dataset.consoleId);
      if (item) {
        panel.hidden = false;
        panel.style.gridColumn = `${(item.slot - 1) % columns + 1} / span ${item.width}`;
        panel.style.gridRow = `${Math.floor((item.slot - 1) / columns) + 1} / span ${item.height}`;
      } else panel.hidden = covered.has(Number(panel.dataset.slot));
    }
    animate(before);
  }
  function metrics() {
    const rect = grid().getBoundingClientRect(), style = getComputedStyle(grid());
    const columns = Number(style.getPropertyValue('--grid-columns')) || 3, rows = Number(style.getPropertyValue('--grid-rows')) || 3;
    return { rect, columns, rows, x: (rect.width + (parseFloat(style.columnGap) || 0)) / columns, y: (rect.height + (parseFloat(style.rowGap) || 0)) / rows };
  }
  return {
    get active() { return active; }, capture, animate, preview, metrics,
    begin() { if (active) return false; active = true; document.body.classList.add('console-layout-active'); return true; },
    finish(hold = false) { active = false; render(); active = hold; document.body.classList.toggle('console-layout-active', hold); if (!hold) fit(); },
    slotAt(event) {
      const { rect, x, y, columns, rows } = metrics();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
      return Math.min(rows - 1, Math.floor((event.clientY - rect.top) / y)) * columns + Math.min(columns - 1, Math.floor((event.clientX - rect.left) / x)) + 1;
    }
  };
}
