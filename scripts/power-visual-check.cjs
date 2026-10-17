'use strict';
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'power-check');
const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json'))); // Run power-smoke.cjs first.
const dist = path.join(root, 'dist');
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  const file = pathname === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, pathname === '/' ? 'index.html' : pathname);
  if ((pathname !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
const report = []; let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options), state = structuredClone(fixture);
    state.mode = 'dashboard'; state.settings.setupComplete = true; state.settings.keepAwakeWhileWorking = true;
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      if (method === 'state') return { ok: true, value: state };
      if (method === 'settings') Object.assign(state.settings, payload);
      return { ok: true };
    });
    await context.addInitScript(() => { window.dock = { call: (method, payload) => window.fixtureCall(method, payload), onState: () => {}, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.session-grid').waitFor();
    await page.locator('[data-page=settings]').click();
    const toggle = page.getByRole('checkbox', { name: 'Keep PC awake while agents work Your screen can still turn off.' });
    assert.equal(await toggle.isChecked(), true);
    await toggle.focus(); await page.keyboard.press('Space'); await page.waitForFunction(() => !document.querySelector('[data-setting=keepAwakeWhileWorking]').checked);
    assert.equal(state.settings.keepAwakeWhileWorking, false); await toggle.check();
    await toggle.locator('xpath=ancestor::section').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().filter(x => x.effect?.getTiming().iterations !== Infinity).forEach(x => x.finish()); });
    await page.addScriptTag({ url: '/_axe.js' });
    const findings = await page.evaluate(async () => (await axe.run(document, { runOnly: ['color-contrast','button-name','label'] })).violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) })));
    assert.deepEqual(findings, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const file = `${name}-settings.png`; await page.screenshot({ path: path.join(out, file) });
    assert.deepEqual(errors, []); report.push({ profile: name, engine: browser.version(), emulated: name !== 'pc', screenshot: file, checks: ['keyboard toggle', 'labels', 'contrast', 'overflow', 'no page errors'] });
    await browser.close(); browser = null; console.log('PASS ' + name + ' awake setting');
  }
  fs.writeFileSync(path.join(out, 'visual-checks.json'), JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
