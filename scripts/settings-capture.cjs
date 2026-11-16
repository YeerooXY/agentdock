'use strict';
// Captures every Settings category from the built renderer with the console-layout fixture (no live calls).
// Usage: npm run build && node scripts/settings-capture.cjs [outDir]
const { installStateTransport } = require('./state-test-transport.cjs');
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.resolve(process.argv[2] || path.join(root, 'artifacts/settings-audit'));
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const pages = ['general', 'appearance', 'console-settings', 'agent-settings', 'project-settings', 'devices', 'tools', 'add-tools', 'api-settings', 'instructions', 'previews'];
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0], file = path.join(dist, url === '/' ? 'index.html' : url);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), state = structuredClone(base), errors = [];
    state.mode = 'dashboard'; state.platform = 'win32';
    Object.assign(state.settings, { setupComplete: true, sidebarCollapsed: false });
    await context.exposeFunction('fixtureCall', (method, payload) => {
      if (method === 'settings') Object.assign(state.settings, payload);
      return { ok: true, value: method === 'state' ? state : method === 'session.buffer' ? { data: '', sequence: 0 } : method === 'settings' ? state.settings : [] };
    });
    await installStateTransport(context);
    await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), get state() { return window.fixtureStateTransport; }, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('.sidebar-bottom [data-page=settings]').click();
    for (const id of pages) {
      const link = page.locator(`.settings-navigation [data-page=${id}]`);
      if (await link.count()) await link.first().click(); else if (id !== 'general') { console.log('no nav for', id); continue; }
      await page.waitForTimeout(500);
      // Grow the viewport to the content so the whole category is in one image.
      const h = await page.evaluate(() => { const c = document.querySelector('.settings-content') || document.querySelector('#content'); return Math.min(6000, Math.max(1000, (c?.scrollHeight || 1000) + 120)); });
      await page.setViewportSize({ width: 1440, height: h }); await page.waitForTimeout(300);
      const details = await page.evaluate(() => [...document.querySelectorAll('.settings-content details, #content details')].map(d => d.querySelector('summary')?.innerText.trim()).filter(Boolean));
      await page.screenshot({ path: path.join(out, `${id}.png`) });
      console.log(id, 'height', h, 'collapsed sections:', details.length ? details.join(' | ') : 'none');
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    if (errors.length) console.log('page errors:', errors.join(' | '));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
