// Title bar search (Ctrl+K): jump to an open console or a page. Native dialog,
// combobox input and listbox; focus returns to the opener when it closes.
import { escapeHtml as escape } from '../html-escape.js';
import { icon } from './icons.js';

const PAGES = [['consoles', 'Consoles', 'terminal'], ['projects', 'Projects', 'folders'], ['usage', 'Usage', 'chart'], ['settings', 'Settings', 'settings']];

export function installCommandSearch({ getState, providerName, openConsole, openPage }) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="command-search" class="command-search" aria-label="Search consoles and pages">
<div class="command-search-field">${icon('search')}<input type="search" role="combobox" aria-expanded="true" aria-controls="command-search-results" aria-autocomplete="list" placeholder="Search consoles and pages" autocomplete="off" spellcheck="false"></div>
<ul id="command-search-results" role="listbox" aria-label="Results"></ul></dialog>`);
  const dialog = document.querySelector('#command-search'), input = dialog.querySelector('input'), list = dialog.querySelector('ul');
  let results = [], active = 0, opener = null;

  function entries() {
    const state = getState(), projects = new Map((state?.projects || []).map(project => [project.id, project.name]));
    const consoles = (state?.sessions || []).filter(session => session.alive && !session.taskId && !session.kind && session.purpose !== 'login')
      .sort((a, b) => (a.slot || 99) - (b.slot || 99))
      .map(session => ({ kind: 'console', id: session.id, icon: 'terminal', label: session.name || `Console ${session.slot}`,
        detail: [session.slot ? `Slot ${session.slot}` : '', providerName(session.provider), projects.get(session.projectId) || ''].filter(Boolean).join(', ') }));
    return [...consoles, ...PAGES.map(([id, label, glyph]) => ({ kind: 'page', id, icon: glyph, label, detail: 'Page' }))];
  }
  function render() {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    results = entries().filter(item => words.every(word => `${item.label} ${item.detail}`.toLowerCase().includes(word)));
    active = Math.min(active, Math.max(0, results.length - 1));
    list.innerHTML = results.length ? results.map((item, index) => `<li id="command-search-${index}" role="option" aria-selected="${index === active}" data-index="${index}">${icon(item.icon)}<span><strong>${escape(item.label)}</strong><small>${escape(item.detail)}</small></span></li>`).join('')
      : '<li class="command-search-empty" role="presentation">No console or page matches.</li>';
    input.setAttribute('aria-activedescendant', results.length ? `command-search-${active}` : '');
    list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  }
  function choose(index) {
    const item = results[index]; if (!item) return;
    opener = null; dialog.close();
    if (item.kind === 'console') openConsole(item.id); else openPage(item.id);
  }
  function open() {
    if (dialog.open) { input.select(); return; }
    opener = document.activeElement; input.value = ''; active = 0; render();
    dialog.showModal(); input.focus();
  }
  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && results.length) {
      event.preventDefault(); active = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length; render();
    } else if (event.key === 'Enter') { event.preventDefault(); choose(active); }
  });
  list.addEventListener('click', event => { const row = event.target.closest('[data-index]'); if (row) choose(Number(row.dataset.index)); });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); opener = null; });
  // Ctrl+K stays with a focused terminal, where shells use it to delete to the end of the line.
  document.addEventListener('keydown', event => {
    if (event.target?.closest?.('.xterm')) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k' && !event.defaultPrevented) { event.preventDefault(); open(); }
  });
  return { open };
}
