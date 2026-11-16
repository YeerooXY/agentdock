const pageKeys = { c: 'consoles', u: 'usage', a: 'api-settings', t: 'tools', i: 'instructions', s: 'settings' };
// Settings scroll inside their own layer; other pages scroll #content.
const scroller = () => document.querySelector('.settings-stage') || document.querySelector('#content');
const editing = element => !!element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .xterm, [role="tree"], [role="separator"]');

export function vimControls({ context, focusSlot, action, onError }) {
  let slot = 1, pending = '', timer, busy = false, helpOpener;
  const help = document.createElement('dialog');
  help.id = 'vim-help'; help.setAttribute('aria-labelledby', 'vim-help-title');
  help.innerHTML = `<div class="vim-modal-head"><div class="vim-title-group"><h2 id="vim-help-title">Vim controls</h2><span class="vim-mode-pill">Return to Paddock <kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Space</kbd></span></div><button type="button" class="vim-close-btn" aria-label="Close keyboard help"><span>Close</span><kbd>Esc</kbd></button></div>
    <div class="vim-modal-body">
      <section class="vim-group" aria-label="Console grid">
        <div class="vim-group-head"><h3 class="vim-group-title">Console grid</h3></div>
        <div class="vim-list">
          <div class="vim-row"><span class="vim-desc">Move across consoles</span><span class="key-seq"><kbd>h</kbd><kbd>j</kbd><kbd>k</kbd><kbd>l</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Select console 1 to 9</span><span class="key-seq"><kbd>1</kbd><span class="key-sep">to</span><kbd>9</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">First or last console</span><span class="key-seq"><kbd>g</kbd><kbd>g</kbd><span class="key-sep">/</span><kbd>G</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Expand or open console</span><span class="key-seq"><kbd>Enter</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Type in console</span><span class="key-seq"><kbd>i</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">New console</span><span class="key-seq"><kbd>n</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Choose agent and model</span><span class="key-seq"><kbd>N</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Rename console</span><span class="key-seq"><kbd>r</kbd></span></div>
        </div>
      </section>
      <section class="vim-group" aria-label="Go to page">
        <div class="vim-group-head"><h3 class="vim-group-title">Go to page</h3></div>
        <div class="vim-list">
          <div class="vim-row"><span class="vim-desc">Consoles</span><span class="key-seq"><kbd>g</kbd><kbd>c</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Usage</span><span class="key-seq"><kbd>g</kbd><kbd>u</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Models and keys</span><span class="key-seq"><kbd>g</kbd><kbd>a</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Tools</span><span class="key-seq"><kbd>g</kbd><kbd>t</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Instructions</span><span class="key-seq"><kbd>g</kbd><kbd>i</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Settings</span><span class="key-seq"><kbd>g</kbd><kbd>s</kbd></span></div>
        </div>
      </section>
      <section class="vim-group full-span" aria-label="Window and scrolling">
        <div class="vim-group-head"><h3 class="vim-group-title">Window and scrolling</h3></div>
        <div class="vim-list two-col">
          <div class="vim-row"><span class="vim-desc">Scroll page down or up</span><span class="key-seq"><kbd>j</kbd><span class="key-sep">/</span><kbd>k</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Half page down or up</span><span class="key-seq"><kbd>Ctrl</kbd><kbd>d</kbd><span class="key-sep">/</span><kbd>u</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Top or bottom of page</span><span class="key-seq"><kbd>g</kbd><kbd>g</kbd><span class="key-sep">/</span><kbd>G</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Focus navigation</span><span class="key-seq"><kbd>b</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Fullscreen</span><span class="key-seq"><kbd>f</kbd></span></div>
          <div class="vim-row"><span class="vim-desc">Shortcut list</span><span class="key-seq"><kbd>?</kbd></span></div>
        </div>
      </section>
    </div>`;
  document.querySelector('#app').append(help);
  help.querySelector('button').addEventListener('click', () => help.close());
  help.addEventListener('close', () => { if (helpOpener?.isConnected) helpOpener.focus({ preventScroll: true }); else focusSlot(slot); refresh(); });

  function clearPending() { clearTimeout(timer); pending = ''; }
  function blocked() { return !!document.querySelector('dialog[open]'); }
  function refresh() {
    const enabled = context().enabled, normal = enabled && !editing(document.activeElement) && !blocked();
    if (!normal) clearPending();
    document.body.dataset.vimMode = enabled ? normal ? 'normal' : 'insert' : 'off';
    document.body.dataset.vimSlot = String(slot);
    for (const button of document.querySelectorAll('[data-action="vim-normal"]')) {
      button.hidden = !enabled;
      button.textContent = normal ? `NORMAL ${pending || String(slot).padStart(2, '0')}` : 'INSERT';
      button.title = normal ? 'Dock controls (? for shortcuts)' : 'Return to Paddock controls (Ctrl+Shift+Space)';
      button.setAttribute('aria-label', normal ? `Dock controls, console ${slot}. Press ? for shortcuts.` : 'Return to Paddock controls (Ctrl+Shift+Space)');
    }
    for (const panel of document.querySelectorAll('.session-card')) {
      panel.classList.toggle('vim-selected', normal && Number(panel.dataset.slot) === slot);
    }
  }
  function followFocus(target) {
    const panel = target?.closest('[data-slot], [data-name-slot], [data-terminal-id]');
    const current = Number(panel?.dataset.slot || panel?.dataset.nameSlot) || context().sessions.find(x => x.id === panel?.dataset.terminalId)?.slot;
    if (current) slot = current;
  }
  function select(next) {
    const grid = context().grid || { columns: 3, rows: 3 };
    slot = Math.max(1, Math.min(grid.columns * grid.rows, next)); clearPending();
    focusSlot(slot); refresh();
  }
  function enterNormal() {
    if (!context().enabled || blocked()) return;
    followFocus(document.activeElement); select(slot);
  }
  function showHelp() {
    if (blocked()) return;
    clearPending(); helpOpener = document.activeElement;
    help.showModal(); help.querySelector('button').focus(); refresh();
  }
  async function run(name, value = slot) {
    if (busy) return;
    busy = true; clearPending();
    try { await action(name, value); }
    catch (error) { onError(error.message); }
    finally { busy = false; refresh(); }
  }
  function scroll(direction, half = false) {
    const content = scroller();
    content.scrollBy({ top: direction * (half ? Math.round(content.clientHeight / 2) : 80), behavior: 'instant' });
  }
  document.addEventListener('focusin', event => { followFocus(event.target); refresh(); });
  document.addEventListener('focusout', () => queueMicrotask(refresh));
  document.addEventListener('pointerdown', event => { followFocus(event.target); clearPending(); refresh(); });
  window.addEventListener('blur', () => { clearPending(); refresh(); });
  document.addEventListener('keydown', event => {
    const current = context();
    if (!current.enabled || event.isComposing || event.keyCode === 229 || blocked()) return;
    const consume = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === 'Space') {
      consume(); if (!event.repeat && !busy && !current.busy) enterNormal(); return;
    }
    // Capture only Paddock navigation. An embedded editor owns all its own keys.
    if (editing(event.target) || busy || current.busy) return;
    const grid = ['consoles', 'overview', 'terminal'].includes(current.view);
    if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && !grid && ['d', 'u'].includes(event.key)) {
      consume(); clearPending(); scroll(event.key === 'd' ? 1 : -1, true); refresh(); return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) { clearPending(); refresh(); return; }
    const key = event.key;
    if (pending === 'g') {
      clearPending(); refresh();
      if (key === 'Escape') { consume(); return; }
      if (key === 'g') {
        consume(); if (grid) select(1); else scroller().scrollTop = 0; return;
      }
      if (pageKeys[key]) { consume(); if (!event.repeat) run('page', pageKeys[key]); return; }
    }
    if (key === 'g' && !event.repeat) {
      consume(); pending = 'g'; timer = setTimeout(() => { clearPending(); refresh(); }, 1200); refresh(); return;
    }
    if ('hjkl'.includes(key) && key.length === 1) {
      if (!grid && !['j', 'k'].includes(key)) return;
      consume();
      if (!grid) { scroll(key === 'j' ? 1 : -1); return; }
      const { columns, rows } = current.grid || { columns: 3, rows: 3 }, col = (slot - 1) % columns;
      select(key === 'h' && col > 0 ? slot - 1 : key === 'l' && col < columns - 1 ? slot + 1 : key === 'j' && slot <= columns * (rows - 1) ? slot + columns : key === 'k' && slot > columns ? slot - columns : slot);
    } else if (/^[1-9]$/.test(key)) { consume(); select(Number(key)); }
    else if (key === 'G') { consume(); if (grid) select((current.grid?.columns || 3) * (current.grid?.rows || 3)); else scroller().scrollTop = scroller().scrollHeight; }
    else if (key === '?') { consume(); if (!event.repeat) showHelp(); }
    else if (key === 'Enter') {
      const otherControl = event.target.closest('button, a, summary');
      if (!grid || otherControl) return;
      consume(); if (!event.repeat) run('open');
    } else if (['i', 'r', 'n', 'N', 'b', 'f'].includes(key)) {
      consume(); if (event.repeat) return;
      if (key === 'n' || key === 'N') {
        const { columns, rows } = current.grid || { columns: 3, rows: 3 };
        const occupied = current.sessions.filter(x => x.alive || x.restoreError).flatMap(x => Array.from({ length: x.height || 1 }, (_, y) => Array.from({ length: x.width || 1 }, (_, dx) => x.slot + y * columns + dx)).flat());
        const empty = !occupied.includes(slot) ? slot : Array.from({ length: columns * rows }, (_, i) => i + 1).find(x => !occupied.includes(x));
        if (empty) select(empty); run(key === 'n' ? 'new' : 'choose', empty || 0);
      } else run({ i: 'type', r: 'rename', b: 'navigation', f: 'fullscreen' }[key]);
    }
  }, true);
  return { refresh, enterNormal, showHelp, get slot() { return slot; } };
}
