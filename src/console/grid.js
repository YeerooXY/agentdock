// The console grid: one card per slot, patched in place so terminals, names
// and open menus survive state updates. Review panels render through their own module.
import { escapeHtml as escape } from '../html-escape.js';
import { openConsoleEffect } from '../console-effects.js';
import { mountSky, refreshSky } from '../console-sky.js';
import { projectDot } from '../project-colors.js';
import { icon } from '../ui/icons.js';
import { badge } from '../ui/format.js';
import { launchHint, isOpenConsole, isReady, gridSize, gridCapacity, allPanels, coveredSlots, openPanel, resizeHandles, newConsoleMark } from './panels.js';
import { accountSwitchMenu, syncConsoleSwitchUi } from './account-menu.js';

// Panel modules created after the grid are read through getters: reviewPanels, projectChats, motion.
export function consoleGrid({ getState, view, clearExpanded, appearance, terminals, workerComposers, names, providerName, readyIcon, reducedMotion, panels, applySidebar, lightingChanged }) {
  const pendingOpenings = new Set();
  let renderedExpansion = null, renderedConsoleVisibility = false;
  const $ = selector => document.querySelector(selector);

  function card(slot) {
    const state = getState();
    const session = allPanels(state).find(x => x.slot === slot && isOpenConsole(x));
    if (!session) return `<article class="session-card empty" data-slot="${slot}"><header class="empty-panel-header">${names.input(slot)}${appearance.button(slot)}</header><button class="console-launch" data-action="new" data-slot="${slot}" aria-label="Open console ${slot}" ${launchHint} ${view.openingConsole ? 'disabled' : ''}>${newConsoleMark()}</button></article>`;
    if (session.kind === 'review') return panels.reviewPanels().card(session);
    const expanded = view.expandedId === session.id;
    const endLabel = session.taskId ? 'Stop worker' : session.restoreError ? 'Remove saved console' : 'End this console';
    return `<article class="session-card ${escape(session.state)}${expanded ? ' console-expanded' : ''}" data-console-id="${session.id}" data-slot="${slot}"><header class="console-panel-header"><button class="console-grip" draggable="true" data-console-drag="${session.id}" aria-label="Move console ${slot}" title="Drag to move or swap. Focus here and press Alt + 1–9 to move.">${readyIcon(session)}</button><span class="slot" title="${escape(providerName(session.provider) + ', ' + session.cwd)}">${String(slot).padStart(2, '0')}</span>${names.input(slot, session)}${session.worktree ? `<span class="worktree-badge" role="img" aria-label="${escape(`Git worktree branch ${session.worktree.branch}`)}" title="${escape(`Git worktree on ${session.worktree.branch}\n${session.worktree.path}`)}"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="3.5" r="1.6"/><circle cx="4" cy="12.5" r="1.6"/><circle cx="12" cy="5.5" r="1.6"/><path d="M4 5.1v5.8M12 7.1c0 2.6-3 3-6.6 4.4"/></svg><span class="worktree-name">${escape(session.worktree.branch.replace(/^paddock\//, ''))}</span></span>` : ''}<span class="panel-status">${badge(session.state)}</span>${accountSwitchMenu(session, 'panel', providerName)}${panels.projectChats().button(session)}${terminals.textSizeButtons(session.id, `console ${slot}`)}${appearance.button(slot)}<button class="icon-button console-expand" data-action="toggle-console" data-id="${session.id}" aria-label="${expanded ? 'Restore console ' + slot + ' to the grid (Ctrl+Shift+Enter)' : 'Expand console ' + slot}" aria-keyshortcuts="${expanded ? 'Control+Shift+Enter' : ''}" title="${expanded ? 'Restore console, Ctrl+Shift+Enter' : 'Expand console'}">${icon(expanded ? 'grid' : 'expand')}</button><button class="icon-button console-close" data-action="end-session" data-id="${session.id}" aria-label="${endLabel} ${slot}" title="${endLabel}">${icon('power')}</button></header><div class="console-panel-body" data-terminal-mount="${session.id}"></div>${resizeHandles(slot)}</article>`;
  }

  // Marks the expanded panel and makes the others inert. Clears a stale expansion.
  function syncExpanded() {
    const state = getState();
    const expanded = !!view.expandedId && !!openPanel(state, view.expandedId);
    if (!expanded) clearExpanded();
    $('#consoles-page').classList.toggle('has-expanded-console', expanded);
    $('#consoles-page').dataset.expandedConsole = expanded ? view.expandedId : '';
    document.body.classList.toggle('console-expanded', expanded);
    const target = expanded ? document.querySelector(`.session-card[data-console-id="${CSS.escape(view.expandedId)}"]`) : null;
    for (const panel of document.querySelectorAll('.session-grid > .session-card')) {
      const selected = panel === target;
      panel.classList.toggle('console-expanded', selected);
      panel.inert = !!expanded && !selected;
      panel.setAttribute('aria-hidden', String(!!expanded && !selected));
      if (!expanded) {
        const grip = panel.querySelector('.console-grip');
        if (grip) { grip.disabled = false; grip.draggable = true; }
        panel.querySelectorAll('.console-resize').forEach(handle => { handle.disabled = false; });
        const expand = panel.querySelector('[data-action="toggle-console"]');
        if (expand) {
          const slot = panel.dataset.slot || '';
          const label = panel.classList.contains('review-panel') ? `Expand review panel ${String(slot).padStart(2, '0')}` : `Expand console ${slot}`;
          expand.setAttribute('aria-label', label);
          expand.setAttribute('aria-keyshortcuts', '');
          expand.setAttribute('aria-expanded', 'false');
          expand.title = panel.classList.contains('review-panel') ? label : 'Expand console';
          if (expand.dataset.iconState !== 'expand') { expand.innerHTML = icon('expand'); expand.dataset.iconState = 'expand'; }
        }
      }
    }
    applySidebar();
    return expanded ? openPanel(state, view.expandedId) : null;
  }

  // A theme-specific opening effect, independent of the running process.
  function launchBurst(panel) {
    if (getState().settings.launchEffect === false || reducedMotion.matches || !panel.isConnected) return;
    openConsoleEffect(panel);
  }

  // Remembers consoles that appeared in this update so their card plays the opening effect.
  function noteOpenings(previous, next) {
    if (previous) for (const session of next.sessions) {
      if (session.alive && !session.dismissed && !previous.sessions.some(item => item.id === session.id && isOpenConsole(item))) pendingOpenings.add(session.id);
    }
    for (const id of pendingOpenings) if (!next.sessions.some(session => session.id === id && session.alive && !session.dismissed)) pendingOpenings.delete(id);
  }

  function render() {
    const layoutMotion = panels.motion();
    if (layoutMotion?.active) return;
    const state = getState();
    const before = layoutMotion?.capture();
    const grid = $('.session-grid'), covered = coveredSlots(state), expanded = syncExpanded();
    const consoleVisible = state.mode !== 'hud' && ['consoles', 'overview'].includes(view.page);
    const refreshDecorations = renderedExpansion !== (expanded?.id || null) || renderedConsoleVisibility !== consoleVisible;
    grid.style.setProperty('--grid-columns', gridSize(state).columns); grid.style.setProperty('--grid-rows', gridSize(state).rows);
    $('#grid-add').hidden = !!expanded || covered.size < gridCapacity(state);
    while (grid.children.length > gridCapacity(state)) grid.lastElementChild.remove();
    for (let slot = 1; slot <= gridCapacity(state); slot++) {
      const session = allPanels(state).find(x => x.slot === slot && isOpenConsole(x));
      let panel = grid.children[slot - 1];
      if (!panel || (panel.dataset.consoleId || '') !== (session?.id || '')) {
        const returnFocus = !session && panel?.contains(document.activeElement);
        const previous = terminals.get(panel?.dataset.consoleId);
        if (previous && panel.contains(previous.node)) $('#terminal-cache').append(previous.node);
        const template = document.createElement('template'); template.innerHTML = card(slot);
        const replacement = template.content.firstElementChild, launched = session?.alive && pendingOpenings.delete(session.id);
        if (panel) panel.replaceWith(replacement); else grid.append(replacement);
        panel = replacement;
        if (launched) requestAnimationFrame(() => launchBurst(replacement));
        if (returnFocus) replacement.querySelector('[data-action="new"]')?.focus({ preventScroll: true });
      }
      panel.hidden = covered.has(slot) && covered.get(slot).slot !== slot;
      const isExpanded = !!expanded && session?.id === expanded.id;
      panel.inert = !!expanded && !isExpanded;
      panel.setAttribute('aria-hidden', String(!!expanded && !isExpanded));
      appearance.sync(panel, slot);
      panel.style.gridColumn = `${(slot - 1) % gridSize(state).columns + 1} / span ${session?.width || 1}`;
      panel.style.gridRow = `${Math.floor((slot - 1) / gridSize(state).columns) + 1} / span ${session?.height || 1}`;
      if (session?.kind === 'review') {
        const kind = session.kind;
        panel.classList.toggle('console-expanded', isExpanded); panel.setAttribute('aria-label', `${kind} panel`);
        panels.reviewPanels().mount(session, panel.querySelector('.review-panel-body'));
        const context = session.kind === 'review' ? ` ${String(session.slot).padStart(2, '0')}` : '';
        const expand = panel.querySelector('[data-action="toggle-console"]'), iconState = isExpanded ? 'grid' : 'expand'; if (expand.dataset.iconState !== iconState) { expand.innerHTML = icon(iconState); expand.dataset.iconState = iconState; } expand.setAttribute('aria-label', isExpanded ? `Restore ${kind} panel${context} to grid` : `Expand ${kind} panel${context}`); expand.setAttribute('aria-expanded', String(isExpanded));
        panel.querySelectorAll('.console-grip,.console-resize').forEach(handle => { handle.disabled = !!expanded; });
        continue;
      }
      names.sync(panel.querySelector('.console-name'), slot, session);
      if (session?.taskId) panel.querySelector('.console-name').readOnly = true;
      panel.tabIndex = -1;
      panel.setAttribute('aria-label', `Console ${slot}${session?.name || state.settings.slotNames?.[slot] ? ': ' + (session?.name || state.settings.slotNames[slot]) : ''}`);
      mountSky(panel, slot);
      if (!session) {
        panel.querySelector('[data-action="new"]').disabled = view.openingConsole; continue;
      }
      const project = state.projects?.find(p => p.id === session.projectId);
      let projectColorMark = panel.querySelector('.console-project-color');
      if (project) {
        if (!projectColorMark) { projectColorMark = document.createElement('span'); projectColorMark.className = 'console-project-color'; panel.querySelector('.console-name').before(projectColorMark); }
        const color = project.color || '';
        if (projectColorMark.dataset.color !== color) { projectColorMark.innerHTML = projectDot(project); projectColorMark.dataset.color = color; projectColorMark.title = project.name; }
        projectColorMark.title = project.name;
      } else projectColorMark?.remove();
      if (panel.dataset.state !== session.state) {
        panel.className = `session-card ${session.state}`; panel.dataset.state = session.state;
        panel.querySelector('.panel-status').innerHTML = badge(session.state);
      }
      panel.classList.toggle('console-expanded', isExpanded);
      syncConsoleSwitchUi(panel, session, providerName);
      panel.querySelector('.console-ready-badge').hidden = !isReady(session);
      panel.querySelector('[data-console-drag]').setAttribute('aria-label', `Move console ${slot}${isReady(session) ? ', ready for you' : ''}`);
      if (session.restoreError && !panel.querySelector('[data-action="retry-session"]')) {
        panel.querySelector('.console-panel-header [data-action="toggle-console"]').insertAdjacentHTML('beforebegin', `<button class="icon-button" data-action="retry-session" data-id="${session.id}" aria-label="Retry console ${slot}" title="Try reopening">${icon('refresh')}</button>`);
      }
      const expand = panel.querySelector('[data-action="toggle-console"]');
      const isExpandedNow = expanded?.id === session.id;
      expand.setAttribute('aria-label', `${isExpandedNow ? 'Restore console ' + slot + ' to the grid (Ctrl+Shift+Enter)' : 'Expand console ' + slot}`);
      expand.setAttribute('aria-keyshortcuts', isExpandedNow ? 'Control+Shift+Enter' : '');
      expand.title = isExpandedNow ? 'Restore console, Ctrl+Shift+Enter' : 'Expand console';
      const iconState = isExpandedNow ? 'grid' : 'expand';
      if (expand.dataset.iconState !== iconState) { expand.innerHTML = icon(iconState); expand.dataset.iconState = iconState; }
      expand.setAttribute('aria-expanded', String(isExpandedNow));
      const grip = panel.querySelector('.console-grip');
      grip.draggable = !expanded;
      grip.disabled = !!expanded;
      panel.querySelectorAll('.console-resize').forEach(handle => { handle.disabled = !!expanded; });
      const end = panel.querySelector('[data-action="end-session"]');
      const endLabel = session.taskId ? 'Stop worker' : session.restoreError ? 'Remove saved console' : 'End this console';
      end.title = endLabel;
      end.setAttribute('aria-label', `${endLabel} ${slot}`);
      terminals.mount(session, panel.querySelector('.console-panel-body'), true);
      workerComposers.sync(panel, session);
    }
    if (refreshDecorations) refreshSky();
    renderedExpansion = expanded?.id || null;
    renderedConsoleVisibility = consoleVisible;
    if (before) layoutMotion.animate(before);
    panels.projectChats()?.sync();
    terminals.scheduleFits();
    lightingChanged();
  }

  return { render, syncExpanded, noteOpenings };
}
