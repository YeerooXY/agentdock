import './workbench.css';
import { projectKey, projectLabel, resultFolders, resultGroupKey, resultGroups, resultRevision, revisionLabel, turnRevisions, resultChatKey, resultTurnTitle } from './results-model';
import { projectColor } from './project-colors.js';

export function workbenchUI({ call, getState, getPage, renderPage, escape: e, toast, selectSession, navigate }) {
  const api = (method, value) => call('workbench.' + method, value);
  const selected = new Set(), previews = new Map();
  let resultPage = 0;
  const wideResults = matchMedia('(min-width:1200px)');
  let filter = '', kind = '', project = '', consoleFilter = '', detail = null, stamp = '', modalVersion = 0;
  let folderName = '';
  const data = () => getState()?.workbench || { results: [], concepts: [] };
  const date = at => new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const button = (action, label, id = '', cls = 'subtle', disabled = false) => `<button ${disabled ? 'disabled' : ''} class="${cls}" data-wb="${action}" data-id="${e(id)}">${label}</button>`;
  const consoleKey = x => x.consoleKey || x.sessionId || x.source || 'Dock';
  const consoleName = x => x.consoleName || getState().sessions.find(s => s.id === x.sessionId)?.name || (x.sessionId ? 'Earlier console' : x.source === 'Agent' ? 'API' : x.source || 'Dock');
  const groupKey = resultGroupKey;
  const projectName = x => x.projectId || x.project ? projectLabel(x, getState().projects || []) : 'Other';
  const folders = () => resultFolders(data().results, getState().projects || []);
  const showingFolders = () => !project && !filter.trim();
  const revision = (git, showRepository = false) => `<span class="result-branch" title="${e(git ? [git.repository, git.branch || (git.detached ? 'Detached HEAD' : 'Branch unavailable'), git.commit || (git.unborn ? 'No commits yet' : 'Commit unavailable'), git.dirty === true ? 'Includes uncommitted changes relative to this commit.' : git.dirty === false ? 'Working tree clean when recorded.' : 'Working-tree state was not recorded.'].filter(Boolean).join('\n') : 'This result has no saved Git revision.')}" aria-label="${e('Git revision: ' + revisionLabel(git))}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12h5m10 0h5"/><circle cx="12" cy="12" r="5"/></svg><span>${showRepository && git?.repository ? e(git.repository.split(/[\\/]/).pop()) + ' · ' : ''}${e(revisionLabel(git))}</span></span>`;
  const batch = id => { const item = data().results.find(x => x.id === id); return item ? data().results.filter(x => groupKey(x) === groupKey(item)) : []; };
  const filtered = () => data().results.filter(x => (!kind || x.kind === kind) && (!project || projectKey(x) === project) && (!consoleFilter || consoleKey(x) === consoleFilter) && (!filter || (x.title + ' ' + x.summary + ' ' + consoleName(x) + ' ' + projectName(x)).toLowerCase().includes(filter.toLowerCase())));
  const shell = (title, text, content, actions = '') => `<div class="page-heading"><div><h1>${title}</h1><p>${text}</p></div><div class="result-heading-actions">${actions}</div></div>${content}`;
  const empty = text => `<div class="wb-empty">${text}</div>`;
  const resultPages = () => !project && filter.trim() ? [...filtered()].sort((a,b) => b.at - a.at).map(x => [x]) : resultGroups(filtered());
  const visible = () => resultPages().slice(resultPage * 12, (resultPage + 1) * 12).flat();
  const pagination = () => button('previous-results','Previous','','subtle',resultPage === 0) + `<span class="result-page-number">${resultPage + 1} / ${Math.max(1, Math.ceil(resultPages().length / 12))}</span>` + button('next-results','Next','','subtle',(resultPage + 1) * 12 >= resultPages().length);
  const bulkActions = () => `${button('select-all','Select visible')}${selected.size ? button('delete-selected',`Delete selected (${selected.size})`,'','subtle danger') : ''}${button('seen-all','Mark all viewed')}`;
  const card = x => `<article class="result-card ${!x.image && x.ext !== '.zip' ? 'result-document' : ''}"><button class="result-image" data-wb="preview" data-id="${x.id}" aria-label="Open ${e(x.title)}">${!x.image ? `<span class="result-file">${x.kind === 'code' ? '&lt;/&gt;' : e(x.ext.slice(1).toUpperCase())}</span>` : ''}${x.image || x.ext === '.zip' ? `<img data-result-image="${x.id}" alt="${e(x.title)}">` : ''}</button><div class="result-copy"><div class="result-meta"><span>${e(x.kind)}</span>${!project ? `<span>${e(projectName(x))}</span>` : ''}<label class="result-select"><input type="checkbox" data-result-select="${x.id}" aria-label="Select ${e(x.title)}" ${selected.has(x.id) ? 'checked' : ''}></label></div><button class="result-title" data-wb="preview" data-id="${x.id}">${e(x.title)}</button><p>${e(x.summary || 'Saved file')}</p><div class="result-meta"><time>${date(x.at)}</time><span>${e(x.status.replaceAll('-', ' '))}</span></div></div></article>`;
  const resultsList = () => {
    const consoles = new Map();
    for (const item of visible()) {
      const key = resultChatKey(item);
      if (!consoles.has(key)) consoles.set(key, new Map());
      const groups = consoles.get(key), group = groupKey(item);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    }
    return [...consoles.values()].map(groups => {
      const first = groups.values().next().value[0];
      return `<section class="result-console-group"><header class="result-console-heading"><h2>${e(consoleName(first))}</h2></header>${[...groups.values()].map(items => {
        const first = items[0], all = batch(first.id), unread = all.some(x => !x.seenAt), code = all.find(x => x.kind === 'code'), revisions = turnRevisions(all);
        const pictures = items.filter(x => x.image), files = items.filter(x => !x.image && x.ext !== '.json' || x.kind === 'code' && x.changeCount !== 0), supporting = items.filter(x => x.ext === '.json' && x.kind !== 'code');
        return `<section class="result-batch ${unread ? 'unread' : ''}"><header class="result-batch-heading"><div><strong>${e(resultTurnTitle(items))}</strong><time>${date(first.at)}</time>${unread ? '<span class="result-new">New</span>' : ''}</div><div>${code && code.changeCount !== 0 ? button('preview','Code changes',code.id,'secondary') : ''}${unread ? button('seen-batch','Mark viewed',first.id) : ''}${button('delete-batch','Delete results',first.id,'subtle danger')}</div></header><p class="result-turn-summary">${e(all.find(x => x.kind !== 'code' && x.summary)?.summary || (code?.changeCount ? `${code.changeCount} files changed` : ''))}</p><details class="result-technical"><summary>Details</summary><span>${e(projectName(first))}</span>${revisions.map(git => revision(git, revisions.length > 1)).join('')}</details><div class="result-batch-grid">${pictures.length ? imageGroup(pictures) : ''}${files.map(card).join('')}</div>${supporting.length ? `<details class="result-supporting-data"><summary>Supporting files (${supporting.length})</summary><div class="result-batch-grid">${supporting.map(card).join('')}</div></details>` : ''}${!pictures.length && !files.length && !supporting.length ? '<p class="field-hint">No code changes or pictures saved in this turn.</p>' : ''}</section>`;
      }).join('')}</section>`;
    }).join('') || empty('Screenshots, test reports and concepts will appear here.');
  };
  function imageGroup(items) {
    const first = items.find(x => !x.seenAt) || items[0], viewed = items.filter(x => x.seenAt).length;
    return `<article class="result-card result-image-group"><button class="result-image" data-wb="preview" data-id="${first.id}" aria-label="Browse ${items.length} pictures"><img data-result-image="${first.id}" alt="${e(first.title)}"><span class="result-image-count">${items.length} picture${items.length === 1 ? '' : 's'}</span></button><div class="result-copy"><button class="result-title" data-wb="preview" data-id="${first.id}">Pictures</button><p>${viewed} of ${items.length} viewed</p><div class="result-miniatures">${items.slice(0, 5).map(x => `<button data-wb="preview" data-id="${x.id}" aria-label="${e(x.title)}${x.seenAt ? ', viewed' : ', not viewed'}"><img data-result-image="${x.id}" alt="">${x.seenAt ? '<span aria-hidden="true">✓</span>' : ''}</button>`).join('')}</div></div></article>`;
  }
  function resultContent() {
    if (showingFolders()) return `<div class="result-folders">${folders().map(folder => `<button class="result-folder" data-wb="project-folder" data-id="${e(folder.key)}" style="--project-color:${projectColor(folder.project)}" aria-label="${e(folder.name)}, ${folder.count} results, ${folder.unviewed} unviewed"><span class="result-folder-heading"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 4h7a2 2 0 0 1 2 2v10H3Z"/></svg>${folder.unviewed ? `<span class="result-folder-badge">${folder.unviewed} new</span>` : ''}</span><strong>${e(folder.name)}</strong><span>${folder.count} result${folder.count === 1 ? '' : 's'}</span><time>${date(folder.at)}</time></button>`).join('') || empty('No results yet.')}</div>`;
    if (!project && filter.trim()) return `<div class="result-search-results">${visible().map(card).join('') || empty('No matching results.')}</div>`;
    return resultsList();
  }
  function gallery() {
    const consoles = new Map(data().results.filter(x => !project || projectKey(x) === project).map(x => [consoleKey(x), consoleName(x)]));
    const hasResults = !showingFolders() && filtered().length > 0, multiplePages = !showingFolders() && resultPages().length > 12;
    const title = project ? `${button('back-results','Results','','subtle')}<span aria-hidden="true"> &rsaquo; </span><span class="result-folder-name">${e(folders().find(x => x.key === project)?.name || folderName)}</span>` : 'Results';
    return shell(title, '', `<div class="result-controls"><div class="wb-toolbar result-filters"><input id="result-search" type="search" aria-label="Search results" placeholder="Search results" value="${e(filter)}"><select id="result-console" aria-label="Console" ${showingFolders() ? 'hidden' : ''}><option value="">All consoles</option>${[...consoles].map(([key,name]) => `<option value="${e(key)}" ${key === consoleFilter ? 'selected' : ''}>${e(name)}</option>`).join('')}</select><select id="result-kind" aria-label="Result type" ${showingFolders() ? 'hidden' : ''}><option value="">All types</option>${['code','screenshot','test','report','review','concept','asset'].map(x => `<option value="${x}" ${x === kind ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="wb-toolbar small result-bulk-actions" ${hasResults ? '' : 'hidden'}>${hasResults ? bulkActions() : ''}</div></div><div class="results-workspace"><div class="results-list"><div class="results-grid">${resultContent()}</div><div class="wb-toolbar result-pagination" ${multiplePages ? '' : 'hidden'}>${multiplePages ? pagination() : ''}</div></div><aside class="result-side-panel" aria-label="Result details" hidden></aside></div>`, button('folder','Open folder','','secondary') + button('import','Add files','','primary'));
  }
  const dialog = document.createElement('dialog'); dialog.className = 'wb-dialog'; dialog.setAttribute('aria-label','Result details'); document.body.append(dialog);
  let pendingPreviewMoves = 0, previewOpener = null;
  function show(html, inline = false) {
    dialog.innerHTML = `<div class="wb-dialog-top">${button('close','Close')}</div>${html}`;
    const panel = document.querySelector('.result-side-panel');
    const usePanel = inline && !!panel;
    if (dialog.open && usePanel !== dialog.classList.contains('result-inline-preview')) { ++pendingPreviewMoves; dialog.close(); }
    if (inline && panel) {
      panel.hidden = false;
      panel.append(dialog);
      dialog.classList.add('result-inline-preview');
      dialog.show();
    } else {
      dialog.classList.remove('result-inline-preview');
      document.body.append(dialog);
      if (panel) panel.hidden = true;
      if (!dialog.open) dialog.showModal();
    }
    loadImages(dialog);
  }
  async function preview(id, entry = null) {
    const item = data().results.find(x => x.id === id); if (!item) throw new Error('This result was deleted.');
    if (!dialog.contains(document.activeElement)) previewOpener = document.activeElement;
    detail = { type: 'result', id, entry }; const version = ++modalVersion;
    dialog.classList.toggle('image-gallery', !!item.image);
    const code = batch(id).find(x => x.kind === 'code');
    show(`<h2>${e(item.title)}</h2><div class="result-detail-meta"><span>${e(consoleName(item))} · ${e(item.status.replaceAll('-', ' '))} · ${date(item.at)}</span>${code && code.id !== id ? button('preview','Code changes',code.id,'secondary') : ''}</div><div id="result-preview" aria-live="polite">Loading…</div><div class="wb-toolbar">${button('export','Export',id,'secondary')}${button('delete-one','Delete saved copy',id,'subtle danger')}</div>`, wideResults.matches && getPage() === 'results');
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
    const changes = report.changes || [], before = report.git?.before, after = report.git?.after;
    const notes = [...new Set(report.notes || [])];
    const context = [before, after].filter((git, i, list) => git && (git.branch || git.commit) && list.findIndex(x => JSON.stringify(x) === JSON.stringify(git)) === i);
    return '<p>' + changes.length + (changes.length === 1 ? ' file changed</p>' : ' files changed</p>') + (context.length || notes.length ? '<details class="result-technical"><summary>Capture details</summary>' + context.map(git => revision(git)).join('') + notes.map(note => '<p class="field-hint">' + e(note) + '</p>').join('') + '</details>' : '') + (changes.length ? changes.map(change => '<details class="code-change"><summary>' + e(change.file) + ' <span>' + e(change.type) + '</span></summary>' + (change.patch ? '<pre class="result-text code-diff">' + change.patch.split('\n').map(line => '<span class="' + (line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : line.startsWith('@@') ? 'diff-hunk' : '') + '">' + e(line) + '\n</span>').join('') + '</pre>' : '<p class="field-hint">' + e(change.omitted || 'No text preview') + '</p>') + '</details>').join('') : '<p>No code changes in this turn.</p>');
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
    const name = document.querySelector('.result-folder-name'); if (name) name.textContent = folders().find(x => x.key === project)?.name || folderName;
    for (const [id, values, selectedValue, label] of [
      ['result-console', new Map(data().results.filter(x => !project || projectKey(x) === project).map(x => [consoleKey(x), consoleName(x)])), consoleFilter, 'All consoles']
    ]) {
      const select = document.getElementById(id);
      if (select && select !== document.activeElement) {
        if (selectedValue && !values.has(selectedValue)) values.set(selectedValue, select.selectedOptions[0]?.textContent || selectedValue);
        select.innerHTML = `<option value="">${label}</option>` + [...values].map(([value, text]) => `<option value="${e(value)}" ${value === selectedValue ? 'selected' : ''}>${e(text)}</option>`).join('');
      }
    }
    resultPage = Math.min(resultPage, Math.max(0, Math.ceil(resultPages().length / 12) - 1));
    const pager = document.querySelector('.result-pagination'); if (pager) { pager.hidden = showingFolders() || resultPages().length <= 12; pager.innerHTML = pager.hidden ? '' : pagination(); }
    const grid = document.querySelector('.results-grid'); if (grid) { grid.innerHTML = resultContent(); loadImages(grid); }
    for (const id of ['result-console', 'result-kind']) { const node = document.getElementById(id); if (node) node.hidden = showingFolders(); }
    refreshBulkActions();
  }
  function refreshBulkActions() {
    const controls = document.querySelector('.result-bulk-actions');
    if (controls) { controls.hidden = showingFolders() || !filtered().length; controls.innerHTML = controls.hidden ? '' : bulkActions(); }
  }
  async function remove(ids) {
    const result = await api('results.delete', ids);
    for (const id of result.deleted) { selected.delete(id); previews.delete(id); }
    if (result.failed.length) toast(`${result.failed.length} files could not be deleted. Try again.`,true);
    if (getPage() === 'results') renderPage();
  }
  document.addEventListener('input', event => {
    if (event.target.id === 'result-search') { filter = event.target.value; resultPage = 0; selected.clear(); if (showingFolders()) { kind = ''; consoleFilter = ''; if (dialog.open) dialog.close(); } refreshGallery(); }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'result-kind') { kind = event.target.value; resultPage = 0; refreshGallery(); }
    if (event.target.id === 'result-console') { consoleFilter = event.target.value; resultPage = 0; refreshGallery(); }
    if (event.target.dataset.resultSelect) { event.target.checked ? selected.add(event.target.dataset.resultSelect) : selected.delete(event.target.dataset.resultSelect); refreshBulkActions(); }
  });
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-wb]'); if (!target) return;
    const action = target.dataset.wb, id = target.dataset.id; target.disabled = true;
    try {
      if (action === 'project-folder' || action === 'back-results') {
        folderName = folders().find(x => x.key === id)?.name || '';
        project = action === 'project-folder' ? id : ''; filter = ''; kind = ''; consoleFilter = ''; resultPage = 0; selected.clear();
        detail = null; ++modalVersion;
        if (dialog.open) dialog.close();
        document.body.append(dialog); dialog.classList.remove('result-inline-preview'); previewOpener = null;
        renderPage(); document.querySelector(project ? '[data-wb="back-results"]' : '#result-search')?.focus();
      }
      if (action === 'previous-results') { resultPage = Math.max(0,resultPage-1); refreshGallery(); }
      if (action === 'next-results') { resultPage++; refreshGallery(); }
      if (action === 'close') { detail = null; ++modalVersion; dialog.close(); }
      if (action === 'preview') await preview(id);
      if (['previous-image','next-image','gallery-image'].includes(action)) await switchImage(id, action);
      if (action === 'archive-entry') await preview(id, Number(target.dataset.entry));
      if (action === 'import') { const result = await api('results.import'); if (result.errors.length) toast(result.errors.join('\n'),true); renderPage(); }
      if (action === 'export') await api('results.export',id);
      if (action === 'folder') await api('results.folder');
      if (action === 'seen-batch') await api('results.seen',batch(id).map(x => x.id));
      if (action === 'seen-all') await api('results.seen',filtered().map(x => x.id));
      if (action === 'delete-batch') await remove(batch(id).map(x => x.id));
      if (action === 'select-all') { for (const x of visible()) selected.add(x.id); refreshGallery(); }
      if (action === 'delete-selected') await remove([...selected]);
      if (action === 'delete-one') { const next = batch(id).find(x => x.image && x.id !== id); await remove([id]); if (!data().results.some(x=>x.id===id)) { if (next) await preview(next.id); else dialog.close(); } }
      if (action === 'concept-resume') { await api('concept.resume',id); toast('Resuming the saved Meshy task.'); }
      if (action === 'concept-delete') await api('concept.delete',id);
    } catch (error) { toast(error.message,true); }
    finally { if (target.isConnected) target.disabled = false; }
  });
  dialog.addEventListener('close',()=>{
    if (pendingPreviewMoves) { --pendingPreviewMoves; return; }
    detail=null; ++modalVersion;
    const panel = dialog.closest('.result-side-panel'); if (panel) panel.hidden = true;
    document.body.append(dialog);
    dialog.classList.remove('result-inline-preview');
    if (previewOpener?.isConnected) previewOpener.focus({ preventScroll: true });
    previewOpener = null;
  });
  // A non-modal desktop preview needs the same Escape behavior as the dialog.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dialog.open && dialog.classList.contains('result-inline-preview') && !document.querySelector('dialog[open]:modal')) {
      event.preventDefault(); dialog.close();
    }
  });
  wideResults.addEventListener('change', () => {
    if (detail?.type === 'result' && dialog.open && getPage() === 'results') preview(detail.id, detail.entry).catch(error => toast(error.message, true));
  });
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
    if (!item) { navigate('results'); return; }
    if (['usage', 'tools', 'projects'].includes(item.destination)) { navigate(item.destination); return; }
    const result = data().results.find(x => x.id === item.resultId) ||
      (item.reviewId && data().results.find(x => x.reviewId === item.reviewId || x.groupId === item.reviewId));
    const resultDestination = item.destination === 'results' || item.resultId || item.reviewId || item.turnId || item.kind === 'ready';
    // A turn that only replied in text has its answer in the console, not in Results.
    const textOnly = !result && !item.resultId && !item.reviewId && getState().sessions.some(x => x.id === item.sessionId && x.alive);
    if (resultDestination && textOnly) { await selectSession(item.sessionId); toast('This prompt saved no files. Its reply is in this console.'); }
    else if (resultDestination) {
      filter = ''; kind = ''; project = result ? projectKey(result) : ''; folderName = result ? projectName(result) : ''; consoleFilter = '';
      resultPage = result ? Math.max(0, Math.floor(resultGroups(filtered()).findIndex(group => group.some(x => x.id === result.id)) / 12)) : 0;
      navigate('results');
      if (result) await preview(result.id);
      else toast(item.resultId || item.reviewId ? 'These results are no longer available.' : 'No results were saved for this prompt.');
    }
    else if (getState().sessions.some(x => x.id === item.sessionId)) await selectSession(item.sessionId);
    else { navigate('results'); toast('This console or result is no longer available.'); }
  }
  return {
    openNotice,
    openResult: preview,
    render: page => page === 'results' ? gallery() : '',
    mount: () => {
      loadImages();
      // Rendering the page replaces its aside; keep the existing viewer alive.
      if (dialog.classList.contains('result-inline-preview')) {
        if (getPage() === 'results' && detail?.type === 'result') preview(detail.id, detail.entry).catch(error => toast(error.message, true));
        else { detail = null; ++modalVersion; dialog.close(); document.body.append(dialog); }
      }
    },
    sync() {
      const d = data(), next = JSON.stringify([d, getState().projects]);
      const count = d.unreadResults ?? new Set(d.results.filter(x => !x.seenAt).map(groupKey)).size;
      const resultBadge = document.querySelector('#results-count');
      if (resultBadge) { resultBadge.textContent = count || ''; resultBadge.hidden = !count; resultBadge.closest('button').classList.toggle('has-new-results', !!count); resultBadge.closest('button').setAttribute('aria-label', count ? `Results, ${count} new ${count === 1 ? 'batch' : 'batches'}` : 'Results'); }
      const shortcut = document.querySelector('#results-shortcut');
      if (shortcut) { shortcut.hidden = !count; shortcut.querySelector('.notification-badge').textContent = count; shortcut.setAttribute('aria-label', `Results, ${count} new ${count === 1 ? 'batch' : 'batches'}`); }
      if (next === stamp) return; stamp = next;
      for (const id of selected) if (!d.results.some(x=>x.id===id)) selected.delete(id);
      for (const id of previews.keys()) if (!d.results.some(x=>x.id===id)) previews.delete(id);
      if (detail?.type === 'result' && !d.results.some(x => x.id === detail.id)) { detail = null; ++modalVersion; dialog.close(); }
      if (getPage() === 'results') refreshGallery();
    }
  };
}
