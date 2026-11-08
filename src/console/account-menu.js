// Account switch menus in console headers: popover markup, placement and
// keyboard handling. Switching itself goes through the app's click actions.
import { escapeHtml as escape } from '../html-escape.js';

export function accountSwitchMenu(session, hostKey, providerName) {
  if (session.taskId) return '';
  if (session.switchMethod !== 'resume' || session.purpose === 'login') return '';
  const targets = (session.switchTargets || []).filter(target => target.ready);
  const label = session.accountLabel || providerName(session.provider);
  if (session.purpose === 'setup') return `<span class="console-account-label" title="Account: ${escape(label)}">${escape(label)}</span>`;
  if (!targets.length) return `<span class="console-account-label" title="${escape(label)}">${escape(label)}</span>`;
  const available = session.draftSupported === true && !session.switching;
  const menuId = `account-menu-${session.id}-${hostKey}`;
  const unavailable = session.draftSupportReason || 'The CLI composer could not be verified for switching.';
  return `<div class="console-account-control"><button class="console-account-toggle" type="button" data-account-menu-toggle aria-haspopup="menu" aria-expanded="false" aria-controls="${menuId}" title="Account: ${escape(label)}">${escape(label)}</button><div id="${menuId}" class="account-menu-items" popover="auto" role="menu" aria-label="Switch account">${targets.map(target => `<button role="menuitem" data-action="account-switch" data-id="${session.id}" data-launch-id="${escape(session.launchId || '')}" data-target-account-id="${escape(target.id)}" ${available ? '' : 'disabled'}>${escape(`Switch to ${target.label}`)}</button><button role="menuitem" data-action="account-setup" data-id="${session.id}" data-launch-id="${escape(session.launchId || '')}" data-target-account-id="${escape(target.id)}">${escape(`Set up ${target.label}`)}</button>`).join('')}${available ? '' : `<small>${escape(unavailable)}</small>`}</div></div>`;
}
// Replaces the header control only when its markup changes, so an open menu survives updates.
function replaceSwitchControl(host, selector, html, after) {
  const current = host.querySelector(selector), template = document.createElement('template');
  template.innerHTML = html; const next = template.content.firstElementChild;
  if (current && !next) current.remove();
  else if (!current && next) after?.after(next);
  else if (current && next) {
    const stableMarkup = node => {
      const copy = node.cloneNode(true);
      copy.querySelector('[data-account-menu-toggle]')?.setAttribute('aria-expanded', 'false');
      copy.querySelector('.account-menu-items')?.removeAttribute('style');
      return copy.outerHTML;
    };
    if (stableMarkup(current) !== stableMarkup(next)) current.replaceWith(next);
  }
}
export function syncConsoleSwitchUi(host, session, providerName) {
  replaceSwitchControl(host, '.console-account-control,.console-account-label', accountSwitchMenu(session, 'panel', providerName), host.querySelector('.panel-status'));
}

// Installs the menu listeners and returns the menu item click actions.
export function installAccountMenus({ call, toast }) {
  function placeAccountPopover(toggle, menu) {
    const rect = toggle.getBoundingClientRect(), gutter = 8;
    const width = menu.getBoundingClientRect().width || 220;
    const height = menu.getBoundingClientRect().height || 140;
    const left = Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter));
    const top = rect.bottom + height + gutter <= window.innerHeight
      ? rect.bottom + gutter
      : Math.max(gutter, rect.top - height - gutter);
    menu.style.left = `${left}px`; menu.style.top = `${top}px`;
    menu.style.maxHeight = `${Math.max(96, window.innerHeight - gutter * 2)}px`;
  }
  function repositionAccountPopovers() {
    for (const menu of document.querySelectorAll('.account-menu-items[popover]:popover-open')) {
      const toggle = menu.parentElement?.querySelector('[data-account-menu-toggle]');
      if (toggle?.isConnected) placeAccountPopover(toggle, menu); else menu.hidePopover();
    }
  }
  const accountMenuPointerGestures = new Map();
  const accountMenuHasPointerGesture = menu => [...accountMenuPointerGestures.values()].includes(menu);
  function closeAccountMenuIfUnfocused(menu) {
    setTimeout(() => {
      if (menu.matches(':popover-open') && !menu.contains(document.activeElement) && !accountMenuHasPointerGesture(menu)) menu.hidePopover();
    }, 0);
  }
  document.addEventListener('pointerdown', event => {
    const menu = event.target.closest?.('.account-menu-items[popover]');
    if (!menu) return;
    accountMenuPointerGestures.set(event.pointerId, menu);
  }, true);
  document.addEventListener('pointerup', event => {
    const menu = accountMenuPointerGestures.get(event.pointerId);
    if (!menu) return;
    setTimeout(() => {
      if (accountMenuPointerGestures.get(event.pointerId) !== menu) return;
      accountMenuPointerGestures.delete(event.pointerId);
      closeAccountMenuIfUnfocused(menu);
    }, 500);
  }, true);
  document.addEventListener('pointercancel', event => {
    const menu = accountMenuPointerGestures.get(event.pointerId);
    if (!menu) return;
    accountMenuPointerGestures.delete(event.pointerId);
    closeAccountMenuIfUnfocused(menu);
  }, true);
  document.addEventListener('click', event => {
    const clickedMenu = event.target.closest?.('.account-menu-items[popover]');
    for (const [pointerId, menu] of accountMenuPointerGestures) if (!clickedMenu || clickedMenu === menu) accountMenuPointerGestures.delete(pointerId);
  }, true);
  window.addEventListener('blur', () => {
    const menus = new Set(accountMenuPointerGestures.values());
    accountMenuPointerGestures.clear();
    for (const menu of menus) if (menu.matches(':popover-open')) menu.hidePopover();
  });
  window.addEventListener('resize', repositionAccountPopovers);
  document.addEventListener('scroll', repositionAccountPopovers, true);
  document.addEventListener('click', event => {
    const toggle = event.target.closest('[data-account-menu-toggle]');
    if (!toggle) return;
    const menu = toggle.parentElement?.querySelector('.account-menu-items');
    if (!menu?.showPopover) { toast('This window cannot open the account menu. Update the Paddock web runtime.'); return; }
    event.preventDefault();
    if (menu.matches(':popover-open')) { menu.hidePopover(); return; }
    try {
      menu.showPopover(); placeAccountPopover(toggle, menu);
      toggle.setAttribute('aria-expanded', 'true');
      menu.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
    } catch { toast('The account menu could not be opened.'); }
  }, true);
  document.addEventListener('toggle', event => {
    const menu = event.target;
    if (!menu.matches?.('.account-menu-items[popover]')) return;
    const toggle = menu.parentElement?.querySelector('[data-account-menu-toggle]');
    toggle?.setAttribute('aria-expanded', String(menu.matches(':popover-open')));
  }, true);
  document.addEventListener('focusout', event => {
    const menu = event.target.closest?.('.account-menu-items[popover]');
    if (!menu) return;
    closeAccountMenuIfUnfocused(menu);
  }, true);
  document.addEventListener('keydown', event => {
    const menu = event.target.closest?.('.account-menu-items[popover]');
    if (!menu) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      const toggle = menu.parentElement?.querySelector('[data-account-menu-toggle]');
      menu.hidePopover(); toggle?.focus({ preventScroll: true }); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
      (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    event.preventDefault(); items[index].focus({ preventScroll: true });
  }, true);
  return {
    async 'account-switch'(button) {
      const label = button.textContent.trim().replace(/^Switch to\s+/, ''); button.disabled = true;
      await call('session.switch', { id: button.dataset.id, launchId: button.dataset.launchId, targetAccountId: button.dataset.targetAccountId });
      toast(`Switched to ${label}.`);
    },
    async 'account-setup'(button) {
      const setup = await call('accounts.setup', { id: button.dataset.id, launchId: button.dataset.launchId, targetAccountId: button.dataset.targetAccountId });
      const menu = button.closest('.account-menu-items[popover]'), toggle = menu?.parentElement?.querySelector('[data-account-menu-toggle]');
      menu?.hidePopover(); toggle?.focus({ preventScroll: true });
      if (setup?.cwd) toast(`Setup console opened in ${setup.cwd}.`);
    }
  };
}
