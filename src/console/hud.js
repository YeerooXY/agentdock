// The corner HUD: slot map, selected console preview and default account limits.
import { escapeHtml as escape } from '../html-escape.js';
import { accountIdentity, accountMark, remainingPercent } from '../account-identity.js';
import { icon, pdMark } from '../ui/icons.js';
import { number, age, statusLabels as labels } from '../ui/format.js';
import { launchHint, isOpenConsole, isReady, gridSize, gridCapacity, coveredSlots, newConsoleMark } from './panels.js';

export function consoleHud({ getState, view, terminals, providerName, shellMark, readyIcon }) {
  let previewTimer;
  function terminalPreview(session) {
    if (!session) return 'No console selected.';
    const buffer = terminals.get(session.id)?.term.buffer.active;
    if (buffer) {
      const lines = [];
      for (let i = Math.max(0, buffer.baseY + buffer.cursorY - 4); i <= buffer.baseY + buffer.cursorY; i++) {
        const line = buffer.getLine(i)?.translateToString(true); if (line?.trim()) lines.push(line);
      }
      if (lines.length) return lines.slice(-3).join('\n');
    }
    return `${providerName(session.provider)}  /  ${labels[session.state]}\nClick to expand this console.`;
  }
  function html() {
    const state = getState(), selectedId = view.selectedId;
    const ready = state.sessions.filter(isReady).length;
    const active = state.sessions.filter(x => isOpenConsole(x) && x.alive).length;
    const selected = state.sessions.find(x => x.id === selectedId && isOpenConsole(x) && x.alive) || state.sessions.find(x => isOpenConsole(x) && x.alive);
    const quotaProvider = selected?.provider === 'claude' ? 'claude' : 'codex';
    const quotaAccountId = selected?.accountId || `${quotaProvider}:default`;
    const quota = state.limits.find(x => x.provider === quotaProvider && (x.accountId || (quotaProvider === 'claude' && x.id === 'claude:account' ? 'claude:default' : quotaProvider === 'codex' ? 'codex:default' : null)) === quotaAccountId);
    const weekly = quota?.windows.find(x => x.minutes === 10080), five = quota?.windows.find(x => x.minutes === 300);
    const covered = coveredSlots(state), columns = gridSize(state).columns;
    const slots = Array.from({ length: gridCapacity(state) }, (_, i) => {
      const item = covered.get(i + 1);
      if (item && item.slot !== i + 1) return '';
      const area = `grid-column:${i % columns + 1}/span ${item?.width || 1};grid-row:${Math.floor(i / columns) + 1}/span ${item?.height || 1}`;
      const name = state.settings.slotNames?.[i + 1];
      return item ? `<button style="${area}" class="hud-slot ${item.state} ${item.id === selectedId ? 'current' : ''}" data-slot="${i + 1}" data-session="${item.id}" title="${escape(item.name)}, ${labels[item.state]}"><span>${i + 1}</span>${readyIcon(item)}<small>${escape(item.name)}</small></button>` : `<button style="${area}" class="hud-slot empty ${name ? 'named' : ''}" data-action="new" data-slot="${i + 1}" aria-label="Open console ${i + 1}${name ? ': ' + escape(name) : ''}" ${launchHint} ${view.openingConsole ? 'disabled' : ''}>${newConsoleMark()}${name ? `<small class="hud-slot-name">${escape(name)}</small>` : ''}</button>`;
    }).join('');
    return `<div class="hud-title"><span class="hud-brand" data-window-drag title="Drag to move">${pdMark()}paddock</span><button class="vim-mode" data-action="vim-normal" hidden></button><button class="icon-button" data-action="dashboard" aria-label="Expand dashboard">${icon('expand')}</button><button class="icon-button" data-action="tray" aria-label="Hide in system tray">${icon('close')}</button></div><button class="hud-summary" data-action="dashboard"><div><strong>${ready ? `${ready} ready for you` : active ? `${active} console${active === 1 ? '' : 's'} open` : ''}</strong>${icon('arrow')}</div></button><div class="hud-slots">${slots}</div>${selected ? `<button class="hud-console ${selected.state}" data-session="${selected.id}" data-frame="${escape(state.settings.slotTrims?.[selected.slot] || state.settings.trimStyle)}"><div><span>${shellMark(selected.provider)}${escape(selected.name)}</span>${icon('expand')}</div><pre id="hud-preview">${escape(terminalPreview(selected))}</pre></button>` : `<button class="hud-console empty" data-action="new" aria-label="Open console" ${launchHint} ${view.openingConsole ? 'disabled' : ''}>${newConsoleMark()}</button>`}<div class="hud-usage" style="--provider-accent:${accountIdentity(quotaProvider).color}"><span class="hud-account">${accountMark(quotaProvider)}${escape(selected?.accountLabel || (quotaProvider === 'claude' ? 'Default Claude' : 'Default Codex'))} <small>${quota ? age(quota.observedAt) : 'Not connected'}</small></span><div><span>5h <b>${remainingPercent(five?.usedPercent) !== null ? number(remainingPercent(five.usedPercent)) + '% left' : 'Unknown'}</b></span><span>Weekly <b>${remainingPercent(weekly?.usedPercent) !== null ? number(remainingPercent(weekly.usedPercent)) + '% left' : 'Unknown'}</b></span></div></div>`;
  }
  function render() { document.querySelector('#hud').innerHTML = html(); }
  // Terminal output refreshes the preview at most every 200 ms while the HUD shows.
  function updatePreview() {
    const state = getState();
    if (state.mode !== 'hud' || previewTimer) return;
    previewTimer = setTimeout(() => {
      previewTimer = null;
      const current = getState();
      const selected = current.sessions.find(x => x.id === view.selectedId && isOpenConsole(x)) || current.sessions.find(x => isOpenConsole(x));
      const preview = document.querySelector('#hud-preview');
      if (preview) preview.textContent = terminalPreview(selected);
    }, 200);
  }
  return { render, updatePreview };
}
