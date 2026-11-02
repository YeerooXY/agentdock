// Keyed in-place patching. patchChildren(root, html) turns root's children into
// the markup in html while keeping live nodes where it can, so focus, typed
// values, selection, IME composition, scroll, <details> state and open selects
// survive a rerender. A control that has to go hands focus to its successor.

const KEY_ATTRIBUTES = ['id', 'data-key', 'data-id', 'data-usage-account-id', 'data-task-id', 'data-project-id'];
const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
const KEEP = '.page-background-layer,[data-patch-keep]';
// Attributes that hold user-owned state. They are left alone on live nodes.
const USER_STATE = { DETAILS: ['open'], DIALOG: ['open'] };

function keyOf(node) {
  if (node.nodeType !== 1) return null;
  for (const name of KEY_ATTRIBUTES) { const value = node.getAttribute(name); if (value) return `${node.localName}|${name}|${value}`; }
  return null;
}
const kept = node => node.nodeType === 1 && node.matches(KEEP);
const focusable = node => node.matches(FOCUSABLE) && !node.disabled && !node.closest('[hidden],[inert]');
const isFocused = node => node.ownerDocument.activeElement === node;

function syncAttributes(from, to) {
  const skip = USER_STATE[from.tagName] || [];
  for (const { name, value } of [...to.attributes]) {
    if (!skip.includes(name) && from.getAttribute(name) !== value) from.setAttribute(name, value);
  }
  for (const { name } of [...from.attributes]) if (!to.hasAttribute(name) && !skip.includes(name)) from.removeAttribute(name);
}

function setValue(control, value) {
  if (isFocused(control) && control.composing) return;
  const keep = isFocused(control) ? [control.selectionStart, control.selectionEnd] : null;
  control.value = value;
  if (keep && keep[0] != null) try { control.setSelectionRange(Math.min(keep[0], value.length), Math.min(keep[1], value.length)); } catch { /* not a text control */ }
}
// What the markup said before this patch. A control keeps what the user did to
// it unless the markup itself changed.
function snapshotControl(node) {
  if (node.tagName === 'INPUT') return { checked: node.hasAttribute('checked'), value: node.getAttribute('value') };
  if (node.tagName === 'TEXTAREA') return { text: node.defaultValue };
  if (node.tagName === 'SELECT') return { selected: ([...node.options].find(option => option.hasAttribute('selected')) || node.options[0])?.value };
  return null;
}
function syncControl(from, to, before) {
  if (!before) return;
  if (from.tagName === 'INPUT') {
    if (from.type === 'checkbox' || from.type === 'radio') {
      const next = to.hasAttribute('checked');
      if (before.checked !== next && from.checked !== next) from.checked = next;
    } else if (from.type !== 'file') {
      const next = to.getAttribute('value') ?? '';
      if (before.value !== to.getAttribute('value') && from.value !== next) setValue(from, next);
    }
  } else if (from.tagName === 'TEXTAREA') {
    if (before.text !== to.textContent && from.value !== to.textContent) setValue(from, to.textContent);
  } else if (from.tagName === 'SELECT') {
    const next = ([...to.options].find(option => option.hasAttribute('selected')) || to.options[0])?.value;
    if (before.selected !== next && next !== undefined && from.value !== next) from.value = next;
  }
}

function morph(from, to) {
  if (from.nodeType !== 1) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; return; }
  const before = snapshotControl(from);
  syncAttributes(from, to);
  if (from.tagName === 'TEXTAREA') { if (from.defaultValue !== to.textContent) from.defaultValue = to.textContent; }
  else morphChildren(from, to);
  syncControl(from, to, before);
}

const sameKind = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || a.localName === b.localName);

function morphChildren(parent, template) {
  const keyed = new Map(), pool = [];
  for (const child of parent.childNodes) {
    if (kept(child)) continue;
    const key = keyOf(child);
    if (key && !keyed.has(key)) keyed.set(key, child); else pool.push(child);
  }
  const used = new Set();
  let cursor = parent.firstChild;
  const slot = () => { while (cursor && kept(cursor)) cursor = cursor.nextSibling; return cursor; };
  for (const wanted of [...template.childNodes]) {
    const key = keyOf(wanted), at = slot();
    let match = null;
    if (key) { const candidate = keyed.get(key); if (candidate && !used.has(candidate)) match = candidate; }
    else if (at && !used.has(at) && !keyOf(at) && sameKind(at, wanted)) match = at;
    else match = pool.find(candidate => !used.has(candidate) && sameKind(candidate, wanted)) || null;
    if (match) {
      used.add(match);
      if (match !== at) parent.insertBefore(match, at);
      morph(match, wanted);
      cursor = match.nextSibling;
    } else {
      const node = wanted.cloneNode(true);
      used.add(node);
      parent.insertBefore(node, at);
      cursor = at;
    }
  }
  for (const child of [...parent.childNodes]) if (!used.has(child) && !kept(child)) child.remove();
}

function describe(node) {
  return { key: keyOf(node), id: node.id || null, name: node.getAttribute('name'), form: node.form?.id || null };
}
function findSame(root, info) {
  if (info.id) { const hit = root.querySelector(`#${CSS.escape(info.id)}`); if (hit) return hit; }
  if (info.key) {
    const [tag, attribute, value] = info.key.split('|');
    const hit = [...root.querySelectorAll(tag)].find(node => node.getAttribute(attribute) === value);
    if (hit) return hit;
  }
  if (info.name) {
    const scope = info.form ? root.querySelector(`#${CSS.escape(info.form)}`) : root;
    return scope?.querySelector(`[name="${CSS.escape(info.name)}"]`) || null;
  }
  return null;
}

export function patchChildren(root, html) {
  const doc = root.ownerDocument, current = doc.activeElement;
  const active = current && current !== root && root.contains(current) ? current : null;
  const order = active ? [...root.querySelectorAll(FOCUSABLE)].filter(focusable) : [];
  const position = order.indexOf(active), info = active ? describe(active) : null;
  let caret = null;
  if (active) try { caret = [active.selectionStart, active.selectionEnd, active.selectionDirection]; } catch { /* not a text control */ }
  const scrolls = [...root.querySelectorAll('*')].filter(node => node.scrollTop || node.scrollLeft).map(node => [node, node.scrollTop, node.scrollLeft]);

  const template = doc.createElement('template');
  template.innerHTML = html;
  morphChildren(root, template.content);

  for (const [node, top, left] of scrolls) if (node.isConnected) { if (node.scrollTop !== top) node.scrollTop = top; if (node.scrollLeft !== left) node.scrollLeft = left; }
  if (!active) return;
  if (active.isConnected && focusable(active)) {
    if (!isFocused(active)) {
      active.focus({ preventScroll: true });
      if (caret?.[0] != null) try { active.setSelectionRange(caret[0], caret[1], caret[2]); } catch { /* not a text control */ }
    }
    return;
  }
  // Gone or disabled: the same control by id, key or name; else the next focusable in order, else the previous.
  let target = findSame(root, info);
  if (target && !focusable(target)) target = null;
  if (!target && position >= 0) {
    const now = new Set([...root.querySelectorAll(FOCUSABLE)].filter(focusable));
    const live = node => node.isConnected && now.has(node);
    target = order.slice(position + 1).find(live) || order.slice(0, position).reverse().find(live) || null;
  }
  target ||= [...root.querySelectorAll(FOCUSABLE)].find(focusable) || null;
  if (target) target.focus({ preventScroll: true });
  else { root.tabIndex = -1; root.focus({ preventScroll: true }); }
}
