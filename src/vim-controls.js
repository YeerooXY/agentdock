const pageKeys = { c: 'consoles', u: 'usage', a: 'api', v: 'vault', t: 'tools', i: 'instructions', s: 'settings' };
const editing = element => !!element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .xterm');

export function vimControls({ context, focusSlot, action, onError }) {
  let slot = 1, pending = '', timer, busy = false, helpOpener;
  const help = document.createElement('dialog');
  help.id = 'vim-help'; help.setAttribute('aria-labelledby', 'vim-help-title');
  help.innerHTML = `<div class="dialog-heading"><div><h2 id="vim-help-title">Vim controls</h2><p>Move around Dock without the mouse.</p></div><button type="button" class="icon-button" aria-label="Close keyboard help">×</button></div>
    <p class="vim-help-intro"><kbd>Ctrl Shift Space</kbd> returns control to Dock. <kbd>i</kbd> puts you back in the terminal.</p>
    <dl class="vim-shortcuts">
      <div><dt><kbd>h j k l</kbd></dt><dd>Move left, down, up, right</dd></div>
      <div><dt><kbd>1…9</kbd></dt><dd>Select a console slot</dd></div>
      <div><dt><kbd>Enter</kbd></dt><dd>Expand a console, or open an empty slot</dd></div>
      <div><dt><kbd>i</kbd></dt><dd>Type in the selected console</dd></div>
      <div><dt><kbd>n</kbd> / <kbd>N</kbd></dt><dd>New console / choose agent and model</dd></div>
      <div><dt><kbd>r</kbd></dt><dd>Rename the selected slot</dd></div>
      <div><dt><kbd>g g</kbd> / <kbd>G</kbd></dt><dd>First / last slot, or top / bottom of a page</dd></div>
      <div><dt><kbd>g c</kbd> <kbd>g u</kbd> <kbd>g a</kbd></dt><dd>Consoles · Usage · API</dd></div>
      <div><dt><kbd>g v</kbd> <kbd>g t</kbd> <kbd>g i</kbd></dt><dd>Keys · Tools · Instructions</dd></div>
      <div><dt><kbd>g s</kbd></dt><dd>Settings</dd></div>
      <div><dt><kbd>b</kbd> <kbd>f</kbd> <kbd>d</kbd></dt><dd>Sidebar · Fullscreen · Dock</dd></div>
      <div><dt><kbd>?</kbd></dt><dd>This shortcut list</dd></div>
    </dl><p class="vim-help-note">On other pages, j/k scroll; Ctrl+d/u move half a page. Terminal keys, including Escape and Ctrl+w, keep working while you type.</p>`;
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
      button.textContent = normal ? `NORMAL · ${pending || String(slot).padStart(2, '0')}` : 'INSERT';
      button.title = normal ? 'Dock controls · ? for shortcuts' : 'Return to Dock controls · Ctrl+Shift+Space';
      button.setAttribute('aria-label', normal ? `Dock controls, console ${slot}. Press ? for shortcuts.` : 'Return to Dock controls (Ctrl+Shift+Space)');
    }
    for (const panel of document.querySelectorAll('.session-card, .hud-slot')) {
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
    const content = document.querySelector('#content');
    content.scrollBy({ top: direction * (half ? content.clientHeight / 2 : 80), behavior: 'instant' });
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
    // Capture only Dock navigation. An embedded editor owns all its own keys.
    if (editing(event.target) || busy || current.busy) return;
    const grid = ['consoles', 'overview', 'terminal', 'hud'].includes(current.view);
    if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && !grid && ['d', 'u'].includes(event.key)) {
      consume(); clearPending(); scroll(event.key === 'd' ? 1 : -1, true); refresh(); return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) { clearPending(); refresh(); return; }
    const key = event.key;
    if (pending === 'g') {
      clearPending(); refresh();
      if (key === 'Escape') { consume(); return; }
      if (key === 'g') {
        consume(); if (grid) select(1); else document.querySelector('#content').scrollTop = 0; return;
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
    else if (key === 'G') { consume(); if (grid) select((current.grid?.columns || 3) * (current.grid?.rows || 3)); else document.querySelector('#content').scrollTop = document.querySelector('#content').scrollHeight; }
    else if (key === '?') { consume(); if (!event.repeat) showHelp(); }
    else if (key === 'Enter') {
      const otherControl = event.target.closest('button, a, summary');
      if (!grid || otherControl) return;
      consume(); if (!event.repeat) run('open');
    } else if (['i', 'r', 'n', 'N', 'b', 'f', 'd'].includes(key)) {
      consume(); if (event.repeat) return;
      if (key === 'n' || key === 'N') {
        const { columns, rows } = current.grid || { columns: 3, rows: 3 };
        const occupied = current.sessions.filter(x => x.alive || x.restoreError).flatMap(x => Array.from({ length: x.height || 1 }, (_, y) => Array.from({ length: x.width || 1 }, (_, dx) => x.slot + y * columns + dx)).flat());
        const empty = !occupied.includes(slot) ? slot : Array.from({ length: columns * rows }, (_, i) => i + 1).find(x => !occupied.includes(x));
        if (empty) select(empty); run(key === 'n' ? 'new' : 'choose', empty || 0);
      } else run({ i: 'type', r: 'rename', b: 'sidebar', f: 'fullscreen', d: 'dock' }[key]);
    }
  }, true);
  return { refresh, enterNormal, showHelp, get slot() { return slot; } };
}
