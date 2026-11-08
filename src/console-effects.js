import { openings, dissolve, stateEffects } from './effects/registry.js';
import { consoleTheme } from './console-themes.js';

let closingSequence = 0;
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const ease = t => 1 - Math.pow(1 - t, 3);
const running = new Map();
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');

function cancelCanvas(canvas) {
  const stop = running.get(canvas);
  if (stop) stop();
}
function cancelChannel(panel, channel) {
  for (const [canvas, stop] of running) {
    if (stop.panel === panel && stop.channel === channel) stop();
  }
}
function cancelAll() { for (const stop of [...running.values()]) stop(); }
function visible(panel, target) {
  const dialog = document.querySelector('dialog[open]');
  const settingsCover = document.body.hasAttribute('data-settings-open') && !target?.closest('.settings-overlay');
  if (!panel?.isConnected || !target?.isConnected || document.hidden || motionPreference.matches ||
      document.body.dataset.visualPaused === 'true' || document.body.dataset.openingMotion === 'off' ||
      settingsCover || dialog && !dialog.contains(target)) return false;
  if (panel.closest('[hidden]') || target.closest('[hidden]') || getComputedStyle(target).visibility === 'hidden') return false;
  const rect = target.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
}

document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAll(); });
motionPreference.addEventListener('change', event => { if (event.matches) cancelAll(); });
new MutationObserver(records => {
  if (records.some(record => record.attributeName === 'data-opening-motion') && document.body.dataset.openingMotion === 'off' ||
      records.some(record => record.attributeName === 'data-visual-paused') && document.body.dataset.visualPaused === 'true' ||
      records.some(record => record.attributeName === 'data-settings-open') && document.body.hasAttribute('data-settings-open')) cancelAll();
}).observe(document.body, { attributes: true, attributeFilter: ['data-opening-motion', 'data-visual-paused', 'data-settings-open'] });

// Each opening is drawn procedurally on a canvas sized to the console, so it
// follows the theme colors at any size and ships no image assets. Effects end
// within 1.6 s, never block input and contain no more than two flashes.
function colors(panel) {
  const style = getComputedStyle(panel), pick = (name, fallback) => {
    const value = style.getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  };
  const theme = consoleTheme(panel.dataset.frame);
  return { a: pick('--frame-a', theme.a), b: pick('--frame-b', theme.b) };
}
function play(panel, target, effect, theme, channel, kind) {
  cancelChannel(panel, channel);
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const canvas = document.createElement('canvas'), ratio = Math.min(devicePixelRatio || 1, 2), w = rect.width, h = rect.height;
  canvas.className = channel === 'opening' ? 'launch-burst' : 'console-state-effect';
  canvas.dataset.opening = theme.opening; canvas.dataset.effect = kind || channel; canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.startedAt = String(performance.now()); canvas.dataset.duration = String(effect.duration); canvas.dataset.flashes = String(effect.flashes || 0);
  canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
  target.append(canvas);
  const g = canvas.getContext('2d'), c = colors(panel), state = effect.setup?.(w, h, c, kind, theme.id) || {};
  if (!g) { canvas.remove(); return; }
  let start = 0, previous = 0, stop = false, raf = 0, timer, shake;
  const done = () => {
    if (stop) return;
    stop = true; cancelAnimationFrame(raf); clearTimeout(timer); shake?.cancel();
    canvas.dataset.endedAt = String(performance.now()); canvas.remove(); running.delete(canvas);
    const channels = runningByPanel.get(panel);
    channels?.delete(channel); if (channels?.size === 0) runningByPanel.delete(panel);
  };
  const control = Object.assign(done, { panel, channel });
  let channels = runningByPanel.get(panel); if (!channels) runningByPanel.set(panel, channels = new Map());
  channels.set(channel, control); running.set(canvas, control);
  timer = setTimeout(done, effect.duration + 80);
  if (effect.shake) shake = panel.animate([0, 1, 2, 3, 4, 5].map(i => ({ transform: i === 5 ? 'none' : `translate(${rand(-1, 1) * effect.shake * (1 - i / 5)}px,${rand(-1, 1) * effect.shake * (1 - i / 5)}px)` })), { duration: 320, easing: 'ease-out' });
  const frame = now => {
    if (stop) return;
    if (!visible(panel, target) || !canvas.isConnected) { done(); return; }
    if (!start) start = previous = now;
    if (now - previous < 32 && now - start < effect.duration) { raf = requestAnimationFrame(frame); return; }
    const t = Math.min(1, (now - start) / effect.duration), dt = Math.min(.05, (now - previous) / 1000); previous = now;
    g.setTransform(ratio, 0, 0, ratio, 0, 0); g.clearRect(0, 0, w, h); g.save();
    effect.draw(g, w, h, t, c, state, dt);
    g.restore();
    if (t >= 1) done(); else raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return canvas;
}
const runningByPanel = new WeakMap();

// Pure decoration. Text, focus and terminal input are available immediately.
export function openConsoleEffect(panel, style = panel?.dataset.frame) {
  if (!visible(panel, panel)) return;
  const rect = panel.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const theme = consoleTheme(style);
  return play(panel, panel, openings[theme.opening] || openings.bloom, theme, 'opening', 'opening');
}

// Session reactions are triggered only by the renderer's observed state or
// output transition. Each console owns at most one short reaction layer.
export function playConsoleStateEffect(panel, state) {
  if (!panel || !visible(panel, panel)) return;
  const frame = panel.dataset.frame || panel.closest('[data-frame]')?.dataset.frame || 'classic';
  const theme = { ...consoleTheme(frame), id: frame };
  if (state === 'ready' && !['blue', 'hot-pink', 'icy'].includes(frame)) return;
  if (state === 'output' && frame !== 'cyber') return;
  const effect = stateEffects[state]; if (!effect) return;
  const target = state === 'output' || (state === 'ready' && frame === 'blue')
    ? panel.querySelector('.console-panel-header, .hud-console > div') || panel
    : panel;
  return play(panel, target, effect, theme, 'state', state);
}

// Animate an inert snapshot after the host reports that the console has ended.
// The live terminal and its process are never held open for a visual effect.
export function closeConsoleSnapshot(element) {
  if (!element || !visible(element, element)) return;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight) return;
  const copy = element.cloneNode(true), prefix = `closing-${++closingSequence}-`;
  copy.querySelectorAll('canvas').forEach((canvas, index) => {
    const original = element.querySelectorAll('canvas')[index];
    if (original?.width && original?.height) canvas.getContext('2d')?.drawImage(original, 0, 0);
  });
  const ids = new Map();
  for (const node of [copy, ...copy.querySelectorAll('*')]) {
    if (node.id) { ids.set(node.id, prefix + node.id); node.id = prefix + node.id; }
    for (const attr of [...node.attributes]) if (attr.name.startsWith('data-') && attr.name !== 'data-frame') node.removeAttribute(attr.name);
  }
  for (const node of copy.querySelectorAll('[stroke],[fill],[filter]')) for (const attr of ['stroke', 'fill', 'filter']) {
    const value = node.getAttribute(attr), id = value?.match(/^url\(#(.+)\)$/)?.[1];
    if (ids.has(id)) node.setAttribute(attr, `url(#${ids.get(id)})`);
  }
  copy.querySelectorAll('.launch-burst,.console-resize').forEach(node => node.remove());
  const style = getComputedStyle(element);
  copy.style.cssText = `position:relative;inset:auto;margin:0;box-sizing:border-box;width:${rect.width}px;height:${rect.height}px;min-height:0;max-height:none;display:${style.display};flex-direction:${style.flexDirection};overflow:hidden;border-radius:${style.borderRadius};background-color:${style.backgroundColor}`;
  copy.style.background = style.background;
  copy.style.border = style.border;
  copy.style.boxShadow = style.boxShadow;
  for (const name of ['--frame-a', '--frame-b', '--frame-edge', '--frame-glow']) copy.style.setProperty(name, style.getPropertyValue(name));
  const layer = document.createElement('div');
  layer.className = 'console-exit consoles-only'; layer.inert = true; layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
  layer.append(copy); document.body.append(layer);
  const theme = consoleTheme(element.dataset.frame || element.closest('[data-frame]')?.dataset.frame);
  if (document.body.dataset.openingMotion !== 'off') {
    const dust = document.createElement('div'); dust.className = 'console-exit consoles-only'; dust.dataset.frame = element.dataset.frame || element.closest('[data-frame]')?.dataset.frame || 'classic';
    dust.style.cssText = layer.style.cssText; document.body.append(dust);
    play(dust, dust, dissolve, theme, 'opening', theme.sky); setTimeout(() => dust.remove(), 1100);
  }
  const animation = layer.animate([
    { opacity: 1, transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
    { opacity: .7, transform: 'translateY(1px) scale(.985)', filter: 'brightness(1.6)', offset: .3 },
    { opacity: 0, transform: 'translateY(6px) scale(.92)', filter: 'brightness(.6)' }
  ], { duration: 320, easing: 'cubic-bezier(.3,0,.6,1)', fill: 'forwards' });
  animation.id = 'console-close';
  const timeout = setTimeout(() => layer.remove(), 520);
  animation.finished.then(() => { clearTimeout(timeout); layer.remove(); }, () => { clearTimeout(timeout); layer.remove(); });
}
