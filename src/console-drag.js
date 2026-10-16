export function consoleDragging({ call, toast }) {
  let id = null, target = null, moving = false;
  const clear = () => {
    document.querySelectorAll('.console-drop-target, .console-dragging').forEach(x => x.classList.remove('console-drop-target', 'console-dragging'));
    target = null; id = null;
  };
  const move = async (session, slot) => {
    if (moving) return;
    moving = true;
    try { await call('session.move', { id: session, slot }); }
    catch (error) { toast(error.message, true); }
    finally { moving = false; clear(); }
  };
  document.addEventListener('dragstart', event => {
    const handle = event.target.closest('[data-console-drag]');
    if (!handle) return;
    id = handle.dataset.consoleDrag;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-agent-dock-console', id);
    handle.closest('.session-card')?.classList.add('console-dragging');
  });
  document.addEventListener('dragover', event => {
    if (!id) return;
    const card = event.target.closest('.session-card[data-slot]');
    if (!card) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    if (target !== card) { target?.classList.remove('console-drop-target'); target = card; card.classList.add('console-drop-target'); }
  });
  document.addEventListener('drop', event => {
    if (!id) return;
    event.preventDefault();
    const card = event.target.closest('.session-card[data-slot]');
    const session = id; clear();
    if (card) void move(session, Number(card.dataset.slot));
  });
  document.addEventListener('dragend', clear);
  // The same operation is available without a mouse.
  document.addEventListener('keydown', event => {
    const handle = event.target.closest('[data-console-drag]');
    if (!handle || !event.altKey || !/^[1-9]$/.test(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const session = handle.dataset.consoleDrag;
    void move(session, Number(event.key)).then(() => document.querySelector(`[data-console-drag="${session}"]`)?.focus());
  }, true);
}
