import { formatAskContext, askSelectionChanged, defaultAskTarget } from './ask-agent.js';

export function askAgentUI({ call, getState, targets, pasteContext, selection, showFile, toast, escape: e }) {
  const choices = new Map();
  const cwdKey = value => {
    const path = (value || '').replaceAll('\\', '/').replace(/\/$/, '');
    return getState().platform === 'win32' ? path.toLowerCase() : path;
  };
  const busy = target => ['active', 'working', 'busy'].includes(target?.state);
  function close(r, refocus = true) {
    r.askEvents?.abort(); r.askEvents = null;
    r.ask?.remove(); r.ask = null; r.updateAsk = null;
    if (refocus) r.editor?.focus();
  }
  function place(r, node, point) {
    const rect = r.node.getBoundingClientRect();
    const bounds = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(point?.x ?? rect.left + 8, innerWidth - bounds.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(point?.y ?? rect.top + 8, innerHeight - bounds.height - 8))}px`;
  }
  function restore(r) {
    if (!r.ask || !r.ask.isConnected) { close(r, false); return; }
    try { r.ask.showPopover(); place(r, r.ask); }
    catch { close(r, false); }
  }
  function surface(r, role, label, isSending = () => false) {
    close(r);
    const node = document.createElement('div');
    node.className = `ask-agent ask-agent-${role}`; node.popover = 'manual'; // WebKit light-dismisses an auto popover on the release of the right-click that opened it; outside clicks, scroll, focus loss and Esc close it below
    node.setAttribute('role', role); node.setAttribute('aria-label', label);
    r.node.append(node); r.ask = node;
    const events = new AbortController(); r.askEvents = events;
    const dismiss = () => { if (r.ask === node) close(r, false); };
    node.addEventListener('toggle', event => { if (event.newState === 'closed' && !node.matches(':popover-open')) dismiss(); });
    document.addEventListener('pointerdown', event => { if (!node.contains(event.target)) dismiss(); }, { capture: true, signal: events.signal });
    // Opening moves focus out of the editor, and CodeMirror may scroll its pane in response; only later scrolls dismiss.
    const opened = performance.now();
    document.addEventListener('scroll', event => { if (performance.now() - opened > 300 && !node.contains(event.target)) dismiss(); }, { capture: true, signal: events.signal });
    node.addEventListener('focusout', event => {
      const next = event.relatedTarget;
      if (!isSending() && next instanceof Element && next !== document.body && !node.contains(next)) dismiss();
    });
    node.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(r); }
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
    let sending = false, pending = null;
    const node = surface(r, 'dialog', 'Ask agent', () => sending);
    node.innerHTML = `<strong>Ask agent…</strong><p>${e(snapshot.file)}:${snapshot.from}-${snapshot.to}<br>${e(snapshot.folder)}${snapshot.branch ? ` @ ${e(snapshot.branch)}` : ''}${snapshot.side ? ' · diff after side' : ''}</p><pre tabindex="0" aria-label="Selected code">${e(snapshot.text)}</pre><label>Instruction<textarea rows="3"></textarea></label><div class="ask-actions">${['Explain this', 'Look for a bug', 'Propose a fix'].map(x => `<button type="button" data-note="${x}">${x}</button>`).join('')}</div><label>Destination<select aria-label="Destination console"></select></label><p data-mismatch role="status"></p><p class="form-error" role="alert"></p><div data-stale hidden><p>The file changed since you selected this.</p><button type="button" data-keep>Keep captured version</button><button type="button" data-reselect>Reselect</button></div><div class="ask-actions"><button type="button" data-draft>Add to draft</button><button type="button" data-queue>Queue</button><button type="button" data-cancel>Cancel</button></div>`;
    const heading = node.querySelector('strong');
    heading.id = `ask-agent-heading-${r.id}`;
    heading.textContent = 'Ask agent';
    node.setAttribute('aria-labelledby', heading.id);
    node.removeAttribute('aria-label');
    const target = node.querySelector('select'), note = node.querySelector('textarea'), error = node.querySelector('[role="alert"]');
    if (r.askReselect?.file === snapshot.file && r.askReselect.cwd === key) note.value = r.askReselect.note;
    r.askReselect = null;
    function update() {
      const list = targets();
      const preferred = defaultAskTarget(list, { rememberedId: choices.get(key), sourceKey: panel.codeSourceKey, cwd, platform: getState().platform });
      const previous = list.find(x => x.id === target.value)?.id || preferred?.id;
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
          let current;
          try { current = await call('code.file', { id: r.id, path: snapshot.file }); }
          catch { /* An unreadable or deleted file requires the same explicit choice. */ }
          if (r.ask !== node) return;
          if (sourceTicket !== r.sourceTicket) throw new Error('The source folder changed. Cancel and select the code again.');
          if (pending || askSelectionChanged(current?.after, snapshot)) {
            pending = kind; node.querySelector('[data-stale]').hidden = false; node.querySelector('[data-keep]').focus({ preventScroll: true }); return;
          }
        }
        const chosen = targets().find(x => x.id === target.value);
        if (!chosen) throw new Error('Choose an open agent console.');
        if (kind === 'queue' && !busy(chosen)) throw new Error('Queue is available while the console is working.');
        const text = formatAskContext({ ...snapshot, note: note.value, stale: keep });
        choices.set(key, chosen.id);
        if (kind === 'queue') await call('queue.add', { id: chosen.id, text });
        else await pasteContext(chosen.id, text);
        r.node.querySelector('[data-code-error]').textContent = '';
        if (r.ask === node) close(r);
      } catch (failure) { error.textContent = failure.message; }
      finally { sending = false; update(); }
    }
    node.addEventListener('click', async event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.note) { note.value = button.dataset.note; note.focus({ preventScroll: true }); }
      else if (button.hasAttribute('data-cancel')) close(r);
      else if (button.hasAttribute('data-draft')) void send('draft');
      else if (button.hasAttribute('data-queue')) void send('queue');
      else if (button.hasAttribute('data-keep') && pending) void send(pending, true);
      else if (button.hasAttribute('data-reselect')) {
        try {
          const report = r.browse ? null : await call('code.report', { id: r.id, refresh: true });
          if (r.ask !== node || sourceTicket !== r.sourceTicket) return;
          const current = await call('code.file', { id: r.id, path: snapshot.file, ...(report ? { reportId: report.id } : {}) });
          if (r.ask !== node) return;
          if (sourceTicket !== r.sourceTicket) throw new Error('The source folder changed. Cancel and select the code again.');
          if (report) r.report = report;
          await showFile(r, current);
          if (sourceTicket === r.sourceTicket && r.file === current) {
            r.askReselect = { file: snapshot.file, cwd: key, note: note.value };
            r.node.querySelector('[data-code-caption]').textContent = 'Select the lines again. Your note is kept.';
          }
          if (r.ask === node) close(r);
        } catch (failure) { error.textContent = failure.message; }
      }
    });
    update(); node.showPopover(); place(r, node); note.focus({ preventScroll: true });
  }
  function menu(r, point, captured = selection(r)) {
    if (!captured) return;
    const node = surface(r, 'menu', 'Selected code');
    node.innerHTML = '<button type="button" role="menuitem">Ask agent…</button><button type="button" role="menuitem">Copy</button>';
    const buttons = [...node.querySelectorAll('button')];
    buttons[0].onclick = () => open(r, captured);
    buttons[1].onclick = async () => {
      try {
        await call('clipboard.write', captured.text);
        r.node.querySelector('[data-code-error]').textContent = '';
        toast('Selected code copied.');
      }
      catch (error) { r.node.querySelector('[data-code-error]').textContent = error.message; }
      finally { if (r.ask === node) close(r); }
    };
    node.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); buttons[document.activeElement === buttons[0] ? 1 : 0].focus(); }
    });
    node.showPopover(); place(r, node, point); buttons[0].focus({ preventScroll: true });
  }
  function bind(r) {
    const host = r.node.querySelector('[data-code-editor]');
    host.addEventListener('keydown', event => {
      if (!r.editor?.hasFocus || !selection(r)) return;
      if ((getState().platform === 'darwin' ? event.metaKey : event.ctrlKey) && event.shiftKey && event.code === 'KeyA') {
        event.preventDefault(); event.stopPropagation(); open(r);
      } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault(); event.stopPropagation(); menu(r);
      }
    }, true);
    // Safari moves the selection on right-click before contextmenu fires, so remember it at pointerdown.
    host.addEventListener('pointerdown', event => {
      r.contextSnapshot = event.button === 2 && r.editor ? { captured: selection(r), range: r.editor.state.selection.main } : null;
    }, true);
    host.addEventListener('contextmenu', event => {
      const snapshot = r.contextSnapshot; r.contextSnapshot = null;
      const captured = snapshot?.captured || (r.editor?.hasFocus ? selection(r) : null);
      if (!r.editor || !captured || event.target.closest('.cm-deletedChunk')) return;
      const pos = r.editor.posAtCoords({ x: event.clientX, y: event.clientY });
      const range = snapshot?.captured ? snapshot.range : r.editor.state.selection.main;
      if (pos == null || pos < range.from || pos > range.to) return;
      if (!r.editor.state.selection.main.eq(range)) r.editor.dispatch({ selection: range });
      event.preventDefault(); event.stopPropagation(); menu(r, { x: event.clientX, y: event.clientY }, captured);
    });
  }
  return { bind, close, restore };
}
