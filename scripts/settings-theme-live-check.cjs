'use strict';
// Real renderer and synthetic state. Check immediate updates with a frozen clock,
// then advance moving skies and the real CSS timeline. No CLI, account or model calls.
// Run after npm run build: node scripts/settings-theme-live-check.cjs
const { chromium, webkit, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { initialSettings } = require('../electron/settings.cjs');
const { openPage } = require('./ui-navigation.cjs');
const root = path.resolve(__dirname, '..');
const dist = path.resolve(process.env.PADDOCK_RENDERER_DIR || path.join(root, 'dist'));
const suite = process.env.PADDOCK_CHECK_SUITE;
const evidenceRoot = suite === 'comets' ? 'shooting-stars-20261024' : 'settings-theme-live-20261024';
const out = path.join(root, '.build', evidenceRoot, process.env.PADDOCK_CHECK_LABEL || 'visual');
fs.mkdirSync(out, { recursive: true });
const profiles = [
  ['pc', chromium, { viewport: { width: 1440, height: 900 } }],
  ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }],
  ['android', chromium, devices['Pixel 7']],
  ['iphone', webkit, devices['iPhone 13']],
];
const themes = [['blue', 'stars'], ['violet', 'stars'], ['cyber', 'data'], ['icy', 'snow'], ['hot-pink', 'glitter'], ['fiery', 'embers']];
const fixture = {
  mode: 'dashboard', grid: { columns: 3, rows: 2 }, sessions: [], agents: [], projects: [],
  settings: initialSettings({ setupComplete: true, suggestProjects: false }, root, {}),
  shared: { connections: [], instructions: '', apiProfiles: [] }, vault: { available: false, entries: [] },
  limits: {}, recent: [], messages: [], ledger: [], summary: {}, capabilities: {}, version: 'fixture',
};
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/__checks__/axe.js') {
    res.setHeader('Content-Type', 'text/javascript'); return fs.createReadStream(require.resolve('axe-core/axe.min.js')).pipe(res);
  }
  const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});

function installFixture(initial) {
  let state = initial, refs;
  const frames = new WeakMap(), gradients = new WeakMap();
  const colorProbe = document.createElement('canvas').getContext('2d');
  const normalizeColor = value => { colorProbe.fillStyle = value; return colorProbe.fillStyle.toLowerCase(); };
  const blank = (draws = 0) => ({ colors: new Set(), stops: new Set(), particles: [], lines: [], sprites: 0, rectangles: 0, curves: 0, draws });
  const frame = canvas => { if (!frames.has(canvas)) frames.set(canvas, blank()); return frames.get(canvas); };
  const proto = CanvasRenderingContext2D.prototype;
  const wrap = (object, name, inspect) => {
    const original = object[name];
    object[name] = function (...args) { inspect.call(this, ...args); return original.apply(this, args); };
  };
  wrap(CanvasGradient.prototype, 'addColorStop', function (offset, color) {
    if (!gradients.has(this)) gradients.set(this, []);
    gradients.get(this).push({ offset, color });
  });
  const paint = (target, style) => {
    for (const { offset, color } of typeof style === 'string' ? [{ color: style }] : gradients.get(style) || []) {
      target.colors.add(color.slice(0, 7).toLowerCase());
      if (offset !== undefined) target.stops.add(offset);
    }
  };
  wrap(proto, 'clearRect', function () { frames.set(this.canvas, blank(frame(this.canvas).draws + 1)); });
  wrap(proto, 'fillRect', function (x, y) { const f = frame(this.canvas); f.rectangles++; f.particles.push({ x, y, alpha: this.globalAlpha }); paint(f, this.fillStyle); });
  wrap(proto, 'fill', function () { paint(frame(this.canvas), this.fillStyle); });
  wrap(proto, 'bezierCurveTo', function () { frame(this.canvas).curves++; });
  wrap(proto, 'moveTo', function (x, y) { this.__paddockPathStart = { x, y }; });
  wrap(proto, 'lineTo', function (x, y) { this.__paddockPathEnd = { x, y }; });
  wrap(proto, 'arc', function (x, y, radius) { this.__paddockCircle = { x, y, radius, color: this.fillStyle, alpha: this.globalAlpha, shadowBlur: this.shadowBlur }; });
  wrap(proto, 'fill', function () {
    const canvas = this.canvas, circle = this.__paddockCircle;
    if (canvas.matches('.settings-overlay > .panel-sky') && circle?.radius >= 2 && circle?.radius <= 3) {
      window.cometHeads.push({ ...circle, at: performance.now() });
    }
  });
  wrap(proto, 'stroke', function () {
    const canvas = this.canvas;
    if (canvas.matches('.settings-overlay > .panel-sky') && this.__paddockPathStart && this.__paddockPathEnd) {
      const line = { from: this.__paddockPathStart, to: this.__paddockPathEnd, at: performance.now(), alpha: this.globalAlpha, width: this.lineWidth, gradient: gradients.get(this.strokeStyle) || [] };
      frame(canvas).lines.push(line);
      window.cometHistory.push(line);
      if (window.cometHistory.length > 1000) window.cometHistory.shift();
    }
  });
  wrap(proto, 'drawImage', function (source, x, y, width, height) {
    const target = frame(this.canvas), sprite = frames.get(source); target.sprites++;
    target.particles.push({ x: x + width / 2, y: y + height / 2, alpha: this.globalAlpha });
    for (const color of sprite?.colors || []) target.colors.add(color);
    for (const stop of sprite?.stops || []) target.stops.add(stop);
  });
  const nodes = () => {
    const overlay = document.querySelector('.settings-overlay');
    return [overlay, overlay.querySelector('.settings-backdrop'), overlay.querySelector(':scope > .panel-sky'), overlay.querySelector('.settings-content')];
  };
  window.rememberSettings = () => { refs = nodes(); };
  window.cometHistory = [];
  window.cometHeads = [];
  if (new URLSearchParams(location.search).has('shooting-stars')) Math.random = () => .5;
  window.inspectSettingsSky = () => {
    const current = nodes(), [overlay, backdrop, canvas] = current, f = frame(canvas), style = getComputedStyle(overlay);
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261, painted = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3]) painted++;
      hash = Math.imul(hash ^ (pixels[i] | pixels[i + 1] << 8 | pixels[i + 2] << 16 | pixels[i + 3] << 24), 16777619);
    }
    return {
      frame: overlay.dataset.frame, consoleFrame: document.querySelector('#consoles-page').dataset.frame,
      expectedColors: ['--frame-a', '--frame-b'].map(key => normalizeColor(style.getPropertyValue(key).trim())),
      colors: [...f.colors], stops: [...f.stops], sprites: f.sprites, rectangles: f.rectangles, curves: f.curves, draws: f.draws,
      pixelHash: hash >>> 0, painted, backdrop: getComputedStyle(backdrop).backgroundImage,
      particles: f.particles.slice(0, 24), particleCount: f.particles.length, width: canvas.clientWidth, height: canvas.clientHeight,
      sameNodes: !refs || current.every((node, i) => node === refs[i]),
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  };
  window.fixtureChanges = [];
  window.dock = {
    async call(method, payload) {
      if (method === 'state') return { ok: true, value: structuredClone(state) };
      if (method === 'slot.trim') {
        state.settings.slotTrims = { ...state.settings.slotTrims };
        if (payload.style === 'default') delete state.settings.slotTrims[payload.slot];
        else state.settings.slotTrims[payload.slot] = payload.style;
        window.fixtureReceive(structuredClone(state));
        await Promise.resolve(); return { ok: true };
      }
      if (method !== 'settings') throw Error('Unexpected fixture call: ' + method);
      if ('starDensity' in payload) payload.starDensity = Number(payload.starDensity);
      const before = window.inspectSettingsSky(), focus = document.activeElement;
      const scroller = document.querySelector('.settings-stage'), scrollTop = scroller.scrollTop;
      const now = performance.now();
      state = { ...state, settings: { ...state.settings, ...payload } };
      window.fixtureReceive(structuredClone(state));
      // Mutation observers run here. No timers, animation frames or 400 ms cache interval elapse.
      await Promise.resolve();
      const after = window.inspectSettingsSky();
      window.fixtureChanges.push({ payload, before, after, elapsed: performance.now() - now,
        focusPreserved: focus === document.activeElement, scrollPreserved: scrollTop === scroller.scrollTop });
      return { ok: true };
    },
    onState: fn => { window.fixtureReceive = fn; }, onOutput() {}, onSelect() {}, onNotice() {},
  };
}

const skySnapshot = page => page.evaluate(() => window.inspectSettingsSky());
const updateSettings = (page, settings) => page.evaluate(settings => window.dock.call('settings', settings), settings);
async function changeControls(page, settings) {
  for (const [key, value] of Object.entries(settings)) {
    const control = page.locator(`[data-setting="${key}"]`);
    if (!await control.count()) { await updateSettings(page, { [key]: value }); continue; }
    const type = await control.first().getAttribute('type');
    if (type === 'radio') await page.locator(`[data-setting="${key}"][value="${value}"]`).locator('..').click();
    else if (type === 'checkbox') await control.setChecked(value);
    else if (type === 'range') await control.evaluate((el, value) => {
      el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    }, String(value));
    else await control.selectOption(value);
  }
}
function displacement(before, after, scale = false) {
  return Math.max(...before.particles.slice(0, after.particles.length).map((p, i) => {
    const q = after.particles[i], x = p.x * (scale ? after.width / before.width : 1), y = p.y * (scale ? after.height / before.height : 1);
    const dx = Math.abs(q.x - x), dy = Math.abs(q.y - y);
    return Math.hypot(Math.min(dx, Math.abs(dx - after.width - 12)), Math.min(dy, Math.abs(dy - after.height - 12)));
  }));
}

async function checkMovingBackground(page, capture) {
  const measurements = [], issues = [];
  const check = (ok, message, data) => { measurements.push({ message, passed: !!ok, ...data }); if (!ok) issues.push(message); };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await changeControls(page, { trimStyle: 'blue', starDensity: 1, ambientMotion: true, lighting: 'wave', cursorBlink: false, themeTextures: true, launchEffect: true });
  await page.clock.runFor(96);
  const initial = await skySnapshot(page);
  await page.clock.runFor(2400);
  let before = await skySnapshot(page);
  check(displacement(initial, before) > 1, 'The initial sky has actually moved before updates', { displacement: displacement(initial, before) });
  await capture('motion-before-settings');
  for (const setting of [{ cursorBlink: true }, { themeTextures: false }, { launchEffect: false }, { notifications: false }]) {
    before = await skySnapshot(page); await changeControls(page, setting);
    let after = await skySnapshot(page);
    check(before.pixelHash === after.pixelHash && after.frame === 'blue' && after.sameNodes, 'Unrelated update preserves the moving sky and selected theme: ' + Object.keys(setting)[0]);
    await page.clock.runFor(48); after = await skySnapshot(page);
    check(displacement(before, after) < 1, 'Ordinary update continues from the previous positions', { setting, displacement: displacement(before, after) });
  }
  for (const level of [2, 1, 3]) {
    await page.clock.runFor(800);
    before = await skySnapshot(page); await changeControls(page, { starDensity: level }); await page.clock.runFor(48);
    const after = await skySnapshot(page), distance = displacement(before, after);
    check(distance < 1 && after.particleCount !== before.particleCount, 'Density changes preserve surviving particles: ' + level, { displacement: distance, countBefore: before.particleCount, countAfter: after.particleCount });
  }
  await capture('motion-after-density');
  before = await skySnapshot(page);
  await changeControls(page, { starDensity: 0 }); await page.clock.runFor(2400);
  check((await skySnapshot(page)).painted === 0, 'Stars Off clears the canvas after the sky has moved');
  await changeControls(page, { starDensity: 3 });
  let after = await skySnapshot(page);
  check(displacement(before, after) < .001 && before.particles.every((p, i) => Math.abs(p.alpha - after.particles[i].alpha) < .00001), 'Stars On restores the existing positions and twinkle phase');
  for (const theme of ['violet', 'icy', 'cyber', 'blue']) {
    before = await skySnapshot(page); await changeControls(page, { trimStyle: theme });
    const after = await skySnapshot(page), distance = displacement(before, after);
    check(distance < .001 && after.frame === theme, 'Theme changes preserve particle positions: ' + theme, { displacement: distance });
    await page.clock.runFor(96);
  }
  const originalSize = page.viewportSize();
  await page.clock.runFor(1200);
  before = await skySnapshot(page);
  await page.setViewportSize({ width: originalSize.width + 48, height: originalSize.height + 32 }); await page.clock.runFor(48);
  after = await skySnapshot(page);
  check(displacement(before, after, true) < 1, 'Resize preserves normalized particle positions', { displacement: displacement(before, after, true) });
  await page.setViewportSize(originalSize); await page.clock.runFor(48);
  await changeControls(page, { ambientMotion: false }); await page.clock.runFor(96);
  before = await skySnapshot(page);
  await page.clock.runFor(3200);
  after = await skySnapshot(page);
  check(after.pixelHash === before.pixelHash, 'Ambient motion freezes the elapsed sky');
  await page.locator('[data-setting=ambientMotion]').scrollIntoViewIfNeeded(); await capture('motion-controls-paused', false);
  await changeControls(page, { trimStyle: 'violet' }); after = await skySnapshot(page);
  check(displacement(before, after) < .001 && after.particles.every((p, i) => Math.abs(p.alpha - before.particles[i].alpha) < .00001), 'Paused recoloring preserves positions and twinkle phase');
  await changeControls(page, { ambientMotion: true }); await page.clock.runFor(48);
  let resumed = await skySnapshot(page);
  check(displacement(after, resumed) < 1 && resumed.particles.every((p, i) => Math.abs(p.alpha - after.particles[i].alpha) < .12), 'Resume continues position and twinkle phase');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.clock.runFor(96);
  before = await skySnapshot(page); await page.clock.runFor(1800);
  await changeControls(page, { trimStyle: 'blue' }); after = await skySnapshot(page);
  check(displacement(before, after) < .001 && after.particles.every((p, i) => Math.abs(p.alpha - before.particles[i].alpha) < .00001), 'Reduced-motion recoloring preserves the elapsed phase');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.clock.runFor(48);
  resumed = await skySnapshot(page);
  check(displacement(after, resumed) < 1 && resumed.particles.every((p, i) => Math.abs(p.alpha - after.particles[i].alpha) < .12), 'Removing reduced motion resumes smoothly');
  // CSS animations use the real document timeline, independently of the mocked RAF clock.
  await changeControls(page, { themeTextures: true });
  const lighting = () => page.evaluate(() => document.getAnimations().filter(a => /^light-/.test(a.animationName || '')).map(a => ({ name: a.animationName, time: a.currentTime, progress: a.effect.getComputedTiming().progress, playState: a.playState })));
  for (const effect of ['wave', 'breathe', 'spectrum']) {
    await changeControls(page, { lighting: effect, lightingSpeed: 'normal' }); await page.clock.runFor(48); await page.waitForTimeout(360);
    const running = await lighting();
    check(running.length > 0 && Math.max(...running.map(a => a.time)) - Math.min(...running.map(a => a.time)) < 2, 'New lighting layers share the existing clock: ' + effect, { running });
    await updateSettings(page, { cursorBlink: false }); await page.clock.runFor(48); await page.waitForTimeout(60);
    const continued = await lighting();
    check(running.length > 0 && running.every((a, i) => continued[i]?.time >= a.time && continued[i].time - a.time < 250), 'Moving CSS phase survives an ordinary update: ' + effect, { running, continued });
    await changeControls(page, { ambientMotion: false }); await page.clock.runFor(48); await page.waitForTimeout(60);
    const paused = await lighting();
    await page.waitForTimeout(420);
    await updateSettings(page, { cursorBlink: false }); await page.clock.runFor(48); await page.waitForTimeout(60);
    const unchanged = await lighting();
    check(paused.length > 0 && paused.every((a, i) => a.playState === 'paused' && unchanged[i]?.playState === 'paused' && Math.abs(a.time - unchanged[i].time) < 2), 'Paused CSS phase survives settings updates: ' + effect, { paused, unchanged });
    await page.locator('[data-setting=lightingSpeed]').selectOption('slow'); await page.clock.runFor(48); await page.waitForTimeout(60);
    const slower = await lighting();
    check(unchanged.every((a, i) => Math.abs(a.progress - slower[i]?.progress) < .001), 'Changing speed preserves the paused lighting phase: ' + effect, { slower });
    await changeControls(page, { ambientMotion: true }); await page.clock.runFor(48); await page.waitForTimeout(60);
    const playing = await lighting();
    check(slower.every((a, i) => playing[i]?.playState === 'running' && playing[i].time >= a.time && playing[i].time - a.time < 250), 'CSS resumes from its paused phase: ' + effect, { playing });
  }
  await capture('motion-resumed');
  return { measurements, issues };
}

async function checkThemeIsolation(page, capture, audit) {
  const measurements = [], issues = [];
  const check = (ok, message, data) => { measurements.push({ message, passed: !!ok, ...data }); if (!ok) issues.push(message); };
  const colors = () => page.evaluate(() => {
    // Compare settled control colors; keep infinite RGB/lighting animations running.
    for (const animation of document.getAnimations()) if (animation instanceof CSSTransition) animation.finish();
    const ctx = document.createElement('canvas').getContext('2d');
    const style = (el, pseudo) => {
      if (!el) return null;
      const s = getComputedStyle(el, pseudo);
      return { background: s.backgroundImage, border: s.borderImageSource, shadow: s.boxShadow, display: s.display,
        a: (ctx.fillStyle = s.getPropertyValue('--frame-a').trim(), ctx.fillStyle), b: (ctx.fillStyle = s.getPropertyValue('--frame-b').trim(), ctx.fillStyle) };
    };
    const cards = Object.fromEntries([...document.querySelectorAll('.theme-choice')].map(el => [el.dataset.frame, style(el.querySelector('.theme-chip'))]));
    const choices = Object.fromEntries([...document.querySelectorAll('.console-color-options label')].map(el => [el.querySelector('input').value, style(el.querySelector('.frame-swatch'))]));
    const panel = el => ({ frame: el.dataset.frame,
      skin: style(el.querySelector(':scope > .console-skin'), '::before'), wave: style(el.querySelector(':scope > .console-skin > .theme-wave'), '::before'),
      trace: style(el.querySelector(':scope > .console-skin > .theme-trace'), '::after'), swatch: style(el.querySelector('.console-color-button .frame-swatch')),
      nameColor: el.querySelector('.console-name') ? getComputedStyle(el.querySelector('.console-name')).color : null });
    const consoles = Object.fromEntries([...document.querySelectorAll('.session-grid > [data-slot]')].map(el => [el.dataset.slot, panel(el)]));
    return { cards, choices, consoles, preview: panel(document.querySelector('#console-color-dialog .console-theme-preview')), rgb: document.body.dataset.rgb };
  });
  const namedEqual = (a, b) => Object.keys(a).filter(id => !['gamer', 'default'].includes(id)).every(id => JSON.stringify(a[id]) === JSON.stringify(b[id]));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await updateSettings(page, { trimStyle: 'classic', starDensity: 1, ambientMotion: true, themeTextures: true, lighting: 'wave', slotTrims: { 1: 'blue', 2: 'fiery' } });
  await page.clock.runFor(48);
  const original = await colors();
  await page.locator('.theme-choice[data-frame=gamer]').click(); await page.clock.runFor(48);
  const rgbPhases = [];
  for (const elapsed of [0, 430, 670]) {
    await page.waitForTimeout(elapsed);
    const actual = await colors();
    rgbPhases.push(actual.cards.gamer.a);
    check(namedEqual(original.cards, actual.cards), 'Named Appearance samples keep their colors under global RGB after ' + elapsed + ' ms', { cards: actual.cards });
    check(Object.entries(actual.cards).every(([id, s]) => id === 'gamer' ? s.border.includes('conic-gradient') : s.border === 'none'), 'Only the RGB theme chip has a rainbow border');
  }
  check(new Set(rgbPhases).size > 1, 'The global RGB hue actually advances during the isolation checks', { rgbPhases });
  await capture('rgb-appearance');
  await audit('.settings-content');
  if (page.viewportSize().width < 600) { await page.locator('.theme-choice[data-frame=gamer]').scrollIntoViewIfNeeded(); await capture('rgb-selected', false); }
  await page.keyboard.press('Escape'); await page.clock.runFor(48); await page.waitForTimeout(300);
  let globalRgb = await colors();
  check(globalRgb.consoles['1'].frame === 'blue' && globalRgb.consoles['2'].frame === 'fiery' && globalRgb.consoles['3'].frame === 'gamer', 'Explicit slots keep their theme; default slots follow RGB');
  await capture('rgb-consoles');
  // Compare each explicit console against a page with a different default theme.
  await updateSettings(page, { trimStyle: 'classic' }); await page.clock.runFor(48); await page.waitForTimeout(300);
  const classic = await colors();
  check([1, 2].every(id => JSON.stringify(globalRgb.consoles[id]) === JSON.stringify(classic.consoles[id])), 'Global RGB does not change explicit console skin, wave, trace or button swatch', { globalRgb: globalRgb.consoles, classic: classic.consoles });
  for (const trimStyle of ['normal', 'hot-pink', 'void', 'redline', 'icy']) {
    await updateSettings(page, { trimStyle }); await page.clock.runFor(48); await page.waitForTimeout(300);
    const alternate = await colors();
    check([1, 2].every(id => JSON.stringify(alternate.consoles[id]) === JSON.stringify(classic.consoles[id])), 'Other ancestor themes also preserve explicit consoles: ' + trimStyle);
  }
  await updateSettings(page, { trimStyle: 'classic' });
  await page.locator('.session-grid [data-frame-slot="1"]').click(); await page.clock.runFor(48);
  const chooser = await colors();
  await updateSettings(page, { trimStyle: 'gamer' }); await page.clock.runFor(48); await page.waitForTimeout(550);
  let actual = await colors();
  check(namedEqual(chooser.choices, actual.choices), 'Named console chooser swatches keep their colors with RGB selected globally', { choices: actual.choices });
  check(JSON.stringify(chooser.preview) === JSON.stringify(actual.preview), 'The explicit chooser preview keeps its own colors under global RGB', { preview: actual.preview });
  await capture('rgb-chooser', false);
  await audit('#console-color-dialog');
  await page.keyboard.press('Escape'); await updateSettings(page, { trimStyle: 'classic' }); await page.clock.runFor(48); await page.waitForTimeout(300);
  const withoutRgb = await colors();
  await page.locator('.session-grid [data-frame-slot="1"]').click();
  await page.locator('#console-color-dialog input[value=gamer]').check();
  await page.locator('#console-color-dialog button[type=submit]').click(); await page.clock.runFor(48); await page.waitForTimeout(640);
  actual = await colors();
  check(actual.consoles['1'].frame === 'gamer' && actual.rgb === 'on', 'Choosing RGB for one slot enables its RGB clock');
  check([2, 3].every(id => JSON.stringify(withoutRgb.consoles[id]) === JSON.stringify(actual.consoles[id])), 'A single RGB slot does not recolor other explicit or default consoles', { consoles: actual.consoles });
  await openPage(page, 'appearance'); await page.clock.runFor(48); await page.evaluate(() => window.rememberSettings());
  actual = await colors(); check(namedEqual(original.cards, actual.cards), 'A single RGB slot does not recolor named Appearance samples');
  await page.keyboard.press('Escape');
  await page.locator('.session-grid [data-frame-slot="1"]').click();
  await page.locator('#console-color-dialog input[value=default]').check();
  await page.locator('#console-color-dialog button[type=submit]').click(); await page.clock.runFor(48);
  await updateSettings(page, { trimStyle: 'gamer' }); await page.clock.runFor(48); await page.waitForTimeout(440);
  actual = await colors();
  check(actual.consoles['1'].frame === 'gamer' && actual.consoles['2'].frame === 'fiery', 'Use default removes the override and follows the next global selection');
  await openPage(page, 'appearance'); await page.clock.runFor(48); await page.evaluate(() => window.rememberSettings());
  // Spectrum is an explicit global lighting effect; palette selection samples remain literal.
  await page.locator('[data-setting=lighting]').selectOption('spectrum'); await page.clock.runFor(48); await page.waitForTimeout(330);
  const spectrum = await colors(); await page.waitForTimeout(730); const later = await colors();
  check(namedEqual(original.cards, spectrum.cards) && namedEqual(original.cards, later.cards), 'Spectrum keeps all named samples meaningful at different hue phases', { cards: later.cards });
  await capture('spectrum-appearance');
  await page.keyboard.press('Escape'); await page.clock.runFor(48); await page.waitForTimeout(330);
  const runtime = await colors(); await page.waitForTimeout(730); await page.clock.runFor(48);
  const runtimeLater = await colors();
  check(JSON.stringify(runtime.consoles['2'].skin) !== JSON.stringify(runtimeLater.consoles['2'].skin), 'Spectrum still animates visible runtime console accents', { before: runtime.consoles['2'].skin, after: runtimeLater.consoles['2'].skin });
  await capture('spectrum-consoles');
  return { measurements, issues };
}

async function checkShootingStars(page, capture) {
  const measurements = [], issues = [];
  const check = (ok, message, data = {}) => { measurements.push({ message, passed: !!ok, ...data }); if (!ok) issues.push(message); };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await updateSettings(page, { trimStyle: 'blue', starDensity: 3, ambientMotion: true });
  await page.clock.runFor(64);
  let history = [];
  for (let i = 0; i < 150; i++) {
    await page.clock.runFor(80);
    history = await page.evaluate(() => window.cometHistory.slice());
    if (history.length >= 8) break;
  }
  check(history.length >= 8, 'A deterministic shooting star is drawn across multiple frames', { samples: history.length });
  if (history.length < 8) return { measurements, issues };

  const recent = history.slice(-6);
  const angleOf = line => Math.atan2(line.to.y - line.from.y, line.to.x - line.from.x);
  const trailAngles = recent.map(angleOf);
  const trailLengths = recent.map(line => Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y));
  check(trailAngles.every(angle => angle >= 20 * Math.PI / 180 && angle <= 35 * Math.PI / 180),
    'The trail points 20–35 degrees below horizontal', { angles: trailAngles.map(value => value * 180 / Math.PI) });
  check(Math.max(...trailAngles) - Math.min(...trailAngles) < .001,
    'The same direction vector controls the full comet tail', { angles: trailAngles.map(value => value * 180 / Math.PI) });
  check(trailLengths.every(length => Math.abs(length - 80) < .1),
    'The tail uses one fixed length along its direction', { lengths: trailLengths });
  check(recent.every(line => line.gradient.length === 3 && line.gradient[0].color.endsWith('00') && line.gradient[2].color === '#ffffffff'),
    'The tail fades to transparent and reaches a bright gradient tip', { gradient: recent.at(-1).gradient });
  const heads = await page.evaluate(() => window.cometHeads.slice(-6));
  check(heads.length >= 4 && heads.every(head => head.radius === 2.5 && head.color === '#ffffff' && head.shadowBlur === 8),
    'A white glowing head follows the trail endpoint', { heads: heads.slice(-2) });

  const first = recent[0], last = recent.at(-1), elapsed = (last.at - first.at) / 1000;
  const speed = Math.hypot(last.to.x - first.to.x, last.to.y - first.to.y) / elapsed;
  check(elapsed > 0 && speed >= 250 && speed <= 290,
    'The head moves at its fixed per-star speed independently of panel aspect ratio', { speed, elapsed, viewport: page.viewportSize() });
  check(recent[0].alpha > recent.at(-1).alpha,
    'The comet tail and bright head fade as the shot ages', { firstAlpha: recent[0].alpha, lastAlpha: recent.at(-1).alpha });

  const viewport = page.viewportSize();
  const orientation = viewport.width / viewport.height >= 1.3 ? 'wide' : 'tall';
  await capture(`${orientation}-shooting-star-settings`, false);
  await page.evaluate(() => {
    const overlay = document.querySelector('.settings-overlay');
    overlay.querySelector('.settings-stage').style.display = 'none';
    document.querySelector('.titlebar').style.display = 'none';
    overlay.style.background = '#05070c';
    overlay.querySelector(':scope > .panel-sky').style.zIndex = '0';
  });
  await capture(`${orientation}-shooting-star-panel`, false);
  return { measurements, issues };
}

function checkChange(change, theme, kind) {
  assert.equal(change.after.frame, theme, 'Settings data-frame changes during receive');
  assert.equal(change.after.consoleFrame, theme, 'console backdrop stays in sync');
  assert.equal(change.elapsed, 0, 'theme redraw requires no clock advance');
  assert.ok(change.after.sameNodes, 'overlay, backdrop, canvas and content retain their DOM identity');
  assert.ok(change.focusPreserved && change.scrollPreserved, 'focus and Settings scroll are preserved');
  assert.equal(change.after.overflow, false, 'no document overflow');
  assert.notEqual(change.after.backdrop, change.before.backdrop, 'texture/gradient changes');
  assert.ok(change.after.draws > change.before.draws, 'canvas redraws in the state update microtask');
  assert.notEqual(change.after.pixelHash, change.before.pixelHash, 'actual canvas pixels change');
  assert.ok(change.after.painted > 0, 'sky remains visible');
  // Glitter uses the primary color for both its stars and hearts.
  const paintedColors = kind === 'glitter' ? change.after.expectedColors.slice(0, 1) : change.after.expectedColors;
  for (const color of paintedColors) assert.ok(change.after.colors.includes(color), `canvas paints new theme color ${color}`);
  for (const color of change.before.expectedColors) {
    if (!change.after.expectedColors.includes(color)) assert.equal(change.after.colors.includes(color), false, `canvas discards old color ${color}`);
  }
  if (kind === 'data') { assert.ok(change.after.rectangles > 0); assert.equal(change.after.sprites, 0); }
  else {
    assert.ok(change.after.sprites > 0);
    assert.ok(change.after.stops.includes(['snow', 'embers'].includes(kind) ? .12 : .18), 'new particle softness is applied');
    assert.equal(change.after.curves > 0, kind === 'glitter', 'only glitter draws hearts');
  }
}

let browser;
const results = [];
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [name, engine, options] of profiles.filter(([name]) => !process.env.PADDOCK_VISUAL_PROFILE || process.env.PADDOCK_VISUAL_PROFILE.split(',').includes(name))) {
    browser = await engine.launch();
    const profileOptions = suite === 'comets' && name === 'pc' ? { ...options, viewport: { width: 1280, height: 420 } } : options;
    const context = await browser.newContext(profileOptions), errors = [], blocked = [], checks = [], captures = [], accessibility = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      blocked.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(installFixture, fixture);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.clock.install({ time: new Date('2026-10-24T12:00:00Z') });
    await page.goto(origin + (suite === 'comets' ? '?shooting-stars' : '')); await page.locator('.session-grid').waitFor();
    await openPage(page, 'appearance');
    await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()); });
    await page.clock.pauseAt(new Date('2026-10-24T13:00:00Z'));
    await page.clock.runFor(50);
    await page.evaluate(() => window.rememberSettings());
    const capture = async (label, fromTop = true) => {
      if (fromTop) await page.evaluate(() => document.querySelector('.settings-stage').scrollTop = 0);
      await page.waitForTimeout(240); // Let finite switch/hover transitions settle for inspection.
      const file = `${name}-${label}.png`; await page.screenshot({ path: path.join(out, file) }); captures.push(file);
    };
    if (!suite) {
    await capture('classic-before');
    for (const mode of ['moving', 'ambient-off', 'reduced-motion']) {
      await page.emulateMedia({ reducedMotion: mode === 'reduced-motion' ? 'reduce' : 'no-preference' });
      await page.locator('[data-setting=ambientMotion]').setChecked(mode !== 'ambient-off');
      await page.clock.runFor(50);
      for (const [theme, kind] of themes) {
        await page.locator(`.theme-choice[data-frame="${theme}"]`).click();
        assert.ok(await page.locator(`[data-setting=trimStyle][value="${theme}"]`).isChecked());
        const change = await page.evaluate(() => window.fixtureChanges.at(-1));
        checkChange(change, theme, kind);
        checks.push({ mode, theme, ...change });
        if (mode === 'moving' && theme === 'fiery' && ['android', 'iphone'].includes(name)) await capture('fiery-selection', false);
        if ((mode === 'moving' && ['cyber', 'fiery'].includes(theme)) || (mode !== 'moving' && theme === 'fiery')) await capture(`${mode}-${theme}`);
      }
      if (mode !== 'moving') {
        const paused = await page.evaluate(() => window.inspectSettingsSky());
        await page.clock.runFor(120);
        const later = await page.evaluate(() => window.inspectSettingsSky());
        assert.equal(later.draws, paused.draws, 'theme changes keep paused animation loops stopped');
        assert.equal(later.pixelHash, paused.pixelHash, 'paused particles stay still');
      }
    }
    // Repeated state publications leave a paused sky alone when its theme is unchanged.
    await page.evaluate(() => window.dock.call('settings', { cursorBlink: true }));
    let change = await page.evaluate(() => window.fixtureChanges.at(-1));
    assert.equal(change.before.draws, change.after.draws);
    assert.equal(change.before.pixelHash, change.after.pixelHash);
    checks.push({ mode: 'unchanged-theme', ...change });
    // Stars Off remains empty through a theme change, then shows the current colors when enabled.
    await page.evaluate(() => window.dock.call('settings', { starDensity: 0 }));
    await page.evaluate(() => window.dock.call('settings', { trimStyle: 'blue' }));
    assert.equal((await page.evaluate(() => window.inspectSettingsSky())).painted, 0);
    await page.evaluate(() => window.dock.call('settings', { starDensity: 2 }));
    const enabled = await page.evaluate(() => window.inspectSettingsSky());
    assert.ok(enabled.painted > 0);
    assert.ok(enabled.expectedColors.every(color => enabled.colors.includes(color)));
    // An incoming state update also refreshes Settings outside Appearance.
    await openPage(page, 'general-settings'); await page.clock.runFor(50);
    await page.evaluate(() => window.rememberSettings());
    await page.evaluate(() => window.dock.call('settings', { trimStyle: 'cyber' }));
    change = await page.evaluate(() => window.fixtureChanges.at(-1)); checkChange(change, 'cyber', 'data');
    checks.push({ mode: 'general-settings', ...change });
    await capture('general-cyber');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('body[data-settings-open]').count(), 0);
    assert.equal(await page.locator('.settings-overlay').isVisible(), false);
    await openPage(page, 'appearance'); await page.clock.runFor(50);
    assert.equal(await page.locator('.settings-overlay').getAttribute('data-frame'), 'cyber');
    }
    await page.evaluate(() => window.rememberSettings());
    let motion = null, isolation = null;
    if (suite === 'comets') {
      motion = await checkShootingStars(page, capture);
    } else {
      motion = suite === 'rgb' ? null : await checkMovingBackground(page, capture);
    console.log(`${name}: moving-sky checks completed`);
    const audit = async selector => {
      if (!await page.evaluate(() => !!window.axe)) await page.addScriptTag({ url: origin + '/__checks__/axe.js' });
      // axe schedules timers; let them run after the precise sky measurements are complete.
      await page.clock.resume();
      const result = await page.evaluate(async selector => {
        const { violations, incomplete } = await window.axe.run(selector, { runOnly: { type: 'rule', values: ['color-contrast', 'label', 'button-name', 'aria-dialog-name'] } });
        return { selector, violations, incomplete };
      }, selector);
      await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 100)));
      accessibility.push(result);
    };
      isolation = suite === 'motion' ? null : await checkThemeIsolation(page, capture, audit);
    }
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    results.push({ profile: name, engine: browser.version(), emulated: name !== 'pc', checks, captures, errors, blocked,
      starsOffAndOn: !suite, reopen: !suite, motion, isolation, accessibility });
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(results, null, 2));
    assert.deepEqual([...(motion?.issues || []), ...(isolation?.issues || [])], [], name + ': moving background and theme isolation');
    assert.deepEqual(accessibility.flatMap(result => result.violations), [], name + ': scoped accessibility');
    console.log(`${name}: ${checks.length} live updates, ${motion?.measurements.length || 0} motion checks, ${isolation?.measurements.length || 0} color isolation checks; ${captures.length} screenshots`);
    await browser.close(); browser = null;
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
