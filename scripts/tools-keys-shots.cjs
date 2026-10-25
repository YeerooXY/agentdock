'use strict';
// Tools page with logos and in-card key entry, synthetic state, four profiles.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/appearance-v2');
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0], file = path.join(dist, p === '/' ? 'index.html' : p);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
const catalog = [['playwright', 'Playwright', 'Microsoft'], ['chrome-devtools', 'Chrome DevTools', 'Google Chrome'], ['context7', 'Context7', 'Upstash'], ['notion', 'Notion', 'Notion', 'Notion integration token'], ['stripe', 'Stripe', 'Stripe', 'Stripe secret or restricted key'], ['github', 'GitHub', 'GitHub', 'GitHub personal access token']]
  .map(([id, name, maker, key]) => ({ id, name, maker, license: 'MIT', version: '1.0.0', description: `${name} tools for your agents.`, ...(key ? { key: { label: key } } : {}) }));
const integrations = [['blender', 'Blender'], ['unity', 'Unity'], ['meshy', 'Meshy AI'], ['rea', 'Reverse Engineer Anything'], ['mirofish', 'MiroFish']].map(([id, name]) => ({ id, name, description: `${name} integration.`, available: true, connected: id === 'meshy', enabled: true, keyId: id === 'meshy' ? 'meshyai' : '' }));
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const errors = [];
  for (const [name, engine, options] of profiles) {
    const browser = await engine.launch(), context = await browser.newContext(options), state = structuredClone(base);
    state.mode = 'dashboard'; Object.assign(state.settings, { setupComplete: true, trimStyle: 'classic' });
    state.toolCatalog = catalog; state.integrations = integrations; state.vault = { available: true, entries: [{ id: 'meshyai', label: 'Meshy AI Key', savedAt: Date.now() }] };
    await context.exposeFunction('fixtureCall', async m => m === 'state' ? { ok: true, value: state } : { ok: true, value: [] });
    await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.session-grid').waitFor();
    await page.locator('.sidebar-bottom [data-page=settings]').click(); await page.locator('.settings-navigation [data-page=tools]').click();
    await page.waitForTimeout(400);
    await page.locator('.tool-catalog').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `tools-${name}-catalog.png`) });
    await page.locator('[data-integration=meshy]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, `tools-${name}-builtin.png`) });
    const broken = await page.evaluate(() => [...document.querySelectorAll('.integration-mark img')].filter(img => !img.complete || !img.naturalWidth).map(img => img.src));
    if (broken.length) errors.push(`${name}: broken logos ${broken.join(', ')}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push(`${name}: overflow`);
    await browser.close();
  }
  server.close(); console.log(errors.length ? errors.join('\n') : 'no page errors, all logos loaded');
})().catch(e => { console.error(e); process.exit(1); });
