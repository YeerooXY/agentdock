'use strict';
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts/results-check'), dist = path.join(root, 'dist');
const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json'))); // Run results-smoke.cjs first.
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0], file = pathname === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, pathname === '/' ? 'index.html' : pathname);
  if ((pathname !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
const report = []; let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options), state = structuredClone(fixture.state);
    state.mode = 'dashboard'; state.settings.sidebarCollapsed = false;
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      if (method === 'state') return { ok: true, value: state };
      if (method === 'workbench.results.preview') return { ok: true, value: fixture.previews[(payload.id || payload) + (payload.entry == null ? '' : ':' + payload.entry)] };
      if (method === 'workbench.results.seen') { for (const item of state.workbench.results) if(payload.includes(item.id)) item.seenAt ||= Date.now(); return {ok:true}; }
      if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0 } };
      return { ok: true };
    });
    await context.addInitScript(() => { window.dock = { call: (method, payload) => window.fixtureCall(method, payload), onState: () => {}, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    const page = await context.newPage(), errors = [], screenshots = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(15000);
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.session-grid').waitFor(); await page.addScriptTag({ url: '/_axe.js' });
    async function capture(view) {
      await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().filter(x => x.effect?.getTiming().iterations !== Infinity).forEach(x => x.finish()); });
      const file = `${name}-${view}.png`; await page.screenshot({ path: path.join(out, file) }); screenshots.push(file);
      const findings = await page.evaluate(async () => (await axe.run(document, { runOnly: ['color-contrast','button-name','label','aria-dialog-name'] })).violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) })));
      assert.deepEqual(findings, [], `${name}/${view}: accessibility checks`);
      assert.equal(await page.evaluate(() => { const d = document.querySelector('dialog[open]'); return d ? d.scrollWidth > d.clientWidth + 1 || d.getBoundingClientRect().right > innerWidth + 1 : document.documentElement.scrollWidth > innerWidth + 1; }), false, `${name}/${view}: overflow`);
    }
    await page.locator('nav [data-page=results]').click(); await capture('gallery');
    await page.getByRole('button',{name:'Browse 2 pictures',exact:true}).click(); await page.locator('.result-full-image').waitFor(); await capture('gallery-viewer');
    const active = await page.locator('.result-filmstrip [aria-current=true]').getAttribute('data-id');
    await page.keyboard.press(active===fixture.pictureIds[0] ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForFunction(() => document.querySelectorAll('.result-filmstrip button[aria-label$="viewed"]:not([aria-label$="not viewed"])').length===2);
    await capture('gallery-viewed'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Verification files', exact: true }).click(); await page.locator('.archive-content img').waitFor(); await capture('archive-image');
    await page.locator('[data-entry="1"]').focus(); await page.keyboard.press('Enter'); await page.locator('.result-markdown h1').waitFor(); await capture('archive-markdown');
    assert.equal(await page.locator('.result-markdown table').count(), 1); assert.equal(await page.locator('.result-markdown pre code').count(), 1);
    await page.locator('.wb-dialog [data-wb=preview]').click(); await page.locator('.code-diff').waitFor(); await capture('code-diff');
    assert.match(await page.locator('.code-git-context').innerText(), /main · aaaaaaaa/);
    assert.match(await page.locator('.code-git-context').innerText(), /main · bbbbbbbb/);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.locator('nav [data-page=tools]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.integration-heading img')].length === 3 && [...document.querySelectorAll('.integration-heading img')].every(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.locator('.integration-heading img').count(), 3);
    await capture('tools');
    if (['android', 'iphone'].includes(name)) for (const id of ['unity', 'meshy']) {
      await page.locator(`[data-integration="${id}"]`).scrollIntoViewIfNeeded();
      await capture('tools-' + id);
    }
    await page.getByText('Logo credits', { exact: true }).focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.tool-brand-notices').getAttribute('open'), '');
    assert.match(await page.locator('.tool-brand-notices').innerText(), /Unity and the Unity logo/);
    assert.deepEqual(errors, []); report.push({ profile: name, engine: browser.version(), emulated: name !== 'pc', screenshots, checks: ['archive image and Markdown', 'branch and commit pairs', 'code diff', 'bundled Blender/Unity/Meshy logos', 'keyboard selection and Escape', 'contrast and labels', 'overflow', 'no page errors'] });
    await browser.close(); browser = null; console.log('PASS ' + name + ' Results');
  }
  fs.writeFileSync(path.join(out, 'visual-checks.json'), JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
