export function explorerUI({ host, call, getState, selectedConsole, openFile, collapse, afterOpenFile = () => {}, escape: e, icon }) {
  const memory = new Map();
  const filterCollapsed = new Set();
  let roots = [], root = '', context = '', generation = 0, width = 260, opening = false, focusPending = false;
  host.innerHTML = `<header><strong>Explorer</strong><button data-explorer="refresh" title="Refresh" aria-label="Refresh Explorer">${icon('refresh')}</button><button data-explorer="collapse" title="Collapse all" aria-label="Collapse all folders">${icon('minus')}</button></header><select aria-label="Explorer root"></select><p class="explorer-status" role="status"></p><input type="search" aria-label="Filter loaded filenames" placeholder="Filter filenames"><div class="explorer-tree" role="tree" aria-label="Files"></div><p class="explorer-empty"></p><p class="explorer-error" role="alert"></p><div class="explorer-resize" role="separator" tabindex="0" aria-label="Explorer width" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="480"></div>`;
  const select = host.querySelector('select'), filter = host.querySelector('input'), tree = host.querySelector('[role=tree]'), status = host.querySelector('[role=status]'), error = host.querySelector('[role=alert]'), handle = host.querySelector('[role=separator]');
  const record = () => memory.get(root);
  function resize(value) {
    width = Math.max(180, Math.min(480, Math.round(value)));
    host.style.setProperty('--explorer-width', `${width}px`); handle.setAttribute('aria-valuenow', width);
    host.parentElement.style.setProperty('--explorer-width', `${width}px`);
    if (record()) record().width = width;
  }
  const saveWidth = () => call('settings', { explorerWidth: width }).catch(fail);
  function fail(reason) { error.textContent = reason.message; }
  function updateStatus() {
    const truncated = [...(record()?.loaded.values() || [])].some(listing => listing.truncated);
    const text = root ? `Showing ${roots.find(x => x.path === root)?.label || root}${truncated ? ' · First 500 entries per folder' : ''}` : '';
    if (status.textContent !== text) status.textContent = text;
  }
  function updateMessage() {
    const r = record(), loading = root && !error.textContent && (!r?.loaded.has('') || r.pending.size > 0);
    host.querySelector('.explorer-empty').textContent = loading ? 'Loading…' : tree.childElementCount || !root || error.textContent ? '' : filter.value ? 'No matching loaded files.' : 'No files.';
  }
  function focusLoaded() {
    if (!focusPending || host.hidden || host.inert) return;
    const items = [...tree.querySelectorAll('[role=treeitem]')];
    const target = items.find(item => item.dataset.path === record()?.selected) || items[0];
    if (target) {
      items.forEach(item => { item.tabIndex = item === target ? 0 : -1; });
      target.focus({ preventScroll: true });
      focusPending = false;
    } else if (!root || record()?.loaded.has('')) {
      (select.disabled ? filter : select).focus({ preventScroll: true });
      focusPending = false;
    }
  }
  function focusTree() { focusPending = true; focusLoaded(); }
  function cancelFocus() { focusPending = false; }
  function draw(focusPath) {
    const r = record(); if (!r) { tree.innerHTML = ''; return; }
    const active = focusPath ?? tree.querySelector(':focus')?.dataset.path;
    const query = filter.value.toLocaleLowerCase();
    function rows(parent, depth) {
      const listing = r.loaded.get(parent); if (!listing) return '';
      return listing.entries.map(x => {
        const expanded = query ? r.loaded.has(x.path) && !filterCollapsed.has(x.path) : r.expanded.has(x.path);
        const children = x.directory && (query || expanded) ? rows(x.path, depth + 1) : '';
        if (query && !x.name.toLocaleLowerCase().includes(query) && !children) return '';
        return `<div role="treeitem" tabindex="-1" aria-level="${depth}" aria-selected="${r.selected === x.path}" ${x.directory ? `aria-expanded="${expanded}"` : ''} data-path="${e(x.path)}" ${x.directory ? 'data-directory' : ''} style="padding-left:${8 + (depth - 1) * 16}px" title="${e(x.path)}"><span aria-hidden="true">${x.directory ? (expanded ? '▾' : '▸') : '·'}${icon(x.directory ? 'folder' : 'api')}</span><span>${e(x.name)}</span></div>${expanded ? children : ''}`;
      }).join('');
    }
    tree.innerHTML = rows('', 1);
    const items = [...tree.querySelectorAll('[role=treeitem]')], target = items.find(x => x.dataset.path === active) || items.find(x => x.dataset.path === r.selected) || items[0];
    if (target) { target.tabIndex = 0; if (active !== undefined) target.focus(); }
    updateMessage();
    focusLoaded();
  }
  async function load(path = '') {
    const current = root, r = record(), ticket = generation;
    if (!r || r.loaded.has(path) || r.pending.has(path)) return;
    error.textContent = ''; r.pending.add(path); tree.setAttribute('aria-busy', 'true');
    updateMessage();
    try {
      const result = await call('explorer.list', { root: current, path });
      if (ticket !== generation || root !== current) return;
      r.loaded.set(path, result); error.textContent = ''; updateStatus(); draw();
    } catch (reason) { if (ticket === generation) fail(reason); }
    finally { r.pending.delete(path); if (ticket === generation) { if (!r.pending.size) tree.removeAttribute('aria-busy'); updateMessage(); } }
  }
  async function restore(path = '') {
    const current = root, ticket = generation; await load(path);
    if (current !== root || ticket !== generation) return;
    for (const entry of record()?.loaded.get(path)?.entries || []) if (entry.directory && record().expanded.has(entry.path)) await restore(entry.path);
  }
  function choose(path) {
    ++generation; root = path; filterCollapsed.clear(); error.textContent = ''; tree.removeAttribute('aria-busy');
    if (!memory.has(root)) memory.set(root, { loaded: new Map(), pending: new Set(), expanded: new Set(), selected: '', width });
    // Requests from a previous root visit cannot prevent this visit from loading.
    record().pending = new Set(); resize(record().width); updateStatus(); draw(); if (root) void restore();
  }
  function sync() {
    const state = getState(); if (!state) return;
    const session = state.sessions.find(x => x.id === selectedConsole());
    const project = session && state.projects?.find(x => x.id === session.projectId);
    const next = session && !session.remote && !session.remoteHostId && !session.kind && session.alive ? project ? project.folders.map(f => ({ path: f.path, label: `${project.name} · ${f.label || f.path}` })) : [{ path: session.cwd, label: `Console folder · ${session.name}` }] : [];
    const stamp = JSON.stringify([session?.id, next]);
    if (stamp === context) return; context = stamp; roots = next;
    width = Math.max(180, Math.min(480, state.settings.explorerWidth || 260));
    select.innerHTML = roots.length ? roots.map(x => `<option value="${e(x.path)}">${e(x.label)}</option>`).join('') : '<option value="">No local console folder</option>';
    select.disabled = !roots.length;
    // Preserve a root only within the same console's available folders.
    select.value = roots.some(x => x.path === root) ? root : roots[0]?.path || '';
    choose(select.value);
    if (!roots.length) status.textContent = session?.remote || session?.remoteHostId ? 'Remote folders are unavailable.' : 'Select a local console.';
  }
  async function activate(item) {
    const r = record(), path = item.dataset.path;
    if (item.hasAttribute('data-directory')) {
      if (filter.value) {
        if (item.getAttribute('aria-expanded') === 'true') filterCollapsed.add(path);
        else { filterCollapsed.delete(path); await load(path); }
      }
      else if (r.expanded.has(path)) r.expanded.delete(path);
      else { r.expanded.add(path); await load(path); }
      draw(path);
    } else {
      if (opening) return;
      opening = true;
      const current = root;
      try {
        await openFile(current, path);
        if (root === current) { r.selected = path; draw(); }
        // Commit selection and release the open guard before closing the drawer.
        opening = false;
        await afterOpenFile();
      }
      catch (reason) { fail(reason); }
      finally { opening = false; }
    }
  }
  select.addEventListener('change', () => choose(select.value));
  filter.addEventListener('input', () => { filterCollapsed.clear(); draw(); });
  host.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.target.closest('input,select')) {
      event.preventDefault();
      void collapse().catch(fail);
    }
  });
  tree.addEventListener('click', event => { const item = event.target.closest('[role=treeitem]'); if (item) void activate(item); });
  tree.addEventListener('keydown', async event => {
    const item = event.target.closest('[role=treeitem]'); if (!item) return;
    const items = [...tree.querySelectorAll('[role=treeitem]')], index = items.indexOf(item), path = item.dataset.path;
    let target;
    if (['Enter', ' '].includes(event.key)) { event.preventDefault(); await activate(item); return; }
    if (event.key === 'ArrowDown') target = items[index + 1] || item;
    if (event.key === 'ArrowUp') target = items[index - 1] || item;
    if (event.key === 'Home') target = items[0];
    if (event.key === 'End') target = items.at(-1);
    if (event.key === 'ArrowRight' && item.hasAttribute('data-directory')) {
      event.preventDefault();
      if (item.getAttribute('aria-expanded') !== 'true') await activate(item);
      else if (Number(items[index + 1]?.getAttribute('aria-level')) > Number(item.getAttribute('aria-level'))) target = items[index + 1];
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (item.getAttribute('aria-expanded') === 'true') await activate(item);
      else target = items.find(x => x.dataset.path === path.split('/').slice(0, -1).join('/'));
    }
    if (target) { event.preventDefault(); items.forEach(x => x.tabIndex = -1); target.tabIndex = 0; target.focus(); }
  });
  host.querySelector('[data-explorer=refresh]').onclick = () => { if (record()) { ++generation; record().loaded.clear(); record().pending.clear(); void restore(); } };
  host.querySelector('[data-explorer=collapse]').onclick = () => {
    record()?.expanded.clear();
    if (filter.value) for (const path of record()?.loaded.keys() || []) if (path) filterCollapsed.add(path);
    draw();
  };
  handle.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); resize(event.key === 'Home' ? 180 : event.key === 'End' ? 480 : width + (event.key === 'ArrowRight' ? 10 : -10)); void saveWidth();
  });
  handle.addEventListener('pointerdown', event => { handle.setPointerCapture(event.pointerId); });
  handle.addEventListener('pointermove', event => { if (handle.hasPointerCapture(event.pointerId)) resize(event.clientX - host.getBoundingClientRect().left); });
  handle.addEventListener('pointerup', event => { if (handle.hasPointerCapture(event.pointerId)) { handle.releasePointerCapture(event.pointerId); void saveWidth(); } });
  resize(width);
  return { sync, focusTree, cancelFocus };
}
