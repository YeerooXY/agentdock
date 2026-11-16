import { projectWorkspaceController } from './pages/project-workspace-controller.js';
import { projectColor } from './project-colors.js';
import { projectActivity, attentionLabel } from './project-activity.js';
export function projectsUI({ call, getState, escape: e, icon, toast, renderPage, openNew, getPage = () => 'projects' }) {
  const workspace = projectWorkspaceController({ call, getState, getPage, renderPage, escape: e, icon, toast });
  let query = '', category = '', status = 'open', opener, afterSave;
  const dialog = document.createElement('dialog'); dialog.id = 'project-editor'; dialog.setAttribute('aria-labelledby', 'project-editor-title');
  dialog.innerHTML = `<form id="project-form"><div class="dialog-heading"><h2 id="project-editor-title">New project</h2><button type="button" class="icon-button" data-project-close aria-label="Close project">${icon('close')}</button></div>
    <div class="form-pair"><label>Name<input name="name" maxlength="64" required autocomplete="off"></label><label>Category<input name="category" maxlength="60" list="project-categories" placeholder="Game, app, research…"><datalist id="project-categories"></datalist></label></div>
    <label class="project-color-field">Color<input type="color" name="color" value="#89b4ff" aria-label="Project color"></label>
    <label>Project folders<textarea name="folders" required rows="2" placeholder="One folder per line. Optional label: Game | C:\\Projects\\Game"></textarea></label><button type="button" class="secondary" data-project-folder>${icon('folder')}Add folder</button>
    <label>Status<select name="status"><option value="planning">Planning</option><option value="active">Active</option><option value="paused">Paused</option><option value="complete">Complete</option><option value="archived">Archived</option></select></label>
    <p class="form-error" role="alert"></p><div class="project-dialog-actions"><button type="button" class="subtle danger" data-project-remove hidden>Delete project</button><button type="submit" class="primary">Save project</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  dialog.addEventListener('close', () => { opener?.isConnected && opener.focus(); afterSave = null; });
  const projects = () => getState().projects || [];
  function cards() {
    const activity = projectActivity(getState());
    const items = projects().filter(p => (!category || p.category === category) && (!status || status === 'open' ? !status || ['active', 'planning'].includes(p.status) : p.status === status) && `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()));
    return items.length ? items.map(p => {
      const current = activity.get(p.id);
      return `<article class="surface project-card" data-project-id="${e(p.id)}" style="--project-color:${projectColor(p)}">
        <header class="project-card-heading"><span class="project-card-icon" aria-hidden="true">${icon(p.category?.toLowerCase() === 'game' ? 'grid' : 'folder')}</span><span class="project-state" data-status="${e(p.status)}">${e(p.status)}</span></header>
        <h2>${e(p.name)}</h2>
        <div class="project-tags">${[p.category, ...p.folders.map(f => f.label)].filter(Boolean).slice(0, 3).map(tag => `<span>${e(tag)}</span>`).join('')}</div>
        <div class="project-activity"><span>${current.running} running</span>${current.consoles ? `<span>${current.consoles} console${current.consoles === 1 ? '' : 's'}</span>` : ''}${current.attention ? `<span class="project-attention">${attentionLabel(current.attention)}</span>` : ''}</div>
        <footer class="project-card-footer">
          <div class="project-actions"><button class="secondary" data-project-inspect="${e(p.id)}">Knowledge</button>
          <details class="project-more"><summary aria-label="More actions for ${e(p.name)}">•••</summary><div class="project-more-content">
            <button class="secondary" data-project-open="${e(p.id)}">${icon('terminal')}Open console</button><button class="subtle" data-project-edit="${e(p.id)}">Edit project</button>
            <div class="project-folder-links">${p.folders.map((f, index) => `<button class="subtle" data-project-folder-open="${e(p.id)}" data-folder-index="${index}" title="${e(f.path)}">${icon('folder')}<span>${e(f.label || f.path)}</span></button>`).join('')}</div>
          </div></details></div>
        </footer></article>`;
    }).join('') : `<div class="surface project-empty"><h2>${projects().length ? 'No matching projects' : 'No projects'}</h2>${projects().length ? '<p>Try a different filter.</p>' : ''}<button class="primary" data-project-new>${icon('plus')}New project</button></div>`;
  }

  function refreshCards(force = false) {
    if (workspace.sync()) return;
    const host = document.querySelector('#project-cards'); if (!host) return;
    if (!force && host.contains(document.activeElement) && document.activeElement.closest('form')) return;
    const fingerprint = JSON.stringify([projects(), [...projectActivity(getState())].map(([id, value]) => [id, value.running, value.consoles, value.attention]), query, category, status]);
    if (force) delete host.dataset.fingerprint;
    if (host.dataset.fingerprint === fingerprint) return;
    host.dataset.fingerprint = fingerprint;
    const open = [...host.querySelectorAll('details[open]')].map(x => [x.closest('[data-project-id]').dataset.projectId, x.className]);
    const focused = document.activeElement, focusId = focused?.closest('[data-project-id]')?.dataset.projectId;
    const focusAttribute = [...(focused?.attributes || [])].find(attribute => attribute.name.startsWith('data-'));
    const focusSelector = focused?.matches('summary') && focused.parentElement.className
      ? `details.${CSS.escape(focused.parentElement.className)} > summary`
      : focusAttribute ? `[${focusAttribute.name}="${CSS.escape(focusAttribute.value)}"]` : null;
    host.innerHTML = cards();
    for (const [id, kind] of open) { const details = host.querySelector(`[data-project-id="${id}"] details.${kind}`); if (details) details.open = true; }
    if (focusId && focusSelector) host.querySelector(`[data-project-id="${CSS.escape(focusId)}"] ${focusSelector}`)?.focus({ preventScroll: true });
  }
  function render() {
    const detail = workspace.render(); if (detail) return detail;
    const categories = [...new Set(projects().map(x => x.category).filter(Boolean))].sort();
    return `<div class="page-heading"><h1>Projects</h1><div class="project-actions"><button type="button" class="secondary" data-page="tasks">Message plans</button><button class="primary" data-project-new>${icon('plus')}New project</button></div></div><div class="project-filters"><label>Find a project<input data-project-search value="${e(query)}" type="search" placeholder="Name or category"></label><label>Category<select data-project-category><option value="">All categories</option>${categories.map(x => `<option ${x === category ? 'selected' : ''}>${e(x)}</option>`).join('')}</select></label><label>Status<select data-project-status>${[['open','Open projects'],['planning','Planning'],['active','Active'],['paused','Paused'],['complete','Complete'],['archived','Archived'],['','All projects']].map(([v, label]) => `<option value="${v}" ${v === status ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="project-cards" id="project-cards">${cards()}</div>`;
  }
  function edit(id, callback, trigger = document.activeElement, seed = {}) {
    const p = projects().find(x => x.id === id); opener = trigger; afterSave = callback;
    form.reset(); form.dataset.id = p?.id || '';
    for (const key of ['name','category','status']) form.elements[key].value = p?.[key] || (key === 'status' ? 'active' : '');
    form.elements.color.value = projectColor(p);
    if (!p) { form.elements.name.value = seed.name || ''; }
    form.elements.folders.value = p ? p.folders.map(x => (x.label ? x.label + ' | ' : '') + x.path).join('\n') : seed.cwd || getState().settings.consoleDefaults.cwd;
    form.querySelector('.form-error').textContent = '';
    form.querySelector('[data-project-remove]').hidden = !p;
    form.querySelector('[data-project-remove]').textContent = 'Delete project'; delete form.dataset.confirmDelete;
    dialog.querySelector('h2').textContent = p ? 'Edit project' : 'New project';
    form.querySelector('[type=submit]').textContent = 'Save project';
    dialog.querySelector('datalist').innerHTML = [...new Set(projects().map(x => x.category).filter(Boolean))].map(x => `<option value="${e(x)}"></option>`).join('');
    dialog.showModal(); form.elements.name.focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      const folders = data.folders.split('\n').map(x => x.trim()).filter(Boolean).map(line => { const split = line.indexOf('|'); return split < 0 ? { path: line, label: '' } : { label: line.slice(0, split).trim(), path: line.slice(split + 1).trim() }; });
      const saved = await call('projects.save', { ...data, id: form.dataset.id || undefined, folders });
      const callback = afterSave; dialog.close(); reveal(saved.id); toast('Project saved.'); callback?.(saved);
    } catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  document.addEventListener('click', async event => {
    const b = event.target.closest('button'); if (!b) return;
    try {
      if (b.hasAttribute('data-project-new')) edit(undefined, undefined, b);
      if (b.dataset.projectEdit) edit(b.dataset.projectEdit, undefined, b);
      if (b.dataset.projectOpen) await openNew(undefined, { projectId: b.dataset.projectOpen });
      if (b.dataset.projectFolderOpen) await call('projects.folder', { id: b.dataset.projectFolderOpen, index: Number(b.dataset.folderIndex) });
      if (b.hasAttribute('data-project-close')) dialog.close();
      if (b.hasAttribute('data-project-folder')) { const chosen = await call('pickFolder'); if (chosen) form.elements.folders.value = [form.elements.folders.value.trim(), chosen].filter(Boolean).join('\n'); }
      if (b.hasAttribute('data-project-remove')) {
        if (!form.dataset.confirmDelete) { form.dataset.confirmDelete = 'true'; b.textContent = 'Confirm delete'; form.querySelector('.form-error').textContent = 'Deletes this project record. Project files and open consoles stay.'; return; }
        await call('projects.remove', form.dataset.id); dialog.close(); renderPage(); document.querySelector('[data-project-new]')?.focus(); toast('Project deleted.');
      }
    } catch (error) { toast(error.message, true); }
  });
  document.addEventListener('input', event => { if (event.target.hasAttribute('data-project-search')) { query = event.target.value; refreshCards(); } });
  document.addEventListener('change', async event => {
    const input = event.target;
    if (input.hasAttribute('data-project-category')) { category = input.value; refreshCards(); }
    if (input.hasAttribute('data-project-status')) { status = input.value; refreshCards(); }
  });
  function reveal(id) {
    query = ''; category = ''; status = '';
    renderPage();
    const card = [...document.querySelectorAll('.project-card')].find(x => x.dataset.projectId === id);
    if (card) { card.tabIndex = -1; card.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' }); }
  }
  return { render, edit, refreshCards, reveal, showWorkspace: workspace.show, observeKnowledgePolicy: workspace.observePolicy };
}
