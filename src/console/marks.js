// Agent marks for console headers, the HUD and the chooser.
import { escapeHtml as escape } from '../html-escape.js';
import { accountMark } from '../account-identity.js';
import { icon } from '../ui/icons.js';
import { isReady } from './panels.js';

export function consoleMarks(providerName) {
  const shellMark = provider => `<span class="shell-mark" data-shell="${escape(provider)}" role="img" aria-label="${escape(providerName(provider))}" title="${escape(providerName(provider))}">${['shell', 'custom'].includes(provider) ? icon('terminal') : accountMark(provider)}</span>`;
  const readyIcon = session => `<span class="notification-icon">${shellMark(session.provider)}<span class="notification-badge console-ready-badge" ${isReady(session) ? '' : 'hidden'} aria-label="Ready for you">1</span></span>`;
  return { shellMark, readyIcon };
}
