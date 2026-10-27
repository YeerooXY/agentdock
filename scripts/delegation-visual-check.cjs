'use strict';
// Cross-agent reviews section on the Usage page, synthetic state, on the four browser profiles.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/delegation');
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0], file = p === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, p === '/' ? 'index.html' : p);
  if ((p !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const errors = [];
  for (const [name, engine, options] of profiles) {
    for (const enabled of [false, true]) {
      const browser = await engine.launch(), context = await browser.newContext(options), state = structuredClone(base);
      state.mode = 'dashboard'; Object.assign(state.settings, { setupComplete: true, sidebarCollapsed: false, delegationEnabled: enabled, delegationProviders: ['claude', 'codex'] });
      state.ledger = []; state.usageAccounts = [];
      state.delegations = enabled ? [
        { id: 'a', state: 'running', reviewer: { label: 'Codex · Work account' }, why: 'Codex · Work account: a different vendor from Claude Code, 62% left, resets in 3 hours.', consoleName: 'Builder', startedAt: Date.now() },
        { id: 'b', state: 'done', verdict: 'changes-requested', reviewer: { label: 'Claude Code' }, why: 'Claude Code: the same vendor as the caller, usage unknown.', consoleName: 'A very long console name that needs to wrap on a phone screen', startedAt: Date.now() - 600000 },
        { id: 'c', state: 'failed', reviewer: { label: 'Claude Code' }, why: '', error: 'Claude Code exited with code 1. The reviewer returned no answer. Sign in to Claude Code in a console first.', consoleName: 'Builder', startedAt: Date.now() - 900000 }
      ] : [];
      await context.exposeFunction('fixtureCall', method => ({ ok: true, value: method === 'state' ? state : method === 'session.buffer' ? { data: '', sequence: 0 } : [] }));
      await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
      await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('[data-page=usage]').click();
      const section = page.locator('.delegation-settings'); await section.waitFor(); await section.scrollIntoViewIfNeeded();
      if (await page.locator('[data-delegation-stop]').count() !== (enabled ? 1 : 0)) errors.push(`${name}: wrong Stop count`);
      if (await page.locator('.delegation-reviewers').evaluate(x => x.disabled) === enabled) errors.push(`${name}: reviewer choice ${enabled ? 'disabled' : 'enabled'}`);
      await page.addScriptTag({ url: '/_axe.js' });
      const axe = await page.evaluate(async () => (await window.axe.run('.delegation-settings', { runOnly: ['color-contrast', 'button-name', 'label'] })).violations.map(x => x.id));
      if (axe.length) errors.push(`${name}: axe ${axe.join(', ')}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('#content').scrollWidth > document.querySelector('#content').clientWidth + 1)) errors.push(`${name}: overflow`);
      await section.screenshot({ path: path.join(out, `${name}-${enabled ? 'on' : 'off'}.png`) });
      await browser.close();
    }
  }
  server.close(); console.log(errors.length ? errors.join('\n') : 'no page errors');
})().catch(e => { console.error(e); process.exit(1); });
