'use strict';
const { openPage, openResultFolder } = require('./ui-navigation.cjs');
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
    const svg = (w, h) => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#777"/></svg>`).toString('base64');
    const fullImages = { [fixture.pictureIds[0]]: svg(2000, 1000), [fixture.pictureIds[1]]: svg(1000, 1600) };
    let failureId = null, delayedId = null, release = null, seen = [];
    state.mode = 'dashboard'; state.settings.sidebarCollapsed = false;
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      if (method === 'state') return { ok: true, value: state };
      if (method === 'workbench.results.preview') {
        const id = payload.id || payload;
        if (!payload.thumbnail && fullImages[id]) {
          if (id === delayedId) { delayedId = null; await new Promise(resolve => { release = resolve; }); }
          if (id === failureId) { failureId = null; return { ok: true, value: { image: 'data:image/png;base64,broken' } }; }
          return { ok: true, value: { image: fullImages[id] } };
        }
        return { ok: true, value: fixture.previews[id + (payload.entry == null ? '' : ':' + payload.entry)] };
      }
      if (method === 'workbench.results.seen') { seen.push(...payload); for (const item of state.workbench.results) if(payload.includes(item.id)) item.seenAt ||= Date.now(); return {ok:true}; }
      if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0 } };
      return { ok: true };
    });
    await context.exposeFunction('viewerFixture', (action, id) => { if (action === 'fail') failureId = id; if (action === 'delay') delayedId = id; if (action === 'release') { release?.(); release = null; } if (action === 'reset') seen = []; return { seen, waiting: !!release }; });
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
    await openPage(page, 'results'); await capture('folders'); await openResultFolder(page); await capture('gallery');
    const opener = page.getByRole('button',{name:'Browse 2 pictures',exact:true}); await opener.click(); await page.locator('.image-gallery:modal .result-full-image').waitFor();
    await page.waitForFunction(() => document.querySelector('.image-stage img')?.naturalWidth > 0);
    assert.equal(await page.locator('.image-filmstrip').getAttribute('open'), null); assert.equal(await page.locator('.image-details').getAttribute('open'), null);
    assert.equal(await page.locator('.image-gallery [data-wb=close]').evaluate(x => x === document.activeElement), true);
    await page.waitForFunction(() => document.querySelector('.result-filmstrip [aria-current=true]')?.getAttribute('aria-label').endsWith(', viewed'));
    await capture('gallery-viewer');
    const active = await page.locator('.result-filmstrip [aria-current=true]').getAttribute('data-id');
    const ordered = await page.locator('.result-filmstrip button').evaluateAll(nodes => nodes.map(node => node.dataset.id));
    await page.keyboard.press(active===fixture.pictureIds[0] ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForFunction(() => document.querySelectorAll('.result-filmstrip button[aria-label$="viewed"]:not([aria-label$="not viewed"])').length===2);
    await capture('gallery-viewed'); await page.keyboard.press('Escape');
    assert.equal(await opener.evaluate(x => x === document.activeElement), true);
    if (name === 'pc') {
      for (const [width, height] of [[800,600],[1440,900],[2560,1440]]) {
        await page.setViewportSize({ width, height }); await opener.click();
        const modal = page.locator('.image-gallery:modal'), stage = modal.locator('.image-stage');
        await page.waitForFunction(() => !!document.querySelector('.image-stage img')?.style.width);
        const currentId = await modal.locator('.result-filmstrip [aria-current=true]').getAttribute('data-id');
        const geometry = await modal.evaluate(d => { const box = x => { const r = x.getBoundingClientRect(); return [r.width, r.height]; }; const img = d.querySelector('.result-full-image'); return { outer:box(d), stage:box(d.querySelector('.image-stage')), image:box(img), natural:[img.naturalWidth,img.naturalHeight] }; });
        const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 2, `${width}x${height}: ${actual} vs ${expected}`);
        close(geometry.outer[0], width * .96); close(geometry.outer[1], height * .96);
        close(geometry.stage[0], width * .96 - 24); close(geometry.stage[1], height * .96 - 120);
        const scale = Math.min(2, geometry.stage[0]/geometry.natural[0], geometry.stage[1]/geometry.natural[1]);
        close(geometry.image[0], geometry.natural[0] * scale); close(geometry.image[1], geometry.natural[1] * scale);
        await modal.locator('[data-wb=image-actual]').click();
        const actual = await modal.locator('.result-full-image').boundingBox(); close(actual.width, geometry.natural[0]); close(actual.height, geometry.natural[1]);
        await stage.focus(); await page.keyboard.press('ArrowRight');
        assert.equal(await modal.locator('.result-filmstrip [aria-current=true]').getAttribute('data-id'), currentId);
        const moved = await modal.locator('.result-full-image').evaluate(x => x.style.transform); await page.keyboard.press('ArrowRight');
        if (geometry.natural[0] > geometry.stage[0]) assert.notEqual(moved, 'translate(0px, 0px)');
        await modal.locator('[data-wb=image-fit]').click(); assert.equal(await modal.locator('.result-full-image').evaluate(x => x.style.transform), 'translate(0px, 0px)');
        await modal.locator('.image-filmstrip summary').click();
        await modal.locator(`.result-filmstrip button[data-id="${ordered.find(id => id !== currentId)}"]`).click();
        await page.waitForFunction(id => document.querySelector('.result-filmstrip [aria-current=true]')?.dataset.id !== id && !!document.querySelector('.image-stage img')?.style.width, currentId);
        const other = await modal.evaluate(d => { const stage = d.querySelector('.image-stage').getBoundingClientRect(), img = d.querySelector('.result-full-image'), rect = img.getBoundingClientRect(); return { stage:[stage.width,stage.height], natural:[img.naturalWidth,img.naturalHeight], image:[rect.width,rect.height] }; });
        const otherScale = Math.min(2, other.stage[0]/other.natural[0], other.stage[1]/other.natural[1]);
        close(other.image[0], other.natural[0] * otherScale); close(other.image[1], other.natural[1] * otherScale);
        await stage.dblclick(); assert.equal(await modal.locator('[data-wb=image-actual]').getAttribute('aria-pressed'), 'true');
        const box = await stage.boundingBox(); await page.mouse.move(box.x + box.width/2, box.y + box.height/2); await page.mouse.down(); await page.mouse.move(box.x + box.width/2 + 5000, box.y + box.height/2 + 5000); await page.mouse.up();
        const bounds = await modal.evaluate(d => { const s = d.querySelector('.image-stage').getBoundingClientRect(), i = d.querySelector('.result-full-image').getBoundingClientRect(); return { sx:s.x, sy:s.y, sw:s.width, sh:s.height, ix:i.x, iy:i.y, iw:i.width, ih:i.height }; });
        if (bounds.iw > bounds.sw) assert.ok(bounds.ix <= bounds.sx + 2 && bounds.ix + bounds.iw >= bounds.sx + bounds.sw - 2);
        if (bounds.ih > bounds.sh) assert.ok(bounds.iy <= bounds.sy + 2 && bounds.iy + bounds.ih >= bounds.sy + bounds.sh - 2);
        await stage.dblclick(); assert.equal(await modal.locator('[data-wb=image-fit]').getAttribute('aria-pressed'), 'true');
        await page.keyboard.press('Escape');
      }
      await page.setViewportSize({ width:1440, height:900 });
      const [first, second] = ordered;
      await page.evaluate(id => window.viewerFixture('fail', id), first);
      await page.locator(`[data-wb=preview][data-id="${first}"]`).first().click();
      await page.locator('.image-error [data-wb=retry-image]').waitFor();
      assert.equal(await page.locator('[data-wb=retry-image]').evaluate(x => x === document.activeElement), true);
      await page.locator('[data-wb=retry-image]').click(); await page.waitForFunction(() => document.querySelector('.image-stage img')?.naturalWidth > 0);
      await page.keyboard.press('Escape');
      await page.evaluate(id => { window.viewerFixture('reset'); return window.viewerFixture('delay', id); }, first);
      await page.locator(`[data-wb=preview][data-id="${first}"]`).first().click();
      await page.waitForFunction(async () => (await window.viewerFixture('status')).waiting);
      await page.locator('[data-wb=next-image]').click();
      await page.waitForFunction(id => document.querySelector('.result-filmstrip [aria-current=true]')?.dataset.id === id && document.querySelector('.image-stage img')?.naturalWidth > 0, second);
      await page.waitForFunction(async id => (await window.viewerFixture('status')).seen.includes(id), second);
      await page.evaluate(() => window.viewerFixture('release'));
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
      assert.deepEqual((await page.evaluate(() => window.viewerFixture('status'))).seen, [second]);
      await page.keyboard.press('Escape');
      await page.evaluate(id => { window.viewerFixture('reset'); return window.viewerFixture('delay', id); }, first);
      await page.locator(`[data-wb=preview][data-id="${first}"]`).first().click();
      await page.waitForFunction(async () => (await window.viewerFixture('status')).waiting);
      await page.keyboard.press('Escape'); await page.evaluate(() => window.viewerFixture('release'));
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
      assert.deepEqual((await page.evaluate(() => window.viewerFixture('status'))).seen, []);
      assert.equal(await page.locator('.image-gallery[open]').count(), 0);
      await page.locator('#result-kind').selectOption('screenshot');
      await page.locator(`[data-wb=preview][data-id="${first}"]`).first().scrollIntoViewIfNeeded();
      const beforeScroll = await page.locator('#content').evaluate(x => x.scrollTop);
      await page.locator(`[data-wb=preview][data-id="${first}"]`).first().click();
      await page.setViewportSize({ width:800, height:600 }); assert.equal(await page.locator('.image-gallery:modal').count(), 1);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#result-kind').inputValue(), 'screenshot');
      assert.equal(await page.locator('#content').evaluate(x => x.scrollTop), beforeScroll);
      await page.setViewportSize({ width:1440, height:900 }); await page.locator('#result-kind').selectOption('');
    }
    await page.getByRole('button', { name: 'Verification files', exact: true }).click(); await page.locator('.archive-content img').waitFor(); await capture('archive-image');
    await page.locator('[data-entry="1"]').focus(); await page.keyboard.press('Enter'); await page.locator('.result-markdown h1').waitFor(); await capture('archive-markdown');
    assert.equal(await page.locator('.result-markdown table').count(), 1); assert.equal(await page.locator('.result-markdown pre code').count(), 1);
    await page.locator('.wb-dialog [data-wb=preview]').click(); await page.locator('.code-change summary').first().click(); await page.locator('.code-diff').waitFor();
    await page.getByText('Capture details', { exact: true }).click(); await capture('code-diff');
    assert.match(await page.locator('.wb-dialog .result-technical').innerText(), /main · aaaaaaaa/);
    assert.match(await page.locator('.wb-dialog .result-technical').innerText(), /main · bbbbbbbb/);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(), 0);
    await openPage(page, 'tools');
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
