import './workbench.css';
import { projectKey, projectLabel, resultGroupKey, resultGroups, resultRevision, revisionLabel, turnRevisions } from './results-model';

export function workbenchUI({ call, getState, getPage, renderPage, escape: e, toast, selectSession, navigate }) {
  const api = (method, value) => call('workbench.' + method, value);
  const selected = new Set(), previews = new Map();
  let resultPage = 0;
  let filter = '', kind = '', project = '', consoleFilter = '', reviewDraft = { url: '', brief: '' }, detail = null, stamp = '', modalVersion = 0;
  const data = () => getState()?.workbench || { results: [], inbox: [], reviews: [], concepts: [] };
  const date = at => new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const button = (action, label, id = '', cls = 'subtle', disabled = false) => `<button ${disabled ? 'disabled' : ''} class="${cls}" data-wb="${action}" data-id="${e(id)}">${label}</button>`;
  const consoleKey = x => x.consoleKey || x.sessionId || x.source || 'Dock';
  const consoleName = x => x.consoleName || getState().sessions.find(s => s.id === x.sessionId)?.name || (x.sessionId ? 'Earlier console' : x.source === 'Agent' ? 'API' : x.source || 'Dock');
  const groupKey = resultGroupKey;
  const projectName = x => projectLabel(x, getState().projects || []);
  const revision = (git, showRepository = false) => `<span class="result-branch" title="${e(git ? [git.repository, git.branch || (git.detached ? 'Detached HEAD' : 'Branch unavailable'), git.commit || (git.unborn ? 'No commits yet' : 'Commit unavailable'), git.dirty === true ? 'Includes uncommitted changes relative to this commit.' : git.dirty === false ? 'Working tree clean when recorded.' : 'Working-tree state was not recorded.'].filter(Boolean).join('\n') : 'This result has no saved Git revision.')}" aria-label="${e('Git revision: ' + revisionLabel(git))}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12h5m10 0h5"/><circle cx="12" cy="12" r="5"/></svg><span>${showRepository && git?.repository ? e(git.repository.split(/[\\/]/).pop()) + ' · ' : ''}${e(revisionLabel(git))}</span></span>`;
  const batch = id => { const item = data().results.find(x => x.id === id); return item ? data().results.filter(x => groupKey(x) === groupKey(item)) : []; };
  const filtered = () => data().results.filter(x => (!kind || x.kind === kind) && (!project || projectKey(x) === project) && (!consoleFilter || consoleKey(x) === consoleFilter) && (!filter || (x.title + ' ' + x.summary + ' ' + consoleName(x) + ' ' + projectName(x)).toLowerCase().includes(filter.toLowerCase())));
  const shell = (title, text, content) => `<div class="page-heading"><div><h1>${title}</h1><p>${text}</p></div></div>${content}`;
  const empty = text => `<div class="wb-empty">${text}</div>`;
  const visible = () => resultGroups(filtered()).slice(resultPage * 12, (resultPage + 1) * 12).flat();
  const pagination = () => button('previous-results','Previous','','subtle',resultPage === 0) + `<span class="result-page-number">${resultPage + 1} / ${Math.max(1, Math.ceil(resultGroups(filtered()).length / 12))}</span>` + button('next-results','Next','','subtle',(resultPage + 1) * 12 >= resultGroups(filtered()).length);
  const card = x => `<article class="result-card"><button class="result-image" data-wb="preview" data-id="${x.id}" aria-label="Open ${e(x.title)}">${!x.image ? `<span class="result-file">${x.kind === 'code' ? '&lt;/&gt;' : e(x.ext.slice(1).toUpperCase())}</span>` : ''}${x.image || x.ext === '.zip' ? `<img data-result-image="${x.id}" alt="${e(x.title)}">` : ''}</button><div class="result-copy"><div class="result-meta"><span>${e(x.kind)}</span><label class="result-select"><input type="checkbox" data-result-select="${x.id}" aria-label="Select ${e(x.title)}" ${selected.has(x.id) ? 'checked' : ''}></label></div><button class="result-title" data-wb="preview" data-id="${x.id}">${e(x.title)}</button><p>${e(x.summary || (x.project.split(/[\\/]/).filter(Boolean).pop() || 'No project'))}</p><div class="result-meta"><time>${date(x.at)}</time><span>${e(x.status.replaceAll('-', ' '))}</span></div></div></article>`;
  const resultsList = () => {
    const consoles = new Map();
    for (const item of visible()) {
      const key = projectKey(item);
      if (!consoles.has(key)) consoles.set(key, new Map());
      const groups = consoles.get(key), group = groupKey(item);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    }
    return [...consoles.values()].map(groups => {
      const first = groups.values().next().value[0];
      return `<section class="result-console-group"><header class="result-console-heading"><h2>${e(projectName(first))}</h2><span class="project-label">${first.projectId ? 'Project' : 'Working folder'}</span></header>${[...groups.values()].map(items => {
        const first = items[0], all = batch(first.id), unread = all.some(x => !x.seenAt), code = all.find(x => x.kind === 'code'), revisions = turnRevisions(all);
        const pictures = items.filter(x => x.image), files = items.filter(x => !x.image && x.ext !== '.json' || x.kind === 'code' && x.changeCount !== 0), supporting = items.filter(x => x.ext === '.json' && x.kind !== 'code');
        return `<section class="result-batch ${unread ? 'unread' : ''}"><header class="result-batch-heading"><div><strong>${e(consoleName(first))}</strong><time>${date(first.at)}</time>${revisions.length ? revisions.map(git => revision(git, revisions.length > 1)).join('') : revision(null)}${unread ? '<span class="result-new">New</span>' : ''}</div><div>${code && code.changeCount !== 0 ? button('preview','Code changes',code.id,'secondary') : ''}${unread ? button('seen-batch','Mark viewed',first.id) : ''}${button('delete-batch','Delete batch',first.id,'subtle danger')}</div></header><div class="result-batch-grid">${pictures.length ? imageGroup(pictures) : ''}${files.map(card).join('')}</div>${supporting.length ? `<details class="result-supporting-data"><summary>Supporting files (${supporting.length})</summary><div class="result-batch-grid">${supporting.map(card).join('')}</div></details>` : ''}${!pictures.length && !files.length && !supporting.length ? '<p class="field-hint">No code changes or pictures saved in this turn.</p>' : ''}</section>`;
      }).join('')}</section>`;
    }).join('') || empty('Screenshots, test reports and concepts will appear here.');
  };
  function imageGroup(items) {
    const first = items.find(x => !x.seenAt) || items[0], viewed = items.filter(x => x.seenAt).length;
    return `<article class="result-card result-image-group"><button class="result-image" data-wb="preview" data-id="${first.id}" aria-label="Browse ${items.length} pictures"><img data-result-image="${first.id}" alt="${e(first.title)}"><span class="result-image-count">${items.length} picture${items.length === 1 ? '' : 's'}</span></button><div class="result-copy"><button class="result-title" data-wb="preview" data-id="${first.id}">Pictures</button><p>${viewed} of ${items.length} viewed</p><div class="result-miniatures">${items.slice(0, 5).map(x => `<button data-wb="preview" data-id="${x.id}" aria-label="${e(x.title)}${x.seenAt ? ', viewed' : ', not viewed'}"><img data-result-image="${x.id}" alt="">${x.seenAt ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div></div></article>`;
  }
  function gallery() {
    const projects = new Map(data().results.map(x => [projectKey(x), projectName(x)]));
    const consoles = new Map(data().results.map(x => [consoleKey(x), consoleName(x)]));
    return shell('Results', '', `<div class="wb-toolbar result-filters"><input id="result-search" type="search" aria-label="Search results" placeholder="Search results" value="${e(filter)}"><select id="result-console" aria-label="Console"><option value="">All consoles</option>${[...consoles].map(([key,name]) => `<option value="${e(key)}" ${key === consoleFilter ? 'selected' : ''}>${e(name)}</option>`).join('')}</select><select id="result-kind" aria-label="Result type"><option value="">All types</option>${['code','screenshot','test','report','review','concept','asset'].map(x => `<option value="${x}" ${x === kind ? 'selected' : ''}>${x}</option>`).join('')}</select><select id="result-project" aria-label="Project"><option value="">All projects</option>${[...projects].map(([key,name]) => `<option value="${e(key)}" ${key === project ? 'selected' : ''}>${e(name)}</option>`).join('')}</select>${button('import','Add files','','secondary')}${button('folder','Open folder')}</div><div class="wb-toolbar small">${button('select-all','Select visible')}${button('delete-selected',`Delete selected (${selected.size})`,'','subtle danger')}${button('seen-all','Mark all viewed')}</div><div class="results-grid">${resultsList()}</div><div class="wb-toolbar result-pagination">${pagination()}</div>`);
  }
  function inbox() {
    return shell('Inbox', 'Ready for you.', `<div class="wb-toolbar">${button('clear-all','Clear inbox','','secondary',!data().inbox.length)}${button('clear-read','Clear read','','subtle',!data().inbox.some(x => x.read))}</div><div class="inbox-list">${data().inbox.map(x => `<article class="inbox-item ${x.read ? 'read' : ''}"><span class="inbox-dot ${e(x.kind)}"></span><div><h2>${e(x.title)}</h2>${x.message ? `<p>${e(x.message)}</p>` : ''}<time>${date(x.at)}</time></div><div class="inbox-actions">${x.destination || x.reviewId || x.resultId || getState().sessions.some(s => s.id === x.sessionId) ? button('inbox-open','Open',x.id) : ''}${!x.read ? button('read','Mark read',x.id) : ''}${button('dismiss','Dismiss',x.id)}</div></article>`).join('') || empty('You’re caught up. Finished jobs, questions and errors land here.')}</div>`);
  }
  function reviews() {
    return shell('Website review', 'Check the page. Keep the evidence. Explore a new direction.', `<form id="website-review-form" class="surface wb-review-form"><label>Page URL<input name="url" type="url" placeholder="https://example.com or http://localhost:3000" value="${e(reviewDraft.url)}" required></label><label>What should improve?<textarea name="brief" rows="2" maxlength="2500" placeholder="The page’s goal, audience or design direction">${e(reviewDraft.brief)}</textarea></label><div class="wb-toolbar"><button class="primary" type="submit" ${data().reviews.some(x => x.state === 'running') ? 'disabled' : ''}>Review page</button><p class="field-hint">Desktop + mobile. Automated checks and a manual checklist.</p></div><p class="form-error" role="alert"></p></form><div id="review-list">${reviewList()}</div>`);
  }
  function reviewList() {
    return data().reviews.map(x => `<article class="review-row"><div><h2>${e(x.url)}</h2><p>${e(x.state === 'complete' ? `${x.issues} automated findings · manual review needed` : x.stage || x.error || x.state)}</p><time>${date(x.at)}</time></div>${button('review-open',x.state === 'running' ? 'View progress' : 'Open review',x.id)}${x.state !== 'running' ? button('review-delete','Delete',x.id,'subtle danger') : ''}</article>`).join('') || '';
  }
  const dialog = document.createElement('dialog'); dialog.className = 'wb-dialog'; dialog.setAttribute('aria-label','Result details'); document.body.append(dialog);
  function show(html) { dialog.innerHTML = `<div class="wb-dialog-top">${detail?.type === 'review' ? button('review-open','Refresh review',detail.id) : ''}${button('close','Close')}</div>${html}`; if (!dialog.open) dialog.showModal(); loadImages(dialog);
    const draftButton = dialog.querySelector('[data-wb=draft-concept]'); if (draftButton) draftButton.disabled = !dialog.querySelector('#concept-agent').value || data().reviews.find(x=>x.id===detail?.id)?.state !== 'complete';
    const meshyButton = dialog.querySelector('[data-wb=meshy]'); if (meshyButton) meshyButton.disabled = !dialog.querySelector('#native-status')?.value; }
  async function preview(id, entry = null) {
    const item = data().results.find(x => x.id === id); if (!item) throw new Error('This result was deleted.');
    detail = { type: 'result', id }; const version = ++modalVersion;
    dialog.classList.toggle('image-gallery', !!item.image);
    const code = batch(id).find(x => x.kind === 'code');
    show(`<h2>${e(item.title)}</h2><div class="result-detail-meta">${item.kind === 'code' && resultRevision(item) ? '' : revision(resultRevision(item))}<span>${e(consoleName(item))} · ${e(item.status.replaceAll('-', ' '))} · ${date(item.at)}</span>${code && code.id !== id ? button('preview','Code changes',code.id,'secondary') : ''}</div><div id="result-preview" aria-live="polite">Loading…</div><div class="wb-toolbar">${button('export','Export',id,'secondary')}${button('delete-one','Delete saved copy',id,'subtle danger')}</div>`);
    const heading = dialog.querySelector('h2'); heading.tabIndex = -1; heading.focus({ preventScroll: true }); dialog.scrollTop = 0;
    if (item.image) { dialog.querySelector('#result-preview').insertAdjacentHTML('afterend', '<div id="image-navigation"></div>'); updateImageNavigation(id); }
    try {
      const content = await api('results.preview',{ id, entry });
      const ext = content.entry?.ext || item.ext;
      const markdown = ext === '.md' && content.text != null ? (await import('./markdown')).renderMarkdown(content.text) : null;
      if (version !== modalVersion || !dialog.open) return;
      const body = content.diff ? renderDiff(content.diff) : content.image ? `<img class="result-full-image" src="${e(content.image)}" alt="${e(content.entry?.name || item.title)}">` : `${markdown !== null ? `<article class="result-markdown">${markdown}</article>` : `<pre class="result-text">${e(content.text || '')}</pre>`}${content.truncated ? '<p>Preview shortened. Export for the full file.</p>' : ''}`;
      dialog.querySelector('#result-preview').innerHTML = content.archive ? `<div class="archive-preview"><nav class="archive-files" aria-label="Files in archive"><p>${content.archive.entries.length}${content.archive.limited ? '+' : ''} files</p>${content.archive.entries.map(file => `<button type="button" data-wb="archive-entry" data-id="${e(id)}" data-entry="${file.index}" aria-pressed="${file.index === content.entry?.index}"><span class="archive-file-type">${e(file.ext.slice(1).toUpperCase() || 'FILE')}</span><span>${e(file.name)}${file.reason ? `<small>${e(file.reason)}</small>` : ''}</span></button>`).join('')}${content.archive.limited ? '<p>Showing the first files. Export for the full archive.</p>' : ''}</nav><section class="archive-content">${content.entry ? `<h3>${e(content.entry.name)}</h3>` : ''}${body}</section></div>` : body;
      if (ext === '.json' && !content.diff && content.text != null) {
        const target = dialog.querySelector('.result-text');
        if (target) target.outerHTML = `<p>${e(item.summary || 'Supporting data for this turn.')}</p><details class="result-supporting-data"><summary>Show data</summary><pre class="result-text">${e(content.text)}</pre></details>`;
      }
      if (entry != null) dialog.querySelector(`[data-entry="${entry}"]`)?.focus({ preventScroll: true });
      await api('results.seen', [id]);
      if (version !== modalVersion || !dialog.open) return;
      item.seenAt ||= Date.now();
      updateImageNavigation(id);
    } catch (error) {
      if (version === modalVersion && dialog.open) dialog.querySelector('#result-preview').innerHTML = `<p role="alert">${e(error.message)}</p>`;
    }
  }
  function updateImageNavigation(id) {
    const node = dialog.querySelector('#image-navigation'); if (!node) return;
    const images = batch(id).filter(x => x.image).sort((a,b) => a.at-b.at || a.id.localeCompare(b.id)), index = images.findIndex(x => x.id === id);
    node.innerHTML = `<div class="result-image-pager">${button('previous-image','Previous picture',images[index-1]?.id || '','secondary',index <= 0)}<span role="status">${index+1} / ${images.length}</span>${button('next-image','Next picture',images[index+1]?.id || '','secondary',index >= images.length-1)}</div><nav class="result-filmstrip" aria-label="Pictures in this turn">${images.map((x,i) => `<button data-wb="gallery-image" data-id="${x.id}" aria-current="${id === x.id ? 'true' : 'false'}" aria-label="${i+1}. ${e(x.title)}, ${x.seenAt ? 'viewed' : 'not viewed'}"><img data-result-image="${x.id}" alt=""><span>${i+1}${x.seenAt ? ' · Viewed' : ''}</span></button>`).join('')}</nav>`;
    loadImages(node);
    const strip = node.querySelector('.result-filmstrip'), current = node.querySelector('[aria-current=true]');
    if (strip && current) strip.scrollLeft = current.offsetLeft - strip.offsetLeft - (strip.clientWidth-current.clientWidth)/2;
  }
  async function switchImage(id, action) {
    await preview(id);
    const target = dialog.querySelector(`[data-wb="${action}"]:not(:disabled)`) || dialog.querySelector('.result-filmstrip [aria-current=true]');
    target?.focus({ preventScroll: true });
  }
  function renderDiff(report) {
    const git = report.git, before = git?.before, after = git?.after;
    return (git ? `<div class="code-git-context">${revision(before)}${revisionLabel(before) !== revisionLabel(after) || before?.repository !== after?.repository ? `<span aria-label="to">→</span>${revision(after)}` : ''}</div>` : '') + (report.notes || []).map(note => `<p class="field-hint">${e(note)}</p>`).join('') + ((report.changes || []).length ? report.changes.map(change => `<details class="code-change" open><summary>${e(change.file)} <span>${e(change.type)}</span></summary>${change.patch ? `<pre class="result-text code-diff">${change.patch.split('\n').map(line => `<span class="${line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : line.startsWith('@@') ? 'diff-hunk' : ''}">${e(line)}\n</span>`).join('')}</pre>` : `<p class="field-hint">${e(change.omitted || 'No text preview')}</p>`}</details>`).join('') : '<p>No code changes in this turn.</p>');
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
  function previewJobs(id) {
    return data().concepts.filter(x => x.reviewId === id).map(x => `<div><span>${e(x.provider || 'meshy')} · ${e(x.state)}${x.error ? ' · ' + e(x.error) : ''}</span>${x.resultId && data().results.some(r => r.id === x.resultId) ? button('preview', 'View preview', x.resultId) : ''}${x.taskId && ['failed','interrupted'].includes(x.state) ? button('concept-resume', 'Resume task', x.id) : ''}${!['submitting','waiting','downloading'].includes(x.state) ? button('concept-delete', 'Remove job', x.id) : ''}</div>`).join('');
  }
  function previewControls(id, item, sessions) {
    const config = getState().shared.imageGeneration || { provider: 'agent' }, native = config.provider === 'agent';
    const label = { agent: 'Agent’s own generator first', openai: 'OpenAI', gemini: 'Gemini / Nano Banana', meshy: 'Meshy', compatible: 'Compatible image API' }[config.provider];
    return `<section class="surface review-concepts"><h3>Screen preview</h3><div class="preview-routing"><p>${e(label)}${config.model ? ' · ' + e(config.model) : ''}</p>${button('image-settings', 'Change generator')}<p class="field-hint">A visual proposal to review before changing the page.</p></div>
      ${!native ? `<p class="field-hint">Sends the screenshot and brief to your chosen provider. Generation may use paid credits.</p>${config.provider === 'meshy' ? `<div id="meshy-connection">${meshyConnection()}</div>` : ''}${button('generate-preview', 'Generate preview', id, 'primary', item.state !== 'complete' || data().concepts.some(x => ['submitting','waiting','downloading'].includes(x.state)))}` : ''}
      <div class="wb-toolbar"><select id="concept-agent" aria-label="Agent for the design brief">${sessions.length ? sessions.map(x => `<option value="${x.id}">${e(x.name)}</option>`).join('') : '<option value="">No idle agent console</option>'}</select>${button('draft-concept', 'Draft in console', id, native ? 'primary' : 'secondary', !sessions.length)}${button('copy-brief', 'Copy brief', id)}</div><p class="field-hint">The draft is pasted for you to review. Press Enter in the console to send it.</p>
      ${native ? `<details><summary>Meshy fallback</summary><div id="meshy-connection">${meshyConnection()}</div><p>Uses your Meshy CLI sign-in. Uploads the screenshot to Meshy and spends credits.</p><label>Agent image generator<select id="native-status"><option value="">Try your agent first</option><option value="unavailable">Not available in this agent</option><option value="failed">Tried, but generation failed</option></select></label>${button('meshy', 'Generate with Meshy', id, 'secondary', true)}</details>` : ''}
      <div class="image-job-list" data-preview-jobs="${e(id)}">${previewJobs(id)}</div></section>`;
  }
  async function review(id) {
    dialog.classList.remove('image-gallery');
    const version = ++modalVersion; detail = { type:'review', id };
    const item = await api('review.get', id); if (version !== modalVersion) return;
    const shots = data().results.filter(x => (x.reviewId === id || x.groupId === id) && ['screenshot','concept'].includes(x.kind));
    const sessions = getState().sessions.filter(x => x.alive && ['codex','claude'].includes(x.provider) && ['open','ready'].includes(x.state));
    show(`<h2>${e(item.url)}</h2><p>${e(item.error || item.stage || 'Automated checks are a starting point. Finish the checklist before calling the page reviewed.')}</p><div class="review-shots">${shots.map(x => `<button data-wb="preview" data-id="${x.id}"><img data-result-image="${x.id}" alt="${e(x.title)}"><span>${e(x.title)}</span></button>`).join('')}</div>${item.report ? `<div class="review-findings">${item.report.views.map(view => `<section class="surface"><h3>${e(view.name)} · ${view.width} × ${view.height}</h3><p>${view.page.horizontalOverflow ? 'Horizontal overflow found.' : 'No horizontal overflow detected.'} ${view.page.missingAlt} images without alt attributes.</p>${view.accessibility.violations.map(x => `<details><summary>${e(x.impact)} · ${e(x.help)}</summary>${x.nodes.map(n => `<pre>${e(n.target.join(', '))}\n${e(n.summary)}</pre>`).join('')}</details>`).join('') || '<p>No violations detected by this scan.</p>'}<p class="field-hint">${view.accessibility.incomplete.length} automated rules need manual review.</p></section>`).join('')}</div><details class="surface"><summary>Links and third-party hosts</summary><p>${e(item.report.thirdPartyHosts.join(', ') || 'No third-party hosts observed during capture.')}</p>${item.report.links.map(x => `<p>${e(x.result)} ${x.status || ''} · ${e(x.url)}</p>`).join('')}<p class="field-hint">Up to 12 same-origin links checked with HEAD. Redirect destinations and protected links need manual review.</p></details>` : ''}${previewControls(id, item, sessions)}<section class="surface"><h3>Page checklist</h3><p class="field-hint">Check each item against the actual site. Use “Not applicable” with a reason.</p><div class="review-checks">${item.checks.map((x,index) => `<form class="review-check" data-review="${id}" data-index="${index}"><label>${index + 1}. ${e(x.title)}<select name="status" aria-label="${e(x.title)} status">${[['unreviewed','Unreviewed'],['passed','Checked'],['needs-work','Needs work'],['not-applicable','Not applicable']].map(([key,label]) => `<option value="${key}" ${x.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><input name="note" maxlength="1000" placeholder="Evidence or reason" aria-label="${e(x.title)} note" value="${e(x.note)}"><button type="submit" class="subtle">Save</button></form>`).join('')}</div></section>`);
  }
  async function loadImages(parent = document) {
    for (const img of parent.querySelectorAll('img[data-result-image]:not([src])')) {
      if (!img.isConnected) continue;
      const id = img.dataset.resultImage;
      try { if (!previews.has(id)) { if (previews.size > 60) previews.delete(previews.keys().next().value); previews.set(id, api('results.preview',{ id, thumbnail:true })); } const result = await previews.get(id); if (img.isConnected) { if (result.image) img.src = result.image; else img.hidden = true; } }
      catch { previews.delete(id); img.alt = 'Preview unavailable'; }
    }
  }
  function refreshGallery() {
    for (const [id, values, selectedValue, label] of [
      ['result-console', new Map(data().results.map(x => [consoleKey(x), consoleName(x)])), consoleFilter, 'All consoles'],
      ['result-project', new Map(data().results.map(x => [projectKey(x), projectName(x)])), project, 'All projects']
    ]) {
      const select = document.getElementById(id);
      if (select && select !== document.activeElement) {
        if (selectedValue && !values.has(selectedValue)) values.set(selectedValue, select.selectedOptions[0]?.textContent || selectedValue);
        select.innerHTML = `<option value="">${label}</option>` + [...values].map(([value, text]) => `<option value="${e(value)}" ${value === selectedValue ? 'selected' : ''}>${e(text)}</option>`).join('');
      }
    }
    resultPage = Math.min(resultPage, Math.max(0, Math.ceil(resultGroups(filtered()).length / 12) - 1));
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
    if (event.target.id === 'result-console') { consoleFilter = event.target.value; resultPage = 0; refreshGallery(); }
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
      if (['previous-image','next-image','gallery-image'].includes(action)) await switchImage(id, action);
      if (action === 'archive-entry') await preview(id, Number(target.dataset.entry));
      if (action === 'import') { const result = await api('results.import'); if (result.errors.length) toast(result.errors.join('\n'),true); renderPage(); }
      if (action === 'export') await api('results.export',id);
      if (action === 'folder') await api('results.folder');
      if (action === 'seen-batch') await api('results.seen',batch(id).map(x => x.id));
      if (action === 'seen-all') await api('results.seen',data().results.map(x => x.id));
      if (action === 'delete-batch') await remove(batch(id).map(x => x.id));
      if (action === 'select-all') { for (const x of visible()) selected.add(x.id); refreshGallery(); }
      if (action === 'delete-selected') await remove([...selected]);
      if (action === 'delete-one') { const next = batch(id).find(x => x.image && x.id !== id); await remove([id]); if (!data().results.some(x=>x.id===id)) { if (next) await preview(next.id); else dialog.close(); } }
      if (['read','dismiss','clear-read','clear-all'].includes(action)) await api('inbox.update',{id,action});
      if (action === 'inbox-open') await openNotice(data().inbox.find(x=>x.id===id));
      if (action === 'review-open') await review(id);
      if (action === 'review-delete') await api('review.delete',id);
      if (action === 'copy-brief') { await api('review.brief',id); toast('Design brief copied.'); }
      if (action === 'image-settings') { dialog.close(); navigate('tools'); document.querySelector('#image-generation-form')?.scrollIntoView({ block: 'start' }); }
      if (action === 'generate-preview') {
        target.dataset.requestId ||= crypto.randomUUID();
        const job = await api('preview.generate', { reviewId: id, requestId: target.dataset.requestId });
        toast(job.mode === 'agent' ? 'Use Draft in console to ask your agent for a preview.' : 'Preview started. It will appear in Results.');
        await review(id);
      }
      if (action === 'draft-concept') { const sessionId = dialog.querySelector('#concept-agent').value; await api('review.draft',{id,sessionId}); dialog.close(); await selectSession(sessionId); }
      if (action === 'meshy') { await api('concept.start',{reviewId:id,nativeStatus:dialog.querySelector('#native-status').value}); toast('Meshy concept started.'); await review(id); }
      if (action === 'concept-resume') { await api('concept.resume',id); toast('Resuming the saved Meshy task.'); }
      if (action === 'concept-delete') { await api('concept.delete',id); if(detail?.type==='review') await review(detail.id); }
    } catch (error) { toast(error.message,true); }
    finally { if (target.isConnected) target.disabled = false; }
  });
  dialog.addEventListener('close',()=>{detail=null;++modalVersion;});
  dialog.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight'].includes(event.key) || event.target.closest('input,textarea,select') || !dialog.querySelector('#image-navigation')) return;
    const action = event.key === 'ArrowLeft' ? 'previous-image' : 'next-image', next = dialog.querySelector(`[data-wb="${action}"]:not(:disabled)`);
    if (next) { event.preventDefault(); switchImage(next.dataset.id, action).catch(error => toast(error.message, true)); }
  });
  dialog.addEventListener('click', event => {
    const link = event.target.closest('.result-markdown a[href]');
    if (!link) return;
    event.preventDefault(); call('external.open', link.getAttribute('href')).catch(error => toast(error.message, true));
  });
  async function openNotice(item) {
    if (!item) { navigate('inbox'); return; }
    if (data().inbox.some(x => x.id === item.id)) await api('inbox.update', { id: item.id, action: 'read' });
    if (['usage', 'tools'].includes(item.destination)) navigate(item.destination);
    else if (item.resultId && data().results.some(x => x.id === item.resultId)) { navigate('results'); await preview(item.resultId); }
    else if (item.reviewId && data().reviews.some(x => x.id === item.reviewId)) { navigate('reviews'); await review(item.reviewId); }
    else if (getState().sessions.some(x => x.id === item.sessionId)) await selectSession(item.sessionId);
    else { navigate(item.resultId ? 'results' : 'inbox'); toast('This console or result is no longer available.'); }
  }
  return {
    openNotice,
    render: page => ({ results:gallery, inbox, reviews }[page]?.() || ''),
    mount: () => { loadImages(); const btn = document.querySelector('[data-wb="delete-selected"]'); if (btn) btn.disabled = !selected.size; },
    sync() {
      const d = data(), next = JSON.stringify(d);
      const badge = document.querySelector('#inbox-count'); if (badge) { const unread = d.inbox.filter(x=>!x.read).length; badge.textContent = unread || ''; badge.hidden = !unread; }
      const count = d.unreadResults ?? new Set(d.results.filter(x => !x.seenAt).map(groupKey)).size;
      const resultBadge = document.querySelector('#results-count');
      if (resultBadge) { resultBadge.textContent = count || ''; resultBadge.hidden = !count; resultBadge.closest('button').classList.toggle('has-new-results', !!count); resultBadge.closest('button').setAttribute('aria-label', count ? `Results, ${count} new ${count === 1 ? 'batch' : 'batches'}` : 'Results'); }
      const shortcut = document.querySelector('#results-shortcut');
      if (shortcut) { shortcut.hidden = !count; shortcut.querySelector('.notification-badge').textContent = count; shortcut.setAttribute('aria-label', `Results, ${count} new ${count === 1 ? 'batch' : 'batches'}`); }
      syncMeshy();
      const previewList = dialog.querySelector('[data-preview-jobs]');
      if (previewList) { const html = previewJobs(previewList.dataset.previewJobs); if (previewList.innerHTML !== html) previewList.innerHTML = html; }
      const generate = dialog.querySelector('[data-wb=generate-preview]');
      if (generate) generate.disabled = data().concepts.some(x => ['submitting','waiting','downloading'].includes(x.state)) || data().reviews.find(x => x.id === generate.dataset.id)?.state !== 'complete';
      if (next === stamp) return; stamp = next;
      for (const id of selected) if (!d.results.some(x=>x.id===id)) selected.delete(id);
      for (const id of previews.keys()) if (!d.results.some(x=>x.id===id)) previews.delete(id);
      if (detail?.type === 'result' && !d.results.some(x => x.id === detail.id)) { detail = null; ++modalVersion; dialog.close(); }
      if (getPage() === 'inbox') renderPage();
      if (getPage() === 'results') refreshGallery();
      const list = document.querySelector('#review-list'); if (list) list.innerHTML = reviewList();
      const submit = document.querySelector('#website-review-form button[type="submit"]'); if (submit) submit.disabled = d.reviews.some(x=>x.state==='running');
      // Do not replace a checklist or form while the user is editing it.
    }
  };
}
