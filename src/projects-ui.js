import './projects.css';

export function projectsUI({ call, getState, escape: e, icon, toast, renderPage, openNew }) {
  let query = '', category = '', status = 'active', opener, afterSave;
  const dialog = document.createElement('dialog'); dialog.id = 'project-editor'; dialog.setAttribute('aria-labelledby', 'project-editor-title');
  dialog.innerHTML = `<form id="project-form"><div class="dialog-heading"><h2 id="project-editor-title">New project</h2><button type="button" class="icon-button" data-project-close aria-label="Close project">${icon('close')}</button></div>
    <div class="form-pair"><label>Name<input name="name" maxlength="64" required autocomplete="off"></label><label>Category<input name="category" maxlength="60" list="project-categories" placeholder="Game, app, research…"><datalist id="project-categories"></datalist></label></div>
    <label>Goals<textarea name="goals" maxlength="10000" rows="3" placeholder="What do you want to make?"></textarea></label>
    <label data-project-existing>How it will work<textarea name="approach" maxlength="10000" rows="3"></textarea></label>
    <label data-project-existing>Next step<input name="nextStep" maxlength="1000" placeholder="One clear thing to pick up next time"></label>
    <label data-project-existing>Milestones<textarea name="milestones" rows="4" placeholder="One per line. Use [x] for completed work."></textarea></label>
    <label>Project folders<textarea name="folders" required rows="2" placeholder="One folder per line. Optional label: Game | C:\\Projects\\Game"></textarea></label><button type="button" class="secondary" data-project-folder>${icon('folder')}Add folder</button>
    <details data-project-existing><summary>Notes and status</summary><label>Project notes<textarea name="notes" maxlength="20000" rows="5"></textarea></label><label>Status<select name="status"><option value="active">Active</option><option value="paused">Paused</option><option value="complete">Complete</option><option value="archived">Archived</option></select></label></details>
    <p class="form-error" role="alert"></p><div class="project-dialog-actions"><button type="button" class="subtle danger" data-project-remove hidden>Delete project</button><button type="submit" class="primary">Save project</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  dialog.addEventListener('close', () => { opener?.isConnected && opener.focus(); afterSave = null; });
  const since = value => {
    if (!value) return 'Not opened yet';
    const days = Math.floor((Date.now() - value) / 86400000);
    return days < 1 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
  };
  const projects = () => getState().projects || [];
  function cards() {
    const items = projects().filter(p => (!category || p.category === category) && (!status || p.status === status) && `${p.name} ${p.category} ${p.goals} ${p.nextStep}`.toLowerCase().includes(query.toLowerCase()));
    return items.length ? items.map(p => {
      const done = p.milestones.filter(x => x.done).length, total = p.milestones.length;
      const stale = p.status === 'active' && Date.now() - (p.lastActiveAt || p.createdAt) > 7 * 86400000;
      return `<article class="surface project-card" data-project-id="${e(p.id)}"><div class="project-card-heading"><div><span class="project-category">${e(p.category || 'Uncategorized')}</span><h2>${e(p.name)}</h2></div><span class="project-state">${e(p.status)}</span></div>
        <p class="project-goals">${e(p.goals || 'Add a goal to give this project direction.')}</p>
        <div class="project-next"><span>Next step</span><p>${e(p.nextStep || 'Choose what to work on next.')}</p></div>
        <div class="project-progress"><span>${done} / ${total} milestones</span>${total ? `<progress max="${total}" value="${done}" aria-label="${e(p.name)} milestone progress"></progress>` : ''}</div>
        ${total ? `<details class="project-milestones"><summary>Milestones</summary>${p.milestones.map((m, i) => `<label><input type="checkbox" data-project-milestone="${i}" ${m.done ? 'checked' : ''}><span>${e(m.text)}</span></label>`).join('')}</details>` : ''}
        <div class="project-last"><time title="${p.lastActiveAt ? e(new Date(p.lastActiveAt).toLocaleString()) : ''}">Last worked: ${since(p.lastActiveAt)}</time>${stale ? '<span class="project-return">Pick up again</span>' : ''}</div>
        <div class="project-actions"><button class="primary" data-project-open="${e(p.id)}">${icon('terminal')}Open console</button><button class="secondary" data-project-edit="${e(p.id)}">Edit</button></div></article>`;
    }).join('') : `<div class="surface project-empty"><h2>${projects().length ? 'No matching projects' : 'Give your next idea a home'}</h2><p>${projects().length ? 'Try a different filter.' : 'Start with your goal. Work out the details as you go.'}</p><button class="primary" data-project-new>${icon('plus')}New project</button></div>`;
  }
  function refreshCards() {
    const host = document.querySelector('#project-cards'); if (!host) return;
    const fingerprint = JSON.stringify([projects(), query, category, status]);
    if (host.dataset.fingerprint === fingerprint) return;
    host.dataset.fingerprint = fingerprint;
    const open = [...host.querySelectorAll('.project-milestones[open]')].map(x => x.closest('[data-project-id]').dataset.projectId);
    const focused = document.activeElement, focusId = focused?.closest('[data-project-id]')?.dataset.projectId, milestone = focused?.dataset.projectMilestone;
    host.innerHTML = cards();
    for (const id of open) { const details = host.querySelector(`[data-project-id="${id}"] details`); if (details) details.open = true; }
    if (focusId && milestone !== undefined) host.querySelector(`[data-project-id="${focusId}"] [data-project-milestone="${milestone}"]`)?.focus({ preventScroll: true });
  }
  function render() {
    const categories = [...new Set(projects().map(x => x.category).filter(Boolean))].sort();
    return `<div class="page-heading"><h1>Projects</h1><button class="primary" data-project-new>${icon('plus')}New project</button></div><div class="project-filters"><label>Find a project<input data-project-search value="${e(query)}" type="search" placeholder="Name, goal or next step"></label><label>Category<select data-project-category><option value="">All categories</option>${categories.map(x => `<option ${x === category ? 'selected' : ''}>${e(x)}</option>`).join('')}</select></label><label>Status<select data-project-status>${[['active','Active'],['paused','Paused'],['complete','Complete'],['archived','Archived'],['','All projects']].map(([v, label]) => `<option value="${v}" ${v === status ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="project-cards" id="project-cards">${cards()}</div>`;
  }
  function edit(id, callback, trigger = document.activeElement, seed = {}) {
    const p = projects().find(x => x.id === id); opener = trigger; afterSave = callback;
    form.reset(); form.dataset.id = p?.id || '';
    for (const section of form.querySelectorAll('[data-project-existing]')) {
      section.hidden = !p;
      for (const input of section.querySelectorAll('input, textarea, select')) input.disabled = !p;
      if (section.tagName === 'DETAILS') section.open = false;
    }
    for (const key of ['name','category','goals','approach','notes','nextStep','status']) form.elements[key].value = p?.[key] || (key === 'status' ? 'active' : '');
    if (!p) { form.elements.name.value = seed.name || ''; form.elements.goals.value = seed.goals || ''; }
    form.elements.folders.value = p ? p.folders.map(x => (x.label ? x.label + ' | ' : '') + x.path).join('\n') : seed.cwd || getState().settings.consoleDefaults.cwd;
    form.elements.milestones.value = (p?.milestones || []).map(x => `[${x.done ? 'x' : ' '}] ${x.text}`).join('\n');
    form.querySelector('.form-error').textContent = '';
    form.querySelector('[data-project-remove]').hidden = !p;
    form.querySelector('[data-project-remove]').textContent = 'Delete project'; delete form.dataset.confirmDelete;
    dialog.querySelector('h2').textContent = p ? 'Edit project' : 'New project';
    form.querySelector('[type=submit]').textContent = p ? 'Save project' : 'Create project';
    dialog.querySelector('datalist').innerHTML = [...new Set(projects().map(x => x.category).filter(Boolean))].map(x => `<option value="${e(x)}"></option>`).join('');
    dialog.showModal(); form.elements.name.focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      const folders = data.folders.split('\n').map(x => x.trim()).filter(Boolean).map(line => { const split = line.indexOf('|'); return split < 0 ? { path: line, label: '' } : { label: line.slice(0, split).trim(), path: line.slice(split + 1).trim() }; });
      const milestones = (data.milestones || '').split('\n').map(x => x.trim()).filter(Boolean).map(line => ({ text: line.replace(/^\[(?:x| )\]\s*/i, ''), done: /^\[x\]/i.test(line) }));
      const saved = await call('projects.save', { ...data, id: form.dataset.id || undefined, folders, milestones });
      const callback = afterSave; dialog.close(); renderPage(); toast('Project saved.'); callback?.(saved);
    } catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  document.addEventListener('click', async event => {
    const b = event.target.closest('button'); if (!b) return;
    try {
      if (b.hasAttribute('data-project-new')) edit(undefined, undefined, b);
      if (b.dataset.projectEdit) edit(b.dataset.projectEdit, undefined, b);
      if (b.dataset.projectOpen) await openNew(undefined, { projectId: b.dataset.projectOpen });
      if (b.hasAttribute('data-project-close')) dialog.close();
      if (b.hasAttribute('data-project-folder')) { const chosen = await call('pickFolder'); if (chosen) form.elements.folders.value = [form.elements.folders.value.trim(), chosen].filter(Boolean).join('\n'); }
      if (b.hasAttribute('data-project-remove')) {
        if (!form.dataset.confirmDelete) { form.dataset.confirmDelete = 'true'; b.textContent = 'Confirm delete'; form.querySelector('.form-error').textContent = 'Deletes this project record. Project files and open consoles stay.'; return; }
        await call('projects.remove', form.dataset.id); dialog.close(); renderPage(); toast('Project deleted.');
      }
    } catch (error) { toast(error.message, true); }
  });
  document.addEventListener('input', event => { if (event.target.hasAttribute('data-project-search')) { query = event.target.value; refreshCards(); } });
  document.addEventListener('change', async event => {
    const input = event.target;
    if (input.hasAttribute('data-project-category')) { category = input.value; refreshCards(); }
    if (input.hasAttribute('data-project-status')) { status = input.value; refreshCards(); }
    if (input.hasAttribute('data-project-milestone')) {
      input.disabled = true;
      try { await call('projects.progress', { id: input.closest('[data-project-id]').dataset.projectId, milestone: Number(input.dataset.projectMilestone), done: input.checked }); refreshCards(); }
      catch (error) { input.checked = !input.checked; input.disabled = false; toast(error.message, true); }
    }
  });
  function reveal(id) {
    query = ''; category = ''; status = '';
    renderPage();
    const card = [...document.querySelectorAll('.project-card')].find(x => x.dataset.projectId === id);
    if (card) { card.tabIndex = -1; card.focus({ preventScroll: true }); card.scrollIntoView({ block: 'nearest' }); }
  }
  return { render, edit, refreshCards, reveal };
}
