// Editable console names in panel headers. A name saves when its field loses
// focus; Enter saves and Escape restores the saved name.
import { escapeHtml as escape } from '../html-escape.js';
import { isOpenConsole } from './panels.js';

export function slotNames({ call, toast, getState }) {
  const saves = new Map();
  const savedName = (slot, session) => session?.name || getState().settings.slotNames?.[slot] || '';
  function input(slot, session) {
    return `<input class="console-name" data-name-slot="${slot}" data-name-session="${session?.id || ''}" value="${escape(savedName(slot, session))}" maxlength="64" aria-label="Name console ${slot}" title="Name this console" placeholder="Name console" autocomplete="off" spellcheck="false">`;
  }
  function sync(field, slot, session) {
    if (!field) return;
    if (field !== document.activeElement && !saves.has(slot)) field.value = savedName(slot, session);
  }
  document.addEventListener('focusin', event => {
    const field = event.target;
    if (field.matches('.console-name')) { if (!field.hasAttribute('aria-invalid')) field.dataset.original = field.value; field.select(); }
  });
  document.addEventListener('focusout', async event => {
    const field = event.target;
    if (!field.matches('.console-name')) return;
    const slot = Number(field.dataset.nameSlot), name = field.value.trim();
    if (name === field.dataset.original || saves.has(slot)) return;
    field.readOnly = true;
    const save = call('slot.name', { slot, name, sessionId: field.dataset.nameSession || null });
    saves.set(slot, save);
    try {
      await save;
      field.removeAttribute('aria-invalid'); field.title = 'Name this console';
      field.dataset.original = name;
    } catch (error) {
      field.setAttribute('aria-invalid', 'true'); field.title = error.message; toast(error.message, true);
      if (field.isConnected && field.getClientRects().length) field.focus();
    } finally {
      saves.delete(slot); field.readOnly = false;
      if (!field.hasAttribute('aria-invalid')) {
        const session = getState().sessions.find(x => x.slot === slot && isOpenConsole(x));
        document.querySelectorAll(`.console-name[data-name-slot="${slot}"]`).forEach(other => sync(other, slot, session));
      }
    }
  });
  document.addEventListener('keydown', event => {
    const field = event.target;
    if (!field.matches('.console-name') || event.isComposing) return;
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape') { field.value = field.dataset.original; field.removeAttribute('aria-invalid'); field.title = 'Name this console'; }
      field.blur();
    }
  });
  // A click on plus can blur an edited title; launches wait for that save.
  return { input, sync, settled: () => Promise.all(saves.values()) };
}
