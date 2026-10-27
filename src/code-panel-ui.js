import './code-panel.css';
import { askAgentUI } from './ask-agent-ui.js';

export function codePanelUI({ call, getState, selectedConsole, pasteContext, escape: e, icon, resizeHandles, toast, navigate }) {
  const records = new Map();
  const sources = () => getState().sessions.filter(x => x.alive && !x.dismissed && !x.remote && !['login', 'setup'].includes(x.purpose));
  const targets = () => sources().filter(x => !['shell', 'custom'].includes(x.provider));
  const ask = askAgentUI({ call, getState, targets, pasteContext, selection, showFile, toast, escape: e });
  const action = (name, text, extra = '') => `<button type="button" data-code-action="${name}" class="subtle" ${extra}>${text}</button>`;
  function card(panel) {
    return `<article class="session-card code-panel" data-console-id="${e(panel.id)}" data-slot="${panel.slot}"><header class="console-panel-header"><button class="console-grip" draggable="true" data-console-drag="${e(panel.id)}" aria-label="Move code panel" title="Drag to move. Alt + 1–9 moves to a slot.">${icon('api')}</button><span class="slot">${String(panel.slot).padStart(2, '0')}</span><strong>Code</strong><span class="code-readonly">Read only</span><button class="icon-button" data-action="toggle-console" data-id="${e(panel.id)}" aria-label="Expand code panel" title="Expand code panel">${icon('expand')}</button><button class="icon-button" data-code-action="close" aria-label="Close code panel" title="Close code panel">${icon('close')}</button></header><div class="code-panel-body"></div>${resizeHandles(panel.slot)}</article>`;
  }
  function selection(r) {
    const view = r.editor, range = view?.state.selection.main;
    if (!range || range.empty || !r.file) return null;
    const from = view.state.doc.lineAt(range.from), to = view.state.doc.lineAt(Math.max(range.from, range.to - 1));
    const text = view.state.doc.sliceString(from.from, to.to);
    return { from: from.number, to: to.number, text, context: `${r.file.file}:${from.number}-${to.number}\n\n${text}` };
  }
  function selected(r) {
    const value = selection(r);
    r.node.querySelector('[data-code-selection]').textContent = value ? `Lines ${value.from}–${value.to}` : 'Select lines to add context';
    r.node.querySelector('[data-code-action="copy"]').disabled = !value;
    r.node.querySelector('[data-code-action="send"]').disabled = !value || !targets().length;
  }
  function chooseOptions(r, panel) {
    const list = sources(), eligible = targets();
    const stamp = JSON.stringify([panel.codeSourceKey, list.map(x => [x.id, x.name, x.consoleKey]), eligible.map(x => x.id)]);
    if (r.options === stamp) return; r.options = stamp;
    const source = r.node.querySelector('[data-code-source]'), target = r.node.querySelector('[data-code-target]'), previous = target.value;
    source.innerHTML = `<option value="" disabled>${e(panel.cwd.split(/[\\/]/).pop() || 'Project folder')}</option>` + list.map(x => `<option value="${e(x.id)}" ${(x.consoleKey || x.id) === panel.codeSourceKey ? 'selected' : ''}>${e(x.name)}</option>`).join('');
    target.innerHTML = eligible.map(x => `<option value="${e(x.id)}">${e(x.name)}</option>`).join('') || '<option value="">No agent console</option>';
    target.value = eligible.find(x => x.id === previous)?.id || eligible.find(x => x.id === source.value)?.id || eligible[0]?.id || '';
    selected(r);
  }
  function listFiles(r) {
    const list = r.node.querySelector('[data-code-files]');
    const items = r.browse ? r.directory?.items || [] : r.report?.changes || [];
    list.innerHTML = (r.browse && r.directory?.path ? action('up', '↑ Parent folder') : '') + items.map(x => `<button type="button" data-code-path="${e(x.path || x.file)}" ${x.directory ? 'data-directory' : ''} ${r.file?.file === (x.path || x.file) ? 'aria-current="true"' : ''} title="${e(x.path || x.file)}"><span>${x.directory ? '▸ ' : ''}${e(x.name || x.file)}</span>${x.type ? `<small>${e(x.type)}</small>` : ''}</button>`).join('');
    if (!items.length) list.innerHTML += `<p>${r.browse ? 'No previewable files in this folder.' : 'No changed files. Browse files or wait for the next turn.'}</p>`;
    const report = r.report;
    r.node.querySelector('[data-code-caption]').textContent = r.browse ? r.directory?.path || 'Project files' : report ? `${report.mode === 'turn' ? 'Last turn' : 'Working tree'} · ${report.changes.length} ${report.changes.length === 1 ? 'file' : 'files'}` : 'Loading changes…';
    r.node.querySelector('[data-code-notes]').textContent = r.browse ? r.directory?.truncated ? 'Showing the first 500 entries.' : '' : report?.notes?.join(' ') || '';
    r.node.querySelector('[data-code-action="changes"]').setAttribute('aria-pressed', String(!r.browse));
    r.node.querySelector('[data-code-action="browse"]').setAttribute('aria-pressed', String(r.browse));
  }
  async function showFile(r, file) {
    r.askReselect = null;
    const ticket = ++r.fileTicket;
    r.file = file; r.editor?.destroy(); r.editor = null;
    const host = r.node.querySelector('[data-code-editor]'); host.replaceChildren();
    r.node.querySelector('[data-code-filename]').textContent = file.file;
    const canDiff = file.before != null && file.after != null && file.mode !== 'file';
    r.node.querySelector('[data-code-action="diff"]').disabled = !canDiff;
    r.node.querySelector('[data-code-action="diff"]').setAttribute('aria-pressed', String(r.diff && canDiff));
    r.node.querySelector('[data-code-action="full"]').setAttribute('aria-pressed', String(!r.diff || !canDiff));
    if (file.before == null && file.after == null) { host.textContent = file.omitted || 'This file has no text preview.'; selected(r); return; }
    const { codeEditor } = await import('./code-editor.js');
    if (ticket !== r.fileTicket || !records.has(r.id)) return;
    const view = await codeEditor(host, file, r.diff && canDiff, () => selected(r));
    if (ticket !== r.fileTicket || !records.has(r.id)) { view.destroy(); return; }
    r.editor = view; selected(r); listFiles(r);
    r.node.querySelector('[data-code-error]').textContent = '';
  }
  async function load(r, refresh = false) {
    if (r.loading) { r.reload = true; return; } r.loading = true;
    const ticket = r.sourceTicket;
    r.node.querySelector('[data-code-action="refresh"]').disabled = true;
    r.node.querySelector('[data-code-error]').textContent = '';
    try {
      const report = await call('code.report', { id: r.id, refresh });
      if (ticket !== r.sourceTicket || !records.has(r.id)) return;
      const changed = r.report?.id !== report.id; r.report = report;
      if (!r.browse) {
        listFiles(r);
        if (changed && report.changes.length) {
          const file = report.changes.find(x => x.file === r.file?.file) || report.changes[0];
          await showFile(r, await call('code.file', { id: r.id, path: file.file, reportId: report.id }));
        } else if (changed) { r.askReselect = null; r.editor?.destroy(); r.editor = null; r.file = null; ++r.fileTicket; r.node.querySelector('[data-code-editor]').textContent = 'Choose Browse files to inspect this project.'; r.node.querySelector('[data-code-filename]').textContent = ''; selected(r); }
      }
    } catch (error) { r.node.querySelector('[data-code-error]').textContent = error.message; }
    finally { r.loading = false; r.node.querySelector('[data-code-action="refresh"]').disabled = false; if (r.reload) { r.reload = false; void load(r); } }
  }
  async function browse(r, path = '') { r.directory = await call('code.browse', { id: r.id, path }); r.browse = true; listFiles(r); r.node.querySelector('[data-code-error]').textContent = ''; }
  function mount(panel, host) {
    let r = records.get(panel.id);
    if (!r) {
      const node = document.createElement('div'); node.className = 'code-workspace';
      node.innerHTML = `<div class="code-toolbar"><label>Follow<select data-code-source aria-label="Follow console"></select></label>${action('refresh', 'Refresh')}${action('changes', 'Changes', 'aria-pressed="true"')}${action('browse', 'Browse files', 'aria-pressed="false"')}</div><div class="code-caption" data-code-caption role="status"></div><div class="code-browser"><nav class="code-file-list" data-code-files aria-label="Project files"></nav><section class="code-file-view"><div class="code-file-heading"><span data-code-filename></span>${action('diff', 'Diff', 'aria-pressed="true"')}${action('full', 'File', 'aria-pressed="false"')}</div><div class="code-editor-host" data-code-editor><p>Choose a file to read its code.</p></div></section></div><div class="code-context"><span data-code-selection>Select lines to add context</span>${action('copy', 'Copy', 'disabled')}<select data-code-target aria-label="Send context to console"></select>${action('send', 'Add to draft', 'disabled')}</div><p class="code-notes" data-code-notes></p><p class="form-error" data-code-error role="alert"></p>`;
      r = { id: panel.id, node, diff: true, browse: false, fileTicket: 0, sourceTicket: 0, revision: -1 }; records.set(panel.id, r);
      ask.bind(r);
      node.addEventListener('click', async event => {
        const b = event.target.closest('button'); if (!b) return;
        try {
          const a = b.dataset.codeAction;
          if (b.hasAttribute('data-code-path')) {
            if (b.hasAttribute('data-directory')) await browse(r, b.dataset.codePath);
            else await showFile(r, await call('code.file', { id: r.id, path: b.dataset.codePath, ...(!r.browse ? { reportId: r.report.id } : {}) }));
          } else if (a === 'refresh') { r.browse ? await browse(r, r.directory?.path) : await load(r, true); }
          else if (a === 'browse') await browse(r);
          else if (a === 'changes') { r.browse = false; r.report = null; await load(r); }
          else if (a === 'up') await browse(r, r.directory.path.split('/').slice(0, -1).join('/'));
          else if ((a === 'diff' || a === 'full') && r.file) { r.diff = a === 'diff'; await showFile(r, r.file); }
          else if (a === 'copy' || a === 'send') {
            const value = selection(r); if (!value) return;
            if (value.context.length > 60000) throw new Error('Select fewer than 60,000 characters.');
            if (a === 'copy') { await call('clipboard.write', value.text); toast('Selected code copied.'); }
            else await pasteContext(node.querySelector('[data-code-target]').value, value.context);
            node.querySelector('[data-code-error]').textContent = '';
          }
        } catch (error) { node.querySelector('[data-code-error]').textContent = error.message; }
      });
      node.querySelector('[data-code-source]').addEventListener('change', async event => {
        if (!event.target.value) { chooseOptions(r, panel); return; }
        try { r.askReselect = null; ++r.sourceTicket; await call('code.source', { id: r.id, sourceId: event.target.value }); r.browse = false; r.report = null; await load(r); }
        catch (error) { node.querySelector('[data-code-error]').textContent = error.message; }
      });
    }
    if (r.node.parentElement !== host) { host.append(r.node); ask.restore(r); }
    chooseOptions(r, panel);
    if (r.ask) r.updateAsk?.();
    const revision = `${panel.codeSourceKey}:${getState().codeRevision || 0}`;
    if (r.revision !== revision) { r.revision = revision; if (!selection(r)) void load(r); else r.node.querySelector('[data-code-caption]').textContent = 'New changes available · refresh when ready'; }
  }
  function sync() { for (const [id, r] of records) if (!getState().codePanels?.some(p => p.id === id)) { ++r.fileTicket; ask.close(r, false); r.editor?.destroy(); r.node.remove(); records.delete(id); } else if (r.ask) r.updateAsk?.(); }
  document.addEventListener('click', async event => {
    const b = event.target.closest('[data-code-action]'); if (!b) return;
    try {
      if (b.dataset.codeAction === 'create') { b.disabled = true; await call('code.create', { sourceId: sources().find(x => x.id === selectedConsole())?.id || sources()[0]?.id }); navigate('consoles'); }
      if (b.dataset.codeAction === 'close') await call('code.close', b.closest('[data-console-id]').dataset.consoleId);
    } catch (error) { toast(error.message, true); }
    finally { if (b.dataset.codeAction === 'create') b.disabled = false; }
  });
  return { card, mount, sync };
}
