import { imageGeometry } from './image-viewer-geometry.js';

export function workbenchUI({ call, getState, escape: e, toast, selectSession, navigate }) {
  const api = (method, value) => call('workbench.' + method, value);
  const previews = new Map();
  let detail = null, modalVersion = 0;
  const data = () => getState()?.workbench || { results: [], concepts: [] };
  const date = at => new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const button = (action, label, id = '', cls = 'subtle', disabled = false) => `<button ${disabled ? 'disabled' : ''} class="${cls}" data-wb="${action}" data-id="${e(id)}">${label}</button>`;
  const consoleName = x => x.consoleName || getState().sessions.find(s => s.id === x.sessionId)?.name || (x.sessionId ? 'Earlier console' : x.source === 'Agent' ? 'API' : x.source || 'Dock');
  const dialog = document.createElement('dialog'); dialog.className = 'wb-dialog'; dialog.setAttribute('aria-label','Image preview'); document.body.append(dialog);
  let previewOpener = null, previewOpenerKey = null;
  let imageZoom = 'fit', imagePan = { x: 0, y: 0 }, imageDrag = null;
  const imageItems = id => { const item = data().results.find(x => x.id === id); return item ? data().results.filter(x => x.image && (x.reviewId || x.groupId) === (item.reviewId || item.groupId)).sort((a,b) => a.at-b.at || a.id.localeCompare(b.id)) : []; };
  function layoutImage() {
    const stage = dialog.querySelector('#result-preview'), img = stage?.querySelector('.result-full-image');
    if (!img?.naturalWidth || !stage.clientWidth || !stage.clientHeight) return;
    const size = imageGeometry(img.naturalWidth, img.naturalHeight, stage.clientWidth, stage.clientHeight, imageZoom, imagePan.x, imagePan.y);
    imagePan = { x: size.x, y: size.y };
    Object.assign(img.style, { width: `${size.width}px`, height: `${size.height}px`, transform: `translate(${size.x}px, ${size.y}px)` });
    stage.classList.toggle('can-pan', imageZoom === 'actual' && (size.width > stage.clientWidth || size.height > stage.clientHeight));
  }
  const imageResize = new ResizeObserver(() => layoutImage());
  function setImageZoom(zoom) {
    imageZoom = zoom; imagePan = { x: 0, y: 0 }; layoutImage();
    dialog.querySelector('[data-wb="image-fit"]')?.setAttribute('aria-pressed', String(zoom === 'fit'));
    dialog.querySelector('[data-wb="image-actual"]')?.setAttribute('aria-pressed', String(zoom === 'actual'));
  }
  function show(html) {
    dialog.innerHTML = `<div class="wb-dialog-top">${button('close','Close')}</div>${html}`;
    if (!dialog.open) dialog.showModal();
    loadImages(dialog);
  }
  async function preview(id) {
    const item = data().results.find(x => x.id === id && x.image);
    if (!item) throw new Error('This preview is no longer available.');
    if (!dialog.contains(document.activeElement)) { previewOpener = document.activeElement; previewOpenerKey = { id }; }
    return previewImage(item);
  }
  async function previewImage(item, focusAction = 'close') {
    const stripOpen = dialog.classList.contains('image-gallery') && !!dialog.querySelector('.image-filmstrip[open]');
    const detailsOpen = dialog.classList.contains('image-gallery') && !!dialog.querySelector('.image-details[open]');
    const id = item.id, version = ++modalVersion;
    detail = { type: 'result', id, entry: null }; imageZoom = 'fit'; imagePan = { x: 0, y: 0 }; imageDrag = null;
    dialog.classList.add('image-gallery');
    show(`<div id="result-preview" class="image-stage" tabindex="0" aria-label="Image viewer" aria-live="polite">Loading…</div><div id="image-navigation"></div><details class="image-details"><summary>Details</summary><div class="image-details-content"><h2>${e(item.title)}</h2><div class="result-detail-meta">${e(consoleName(item))}, ${e(item.status.replaceAll('-', ' '))}. ${date(item.at)}</div></div></details>`, false);
    updateImageNavigation(id);
    dialog.querySelector('.image-filmstrip').open = stripOpen;
    dialog.querySelector('.image-details').open = detailsOpen;
    const stage = dialog.querySelector('#result-preview'); imageResize.disconnect(); imageResize.observe(stage);
    (focusAction === 'gallery-image' && stripOpen ? dialog.querySelector('.result-filmstrip [aria-current=true]') : dialog.querySelector(`[data-wb="${focusAction}"]:not(:disabled)`))?.focus({ preventScroll: true });
    if (!dialog.contains(document.activeElement)) dialog.querySelector('[data-wb="close"]')?.focus({ preventScroll: true });
    const current = () => version === modalVersion && dialog.open && stage.isConnected && detail?.id === id;
    try {
      const content = await api('images.preview', { id, entry: null, original: true });
      if (!current()) return;
      if (!content?.image) throw new Error('Image unavailable.');
      const img = document.createElement('img'); img.className = 'result-full-image'; img.alt = item.title; img.draggable = false;
      stage.replaceChildren(img);
      const loaded = new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('Image unavailable.')); });
      img.src = content.image;
      await loaded;
      if (!current() || !img.isConnected) return;
      if (img.decode) await img.decode();
      if (!current() || !img.isConnected) return;
      if (!img.complete || !img.naturalWidth || !img.naturalHeight) throw new Error('Image unavailable.');
      layoutImage();
      if (!current()) return;
      const thumb = dialog.querySelector('.result-filmstrip [aria-current=true]');
      if (thumb) { const index = imageItems(id).findIndex(x => x.id === id); thumb.setAttribute('aria-label', `${index + 1}. ${item.title}, viewed`); thumb.querySelector('span').textContent = `${index + 1}. Viewed`; }
    } catch (error) {
      if (!current()) return;
      stage.innerHTML = `<div class="image-error"><p role="alert">Image unavailable.</p>${button('retry-image','Retry',id,'secondary')}</div>`;
      stage.querySelector('[data-wb="retry-image"]')?.focus({ preventScroll: true });
    }
  }
  function updateImageNavigation(id) {
    const node = dialog.querySelector('#image-navigation'); if (!node) return;
    const images = imageItems(id), index = images.findIndex(x => x.id === id);
    dialog.querySelector('.wb-dialog-top').insertAdjacentHTML('afterbegin', `<span role="status">${index+1} / ${images.length}: ${e(images[index]?.title || '')}</span>`);
    node.innerHTML = `<div class="result-image-pager"><button class="secondary" data-wb="previous-image" data-id="${e(images[index-1]?.id || '')}" aria-label="Previous picture" ${index <= 0 ? 'disabled' : ''}>Previous</button><button class="secondary" data-wb="next-image" data-id="${e(images[index+1]?.id || '')}" aria-label="Next picture" ${index >= images.length-1 ? 'disabled' : ''}>Next</button><button class="secondary" data-wb="image-fit" aria-pressed="true">Fit</button><button class="secondary" data-wb="image-actual" aria-pressed="false">100%</button></div><details class="image-filmstrip"><summary>Pictures</summary><nav class="result-filmstrip" aria-label="Pictures in this turn">${images.map((x,i) => `<button data-wb="gallery-image" data-id="${x.id}" aria-current="${id === x.id ? 'true' : 'false'}" aria-label="${i+1}. ${e(x.title)}, ${x.seenAt ? 'viewed' : 'not viewed'}"><img data-result-image="${x.id}" alt=""><span>${i+1}${x.seenAt ? '. Viewed' : ''}</span></button>`).join('')}</nav></details>`;
    loadImages(node);
    const strip = node.querySelector('.result-filmstrip'), current = node.querySelector('[aria-current=true]');
    if (strip && current) strip.scrollLeft = current.offsetLeft - strip.offsetLeft - (strip.clientWidth-current.clientWidth)/2;
  }
  async function switchImage(id, action) {
    const item = data().results.find(x => x.id === id); if (item?.image) await previewImage(item, action);
  }
  async function loadImages(parent = document) {
    for (const img of parent.querySelectorAll('img[data-result-image]:not([src])')) {
      if (!img.isConnected) continue;
      const id = img.dataset.resultImage;
      try { if (!previews.has(id)) { if (previews.size > 60) previews.delete(previews.keys().next().value); previews.set(id, api('images.preview',{ id, thumbnail:true })); } const result = await previews.get(id); if (img.isConnected) { if (result.image) img.src = result.image; else img.hidden = true; } }
      catch { previews.delete(id); img.alt = 'Preview unavailable'; }
    }
  }
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-wb]'); if (!target) return;
    const action = target.dataset.wb, id = target.dataset.id; target.disabled = true;
    try {
      if (action === 'close') { detail = null; ++modalVersion; dialog.close(); }
      if (action === 'preview') await preview(id);
      if (['previous-image','next-image','gallery-image'].includes(action)) await switchImage(id, action);
      if (action === 'retry-image') await switchImage(id, 'close');
      if (action === 'image-fit') setImageZoom('fit');
      if (action === 'image-actual') setImageZoom('actual');
      if (action === 'concept-resume') { await api('concept.resume',id); toast('Resuming the saved Meshy task.'); }
      if (action === 'concept-delete') await api('concept.delete',id);
    } catch (error) { toast(error.message,true); }
    finally { if (target.isConnected) target.disabled = false; }
  });
  dialog.addEventListener('close',()=>{
    detail=null; ++modalVersion;
    imageResize.disconnect(); imageDrag = null;
    document.body.append(dialog);
    const replacement = previewOpenerKey && [...document.querySelectorAll('[data-wb="preview"]')].find(node => node.dataset.id === previewOpenerKey.id && node.className === previewOpenerKey.className);
    const candidates = [previewOpener, replacement, document.querySelector('[data-page="tools"]')];
    for (const node of candidates) {
      if (!node?.isConnected || node.disabled || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') continue;
      node.focus({ preventScroll: true });
      if (document.activeElement === node && node !== document.body) break;
    }
    previewOpener = null; previewOpenerKey = null;
  });
  dialog.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key) || event.target.closest('input,textarea,select') || !dialog.classList.contains('image-gallery')) return;
    if (imageZoom === 'actual') { event.preventDefault(); imagePan.x += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0; imagePan.y += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0; layoutImage(); return; }
    if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
    const action = event.key === 'ArrowLeft' ? 'previous-image' : 'next-image', next = dialog.querySelector(`[data-wb="${action}"]:not(:disabled)`);
    if (next) { event.preventDefault(); switchImage(next.dataset.id, action).catch(error => toast(error.message, true)); }
  });
  dialog.addEventListener('dblclick', event => { if (event.target.closest('.image-stage') && dialog.querySelector('.result-full-image')) setImageZoom(imageZoom === 'fit' ? 'actual' : 'fit'); });
  dialog.addEventListener('pointerdown', event => {
    const stage = event.target.closest('.image-stage.can-pan'); if (!stage || event.button !== 0) return;
    imageDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: imagePan.x, panY: imagePan.y };
    stage.setPointerCapture(event.pointerId); event.preventDefault();
  });
  dialog.addEventListener('pointermove', event => { if (!imageDrag || imageDrag.pointerId !== event.pointerId) return; imagePan = { x: imageDrag.panX + event.clientX - imageDrag.x, y: imageDrag.panY + event.clientY - imageDrag.y }; layoutImage(); });
  dialog.addEventListener('pointerup', event => { if (imageDrag?.pointerId === event.pointerId) imageDrag = null; });
  dialog.addEventListener('pointercancel', () => { imageDrag = null; });
  dialog.addEventListener('toggle', event => {
    if (!event.target.matches('.image-filmstrip[open]')) return;
    const strip = event.target.querySelector('.result-filmstrip'), current = strip?.querySelector('[aria-current=true]');
    if (strip && current) strip.scrollLeft = current.offsetLeft - strip.offsetLeft - (strip.clientWidth-current.clientWidth)/2;
  }, true);
  async function openNotice(item) {
    if (!item) return;
    if (['usage', 'tools', 'projects'].includes(item.destination)) { navigate(item.destination); return; }
    const image = data().results.find(x => x.image && (x.id === item.resultId || item.reviewId && x.reviewId === item.reviewId));
    if (image) await preview(image.id);
    else if (getState().sessions.some(x => x.id === item.sessionId)) await selectSession(item.sessionId);
  }
  return {
    openNotice,
    openResult: preview,
    mount: () => loadImages(),
    sync() {
      const items = data().results;
      for (const id of previews.keys()) if (!items.some(x => x.id === id)) previews.delete(id);
      if (detail && !items.some(x => x.id === detail.id)) dialog.close();
    }
  };
}
