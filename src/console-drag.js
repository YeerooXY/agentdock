export function consoleDragging({ call, toast, motion }) {
  let drag, moving = false;
  const position = event => {
    if (!drag?.preview || drag.finishing || (!event.clientX && !event.clientY)) return;
    const preview = drag.preview;
    preview.style.left = Math.max(8, Math.min(innerWidth - preview.offsetWidth - 8, event.clientX + 18)) + 'px';
    preview.style.top = Math.max(8, Math.min(innerHeight - preview.offsetHeight - 8, event.clientY + 18)) + 'px';
  };
  function clear(g = drag) {
    if (!g || drag !== g) return;
    document.querySelectorAll('.console-drop-target, .console-dragging, .console-settling').forEach(x => x.classList.remove('console-drop-target', 'console-dragging', 'console-settling'));
    g.preview?.remove(); drag = null; motion.finish();
  }
  function previewSlot(g, slot) {
    if (g.slot === slot) return g.pending;
    g.slot = slot; g.valid = false;
    g.pending = call('session.layout.preview', { id: g.id, slot }).then(plan => {
      if (drag !== g || g.slot !== slot) return;
      g.valid = true; motion.preview(plan);
      document.querySelector(`[data-console-id="${g.id}"]`)?.classList.add('console-drop-target');
    }).catch(error => { if (drag === g && g.slot === slot) g.error = error.message; });
    return g.pending;
  }
  async function drop(g, slot) {
    g.finishing = true;
    try {
      await previewSlot(g, slot);
      if (!g.valid) throw Error(g.error || 'That console cannot fit here.');
      await call('session.move', { id: g.id, slot });
      motion.finish(true);
      const panel = document.querySelector(`[data-console-id="${g.id}"]`);
      if (!panel || !g.preview) return;
      panel.classList.add('console-settling');
      // Expand the frozen terminal into its final panel; its live input stays unique.
      const target = panel.getBoundingClientRect(), from = g.preview.getBoundingClientRect();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        g.preview.classList.add('settling');
        await g.preview.animate([
          { transform: 'none', opacity: .96 },
          { transform: `translate(${target.left - from.left}px,${target.top - from.top}px) scale(${target.width / from.width},${target.height / from.height})`, opacity: 1 }
        ], { duration: 280, easing: 'cubic-bezier(.22,.8,.22,1)', fill: 'forwards' }).finished;
      }
    } catch (error) { toast(error.message, true); }
    finally { clear(g); }
  }
  document.addEventListener('dragstart', event => {
    const handle = event.target.closest('[data-console-drag]');
    if (!handle || moving || drag) return;
    if (!motion.begin()) { event.preventDefault(); return; }
    const id = handle.dataset.consoleDrag, card = handle.closest('.session-card'), rect = card.getBoundingClientRect();
    drag = { id };
    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-paddock-console', id);
    const copy = card.cloneNode(true), scale = Math.min(1, 440 / rect.width, 280 / rect.height);
    copy.querySelectorAll('canvas').forEach((canvas, i) => canvas.getContext('2d')?.drawImage(card.querySelectorAll('canvas')[i], 0, 0));
    copy.querySelectorAll('[id]').forEach(node => {
      const old = node.id; node.id = `drag-${old}`;
      copy.querySelectorAll('[stroke]').forEach(svg => { if (svg.getAttribute('stroke') === `url(#${old})`) svg.setAttribute('stroke', `url(#drag-${old})`); });
    });
    for (const node of [copy, ...copy.querySelectorAll('*')]) for (const attr of [...node.attributes]) if (attr.name.startsWith('data-')) node.removeAttribute(attr.name);
    copy.style.cssText = `width:${rect.width}px;height:${rect.height}px;transform:scale(${scale});transform-origin:top left;display:flex;flex-direction:column;position:absolute;margin:0`;
    const preview = document.createElement('div'); preview.className = 'console-drag-preview'; preview.inert = true; preview.setAttribute('aria-hidden', 'true');
    preview.style.width = rect.width * scale + 'px'; preview.style.height = rect.height * scale + 'px'; preview.append(copy); document.body.append(preview); drag.preview = preview;
    const blank = document.createElement('canvas'); blank.width = blank.height = 1;
    event.dataTransfer.setDragImage(blank, 0, 0); position(event); card.classList.add('console-dragging');
  });
  document.addEventListener('dragover', event => {
    if (!drag || drag.finishing) return;
    position(event);
    const slot = motion.slotAt(event); if (!slot) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move'; void previewSlot(drag, slot);
  });
  document.addEventListener('drop', event => {
    if (!drag || drag.finishing) return;
    event.preventDefault(); const slot = motion.slotAt(event);
    if (slot) drag.done = drop(drag, slot); else clear();
  });
  document.addEventListener('dragend', () => { if (!drag?.finishing) clear(); });
  document.addEventListener('drag', position);
  window.addEventListener('blur', () => { if (!drag?.finishing) clear(); });
  document.addEventListener('keydown', event => {
    if (drag && !drag.finishing && event.key === 'Escape') { clear(); return; }
    const handle = event.target.closest('[data-console-drag]');
    if (!handle || !event.altKey || !/^[1-9]$/.test(event.key) || moving || (motion.active && !drag?.finishing)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    moving = true;
    const id = handle.dataset.consoleDrag;
    Promise.resolve(drag?.done).then(() => call('session.move', { id, slot: Number(event.key) })).catch(error => toast(error.message, true)).finally(() => {
      moving = false; document.querySelector(`[data-console-drag="${id}"]`)?.focus();
    });
  }, true);
}
