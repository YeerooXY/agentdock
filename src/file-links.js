import { renderMarkdown } from './markdown.js';

// Windows absolute paths (quoted ones may contain spaces), UNC paths, ~/ paths
// and relative paths that end in a file extension, with an optional :line.
const PATH = /"(?:[a-zA-Z]:[\\/]|\\\\)[^"\r\n]+"|(?<![\w/])(?:[a-zA-Z]:[\\/]|\\\\|~[\\/])[^\s"'<>|*?`]+|(?<![\w:/\\.-])(?:\.{1,2}[\\/])?(?:[\w@.-]+[\\/])*[\w@-][\w@.-]*\.[a-zA-Z][\w]{0,7}(?::\d+(?::\d+)?)?(?![\w/\\])/g;
const TRAILING = /[),.;:'"`\]]+$/;

// Finds file paths in the logical line around buffer row y, joining wrapped rows.
export function findPaths(term, y) {
  const buffer = term.buffer.active, cols = term.cols;
  let start = y - 1, end = y - 1;
  while (start > 0 && buffer.getLine(start)?.isWrapped) start--;
  while (buffer.getLine(end + 1)?.isWrapped) end++;
  let text = '';
  for (let row = start; row <= end; row++) text += buffer.getLine(row)?.translateToString(row === end) || '';
  const links = [];
  for (const match of text.matchAll(PATH)) {
    let value = match[0];
    if (/[a-z][\w+.-]*:\/\/\S*$/i.test(text.slice(0, match.index))) continue;
    if (!value.startsWith('"')) value = value.replace(TRAILING, '');
    if (value.length < 4 || /^\d+(\.\d+)+$/.test(value)) continue;
    const from = match.index, to = match.index + value.length - 1;
    const point = index => ({ x: index % cols + 1, y: start + Math.floor(index / cols) + 1 });
    const range = { start: point(from), end: point(to) };
    if (range.start.y > y || range.end.y < y) continue;
    links.push({ value, range });
  }
  return links;
}

export function fileLinks(term, open) {
  term.registerLinkProvider({ provideLinks(y, callback) {
    const links = findPaths(term, y).map(link => ({ range: link.range, text: link.value, decorations: { underline: true, pointerCursor: true }, activate: event => { if (!event || event.button === 0) open(link.value); } }));
    callback(links.length ? links : undefined);
  } });
}

const size = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export function filePreviewDialog({ call, toast, icon }) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="file-preview" class="file-preview" aria-labelledby="file-preview-title">
    <div class="dialog-heading"><div><h2 id="file-preview-title"></h2><p class="file-preview-path"></p></div><button type="button" class="icon-button" data-file-action="close" aria-label="Close preview">${icon('close')}</button></div>
    <div class="file-preview-body" tabindex="0" aria-label="File contents"></div>
    <div class="file-preview-actions"><button type="button" class="secondary" data-file-action="copy">Copy path</button><button type="button" class="secondary" data-file-action="reveal">Show in folder</button><button type="button" class="primary" data-file-action="open">Open in default app</button></div>
  </dialog>`);
  const dialog = document.querySelector('#file-preview'), body = dialog.querySelector('.file-preview-body');
  let current = null, returnFocus = null;
  dialog.addEventListener('close', () => { body.replaceChildren(); returnFocus?.focus?.(); });
  dialog.addEventListener('click', async event => {
    if (event.target === dialog) { dialog.close(); return; }
    const action = event.target.closest('[data-file-action]')?.dataset.fileAction; if (!action) return;
    try {
      if (action === 'close') dialog.close();
      else if (action === 'copy') { await navigator.clipboard.writeText(current.path).catch(() => { throw new Error('Could not copy the path.'); }); toast('Path copied.'); }
      else await call(action === 'open' || current.kind === 'folder' ? 'file.open' : 'file.reveal', { path: current.path });
    } catch (error) { toast(error.message, true); }
  });
  return async function openFile(id, value) {
    returnFocus = document.activeElement;
    let file;
    try { file = await call('file.preview', { id, path: value }); }
    catch (error) { toast(error.message, true); return; }
    current = file;
    dialog.querySelector('#file-preview-title').textContent = file.name;
    dialog.querySelector('.file-preview-path').textContent = `${file.path}${file.kind === 'folder' ? '' : ' · ' + size(file.size)}`;
    body.replaceChildren(); body.className = 'file-preview-body ' + file.kind;
    if (file.kind === 'image') { const img = document.createElement('img'); img.src = file.data; img.alt = `Preview of ${file.name}`; body.append(img); }
    else if (file.kind === 'markdown') body.innerHTML = `<div class="markdown">${renderMarkdown(file.text)}</div>`;
    else if (file.kind === 'text') { const pre = document.createElement('pre'); pre.textContent = file.text; body.append(pre); }
    else { const p = document.createElement('p'); p.className = 'file-preview-note'; p.textContent = file.kind === 'folder' ? 'This is a folder. Show it in File Explorer.' : file.kind === 'large' ? 'This image is too large to preview here.' : 'This file type cannot be shown as text. Open it in its default app.'; body.append(p); }
    if (file.truncated) body.insertAdjacentHTML('beforeend', '<p class="file-preview-note">Showing the first 256 KB.</p>');
    dialog.querySelector('[data-file-action="open"]').hidden = file.kind === 'folder';
    dialog.querySelector('[data-file-action="reveal"]').textContent = file.kind === 'folder' ? 'Open folder' : 'Show in folder';
    if (!dialog.open) dialog.showModal();
    body.focus();
  };
}
