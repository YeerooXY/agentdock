'use strict';
// Browser-only view checks use fixture data; real PTYs/IPC are covered by layout-smoke.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { planLayout } = require('../electron/console-layout.cjs');
const { catalog } = require('../electron/cli-catalog.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'console-layout');
const base = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json'), 'utf8'));
const preview = 'data:image/png;base64,' + fs.readFileSync(path.join(out, 'desktop-grid.png')).toString('base64');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  if (req.url === '/_axe.js') { res.setHeader('Content-Type', 'text/javascript'); return fs.createReadStream(require.resolve('axe-core/axe.min.js')).pipe(res); }
  const file = path.join(root, 'dist', decodeURIComponent(req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]));
  if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
const profiles = [
  ['pc', chromium, { viewport: { width: 1440, height: 1000 } }],
  ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }],
  ['android', chromium, { ...devices['Pixel 7'] }],
  ['iphone', webkit, { ...devices['iPhone 13'] }]
];
const reports = [], browsers = new Set(), overflowProblems = [];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  for (const [name, engine, options] of profiles) {
    const browser = await engine.launch(), context = await browser.newContext(options), state = structuredClone(base), errors = [];
    browsers.add(browser);
    let reads = 0, installAttempts = 0; state.settings.accentStyle = 'pink-blue';
    state.agents = catalog.map(x => ({ ...x, installed: ['codex','claude'].includes(x.id), installable: true }));
    state.workbench.setupRequests = [{ id: 'setup-demo', kind: 'tool', consoleName: 'Trader', config: { id: 'docs', name: 'Project docs', type: 'http', url: 'https://example.com/mcp', enabled: true } }];
    await context.exposeFunction('fixtureCall', (method, payload) => {
      let value;
      if (method === 'state') value = state;
      else if (method === 'session.buffer') value = { data: '\x1b[1 q\x1b[36m> Console layout verification\x1b[0m\r\nOutput stays here when this panel moves.\r\n\x1b[32mReady for you.\x1b[0m\r\n', sequence: 0 };
      else if (method === 'session.layout') { const plan = planLayout(state.sessions, payload); for (const item of plan) Object.assign(state.sessions.find(x => x.id === item.id), item); }
      else if (method === 'session.layout.preview') {
        try { value = planLayout(state.sessions, payload); }
        catch (error) { return { ok: false, error: error.message }; }
      }
      else if (method === 'settings') Object.assign(state.settings, payload);
      else if (method === 'setup.validate') { if (!payload.cwd) return { ok: false, error: 'Choose an existing project folder.' }; }
      else if (method === 'agents.install') {
        installAttempts++;
        for (const id of payload) { const agent = state.agents.find(x => x.id === id); agent.installed = installAttempts > 1; agent.job = agent.installed ? { state: 'installed' } : { state: 'error', error: 'Download interrupted. Try again.' }; }
        value = state.agents;
      }
      else if (method === 'setup.complete') { state.settings.consoleDefaults = { ...state.settings.consoleDefaults, ...payload }; assert.equal(payload.launchNow, true); }
      else if (method === 'mode') state.mode = payload;
      else if (method === 'session.acknowledge') {
        const session = state.sessions.find(x => x.id === payload);
        if (session && ['ready', 'attention'].includes(session.state)) session.state = 'open';
      }
      else if (method === 'session.models') value = [];
      else if (method === 'workbench.results.preview') value = { image: preview };
      else if (method === 'workbench.results.seen') { state.workbench.results.forEach(x => { if (payload.includes(x.id)) x.seenAt = 1; }); state.workbench.unreadResults = new Set(state.workbench.results.filter(x => !x.seenAt).map(x => x.groupId || x.id)).size; }
      else if (!['session.resize', 'session.input'].includes(method)) throw Error('Unexpected fixture call: ' + method);
      reads++; return { ok: true, value, state: ['session.layout', 'session.acknowledge', 'settings', 'mode', 'agents.install', 'setup.complete', 'workbench.results.seen'].includes(method) ? state : null };
    });
    await context.addInitScript(() => {
      let changed;
      window.dock = { call: async (method, payload) => { const response = await window.fixtureCall(method, payload); if (response.state) changed?.(response.state); return response; }, onState: fn => { changed = fn; window.fixtureState = fn; }, onOutput: fn => window.fixtureOutput = fn, onSelect: () => {} };
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.session-card:not(.empty)').first().waitFor();
    const captures = [], accessibility = [];
    await page.addScriptTag({ url: '/_axe.js' });
    async function capture(view) {
      await page.evaluate(() => document.getAnimations().filter(x => x.effect?.getTiming().iterations !== Infinity).forEach(x => x.finish()));
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
      const file = `${name}-${view}.png`; await page.screenshot({ path: path.join(out, file) }); captures.push(file);
      const violations = await page.evaluate(async () => { const r = await axe.run(document, { runOnly: ['color-contrast','button-name','label','aria-dialog-name'] }); return r.violations.map(x => ({ id: x.id, nodes: x.nodes.map(n => n.target) })); });
      if (violations.length) accessibility.push({ view, violations });
      const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth > innerWidth + 1, content: !document.querySelector('#content').hidden && document.querySelector('#content').scrollWidth > document.querySelector('#content').clientWidth + 1 }));
      if (overflow.page || overflow.content) {
        const elements = await page.evaluate(() => [...document.querySelectorAll('#content *')].filter(x => x.getClientRects().length && x.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(x => x.tagName + '.' + x.className));
        overflowProblems.push({ profile: name, view, elements });
      }
    }
    await capture('consoles');
    if (name === 'pc' || name === 'mac') {
      await page.locator('[data-resize-edge=e]').first().hover(); await capture('resize-edge');
      await page.locator('[data-resize-edge=w]').first().focus(); await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => !document.body.classList.contains('console-layout-active'));
      assert.equal(state.sessions[0].width, 1);
      await page.keyboard.press('ArrowLeft'); await page.waitForFunction(() => !document.body.classList.contains('console-layout-active'));
      await page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()));
      const before = state.sessions.map(x => [x.id, x.slot, x.width, x.height]);
      const corner = await page.locator('[data-resize-edge=se]').first().boundingBox();
      const step = await page.locator('.session-grid').evaluate(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { x: (r.width + parseFloat(s.columnGap)) / 3, y: (r.height + parseFloat(s.rowGap)) / 3 }; });
      await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2); await page.mouse.down();
      await page.locator('.console-resize-feedback:not([hidden])').waitFor();
      await page.mouse.move(corner.x + corner.width / 2 + step.x, corner.y + corner.height / 2 - step.y, { steps: 8 });
      await page.waitForFunction(() => document.querySelector('.resize-feedback-size').textContent === '3 \u00d7 1');
      assert.equal(await page.locator('.resize-guide-cells .selected').count(), 3);
      await capture('resize-active');
      await page.mouse.move(corner.x + corner.width / 2 + step.x, corner.y + corner.height / 2 + step.y, { steps: 8 });
      await page.locator('.console-resize-feedback[data-state=blocked]').waitFor();
      assert.equal(await page.locator('.resize-feedback-label').innerText(), 'Not enough room');
      assert.equal(await page.locator('.resize-feedback-hint').innerText(), 'Release to keep 2 \u00d7 2');
      await capture('resize-blocked');
      await page.keyboard.press('Escape'); await page.mouse.up();
      await page.waitForFunction(() => !document.body.classList.contains('console-layout-active'));
      assert.equal(await page.locator('.console-resize-feedback').isVisible(), false);
      assert.equal(await page.locator('.console-resize-guide').isVisible(), false);
      assert.deepEqual(state.sessions.map(x => [x.id, x.slot, x.width, x.height]), before);
    } else {
      assert.equal(await page.locator('.console-resize:visible').count(), 0);
      assert.equal(await page.locator('.console-resize-feedback').isVisible(), false);
    }
    const plus = page.locator('#consoles-page .session-card:not([hidden]) [data-action=new]').first();
    await plus.click({ button: 'right' }); await capture('chooser');
    assert.equal(await page.locator('#one-off-console-form [name=name]').isVisible(), true); await page.keyboard.press('Escape');
    for (const view of ['results', 'usage', 'api', 'vault', 'tools', 'instructions', 'settings']) {
      await page.locator(`.sidebar [data-page=${view}]`).click(); await capture(view);
      if (view === 'results') {
        assert.equal(await page.locator('#results-count').innerText(), '2');
        const pager = await page.locator('.result-pagination').evaluate(el => { const r = el.getBoundingClientRect(), c = document.querySelector('#content').getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - (c.left + c.right) / 2); });
        assert.ok(pager < 12, 'Pagination is centered');
      }
      if (view === 'settings') {
        await page.locator('[data-action=agent-setup]').click();
        const form = page.locator('#first-run-form');
        assert.equal(await form.locator('[data-install-agent]:checked').count(), 0, 'No optional software preselected');
        assert.equal(await form.locator('[data-install-agent][value=codex]').isDisabled(), true);
        await form.locator('[name=provider]').selectOption('shell');
        await form.locator('[data-install-agent][value=opencode]').check();
        assert.equal(await form.locator('[name=provider]').inputValue(), 'opencode');
        await form.locator('[name=launchNow]').check(); await capture('agent-setup');
        await form.locator('[type=submit]').click();
        await page.waitForFunction(() => document.querySelector('#first-run .form-error').textContent.includes('another try'));
        assert.equal(await form.locator('[name=provider]').inputValue(), 'opencode');
        assert.equal(await form.locator('[name=launchNow]').isChecked(), true); await capture('agent-setup-error');
        await form.locator('[type=submit]').click(); await page.locator('#first-run').waitFor({ state: 'hidden' });
        assert.equal(state.settings.consoleDefaults.provider, 'opencode');
      }
    }
    await page.locator('.sidebar nav [data-page=consoles]').click(); await page.locator('#consoles-page [data-session]').first().click();
    await page.locator('#terminal-host .xterm-helper-textarea:not([hidden])').first().focus();
    await page.locator('#terminal-host .xterm-cursor-blink').waitFor();
    await page.waitForFunction(() => { const cursor = document.querySelector('#terminal-host .xterm-cursor-blink'); return cursor?.isConnected && getComputedStyle(cursor).animationName === 'none'; });
    assert.equal(await page.locator('#terminal-host .xterm-cursor-blink').evaluate(el => getComputedStyle(el).animationName), 'none', 'Steady cursor overrides a CLI blink request');
    await page.evaluate(() => window.dock.call('settings', { cursorBlink: true }));
    assert.notEqual(await page.locator('#terminal-host .xterm-cursor-blink').evaluate(el => getComputedStyle(el).animationName), 'none', 'Blinking can be re-enabled');
    await page.evaluate(() => window.dock.call('settings', { cursorBlink: false }));
    const cursorFrames = await page.evaluate(async id => {
      let hidden = 0, sequence = 1, checking = true;
      const sample = () => { if (!checking) return; const el = document.querySelector('#terminal-host .xterm-cursor'); if (!el || getComputedStyle(el).visibility === 'hidden') hidden++; requestAnimationFrame(sample); };
      const pause = ms => new Promise(r => setTimeout(r, ms));
      requestAnimationFrame(sample);
      for (let i = 0; i < 8; i++) {
        window.fixtureOutput({ id, sequence: sequence++, data: '\x1b[?25l\r\x1b[2KCursor redraw ' + i });
        await pause(25);
        window.fixtureOutput({ id, sequence: sequence++, data: '\x1b[?2' });
        await pause(3);
        window.fixtureOutput({ id, sequence: sequence++, data: '5h' });
        await pause(35);
      }
      checking = false; return hidden;
    }, state.sessions[0].id);
    assert.equal(cursorFrames, 0, 'Fragmented redraws do not paint a hidden cursor frame');
    await capture('terminal');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#terminal-page [data-page=consoles]').click();
    assert.equal(await page.locator('.session-card.ready').evaluate(el => getComputedStyle(el).animationName), 'none');
    const [first, second] = state.sessions;
    async function readyFor(session) {
      session.state = 'ready';
      await page.evaluate(next => window.fixtureState(next), state);
    }
    async function checkAcknowledged(session, other) {
      await page.waitForFunction(() => document.querySelector('#ready-count').textContent === '1');
      assert.equal(session.state, 'open'); assert.equal(other.state, 'ready');
      assert.equal(await page.locator('#results-count').innerText(), '2');
    }
    await readyFor(first); await readyFor(second);
    await page.locator(`[data-terminal-id="${second.id}"] .xterm-screen`).click();
    await checkAcknowledged(second, first);
    assert.equal(await page.locator(`[data-console-id="${second.id}"] .console-ready-badge`).isVisible(), false);
    await capture('notification-click-cleared');
    await readyFor(second); await page.keyboard.type('x'); await checkAcknowledged(second, first);
    await readyFor(second); await page.keyboard.insertText('input'); await checkAcknowledged(second, first);
    await page.locator(`[data-console-id="${first.id}"] [data-session]`).click();
    await readyFor(first); await readyFor(second);
    await page.locator('#terminal-host .xterm-helper-textarea').focus();
    await capture('notification-fullscreen-ready');
    await page.keyboard.type('x'); await checkAcknowledged(first, second);
    assert.equal(await page.locator(`#terminal-tabs [data-session="${first.id}"] .console-ready-badge`).isVisible(), false);
    await capture('notification-fullscreen-cleared');
    assert.deepEqual(errors, []); reports.push({ profile: name, browser: browser.version(), viewport: options.viewport, emulated: name !== 'pc', captures, accessibility, calls: reads });
    console.log('PASS ' + name + ' view layouts, dialogs, grouped results, fullscreen, reduced motion and console notification acknowledgment');
    await browser.close();
    browsers.delete(browser);
  }
  fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(reports, null, 2));
  assert.deepEqual(overflowProblems, [], 'Overflow checks');
  assert.deepEqual(reports.flatMap(x => x.accessibility.map(v => ({ profile: x.profile, ...v }))), [], 'Selected accessibility checks');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { for (const browser of browsers) await browser.close(); server.close(); });
