import './projects.css';
import { projectColor, projectDot } from './project-colors.js';
import { projectPlanUI, milestoneLines, parseMilestones, waitingProposal } from './project-plan-ui';

export function projectsUI({ call, getState, escape: e, icon, toast, renderPage, openNew, preview }) {
  let query = '', category = '', status = 'open', opener, afterSave;
  const plan = projectPlanUI({ call, getState, escape: e, icon, toast, renderPage, openNew, preview });
  const dialog = document.createElement('dialog'); dialog.id = 'project-editor'; dialog.setAttribute('aria-labelledby', 'project-editor-title');
  dialog.innerHTML = `<form id="project-form"><div class="dialog-heading"><h2 id="project-editor-title">New project</h2><button type="button" class="icon-button" data-project-close aria-label="Close project">${icon('close')}</button></div>
    <div class="form-pair"><label>Name<input name="name" maxlength="64" required autocomplete="off"></label><label>Category<input name="category" maxlength="60" list="project-categories" placeholder="Game, app, research…"><datalist id="project-categories"></datalist></label></div>
    <label class="project-color-field">Color<input type="color" name="color" value="#89b4ff" aria-label="Project color"></label>
    <label>Goals<textarea name="goals" maxlength="10000" rows="3" placeholder="What do you want to make?"></textarea></label>
    <div data-project-new-fields><label>Audience<textarea name="audience" maxlength="10000" rows="2" placeholder="Who is this for?"></textarea></label><label>Success criteria<textarea name="success" maxlength="10000" rows="2" placeholder="What would make it successful?"></textarea></label></div>
    <label data-project-existing>How it will work<textarea name="approach" maxlength="10000" rows="3"></textarea></label>
    <label data-project-existing>Next step<input name="nextStep" maxlength="1000" placeholder="One clear thing to pick up next time"></label>
    <label>Initial milestones<textarea name="milestones" rows="4" placeholder="Milestone | Done when"></textarea><span class="field-hint">Start with the outcomes you know. Refine them during planning.</span></label>
    <label>Project folders<textarea name="folders" required rows="2" placeholder="One folder per line. Optional label: Game | C:\\Projects\\Game"></textarea></label><button type="button" class="secondary" data-project-folder>${icon('folder')}Add folder</button>
    <details data-project-existing><summary>Notes and status</summary><label>Project notes<textarea name="notes" maxlength="20000" rows="5"></textarea></label><label>Status<select name="status"><option value="planning">Planning</option><option value="active">Active</option><option value="paused">Paused</option><option value="complete">Complete</option><option value="archived">Archived</option></select></label></details>
    <p class="field-hint" data-project-new-note>New projects start in Planning.</p>
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
  const proposals = () => getState().projectProposals || [];
  function proposalSection() {
    const items = proposals();
    return items.length ? `<section aria-labelledby="project-proposals-title"><h2 id="project-proposals-title">Proposed by agents</h2><div class="project-cards">${items.map(p => `<article class="surface project-card"><h3>${e(p.name)}</h3><p>${e(p.goals)}</p><ul>${p.folders.map(f => `<li>${e(f.path)}</li>`).join('')}</ul><p>${p.milestones.length} milestones · ${e(p.consoleName)}</p>${p.milestones.length ? `<details><summary>Milestones</summary><ul>${p.milestones.map(m => `<li>${e(m.text)}${m.acceptance ? ` — ${e(m.acceptance)}` : ''}</li>`).join('')}</ul></details>` : ''}${p.decisions.length ? `<details open><summary>Decisions to approve</summary><ul>${p.decisions.map(d => `<li>${e(d.text)}${d.reason ? ` — ${e(d.reason)}` : ''}</li>`).join('')}</ul></details>` : ''}<div class="project-actions"><button class="primary" data-proposal-accept="${e(p.id)}">Create project</button><button class="subtle" data-proposal-dismiss="${e(p.id)}">Dismiss</button></div></article>`).join('')}</div></section>` : '';
  }
  let editingDecision = '';
  // Agents propose decisions; only approved ones reach their project context.
  function decisions(p) {
    const list = p.decisions || [], waiting = list.filter(d => d.status === 'proposed'), approved = list.filter(d => d.status === 'approved');
    const row = d => editingDecision === d.id
      ? `<li class="decision-row" data-decision-id="${e(d.id)}"><form class="decision-edit" data-decision-edit="${e(d.id)}"><label>Decision<input name="text" maxlength="500" required value="${e(d.text)}"></label><label>Reason<input name="reason" maxlength="1000" value="${e(d.reason || '')}"></label><div class="decision-actions"><button class="primary" type="submit">Save</button><button class="subtle" type="button" data-decision-cancel>Cancel</button></div></form></li>`
      : `<li class="decision-row" data-decision-id="${e(d.id)}"><div><p>${e(d.text)}</p>${d.reason ? `<small>${e(d.reason)}</small>` : ''}${d.status === 'proposed' ? `<small class="decision-by">Proposed by ${e(d.by || 'an agent')}</small>` : ''}</div><div class="decision-actions">${d.status === 'proposed'
        ? `<button class="primary" data-decision="approve">Approve</button><button class="subtle" data-decision="edit">Edit</button><button class="subtle" data-decision="reject">Reject</button>`
        : `<button class="subtle" data-decision="edit">Edit</button><button class="subtle" data-decision="remove" aria-label="Remove decision: ${e(d.text)}">Remove</button>`}</div></li>`;
    return `<details class="project-decisions" ${waiting.length || list.some(d => d.id === editingDecision) ? 'open' : ''}><summary>Decisions · ${approved.length}${waiting.length ? ` <span class="decision-waiting">${waiting.length} to review</span>` : ''}</summary>
      ${waiting.length ? `<h3>Proposed by agents</h3><ul>${waiting.map(row).join('')}</ul>` : ''}
      ${approved.length ? `<h3>Approved · every agent in this project follows these</h3><ul>${approved.map(row).join('')}</ul>` : '<p class="decision-empty">No decisions yet. Agents propose lasting choices here, or add one.</p>'}
      <form class="decision-add" data-decision-add><label>Add a decision<input name="text" maxlength="500" required placeholder="For example: use tabs, not spaces"></label><label>Reason (optional)<input name="reason" maxlength="1000"></label><button class="secondary" type="submit">Add</button></form></details>`;
  }
  function cards() {
    const items = projects().filter(p => (!category || p.category === category) && (!status || status === 'open' ? !status || ['active', 'planning'].includes(p.status) : p.status === status) && `${p.name} ${p.category} ${p.goals} ${p.nextStep}`.toLowerCase().includes(query.toLowerCase()));
    return items.length ? items.map(p => {
      const done = p.milestones.filter(x => x.done).length, total = p.milestones.length;
      const stale = p.status === 'active' && Date.now() - (p.lastActiveAt || p.createdAt) > 7 * 86400000;
      const waiting = p.plan && !p.plan.approvals.roadmap, proposal = p.plan && waitingProposal(p.plan);
      return `<article class="surface project-card" data-project-id="${e(p.id)}"><div class="project-card-heading"><div><span class="project-category">${e(p.category || 'Uncategorized')}</span><h2>${projectDot(p)}${e(p.name)}</h2></div><span class="project-state" data-status="${e(p.status)}">${e(p.status)}</span></div>
        <p class="project-goals">${e(p.goals || 'No goals recorded.')}</p>
        <div class="project-next"><span>Next step</span><p>${e(proposal ? 'Review the agent proposal' : p.nextStep || 'No next step recorded.')}</p></div>
        <div class="project-progress"><span>${done} / ${total} milestones</span>${total ? `<progress max="${total}" value="${done}" aria-label="${e(p.name)} milestone progress"></progress>` : ''}</div>
        ${total ? `<details class="project-milestones"><summary>Milestones${waiting ? ' · Draft' : ''}</summary>${p.milestones.map((m, i) => `<label><input type="checkbox" data-project-milestone="${i}" ${m.done ? 'checked' : ''}><span>${e(m.text)}${m.acceptance ? `<small>Done when: ${e(m.acceptance)}</small>` : ''}</span></label>`).join('')}</details>` : ''}
        ${decisions(p)}
        <div class="project-last"><time title="${p.lastActiveAt ? e(new Date(p.lastActiveAt).toLocaleString()) : ''}">Last worked: ${since(p.lastActiveAt)}</time>${stale ? '<span class="project-return">Pick up again</span>' : ''}</div>
        <div class="project-folder-links">${p.folders.map((f, index) => `<button class="subtle" data-project-folder-open="${e(p.id)}" data-folder-index="${index}" title="${e(f.path)}">${icon('folder')}<span>${e(f.label || f.path)}</span></button>`).join('')}</div>
        ${p.plan?.files?.error ? `<p class="form-error">Project files need attention. Open Roadmap to retry.</p>` : ''}
        ${p.plan && p.status === 'planning' ? `<p class="field-hint">Mark open plan sections not needed and set this project to Active. Waiting proposals stay.</p><button class="secondary" data-project-underway="${e(p.id)}">Already under way</button>` : ''}
        <div class="project-actions"><button class="${proposal ? 'secondary' : 'primary'}" data-project-open="${e(p.id)}">${icon('terminal')}Open console</button><button class="${proposal ? 'primary' : 'secondary'}" data-project-plan="${e(p.id)}">${proposal ? 'Review proposal' : p.plan ? 'Plan' : 'Plan project'}</button><button class="subtle" data-project-edit="${e(p.id)}">Edit</button></div></article>`;
    }).join('') : `<div class="surface project-empty"><h2>${projects().length ? 'No matching projects' : 'No projects'}</h2>${projects().length ? '<p>Try a different filter.</p>' : ''}<button class="primary" data-project-new>${icon('plus')}New project</button></div>`;
  }
  function refreshCards(force = false) {
    plan.refresh();
    const proposalsHost = document.querySelector('#project-proposals');
    if (proposalsHost) { const value = JSON.stringify(proposals()); if (proposalsHost.dataset.fingerprint !== value) { proposalsHost.dataset.fingerprint = value; proposalsHost.innerHTML = proposalSection(); } }
    const host = document.querySelector('#project-cards'); if (!host) return;
    const fingerprint = JSON.stringify([projects(), query, category, status, editingDecision]);
    if (force) delete host.dataset.fingerprint;
    if (host.dataset.fingerprint === fingerprint) return;
    host.dataset.fingerprint = fingerprint;
    const open = [...host.querySelectorAll('details[open]')].map(x => [x.closest('[data-project-id]').dataset.projectId, x.className]);
    const focused = document.activeElement, focusId = focused?.closest('[data-project-id]')?.dataset.projectId, milestone = focused?.dataset.projectMilestone;
    host.innerHTML = cards();
    for (const [id, kind] of open) { const details = host.querySelector(`[data-project-id="${id}"] details.${kind}`); if (details) details.open = true; }
    if (focusId && milestone !== undefined) host.querySelector(`[data-project-id="${focusId}"] [data-project-milestone="${milestone}"]`)?.focus({ preventScroll: true });
  }
  function render() {
    const categories = [...new Set(projects().map(x => x.category).filter(Boolean))].sort();
    return `<div class="page-heading"><h1>Projects</h1><button class="primary" data-project-new>${icon('plus')}New project</button></div><div id="project-proposals">${proposalSection()}</div><div class="project-filters"><label>Find a project<input data-project-search value="${e(query)}" type="search" placeholder="Name, goal or next step"></label><label>Category<select data-project-category><option value="">All categories</option>${categories.map(x => `<option ${x === category ? 'selected' : ''}>${e(x)}</option>`).join('')}</select></label><label>Status<select data-project-status>${[['open','Open projects'],['planning','Planning'],['active','Active'],['paused','Paused'],['complete','Complete'],['archived','Archived'],['','All projects']].map(([v, label]) => `<option value="${v}" ${v === status ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="project-cards" id="project-cards">${cards()}</div>`;
  }
  function edit(id, callback, trigger = document.activeElement, seed = {}) {
    const p = projects().find(x => x.id === id); opener = trigger; afterSave = callback;
    form.reset(); form.dataset.id = p?.id || '';
    form.dataset.revision = p?.plan?.revision ?? '';
    form.querySelector('[data-project-new-fields]').hidden = !!p;
    form.querySelector('[data-project-new-note]').hidden = !!p;
    for (const section of form.querySelectorAll('[data-project-existing]')) {
      section.hidden = !p;
      for (const input of section.querySelectorAll('input, textarea, select')) input.disabled = !p;
      if (section.tagName === 'DETAILS') section.open = false;
    }
    for (const key of ['name','category','goals','approach','notes','nextStep','status']) form.elements[key].value = p?.[key] || (key === 'status' ? 'active' : '');
    form.elements.color.value = projectColor(p);
    if (!p) { form.elements.name.value = seed.name || ''; form.elements.goals.value = seed.goals || ''; }
    form.elements.folders.value = p ? p.folders.map(x => (x.label ? x.label + ' | ' : '') + x.path).join('\n') : seed.cwd || getState().settings.consoleDefaults.cwd;
    form.elements.milestones.value = milestoneLines(p?.milestones);
    form.querySelector('.form-error').textContent = '';
    form.querySelector('[data-project-remove]').hidden = !p;
    form.querySelector('[data-project-remove]').textContent = 'Delete project'; delete form.dataset.confirmDelete;
    dialog.querySelector('h2').textContent = p ? 'Edit project' : 'New project';
    form.querySelector('[type=submit]').textContent = p ? 'Save project' : 'Save planning draft';
    dialog.querySelector('datalist').innerHTML = [...new Set(projects().map(x => x.category).filter(Boolean))].map(x => `<option value="${e(x)}"></option>`).join('');
    dialog.showModal(); form.elements.name.focus();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      const folders = data.folders.split('\n').map(x => x.trim()).filter(Boolean).map(line => { const split = line.indexOf('|'); return split < 0 ? { path: line, label: '' } : { label: line.slice(0, split).trim(), path: line.slice(split + 1).trim() }; });
      const milestones = parseMilestones(data.milestones || '');
      const creating = !form.dataset.id;
      const saved = await call('projects.save', { ...data, id: form.dataset.id || undefined, revision: form.dataset.revision ? Number(form.dataset.revision) : undefined, folders, milestones });
      const callback = afterSave; dialog.close(); renderPage(); toast(creating ? 'Planning draft saved.' : 'Project saved.'); callback?.(saved);
      if (creating && !callback) await plan.open(saved.id);
    } catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  document.addEventListener('click', async event => {
    const b = event.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.proposalAccept || b.dataset.proposalDismiss) { b.disabled = true; const accept = !!b.dataset.proposalAccept; try { await call(accept ? 'projects.proposal.accept' : 'projects.proposal.dismiss', { id: b.dataset.proposalAccept || b.dataset.proposalDismiss }); refreshCards(); toast(accept ? 'Project created.' : 'Proposal dismissed.'); } finally { b.disabled = false; } }
      if (b.hasAttribute('data-project-new')) edit(undefined, undefined, b);
      if (b.dataset.projectEdit) edit(b.dataset.projectEdit, undefined, b);
      if (b.dataset.projectOpen) await openNew(undefined, { projectId: b.dataset.projectOpen });
      if (b.dataset.projectPlan) await plan.open(b.dataset.projectPlan, b);
      if (b.dataset.projectUnderway) { const p = projects().find(x => x.id === b.dataset.projectUnderway); await call('projects.plan.underway', { id: p.id, revision: p.plan.revision }); refreshCards(); toast('Project active.'); }
      if (b.dataset.decision || b.hasAttribute('data-decision-cancel')) {
        const id = b.closest('[data-project-id]').dataset.projectId, decisionId = b.closest('[data-decision-id]').dataset.decisionId;
        if (b.hasAttribute('data-decision-cancel')) { editingDecision = ''; refreshCards(true); }
        else if (b.dataset.decision === 'edit') { editingDecision = decisionId; refreshCards(true); document.querySelector(`[data-decision-edit="${decisionId}"] input`)?.focus(); }
        else { b.disabled = true; await call('projects.decision', { id, decisionId, action: b.dataset.decision }); refreshCards(); toast(b.dataset.decision === 'approve' ? 'Decision approved. Agents in this project now follow it.' : b.dataset.decision === 'reject' ? 'Decision rejected.' : 'Decision removed.'); }
      }
      if (b.dataset.projectFolderOpen) await call('projects.folder', { id: b.dataset.projectFolderOpen, index: Number(b.dataset.folderIndex) });
      if (b.hasAttribute('data-project-close')) dialog.close();
      if (b.hasAttribute('data-project-folder')) { const chosen = await call('pickFolder'); if (chosen) form.elements.folders.value = [form.elements.folders.value.trim(), chosen].filter(Boolean).join('\n'); }
      if (b.hasAttribute('data-project-remove')) {
        if (!form.dataset.confirmDelete) { form.dataset.confirmDelete = 'true'; b.textContent = 'Confirm delete'; form.querySelector('.form-error').textContent = 'Deletes this project record. Project files and open consoles stay.'; return; }
        await call('projects.remove', form.dataset.id); dialog.close(); renderPage(); toast('Project deleted.');
      }
    } catch (error) { toast(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const add = event.target.closest('[data-decision-add]'), change = event.target.closest('[data-decision-edit]');
    if (!add && !change) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target)), id = event.target.closest('[data-project-id]').dataset.projectId;
    try {
      if (add) await call('projects.decision', { id, action: 'add', text: data.text, reason: data.reason });
      else await call('projects.decision', { id, decisionId: change.dataset.decisionEdit, action: 'edit', text: data.text, reason: data.reason });
      editingDecision = ''; refreshCards(true); toast(add ? 'Decision added.' : 'Decision saved.');
    } catch (error) { toast(error.message, true); }
  });
  document.addEventListener('input', event => { if (event.target.hasAttribute('data-project-search')) { query = event.target.value; refreshCards(); } });
  document.addEventListener('change', async event => {
    const input = event.target;
    if (input.hasAttribute('data-project-category')) { category = input.value; refreshCards(); }
    if (input.hasAttribute('data-project-status')) { status = input.value; refreshCards(); }
    if (input.hasAttribute('data-project-milestone')) {
      input.disabled = true;
      try { const id = input.closest('[data-project-id]').dataset.projectId; await call('projects.progress', { id, revision: projects().find(p => p.id === id)?.plan?.revision, milestone: Number(input.dataset.projectMilestone), done: input.checked }); refreshCards(); }
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
