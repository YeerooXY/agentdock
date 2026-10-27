'use strict';
// F11 fullscreen: the title bar is hidden, returns at the top edge or on keyboard focus, and hides again.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/fullscreen-titlebar');
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0], file = path.join(dist, p === '/' ? 'index.html' : p);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
// Fullscreen is a desktop window mode, so only the PC and Mac engines apply.
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 900 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }]];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const errors = [];
  for (const [name, engine, options] of profiles) {
    for (const mode of ['dashboard', 'fullscreen', 'expanded']) {
      const browser = await engine.launch(), context = await browser.newContext(options), state = structuredClone(base);
      state.mode = mode === 'expanded' ? 'fullscreen' : 'dashboard'; Object.assign(state.settings, { setupComplete: true });
      let page;
      await context.exposeFunction('fixtureCall', (method, payload) => {
        if (method === 'mode') { state.mode = payload; setTimeout(() => page.evaluate(s => window.fixtureState(s), state).catch(() => {}), 5); }
        return { ok: true, value: method === 'state' ? state : method === 'session.buffer' ? { data: '', sequence: 0 } : [] };
      });
      await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
      page = await context.newPage(); page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
      await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.titlebar').waitFor({ state: 'attached' });
      const bottom = async () => { await page.waitForTimeout(260); return page.locator('.titlebar').evaluate(x => Math.round(x.getBoundingClientRect().bottom)); };
      const workspaceTop = () => page.locator('#content').evaluate(x => Math.round(x.getBoundingClientRect().top));
      if (mode === 'fullscreen') { await page.keyboard.press('F11'); await page.waitForTimeout(100); }
      if (mode === 'expanded') {
        if (await bottom() <= 0) errors.push(`${name}: title bar hidden in a fullscreen that F11 did not start`);
      } else if (mode === 'dashboard') {
        if (await bottom() <= 0) errors.push(`${name}: title bar hidden outside fullscreen`);
        await page.screenshot({ path: path.join(out, `${name}-window.png`) });
      } else {
        if (await bottom() > 0) errors.push(`${name}: title bar visible in fullscreen`);
        if (await workspaceTop() > 1) errors.push(`${name}: content does not reach the top (${await workspaceTop()}px)`);
        await page.screenshot({ path: path.join(out, `${name}-fullscreen.png`) });
        await page.mouse.move(700, 400); await page.mouse.move(700, 1);
        if (await bottom() <= 0) errors.push(`${name}: top edge does not reveal the title bar`);
        await page.screenshot({ path: path.join(out, `${name}-fullscreen-peek.png`) });
        await page.mouse.move(700, 30);
        if (await bottom() <= 0) errors.push(`${name}: title bar hides while the pointer is on it`);
        await page.mouse.move(700, 500);
        if (await bottom() > 0) errors.push(`${name}: title bar stays after the pointer leaves`);
        await page.locator('.window-actions [data-action=fullscreen]').focus();
        if (await bottom() <= 0) errors.push(`${name}: keyboard focus does not reveal the title bar`);
        await page.locator('#content').click({ position: { x: 600, y: 500 } }).catch(() => {}); await page.keyboard.press('F11');
        if (await bottom() <= 0) errors.push(`${name}: title bar stays hidden after leaving F11 fullscreen`);
      }
      await browser.close();
    }
  }
  server.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('fullscreen title bar check passed on pc and mac profiles');
})();
