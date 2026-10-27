import { formatAskContext } from './ask-agent.js';

export function askAgentUI({ call, getState, targets, pasteContext, selection, showFile, escape: e }) {
  const choices = new Map();
  const cwdKey = value => {
    const path = (value || '').replaceAll('\\', '/').replace(/\/$/, '');
    return getState().platform === 'win32' ? path.toLowerCase() : path;
  };
  const busy = target => ['active', 'working', 'busy'].includes(target?.state);
  function close(r) { r.ask?.remove(); r.ask = null; r.updateAsk = null; r.editor?.focus(); }
  function place(r, node, point) {
    const rect = r.node.getBoundingClientRect();
    const bounds = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(point?.x ?? rect.left + 8, innerWidth - bounds.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(point?.y ?? rect.top + 8, innerHeight - bounds.height - 8))}px`;
  }
  function surface(r, role, label) {
    close(r);
    const node = document.createElement('div');
    node.className = `ask-agent ask-agent-${role}`; node.popover = 'manual';
    node.setAttribute('role', role); node.setAttribute('aria-label', label);
    r.node.append(node); r.ask = node;
    node.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(r); }
      if (event.key === 'Tab') {
        const items = [...node.querySelectorAll('button:not(:disabled),select,textarea,[tabindex="0"]')].filter(x => !x.closest('[hidden]'));
        const index = items.indexOf(document.activeElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus(); }
      }
    });
    return node;
  }
  function open(r, captured = selection(r)) {
    if (!captured) return;
    const panel = getState().codePanels.find(x => x.id === r.id);
    if (!panel) return;
    const cwd = panel.cwd, key = cwdKey(cwd), sourceTicket = r.sourceTicket;
    const snapshot = { ...captured, file: r.file.file, folder: cwd.replace(/[\\/]$/, '').split(/[\\/]/).pop(), branch: r.report?.git?.after?.branch || r.report?.git?.branch || r.report?.branch,
      side: r.diff && r.file.before != null && r.file.after != null && r.file.mode !== 'file' ? 'after' : undefined };
    const node = surface(r, 'dialog', 'Ask agent');
    node.innerHTML = `<strong>Ask agent…</strong><p>${e(snapshot.file)}:${snapshot.from}-${snapshot.to}<br>${e(snapshot.folder)}${snapshot.branch ? ` @ ${e(snapshot.branch)}` : ''}${snapshot.side ? ' · diff after side' : ''}</p><pre tabindex="0" aria-label="Selected code">${e(snapshot.text)}</pre><label>Instruction<textarea rows="3"></textarea></label><div class="ask-actions">${['Explain this', 'Look for a bug', 'Propose a fix'].map(x => `<button type="button" data-note="${x}">${x}</button>`).join('')}</div><label>Destination<select aria-label="Destination console"></select></label><p data-mismatch role="status"></p><p class="form-error" role="alert"></p><div data-stale hidden><p>The file changed since you selected this.</p><button type="button" data-keep>Keep captured version</button><button type="button" data-reselect>Reselect</button></div><div class="ask-actions"><button type="button" data-draft>Add to draft</button><button type="button" data-queue>Queue</button><button type="button" data-cancel>Cancel</button></div>`;
    const heading = node.querySelector('strong');
    heading.id = `ask-agent-heading-${r.id}`;
    heading.textContent = 'Ask agent';
    node.setAttribute('aria-modal', 'true');
    node.setAttribute('aria-labelledby', heading.id);
    node.removeAttribute('aria-label');
    const target = node.querySelector('select'), note = node.querySelector('textarea'), error = node.querySelector('[role="alert"]');
    let sending = false, pending = null;
    const initial = targets();
    const preferred = initial.find(x => x.id === choices.get(key)) || initial.find(x => cwdKey(x.cwd) === key) || initial[0];
    function update() {
      const list = targets(), previous = target.value || preferred?.id;
      const stamp = JSON.stringify(list.map(x => [x.id, x.name]));
      if (target.dataset.stamp !== stamp) {
        target.innerHTML = list.map(x => `<option value="${e(x.id)}">${e(x.name)}</option>`).join('') || '<option value="">No agent console</option>';
        target.value = list.find(x => x.id === previous)?.id || ''; target.dataset.stamp = stamp;
      }
      const chosen = list.find(x => x.id === target.value);
      node.querySelector('[data-mismatch]').textContent = chosen && cwdKey(chosen.cwd) !== key ? `Different project folder: ${chosen.cwd}` : '';
      node.querySelector('[data-draft]').disabled = sending || !chosen;
      node.querySelector('[data-queue]').disabled = sending || !busy(chosen);
    }
    r.updateAsk = update;
    target.addEventListener('change', () => { choices.set(key, target.value); update(); });
    async function send(kind, keep = false) {
      if (sending || r.ask !== node) return;
      sending = true; error.textContent = ''; update();
      try {
        if (sourceTicket !== r.sourceTicket || cwdKey(getState().codePanels.find(x => x.id === r.id)?.cwd) !== key) throw new Error('The source folder changed. Cancel and select the code again.');
        if (!keep) {
          const current = await call('code.file', { id: r.id, path: snapshot.file });
          if (r.ask !== node) return;
          if (sourceTicket !== r.sourceTicket) throw new Error('The source folder changed. Cancel and select the code again.');
          const lines = (current.after ?? '').replace(/\r\n?/g, '\n').split('\n');
          if (lines.slice(snapshot.from - 1, snapshot.to).join('\n') !== snapshot.text) {
            pending = kind; node.querySelector('[data-stale]').hidden = false; node.querySelector('[data-keep]').focus(); return;
          }
        }
        const chosen = targets().find(x => x.id === target.value);
        if (!chosen) throw new Error('Choose an open agent console.');
        if (kind === 'queue' && !busy(chosen)) throw new Error('Queue is available while the console is working.');
        const text = formatAskContext({ ...snapshot, note: note.value, stale: keep });
        choices.set(key, chosen.id);
        if (kind === 'queue') await call('queue.add', { id: chosen.id, text });
        else await pasteContext(chosen.id, text);
        if (r.ask === node) close(r);
      } catch (failure) { error.textContent = failure.message; }
      finally { sending = false; update(); }
    }
    node.addEventListener('click', async event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.note) { note.value = button.dataset.note; note.focus(); }
      else if (button.hasAttribute('data-cancel')) close(r);
      else if (button.hasAttribute('data-draft')) void send('draft');
      else if (button.hasAttribute('data-queue')) void send('queue');
      else if (button.hasAttribute('data-keep') && pending) void send(pending, true);
      else if (button.hasAttribute('data-reselect')) {
        try {
          const current = await call('code.file', { id: r.id, path: snapshot.file });
          if (r.ask !== node) return;
          await showFile(r, current); close(r);
        } catch (failure) { error.textContent = failure.message; }
      }
    });
    update(); node.showPopover(); place(r, node); note.focus();
  }
  function menu(r, point) {
    const captured = selection(r); if (!captured) return;
    const node = surface(r, 'menu', 'Selected code');
    node.innerHTML = '<button type="button" role="menuitem">Ask agent…</button><button type="button" role="menuitem">Copy</button>';
    const buttons = [...node.querySelectorAll('button')];
    buttons[0].onclick = () => open(r, captured);
    buttons[1].onclick = async () => { try { await call('clipboard.write', captured.text); close(r); } catch (error) { node.setAttribute('aria-label', error.message); } };
    node.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); buttons[document.activeElement === buttons[0] ? 1 : 0].focus(); }
    });
    node.showPopover(); place(r, node, point); buttons[0].focus();
  }
  function bind(r) {
    const host = r.node.querySelector('[data-code-editor]');
    host.addEventListener('keydown', event => {
      if (!r.editor?.hasFocus || !selection(r)) return;
      if ((getState().platform === 'darwin' ? event.metaKey : event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault(); event.stopPropagation(); open(r);
      } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault(); event.stopPropagation(); menu(r);
      }
    }, true);
    host.addEventListener('contextmenu', event => {
      if (!r.editor?.hasFocus || !selection(r) || event.target.closest('.cm-deletedChunk')) return;
      const pos = r.editor.posAtCoords({ x: event.clientX, y: event.clientY });
      const range = r.editor.state.selection.main;
      if (pos == null || pos < range.from || pos > range.to) return;
      event.preventDefault(); event.stopPropagation(); menu(r, { x: event.clientX, y: event.clientY });
    });
  }
  return { bind, close };
}
