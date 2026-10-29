'use strict';
// Captures every main page at PC size from a fixture, headless, for UI reviews.
// Output: artifacts/screen-tour/<page>.png. Unknown bridge calls answer empty.
const { chromium } = require('playwright'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'screen-tour');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'projects', 'fixture.json')));
const width = Number(process.env.TOUR_WIDTH || 1440), height = Number(process.env.TOUR_HEIGHT || 900);
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  const name = req.url.split('?')[0], file = path.join(root, 'dist', name === '/' ? 'index.html' : name);
  if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch(), context = await browser.newContext({ viewport: { width, height } });
  const state = structuredClone(fixture), unknown = new Set();
  state.settings.sidebarCollapsed = false; state.mode = 'dashboard';
  await context.exposeFunction('fixtureCall', async (method, payload) => {
    if (method === 'state') return { ok: true, value: state };
    if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0 } };
    if (method === 'settings') { Object.assign(state.settings, payload); return { ok: true, state }; }
    if (method === 'explorer.list') return { ok: true, value: { entries: [] } };
    if (/list|models|agents|jobs|results/i.test(method)) { unknown.add(method); return { ok: true, value: [] }; }
    unknown.add(method); return { ok: true, value: null };
  });
  await context.addInitScript(() => { let changed; window.dock = { call: async (m, p) => { const r = await window.fixtureCall(m, p); if (r.state) changed?.(r.state); return r; }, onState: f => { changed = f; }, onOutput: () => {}, onSelect: () => {} }; });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.locator('.session-card').first().waitFor();
  const settle = () => page.evaluate(async () => { document.getAnimations().filter(x => x.effect?.getTiming().iterations !== Infinity).forEach(x => x.finish()); await document.fonts.ready; });
  for (const view of (process.env.TOUR_PAGES || 'consoles,projects,tasks,results,usage,settings').split(',')) {
    await page.locator(`[data-page=${view}]`).first().click();
    await page.waitForTimeout(400); await settle();
    await page.screenshot({ path: path.join(out, view + '.png') });
    console.log('captured ' + view);
  }
  fs.writeFileSync(path.join(out, 'tour.json'), JSON.stringify({ width, height, errors, unknownCalls: [...unknown] }, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
