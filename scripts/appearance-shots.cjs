'use strict';
// Real renderer, synthetic state, no agent processes or paid requests.
// Usage: node scripts/appearance-shots.cjs [label] — writes artifacts/appearance-v2/<label>-*.png
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/appearance-v2');
const label = process.argv[2] || 'shot', only = process.env.PADDOCK_VISUAL_PROFILE;
const themes = (process.env.PADDOCK_THEMES || '').split(',').filter(Boolean);
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0], file = path.join(dist, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: process.env.PADDOCK_WIDE ? { width: 2000, height: 1125 } : { width: 1440, height: 900 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const errors = [];
  for (const [name, engine, options] of profiles.filter(([n]) => !only || only.split(',').includes(n))) {
    const browser = await engine.launch();
    for (const theme of themes.length ? themes : ['classic']) {
      const context = await browser.newContext(options), state = structuredClone(base);
      state.mode = 'dashboard'; Object.assign(state.settings, { setupComplete: true, sidebarCollapsed: false, trimStyle: theme, theme, slotTrims: {}, panelStars: true, launchEffect: true, cursorBlink: false });
      if (process.env.PADDOCK_LIGHTING) state.settings.lighting = process.env.PADDOCK_LIGHTING;
      state.sessions = ['Claude workspace', 'Codex workspace', 'Kiro workspace'].map((n, i) => ({ ...base.sessions[0], id: `fixture-${i}`, slot: i + 1, width: 1, height: i === 2 ? 2 : 1, state: i === 2 ? 'ready' : i ? 'open' : 'active', name: n }));
      let page;
      await context.exposeFunction('fixtureCall', async (method, payload) => {
        if (method === 'state') return { ok: true, value: state };
        if (method === 'settings') { Object.assign(state.settings, payload); await page.evaluate(s => window.fixtureState(s), state); return { ok: true }; }
        if (method === 'session.buffer') return { ok: true, value: { data: 'Console appearance fixture\r\n\r\n> Reviewing the current workspace.\r\n\r\nPS C:\Projects> ', sequence: 0 } };
        return { ok: true, value: [] };
      });
      await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
      page = await context.newPage(); page.on('pageerror', e => errors.push(`${name}/${theme}: ${e.message}`));
      await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.session-grid').waitFor();
      await page.waitForTimeout(Number(process.env.PADDOCK_WAIT || 600));
      await page.screenshot({ path: path.join(out, `${label}-${name}-${theme}-consoles.png`) });
      if (process.env.PADDOCK_SETTINGS !== 'off') {
        await page.locator('.sidebar-bottom [data-page=settings], [data-page=settings]').first().click();
        await page.waitForTimeout(400);
        const appearanceTab = page.locator('[data-page=appearance]').first();
        if (await appearanceTab.isVisible()) await appearanceTab.click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(out, `${label}-${name}-${theme}-settings.png`), fullPage: false });
        for (const extra of ['general-settings', 'console-settings', 'tools']) {
          await page.locator(`.settings-navigation [data-page="${extra}"]`).click(); await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(out, `${label}-${name}-${theme}-${extra}.png`) });
          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push(`${name}/${extra}: horizontal overflow`);
        }
        await page.keyboard.press('Escape'); await page.waitForTimeout(300);
        if (await page.locator('body[data-settings-open]').count()) errors.push(`${name}: Esc did not close settings`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (overflow) errors.push(`${name}/${theme}: horizontal overflow`);
      await context.close();
    }
    await browser.close();
  }
  server.close();
  console.log(errors.length ? errors.join('\n') : 'no page errors');
})().catch(e => { console.error(e); process.exit(1); });
