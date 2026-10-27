'use strict';
// Phone setup in Tailscale mode, synthetic state, on the four browser profiles.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/appearance-v2');
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0], file = path.join(dist, p === '/' ? 'index.html' : p);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 900 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const errors = [];
  for (const [name, engine, options] of profiles) {
    for (const withTailscale of [true, false]) {
      const browser = await engine.launch(), context = await browser.newContext(options), state = structuredClone(base);
      state.mode = 'dashboard'; Object.assign(state.settings, { setupComplete: true, trimStyle: 'void' });
      state.mobile = { enabled: false, host: '', port: 47831, mode: 'tailscale', notice: withTailscale ? '' : 'Phones now connect only through Tailscale, which other devices on your Wi-Fi cannot reach. Choose this PC’s Tailscale address below, then enter it in the phone app under Connection. Paired phones stay paired.', interfaces: [{ name: 'Wi-Fi', address: '192.168.1.20', tailscale: false, local: false }, ...(withTailscale ? [{ name: 'Tailscale', address: '100.101.102.103', tailscale: true, local: false }] : [])], devices: [], push: {}, network: {} };
      let page;
      await context.exposeFunction('fixtureCall', async (method) => {
        if (method === 'state') return { ok: true, value: state };
        if (method === 'mobile.status') return { ok: true, value: state.mobile };
        return { ok: true, value: [] };
      });
      await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
      page = await context.newPage(); page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
      await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.session-grid').waitFor();
      await page.locator('.sidebar-bottom [data-page=settings]').click(); await page.locator('.settings-navigation [data-page=devices]').click();
      await page.locator('[data-mobile=open]').click(); await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(out, `tailscale-${name}-${withTailscale ? 'found' : 'missing'}.png`) });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push(`${name}: overflow`);
      if (await page.evaluate(() => { const d = document.querySelector('.mobile-setup[open]'); return !d || d.scrollWidth > d.clientWidth + 1 || d.getBoundingClientRect().right > innerWidth + 1; })) errors.push(`${name}: setup dialog overflow`);
      if (await page.locator('#mobile-mode').count()) errors.push(`${name}: Wi-Fi choice still shown`);
      const hosts = await page.locator('#mobile-host option').evaluateAll(o => o.map(x => x.value));
      if (hosts.some(h => !h.startsWith('100.')) || hosts.length !== (withTailscale ? 1 : 0)) errors.push(`${name}: listed ${hosts.join(', ') || 'no'} addresses`);
      await browser.close();
    }
  }
  server.close(); console.log(errors.length ? errors.join('\n') : 'no page errors');
})().catch(e => { console.error(e); process.exit(1); });
