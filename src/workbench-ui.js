import './workbench.css';

export function workbenchUI({ call, getState, getPage, renderPage, escape: e, toast, selectSession, navigate }) {
  const api = (method, value) => call('workbench.' + method, value);
  const selected = new Set(), previews = new Map();
  let resultPage = 0;
  let filter = '', kind = '', project = '', reviewDraft = { url: '', brief: '' }, detail = null, stamp = '', modalVersion = 0;
  const data = () => getState()?.workbench || { results: [], inbox: [], reviews: [], concepts: [] };
  const date = at => new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const button = (action, label, id = '', cls = 'subtle', disabled = false) => `<button ${disabled ? 'disabled' : ''} class="${cls}" data-wb="${action}" data-id="${e(id)}">${label}</button>`;
  const filtered = () => data().results.filter(x => (!kind || x.kind === kind) && (!project || x.project === project) && (!filter || (x.title + ' ' + x.summary).toLowerCase().includes(filter.toLowerCase())));
  const shell = (title, text, content) => `<div class="page-heading"><div><h1>${title}</h1><p>${text}</p></div></div>${content}`;
  const empty = text => `<div class="wb-empty">${text}</div>`;
  const visible = () => filtered().slice(resultPage * 40, (resultPage + 1) * 40);
  const pagination = () => button('previous-results','Previous','','subtle',resultPage === 0) + `<span class="result-page-number">${resultPage + 1} / ${Math.max(1, Math.ceil(filtered().length / 40))}</span>` + button('next-results','Next','','subtle',(resultPage + 1) * 40 >= filtered().length);
  const card = x => `<article class="result-card"><button class="result-image" data-wb="preview" data-id="${x.id}" aria-label="Open ${e(x.title)}">${x.image ? `<img data-result-image="${x.id}" alt="${e(x.title)}">` : `<span class="result-file">${e(x.ext.slice(1).toUpperCase())}</span>`}</button><div class="result-copy"><div class="result-meta"><span>${e(x.kind)}</span><label class="result-select"><input type="checkbox" data-result-select="${x.id}" aria-label="Select ${e(x.title)}" ${selected.has(x.id) ? 'checked' : ''}></label></div><button class="result-title" data-wb="preview" data-id="${x.id}">${e(x.title)}</button><p>${e(x.summary || (x.project.split(/[\\/]/).filter(Boolean).pop() || 'No project'))}</p><div class="result-meta"><time>${date(x.at)}</time><span>${e(x.status.replaceAll('-', ' '))}</span></div></div></article>`;
  const resultsList = () => visible().map(card).join('') || empty('Screenshots, test reports and concepts will appear here.');
  function gallery() {
    const projects = [...new Set(data().results.map(x => x.project).filter(Boolean))];
    return shell('Results', 'Screenshots, tests and ideas. Saved together.', `<div class="wb-toolbar"><input id="result-search" type="search" aria-label="Search results" placeholder="Search results" value="${e(filter)}"><select id="result-kind" aria-label="Result type"><option value="">All types</option>${['screenshot','test','report','review','concept','asset'].map(x => `<option value="${x}" ${x === kind ? 'selected' : ''}>${x}</option>`).join('')}</select><select id="result-project" aria-label="Project"><option value="">All projects</option>${projects.map(x => `<option value="${e(x)}" ${x === project ? 'selected' : ''}>${e(x.split(/[\\/]/).pop() || x)}</option>`).join('')}</select>${button('import','Add files','','secondary')}</div><div class="wb-toolbar small">${button('select-all','Select visible')}${button('delete-selected',`Delete selected (${selected.size})`,'','subtle danger')}<span>Deletes saved copies. Originals stay in your project.</span></div><div class="results-grid">${resultsList()}</div><div class="wb-toolbar result-pagination">${pagination()}</div>`);
  }
  function inbox() {
    return shell('Inbox', 'Ready for you.', `<div class="wb-toolbar">${button('clear-read','Clear read')}</div><div class="inbox-list">${data().inbox.map(x => `<article class="inbox-item ${x.read ? 'read' : ''}"><span class="inbox-dot ${e(x.kind)}"></span><div><h2>${e(x.title)}</h2>${x.message ? `<p>${e(x.message)}</p>` : ''}<time>${date(x.at)}</time></div><div class="inbox-actions">${x.destination || x.reviewId || x.resultId || getState().sessions.some(s => s.id === x.sessionId) ? button('inbox-open','Open',x.id) : ''}${!x.read ? button('read','Mark read',x.id) : ''}${button('dismiss','Dismiss',x.id)}</div></article>`).join('') || empty('You’re caught up. Finished jobs, questions and errors land here.')}</div>`);
  }
  function reviews() {
    return shell('Website review', 'Check the page. Keep the evidence. Explore a new direction.', `<form id="website-review-form" class="surface wb-review-form"><label>Page URL<input name="url" type="url" placeholder="https://example.com or http://localhost:3000" value="${e(reviewDraft.url)}" required></label><label>What should improve?<textarea name="brief" rows="2" maxlength="2500" placeholder="The page’s goal, audience or design direction">${e(reviewDraft.brief)}</textarea></label><div class="wb-toolbar"><button class="primary" type="submit" ${data().reviews.some(x => x.state === 'running') ? 'disabled' : ''}>Review page</button><p class="field-hint">Desktop + mobile. Automated checks and a manual checklist.</p></div><p class="form-error" role="alert"></p></form><div id="review-list">${reviewList()}</div>`);
  }
  function reviewList() {
    return data().reviews.map(x => `<article class="review-row"><div><h2>${e(x.url)}</h2><p>${e(x.state === 'complete' ? `${x.issues} automated findings · manual review needed` : x.stage || x.error || x.state)}</p><time>${date(x.at)}</time></div>${button('review-open',x.state === 'running' ? 'View progress' : 'Open review',x.id)}${x.state !== 'running' ? button('review-delete','Delete',x.id,'subtle danger') : ''}</article>`).join('') || empty('Start with a page URL. Nothing is submitted to forms or published.');
  }
  const dialog = document.createElement('dialog'); dialog.className = 'wb-dialog'; dialog.setAttribute('aria-label','Result details'); document.body.append(dialog);
  function show(html) { dialog.innerHTML = `<div class="wb-dialog-top">${detail?.type === 'review' ? button('review-open','Refresh review',detail.id) : ''}${button('close','Close')}</div>${html}`; if (!dialog.open) dialog.showModal(); loadImages(dialog);
    const draftButton = dialog.querySelector('[data-wb=draft-concept]'); if (draftButton) draftButton.disabled = !dialog.querySelector('#concept-agent').value || data().reviews.find(x=>x.id===detail?.id)?.state !== 'complete';
    const meshyButton = dialog.querySelector('[data-wb=meshy]'); if (meshyButton) meshyButton.disabled = !dialog.querySelector('#native-status')?.value; }
  async function preview(id) {
    const item = data().results.find(x => x.id === id); if (!item) throw new Error('This result was deleted.');
    detail = { type: 'result', id }; const version = ++modalVersion;
    show(`<h2>${e(item.title)}</h2><p class="field-hint">${e(item.source)} · ${e(item.status.replaceAll('-', ' '))} · ${date(item.at)}</p><div id="result-preview">Loading…</div><div class="wb-toolbar">${button('export','Export',id,'secondary')}${button('delete-one','Delete saved copy',id,'subtle danger')}</div>`);
    const content = await api('results.preview',id);
    if (version !== modalVersion || !dialog.open) return;
    dialog.querySelector('#result-preview').innerHTML = content.image ? `<img class="result-full-image" src="${e(content.image)}" alt="${e(item.title)}">` : `<pre class="result-text">${e(content.text)}</pre>${content.truncated ? '<p>Preview shortened. Export for the full file.</p>' : ''}`;
  }
  function meshyConnection() {
    const auth = data().meshyAuth || { state:'unchecked' };
    if (auth.state === 'connected') return '<p>Meshy connected.</p>';
    if (auth.state === 'starting') return '<p>Starting Meshy sign-in?</p>';
    if (auth.state === 'waiting') return '<p>Enter this code on Meshy: <strong>' + e(auth.code) + '</strong></p>' + button('meshy-login','Open Meshy sign-in','','secondary');
    return '<div class="wb-toolbar">' + button('meshy-status','Check sign-in') + button('meshy-connect','Connect Meshy','','secondary') + '</div>' + (auth.error ? '<p role="alert">' + e(auth.error) + '</p>' : '');
  }
  function syncMeshy() {
    const node = dialog.querySelector('#meshy-connection'); if (node) { const html = meshyConnection(); if (node.innerHTML !== html) node.innerHTML = html; }
  }
  async function review(id) {
    const version = ++modalVersion; detail = { type:'review', id };
    const item = await api('review.get', id); if (version !== modalVersion) return;
    const shots = data().results.filter(x => x.groupId === id && ['screenshot','concept'].includes(x.kind));
    const jobs = data().concepts.filter(x => x.reviewId === id);
    const sessions = getState().sessions.filter(x => x.alive && ['codex','claude'].includes(x.provider) && ['open','ready'].includes(x.state));
    show(`<h2>${e(item.url)}</h2><p>${e(item.error || item.stage || 'Automated checks are a starting point. Finish the checklist before calling the page reviewed.')}</p><div class="review-shots">${shots.map(x => `<button data-wb="preview" data-id="${x.id}"><img data-result-image="${x.id}" alt="${e(x.title)}"><span>${e(x.title)}</span></button>`).join('')}</div>${item.report ? `<div class="review-findings">${item.report.views.map(view => `<section class="surface"><h3>${e(view.name)} · ${view.width} × ${view.height}</h3><p>${view.page.horizontalOverflow ? 'Horizontal overflow found.' : 'No horizontal overflow detected.'} ${view.page.missingAlt} images without alt attributes.</p>${view.accessibility.violations.map(x => `<details><summary>${e(x.impact)} · ${e(x.help)}</summary>${x.nodes.map(n => `<pre>${e(n.target.join(', '))}\n${e(n.summary)}</pre>`).join('')}</details>`).join('') || '<p>No violations detected by this scan.</p>'}<p class="field-hint">${view.accessibility.incomplete.length} automated rules need manual review.</p></section>`).join('')}</div><details class="surface"><summary>Links and third-party hosts</summary><p>${e(item.report.thirdPartyHosts.join(', ') || 'No third-party hosts observed during capture.')}</p>${item.report.links.map(x => `<p>${e(x.result)} ${x.status || ''} · ${e(x.url)}</p>`).join('')}<p class="field-hint">Up to 12 same-origin links checked with HEAD. Redirect destinations and protected links need manual review.</p></details>` : ''}<section class="surface review-concepts"><h3>Page ideas</h3><p>Use your agent’s image generator first. The brief includes these screenshots.</p><div class="wb-toolbar"><select id="concept-agent" aria-label="Agent for the design brief">${sessions.length ? sessions.map(x => `<option value="${x.id}">${e(x.name)}</option>`).join('') : '<option value="">No idle agent console</option>'}</select>${button('draft-concept','Draft in console',id,'primary')}${button('copy-brief','Copy brief',id)}</div><p class="field-hint">The draft is pasted for you to review. Press Enter in the console to send it.</p><details><summary>Meshy fallback</summary><div id="meshy-connection">${meshyConnection()}</div><p>Uses your Meshy CLI sign-in. Uploads the screenshot to Meshy and spends credits.</p><label>Agent image generator<select id="native-status"><option value="">Try your agent first</option><option value="unavailable">Not available in this agent</option><option value="failed">Tried, but generation failed</option></select></label>${button('meshy','Generate with Meshy',id,'secondary')}</details>${jobs.map(x => `<div class="concept-job"><span>${e(x.state)}${x.error ? ' · ' + e(x.error) : ''}</span>${x.taskId && ['failed','interrupted'].includes(x.state) ? button('concept-resume','Resume task',x.id) : ''}${!['submitting','waiting','downloading'].includes(x.state) ? button('concept-delete','Remove job',x.id) : ''}</div>`).join('')}</section><section class="surface"><h3>Page checklist</h3><p class="field-hint">Check each item against the actual site. Use “Not applicable” with a reason.</p><div class="review-checks">${item.checks.map((x,index) => `<form class="review-check" data-review="${id}" data-index="${index}"><label>${index + 1}. ${e(x.title)}<select name="status" aria-label="${e(x.title)} status">${[['unreviewed','Unreviewed'],['passed','Checked'],['needs-work','Needs work'],['not-applicable','Not applicable']].map(([key,label]) => `<option value="${key}" ${x.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><input name="note" maxlength="1000" placeholder="Evidence or reason" aria-label="${e(x.title)} note" value="${e(x.note)}"><button type="submit" class="subtle">Save</button></form>`).join('')}</div></section>`);
  }
  async function loadImages(parent = document) {
    for (const img of parent.querySelectorAll('img[data-result-image]:not([src])')) {
      if (!img.isConnected) continue;
      const id = img.dataset.resultImage;
      try { if (!previews.has(id)) { if (previews.size > 60) previews.delete(previews.keys().next().value); previews.set(id, api('results.preview',{ id, thumbnail:true })); } const result = await previews.get(id); if (img.isConnected && result.image) img.src = result.image; }
      catch { previews.delete(id); img.alt = 'Preview unavailable'; }
    }
  }
  function refreshGallery() {
    resultPage = Math.min(resultPage, Math.max(0, Math.ceil(filtered().length / 40) - 1));
    const pager = document.querySelector('.result-pagination'); if (pager) pager.innerHTML = pagination();
    const grid = document.querySelector('.results-grid'); if (grid) { grid.innerHTML = resultsList(); loadImages(grid); }
    const btn = document.querySelector('[data-wb="delete-selected"]'); if (btn) { btn.textContent = `Delete selected (${selected.size})`; btn.disabled = !selected.size; }
  }
  async function remove(ids) {
    const result = await api('results.delete', ids);
    for (const id of result.deleted) { selected.delete(id); previews.delete(id); }
    if (result.failed.length) toast(`${result.failed.length} files could not be deleted. Try again.`,true);
    if (getPage() === 'results') renderPage();
  }
  document.addEventListener('input', event => {
    if (event.target.id === 'result-search') { filter = event.target.value; resultPage = 0; refreshGallery(); }
    if (event.target.closest('#website-review-form')) reviewDraft[event.target.name] = event.target.value;
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'native-status') { const btn = dialog.querySelector('[data-wb=meshy]'); if (btn) btn.disabled = !event.target.value; }
    if (event.target.id === 'result-kind') { kind = event.target.value; resultPage = 0; refreshGallery(); }
    if (event.target.id === 'result-project') { project = event.target.value; resultPage = 0; refreshGallery(); }
    if (event.target.dataset.resultSelect) { event.target.checked ? selected.add(event.target.dataset.resultSelect) : selected.delete(event.target.dataset.resultSelect); const btn = document.querySelector('[data-wb="delete-selected"]'); btn.textContent = `Delete selected (${selected.size})`; btn.disabled = !selected.size; }
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (form.id !== 'website-review-form' && !form.matches('.review-check')) return;
    event.preventDefault(); const submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
    try {
      if (form.id === 'website-review-form') { await api('review.start', reviewDraft); toast('Review started.'); }
      else { await api('review.check', { id: form.dataset.review, index: Number(form.dataset.index), status: form.elements.status.value, note: form.elements.note.value }); toast('Saved.'); }
    } catch (error) { if (form.id === 'website-review-form') form.querySelector('.form-error').textContent = error.message; else toast(error.message,true); }
    finally { submit.disabled = false; }
  });
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-wb]'); if (!target) return;
    const action = target.dataset.wb, id = target.dataset.id; target.disabled = true;
    try {
      if (action === 'previous-results') { resultPage = Math.max(0,resultPage-1); refreshGallery(); }
      if (action === 'next-results') { resultPage++; refreshGallery(); }
      if (action === 'meshy-status') await api('concept.auth-status');
      if (action === 'meshy-connect') await api('concept.connect');
      if (action === 'meshy-login') await api('concept.open-login');
      if (action === 'close') { detail = null; ++modalVersion; dialog.close(); }
      if (action === 'preview') await preview(id);
      if (action === 'import') { const result = await api('results.import'); if (result.errors.length) toast(result.errors.join('\n'),true); renderPage(); }
      if (action === 'export') await api('results.export',id);
      if (action === 'select-all') { for (const x of visible()) selected.add(x.id); refreshGallery(); }
      if (action === 'delete-selected') await remove([...selected]);
      if (action === 'delete-one') { await remove([id]); if (!data().results.some(x=>x.id===id)) dialog.close(); }
      if (['read','dismiss','clear-read'].includes(action)) await api('inbox.update',{id,action});
      if (action === 'inbox-open') {
        const item = data().inbox.find(x=>x.id===id); await api('inbox.update',{id,action:'read'});
        if (item.destination === 'usage') navigate('usage');
        else if (item.reviewId && data().reviews.some(x=>x.id===item.reviewId)) { navigate('reviews'); await review(item.reviewId); }
        else if (item.resultId && data().results.some(x=>x.id===item.resultId)) { navigate('results'); await preview(item.resultId); }
        else if (getState().sessions.some(x=>x.id===item.sessionId)) await selectSession(item.sessionId);
        else toast('This console or result is no longer available.');
      }
      if (action === 'review-open') await review(id);
      if (action === 'review-delete') await api('review.delete',id);
      if (action === 'copy-brief') { await api('review.brief',id); toast('Design brief copied.'); }
      if (action === 'draft-concept') { const sessionId = dialog.querySelector('#concept-agent').value; await api('review.draft',{id,sessionId}); dialog.close(); await selectSession(sessionId); }
      if (action === 'meshy') { await api('concept.start',{reviewId:id,nativeStatus:dialog.querySelector('#native-status').value}); toast('Meshy concept started.'); await review(id); }
      if (action === 'concept-resume') { await api('concept.resume',id); toast('Resuming the saved Meshy task.'); }
      if (action === 'concept-delete') { await api('concept.delete',id); if(detail?.type==='review') await review(detail.id); }
    } catch (error) { toast(error.message,true); }
    finally { if (target.isConnected) target.disabled = false; }
  });
  dialog.addEventListener('close',()=>{detail=null;++modalVersion;});
  return {
    render: page => ({ results:gallery, inbox, reviews }[page]?.() || ''),
    mount: () => { loadImages(); const btn = document.querySelector('[data-wb="delete-selected"]'); if (btn) btn.disabled = !selected.size; },
    sync() {
      const d = data(), next = JSON.stringify(d);
      const badge = document.querySelector('#inbox-count'); if (badge) { const unread = d.inbox.filter(x=>!x.read).length; badge.textContent = unread || ''; badge.hidden = !unread; }
      syncMeshy();
      if (next === stamp) return; stamp = next;
      for (const id of selected) if (!d.results.some(x=>x.id===id)) selected.delete(id);
      if (getPage() === 'inbox') renderPage();
      if (getPage() === 'results') refreshGallery();
      const list = document.querySelector('#review-list'); if (list) list.innerHTML = reviewList();
      const submit = document.querySelector('#website-review-form button[type="submit"]'); if (submit) submit.disabled = d.reviews.some(x=>x.state==='running');
      // Do not replace a checklist or form while the user is editing it.
    }
  };
}
