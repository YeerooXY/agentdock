export function holdToChoose({ onChoose, disabled }) {
  const selector = 'button[data-action="new"]';
  let press = null, suppressed = null;
  const target = event => event.target.closest?.(selector);
  const sameButton = (a, b) => a === b || (a?.dataset.slot && a.dataset.slot === b?.dataset.slot);
  function clear(suppress = false) {
    if (!press) return;
    clearTimeout(press.timer); press.button.classList.remove('is-holding');
    if (suppress || press.fired) suppressed = press.button;
    press = null;
  }
  function begin(button, details) {
    clear(); suppressed = null;
    if (button.disabled || disabled()) return;
    press = { button, ...details, fired: false };
    button.classList.add('is-holding');
    press.timer = setTimeout(() => {
      if (!press || !button.isConnected || disabled()) { clear(true); return; }
      press.fired = true; suppressed = button; button.classList.remove('is-holding');
      onChoose(button);
    }, 450);
  }
  document.addEventListener('pointerdown', event => {
    const button = target(event);
    if (!button || event.button !== 0 || !event.isPrimary) return;
    begin(button, { pointerId: event.pointerId, x: event.clientX, y: event.clientY });
    if (press) button.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove', event => {
    if (press?.pointerId === event.pointerId && !press.fired && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) clear(true);
  });
  document.addEventListener('pointerup', event => {
    if (press?.pointerId !== event.pointerId) return;
    if (press.fired) event.preventDefault();
    clear();
  });
  document.addEventListener('pointercancel', () => clear(true));
  document.addEventListener('lostpointercapture', event => { if (press?.pointerId === event.pointerId) clear(true); });
  document.addEventListener('click', event => {
    const button = target(event);
    if (button && sameButton(button, suppressed)) {
      suppressed = null; event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('contextmenu', event => {
    const button = target(event); if (!button) return;
    event.preventDefault(); clear(true);
    if (!button.disabled && !disabled()) onChoose(button);
  });
  document.addEventListener('keydown', event => {
    if (press?.key === ' ' && press.fired && event.key === ' ') { event.preventDefault(); return; }
    const button = target(event); if (!button) return;
    if (event.key === 'Enter' && !event.shiftKey) { clear(); suppressed = null; return; }
    if ((event.key === 'Enter' && event.shiftKey) || event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault(); clear(true);
      if (!event.repeat && !button.disabled && !disabled()) onChoose(button);
    } else if (event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) begin(button, { key: ' ' });
    }
  });
  document.addEventListener('keyup', event => {
    if (event.key !== ' ' || press?.key !== ' ') return;
    event.preventDefault();
    const { button, fired } = press; clear();
    if (!fired && button.isConnected) button.click();
  });
  window.addEventListener('blur', () => clear(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(true); });
  return { get active() { return !!press; }, cancel: () => clear(true) };
}
