'use strict';

// Capture real renderer openings and state transitions against a fake dock.
// No CLI starts, account data or paid model requests are used.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const fixture = path.join(root, 'artifacts/console-layout/fixture.json');
const out = path.resolve(process.env.PADDOCK_EFFECTS_OUT || path.join(root, '.build/codex-prompt-runs/2026-10-24/4/verification/appearance-effects'));
const themes = ['classic', 'hot-pink', 'blue', 'violet', 'void', 'redline', 'cyber', 'icy', 'fiery', 'gamer', 'normal'];
const openings = { classic: 'bloom', 'hot-pink': 'neon', blue: 'lightning', violet: 'portal', void: 'implode', redline: 'redline', cyber: 'glitch', icy: 'frost', fiery: 'explosion', gamer: 'spectrum', normal: 'soft' };
const allProfiles = [
  { id: 'windows-chromium', engine: chromium, viewport: { width: 1440, height: 900 } },
  { id: 'mac-webkit', engine: webkit, viewport: { width: 1440, height: 900 } },
  { id: 'android-chromium', engine: chromium, device: devices['Pixel 7'] || { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true } },
  { id: 'iphone-webkit', engine: webkit, device: devices['iPhone 13'] || { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
];
const requestedProfiles = process.env.PADDOCK_EFFECTS_PROFILES?.split(',').map(value => value.trim()).filter(Boolean);
const profiles = requestedProfiles?.length ? allProfiles.filter(profile => requestedProfiles.includes(profile.id)) : allProfiles;
const records = [];
const openBrowsers = new Set(), openContexts = new Set();
let state, page;
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.resolve(dist, pathname === '/' ? 'index.html' : `.${pathname}`);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2' }[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

function freshState(base, { theme = 'classic', animations = true, lighting = 'static' } = {}) {
  const value = structuredClone(base);
  value.mode = 'dashboard';
  value.sessions = [];
  value.settings.setupComplete = true;
  value.settings.trimStyle = 'classic';
  value.settings.slotTrims = { 1: theme };
  value.settings.launchEffect = animations;
  value.settings.ambientMotion = true;
  value.settings.lighting = lighting;
  value.settings.starDensity = 3;
  value.grid = { columns: 3, rows: 3 };
  value.settings.grid = { columns: 3, rows: 3 };
  return value;
}
function session(id, name, status = 'active') {
  return {
    id, consoleKey: id, launchId: `launch-${id}`, projectId: null, slot: 1, width: 1, height: 1,
    name, nameMode: 'custom', cwd: root, provider: 'shell', permissions: 'system',
    launchModel: '', state: status, alive: true, cols: 80, rows: 20,
    createdAt: Date.now(), updatedAt: Date.now(), sequence: 0, usage: null, providerSessionId: null,
  };
}

(async () => {
  if (!fs.existsSync(fixture)) throw new Error(`Missing local fixture: ${fixture}`);
  const base = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  for (const profile of profiles) {
    const browser = await profile.engine.launch({ headless: true });
    openBrowsers.add(browser);
    const context = await browser.newContext({ ...(profile.device || {}), viewport: profile.device?.viewport || profile.viewport, reducedMotion: 'no-preference' });
    openContexts.add(context);
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      if (method === 'state') return { ok: true, value: state };
      if (method === 'mode') { state.mode = payload; state.transitioning = false; await publish(); return { ok: true }; }
      if (method === 'settings') {
        Object.assign(state.settings, payload || {});
        await publish();
        return { ok: true };
      }
      if (method === 'fixture.state') { state = structuredClone(payload); await publish(); return { ok: true }; }
      if (method === 'session.buffer') return { ok: true, value: { data: 'Fixture console ready\r\nPS C:\\> ', sequence: 0, launchId: state.sessions.find(session => session.id === payload)?.launchId || null } };
      if (method === 'session.acknowledge') return { ok: true };
      return { ok: true, value: [] };
    });
    await context.addInitScript(() => {
      window.dock = {
        call: (method, payload) => window.fixtureCall(method, payload),
        onState: callback => { window.fixtureState = callback; },
        onOutput: callback => { window.fixtureOutput = callback; },
        onSelect: () => {}, onNotice: () => {},
      };
    });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(`${profile.id}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${profile.id}: console ${message.text()}`); });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== new URL(url).origin) {
        errors.push(`${profile.id}: blocked external request ${route.request().url()}`);
        return route.abort();
      }
      return route.continue();
    });
    await page.setDefaultTimeout(7000);

    async function publish() {
      if (page && await page.evaluate(() => typeof window.fixtureState === 'function').catch(() => false)) {
        await page.evaluate(next => window.fixtureState(next), state);
      }
    }
    async function reset(theme, animations = true, lighting = 'static') {
      state = freshState(base, { theme, animations, lighting });
      await page.goto(url);
      await page.locator('.session-grid').waitFor();
      await page.waitForFunction(() => typeof window.fixtureState === 'function');
    }
    async function addConsole(theme, id) {
      state.settings.slotTrims[1] = theme;
      state.sessions = [session(id, `${theme} fixture`)];
      await publish();
      const panel = page.locator(`.session-card[data-console-id="${id}"]`);
      await panel.waitFor();
      return panel;
    }
    async function savePanel(panel, suffix, timing) {
      if (!timing) await panel.scrollIntoViewIfNeeded();
      const box = timing?.box || await panel.boundingBox();
      if (!box) throw new Error(`${profile.id}/${suffix}: capture target has no visible bounds`);
      const elapsedMs = timing == null ? null : await page.evaluate(startedAt => performance.now() - startedAt, timing.startedAt);
      // Capture latency is distinct from effect duration. Label the image with
      // its actual elapsed time and retain the nominal target in the record.
      const capturedSuffix = timing ? `${suffix.replace(/-\d+ms$/, '')}-${Math.round(elapsedMs)}ms` : suffix;
      const file = path.join(out, `${profile.id}-${capturedSuffix}.png`);
      await page.screenshot({ path: file, clip: box });
      const screenshotCompleteElapsedMs = timing == null ? null : await page.evaluate(startedAt => performance.now() - startedAt, timing.startedAt);
      return { file: path.basename(file), elapsedMs, screenshotCompleteElapsedMs, targetElapsedMs: timing?.targetElapsedMs ?? null };
    }
    async function waitElapsed(startedAt, targetElapsedMs) {
      await page.waitForFunction(({ startedAt, targetElapsedMs }) => performance.now() - startedAt >= targetElapsedMs, { startedAt, targetElapsedMs });
    }
    async function canvasStats(canvas) {
      return canvas.evaluate(node => {
        const context = node.getContext('2d'), { width, height } = node;
        if (!context || !width || !height) return { width, height, visiblePixels: 0, brightPixels: 0 };
        const pixels = context.getImageData(0, 0, width, height).data;
        let visiblePixels = 0, brightPixels = 0, minY = height, maxY = -1;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] > 18) { visiblePixels++; const y = Math.floor(i / 4 / width); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
          if (pixels[i + 3] > 80 && pixels[i] + pixels[i + 1] + pixels[i + 2] > 520) brightPixels++;
        }
        return { width, height, visiblePixels, brightPixels, minY: maxY < 0 ? null : minY, maxY: maxY < 0 ? null : maxY };
      });
    }
    async function waitForPainted(canvas, requireBright = false) {
      try {
        await canvas.evaluate(async (node, bright) => {
          const deadline = performance.now() + 1500;
          while (node.isConnected && performance.now() < deadline) {
            const context = node.getContext('2d');
            if (context && node.width && node.height) {
              const pixels = context.getImageData(0, 0, node.width, node.height).data;
              for (let i = 0; i < pixels.length; i += 16) {
                if (!bright && pixels[i + 3] > 18) return;
                if (bright && pixels[i + 3] > 80 && pixels[i] + pixels[i + 1] + pixels[i + 2] > 520) return;
              }
            }
            await new Promise(requestAnimationFrame);
          }
          throw new Error('Canvas did not paint within 1.5 seconds.');
        }, requireBright);
      } catch (error) {
        throw new Error(`${profile.id}: effect canvas did not produce the expected pixels (${error.message})`);
      }
    }

    const captures = [];
    let rgbWaveMeasurements = null;
    for (const theme of themes) {
      await reset(theme);
      const pageStartedAt = await page.evaluate(() => performance.now());
      const id = `fx-${theme}-${profile.id}`;
      const panel = await addConsole(theme, id);
      const openingBox = await panel.boundingBox();
      let firstLiveOutputAt = null;
      const openingCanvas = panel.locator(':scope > canvas.launch-burst');
      await openingCanvas.waitFor({ state: 'attached', timeout: 1500 });
      const opening = await openingCanvas.count();
      if (opening !== 1) throw new Error(`${profile.id}/${theme}: new console did not start one opening canvas`);
      const css = await openingCanvas.evaluate(canvas => ({ pointerEvents: getComputedStyle(canvas).pointerEvents, opening: canvas.dataset.opening, duration: Number(canvas.dataset.duration), flashes: Number(canvas.dataset.flashes) }));
      if (css.pointerEvents !== 'none') throw new Error(`${profile.id}/${theme}: opening blocks pointer input`);
      if (css.opening !== openings[theme] || css.duration >= 1800 || css.flashes > 2) throw new Error(`${profile.id}/${theme}: opening metadata exceeded the theme limits (${JSON.stringify(css)})`);
      const startedAt = Number(await openingCanvas.getAttribute('data-started-at'));
      await panel.evaluate(node => {
        window.__openingEnded = new Promise(resolve => {
          const observer = new MutationObserver(records => {
            for (const record of records) for (const removed of record.removedNodes) {
              if (removed.matches?.('canvas.launch-burst')) { observer.disconnect(); resolve(Number(removed.dataset.endedAt)); }
            }
          });
          observer.observe(node, { childList: true });
        });
      });
      if (theme === 'blue') {
        await waitElapsed(startedAt, 80);
        captures.push(await savePanel(panel, `${theme}-lightning-flash`, { startedAt, targetElapsedMs: 80, box: openingBox }));
      }
      await waitElapsed(startedAt, 250);
      captures.push(await savePanel(panel, `${theme}-opening-250ms`, { startedAt, targetElapsedMs: 250, box: openingBox }));
      if (theme === 'hot-pink') {
        await waitElapsed(startedAt, 650);
        captures.push(await savePanel(panel, `${theme}-neon-flicker`, { startedAt, targetElapsedMs: 650, box: openingBox }));
      }
      await waitElapsed(startedAt, 720);
      captures.push(await savePanel(panel, `${theme}-opening-720ms`, { startedAt, targetElapsedMs: 720, box: openingBox }));
      if (theme === 'cyber') {
        const firstLiveOutput = await page.evaluate(value => {
          const dispatchedAt = performance.now();
          window.fixtureOutput?.({ id: value, launchId: `launch-${value}`, sequence: 1, data: 'first live output\r\n' });
          return dispatchedAt;
        }, id);
        firstLiveOutputAt = firstLiveOutput;
        const firstLiveElapsedMs = firstLiveOutput - pageStartedAt;
        if (firstLiveElapsedMs >= 1500) throw new Error(`${profile.id}: first Cyber output was not sent promptly after the page mounted (${firstLiveElapsedMs.toFixed(1)} ms)`);
        const firstOutputCanvas = panel.locator('.console-panel-header > canvas.console-state-effect');
        await firstOutputCanvas.waitFor({ state: 'attached' });
        await waitForPainted(firstOutputCanvas);
        const firstOutputCapture = await savePanel(panel, 'cyber-output-first-live-prompt');
        firstOutputCapture.firstLiveOutputElapsedMs = firstLiveElapsedMs;
        captures.push(firstOutputCapture);
        // This explicitly requested output effect can overlap the opening.
        // Let it finish before the later assertion for unrelated reactions.
        await firstOutputCanvas.waitFor({ state: 'detached', timeout: 1000 });
      }
      const endedAt = await page.evaluate(() => window.__openingEnded);
      const cleanupMs = endedAt - startedAt;
      if (await panel.locator(':scope > canvas.launch-burst').count()) throw new Error(`${profile.id}/${theme}: opening exceeded 1.8 seconds`);
      if (await panel.locator('canvas.console-state-effect').count()) throw new Error(`${profile.id}/${theme}: unrelated state effect appeared during opening`);
      if (!(cleanupMs < 1800)) throw new Error(`${profile.id}/${theme}: opening cleanup was ${cleanupMs.toFixed(1)} ms after creation`);

      if (profile.id === 'windows-chromium' && theme === 'blue') {
        state.sessions[0].state = 'attention'; await publish();
        if (await panel.locator('canvas.console-state-effect').count()) throw new Error('Entering attention fired a Ready reaction');
      }
      state.sessions[0].state = 'ready'; await publish();
      if (['blue', 'hot-pink', 'icy'].includes(theme)) {
        await page.waitForTimeout(100);
        const readyCanvas = panel.locator('canvas.console-state-effect');
        if (!(await readyCanvas.count())) throw new Error(`${profile.id}/${theme}: Ready effect did not fire`);
        await waitForPainted(readyCanvas, theme === 'blue');
        const readyPixels = await canvasStats(readyCanvas);
        if (!readyPixels.visiblePixels || (theme === 'blue' && !readyPixels.brightPixels)) {
          const readyDiagnostic = await readyCanvas.evaluate(node => ({ effect: node.dataset.effect, theme: node.dataset.opening, stateTheme: node.dataset.debugTheme, drawProgress: node.dataset.debugDraw, parent: node.parentElement?.className, frame: node.closest('[data-frame]')?.dataset.frame, connected: node.isConnected, rect: node.getBoundingClientRect().toJSON(), visibility: getComputedStyle(node).visibility, openingMotion: document.body.dataset.openingMotion }));
          await savePanel(panel, `${theme}-ready-no-pixels-diagnostic`);
          throw new Error(`${profile.id}/${theme}: Ready canvas had no visible painted pixels (${JSON.stringify({ readyPixels, readyDiagnostic })})`);
        }
        captures.push(await savePanel(panel, `${theme}-ready-100ms`));
        if (profile.id === 'windows-chromium' && theme === 'blue') {
          const effectStartedAt = await readyCanvas.getAttribute('data-started-at');
          state.settings.starDensity = 2; await publish();
          const afterSettings = await panel.locator('canvas.console-state-effect').getAttribute('data-started-at');
          if (afterSettings !== effectStartedAt) throw new Error('Density Settings update restarted the Blue Ready effect');
          await page.waitForTimeout(700);
          await panel.locator('[data-action="toggle-console"]').click();
          await page.locator('.session-card.console-expanded').waitFor();
          state.sessions[0].state = 'active'; await publish();
          state.sessions[0].state = 'attention'; await publish();
          if (await panel.locator('.console-panel-header > canvas.console-state-effect').count()) throw new Error('Entering attention in expanded view fired a Ready reaction');
          state.sessions[0].state = 'ready'; await publish();
          const expandedReady = panel.locator('.console-panel-header > canvas.console-state-effect');
          await expandedReady.waitFor({ state: 'attached' });
          await waitForPainted(expandedReady, true);
          const expandedPixels = await canvasStats(expandedReady);
          if (!expandedPixels.visiblePixels || !expandedPixels.brightPixels || expandedPixels.maxY - expandedPixels.minY > 100) throw new Error(`Expanded Blue Ready arc missed the toolbar trim (${JSON.stringify(expandedPixels)})`);
          captures.push(await savePanel(panel, 'blue-expanded-ready-100ms'));
          await page.waitForTimeout(800);
          await panel.locator('[data-action="toggle-console"]').click();
          await page.locator('.sidebar nav [data-page=results]').click();
          await page.locator('.sidebar nav [data-page=consoles]').click();
          if (await panel.locator('canvas.console-state-effect').count()) throw new Error('Returning to the grid replayed the Blue Ready effect');
          await page.reload(); await page.locator('.session-grid').waitFor();
          const restored = page.locator(`.session-card[data-console-id="${id}"]`);
          if (await restored.locator(':scope > canvas.launch-burst, canvas.console-state-effect').count()) throw new Error('Reloading an existing console replayed its opening or Ready effect');
        }
      }
      state.sessions[0].state = 'error'; await publish();
      await page.waitForTimeout(90);
      if (!(await panel.locator('canvas.console-state-effect').count())) throw new Error(`${profile.id}/${theme}: error state effect did not fire`);
      captures.push(await savePanel(panel, `${theme}-error-90ms`));
      await page.waitForTimeout(600);
      if (await panel.locator('canvas.console-state-effect').count()) throw new Error(`${profile.id}/${theme}: finite state effect did not clean up`);

      if (theme === 'cyber') {
        state.sessions[0].state = 'active'; await publish();
        if (profile.id === 'windows-chromium') {
          await panel.locator('[data-action="toggle-console"]').click();
          await page.locator('.session-card.console-expanded').waitFor();
        }
        const firstBurstAge = await page.evaluate(startedAt => performance.now() - startedAt, firstLiveOutputAt);
        if (firstBurstAge < 1600) await page.waitForTimeout(1600 - firstBurstAge);
        await page.evaluate(value => window.fixtureOutput?.({ id: value, launchId: `launch-${value}`, sequence: 2, data: 'fixture output\r\n' }), id);
        await page.waitForTimeout(75);
        const headerEffect = panel.locator('.console-panel-header > canvas.console-state-effect');
        if (!(await headerEffect.count())) throw new Error(`${profile.id}: Cyber output effect missed the header`);
        await waitForPainted(headerEffect);
        const outputPixels = await canvasStats(headerEffect);
        if (!outputPixels.visiblePixels) throw new Error(`${profile.id}: Cyber output canvas contained no painted pixels`);
        const firstOutputStart = await headerEffect.getAttribute('data-started-at');
        await page.evaluate(value => window.fixtureOutput?.({ id: value, launchId: `launch-${value}`, sequence: 3, data: 'continuous output\r\n' }), id);
        await page.waitForTimeout(80);
        if (await headerEffect.getAttribute('data-started-at') !== firstOutputStart) throw new Error(`${profile.id}: continuous Cyber output restarted its scanline`);
        captures.push(await savePanel(panel, 'cyber-output-75ms'));
        if (profile.id === 'windows-chromium') captures.push(await savePanel(panel, 'cyber-output-continuous-100ms'));
        await page.waitForTimeout(1510);
        await page.evaluate(value => window.fixtureOutput?.({ id: value, launchId: `launch-${value}`, sequence: 4, data: 'new output burst\r\n' }), id);
        await page.waitForTimeout(75);
        if (!(await headerEffect.count()) || await headerEffect.getAttribute('data-started-at') === firstOutputStart) throw new Error(`${profile.id}: a later Cyber output burst did not start a fresh header glitch`);
        if (profile.id === 'windows-chromium') captures.push(await savePanel(panel, 'cyber-output-new-burst-75ms'));
        if (profile.id === 'windows-chromium') await panel.locator('[data-action="toggle-console"]').click();
      }
    }

    // Static Void lensing belongs only to an empty panel; RGB sparkle follows wave lighting.
    await reset('void');
    const empty = page.locator('.session-card.empty[data-slot="1"]');
    await empty.waitFor();
    captures.push(await savePanel(empty, 'void-empty-stars'));
    state.settings.slotTrims[1] = 'gamer'; state.settings.lighting = 'wave'; await publish();
    await page.waitForTimeout(250);
    captures.push(await savePanel(empty, 'rgb-wave-sparkle'));
    if (profile.id === 'windows-chromium') {
      await reset('gamer', true, 'wave');
      const wide = session('rgb-wide', 'RGB wide panel'); wide.width = 2;
      const narrow = session('rgb-narrow', 'RGB narrow panel'); narrow.slot = 3;
      state.sessions = [wide, narrow];
      state.settings.slotTrims = { 1: 'gamer', 3: 'gamer' };
      await publish();
      const widePanel = page.locator('.session-card[data-console-id="rgb-wide"]');
      const narrowPanel = page.locator('.session-card[data-console-id="rgb-narrow"]');
      await page.waitForFunction(() => !document.querySelector('.session-grid canvas.launch-burst'));
      const sparkSample = panel => panel.evaluate(node => {
        const wave = node.querySelector('.console-skin>.theme-wave'), style = getComputedStyle(wave, '::after');
        const transform = style.transform === 'none' ? 0 : new DOMMatrixReadOnly(style.transform).m41;
        const animation = document.getAnimations().find(item => item.animationName === 'light-wave' && item.effect?.target === wave && item.effect?.pseudoElement === '::after');
        return { panelWidth: node.getBoundingClientRect().width, sparkX: wave.getBoundingClientRect().left + Number.parseFloat(style.left) + transform, animationName: style.animationName, playState: style.animationPlayState, duration: style.animationDuration, currentTime: animation?.currentTime, startTime: animation?.startTime };
      });
      await page.waitForTimeout(350);
      const wideStart = await sparkSample(widePanel), narrowStart = await sparkSample(narrowPanel);
      if (wideStart.panelWidth <= narrowStart.panelWidth || Math.abs(wideStart.sparkX - narrowStart.sparkX) > 4 || wideStart.animationName !== 'light-wave' || narrowStart.animationName !== 'light-wave' || wideStart.playState !== 'running') throw new Error(`RGB sparkle did not share the global wave phase across widths: ${JSON.stringify({ wideStart, narrowStart })}`);
      captures.push(await savePanel(widePanel, 'rgb-wave-wide-panel'));
      captures.push(await savePanel(narrowPanel, 'rgb-wave-narrow-panel'));
      state.summary.requests++;
      await publish();
      await page.waitForTimeout(100);
      const afterSettings = await sparkSample(narrowPanel);
      if (afterSettings.startTime !== narrowStart.startTime || afterSettings.currentTime <= narrowStart.currentTime) throw new Error('An unrelated state update restarted or paused the RGB sparkle');
      state.settings.lightingSpeed = 'fast'; await publish();
      await page.waitForTimeout(70);
      const afterSpeed = await sparkSample(narrowPanel);
      if (afterSpeed.duration === narrowStart.duration) throw new Error('RGB sparkle did not use the configured lighting speed');
      const oldProgress = Number(narrowStart.currentTime) / (parseFloat(narrowStart.duration) * 1000);
      const newProgress = Number(afterSpeed.currentTime) / (parseFloat(afterSpeed.duration) * 1000);
      if (Math.abs(oldProgress - newProgress) > .15) throw new Error(`RGB sparkle phase jumped when speed changed: ${oldProgress} -> ${newProgress}`);
      state.settings.ambientMotion = false; await publish();
      await page.waitForFunction(() => {
        const waves = document.getAnimations().filter(animation => animation.animationName === 'light-wave');
        return waves.length > 0 && waves.every(animation => !animation.pending && animation.playState === 'paused');
      });
      const pausedStart = await sparkSample(narrowPanel);
      await page.waitForTimeout(250);
      const pausedEnd = await sparkSample(narrowPanel);
      if (pausedStart.playState !== 'paused' || Math.abs(pausedEnd.currentTime - pausedStart.currentTime) > 1) throw new Error(`Ambient motion did not pause the RGB sparkle: ${JSON.stringify({ pausedStart, pausedEnd })}`);
      state.settings.ambientMotion = true; await publish();
      await page.waitForTimeout(150);
      const resumed = await sparkSample(narrowPanel);
      if (resumed.playState !== 'running' || resumed.currentTime <= pausedEnd.currentTime) throw new Error('The RGB sparkle did not resume from its paused phase');
      state.settings.launchEffect = false; await publish();
      if (await narrowPanel.evaluate(node => getComputedStyle(node.querySelector('.theme-wave'), '::after').display !== 'none')) throw new Error('Console animations off did not hide the RGB sparkle');
      state.settings.launchEffect = true; await publish();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (await narrowPanel.evaluate(node => getComputedStyle(node.querySelector('.theme-wave'), '::after').display !== 'none')) throw new Error('Reduced motion did not hide the RGB sparkle');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      rgbWaveMeasurements = { wideStart, narrowStart, afterSettings, afterSpeed, pausedStart, pausedEnd, resumed, progressBefore: oldProgress, progressAfterSpeed: newProgress };
    }

    // Disabling Console animations suppresses both openings and session reactions.
    await reset('blue', false);
    const disabledPanel = await addConsole('blue', `disabled-${profile.id}`);
      if (await disabledPanel.locator(':scope > canvas.launch-burst, canvas.console-state-effect').count()) throw new Error(`${profile.id}: effects ran with Console animations off`);
    state.sessions[0].state = 'ready'; await publish();
    await page.waitForTimeout(100);
    if (await disabledPanel.locator('canvas.console-state-effect').count()) throw new Error(`${profile.id}: Ready effect ran with Console animations off`);

    // Reduced motion suppresses effects even when the setting is enabled.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await reset('hot-pink', true);
    const reducedPanel = await addConsole('hot-pink', `reduced-${profile.id}`);
    if (await reducedPanel.locator(':scope > canvas.launch-burst, canvas.console-state-effect').count()) throw new Error(`${profile.id}: opening ran with reduced motion`);
    state.sessions[0].state = 'ready'; await publish();
    await page.waitForTimeout(100);
    if (await reducedPanel.locator('canvas.console-state-effect').count()) throw new Error(`${profile.id}: state effect ran with reduced motion`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    if (profile.id === 'windows-chromium') {
      await reset('fiery');
      const canceledPanel = await addConsole('fiery', 'cancel-inferno-preference');
      await canceledPanel.locator(':scope > canvas.launch-burst').waitFor({ state: 'attached' });
      await page.waitForTimeout(80);
      state.settings.launchEffect = false; await publish();
      await page.waitForFunction(id => !document.querySelector(`.session-card[data-console-id="${id}"] canvas.launch-burst`), 'cancel-inferno-preference');
      const shakeAfterDisable = await canceledPanel.evaluate(node => node.getAnimations().filter(animation => animation.effect?.target === node && animation.playState === 'running').length);
      if (shakeAfterDisable) throw new Error('The Inferno WAAPI shake kept running after Console animations were disabled');

      await reset('fiery');
      const coveredPanel = await addConsole('fiery', 'covered-inferno-setting');
      await coveredPanel.locator(':scope > canvas.launch-burst').waitFor({ state: 'attached' });
      await page.waitForTimeout(80);
      await page.locator('.sidebar-bottom [data-page=settings]').click();
      await page.locator('.settings-overlay').waitFor();
      await page.waitForFunction(id => !document.querySelector(`.session-card[data-console-id="${id}"] canvas.launch-burst`), 'covered-inferno-setting');
      const shakeAfterCover = await coveredPanel.evaluate(node => node.getAnimations().filter(animation => animation.effect?.target === node && animation.playState === 'running').length);
      if (shakeAfterCover) throw new Error('The Inferno WAAPI shake kept running under the Settings overlay');
      await page.locator('[data-action=close-settings]').click();
      if (await coveredPanel.locator(':scope > canvas.launch-burst').count()) throw new Error('Uncovering a console replayed its canceled opening');

      await reset('classic');
      await page.locator('.sidebar-bottom [data-page=settings]').click();
      await page.locator('.settings-navigation [data-page=appearance]').click();
      const preview = page.locator('.settings-content .console-theme-preview');
      await preview.scrollIntoViewIfNeeded();
      await page.locator('[data-settings-replay]').click();
      await page.waitForTimeout(100);
      if (!(await preview.locator('canvas.launch-burst').count())) throw new Error('Settings Replay did not start an opening effect');
      captures.push(await savePanel(preview, 'settings-replay-100ms'));
    }
    records.push({ profile: profile.id, engine: profile.engine.name(), viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })), captures, rgbWaveMeasurements, pageErrors: errors.filter(error => error.startsWith(`${profile.id}:`)), noErrors: errors.every(error => !error.startsWith(`${profile.id}:`)) });
    await context.close(); openContexts.delete(context);
    await browser.close(); openBrowsers.delete(browser);
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify({ date: new Date().toISOString(), fixture: path.relative(root, fixture), profiles: records, pageErrors: errors }, null, 2));
  }
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify({ date: new Date().toISOString(), fixture: path.relative(root, fixture), profiles: records, pageErrors: errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Captured ${records.reduce((n, record) => n + record.captures.length, 0)} effect frames under ${out}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.allSettled([...openContexts].map(context => context.close()));
  await Promise.allSettled([...openBrowsers].map(browser => browser.close()));
  await new Promise(resolve => server.close(resolve));
});
