'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Passive, isolated activity reporting. Programmatic focus, terminal output and
// protocol replies never create an interaction. Send identities and flags only.
let ownerSessions = new Map(), trustedFocus = null;
const activity = new Map();
ipcRenderer.on('dock:state', (_, state) => {
  ownerSessions = new Map([...(state.sessions || []), ...(state.codePanels || [])].map(item => [item.id, item]));
  for (const id of activity.keys()) if (!ownerSessions.has(id)) activity.delete(id);
});
function ownerIdentity(id) {
  const item = ownerSessions.get(id);
  return item && { id, consoleKey: item.consoleKey, launchId: item.launchId || item.id };
}
function ownerSelection(card, target) {
  const selection = window.getSelection();
  return !!(selection?.toString() && card.contains?.(selection.anchorNode)) ||
    (typeof target.selectionStart === 'number' && target.selectionStart !== target.selectionEnd) ||
    !!card.querySelector?.('.xterm-selection')?.childElementCount;
}
function reportActivity(event) {
  if (!event.isTrusted) return;
  const card = event.target?.closest?.('[data-console-id]'), id = card?.dataset.consoleId;
  const identity = ownerIdentity(id);
  if (!identity) { if (event.type === 'pointerdown') trustedFocus = null; return; }
  const flags = activity.get(id) || { draft: false, selection: false };
  // A trusted key/click can establish focus; focus() alone cannot.
  if (['pointerdown', 'keydown', 'keyup', 'paste', 'input'].includes(event.type)) trustedFocus = id;
  if (event.type === 'keydown') {
    if (event.key === 'Enter' && !event.shiftKey) flags.draft = false;
    else if (event.key?.length === 1 && !event.ctrlKey && !event.metaKey) flags.draft = true;
  }
  if (event.type === 'paste') flags.draft = true;
  if (event.type === 'input' && typeof event.target.value === 'string' && !event.target.classList?.contains('xterm-helper-textarea')) flags.draft = !!event.target.value;
  if (event.type === 'pointerup' || event.type === 'keyup') {
    // xterm renders selection rectangles after its pointer handler runs.
    queueMicrotask(() => {
      const current = ownerIdentity(id);
      if (!current || current.launchId !== identity.launchId) return;
      flags.selection = ownerSelection(card, event.target);
      ipcRenderer.send('dock:owner-activity', { ...identity, ...flags, kind: 'selection', focused: trustedFocus === id && document.hasFocus() });
    });
  }
  activity.set(id, flags);
  const kind = event.type === 'wheel' ? 'scroll' : event.type === 'paste' ? 'paste' :
    ['keydown', 'keyup', 'input'].includes(event.type) ? 'typing' : flags.selection ? 'selection' : 'click';
  ipcRenderer.send('dock:owner-activity', { ...identity, ...flags, kind, focused: trustedFocus === id && document.hasFocus() });
}
window.addEventListener('DOMContentLoaded', () => {
  for (const type of ['pointerdown', 'pointerup', 'keydown', 'keyup', 'paste', 'input', 'wheel']) document.addEventListener(type, reportActivity, { capture: true, passive: true });
  setInterval(() => {
    const focusedId = document.activeElement?.closest?.('[data-console-id]')?.dataset.consoleId;
    ipcRenderer.send('dock:owner-activity', { kind: 'heartbeat', consoles: [...ownerSessions.keys()].map(id => ({
      ...ownerIdentity(id), ...(activity.get(id) || {}), focused: document.hasFocus() && trustedFocus === id && focusedId === id
    })) });
  }, 5000);
});
contextBridge.exposeInMainWorld('dock', {
  call: (method, payload) => ipcRenderer.invoke('dock:call', method, payload),
  // Dropped files only expose their path through webUtils in an isolated renderer.
  pathForFile: file => { try { return webUtils.getPathForFile(file); } catch { return ''; } },
  onState: callback => { const handler = (_, value) => callback(value); ipcRenderer.on('dock:state', handler); return () => ipcRenderer.removeListener('dock:state', handler); },
  onOutput: callback => { const handler = (_, value) => callback(value); ipcRenderer.on('dock:output', handler); return () => ipcRenderer.removeListener('dock:output', handler); },
  onSelect: callback => { const handler = (_, value) => callback(value); ipcRenderer.on('dock:select', handler); return () => ipcRenderer.removeListener('dock:select', handler); },
  onNotice: callback => { const handler = (_, value) => callback(value); ipcRenderer.on('dock:notice', handler); return () => ipcRenderer.removeListener('dock:notice', handler); }
});
