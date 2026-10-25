'use strict';
// The shipped renderer, synthetic launch-qualified sessions and fake IPC only.
// Run after npm run build: node scripts/console-expansion-visual-check.cjs
const { chromium, webkit, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { initialSettings } = require('../electron/settings.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.join(root, '.build', 'prompt7-console-expansion');
fs.mkdirSync(out, { recursive: true });
const allProfiles = [
  ['windows-chromium', chromium, { viewport: { width: 1440, height: 900 } }],
  ['desktop-webkit-mac-emulation', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }],
  ['android-chromium-pixel7-emulation', chromium, devices['Pixel 7']],
  ['iphone-webkit-iphone13-emulation', webkit, devices['iPhone 13']],
];
const profiles = allProfiles.filter(([name]) => !process.env.PROMPT7_PROFILE || name === process.env.PROMPT7_PROFILE);
if (process.env.PROMPT7_PROFILE && !profiles.length) throw new Error(`Unknown PROMPT7_PROFILE: ${process.env.PROMPT7_PROFILE}`);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
const copy = value => JSON.parse(JSON.stringify(value));
const makeSession = (id, slot, options = {}) => ({
  id, consoleKey: id, projectId: null, slot, width: 1, height: 1,
  name: options.name || `Console ${slot}`, nameMode: 'custom', cwd: `C:\\Workspace\\console-${slot}`,
  provider: options.provider || 'shell', permissions: 'default', launchModel: '', accountId: null,
  accountLabel: options.accountLabel || null, launchId: `launch-${id}`, purpose: 'agent', switching: false, dismissed: !!options.dismissed,
  draftSupported: false, switchTargets: options.switchTargets || [], state: options.state || 'open',
  alive: options.alive !== false, ...(options.restoreError ? { restoreError: options.restoreError } : {}),
  cols: 84, rows: 22, sequence: 0, usage: null, createdAt: 1, updatedAt: 1,
});
function makeState() {
  const settings = initialSettings({
    setupComplete: true, suggestProjects: false, restoreConsoles: false, lighting: 'wave',
    slotTrims: { 1: 'gamer', 2: 'icy' }, consoleDefaults: { provider: 'shell', cwd: 'C:\\Workspace', name: '', command: '' },
  }, 'C:\\Workspace', {});
  return {
    mode: 'dashboard', transitioning: false, trayHidden: false,
    grid: { columns: 3, rows: 3 },
    sessions: [
      makeSession('console-a', 1, { provider: 'codex', name: 'Expanded fixture', accountLabel: 'Fixture account', state: 'ready', switchTargets: [{ id: 'codex:fixture-two', label: 'Fixture two', ready: true }] }),
      makeSession('console-b', 2, { name: 'Covered ready fixture', state: 'ready' }),
      makeSession('console-error', 4, { name: 'Saved fixture', alive: false, restoreError: 'Fixture restore error.' }),
      makeSession('console-ended', 3, { name: 'Dismissed fixture', dismissed: true, state: 'ended' }),
    ],
    settings, projects: [], agents: [], accounts: [], limits: [], recent: [], accountError: null,
    refreshing: false, lastRefresh: 0, capabilities: {}, sshHosts: [], messages: [], ledger: [],
    summary: { requests: 0, tokens: 0 }, shared: { connections: [], profiles: [], imageGeneration: { provider: 'agent', previewFirst: true }, instructions: '' },
    workbench: { results: [], concepts: [], unreadResults: 0, setupRequests: [] },
    vault: { available: false, entries: [] }, integrations: [], toolCatalog: [], toolLimits: {},
    defaultFolder: 'C:\\Workspace', version: 'fixture', screenshot: null,
  };
}
const coversViewport = panel => panel.evaluate(el => {
  const rect = el.getBoundingClientRect();
  const top = document.querySelector('.titlebar').getBoundingClientRect().height;
  return rect.left <= 1 && Math.abs(rect.top - top) <= 1 && Math.abs(rect.right - innerWidth) <= 1 && Math.abs(rect.bottom - innerHeight) <= 1;
});
const profileResults = [];
let browser;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const [name, type, options] of profiles) {
    browser = await type.launch({ headless: true });
    const context = await browser.newContext(options);
    await context.addInitScript(() => {
      localStorage.setItem('console-text-steps', JSON.stringify({ 'console-a': 3 }));
      const clearRect = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas?.classList.contains('panel-sky')) this.canvas.dataset.drawCount = String(Number(this.canvas.dataset.drawCount || 0) + 1);
        return clearRect.apply(this, args);
      };
    });
    let state = makeState(), page, pendingMode = null, delayFullscreen = false, pendingState = null, delayStateResponse = false, sequence = new Map();
    const calls = { buffers: {}, inputs: [], resizes: [], names: [] }, errors = [];
    const publish = async () => { if (page) await page.evaluate(value => window.fixtureReceive?.(value), copy(state)); };
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      if (method === 'state') {
        const value = copy(state);
        if (delayStateResponse) {
          delayStateResponse = false;
          return new Promise(resolve => { pendingState = () => { pendingState = null; resolve({ ok: true, value }); }; });
        }
        return { ok: true, value };
      }
      if (method === 'mode') {
        if (delayFullscreen && payload === 'fullscreen') {
          delayFullscreen = false;
          return new Promise(resolve => { pendingMode = async () => { state.mode = 'fullscreen'; state.transitioning = false; await publish(); pendingMode = null; resolve({ ok: true, value: null }); }; });
        }
        state.mode = payload; state.transitioning = false; await publish(); return { ok: true, value: null };
      }
      if (method === 'session.buffer') {
        const id = payload; calls.buffers[id] = (calls.buffers[id] || 0) + 1;
        const lines = Array.from({ length: 72 }, (_, i) => {
          const label = `fixture ${id} line ${String(i + 1).padStart(2, '0')}`;
          const wrapped = Array.from({ length: 7 }, (_, block) => String.fromCharCode(65 + block).repeat(40)).join('');
          return i === 10 ? `${label} ${wrapped} WRAP-11 ${'Y'.repeat(120)}` : label;
        }).join('\r\n');
        const item = state.sessions.find(session => session.id === id);
        return { ok: true, value: { data: `${lines}\r\nPS C:\\Workspace\\console> `, sequence: 0, launchId: item?.launchId || null } };
      }
      if (method === 'session.resize') { calls.resizes.push(copy(payload)); return { ok: true, value: null }; }
      if (method === 'session.input') {
        calls.inputs.push(copy(payload));
        const item = state.sessions.find(session => session.id === payload.id);
        const next = (sequence.get(payload.id) || 0) + 1; sequence.set(payload.id, next);
        await page.evaluate(packet => window.fixtureOutput?.(packet), { id: payload.id, launchId: item?.launchId, sequence: next, data: payload.data });
        return { ok: true, value: null };
      }
      if (method === 'session.acknowledge') {
        const item = state.sessions.find(session => session.id === payload);
        if (item) item.state = 'open';
        await publish(); return { ok: true, value: null };
      }
      if (method === 'settings') { state.settings = { ...state.settings, ...payload }; await publish(); return { ok: true, value: null }; }
      if (method === 'slot.name') {
        calls.names.push(copy(payload));
        const item = state.sessions.find(session => session.id === payload.sessionId);
        if (item) item.name = payload.name;
        state.settings.slotNames[payload.slot] = payload.name;
        await publish(); return { ok: true, value: null };
      }
      if (method === 'session.end') throw new Error('Fixture end confirmation failed');
      throw new Error(`Unexpected fake renderer call: ${method}`);
    });
    await context.addInitScript(() => {
      window.dock = {
        call: (method, payload) => window.fixtureCall(method, payload),
        onState: callback => { window.fixtureReceive = callback; },
        onOutput: callback => { window.fixtureOutput = callback; },
        onSelect: callback => { window.fixtureSelect = callback; },
        onNotice: callback => { window.fixtureNotice = callback; },
      };
    });
    page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('.session-card[data-console-id="console-a"] .xterm-screen').waitFor();
    await page.waitForTimeout(180);
    const card = id => page.locator(`.session-card[data-console-id="${id}"]`);
    const toggle = id => card(id).locator('[data-action="toggle-console"]');
    const capture = async suffix => {
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(out, `${name}-${suffix}.png`);
      await page.screenshot({ path: file }); return path.basename(file);
    };
    const captures = [await capture('grid-3x3')];
    assert.equal(await page.locator('.session-card[data-console-id="console-ended"]').count(), 0, 'ended consoles stay out of the grid');
    assert.equal(await page.locator('#terminal-page,#terminal-tabs').count(), 0, 'there is no duplicate terminal page or session strip');
    assert.equal(await card('console-error').locator('[data-action="retry-session"]').count(), 1, 'restore errors keep their retry action');
    assert.equal(await card('console-a').locator('[data-console-project]').getAttribute('aria-label'), 'Add to project', 'a null project stays unlinked');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: grid has no horizontal overflow`);

    await page.evaluate(() => window.fixtureSelect('console-ended'));
    assert.equal(await page.locator('.session-card.console-expanded').count(), 0, 'stale notifications cannot expand a different console');
    assert.equal(state.mode, 'dashboard');
    assert.equal(await page.locator('.session-card[data-console-id="console-ended"]').count(), 0, 'dismissed sessions stay out of the grid while PTY exit settles');

    delayFullscreen = true;
    await toggle('console-a').click();
    const gateDeadline = Date.now() + 5000;
    while (!pendingMode && Date.now() < gateDeadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(pendingMode, 'fixture held the fullscreen request');
    await page.locator('.sidebar nav [data-page="projects"]').click();
    await pendingMode();
    await page.locator('.session-card.console-expanded').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#content').getAttribute('data-view'), 'projects', 'navigation cancels a pending console expansion');
    assert.equal(await page.locator('#sidebar').evaluate(el => el.inert), false);
    state.mode = 'dashboard'; await publish();
    await page.locator('.sidebar nav [data-page="consoles"]').click();

    state.sessions.push(makeSession('console-stale', 5, { name: 'Stale response fixture' }));
    await publish();
    delayStateResponse = true;
    await page.evaluate(id => { window.staleSelection = window.fixtureSelect(id); }, 'console-stale');
    const stateDeadline = Date.now() + 5000;
    while (!pendingState && Date.now() < stateDeadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(pendingState, 'fixture held the state response after mode changed');
    const staleTarget = state.sessions.find(session => session.id === 'console-stale');
    staleTarget.alive = false; staleTarget.dismissed = true; staleTarget.state = 'ended';
    await publish();
    pendingState();
    assert.equal(await page.evaluate(() => window.staleSelection), false, 'a stale state response cannot reopen a dismissed target');
    assert.equal(await page.locator('.session-card.console-expanded').count(), 0, 'dismissed target remains collapsed');
    state.sessions = state.sessions.filter(session => session.id !== 'console-stale');
    state.mode = 'dashboard'; await publish();

    await page.locator('.sidebar-bottom [data-page="settings"]').click();
    const confirmation = page.locator('[data-setting="confirmConsoleEnd"]');
    assert.equal(await confirmation.isChecked(), true, 'end confirmation defaults on in Settings');
    assert.match(await confirmation.locator('..').innerText(), /end or remove the selected console without a prompt/i);
    await confirmation.uncheck(); assert.equal(state.settings.confirmConsoleEnd, false);
    await confirmation.check(); assert.equal(state.settings.confirmConsoleEnd, true);
    await page.keyboard.press('Escape');
    await page.locator('#content').waitFor({ state: 'hidden' });

    const panel = card('console-a');
    let wrappedAnchorLine = null;
    await page.evaluate(() => {
      window.expansionTerminal = document.querySelector('[data-terminal-id="console-a"]');
      window.expansionSkies = [...document.querySelectorAll('.session-card .panel-sky')];
      const readyCard = document.querySelector('.session-card[data-console-id="console-b"]');
      const readyTrace = readyCard?.querySelector('.theme-trace');
      window.readySnapshot = { className: readyCard?.className, traceAnimations: readyTrace?.getAnimations().map(animation => ({ name: animation.animationName, playState: animation.playState, currentTime: animation.currentTime })), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
      window.readyEffect = readyTrace?.getAnimations().find(animation => animation.animationName === 'console-ready-trace');
      window.openingCount = document.querySelectorAll('.launch-burst').length;
    });
    await panel.locator('.xterm-helper-textarea').focus();
    await page.keyboard.type('draft stays');
    await page.waitForFunction(() => document.querySelector('.session-card[data-console-id="console-a"] .xterm-rows')?.textContent.includes('draft stays'));
    const followInputCount = calls.inputs.length, followBufferReads = calls.buffers['console-a'];
    await toggle('console-a').click();
    await page.locator('.session-card.console-expanded[data-console-id="console-a"]').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.session-card.console-expanded[data-console-id="console-a"]')).transform === 'none');
    assert.equal(await panel.locator('.xterm-rows').evaluate(element => element.textContent.includes('draft stays')), true, 'a console following output stays at the bottom when expanded');
    await panel.locator('.console-expand').click();
    await page.locator('.session-card.console-expanded').waitFor({ state: 'detached' });
    assert.equal(await panel.locator('.xterm-rows').evaluate(element => element.textContent.includes('draft stays')), true, 'restore keeps a console following output at the bottom');
    assert.equal(calls.inputs.length, followInputCount, 'expand and restore do not submit terminal text');
    assert.equal(calls.buffers['console-a'], followBufferReads, 'the follow-mode cycle does not replay the terminal buffer');
    const scrollInputsBefore = calls.inputs.length;
    let contentAnchor = 'fixture console-a line 01';
    const visibleBeforeScroll = await panel.locator('.xterm-rows').textContent();
    const firstVisibleLine = () => panel.locator('.xterm-rows').evaluate(element => [...element.children].map(row => row.textContent.trim()).find(Boolean) || '');
    const scrollHistory = async deltaY => {
      if (name === 'iphone-webkit-iphone13-emulation') {
        await panel.locator('.xterm-helper-textarea').focus();
        await page.keyboard.press(deltaY < 0 ? 'Shift+PageUp' : 'Shift+PageDown');
      } else await page.mouse.wheel(0, deltaY);
    };
    await panel.locator('.xterm-screen').hover();
    for (let index = 0; index < 100; index++) {
      if ((await firstVisibleLine()).includes(contentAnchor)) break;
      await scrollHistory(-900);
      await page.waitForTimeout(24);
    }
    assert.equal((await firstVisibleLine()).includes(contentAnchor), true, `${name === 'iphone-webkit-iphone13-emulation' ? 'Shift+PageUp scrolling' : 'a real wheel scroll'} reaches the early terminal history anchor`);
    if (name === 'windows-chromium') {
      contentAnchor = 'RAP-11';
      let visibleRows = [], scrollTrace = [];
      for (let index = 0; index < 100; index++) {
        visibleRows = await panel.locator('.xterm-rows').evaluate(element => [...element.children].map(row => row.textContent.trim()).filter(Boolean));
        if (index < 30) scrollTrace.push({ index, first: visibleRows[0], anchorRow: visibleRows.findIndex(row => row.includes(contentAnchor)) });
        if (/^[EFG]/.test(visibleRows[0] || '') && visibleRows.join('').includes(contentAnchor)) break;
        await page.mouse.wheel(0, 10);
        await page.waitForTimeout(20);
      }
      visibleRows = await panel.locator('.xterm-rows').evaluate(element => [...element.children].map(row => row.textContent.trim()).filter(Boolean));
      assert.equal(/^[EFG]/.test(visibleRows[0] || '') && visibleRows.join('').includes(contentAnchor), true, `the duplicate-prefix fixture positions a wrapped line 11 continuation at the viewport anchor: ${JSON.stringify({ visibleRows, scrollTrace })}`);
      wrappedAnchorLine = visibleRows[0];
    }
    const visibleAfterScroll = await panel.locator('.xterm-rows').textContent();
    const scrollMetrics = await panel.locator('.xterm-viewport').evaluate(element => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
    fs.writeFileSync(path.join(out, `${name}-scroll-evidence.json`), JSON.stringify({ before: visibleBeforeScroll, after: visibleAfterScroll, scrollMetrics }, null, 2));
    assert.equal(visibleAfterScroll.includes(contentAnchor), true, `a real wheel scroll reveals an early terminal history anchor: ${JSON.stringify({ before: visibleBeforeScroll, after: visibleAfterScroll, scrollMetrics })}`);
    assert.equal(calls.inputs.length, scrollInputsBefore, 'wheel scrolling does not send terminal input');
    const inputCount = calls.inputs.length, bufferReads = calls.buffers['console-a'];
    const textSizeBefore = await panel.locator('.xterm-rows').first().evaluate(element => getComputedStyle(element).fontSize);
    const waveBefore = await page.evaluate(() => {
      window.waveAnimations = document.getAnimations().filter(animation => animation.animationName === 'light-wave');
      return window.waveAnimations.map(animation => animation.currentTime).filter(Number.isFinite);
    });
    await toggle('console-a').click();
    await page.locator('.session-card.console-expanded[data-console-id="console-a"]').waitFor();
    await page.waitForTimeout(180);
    const expandedBounds = async () => page.evaluate(() => {
      const rect = element => { const r = element.getBoundingClientRect(); return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height }; };
      const panel = document.querySelector('.session-card.console-expanded'), ancestors = [];
      for (let node = panel; node; node = node.parentElement) {
        const style = getComputedStyle(node), animations = node.getAnimations().map(animation => ({ name: animation.animationName || 'anonymous', playState: animation.playState, currentTime: animation.currentTime }));
        ancestors.push({ tag: node.tagName, id: node.id || '', className: String(node.className || ''), position: style.position, inset: style.inset, transform: style.transform, transformOrigin: style.transformOrigin, transitionProperty: style.transitionProperty, transitionDuration: style.transitionDuration, animations, rect: rect(node) });
      }
      return { viewport: { width: innerWidth, height: innerHeight }, titlebar: rect(document.querySelector('.titlebar')), panel: rect(panel), ancestors };
    });
    const inFlightBounds = await expandedBounds();
    await page.waitForFunction(() => {
      const panel = document.querySelector('.session-card.console-expanded[data-console-id="console-a"]');
      return panel && getComputedStyle(panel).transform === 'none';
    }, null, { timeout: 1200 });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const settledBounds = await expandedBounds();
    fs.writeFileSync(path.join(out, `${name}-expanded-bounds.json`), JSON.stringify({ inFlight: inFlightBounds, settled: settledBounds }, null, 2));
    assert.equal(await coversViewport(panel), true, `${name}: selected panel covers the viewport`);
    await panel.locator('.console-name').fill('Uncommitted title');
    await panel.locator('.console-name').press('Escape');
    assert.equal(await panel.locator('.console-name').inputValue(), 'Expanded fixture', 'Escape cancels inline title editing');
    assert.equal(await page.locator('.session-card.console-expanded[data-console-id="console-a"]').count(), 1, 'inline title Escape keeps the console expanded');
    assert.equal(calls.names.length, 0, 'canceling inline rename does not persist edited text');
    assert.equal(await page.evaluate(() => document.querySelector('[data-terminal-id="console-a"]') === window.expansionTerminal), true, 'the terminal node is reused');
    assert.equal(await panel.locator('[data-terminal-id="console-a"]').count(), 1, 'one terminal node remains');
    assert.equal(calls.buffers['console-a'], bufferReads, 'expansion does not reread or replay the terminal buffer');
    assert.equal(calls.inputs.length, inputCount, 'expansion emits no terminal input');
    const expandedRows = await panel.locator('.xterm-rows').evaluate(element => [...element.children].map(row => row.textContent.trim()));
    assert.equal(expandedRows.join('').includes(contentAnchor), true, `the scrolled terminal history anchor stays visible while expanded: ${JSON.stringify(expandedRows)}`);
    if (name === 'windows-chromium') assert.equal(await panel.locator('.xterm-rows').evaluate((element, anchor) => [...element.children].map(row => row.textContent.trim()).join('').includes(anchor), contentAnchor), true, 'the registered wrapped-line anchor keeps its cell offset across terminal reflow');
    assert.equal(await panel.locator('.xterm-rows').first().evaluate(element => getComputedStyle(element).fontSize), textSizeBefore, 'the console text-size choice stays put');
    assert.equal(await page.locator('#sidebar').evaluate(el => el.inert), true, 'covered navigation leaves keyboard focus');
    assert.equal(await page.locator('.titlebar').evaluate(el => el.inert), false, 'window controls remain available above the console');
    assert.equal(await page.locator('.titlebar [data-action="hud"]').isVisible(), true, 'the HUD entry point remains available');
    assert.equal(await page.locator('.titlebar [data-action="fullscreen"]').isVisible(), true, 'the window mode entry point remains available');
    await panel.locator('[data-action="end-session"]').click();
    await page.locator('#toast.visible').waitFor();
    assert.match(await page.locator('#toast').textContent(), /Fixture end confirmation failed/);
    assert.ok(Number(await page.locator('#toast').evaluate(element => getComputedStyle(element).zIndex)) > 1000, 'end feedback stays above the expanded console');
    assert.equal(await page.locator('.session-card.console-expanded[data-console-id="console-a"]').count(), 1, 'an end error keeps the console visible');
    await page.waitForTimeout(2200);
    assert.equal(await page.locator('.session-card[data-console-id="console-b"]').evaluate(el => el.inert), true, 'covered consoles leave keyboard focus');
    assert.equal(await page.locator('.session-card[data-console-id="console-b"] .console-skin').evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
    assert.equal(await page.evaluate(() => window.readyEffect && document.querySelector('.session-card[data-console-id="console-b"] .theme-trace').getAnimations().includes(window.readyEffect) && window.readyEffect.playState === 'paused'), true, 'the covered Ready trace pauses without being replaced');
    const skyDrawsBefore = await page.locator('.session-card[data-console-id="console-b"] .panel-sky').getAttribute('data-draw-count');
    const regionSkyDrawsBefore = await page.locator('#sidebar > .panel-sky, #consoles-page > .panel-sky').evaluateAll(canvases => canvases.map(canvas => canvas.getAttribute('data-draw-count')));
    const selectedSkyDrawsBefore = Number(await panel.locator('.panel-sky').getAttribute('data-draw-count'));
    const waveAtOcclusion = await page.evaluate(() => {
      const all = document.getAnimations().filter(animation => animation.animationName === 'light-wave');
      window.waveAtOcclusion = all.map(animation => ({ animation, id: animation.effect.target?.closest('.session-card')?.dataset.consoleId || null, time: animation.currentTime }));
      return window.waveAtOcclusion.map(record => ({ id: record.id, state: record.animation.playState, time: record.time }));
    });
    await page.waitForFunction(before => Number(document.querySelector('.session-card.console-expanded .panel-sky')?.getAttribute('data-draw-count') || 0) > before, selectedSkyDrawsBefore, { polling: 50, timeout: 3000 });
    assert.equal(await page.locator('.session-card[data-console-id="console-b"] .panel-sky').getAttribute('data-draw-count'), skyDrawsBefore, 'covered sky stops painting');
    assert.deepEqual(await page.locator('#sidebar > .panel-sky, #consoles-page > .panel-sky').evaluateAll(canvases => canvases.map(canvas => canvas.getAttribute('data-draw-count'))), regionSkyDrawsBefore, 'covered sidebar and grid skies stop painting');
    const selectedSkyGeometry = await panel.locator('.panel-sky').evaluate(canvas => {
      const style = getComputedStyle(canvas), host = canvas.parentElement, hostStyle = getComputedStyle(host);
      const rect = element => { const box = element.getBoundingClientRect(); return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
      return { canvasRects: canvas.getClientRects().length, offsetParent: canvas.offsetParent?.tagName || null, display: style.display, visibility: style.visibility, opacity: style.opacity, rect: rect(canvas), hostClass: host.className, hostVisibility: hostStyle.visibility, hostRect: rect(host), bodyClass: document.body.className, hidden: canvas.hidden };
    });
    const selectedSkyEnvironment = await page.evaluate(() => new Promise(resolve => {
      let frames = 0, finished = false;
      const finish = timedOut => { if (finished) return; finished = true; clearTimeout(timer); resolve({ hidden: document.hidden, visibilityState: document.visibilityState, ambient: document.body.dataset.ambient, visualPaused: document.body.dataset.visualPaused, stars: document.body.dataset.stars, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, openDialogs: [...document.querySelectorAll('dialog[open]')].map(dialog => dialog.id || dialog.getAttribute('aria-label') || 'unnamed'), animationFrames: frames, timedOut }); };
      const timer = setTimeout(() => finish(true), 350);
      const frame = () => { frames++; if (frames >= 3) finish(false); else requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    }));
    const selectedSkyAfter = Number(await panel.locator('.panel-sky').getAttribute('data-draw-count'));
    assert.ok(selectedSkyAfter > selectedSkyDrawsBefore, `the expanded console keeps painting its selected sky: ${JSON.stringify({ before: selectedSkyDrawsBefore, after: selectedSkyAfter, geometry: selectedSkyGeometry, environment: selectedSkyEnvironment })}`);
    const waveProgress = await page.evaluate(() => window.waveAtOcclusion.map(record => ({
      id: record.id, same: document.getAnimations().includes(record.animation), state: record.animation.playState, time: record.animation.currentTime,
    })));
    assert.ok(waveProgress.every(record => record.same), 'wave animation objects survive expansion');
    assert.ok(waveAtOcclusion.filter(record => record.id === 'console-a').every(record => record.state === 'running'), 'the expanded console keeps its selected Wave effect running');
    assert.ok(waveAtOcclusion.filter(record => record.id && record.id !== 'console-a').every(record => record.state === 'paused'), 'covered console Waves pause');
    assert.ok(waveProgress.filter(record => record.id === 'console-a').some((record, index) => record.time - waveAtOcclusion.filter(item => item.id === 'console-a')[index].time > 70), 'the selected Wave advances while expanded');
    assert.ok(waveProgress.filter(record => record.id && record.id !== 'console-a').every((record, index) => Math.abs(record.time - waveAtOcclusion.filter(item => item.id && item.id !== 'console-a')[index].time) < 5), 'covered Wave time stays paused');
    assert.equal(await panel.locator('.console-grip').isDisabled(), true, 'grid dragging is disabled while expanded');
    assert.equal(await panel.locator('.console-resize').first().isVisible(), false, 'grid resize handles are hidden while expanded');
    assert.equal(await page.locator('.session-card.console-expanded').count(), 1);
    assert.equal(calls.inputs.length, inputCount, 'the focused terminal did not receive lifecycle keystrokes');
    await page.evaluate(() => window.dock.call('settings', { confirmConsoleEnd: false }));
    assert.equal(state.settings.confirmConsoleEnd, false);
    assert.equal(await page.locator('.session-card.console-expanded[data-console-id="console-a"]').count(), 1, 'settings updates keep the expanded target');
    await page.evaluate(() => window.dock.call('settings', { confirmConsoleEnd: true }));
    assert.equal(state.settings.confirmConsoleEnd, true);
    const buffersAfterExpand = calls.buffers['console-a'];
    const resizeCount = calls.resizes.filter(value => value.id === 'console-a').length;
    await page.waitForTimeout(180);
    assert.equal(calls.resizes.filter(value => value.id === 'console-a').length, resizeCount, 'resize requests settle after expansion');
    captures.push(await capture('expanded-3x3'));

    await panel.locator('.console-expand').click();
    await page.locator('.session-card.console-expanded').waitFor({ state: 'detached' });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.session-card[data-console-id="console-a"]')).transform === 'none');
    const restoreWaitStarted = Date.now();
    await page.waitForFunction(({ anchor, firstRow }) => {
      const rows = [...document.querySelectorAll('.session-card[data-console-id="console-a"] .xterm-rows > div')].map(row => row.textContent.trim());
      return rows.join('').includes(anchor) && (!firstRow || rows[0] === firstRow);
    }, { anchor: contentAnchor, firstRow: name === 'windows-chromium' ? wrappedAnchorLine : null }, { polling: 50, timeout: 5000 });
    const restoreWaitMs = Date.now() - restoreWaitStarted;
    assert.equal(await page.evaluate(() => document.querySelector('[data-terminal-id="console-a"]') === window.expansionTerminal), true, 'restore reuses the same terminal before a HUD round-trip');
    assert.equal(calls.buffers['console-a'], buffersAfterExpand, 'restore does not reread or replay the terminal buffer');
    const firstRestoredRows = await panel.locator('.xterm-rows').evaluate(element => [...element.children].map(row => row.textContent.trim()).filter(Boolean));
    assert.equal(firstRestoredRows.join('').includes(contentAnchor), true, `restore keeps the scrolled content anchor visible: ${JSON.stringify({ firstRestoredRows, restoreWaitMs })}`);
    if (name === 'windows-chromium') assert.equal(firstRestoredRows[0], wrappedAnchorLine, 'restore keeps the same wrapped continuation at the viewport start');
    const readyResumed = await page.evaluate(() => window.readyEffect && document.querySelector('.session-card[data-console-id="console-b"] .theme-trace').getAnimations().includes(window.readyEffect) && window.readyEffect.playState === 'running');
    assert.equal(readyResumed, true, 'the existing Ready trace resumes after restore');
    await page.waitForTimeout(160);
    assert.equal(await page.evaluate(() => window.readyEffect.currentTime > 0), true, 'the Ready trace continues from its paused phase');
    const waveResumed = await page.evaluate(() => {
      const animations = document.getAnimations().filter(animation => animation.animationName === 'light-wave');
      const times = animations.map(animation => animation.currentTime).filter(Number.isFinite);
      return { retained: window.waveAtOcclusion.every(record => document.getAnimations().includes(record.animation)), count: animations.length, running: animations.every(animation => animation.playState === 'running'), spread: times.length ? Math.max(...times) - Math.min(...times) : Infinity };
    });
    assert.ok(waveResumed.retained && waveResumed.count >= waveBefore.length && waveResumed.running && waveResumed.spread < 80, 'Wave effects resume on the shared phase before the HUD round-trip');
    assert.equal(await page.evaluate(() => window.expansionSkies.every((node, index) => node === document.querySelectorAll('.session-card .panel-sky')[index])), true, 'restore retains the existing sky canvases');
    assert.equal(await page.locator('.launch-burst').count(), 0, 'restore does not replay an opening effect');
    assert.equal(await page.evaluate(() => window.openingCount), 0);
    captures.push(await capture('restored-3x3'));

    await toggle('console-a').click();
    await page.locator('.session-card.console-expanded[data-console-id="console-a"]').waitFor();

    await page.locator('.titlebar [data-action="fullscreen"]').click();
    await page.waitForFunction(() => window.dock.call('state').then(result => result.value.mode === 'dashboard'));
    assert.equal(await page.locator('.session-card.console-expanded[data-console-id="console-a"]').count(), 1, 'window mode changes keep the selected console');
    await page.locator('.titlebar [data-action="fullscreen"]').click();
    await page.waitForFunction(() => window.dock.call('state').then(result => result.value.mode === 'fullscreen'));
    await page.locator('.titlebar [data-action="hud"]').click();
    await page.waitForSelector('#hud:not([hidden])');
    assert.equal(await page.locator('.session-card.console-expanded').count(), 0, 'the HUD takes over from the expanded grid');
    assert.equal(state.sessions.find(session => session.id === 'console-a').alive, true, 'HUD mode leaves the selected fake session alive');
    await page.locator('#hud .hud-title [data-action="dashboard"]').click();
    await page.waitForSelector('#hud[hidden]', { state: 'attached' });
    await page.evaluate(() => window.fixtureSelect('console-a'));
    await page.locator('.session-card.console-expanded[data-console-id="console-a"]').waitFor();

    await page.locator('.console-expanded [data-account-menu-toggle]').click();
    await page.locator('.account-menu-items:popover-open').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.account-menu-items:popover-open').count(), 0, 'Escape dismisses the account menu first');
    assert.equal(await page.locator('.session-card.console-expanded').count(), 1, 'Escape keeps the expanded console while a menu was open');
    await panel.locator('[data-console-project]').click();
    await page.locator('#console-project-picker').waitFor({ state: 'visible' });
    assert.match(await page.locator('[data-project-help]').textContent(), /No project is linked/);
    await page.keyboard.press('Escape');
    await page.locator('#console-project-picker').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.session-card.console-expanded').count(), 1, 'Escape dismisses a project dialog before restoring');
    await page.keyboard.press('Escape');
    await page.locator('.session-card.console-expanded').waitFor({ state: 'detached' });
    await page.waitForFunction(({ anchor, firstRow }) => {
      const rows = [...document.querySelectorAll('.session-card[data-console-id="console-a"] .xterm-rows > div')].map(row => row.textContent.trim());
      return rows.join('').includes(anchor) && (!firstRow || rows[0] === firstRow);
    }, { anchor: contentAnchor, firstRow: name === 'windows-chromium' ? wrappedAnchorLine : null }, { polling: 50, timeout: 5000 });
    assert.equal(await page.evaluate(() => document.querySelector('[data-terminal-id="console-a"]') === window.expansionTerminal), true, 'restore keeps the same terminal node');
    assert.equal(calls.buffers['console-a'], buffersAfterExpand, 'restore does not reread the terminal buffer');
    const nestedRestoreRows = await panel.locator('.xterm-rows').evaluate(element => [...element.children].map(row => row.textContent.trim()).filter(Boolean));
    assert.equal(nestedRestoreRows.join('').includes(contentAnchor), true, 'nested Escape restores the same terminal history anchor');
    if (name === 'windows-chromium') {
      assert.equal(nestedRestoreRows[0], wrappedAnchorLine, 'nested Escape keeps the registered wrapped-line offset');
    }
    assert.equal(await panel.locator('.xterm-rows').first().evaluate(element => getComputedStyle(element).fontSize), textSizeBefore);
    assert.equal(await page.evaluate(() => window.expansionSkies.every((node, index) => node === document.querySelectorAll('.session-card .panel-sky')[index])), true, 'restore retains the existing sky canvases');
    assert.equal(await page.locator('.launch-burst').count(), 0, 'restore does not replay an opening effect');
    assert.equal(await page.evaluate(() => window.openingCount), 0);
    assert.equal(await panel.locator('.console-expand').evaluate(el => el === document.activeElement), true, 'Escape restores focus to the console control');
    assert.equal(calls.resizes.filter(value => value.id === 'console-a').length >= resizeCount, true);

    await toggle('console-a').click(); await page.locator('.session-card.console-expanded').waitFor();
    await page.locator('.sidebar nav [data-page="projects"]').evaluate(element => element.click());
    assert.equal(await page.locator('body').evaluate(element => element.classList.contains('console-expanded')), false, 'navigation clears expansion styling without waiting for a state broadcast');
    assert.equal(await page.locator('.session-card.console-expanded').count(), 0, 'navigation removes the stale expanded-card marker immediately');
    assert.equal(await page.locator('#sidebar').evaluate(element => element.inert), false, 'navigation restores sidebar focus immediately');
    assert.equal(await page.locator('#content').evaluate(element => element.inert), false, 'navigation restores page focus immediately');
    assert.equal(await page.locator('.session-card[data-console-id="console-b"]').evaluate(element => element.inert), false, 'navigation restores sibling console focus immediately');
    await page.locator('.sidebar nav [data-page="consoles"]').click();

    for (const [columns, rows] of [[2, 2], [4, 2], [3, 3]]) {
      state.grid = { columns, rows }; state.settings.grid = state.grid; await publish();
      await toggle('console-a').click(); await page.locator('.session-card.console-expanded').waitFor();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.session-card.console-expanded')).transform === 'none');
      assert.equal(await coversViewport(panel), true, `${name}: ${columns}x${rows} expands in place`);
      await page.keyboard.press('Control+Shift+Enter');
      await page.locator('.session-card.console-expanded').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.session-card[data-console-id="console-a"]').getAttribute('data-slot'), '1');
    }
    await page.locator('.session-card[data-console-id="console-a"] [data-action="toggle-console"]').click();
    await page.locator('.session-card.console-expanded').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.session-card.console-expanded').count(), 1, 'plain Escape stays with the focused terminal');
    assert.ok(calls.inputs.some(input => input.id === 'console-a' && input.data === '\u001b'), 'plain Escape reaches the CLI');
    await panel.locator('.xterm-helper-textarea').focus();
    const beforeKeyboardRestore = calls.inputs.length;
    await page.keyboard.press('Control+Shift+Enter');
    await page.locator('.session-card.console-expanded').waitFor({ state: 'detached' });
    assert.equal(calls.inputs.length, beforeKeyboardRestore, 'the restore shortcut sends no Enter or other input to the CLI');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.session-card[data-console-id="console-a"] .theme-wave').evaluate(el => getComputedStyle(el, '::before').animationName), 'none', 'reduced motion disables the wave');
    await toggle('console-a').click(); await page.locator('.session-card.console-expanded').waitFor();
    await page.keyboard.press('Control+Shift+Enter'); await page.locator('.session-card.console-expanded').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.querySelector('[data-terminal-id="console-a"]') === window.expansionTerminal), true);
    assert.equal(calls.buffers['console-a'], buffersAfterExpand, 'grid sizes and reduced motion do not replay the buffer');
    if (name === 'windows-chromium') {
      await page.setViewportSize({ width: 320, height: 740 });
      await toggle('console-a').click(); await page.locator('.session-card.console-expanded').waitFor();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.session-card.console-expanded')).transform === 'none');
      assert.equal(await coversViewport(panel), true, '320px viewport keeps the expanded console in frame');
      captures.push(await capture('expanded-320px'));
      await page.keyboard.press('Control+Shift+Enter'); await page.locator('.session-card.console-expanded').waitFor({ state: 'detached' });
    }
    assert.deepEqual(errors, [], `${name}: renderer errors`);
    profileResults.push({ profile: name, engine: browser.version(), emulated: name !== 'windows-chromium', captures, calls: { bufferReads: calls.buffers, inputs: calls.inputs.length, resizeRequests: calls.resizes.length }, passed: true });
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(profileResults, null, 2));
    console.log(`PASS ${name}`);
    await context.close(); await browser.close(); browser = null;
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
