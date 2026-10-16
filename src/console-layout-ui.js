export function consoleLayoutUI({ call, getState, motion, toast }) {
  let gesture;
  const guide = document.createElement('div'); guide.className = 'console-resize-guide'; guide.hidden = true; guide.setAttribute('aria-hidden', 'true');
  guide.innerHTML = '<div class="resize-guide-cells">' + '<i></i>'.repeat(9) + '</div><div class="resize-footprint"></div>';
  const feedback = document.createElement('div'); feedback.className = 'console-resize-feedback'; feedback.hidden = true;
  feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite'); feedback.setAttribute('aria-atomic', 'true');
  feedback.innerHTML = '<span class="resize-feedback-label">Resizing</span><strong class="resize-feedback-size"></strong><span class="resize-feedback-hint"></span>';
  document.body.append(guide, feedback);
  function positionFeedback(g) {
    const point = g.point || { x: g.metrics.rect.right - 20, y: g.metrics.rect.bottom - 20 };
    const width = feedback.offsetWidth, height = feedback.offsetHeight;
    feedback.style.left = Math.max(g.metrics.rect.left + 8, Math.min(innerWidth - width - 12, point.x + 20)) + 'px';
    feedback.style.top = Math.max(12, point.y + height + 28 > innerHeight ? point.y - height - 20 : point.y + 20) + 'px';
  }
  function showFeedback(g, change, blocked = false) {
    const { rect, x, y } = g.metrics, gapX = x * 3 - rect.width, gapY = y * 3 - rect.height;
    const left = (change.slot - 1) % 3, top = Math.floor((change.slot - 1) / 3);
    guide.hidden = false; feedback.hidden = false;
    guide.dataset.state = feedback.dataset.state = blocked ? 'blocked' : 'resizing';
    guide.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;--guide-column-gap:${gapX}px;--guide-row-gap:${gapY}px`;
    guide.querySelector('.resize-footprint').style.cssText = `left:${left * x}px;top:${top * y}px;width:${change.width * x - gapX}px;height:${change.height * y - gapY}px`;
    feedback.querySelector('.resize-feedback-label').textContent = blocked ? 'Not enough room' : 'Resizing';
    feedback.querySelector('.resize-feedback-size').textContent = `${change.width} \u00d7 ${change.height}`;
    feedback.querySelector('.resize-feedback-hint').textContent = blocked ? `Release to keep ${g.session.width || 1} \u00d7 ${g.session.height || 1}` : 'Release to set \u00b7 Esc to cancel';
    guide.querySelectorAll('.resize-guide-cells i').forEach((cell, index) => {
      const col = index % 3, row = Math.floor(index / 3);
      cell.classList.toggle('selected', col >= left && col < left + change.width && row >= top && row < top + change.height);
    });
    positionFeedback(g);
  }
  function changeFor(g, dx, dy) {
    const left = (g.session.slot - 1) % 3, top = Math.floor((g.session.slot - 1) / 3);
    let l = left, t = top, r = left + (g.session.width || 1), b = top + (g.session.height || 1);
    if (g.edge.includes('e')) r = Math.max(l + 1, Math.min(3, r + dx));
    if (g.edge.includes('w')) l = Math.max(0, Math.min(r - 1, l + dx));
    if (g.edge.includes('s')) b = Math.max(t + 1, Math.min(3, b + dy));
    if (g.edge.includes('n')) t = Math.max(0, Math.min(b - 1, t + dy));
    return { id: g.session.id, slot: t * 3 + l + 1, width: r - l, height: b - t };
  }
  function preview(g, change) {
    const stamp = JSON.stringify(change);
    if (g.stamp === stamp) { positionFeedback(g); return g.pending; }
    g.stamp = stamp; g.change = change; g.valid = false;
    showFeedback(g, change);
    g.pending = call('session.layout.preview', change).then(plan => {
      if (gesture !== g || g.stamp !== stamp) return;
      g.valid = true; g.error = null; g.handle.closest('.session-card')?.classList.remove('resize-blocked'); motion.preview(plan);
    }).catch(error => {
      if (gesture !== g || g.stamp !== stamp) return;
      g.error = error.message; g.handle.closest('.session-card')?.classList.add('resize-blocked');
      showFeedback(g, change, true);
    });
    return g.pending;
  }
  async function finish(commit) {
    const g = gesture; if (!g || g.finishing) return;
    g.finishing = true;
    if (g.pointer !== undefined && g.handle.hasPointerCapture(g.pointer)) g.handle.releasePointerCapture(g.pointer);
    try {
      if (commit) {
        await g.pending;
        if (g.valid) await call('session.layout', g.change);
        else if (g.error) toast(g.error, true);
      }
    } catch (error) { toast(error.message, true); }
    finally {
      gesture = null;
      guide.hidden = true; feedback.hidden = true;
      document.body.classList.remove('console-resizing'); document.body.style.removeProperty('--resize-cursor');
      g.handle.classList.remove('resize-edge-active');
      g.handle.closest('.session-card')?.classList.remove('resize-blocked', 'console-resize-active');
      motion.finish();
      document.querySelector(`[data-console-id="${g.session.id}"] [data-resize-edge="${g.edge}"]`)?.focus({ preventScroll: true });
    }
  }
  function start(handle) {
    const session = getState().sessions.find(x => x.id === handle.closest('.session-card').dataset.consoleId);
    if (!session || !motion.begin()) return null;
    gesture = { session: { ...session }, edge: handle.dataset.resizeEdge, handle, metrics: motion.metrics() };
    handle.classList.add('resize-edge-active'); handle.closest('.session-card').classList.add('console-resize-active');
    document.body.classList.add('console-resizing');
    document.body.style.setProperty('--resize-cursor', getComputedStyle(handle).cursor);
    return gesture;
  }
  document.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-resize-edge]');
    if (!handle || event.button !== 0 || gesture) return;
    event.preventDefault();
    const g = start(handle); if (!g) return;
    g.pointer = event.pointerId; g.x = event.clientX; g.y = event.clientY; g.point = { x: event.clientX, y: event.clientY };
    handle.setPointerCapture(event.pointerId); handle.focus({ preventScroll: true });
    preview(g, changeFor(g, 0, 0));
  });
  document.addEventListener('pointermove', event => {
    const g = gesture; if (!g || g.finishing || g.pointer !== event.pointerId) return;
    g.point = { x: event.clientX, y: event.clientY };
    preview(g, changeFor(g, Math.round((event.clientX - g.x) / g.metrics.x), Math.round((event.clientY - g.y) / g.metrics.y)));
  });
  document.addEventListener('pointerup', event => { if (gesture?.pointer === event.pointerId) void finish(true); });
  document.addEventListener('pointercancel', () => void finish(false));
  document.addEventListener('lostpointercapture', () => { if (gesture && !gesture.finishing) void finish(false); });
  window.addEventListener('blur', () => void finish(false));
  window.addEventListener('resize', () => void finish(false));
  document.addEventListener('keydown', event => {
    if (gesture && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); void finish(false); return; }
    const handle = event.target.closest('[data-resize-edge]'), delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!handle || !delta || gesture) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const g = start(handle); if (!g) return;
    preview(g, changeFor(g, ...delta)); void finish(true);
  }, true);
}
