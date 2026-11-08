// One xterm per console, kept for the console's lifetime. Owns terminal output,
// fitting, per-console text size and screenshot pasting.
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { terminalTheme } from '../console-themes.js';
import { terminalOutput } from '../terminal-output.js';
import { fileLinks, webLinkHandler } from '../file-links.js';
import { playConsoleStateEffect } from '../console-effects.js';
import { escapeHtml as escape } from '../html-escape.js';
import { isOpenConsole } from './panels.js';
import { keepFollowing, clearTerminalAnchor, visibleTerminalAnchor, fitRecords } from './terminal-fit.js';

export const SCREENSHOT_DRAG = 'application/x-paddock-screenshot';

// view: { page, expandedId, selectedId, windowMoving } owned by the app.
export function consoleTerminals({ call, toast, getState, view, openFile, acknowledge, selectConsole, onWrite, lightUp, motion }) {
  const terminals = new Map();
  let fitTimer, fitFrame;

  // Per-console text size, changed with the A− / A+ buttons in its header.
  // A viewer preference: kept in this window's storage, never sent to the PC.
  const textSteps = (() => { try { return JSON.parse(localStorage.getItem('console-text-steps') || '{}'); } catch { return {}; } })();
  // Keyed by the console's stable key: session ids change when Paddock restarts.
  const textKey = id => getState().sessions.find(s => s.id === id)?.consoleKey || id;
  const textStep = id => textSteps[textKey(id)] ?? textSteps[id] ?? 10;
  const textSize = (id, compact) => (compact ? 11 : 14) + textStep(id);
  function textSizeButtons(id, name) {
    const step = textStep(id);
    return `<span class="text-size-buttons" role="group" aria-label="Text size for ${escape(name)}"><button class="icon-button text-size" data-text-size="-1" data-id="${id}" aria-label="Smaller text" title="Smaller text" ${step <= -4 ? 'disabled' : ''}>A<small>−</small></button><button class="icon-button text-size" data-text-size="1" data-id="${id}" aria-label="Larger text" title="Larger text" ${step >= 10 ? 'disabled' : ''}>A<small>+</small></button></span>`;
  }
  function changeTextSize(id, delta) {
    const step = Math.max(-4, Math.min(10, textStep(id) + delta));
    delete textSteps[id];
    textSteps[textKey(id)] = step;
    try { localStorage.setItem('console-text-steps', JSON.stringify(textSteps)); } catch { /* keep the size for this session only */ }
    const record = terminals.get(id);
    if (record) { record.term.options.fontSize = textSize(id, record.compact); record.dimensions = null; scheduleFits(); }
    document.querySelectorAll(`[data-text-size][data-id="${id}"]`).forEach(button => { button.disabled = button.dataset.textSize === '1' ? step >= 10 : step <= -4; });
  }

  function scheduleFits() {
    if (fitFrame) return;
    fitFrame = requestAnimationFrame(() => { fitFrame = null; fitVisible(); });
  }
  function fitVisible() {
    if (view.windowMoving || motion()?.active || getState()?.mode === 'hud') return;
    const visible = ['consoles', 'overview'].includes(view.page)
      ? view.expandedId ? [terminals.get(view.expandedId)] : [...terminals.values()].filter(record => record.node.closest('#consoles-page'))
      : [];
    fitRecords(visible, { terminals, call, pixelRatio: devicePixelRatio });
  }

  function queueTerminalWrite(record, data) {
    const previous = record.writeChain || Promise.resolve();
    const operation = previous.then(() => new Promise(resolve => record.term.write(data, resolve)));
    record.writeChain = operation.catch(() => {});
    return operation;
  }
  function resetTerminal(record, packet) {
    clearTerminalAnchor(record);
    record.follow = true;
    record.output?.dispose();
    record.launchId = packet.launchId || null;
    const previous = record.writeChain || Promise.resolve();
    const operation = previous.then(() => new Promise(resolve => {
      record.term.reset(); record.launchId = packet.launchId || null;
      if (packet.data) record.term.write(packet.data, () => { keepFollowing(record); resolve(); });
      else resolve();
    }));
    record.writeChain = operation.catch(() => {});
    record.output = terminalOutput((data, done) => queueTerminalWrite(record, data).then(() => { keepFollowing(record); done?.(); }), onWrite);
    return operation;
  }

  function imageConsole(id) {
    const state = getState(), session = state.sessions.find(x => x.id === id);
    return !!session && !session.remoteHostId && (['codex', 'claude', 'custom'].includes(session.provider) || !!state.agents?.some(x => x.id === session.provider));
  }
  async function pasteScreenshot(id) {
    const record = terminals.get(id);
    if (!record || !getState().sessions.some(x => x.id === id && isOpenConsole(x) && x.alive)) { toast('Click a console first, then paste the screenshot.', true); return; }
    record.term.paste(await call('screenshot.path', { id }));
    record.term.focus();
  }
  function renderScreenshot() {
    const state = getState(), shot = state?.screenshot, button = document.querySelector('#screenshot-spot');
    button.hidden = !shot || !['consoles', 'overview'].includes(view.page) || !state.sessions.some(x => isOpenConsole(x) && x.alive);
    if (!shot) return;
    if (button.querySelector('img').getAttribute('src') !== shot.thumb) button.querySelector('img').src = shot.thumb;
    const minutes = shot.at ? Math.round((Date.now() - shot.at) / 60000) : null;
    const when = minutes === null ? 'earlier' : minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
    button.title = `${shot.name}, ${when}\nClick to paste its path into the selected console, or drag it onto a console.`;
    button.setAttribute('aria-label', `Paste latest screenshot (${when}) into the selected console`);
  }

  function mount(session, host, compact) {
    const state = getState();
    let record = terminals.get(session.id);
    if (!record) {
      const id = session.id, node = document.createElement('div');
      const openWeb = value => call('open.link', value).catch(error => toast(error.message, true));
      node.className = 'terminal-instance'; node.dataset.terminalId = id; host.append(node);
      const themeId = state.settings.slotTrims?.[session.slot] || state.settings.trimStyle || 'classic';
      const term = new Terminal({ cols: session.cols || 110, rows: session.rows || 30, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: textSize(session.id, compact), lineHeight: 1.22, cursorBlink: !!state.settings.cursorBlink, scrollback: 3000, allowTransparency: true, disableStdin: !!session.switching, theme: terminalTheme(themeId), linkHandler: webLinkHandler(openWeb) });
      const fit = new FitAddon(); term.loadAddon(fit); term.open(node);
      record = { id, term, fit, node, compact, themeId, loading: true, queued: [], follow: true, scrollAnchor: null, launchId: session.launchId || null, writeChain: Promise.resolve() }; terminals.set(id, record);
      record.output = terminalOutput((data, done) => queueTerminalWrite(record, data).then(() => { keepFollowing(record); done?.(); }), onWrite);
      // Only the user's own scrolling stops a console following new output. Moves,
      // resizes and hidden periods can leave xterm's viewport behind otherwise.
      for (const event of ['wheel', 'keyup', 'pointerup']) node.addEventListener(event, e => {
        // xterm consumes wheel events inside its viewport. Capture the user's
        // intent before that, and stop following before another output write.
        if (e.type === 'wheel' && e.deltaY < 0) {
          record.follow = false;
          clearTerminalAnchor(record);
        }
        // xterm applies wheel movement on an animation frame. Read the resulting
        // viewport after that frame, rather than re-enabling follow too early.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (terminals.get(id) !== record) return;
          const buffer = term.buffer.active; record.follow = buffer.viewportY >= buffer.baseY;
          if (record.follow) clearTerminalAnchor(record);
          else {
            const anchor = visibleTerminalAnchor(record);
            clearTerminalAnchor(record);
            record.scrollAnchor = anchor;
          }
        }));
      }, { passive: true, capture: true });
      term.onData(data => { if (!session.taskId) call('session.input', { id, data }).catch(error => toast(error.message, true)); });
      fileLinks(term, value => openFile(id, value), openWeb);
      // Ctrl+V in a local agent console also pastes clipboard images as a file path.
      term.attachCustomKeyEventHandler(e => {
        if (e.type === 'keydown' && (e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyC' && (term.hasSelection() || e.shiftKey)) {
          e.preventDefault(); e.stopPropagation();
          if (term.hasSelection()) call('clipboard.write', term.getSelection()).catch(error => toast(error.message, true));
          return false;
        }
        if (e.type !== 'keydown' || e.code !== 'KeyV' || !e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || !imageConsole(id)) return true;
        e.preventDefault();
        call('screenshot.clipboard', { id }).then(text => { if (text) term.paste(text); }).catch(error => toast(error.message, true));
        return false;
      });
      node.addEventListener('contextmenu', e => {
        if (!term.hasSelection()) return;
        e.preventDefault();
        call('clipboard.menu', term.getSelection()).catch(error => toast(error.message, true));
      });
      node.addEventListener('focusin', () => selectConsole(id));
      node.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(SCREENSHOT_DRAG)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
      node.addEventListener('drop', e => { if (!e.dataTransfer.types.includes(SCREENSHOT_DRAG)) return; e.preventDefault(); e.stopPropagation(); selectConsole(id); pasteScreenshot(id).catch(error => toast(error.message, true)); });
      // A focused console can finish while the user is reading. Wait for their
      // next interaction; terminal output and automatic protocol replies do not count.
      for (const event of ['pointerdown', 'keydown', 'input', 'paste']) node.addEventListener(event, e => {
        if (e.type === 'keydown' && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        acknowledge(id).catch(error => toast(error.message, true));
      }, { capture: true });
      record.ready = call('session.buffer', id).then(buffer => {
        if (terminals.get(id) !== record) return;
        const expectedLaunchId = getState().sessions.find(item => item.id === id)?.launchId || null;
        const queued = record.queued.filter(packet => (packet.launchId || null) === expectedLaunchId);
        const resetIndex = queued.findLastIndex(packet => packet.reset);
        let baseline = '', launchId, tail;
        if (resetIndex >= 0) {
          const resetPacket = queued[resetIndex]; launchId = resetPacket.launchId; baseline = resetPacket.data || '';
          tail = queued.slice(resetIndex + 1).filter(packet => packet.launchId === launchId && packet.sequence > resetPacket.sequence);
        } else {
          launchId = expectedLaunchId;
          baseline = (buffer.launchId || null) === expectedLaunchId ? buffer.data : '';
          tail = queued.filter(packet => (!packet.launchId || packet.launchId === launchId) && packet.sequence > (buffer.sequence || 0));
        }
        record.launchId = launchId || null;
        const text = baseline + tail.map(packet => packet.data).join('');
        record.queued = []; record.loading = false;
        if (resetIndex >= 0) resetTerminal(record, { launchId, data: text });
        else queueTerminalWrite(record, text);
        return record.writeChain.then(() => { scheduleFits(); });
      }).catch(error => { record.loading = false; toast(error.message, true); });
    }
    // xterm can pause painting while its node is detached or hidden and miss the
    // resume, leaving a moved console blank. Repaint it on the next fit.
    if (record.node.parentElement !== host) { host.append(record.node); record.repaint = true; scheduleFits(); }
    const themeId = state.settings.slotTrims?.[session.slot] || state.settings.trimStyle || 'classic';
    if (record.themeId !== themeId) { record.term.options.theme = terminalTheme(themeId); record.themeId = themeId; }
    if (record.compact !== compact) {
      record.compact = compact;
      record.term.options.fontSize = textSize(session.id, compact);
      record.dimensions = null;
    }
    record.term.options.disableStdin = !!session.switching || !!session.taskId;
    record.node.classList.toggle('compact', compact); record.node.hidden = false;
    return record;
  }

  function receiveOutput(packet) {
    const state = getState();
    const record = terminals.get(packet.id); if (!record) return;
    const expectedLaunchId = state?.sessions.find(session => session.id === packet.id)?.launchId || null;
    if ((packet.launchId || null) !== expectedLaunchId) return;
    if (packet.reset) {
      if (record.loading) {
        record.queued.push(packet);
        record.queued = record.queued.filter((item, index, all) => item.reset ? index === all.findLastIndex(candidate => candidate.reset) : true);
        record.launchId = packet.launchId || null;
      } else resetTerminal(record, packet);
      return;
    }
    if ((record.launchId || null) !== (packet.launchId || null)) return;
    const now = performance.now();
    if (state?.settings.launchEffect !== false && (record.lastOutputAt == null || now - record.lastOutputAt > 900) && (record.lastOutputFxAt == null || now - record.lastOutputFxAt > 1500)) {
      const panel = state.mode === 'hud'
        ? [...document.querySelectorAll('.hud-console[data-session]')].find(item => item.dataset.session === packet.id)
        : record.node.closest('.session-card[data-console-id]');
      if ((panel?.dataset.frame || panel?.closest('[data-frame]')?.dataset.frame) === 'cyber') { record.lastOutputFxAt = now; playConsoleStateEffect(panel, 'output'); }
    }
    record.lastOutputAt = now;
    if (document.body.dataset.lighting === 'reactive' && Date.now() - (record.litAt || 0) > 700) { record.litAt = Date.now(); lightUp(record.node.closest('.session-card')); }
    if (record.loading) record.queued.push(packet); else record.output.push(packet.data);
  }

  // Applies state that every open terminal follows, and disposes closed consoles.
  function receive(state) {
    for (const record of terminals.values()) if (record.term.options.cursorBlink !== !!state.settings.cursorBlink) record.term.options.cursorBlink = !!state.settings.cursorBlink;
  }
  function disposeClosed(state) {
    for (const [id, record] of terminals) if (!state.sessions.some(session => session.id === id && isOpenConsole(session))) { record.output.dispose(); record.term.dispose(); record.node.remove(); terminals.delete(id); }
  }

  document.querySelector('#screenshot-spot').addEventListener('dragstart', e => { e.dataTransfer.setData(SCREENSHOT_DRAG, '1'); e.dataTransfer.effectAllowed = 'copy'; });
  const terminalResize = new ResizeObserver(() => { clearTimeout(fitTimer); fitTimer = setTimeout(scheduleFits, 80); });
  terminalResize.observe(document.querySelector('#consoles-page')); terminalResize.observe(document.querySelector('.session-grid'));
  window.dock.onOutput(receiveOutput);
  document.fonts.ready.then(() => { for (const record of terminals.values()) record.dimensions = null; scheduleFits(); });

  return {
    get: id => terminals.get(id),
    mount, receive, disposeClosed, scheduleFits, fitVisible,
    textSizeButtons, changeTextSize, textStep,
    pasteScreenshot, renderScreenshot,
    paste(id, text) { const record = terminals.get(id); if (!record) throw new Error('This console is no longer open.'); record.term.paste(text); record.term.focus(); }
  };
}
