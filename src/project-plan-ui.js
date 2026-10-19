import { stacks } from './project-stacks';
export const planSections = [['brief', 'Project brief'], ['research', 'Similar apps & niche'], ['infrastructure', 'Infrastructure'], ['roadmap', 'Roadmap']];
export const milestoneLines = items => (items || []).map(m => `[${m.done ? 'x' : ' '}] ${m.text}${m.acceptance ? ' | ' + m.acceptance : ''}`).join('\n');
export const parseMilestones = value => value.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
  const [title, ...rest] = line.replace(/^\[(?:x| )\]\s*/i, '').split('|');
  return { text: title.trim(), acceptance: rest.join('|').trim(), done: /^\[x\]/i.test(line) };
});
export function projectPlanUI({ call, getState, escape: e, icon, toast, renderPage, openNew }) {
  let projectId, section, revision, opener, busy = false, dirty = false;
  const drafts = new Map();
  const dialog = document.createElement('dialog'); dialog.id = 'project-plan'; dialog.setAttribute('aria-labelledby', 'project-plan-title'); document.body.append(dialog);
  const project = () => getState().projects.find(p => p.id === projectId);
  const input = (key, label, value = '', rows = 3, hint = '') => `<label>${label}<textarea name="${key}" rows="${rows}" maxlength="10000">${e(value)}</textarea>${hint ? `<span class="field-hint">${hint}</span>` : ''}</label>`;
  const select = (key, label, values, value) => `<label>${label}<select name="${key}">${values.map(([id, name]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
  const dataFor = (p, s) => s === 'brief' ? { goals: p.goals, ...p.plan.brief } : s === 'roadmap' ? { scope: p.plan.scope, milestones: p.milestones } : p.plan[s];
  const savedText = p => Object.entries(dataFor(p, section)).map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}\n${Array.isArray(value) ? milestoneLines(value) : value || 'Not decided'}`).join('\n\n');
  function remember() { if (dirty && dialog.querySelector('form')) drafts.set(projectId + ':' + section, { revision, data: draft() }); }
  function saved(nextRevision) {
    drafts.delete(projectId + ':' + section); dirty = false;
    for (const [key, value] of drafts) if (key.startsWith(projectId + ':') && value.revision === revision) value.revision = nextRevision;
  }
  function fields(p, d) {
    if (section === 'brief') return `<h3>What are we making, and who is it for?</h3>${input('goals', 'Goals', d.goals)}${input('audience', 'Audience', d.audience, 2, 'Describe who will use it and the problem they need solved.')}${input('success', 'Success criteria', d.success, 2, 'What would show that this project achieved its goal?')}<details><summary>Initial milestones (${p.milestones.length})</summary>${p.milestones.map(m => `<p>${e(m.text)}</p>`).join('') || '<p>Add milestones in the first project form or the Roadmap step.</p>'}</details>`;
    if (section === 'research') return `<h3>What already exists?</h3>${select('purpose', 'Project use', [['public', 'For other people'], ['personal', 'Personal / internal']], d.purpose)}${input('alternatives', 'Similar apps or existing approaches', d.alternatives, 4, 'Names, source links and what each one does. Ask your agent to research with you.')}${input('niche', 'Our niche', d.niche, 3, 'Which need would this project serve better for your audience?')}${input('evidence', 'Evidence and open questions', d.evidence, 3, 'Record source URLs and research dates. For a personal project, explain why market research is unnecessary.')}<p class="field-hint">Marketing strategy comes after completion.</p>`;
    if (section === 'infrastructure') return `<h3>How will it run?</h3><div class="form-pair">${select('experience', 'Technical detail', [['guided', 'Explain the choices'], ['advanced', 'Let me choose the technology']], d.experience)}${select('platform', 'Target', [['web', 'Website / web app'], ['desktop', 'Desktop app'], ['android', 'Android app'], ['game', 'Game'], ['other', 'Other / non-software']], d.platform)}</div><label data-language-choice ${d.experience !== 'advanced' ? 'hidden' : ''}>Preferred language or tools<input name="language" maxlength="10000" value="${e(d.language)}"></label><div class="plan-stack-action"><button type="button" class="secondary" data-plan-suggest>Show a starting recommendation</button><span class="field-hint">Review it against your requirements.</span></div>${input('stack', 'Chosen language and tools', d.stack, 2)}${input('reason', 'Why this fits', d.reason, 3)}${input('alternative', 'Alternative considered', d.alternative, 2)}${input('tradeoff', 'Why choose this over the alternative?', d.tradeoff, 3)}${input('hosting', 'Where it runs and expected cost', d.hosting, 2, 'Your PC, a server, or a hosted service. Record limits and recurring costs.')}${input('data', 'Files, data and storage', d.data, 2)}${input('security', 'Access and security', d.security, 2, 'Who can use it? How will credentials and private data be handled?')}${input('operations', 'Testing, deployment, backups and recovery', d.operations, 3)}<p data-stack-source class="field-hint"></p>`;
    return `<h3>What belongs in the first release?</h3>${input('scope', 'Agreed scope', d.scope, 4)}${input('milestones', 'Ordered milestones', milestoneLines(d.milestones), 7, 'One per line: Milestone | Done when. Use [x] only for verified work.')}<p class="field-hint">Approving this roadmap activates the project. Changes to earlier decisions require review again.</p><details class="plan-later" open><summary>Later features (${p.plan.laterFeatures.length})</summary><ul>${p.plan.laterFeatures.map(f => `<li>${e(f.text)}</li>`).join('') || '<li>No later features.</li>'}</ul><label>Extra idea<input name="laterIdea" maxlength="1000"></label><button type="button" class="secondary" data-plan-later>Add to Later features</button></details>`;
  }
  function render() {
    const p = project(); if (!p?.plan) return;
    const cached = drafts.get(projectId + ':' + section);
    revision = cached?.revision ?? p.plan.revision; dirty = !!cached;
    const proposal = p.plan.proposal?.section === section ? p.plan.proposal : null;
    const d = cached?.data || proposal?.data || dataFor(p, section);
    dialog.innerHTML = `<div class="dialog-heading"><div><h2 id="project-plan-title">${e(p.name)}</h2><p class="plan-step-status">${p.plan.approvals[section] ? 'Approved' : proposal ? 'Proposal to review' : 'Planning'}</p></div><button type="button" class="icon-button" data-plan-close aria-label="Close roadmap">${icon('close')}</button></div><div class="plan-content"><nav class="plan-steps" aria-label="Planning steps">${planSections.map(([id, title], i) => `<button type="button" data-plan-step="${id}" ${id === section ? 'aria-current="step"' : ''}><span>${p.plan.approvals[id] ? '✓' : i + 1}</span>${title}</button>`).join('')}</nav><p class="plan-conflict" role="status" hidden>This plan changed while you were editing. <button type="button" class="subtle" data-plan-reload>Reload saved section</button> Copy any unsaved text first.</p>${proposal ? `<aside class="plan-proposal"><strong>${e(proposal.agent)} proposed these changes.</strong><p>Review or edit them before approval.</p><details><summary>Current saved section</summary><pre>${e(savedText(p))}</pre></details><button type="button" class="subtle" data-plan-reject>Reject proposal</button></aside>` : ''}${p.plan.files?.error ? `<p class="form-error">${e(p.plan.files.error)} <button type="button" class="subtle" data-plan-sync>Retry saving files</button></p>` : ''}<form id="project-plan-form">${fields(p, d)}<p class="form-error" role="alert"></p><p class="field-hint">Discussion uses your default console. Codex and Claude start with a planning question; other agents receive the project instructions.</p><div class="plan-footer"><button type="button" class="secondary" data-plan-discuss>${icon('terminal')}Discuss with agent</button><button type="submit" class="secondary" value="save">Save draft</button><button type="submit" class="primary" value="approve">${section === 'roadmap' ? 'Approve roadmap' : 'Approve & continue'}</button></div></form><button type="button" class="subtle plan-files" data-plan-files>${icon('folder')}Open project files</button></div>`;
  }
  async function open(id, trigger = document.activeElement) {
    let p = getState().projects.find(p => p.id === id); if (!p) return;
    if (!p.plan) p = await call('projects.plan.begin', { id });
    projectId = id; opener = trigger; section = p.plan.proposal?.section || planSections.find(([s]) => !p.plan.approvals[s])?.[0] || 'roadmap';
    render(); refresh(); dialog.showModal(); dialog.querySelector(`[data-plan-step="${section}"]`).focus();
  }
  function refresh() {
    if (!dialog.open || !project()?.plan) return;
    if (project().plan.revision !== revision) dialog.querySelector('.plan-conflict').hidden = false;
  }
  function draft() {
    const values = Object.fromEntries(new FormData(dialog.querySelector('form'))); delete values.laterIdea;
    if (section === 'roadmap') values.milestones = parseMilestones(values.milestones);
    return values;
  }
  dialog.addEventListener('close', () => { remember(); const target = opener?.isConnected && opener.tagName === 'BUTTON' ? opener : document.querySelector(`[data-project-plan="${CSS.escape(projectId)}"]`); target?.focus(); });
  dialog.addEventListener('input', () => { dirty = true; });
  dialog.addEventListener('change', event => {
    dirty = true;
    if (event.target.name === 'experience') dialog.querySelector('[data-language-choice]').hidden = event.target.value !== 'advanced';
  });
  dialog.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; busy = true;
    const action = event.submitter?.value || 'save'; const buttons = [...dialog.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
    try {
      const updated = await call('projects.plan.review', { id: projectId, revision, section, changes: draft(), action }); saved(updated.plan.revision);
      if (action === 'approve' && section !== 'roadmap') section = planSections[planSections.findIndex(([s]) => s === section) + 1][0];
      render(); renderPage(); toast(action === 'approve' ? section === 'roadmap' && project().status === 'active' ? 'Roadmap approved. Project active.' : 'Section approved.' : 'Draft saved.');
      dialog.querySelector('h3')?.setAttribute('tabindex', '-1'); dialog.querySelector('h3')?.focus();
    } catch (error) { dialog.querySelector('form .form-error').textContent = error.message; }
    finally { busy = false; buttons.forEach(b => b.disabled = false); }
  });
  dialog.addEventListener('click', async event => {
    const b = event.target.closest('button'); if (!b || busy) return;
    try {
      if (b.hasAttribute('data-plan-close')) dialog.close();
      if (b.dataset.planStep) { remember(); section = b.dataset.planStep; render(); refresh(); }
      if (b.hasAttribute('data-plan-reload')) { drafts.delete(projectId + ':' + section); dirty = false; render(); }
      if (b.hasAttribute('data-plan-reject')) { await call('projects.plan.review', { id: projectId, revision, section, action: 'reject' }); drafts.delete(projectId + ':' + section); dirty = false; render(); }
      if (b.hasAttribute('data-plan-sync')) { remember(); await call('projects.plan.sync', { id: projectId }); render(); refresh(); }
      if (b.hasAttribute('data-plan-files')) await call('projects.folder', { id: projectId, planFiles: true });
      if (b.hasAttribute('data-plan-later')) {
        // Preserve the unsaved roadmap fields while adding an unrelated idea.
        const data = draft(); const updated = await call('projects.plan.later', { id: projectId, revision, text: dialog.querySelector('[name=laterIdea]').value }); saved(updated.plan.revision); render();
        for (const [key, value] of Object.entries(data)) dialog.querySelector('form').elements[key].value = key === 'milestones' ? milestoneLines(value) : value;
        dirty = true;
      }
      if (b.hasAttribute('data-plan-discuss')) { const updated = await call('projects.plan.review', { id: projectId, revision, section, changes: draft(), action: 'save' }); saved(updated.plan.revision); revision = updated.plan.revision; await openNew(undefined, { projectId, planDiscussion: section }); dialog.close(); }
      if (b.hasAttribute('data-plan-suggest')) {
        const form = dialog.querySelector('form'), suggested = stacks[form.elements.platform.value];
        if (!suggested) { toast('Ask your agent to compare tools for this project.'); return; }
        // Never overwrite a user's existing architecture choice.
        if (['stack', 'reason', 'alternative', 'tradeoff'].some(key => form.elements[key].value.trim())) { toast('Clear those four choice fields before loading a starting recommendation.'); return; }
        for (const key of ['stack', 'reason', 'alternative', 'tradeoff']) form.elements[key].value = suggested[key];
        dirty = true;
        dialog.querySelector('[data-stack-source]').textContent = 'Reference: ' + suggested.source;
      }
    } catch (error) { const box = dialog.querySelector('form .form-error'); if (box) box.textContent = error.message; else toast(error.message, true); }
  });
  return { open, refresh };
}
