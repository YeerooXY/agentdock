'use strict';
// Actual renderer and xterm, synthetic sessions. No model or live user data.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { openPage } = require('./ui-navigation.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/console-themes');
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = pathname === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, pathname === '/' ? 'index.html' : pathname);
  if ((pathname !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
const themes = ['normal', 'classic', 'blue', 'violet', 'hot-pink', 'redline', 'cyber', 'icy', 'fiery', 'gamer'];
const openings = ['soft', 'bloom', 'sweep', 'orbit', 'split', 'pulse', 'scan', 'frost', 'embers', 'spectrum'];
let browser; const rows = [];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  for (const [name, engine, options] of profiles.filter(([name]) => !process.env.PADDOCK_VISUAL_PROFILE || process.env.PADDOCK_VISUAL_PROFILE === name)) {
    browser = await engine.launch();
    const context = await browser.newContext(options), state = structuredClone(base), errors = [], calls = [], captures = [];
    state.mode = 'dashboard'; state.grid = { columns: 3, rows: 2 };
    Object.assign(state.settings, { setupComplete: true, sidebarCollapsed: false, suggestProjects: false, accentStyle: 'pink-blue', trimStyle: 'cyber', trimWidth: 1, panelStars: true, ambientMotion: true, launchEffect: true, cursorBlink: false });
    state.settings.slotTrims = { 1: 'cyber', 2: 'icy', 3: 'fiery', 4: 'gamer', 5: 'normal', 6: 'violet' };
    state.sessions = ['Cyber', 'Arctic', 'Inferno', 'RGB'].map((label, i) => ({ ...base.sessions[0], id: `theme-${i}`, slot: i + 1, width: 1, height: 1, state: 'open', name: `${label} · theme check`, provider: i % 2 ? 'shell' : 'codex' }));
    let page, rejectSave = false;
    const publish = () => page.evaluate(s => window.fixtureState(s), state);
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      calls.push([method, payload]);
      if (method === 'state') return { ok: true, value: state };
      if (method === 'mode') { state.mode = payload; state.transitioning = false; await publish(); return { ok: true }; }
      if (method === 'settings' || method === 'slot.trim') {
        if (rejectSave) return { ok: false, error: 'Fixture: theme could not be saved. Try again.' };
        if (method === 'settings') Object.assign(state.settings, payload);
        else if (payload.style === 'default') delete state.settings.slotTrims[payload.slot];
        else state.settings.slotTrims[payload.slot] = payload.style;
        await publish(); return { ok: true };
      }
      if (method === 'session.buffer') return { ok: true, value: { data: '\x1b[36mTheme verification fixture\x1b[0m\r\n\r\n> Inspect the console theme.\r\n  Stars remain behind terminal text.\r\n\r\n\x1b[32mReady\x1b[0m   \x1b[33mWarning\x1b[0m   \x1b[31mError\x1b[0m\r\n\r\nPS C:\\Projects> ', sequence: 0, launchId: state.sessions.find(session => session.id === payload)?.launchId || null } };
      return { ok: true, value: [] };
    });
    await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(30000);
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.xterm-screen').first().waitFor();
    await page.addScriptTag({ url: '/_axe.js' });
    const card = slot => page.locator(`.session-grid > [data-slot="${slot}"]`);
    async function capture(view) {
      await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()); });
      await page.screenshot({ path: path.join(out, `${name}-${view}.png`) }); captures.push(`${name}-${view}.png`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}/${view}: document overflow`);
    }
    async function axeCheck(selector) {
      const issues = await page.evaluate(async selector => (await axe.run(selector, { runOnly: ['color-contrast', 'button-name', 'label', 'aria-dialog-name'] })).violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) })), selector);
      assert.deepEqual(issues, [], name + ': scoped accessibility');
    }
    await page.waitForTimeout(200); await capture('workspace');
    for (const slot of [1, 2, 3, 4, 5, 6]) {
      assert.equal(await card(slot).locator('.panel-stars i').count(), 48);
      if (slot < 5) {
        assert.equal(await card(slot).locator('.terminal-instance').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
        assert.equal(await card(slot).locator('.xterm-viewport').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
      }
    }
    await page.evaluate(() => { window.originalTerminal = document.querySelector('[data-slot="1"] .terminal-instance'); window.originalStars = document.querySelector('[data-slot="1"] .panel-stars'); });
    await card(1).locator('.console-color-button').click();
    await page.locator('#console-color-dialog').waitFor({ state: 'visible' });
    for (const [i, theme] of themes.entries()) {
      await page.locator(`#console-color-dialog [value="${theme}"]`).check();
      assert.equal(await card(1).getAttribute('data-frame'), 'cyber', 'choices are staged');
      assert.equal(await page.locator('#console-color-dialog .console-theme-preview').getAttribute('data-frame'), theme);
      // Sample the effect inside one renderer turn to avoid WebKit IPC timing races.
      const effect = await page.locator('[data-preview-opening]').evaluate(button => {
        button.click(); const layer = document.querySelector('#console-color-dialog .launch-burst');
        for (const a of layer?.getAnimations({ subtree: true }) || []) { a.pause(); a.currentTime = 280; }
        return layer?.dataset.opening;
      });
      assert.equal(effect, openings[i], `${theme}: its own opening`);
      if (name === 'pc' && ['cyber', 'icy', 'fiery', 'gamer'].includes(theme)) {
        await page.screenshot({ path: path.join(out, `pc-opening-${theme}.png`) }); captures.push(`pc-opening-${theme}.png`);
      }
    }
    await capture('picker'); await axeCheck('#console-color-dialog');
    await page.keyboard.press('Escape');
    assert.equal(await card(1).locator('.console-color-button').evaluate(el => el === document.activeElement), true);
    for (const theme of themes) {
      state.settings.slotTrims[1] = theme; await publish();
      assert.equal(await card(1).getAttribute('data-frame'), theme);
      assert.equal(await page.evaluate(() => window.originalTerminal === document.querySelector('[data-slot="1"] .terminal-instance') && window.originalStars === document.querySelector('[data-slot="1"] .panel-stars')), true, 'switching preserves live terminal and sky');
      assert.equal(await card(1).locator('.launch-burst').count(), 0, 'recoloring does not reopen a session');
      if (name === 'pc') await capture(`theme-${theme}`);
    }
    // Real pointer input still reaches the terminal through all decoration.
    await card(1).locator('.xterm-screen').click(); await page.keyboard.type('theme-input');
    assert.ok(calls.some(([m, p]) => m === 'session.input' && p.id === 'theme-0' && p.data.includes('t')));
    state.settings.slotTrims[1] = 'cyber'; await publish();
    for (const width of [1, 4, 6]) {
      state.settings.trimWidth = width; await publish(); await page.waitForTimeout(100);
      assert.equal(await card(1).evaluate(el => { const s = el.querySelector('.xterm-screen').getBoundingClientRect(), c = el.getBoundingClientRect(); return s.right <= c.right + 1 && s.bottom <= c.bottom + 1; }), true, 'terminal fits the frame');
    }
    state.settings.trimWidth = 1; state.sessions[0].state = 'ready'; await publish();
    assert.match(await card(1).locator('.console-skin').evaluate(el => getComputedStyle(el, '::before').backgroundImage), /rgb\(98, 217, 154\)/);
    state.sessions[0].state = 'open'; await publish();
    await card(1).locator('[data-action="toggle-console"]').click(); await page.locator('.session-card.console-expanded').waitFor();
    assert.equal(await card(1).locator('.panel-stars i').count(), 48);
    await capture('expanded'); await card(1).locator('[data-action="toggle-console"]').click(); await openPage(page, 'consoles');
    // No opening effect when moving a live session into an empty slot.
    state.sessions[0].slot = 5; await publish(); await page.waitForTimeout(30);
    assert.equal(await page.locator('.launch-burst').count(), 0);
    state.sessions[0].slot = 1; await publish();
    // Real new-session state does produce a themed opening, once.
    await card(5).scrollIntoViewIfNeeded();
    await page.evaluate(() => { window.openings = []; new MutationObserver(records => { for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && n.matches('.launch-burst')) window.openings.push(n.dataset.opening); }).observe(document.body, { childList: true, subtree: true }); });
    state.settings.slotTrims[5] = 'fiery'; state.sessions.push({ ...state.sessions[0], id: 'new-theme', provider: 'claude', slot: 5 }); await publish();
    await page.waitForFunction(() => window.openings.length === 1); assert.equal(await page.evaluate(() => window.openings[0]), 'embers');
    assert.equal(await card(5).locator('.panel-stars i').count(), 48, 'new provider retains the stars');
    await page.locator('.launch-burst').waitFor({ state: 'detached' });
    state.sessions[0].state = 'ready'; await publish();
    await openPage(page, 'appearance');
    await page.locator('[data-setting=ambientMotion]').uncheck();
    assert.equal(state.settings.ambientMotion, false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).animationPlayState), 'paused');
    assert.equal(await card(1).locator('.twinkle').first().evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
    assert.equal(await card(1).locator('.theme-trace').evaluate(el => getComputedStyle(el).animationPlayState), 'paused', 'ambient control pauses ready-frame motion too');
    await page.locator('[data-setting=panelStars]').uncheck(); await page.waitForTimeout(230);
    assert.equal(await card(1).locator('.panel-stars').evaluate(el => getComputedStyle(el).opacity), '0');
    await page.locator('[data-setting=panelStars]').check();
    await page.locator('[data-setting=trimStyle]').selectOption('icy');
    await page.waitForFunction(() => document.querySelector('.settings-content .console-theme-preview')?.dataset.frame === 'icy');
    assert.equal(await page.locator('.settings-content .console-theme-preview').getAttribute('data-frame'), 'icy');
    assert.equal(await page.locator('.settings-content .console-theme-preview > header').textContent(), 'Arctic');
    await capture('appearance'); await axeCheck('.settings-content');
    // Save failures retain the staged choice, then a retry applies it.
    await openPage(page, 'consoles'); await card(1).locator('.console-color-button').click();
    await page.locator('#console-color-dialog [value=icy]').check(); rejectSave = true;
    await page.locator('#console-color-dialog [type=submit]').click();
    await page.locator('#console-color-dialog .form-error').filter({ hasText: 'could not be saved' }).waitFor();
    assert.equal(await page.locator('#console-color-dialog input:checked').inputValue(), 'icy');
    rejectSave = false; await page.locator('#console-color-dialog [type=submit]').click();
    await page.locator('#console-color-dialog').waitFor({ state: 'hidden' });
    assert.equal(await card(1).getAttribute('data-frame'), 'icy');
    await page.emulateMedia({ reducedMotion: 'reduce' }); state.settings.ambientMotion = true; await publish();
    assert.equal(await card(1).locator('.twinkle').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    state.sessions.push({ ...state.sessions[0], id: 'reduced-theme', slot: 6 }); await publish(); await page.waitForTimeout(30);
    assert.equal(await page.locator('.launch-burst').count(), 0);
    await card(1).locator('.console-color-button').click(); assert.equal(await page.locator('[data-preview-opening]').isDisabled(), true);
    await page.keyboard.press('Escape'); await capture('reduced');
    if (name === 'pc') {
      await page.setViewportSize({ width: 768, height: 1024 }); await capture('tablet');
      await page.setViewportSize({ width: 320, height: 740 }); await capture('320px');
      await openPage(page, 'appearance'); await page.evaluate(() => document.documentElement.style.fontSize = '200%'); await capture('large-text');
    }
    assert.deepEqual(errors, []); assert.equal(calls.some(([m]) => m === 'api.request'), false);
    rows.push({ profile: name, engine: browser.version(), emulated: name !== 'pc', captures, passed: true });
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(rows, null, 2)); console.log('PASS ' + name);
    await context.close(); await browser.close(); browser = null;
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
