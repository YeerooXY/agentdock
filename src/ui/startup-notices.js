// Safe-mode and startup notices above the page. Dismissals last for this window.
import { escapeHtml as escape } from '../html-escape.js';

export function startupNotices(getState) {
  const dismissed = new Set();
  let rendered = '';
  function render() {
    const state = getState();
    const notices = (state.startupNotices || []).map((message, index) => ({ message, index })).filter(item => !dismissed.has(item.index));
    const markup = (state.safeMode ? `<div class="startup-notice"><span>Safe mode: your consoles weren't reopened and background checks are off. Consoles opened in safe mode won't be saved.</span><button type="button" class="secondary" data-action="restart-normal">Restart normally</button></div>` : '') + notices.map(item => `<div class="startup-notice"><span>${escape(item.message)}</span><button type="button" class="secondary" data-action="dismiss-startup-notice" data-index="${item.index}" aria-label="Dismiss notice">Dismiss</button></div>`).join('');
    if (markup !== rendered) { document.querySelector('#startup-notices').innerHTML = markup; rendered = markup; }
  }
  return { render, dismiss(index) { dismissed.add(index); render(); } };
}
