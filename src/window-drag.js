export function windowDragging(call, getState) {
  let drag;
  document.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-window-drag]');
    if (!handle || event.button !== 0) return;
    event.preventDefault(); handle.setPointerCapture(event.pointerId);
    document.body.classList.add('window-dragging');
    drag = { handle, id: event.pointerId, start: { x: event.screenX, y: event.screenY }, started: false, chain: Promise.resolve() };
  });
  document.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const current = drag, point = { x: event.screenX, y: event.screenY };
    if (!current.started && Math.hypot(point.x - current.start.x, point.y - current.start.y) < 4) return;
    if (!current.started) {
      current.started = true;
      current.chain = call('window.drag', { action: 'start', ...current.start });
    }
    current.latest = point;
    if (current.scheduled) return;
    current.scheduled = true;
    current.chain = current.chain.then(() => { current.scheduled = false; return call('window.drag', { action: 'move', ...current.latest }); }).catch(() => {});
  });
  const end = event => {
    if (!drag || drag.id !== event.pointerId) return;
    const current = drag; drag = null;
    document.body.classList.remove('window-dragging');
    if (current.started) current.chain.then(() => call('window.drag', { action: 'end' })).catch(() => {});
  };
  document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end); document.addEventListener('lostpointercapture', end);
  document.addEventListener('dblclick', event => {
    if (event.target.closest('[data-window-drag]')) call('mode', getState().mode === 'fullscreen' ? 'dashboard' : 'fullscreen').catch(() => {});
  });
}
