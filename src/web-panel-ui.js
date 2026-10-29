// Preview panels show a local development server in the grid and reload when
// their linked console finishes a turn.
export function webPanelUI({ call, getState, selectedConsole, escape: e, icon, resizeHandles, toast, navigate }) {
  const frames = new Map(), states = new Map();
  const source = panel => (getState()?.sessions || []).find(s => (s.consoleKey || s.id) === panel.codeSourceKey && s.alive && !s.dismissed);
  const reloadHint = panel => source(panel) ? `Reloads when ${source(panel).name} finishes a turn` : 'Reloads when any console finishes a turn';
  function card(panel) {
    return `<article class="session-card code-panel web-panel" data-console-id="${e(panel.id)}" data-slot="${panel.slot}"><header class="console-panel-header"><button class="console-grip" draggable="true" data-console-drag="${e(panel.id)}" aria-label="Move preview panel" title="Drag to move. Alt + 1–9 moves to a slot.">${icon('globe')}</button><span class="slot">${String(panel.slot).padStart(2, '0')}</span><form class="web-url-form" data-web-form="${e(panel.id)}"><input name="url" value="${e(panel.url)}" placeholder="localhost:5173" aria-label="Local address" autocomplete="off" spellcheck="false"></form><button class="web-phone-toggle" data-web-action="phone" aria-pressed="${panel.phoneAllowed === true}" title="Allow paired phones to access this preview">Allow phone</button><button class="icon-button" data-web-action="reload" aria-label="Reload preview" title="${e(reloadHint(panel))}">${icon('refresh')}</button><button class="icon-button" data-web-action="open" aria-label="Open in browser" title="Open in browser">${icon('arrow')}</button><button class="icon-button" data-action="toggle-console" data-id="${e(panel.id)}" aria-label="Expand preview panel" title="Expand preview panel">${icon('expand')}</button><button class="icon-button" data-web-action="close" aria-label="Close preview panel" title="Close preview panel">${icon('close')}</button></header><div class="web-panel-body"></div>${resizeHandles(panel.slot)}</article>`;
  }
  function mount(panel, body) {
    let record = frames.get(panel.id);
    if (!record || record.body !== body) {
      record = { body, url: null }; frames.set(panel.id, record);
    }
    if (record.url !== panel.url) {
      record.url = panel.url;
      body.innerHTML = panel.url
        ? `<iframe title="Preview of ${e(panel.url)}" src="${e(panel.url)}" sandbox="allow-scripts allow-forms allow-same-origin allow-modals" referrerpolicy="no-referrer"></iframe>`
        : `<div class="web-empty"><p>Type your development server's address above, for example <strong>localhost:5173</strong>, and press Enter.</p><p>Only addresses on this PC open here.</p></div>`;
    }
    const node = body.closest('.web-panel'), input = node?.querySelector('input[name=url]');
    if (input && document.activeElement !== input && input.value !== panel.url) input.value = panel.url;
    node?.querySelector('[data-web-action="reload"]')?.setAttribute('title', reloadHint(panel));
    node?.querySelector('[data-web-action="phone"]')?.setAttribute('aria-pressed', String(panel.phoneAllowed === true));
  }
  function reload(id) {
    const frame = frames.get(id)?.body.querySelector('iframe');
    // The page is cross-origin; assigning src again reloads it.
    if (frame) frame.src = frames.get(id).url;
  }
  function sync() {
    const state = getState(); if (!state) return;
    for (const id of frames.keys()) if (!(state.codePanels || []).some(p => p.id === id && p.kind === 'web')) frames.delete(id);
    const finished = [];
    for (const s of state.sessions || []) {
      const previous = states.get(s.id); states.set(s.id, s.state);
      if (s.state === 'ready' && previous && previous !== 'ready') finished.push(s.consoleKey || s.id);
    }
    if (!finished.length) return;
    for (const panel of state.codePanels || []) if (panel.kind === 'web' && panel.url && (!panel.codeSourceKey || finished.includes(panel.codeSourceKey))) reload(panel.id);
  }
  document.addEventListener('submit', async event => {
    const form = event.target.closest?.('[data-web-form]'); if (!form) return;
    event.preventDefault();
    try { await call('web.url', { id: form.dataset.webForm, url: form.elements.url.value }); form.elements.url.blur(); }
    catch (error) { toast(error.message, true); }
  });
  document.addEventListener('click', async event => {
    const b = event.target.closest?.('[data-web-action]'); if (!b) return;
    const id = b.closest('.web-panel')?.dataset.consoleId;
    try {
      if (b.dataset.webAction === 'create') {
        b.disabled = true;
        try {
          const current = (getState()?.sessions || []).find(s => s.id === selectedConsole() && s.alive);
          await call('web.create', { sourceId: current?.id });
          navigate('consoles');
          requestAnimationFrame(() => [...document.querySelectorAll('.web-panel input[name=url]')].find(x => !x.value)?.focus());
        } finally { b.disabled = false; }
      }
      if (b.dataset.webAction === 'reload') reload(id);
      if (b.dataset.webAction === 'phone') await call('web.phone', { id, allow: b.getAttribute('aria-pressed') !== 'true' });
      if (b.dataset.webAction === 'open') await call('web.open', id);
      if (b.dataset.webAction === 'close') await call('web.close', id);
    } catch (error) { toast(error.message, true); }
  });
  return { card, mount, sync, reload };
}
