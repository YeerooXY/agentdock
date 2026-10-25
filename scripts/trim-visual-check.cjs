'use strict';
// Real renderer, synthetic state, no agent processes or paid requests.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { openPage } = require('./ui-navigation.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/console-appearance');
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0], file = pathname === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, pathname === '/' ? 'index.html' : pathname);
  if ((pathname !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
let browser; const rows = [];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  for (const [name, engine, options] of profiles.filter(([name]) => !process.env.PADDOCK_VISUAL_PROFILE || process.env.PADDOCK_VISUAL_PROFILE === name)) {
    browser = await engine.launch();
    for (const motion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ ...options, reducedMotion: motion }), state = structuredClone(base);
      state.mode = 'dashboard'; state.settings.setupComplete = true; state.settings.sidebarCollapsed = false;
      state.settings.accentStyle = 'pink-blue'; state.settings.trimStyle = 'classic'; state.settings.trimWidth = 1;
      state.settings.panelStars = true; state.settings.launchEffect = true; state.settings.cursorBlink = false;
      state.settings.slotTrims = { 1: 'hot-pink', 2: 'blue', 3: 'redline', 4: 'violet', 8: 'gamer' };
      state.sessions = ['Claude workspace', 'Codex workspace', 'Kiro workspace'].map((label, i) => ({ ...base.sessions[0], id: `fixture-${i}`, slot: i + 1, width: 1, height: i === 2 ? 3 : 1, state: i === 2 ? 'ready' : i ? 'open' : 'active', name: label }));
      const calls = [], errors = [], captures = []; let page, rejectSave = false;
      const publish = () => page.evaluate(s => window.fixtureState(s), state);
      await context.exposeFunction('fixtureCall', async (method, payload) => {
        calls.push([method, payload]);
        if (method === 'state') return { ok: true, value: state };
        if (method === 'settings' || method === 'slot.trim') {
          if (rejectSave) return { ok: false, error: 'Test fixture: settings could not be saved. Try again.' };
          if (method === 'settings') Object.assign(state.settings, payload);
          else if (payload.style === 'default') delete state.settings.slotTrims[payload.slot];
          else state.settings.slotTrims[payload.slot] = payload.style;
          await publish(); return { ok: true };
        }
        if (method === 'session.buffer') return { ok: true, value: { data: 'Console appearance test fixture\r\n\r\n> Reviewing the current workspace.\r\n  Saved changes stay in this project.\r\n\r\nPS C:\\Projects> ', sequence: 0 } };
        return { ok: true, value: [] };
      });
      await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
      page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(10000);
      await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.session-grid').waitFor();
      await page.addScriptTag({ url: '/_axe.js' });
      const card = slot => page.locator(`.session-grid > [data-slot="${slot}"]`);
      async function capture(view) {
        await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()); });
        const file = `${name}-${motion === 'reduce' ? 'reduced-' : ''}${view}.png`;
        await page.screenshot({ path: path.join(out, file) }); captures.push(file);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name + '/' + view + ': no overflow');
      }
      // Native keyboard flow, staged choices, cancel and save error recovery.
      await card(1).locator('.console-color-button').click();
      await page.locator('#console-color-dialog').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#console-color-dialog input:checked').inputValue(), 'hot-pink');
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape');
      assert.equal(await card(1).getAttribute('data-frame'), 'hot-pink');
      assert.equal(await card(1).locator('.console-color-button').evaluate(el => el === document.activeElement), true, 'Escape restores focus');
      await card(1).locator('.console-color-button').click();
      await page.locator('#console-color-dialog [value=redline]').check();
      rejectSave = true; await page.locator('#console-color-dialog [type=submit]').click();
      await page.locator('#console-color-dialog .form-error').filter({ hasText: 'could not be saved' }).waitFor();
      assert.equal(await page.locator('#console-color-dialog input:checked').inputValue(), 'redline', 'failure preserves the choice');
      rejectSave = false; await page.locator('#console-color-dialog [type=submit]').click();
      await page.locator('#console-color-dialog').waitFor({ state: 'hidden' });
      assert.equal(await card(1).getAttribute('data-frame'), 'redline');
      state.settings.slotTrims[1] = 'hot-pink'; await publish();
      await capture('frames');
      await card(1).locator('.console-color-button').click(); await capture('colors');
      let violations = await page.evaluate(async () => (await axe.run('#console-color-dialog', { runOnly: ['color-contrast', 'button-name', 'label', 'aria-dialog-name'] })).violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) })));
      assert.deepEqual(violations, [], `${name}: color picker accessibility`);
      await page.keyboard.press('Escape');
      const empty = card(4);
      assert.equal(await empty.locator('.panel-stars i').count(), 48);
      assert.equal(await empty.locator('.panel-stars .twinkle').count(), 12);
      assert.equal(await empty.locator('.twinkle').first().evaluate(el => getComputedStyle(el).animationName), motion === 'reduce' ? 'none' : 'star-twinkle');
      for (const width of [1, 4, 6]) {
        state.settings.trimWidth = width; await publish();
        assert.equal(await card(1).evaluate(el => getComputedStyle(el).borderTopWidth), width + 'px');
        await page.waitForTimeout(100);
        assert.equal(await card(1).evaluate(el => { const s = el.querySelector('.xterm-screen')?.getBoundingClientRect(), c = el.getBoundingClientRect(); return !s || (s.right <= c.right + 1 && s.bottom <= c.bottom + 1); }), true, 'terminal stays in frame');
      }
      state.settings.trimWidth = 1; state.settings.slotTrims = {}; state.settings.trimStyle = 'gamer'; state.settings.accentStyle = 'rgb'; await publish();
      const sharedColors = () => page.evaluate(() => {
        const cards = [...document.querySelectorAll('.session-grid > .session-card:not([hidden])')];
        return { colors: cards.map(el => getComputedStyle(el).getPropertyValue('--frame-a').trim()), accent: getComputedStyle(document.body).getPropertyValue('--accent-blue').trim() };
      });
      if (motion !== 'reduce') {
        await page.evaluate(() => { const clock = document.body.getAnimations().find(a => a.animationName === 'console-rgb'); clock.pause(); clock.currentTime = 4700; });
      }
      let hues = await sharedColors(); assert.ok(hues.colors.every(x => x === hues.accent), 'frames and accent share the RGB clock');
      assert.match(await card(3).locator('.console-skin').evaluate(el => getComputedStyle(el, '::before').backgroundImage), /rgb\(98, 217, 154\)/, 'ready retains status color');
      // A newly mounted terminal inherits the current phase; existing terminals survive.
      state.sessions.push({ ...state.sessions[0], id: 'late', slot: 4, state: 'open', width: 1, height: 1 });
      await page.evaluate(() => {
        window.fixtureBursts = 0;
        new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && node.matches('.launch-burst')) window.fixtureBursts++; }).observe(document.body, { childList: true, subtree: true });
      });
      await publish();
      if (motion !== 'reduce') await page.waitForFunction(() => window.fixtureBursts === 1);
      hues = await sharedColors(); assert.ok(hues.colors.every(x => x === hues.accent), 'a late console joins the existing phase');
      const bursts = await page.evaluate(() => window.fixtureBursts);
      assert.equal(bursts, motion === 'reduce' ? 0 : 1, 'opening motion obeys the system preference');
      if (bursts && await page.locator('.launch-burst').count()) {
        assert.equal(await page.locator('.launch-burst').evaluate(el => getComputedStyle(el).overflow), 'hidden');
        if (name === 'pc') await capture('opening');
        await page.locator('.launch-burst').waitFor({ state: 'detached' });
      }
      // Cancelled end (unchanged state) does not animate or remove the terminal.
      await publish(); assert.equal(await page.locator('.console-exit').count(), 0);
      await card(4).scrollIntoViewIfNeeded(); await card(4).locator('.console-close').focus();
      state.sessions = state.sessions.filter(s => s.id !== 'late');
      const closing = await page.evaluate(s => {
        window.fixtureState(s); const layer = document.querySelector('.console-exit'); if (!layer) return null;
        const animation = layer.getAnimations()[0]; animation.pause(); animation.currentTime = 120;
        const opacity = Number(getComputedStyle(layer).opacity);
        return { inert: layer.inert, hidden: layer.getAttribute('aria-hidden'), fixed: getComputedStyle(layer).position, controls: layer.querySelectorAll('[data-action],[data-session],[data-console-id]').length, effect: animation.id, fading: opacity > 0 && opacity < 1 };
      }, state);
      if (motion === 'reduce') assert.equal(closing, null);
      else assert.deepEqual(closing, { inert: true, hidden: 'true', fixed: 'fixed', controls: 0, effect: 'console-close', fading: true });
      assert.equal(await card(4).locator('[data-action=new]').evaluate(el => el === document.activeElement), true, 'closing returns focus to the freed slot');
      assert.equal(await page.locator('.session-grid [data-console-id]').count(), 3, 'other consoles remain mounted');
      await page.locator('.console-exit').waitFor({ state: 'detached' });
      state.settings.launchEffect = false;
      state.sessions.push({ ...state.sessions[0], id: 'no-motion', slot: 4, state: 'open', width: 1, height: 1 }); await publish(); await page.waitForTimeout(25);
      assert.equal(await page.locator('.launch-burst').count(), 0);
      state.sessions = state.sessions.filter(s => s.id !== 'no-motion'); await publish();
      assert.equal(await page.locator('.console-exit').count(), 0);
      state.settings.trimStyle = 'redline'; state.settings.accentStyle = 'redline'; await publish();
      await openPage(page, 'appearance');
      assert.ok((await page.locator('[data-setting=accentStyle] option').allTextContents()).includes('Redline'));
      await page.locator('[data-setting=trimStyle]').selectOption('blue');
      assert.equal(state.settings.trimStyle, 'blue');
      const knob = await page.locator('[data-setting=cursorBlink]').evaluate(async input => {
        getComputedStyle(input, '::before').transform;
        input.click(); getComputedStyle(input, '::before').transform;
        const transition = document.getAnimations().find(a => a.effect?.target === input && a.transitionProperty === 'transform');
        if (transition) { transition.pause(); transition.currentTime = 90; }
        return { animated: !!transition, transform: getComputedStyle(input, '::before').transform };
      });
      assert.equal(knob.animated, motion !== 'reduce', 'toggle thumb animates unless reduced motion is enabled');
      if (knob.animated) {
        const travel = Number(knob.transform.split(',')[4]);
        assert.ok(travel > 0 && travel < 16, 'switch moves through an intermediate position');
      }
      rejectSave = true; await page.locator('[data-setting=panelStars]').click();
      await page.waitForFunction(() => document.querySelector('[data-setting=panelStars]').checked);
      rejectSave = false; await page.locator('[data-setting=panelStars]').uncheck();
      await page.waitForTimeout(230);
      assert.equal(await card(4).locator('.panel-stars').evaluate(el => getComputedStyle(el).opacity), '0');
      assert.equal(await card(4).locator('.panel-stars').count(), 1, 'off fades the sky without rebuilding its clock');
      await page.locator('[data-setting=panelStars]').focus(); await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelector('[data-setting=panelStars]').checked);
      await page.waitForFunction(() => !document.querySelector('[data-setting=panelStars]').disabled);
      assert.equal(await page.locator('[data-setting=panelStars]').evaluate(el => document.activeElement === el), true, 'saving a toggle preserves keyboard focus');
      if (name === 'pc' && motion === 'no-preference') await page.locator('[data-setting=accentStyle]').selectOption('rgb');
      await capture('appearance');
      violations = await page.evaluate(async () => (await axe.run('#content', { runOnly: ['color-contrast', 'button-name', 'label'] })).violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) })));
      assert.deepEqual(violations, [], name + ': appearance accessibility');
      await openPage(page, 'console-settings');
      const animated = await page.evaluate(() => document.getAnimations().map(a => a.effect?.target).filter(Boolean).map(el => el.id));
      assert.ok(!animated.includes('content'), 'switching categories keeps the page heading still');
      if (name === 'pc' && motion === 'no-preference') {
        await page.setViewportSize({ width: 768, height: 1024 }); await openPage(page, 'consoles'); await capture('tablet');
        await page.setViewportSize({ width: 320, height: 740 }); await capture('320px');
        await openPage(page, 'appearance'); await page.evaluate(() => document.documentElement.style.fontSize = '200%'); await capture('large-text');
      }
      assert.deepEqual(errors, []);
      assert.equal(calls.some(([m]) => ['session.input', 'session.create', 'api.request'].includes(m)), false, 'appearance changes send no terminal input or paid requests');
      rows.push({ profile: name, emulated: name !== 'pc', motion, engine: browser.version(), captures, passed: true });
      console.log('PASS ' + name + ' / ' + motion);
      await context.close();
    }
    await browser.close(); browser = null;
  }
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(rows, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
