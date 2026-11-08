export async function openExecutionReport(load, opener, fallback) {
  const first = await load({ limit: 64000 });
  const dialog = document.createElement('dialog');
  dialog.className = 'file-preview execution-report';
  const heading = document.createElement('div'); heading.className = 'dialog-heading';
  const title = document.createElement('h2'); title.textContent = first.title;
  const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close';
  heading.append(title, close);
  const body = document.createElement('div'); body.className = 'file-preview-body'; body.tabIndex = 0;
  body.setAttribute('role', 'region'); body.setAttribute('aria-label', 'Execution report');
  const pre = document.createElement('pre'); pre.textContent = first.text; body.append(pre);
  dialog.setAttribute('aria-label', first.title); dialog.append(heading, body); document.body.append(dialog);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    const active = document.activeElement;
    const moved = active && active !== document.body && !dialog.contains(active) && active.isConnected && !active.disabled && active.getClientRects().length;
    dialog.remove();
    if (moved) return;
    const target = [opener, fallback?.(), ...document.querySelectorAll('button, a[href], [tabindex="0"]')]
      .find(el => el?.isConnected && !el.disabled && el.getClientRects().length && !el.closest('[hidden], dialog:not([open])'));
    target?.focus();
  }, { once: true });
  dialog.showModal(); body.focus();
  try {
    let page = first;
    while (dialog.open && page.nextOffset !== null) {
      page = await load({ offset: page.nextOffset, limit: 64000, revision: first.revision });
      if (dialog.open) pre.append(document.createTextNode(page.text));
    }
  } catch (error) { if (dialog.open) dialog.close(); throw error; }
}
