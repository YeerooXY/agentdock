'use strict';

const statuses = ['Not seen', 'Looks good', 'Needs work', 'Cut'];
const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const themeNames = { classic: 'Classic', icy: 'Arctic', blue: 'Blue', 'hot-pink': 'Hot pink', violet: 'Violet', void: 'Void', redline: 'Redline', cyber: 'Cyber', fiery: 'Inferno', gamer: 'RGB', normal: 'Plain' };
const profileNames = { pc: 'PC', mac: 'Mac (Safari engine)', narrow: 'Narrow desktop' };

function plainFinding(finding) {
  if (finding.startsWith('Could not finish this case:')) return 'This case could not be completed. Review the available image and rerun the case.';
  if (finding.startsWith('Evidence capture failed:')) return 'The screenshot or screen measurements could not be saved.';
  if (finding.startsWith('Browser profile unavailable:')) return 'This browser could not start. No screen was checked.';
  if (finding.startsWith('Missing fixture response:')) return 'The test data is missing a response needed by this screen.';
  if (finding.startsWith('Page error:')) return 'The screen reported an error.';
  if (finding.startsWith('Browser cleanup failed:')) return 'The browser did not close cleanly after this case.';
  if (finding === 'Not run') return 'This case has not run.';
  return finding;
}

function runCard(run, item, test) {
  const theme = themeNames[run.effectiveTheme || run.theme] || run.effectiveTheme || run.theme;
  const label = `${profileNames[run.profile] || run.profile} / ${theme}` + (run.effectiveTheme && run.effectiveTheme !== run.theme ? ` (started in ${themeNames[run.theme] || run.theme})` : '');
  const findings = [...(run.findings || [])];
  if (run.status !== 'captured' && !findings.length) findings.push('This case could not be completed.');
  const unique = [...new Set(findings.map(plainFinding))];
  const technical = findings.filter(finding => plainFinding(finding) !== finding && finding !== 'Not run');
  // Evidence links stay inside this report's images folder, including when rendering an older JSON report.
  const image = typeof run.screenshot === 'string' && /^images\/[a-z0-9][a-z0-9._-]*\.jpg$/i.test(run.screenshot) ? run.screenshot : null;
  const alt = `${item.id} ${item.title}: ${test.label}, ${label}`;
  return `<figure class="run${findings.length ? ' has-findings' : ''}">
    <figcaption>${html(label)}${run.status !== 'captured' ? '<span class="warning">Incomplete case</span>' : ''}</figcaption>
    ${image ? `<a class="thumbnail" href="${html(image)}" target="_blank" rel="noopener" aria-label="${html('Open full-size image: ' + alt)}"><img src="${html(image)}" loading="lazy" decoding="async" alt="${html(alt)}" width="${Number(run.viewport?.width) || 1440}" height="${Number(run.viewport?.height) || 1000}"><span>Open full size</span></a>` : '<p class="no-image">No screenshot available.</p>'}
    ${findings.length ? `<ul class="findings">${unique.map(finding => `<li>⚠ ${html(finding)}</li>`).join('')}</ul>` : '<p class="passed">✓ No automated findings</p>'}
    ${technical.length ? `<details><summary>Technical details</summary><pre>${html(technical.join('\n\n'))}</pre></details>` : ''}
  </figure>`;
}

// This function is embedded verbatim in the generated file. It uses only DOM,
// localStorage and a local download; the page performs no external requests.
function reviewPage() {
  'use strict';
  const data = JSON.parse(document.getElementById('review-data').textContent);
  const allowed = ['Not seen', 'Looks good', 'Needs work', 'Cut'];
  const reviews = new Map();
  const sections = [...document.querySelectorAll('[data-item-id]')];
  const storageNotice = document.getElementById('storage-notice');
  const filters = document.getElementById('filters');
  const viewer = document.getElementById('image-viewer');
  const fullImage = document.getElementById('full-image');
  let activeFilter = 'All';
  let storageFailed = false;
  let imageOpener = null;
  const key = id => 'paddock-release-check:' + id;

  function storageError() {
    storageFailed = true;
    storageNotice.textContent = 'Browser storage is unavailable. Export notes before closing this page.';
    storageNotice.classList.add('warning');
  }
  function read(id) {
    const fallback = { status: 'Not seen', notes: '' };
    try {
      const value = JSON.parse(localStorage.getItem(key(id)) || 'null');
      if (!value || typeof value !== 'object') return fallback;
      return { status: allowed.includes(value.status) ? value.status : fallback.status, notes: typeof value.notes === 'string' ? value.notes : '' };
    } catch { storageError(); return fallback; }
  }
  function save(id) {
    try {
      localStorage.setItem(key(id), JSON.stringify(reviews.get(id)));
      const saved = 'Saved in this browser. Export notes to keep a separate copy.';
      if (!storageFailed && storageNotice.textContent !== saved) storageNotice.textContent = saved;
    } catch { storageError(); }
  }
  function refresh() {
    let reviewed = 0, shown = 0;
    for (const section of sections) {
      const value = reviews.get(section.dataset.itemId);
      if (value.status !== 'Not seen') reviewed++;
      for (const button of section.querySelectorAll('[data-status]')) button.setAttribute('aria-pressed', String(button.dataset.status === value.status));
      const visible = activeFilter === 'All' || (activeFilter === 'Has findings' ? section.dataset.findings === 'true' : value.status === activeFilter);
      section.hidden = !visible;
      if (visible) shown++;
    }
    document.getElementById('review-progress').value = reviewed;
    document.getElementById('progress-label').textContent = reviewed + ' of ' + data.items.length + ' reviewed';
    document.getElementById('shown-count').textContent = shown + ' of ' + data.items.length + ' items shown';
    document.getElementById('empty-filter').hidden = shown !== 0;
    for (const button of filters.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.filter === activeFilter));
    // A status change may remove the focused item from the current filter.
    if (document.activeElement?.closest('[data-item-id][hidden]')) filters.querySelector('[aria-pressed="true"]').focus();
  }

  for (const section of sections) {
    const id = section.dataset.itemId;
    const value = read(id);
    reviews.set(id, value);
    const notes = section.querySelector('textarea');
    notes.value = value.notes;
    notes.disabled = false;
    notes.addEventListener('input', () => { reviews.get(id).notes = notes.value; save(id); });
    for (const button of section.querySelectorAll('[data-status]')) {
      button.disabled = false;
      button.addEventListener('click', () => { reviews.get(id).status = button.dataset.status; save(id); refresh(); });
    }
  }
  for (const button of filters.querySelectorAll('button')) {
    button.disabled = false;
    button.addEventListener('click', () => { activeFilter = button.dataset.filter; refresh(); });
  }
  const exportButton = document.getElementById('export-notes');
  exportButton.disabled = false;
  exportButton.addEventListener('click', () => {
    const lines = ['# Paddock release review notes', '', 'Evidence created: ' + data.startedAt, 'Exported: ' + new Date().toISOString(), ''];
    for (const item of data.items) {
      const value = reviews.get(item.id);
      lines.push('## ' + item.id + ' ' + item.title, '', 'Status: ' + value.status, '', 'Notes:', '', value.notes, '');
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }));
    const download = document.createElement('a');
    download.href = url;
    download.download = 'paddock-release-notes-' + new Date().toISOString().slice(0, 10) + '.md';
    document.body.append(download); download.click(); download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.addEventListener('click', event => {
    const link = event.target.closest('a.thumbnail');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || typeof viewer.showModal !== 'function') return;
    event.preventDefault(); imageOpener = link;
    document.getElementById('image-title').textContent = link.querySelector('img').alt;
    document.getElementById('image-error').hidden = true;
    fullImage.alt = link.querySelector('img').alt;
    fullImage.src = link.getAttribute('href');
    document.getElementById('open-image').href = link.getAttribute('href');
    viewer.showModal();
    document.getElementById('close-image').focus();
    const scroller = viewer.querySelector('.image-scroll'); scroller.scrollTop = 0; scroller.scrollLeft = 0;
  });
  document.getElementById('close-image').addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', event => { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener('close', () => { fullImage.removeAttribute('src'); imageOpener?.focus(); });
  fullImage.addEventListener('error', () => { if (viewer.open) document.getElementById('image-error').hidden = false; });
  document.addEventListener('error', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.closest('.thumbnail')) return;
    img.alt = 'Screenshot unavailable. Keep the images folder next to checklist.html.';
  }, true);
  refresh();
}

function renderChecklistHtml(report, selected) {
  const groups = new Map();
  for (const run of report.runs) {
    const key = `${run.itemId}/${run.caseId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run);
  }
  const sections = selected.map(item => {
    const hasFindings = item.cases.some(test => (groups.get(`${item.id}/${test.id}`) || []).some(run => !run.manual && (run.findings?.length || run.status !== 'captured')));
    const cases = item.cases.map(test => {
      const runs = groups.get(`${item.id}/${test.id}`) || [];
      const manualReasons = [...new Set([...(test.manual ? [test.reason] : []), ...runs.filter(run => run.manual).map(run => run.reason)].filter(Boolean))];
      return `<section class="case" aria-labelledby="case-${html(item.id)}-${html(test.id)}">
        <h3 id="case-${html(item.id)}-${html(test.id)}">${html(test.label)}</h3>
        ${manualReasons.map(reason => `<p class="manual"><strong>Manual check:</strong> ${html(reason)}</p>`).join('')}
        ${runs.some(run => !run.manual) ? `<div class="runs">${runs.filter(run => !run.manual).map(run => runCard(run, item, test)).join('')}</div>` : manualReasons.length ? '' : '<p class="warning">No run recorded for this case.</p>'}
      </section>`;
    }).join('');
    return `<section class="item" data-item-id="${html(item.id)}" data-findings="${!!hasFindings}" aria-labelledby="item-${html(item.id)}">
      <h2 id="item-${html(item.id)}">${html(item.id)} ${html(item.title)}</h2>
      <p class="description">${html(item.description)}</p>
      <div class="review-controls">
        <div class="status-buttons" role="group" aria-label="${html(item.id + ' ' + item.title + ' status')}">${statuses.map(status => `<button type="button" data-status="${html(status)}" aria-pressed="${status === 'Not seen'}" disabled>${html(status)}</button>`).join('')}</div>
        <label for="notes-${html(item.id)}">Notes</label><textarea id="notes-${html(item.id)}" rows="3" disabled></textarea>
      </div>
      ${cases}
    </section>`;
  }).join('');
  const data = JSON.stringify({ startedAt: report.startedAt, items: selected.map(({ id, title }) => ({ id, title })) }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Paddock release review</title>
<style>
  :root{color-scheme:dark;--bg:#10131a;--surface:#191f2b;--raised:#232c3c;--text:#f1f4fa;--muted:#b8c4d9;--border:#52617b;--accent:#abd3ff;--warning:#ffdc9a;--success:#b6edc9}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}main,header,footer{width:min(1280px,100%);margin:auto;padding:24px}h1{font-size:1.8rem;margin:0 0 8px}h2{font-size:1.4rem;margin:0 0 8px}h3{font-size:1.1rem;margin:0 0 14px}p{margin:8px 0 16px}a{color:var(--accent)}button,textarea{font:inherit}button{min-height:44px;border:1px solid var(--border);border-radius:7px;background:var(--raised);color:var(--text);padding:8px 13px;cursor:pointer}button:hover{border-color:var(--accent)}button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#102137;font-weight:650}button:disabled,textarea:disabled{opacity:.6;cursor:default}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
  .toolbar{background:var(--surface);border-block:1px solid var(--border)}.toolbar-inner{max-width:1280px;margin:auto;padding:16px 24px}.progress-row{display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin-bottom:16px}.progress-wrap{flex:1;min-width:180px}#progress-label{display:block;font-weight:650;margin-bottom:6px}progress{display:block;width:100%;height:13px;accent-color:var(--accent)}.filters,.status-buttons{display:flex;flex-wrap:wrap;gap:8px}.muted,.description,#shown-count,#storage-notice{color:var(--muted)}#storage-notice{font-size:.9rem;margin-bottom:0}#shown-count{margin:12px 0 0}.item{border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:24px;margin-bottom:32px;overflow-wrap:anywhere}.review-controls{margin:20px 0 28px}.review-controls label{display:block;margin:14px 0 6px;font-weight:600}textarea{display:block;width:100%;min-height:88px;resize:vertical;background:var(--bg);border:1px solid var(--border);border-radius:7px;color:var(--text);padding:12px}.case{border-top:1px solid var(--border);padding-top:20px;margin-top:24px}.runs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px}.run{margin:0;min-width:0;border:1px solid var(--border);border-radius:8px;background:var(--bg);padding:12px}figcaption{font-weight:600;min-height:2.5em;margin-bottom:8px}.warning{color:var(--warning)}figcaption .warning{display:block;font-size:.9rem}.passed{color:var(--success);margin:12px 0 0}.thumbnail{display:block;text-decoration:none;border:1px solid var(--border);border-radius:5px;overflow:hidden;background:#0b0d12}.thumbnail img{display:block;width:100%;height:auto;object-fit:contain}.thumbnail span{display:block;padding:6px 10px;font-size:.9rem}.findings{padding-left:22px;color:var(--warning);margin-bottom:0}.findings li+li{margin-top:8px}.manual{border-left:3px solid var(--warning);padding:10px 14px;background:var(--bg);color:var(--warning)}.no-image{padding:32px 12px;color:var(--muted)}summary{cursor:pointer;color:var(--muted);padding:10px 0}pre{font-size:.85rem;white-space:pre-wrap;overflow-wrap:anywhere;margin:0;max-height:300px;overflow:auto}details{margin-top:8px}[hidden]{display:none!important}
  dialog{width:min(96vw,1600px);max-width:none;max-height:94dvh;margin:auto;border:1px solid var(--border);border-radius:10px;padding:16px;background:var(--surface);color:var(--text)}dialog::backdrop{background:#000c}.viewer-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.viewer-heading h2{font-size:1.1rem}.viewer-heading button{flex:none}.image-scroll{overflow:auto;max-height:70dvh;background:var(--bg)}#full-image{display:block;width:auto;height:auto;max-width:none}footer{color:var(--muted);padding-top:0}
  @media(max-width:600px){main,header{padding:16px}.toolbar-inner{padding:16px}.item{padding:16px;margin-bottom:24px}.status-buttons button{flex:1 1 calc(50% - 8px)}.filters button{flex:1 1 auto}.progress-row{align-items:stretch}#export-notes{width:100%}dialog{padding:12px}.viewer-heading{gap:8px}}
</style></head><body>
<header><h1>Paddock release review</h1><p>Review the screenshots and manual checks, then set a status and add notes for each item.</p><p class="muted">Evidence created: ${html(report.startedAt)}. Mac uses the Safari engine. Screenshots show synthetic desktop data.</p><details><summary>How to review</summary><p>Click a thumbnail to inspect the full-size image. A ✓ means the automated checks found no issue. Check layout, wording and behavior yourself, and complete each manual check before choosing Looks good. Use Cut for an item you plan to remove.</p><p>Saved statuses and notes carry forward by item number in this browser. Recheck them when the evidence changes. Each walk replaces this folder; export notes and copy the images before rerunning.</p></details></header>
<div class="toolbar"><div class="toolbar-inner">
  <div class="progress-row"><div class="progress-wrap"><label id="progress-label" for="review-progress">0 of ${selected.length} reviewed</label><progress id="review-progress" max="${Math.max(1, selected.length)}" value="0"></progress></div><button type="button" id="export-notes" disabled>Export notes</button></div>
  <nav id="filters" class="filters" aria-label="Filter review items">${['All', 'Not seen', 'Needs work', 'Cut', 'Has findings'].map(filter => `<button type="button" data-filter="${html(filter)}" aria-pressed="${filter === 'All'}" disabled>${html(filter)}</button>`).join('')}</nav>
  <p id="shown-count" role="status">${selected.length} of ${selected.length} items shown</p><p id="storage-notice" role="status">Statuses and notes are saved in this browser. Export notes to keep a separate copy.</p>
</div></div>
<noscript><p class="manual">Enable JavaScript to save statuses and notes, filter items and export notes. Screenshot links still open.</p></noscript>
<main>${report.fatalError ? `<p class="manual"><strong>Walk stopped:</strong> ${html(report.fatalError)}</p>` : ''}<p id="empty-filter" hidden>No items match this filter.</p>${sections}</main>
<footer>Manual checks require the desktop app. Automated checks cover text contrast, button names, input labels, accessibility settings, screen errors and content wider than the window.</footer>
<dialog id="image-viewer" aria-labelledby="image-title"><div class="viewer-heading"><h2 id="image-title">Screenshot</h2><button id="close-image" type="button">Close image</button></div><p>Full size. Scroll to inspect. <a id="open-image" target="_blank" rel="noopener">Open image in a new tab</a></p><p id="image-error" class="warning" role="status" hidden>Image unavailable. Keep the images folder next to checklist.html.</p><div class="image-scroll" tabindex="0" role="region" aria-label="Full-size screenshot"><img id="full-image" alt=""></div></dialog>
<script type="application/json" id="review-data">${data}</script><script>(${reviewPage.toString()})();</script>
</body></html>\n`;
}

module.exports = { renderChecklistHtml };
