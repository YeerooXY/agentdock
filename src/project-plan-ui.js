import { stacks } from './project-stacks';
export const planSections = [
  ['brief', 'Brief', 'What are we making, and who is it for?'],
  ['research', 'Research', 'What already exists, and where this project fits.'],
  ['infrastructure', 'Setup', 'How it will run, where, and how it stays safe.'],
  ['roadmap', 'Roadmap', 'What the first release includes, and how we know each step is done.'],
];
export const milestoneLines = items => (items || []).map(m => `[${m.done ? 'x' : ' '}] ${m.text}${m.acceptance ? ' | ' + m.acceptance : ''}`).join('\n');
export const parseMilestones = value => value.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
  const [title, ...rest] = line.replace(/^\[(?:x| )\]\s*/i, '').split('|');
  return { text: title.trim(), acceptance: rest.join('|').trim(), done: /^\[x\]/i.test(line) };
});
// Plans saved before per-section proposals kept a single proposal field.
export const proposalsOf = plan => plan?.proposals || (plan?.proposal ? { [plan.proposal.section]: plan.proposal } : {});
export const waitingProposal = plan => Object.values(proposalsOf(plan))[0] || null;

// [key, label, hint, required]. Fewer, clearer fields; older Setup answers stay visible under "More detail".
const FIELDS = {
  brief: [['goals', 'Goal', 'What are you making?', true], ['audience', 'Who it is for', 'Who will use it, and what problem it solves for them.'], ['success', 'Success', 'What would show that it worked?']],
  research: [['alternatives', 'Similar apps', 'Names, links and what each one does.'], ['niche', 'Our angle', 'What this project does better for its audience.'], ['evidence', 'Sources and open questions', 'Source links with dates, and what still needs checking.']],
  infrastructure: [['stack', 'Tools and why', 'Language, framework and why they fit.', true], ['hosting', 'Where it runs and cost', 'Your PC, a server or a hosted service, with recurring costs.'], ['data', 'Data and security', 'Files, storage, accounts and how credentials stay private.'], ['operations', 'Testing and backups', 'How it is tested, released and recovered.']],
  roadmap: [['scope', 'Included', 'What the first release delivers.', true], ['excluded', 'Not included', 'What is deliberately left out of this release.']],
};
const EXTRA = { infrastructure: [['reason', 'Why this fits'], ['alternative', 'Alternative considered'], ['tradeoff', 'Trade-off'], ['security', 'Access and security'], ['language', 'Preferred language']] };
const LABELS = Object.fromEntries([...Object.values(FIELDS).flat(), ...Object.values(EXTRA).flat()].map(([key, label]) => [key, label]).concat([['milestones', 'Milestones']]));

export function projectPlanUI({ call, getState, escape: e, icon, toast, renderPage, openNew, preview }) {
  let projectId, section, revision, opener, busy = false, editing = false, dirty = false, focusKey = null, shownRevision = null;
  const drafts = new Map(), thumbs = new Map();
  const dialog = document.createElement('dialog'); dialog.id = 'project-plan'; dialog.className = 'plan-sheet'; dialog.setAttribute('aria-labelledby', 'project-plan-title'); document.body.append(dialog);
  const project = () => getState().projects.find(p => p.id === projectId);
  const dataFor = (p, s) => s === 'brief' ? { goals: p.goals, ...p.plan.brief } : s === 'roadmap' ? { scope: p.plan.scope, excluded: p.plan.excluded || '', milestones: p.milestones } : p.plan[s];
  const key = () => projectId + ':' + section;
  const statusOf = (p, s) => proposalsOf(p.plan)[s] ? ['wait', 'Proposal'] : p.plan.approvals[s] ? ['ok', 'Approved'] : p.plan.skipped?.[s] ? ['skip', 'Not needed'] : drafts.has(projectId + ':' + s) ? ['draft', 'Unsaved draft'] : filled(dataFor(p, s), s) ? ['draft', 'Draft'] : ['', 'Not started'];
  const filled = (d, s) => FIELDS[s].some(([k]) => String(d[k] || '').trim()) || (s === 'roadmap' && d.milestones.length > 0);
  const text = value => `<p class="plan-text">${e(value)}</p>`;
  const grow = area => { area.style.height = 'auto'; area.style.height = Math.max(area.scrollHeight + 2, parseFloat(getComputedStyle(area).minHeight) || 60) + 'px'; };

  function side(p) {
    const refs = p.plan.references || [], shot = getState().screenshot;
    const ref = r => r.kind === 'image'
      ? `<div class="plan-ref image"><button type="button" data-plan-ref="${e(r.id)}" title="${e(r.value)}"><img alt="" data-plan-thumb="${e(r.id)}" ${thumbs.get(r.id) ? `src="${thumbs.get(r.id)}"` : ''}><span>${e(r.title)}</span></button><button type="button" class="plan-ref-remove" data-plan-ref-remove="${e(r.id)}" aria-label="Remove ${e(r.title)}">${icon('close')}</button></div>`
      : `<div class="plan-ref row"><button type="button" data-plan-ref="${e(r.id)}" title="${e(r.value)}">${icon(r.kind === 'link' ? 'arrow' : 'folder')}<span>${e(r.title)}</span></button><button type="button" class="plan-ref-remove" data-plan-ref-remove="${e(r.id)}" aria-label="Remove ${e(r.title)}">${icon('close')}</button></div>`;
    return `<aside class="plan-side">
      <div class="plan-project"><span class="plan-dot" style="background:${e(p.color || '#89b4ff')}"></span><div><h2 id="project-plan-title">${e(p.name)}</h2><small>${e(p.status === 'planning' ? 'Planning' : p.status[0].toUpperCase() + p.status.slice(1))} · revision ${p.plan.revision}</small></div><button type="button" class="icon-button" data-plan-close aria-label="Close plan">${icon('close')}</button></div>
      <p class="plan-label" id="plan-steps-label">Plan</p>
      <nav class="plan-steps" aria-labelledby="plan-steps-label">${planSections.map(([id, title], i) => { const [tone, label] = statusOf(p, id); return `<button type="button" data-plan-step="${id}" ${id === section ? 'aria-current="step"' : ''}><span class="plan-num ${tone}">${tone === 'ok' ? '✓' : i + 1}</span><b>${title}</b><span class="plan-badge ${tone}">${label}</span></button>`; }).join('')}</nav>
      <p class="plan-label" id="plan-refs-label">References <span>· agents can read these</span></p>
      <div class="plan-board" data-plan-drop aria-labelledby="plan-refs-label">${refs.map(ref).join('')}
        <div class="plan-ref-add"><button type="button" class="secondary" data-plan-ref-file>${icon('plus')}Add files</button>${shot ? `<button type="button" class="secondary" data-plan-ref-shot>${icon('plus')}Latest screenshot</button>` : ''}</div>
        <form class="plan-link-form" data-plan-link-form><label class="sr-only" for="plan-link">Web link</label><input id="plan-link" name="link" type="url" placeholder="https://… link" maxlength="2048"><button type="submit" class="secondary">Add link</button></form>
        <p class="plan-drop-hint">Or drop screenshots and files here.</p>
      </div>
      <button type="button" class="subtle plan-files" data-plan-files>${icon('folder')}Open project files</button>
    </aside>`;
  }
  function notes(p) {
    if (section !== 'roadmap') return '';
    const items = planSections.slice(0, 3).map(([id, title]) => p.plan.approvals[id] ? '' : p.plan.skipped?.[id] ? `${title}: not needed` : `${title}: not reviewed (optional)`).filter(Boolean);
    return `<div class="plan-notes">${items.map(x => `<span>${e(x)}</span>`).join('')}<span>${p.plan.approvals.roadmap ? 'Roadmap approved · project active' : 'Approving the roadmap starts the project'}</span></div>`;
  }
  function diff(p, proposal) {
    const before = dataFor(p, section), rows = [];
    for (const [k, after] of Object.entries(proposal.data)) {
      if (k === 'milestones') {
        const old = new Map(before.milestones.map(m => [m.text, m])), now = new Map(after.map(m => [m.text, m]));
        const added = after.filter(m => !old.has(m.text)), removed = before.milestones.filter(m => !now.has(m.text)), changed = after.filter(m => old.has(m.text) && old.get(m.text).acceptance !== m.acceptance);
        if (added.length || removed.length || changed.length) rows.push(`<div class="plan-diff-row"><b>Milestones</b><div class="plan-diff"><div class="was"><small>Removed</small>${removed.map(m => `<p>${e(m.text)}</p>`).join('') || '<p>None</p>'}</div><div class="now"><small>Added or changed</small>${[...added, ...changed].map(m => `<p>${e(m.text)}${changed.includes(m) ? ' <em>(new done-when)</em>' : ''}</p>`).join('') || '<p>None</p>'}</div></div></div>`);
      } else if (String(before[k] ?? '') !== String(after ?? '')) rows.push(`<div class="plan-diff-row"><b>${e(LABELS[k] || k)}</b><div class="plan-diff"><div class="was"><small>Before</small><p>${e(before[k] || 'Empty')}</p></div><div class="now"><small>After</small><p>${e(after || 'Empty')}</p></div></div></div>`);
    }
    return `<section class="plan-card plan-proposal"><div class="plan-card-head"><h4>${e(proposal.agent)} proposed ${rows.length || 'no'} change${rows.length === 1 ? '' : 's'}</h4><div class="plan-actions"><button type="button" class="secondary" data-plan-reject>Reject</button><button type="button" class="secondary" data-plan-proposal-edit>Edit</button><button type="button" class="primary" data-plan-accept>Accept</button></div></div>${rows.join('') || '<p class="plan-text">The proposal matches the saved section.</p>'}</section>`;
  }
  function readBody(p, d) {
    const field = ([k, label, hint, required]) => `<section class="plan-card"><h4>${label}${required ? '' : ' <small>optional</small>'}</h4>${String(d[k] || '').trim() ? text(d[k]) : `<button type="button" class="plan-add" data-plan-add="${k}">+ Add ${label.toLowerCase()}<span>${hint}</span></button>`}</section>`;
    if (section === 'roadmap') {
      const done = d.milestones.filter(m => m.done).length;
      return `<section class="plan-card"><h4>Scope</h4><div class="plan-scope">${FIELDS.roadmap.map(([k, label, hint]) => `<div><b>${label}</b>${String(d[k] || '').trim() ? text(d[k]) : `<button type="button" class="plan-add" data-plan-add="${k}">+ Add<span>${hint}</span></button>`}</div>`).join('')}</div></section>
        <section class="plan-card"><div class="plan-card-head"><h4>Milestones</h4><span class="plan-badge">${done} of ${d.milestones.length} verified</span></div><ol class="plan-milestones">${d.milestones.map(m => `<li class="${m.done ? 'done' : ''}"><span class="plan-tick" aria-hidden="true">${m.done ? '✓' : ''}</span><div><b>${e(m.text)}</b>${m.acceptance ? `<p>Done when: ${e(m.acceptance)}</p>` : '<p class="plan-missing">Done-when check missing</p>'}</div><span class="plan-badge ${m.done ? 'ok' : ''}">${m.done ? 'Verified' : 'Open'}</span></li>`).join('')}</ol><button type="button" class="plan-add" data-plan-add="milestones">+ Add milestone</button></section>
        <section class="plan-card"><div class="plan-card-head"><h4>Later features</h4><span class="plan-badge">${p.plan.laterFeatures.length}</span></div><ul class="plan-later">${p.plan.laterFeatures.map(f => `<li>${e(f.text)}</li>`).join('')}</ul><form class="plan-later-form" data-plan-later-form><label class="sr-only" for="plan-later">Extra idea</label><input id="plan-later" name="laterIdea" maxlength="1000" placeholder="An idea for later, outside this release"><button type="submit" class="secondary">Add idea</button></form></section>`;
    }
    const extra = (EXTRA[section] || []).filter(([k]) => String(d[k] || '').trim());
    return FIELDS[section].map(field).join('') + (extra.length ? `<details class="plan-card plan-more"><summary>More detail (${extra.length})</summary>${extra.map(([k, label]) => `<h4>${label}</h4>${text(d[k])}`).join('')}</details>` : '');
  }
  function editBody(d) {
    const area = ([k, label, hint, required]) => `<label class="plan-field">${label}${required ? '' : ' <small>optional</small>'}<textarea name="${k}" maxlength="10000" placeholder="${e(hint)}">${e(d[k] || '')}</textarea></label>`;
    const extra = (EXTRA[section] || []).filter(([k]) => String(d[k] || '').trim());
    let html = FIELDS[section].map(area).join('');
    if (section === 'infrastructure') html = `<div class="plan-stack-action"><label class="plan-field">Target<select name="platform">${[['web', 'Website / web app'], ['desktop', 'Desktop app'], ['android', 'Android app'], ['game', 'Game'], ['other', 'Other / non-software']].map(([v, l]) => `<option value="${v}" ${v === d.platform ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button type="button" class="secondary" data-plan-suggest>Suggest tools</button></div>` + html + extra.map(([k, label]) => area([k, label, ''])).join('') + '<p data-stack-source class="field-hint"></p>';
    if (section === 'roadmap') html = `<div class="plan-scope">${html}</div><fieldset class="plan-milestone-editor"><legend>Milestones</legend><ol data-plan-milestones>${d.milestones.map(row).join('')}</ol><button type="button" class="secondary" data-plan-milestone-add>${icon('plus')}Add milestone</button></fieldset>`;
    return `<form id="project-plan-form" class="plan-form">${html}<p class="form-error" role="alert"></p><div class="plan-form-footer"><button type="button" class="subtle" data-plan-cancel>Cancel</button><button type="submit" class="secondary" value="save">Save draft</button><button type="submit" class="primary" value="approve">${section === 'roadmap' ? 'Approve roadmap' : 'Approve'}</button></div></form>`;
  }
  const row = m => `<li class="plan-milestone-row" data-done="${m.done ? 'true' : 'false'}"><div class="plan-milestone-fields"><label>Milestone<input name="milestoneText" maxlength="500" value="${e(m.text)}" placeholder="What gets delivered"></label><label>Done when<textarea name="milestoneDone" maxlength="1000" placeholder="How you check it is finished">${e(m.acceptance || '')}</textarea></label></div><div class="plan-milestone-tools"><button type="button" class="icon-button" data-plan-move="-1" aria-label="Move up">↑</button><button type="button" class="icon-button" data-plan-move="1" aria-label="Move down">↓</button><button type="button" class="icon-button" data-plan-remove aria-label="Remove milestone">${icon('close')}</button></div></li>`;

  function render() {
    const p = project(); if (!p?.plan) return;
    const cached = drafts.get(key()), proposal = proposalsOf(p.plan)[section];
    revision = cached?.revision ?? p.plan.revision; shownRevision = p.plan.revision; dirty = !!cached;
    if (cached) editing = true;
    const d = cached?.data || dataFor(p, section), [tone, label] = statusOf(p, section), meta = planSections.find(([id]) => id === section);
    const skippable = section !== 'roadmap';
    dialog.innerHTML = `<div class="plan-shell">${side(p)}<main class="plan-main">
      <div class="plan-head"><div><p class="plan-badge ${tone}">${label}</p><h3 tabindex="-1">${meta[1]}</h3><p>${meta[2]}</p></div>
        <div class="plan-actions"><button type="button" class="secondary" data-plan-discuss>${icon('terminal')}Discuss with agent</button>${editing ? '' : `<button type="button" class="secondary" data-plan-edit>Edit</button>${skippable ? `<button type="button" class="subtle" data-plan-skip>${p.plan.skipped?.[section] ? 'Mark as needed' : 'Not needed'}</button>` : ''}<button type="button" class="primary" data-plan-approve ${p.plan.approvals[section] ? 'disabled' : ''}>${p.plan.approvals[section] ? 'Approved' : section === 'roadmap' ? 'Approve roadmap' : 'Approve'}</button>`}</div></div>
      <p class="plan-conflict" role="status" hidden>This plan changed while you were editing. <button type="button" class="subtle" data-plan-reload>Load the saved version</button> Copy any unsaved text first.</p>
      ${notes(p)}
      ${p.plan.files?.error ? `<p class="form-error">${e(p.plan.files.error)} <button type="button" class="subtle" data-plan-sync>Retry saving files</button></p>` : ''}
      ${proposal && !editing ? diff(p, proposal) : ''}
      ${p.plan.skipped?.[section] && !editing ? '<p class="plan-skipped">Marked not needed. Agents skip this section. You can still fill it in.</p>' : ''}
      <div class="plan-body">${editing ? editBody(d) : readBody(p, d)}</div>
      <p class="form-error plan-error" role="alert"></p>
    </main></div>`;
    for (const area of dialog.querySelectorAll('textarea')) grow(area);
    if (editing && focusKey) { const target = dialog.querySelector(`[name="${focusKey}"]`) || dialog.querySelector('[name=milestoneText]:last-of-type'); target?.focus(); focusKey = null; }
    loadThumbs(p);
  }
  async function loadThumbs(p) {
    for (const img of dialog.querySelectorAll('img[data-plan-thumb]:not([src])')) {
      const id = img.dataset.planThumb;
      try { const data = thumbs.get(id) ?? await call('projects.plan.thumb', { id: p.id, ref: id }); thumbs.set(id, data); if (data) img.src = data; } catch {}
    }
  }
  function draft() {
    const form = dialog.querySelector('#project-plan-form'); if (!form) return {};
    const values = {};
    for (const [k] of [...FIELDS[section], ...(EXTRA[section] || [])]) if (form.elements[k]) values[k] = form.elements[k].value;
    if (section === 'infrastructure' && form.elements.platform) values.platform = form.elements.platform.value;
    if (section === 'roadmap') values.milestones = [...form.querySelectorAll('.plan-milestone-row')].map(li => ({ text: li.querySelector('[name=milestoneText]').value.trim(), acceptance: li.querySelector('[name=milestoneDone]').value.trim(), done: li.dataset.done === 'true' })).filter(m => m.text);
    return values;
  }
  function remember() { if (editing && dirty && dialog.querySelector('#project-plan-form')) drafts.set(key(), { revision, data: { ...dataFor(project(), section), ...draft() } }); }
  function saved(nextRevision) {
    drafts.delete(key()); dirty = false; editing = false;
    for (const [k, value] of drafts) if (k.startsWith(projectId + ':') && value.revision === revision) value.revision = nextRevision;
  }
  const error = message => { const box = dialog.querySelector('#project-plan-form .form-error') || dialog.querySelector('.plan-error'); if (box) box.textContent = message; else toast(message, true); };
  async function review(action, changes = {}) {
    const updated = await call('projects.plan.review', { id: projectId, revision, section, changes, action });
    saved(updated.plan.revision); render(); renderPage();
    return updated;
  }
  async function open(id, trigger = document.activeElement) {
    let p = getState().projects.find(p => p.id === id); if (!p) return;
    if (!p.plan) p = await call('projects.plan.begin', { id });
    projectId = id; opener = trigger; editing = false;
    section = Object.keys(proposalsOf(p.plan))[0] || planSections.find(([s]) => !p.plan.approvals[s] && !p.plan.skipped?.[s])?.[0] || 'roadmap';
    render(); dialog.showModal(); dialog.querySelector(`[data-plan-step="${section}"]`).focus();
  }
  function refresh() {
    if (!dialog.open || !project()?.plan || project().plan.revision === shownRevision) return;
    if (editing && dirty) { dialog.querySelector('.plan-conflict').hidden = false; return; }
    const focused = document.activeElement?.closest('[data-plan-step]')?.dataset.planStep;
    if (!editing) { render(); if (focused) dialog.querySelector(`[data-plan-step="${focused}"]`)?.focus(); }
  }
  async function addReference(raw) {
    const p = project();
    try { await call('projects.plan.reference.add', { id: projectId, revision: p.plan.revision, ...raw }); if (!editing) render(); else shownRevision = project().plan.revision; }
    catch (err) { toast(err.message, true); }
  }
  dialog.addEventListener('close', () => { remember(); editing = false; const target = opener?.isConnected && opener.tagName === 'BUTTON' ? opener : document.querySelector(`[data-project-plan="${CSS.escape(projectId)}"]`); target?.focus(); });
  dialog.addEventListener('input', event => { if (event.target.closest('#project-plan-form')) dirty = true; if (event.target.tagName === 'TEXTAREA') grow(event.target); });
  dialog.addEventListener('change', event => { if (event.target.closest('#project-plan-form')) dirty = true; });
  dialog.addEventListener('dragover', event => { if (event.target.closest('[data-plan-drop]')) { event.preventDefault(); event.target.closest('[data-plan-drop]').classList.add('dragging'); } });
  dialog.addEventListener('dragleave', event => event.target.closest?.('[data-plan-drop]')?.classList.remove('dragging'));
  dialog.addEventListener('drop', async event => {
    const board = event.target.closest('[data-plan-drop]'); if (!board) return;
    event.preventDefault(); board.classList.remove('dragging');
    const files = [...event.dataTransfer.files].map(f => window.dock.pathForFile?.(f)).filter(Boolean);
    for (const value of files.slice(0, 20)) await addReference({ kind: 'file', value });
    const link = !files.length && (event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain')).split('\n')[0].trim();
    if (link && /^https?:\/\//i.test(link)) await addReference({ kind: 'link', value: link });
  });
  dialog.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const form = event.target;
    if (form.matches('[data-plan-link-form]')) { const value = form.elements.link.value.trim(); if (value) { await addReference({ kind: 'link', value }); } return; }
    busy = true; const buttons = [...dialog.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
    try {
      if (form.matches('[data-plan-later-form]')) {
        const value = form.elements.laterIdea.value.trim(); if (!value) return;
        const updated = await call('projects.plan.later', { id: projectId, revision, text: value }); revision = updated.plan.revision; render(); dialog.querySelector('#plan-later')?.focus(); toast('Added to Later features.'); return;
      }
      const action = event.submitter?.value || 'save';
      await review(action, draft());
      toast(action === 'approve' ? section === 'roadmap' && project().status === 'active' ? 'Roadmap approved. Project active.' : 'Section approved.' : 'Draft saved.');
      dialog.querySelector('.plan-head h3')?.focus();
    } catch (err) { error(err.message); }
    finally { busy = false; dialog.querySelectorAll('button').forEach(b => { if (buttons.includes(b)) b.disabled = false; }); }
  });
  dialog.addEventListener('click', async event => {
    const b = event.target.closest('button'); if (!b || busy || b.type === 'submit') return;
    const p = project();
    try {
      if (b.hasAttribute('data-plan-close')) dialog.close();
      else if (b.dataset.planStep) { remember(); editing = false; section = b.dataset.planStep; render(); dialog.querySelector(`[data-plan-step="${section}"]`).focus(); }
      else if (b.hasAttribute('data-plan-edit') || b.dataset.planAdd) { editing = true; focusKey = b.dataset.planAdd === 'milestones' ? null : b.dataset.planAdd || FIELDS[section][0][0]; render(); if (b.dataset.planAdd === 'milestones') dialog.querySelector('[data-plan-milestone-add]').click(); }
      else if (b.hasAttribute('data-plan-cancel')) { drafts.delete(key()); dirty = false; editing = false; render(); dialog.querySelector('.plan-head h3').focus(); }
      else if (b.hasAttribute('data-plan-approve')) { await review('approve'); toast(section === 'roadmap' && project().status === 'active' ? 'Roadmap approved. Project active.' : 'Section approved.'); }
      else if (b.hasAttribute('data-plan-skip')) { await review(p.plan.skipped?.[section] ? 'unskip' : 'skip'); }
      else if (b.hasAttribute('data-plan-reload')) { drafts.delete(key()); dirty = false; editing = false; render(); }
      else if (b.hasAttribute('data-plan-reject')) { await review('reject'); toast('Proposal rejected.'); }
      else if (b.hasAttribute('data-plan-accept')) { await review('save', proposalsOf(p.plan)[section].data); toast('Proposal accepted. Approve the section when ready.'); }
      else if (b.hasAttribute('data-plan-proposal-edit')) { drafts.set(key(), { revision: p.plan.revision, data: { ...dataFor(p, section), ...proposalsOf(p.plan)[section].data } }); render(); }
      else if (b.hasAttribute('data-plan-sync')) { remember(); await call('projects.plan.sync', { id: projectId }); render(); }
      else if (b.hasAttribute('data-plan-files')) await call('projects.folder', { id: projectId, planFiles: true });
      else if (b.hasAttribute('data-plan-ref-file')) { for (const value of await call('projects.plan.pick')) await addReference({ kind: 'file', value }); }
      else if (b.hasAttribute('data-plan-ref-shot')) await addReference({ kind: 'screenshot' });
      else if (b.dataset.planRefRemove) { await call('projects.plan.reference.remove', { id: projectId, revision: p.plan.revision, ref: b.dataset.planRefRemove }); if (!editing) render(); dialog.querySelector('[data-plan-ref-file]')?.focus(); }
      else if (b.dataset.planRef) { const r = p.plan.references.find(x => x.id === b.dataset.planRef); if (r?.kind === 'link') await call('open.link', r.value); else if (r) preview?.(r.value); }
      else if (b.hasAttribute('data-plan-milestone-add')) { const list = dialog.querySelector('[data-plan-milestones]'); list.insertAdjacentHTML('beforeend', row({ text: '', acceptance: '', done: false })); dirty = true; list.lastElementChild.querySelector('input').focus(); }
      else if (b.dataset.planMove) { const li = b.closest('li'), to = b.dataset.planMove === '1' ? li.nextElementSibling : li.previousElementSibling; if (to) { b.dataset.planMove === '1' ? to.after(li) : to.before(li); dirty = true; b.focus(); } }
      else if (b.hasAttribute('data-plan-remove')) { const li = b.closest('li'), next = li.nextElementSibling || li.previousElementSibling; li.remove(); dirty = true; (next?.querySelector('input') || dialog.querySelector('[data-plan-milestone-add]')).focus(); }
      else if (b.hasAttribute('data-plan-discuss')) {
        if (editing && dirty) { const updated = await call('projects.plan.review', { id: projectId, revision, section, changes: draft(), action: 'save' }); saved(updated.plan.revision); }
        await openNew(undefined, { projectId, planDiscussion: section }); dialog.close();
      }
      else if (b.hasAttribute('data-plan-suggest')) {
        const form = dialog.querySelector('#project-plan-form'), suggested = stacks[form.elements.platform.value];
        if (!suggested) { toast('Ask your agent to compare tools for this project.'); return; }
        // Never overwrite a user's existing choice.
        if (form.elements.stack.value.trim()) { toast('Clear "Tools and why" before loading a suggestion.'); return; }
        form.elements.stack.value = `${suggested.stack}\n\n${suggested.reason}`; grow(form.elements.stack); dirty = true;
        dialog.querySelector('[data-stack-source]').textContent = 'Starting point, not a decision. Reference: ' + suggested.source;
      }
    } catch (err) { error(err.message); }
  });
  return { open, refresh };
}
