'use strict';
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { imageSettings } = require('../electron/image-generation.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'image-preview'), dist = path.join(root, 'dist');
const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json'))); // Run image-preview-smoke.cjs first.
const server = http.createServer((req, res) => {
  const name = req.url.split('?')[0], file = name === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, name === '/' ? 'index.html' : name);
  if ((name !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
let browser; const reports = [];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options), state = structuredClone(fixture), errors = [], captures = [];
    const small = ['android', 'iphone'].includes(name); let calls = 0;
    state.mode = 'dashboard'; state.settings.sidebarCollapsed = small; state.shared.imageGeneration = imageSettings();
    const review = state.fixtureReview, images = state.fixtureImages; delete state.fixtureReview; delete state.fixtureImages;
    state.workbench.conceptUsage = []; state.workbench.concepts = [];
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      let value;
      if (method === 'state') return { ok: true, value: state };
      if (method === 'workbench.review.get') return { ok: true, value: review };
      if (method === 'workbench.results.preview') return { ok: true, value: images[typeof payload === 'string' ? payload : payload.id] };
      if (method === 'images.settings') { try { state.shared.imageGeneration = imageSettings(payload); } catch (error) { return { ok: false, error: error.message }; } }
      else if (method === 'settings') Object.assign(state.settings, payload);
      else if (method === 'workbench.preview.generate') {
        calls++; assert.equal(state.shared.imageGeneration.provider, 'openai'); assert.ok(payload.requestId); assert.equal(payload.reviewId, review.id);
        const source = state.workbench.results.find(x => x.image), id = 'mock-image';
        state.workbench.results.unshift({ ...source, id, title: 'Mocked image response', kind: 'concept', status: 'needs-review', summary: 'Test fixture only; no AI generation was performed.', at: Date.now() }); images[id] = images[source.id];
        state.workbench.concepts.unshift({ id: 'mock-job', provider: 'openai', state: 'complete', reviewId: review.id, resultId: id });
        state.workbench.conceptUsage.unshift({ id: 'mock-job', resultId: id, provider: 'openai', model: state.shared.imageGeneration.model, at: Date.now(), state: 'complete', usage: { input: 42, output: 0 }, credits: null });
        value = { id: 'mock-job' };
      } else if (method === 'workbench.results.seen') { /* metadata-only fixture */ }
      else if (method === 'workbench.review.brief') value = 'Fixture design brief';
      else if (method === 'workbench.concept.delete') state.workbench.concepts = state.workbench.concepts.filter(x => x.id !== payload);
      else throw Error('Unexpected fixture call ' + method);
      return { ok: true, value, state };
    });
    await context.addInitScript(() => { let changed; window.dock = { call: async (m, p) => { const r = await window.fixtureCall(m, p); if (r.state) changed?.(r.state); return r; }, onState: f => { changed = f; }, onOutput: () => {}, onSelect: () => {} }; });
    const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port); await page.locator('.session-grid').waitFor(); await page.addScriptTag({ url: '/_axe.js' });
    async function nav(view) {
      if (state.settings.sidebarCollapsed) await page.locator('#sidebar-toggle').click();
      await page.locator(`nav [data-page=${view}]`).first().click();
      if (small && !state.settings.sidebarCollapsed) await page.locator('#sidebar-toggle').click();
    }
    async function capture(view, scope) {
      await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().filter(x => x.effect?.getTiming().iterations !== Infinity).forEach(x => x.finish()); });
      const file = `${name}-${view}.png`; await page.screenshot({ path: path.join(out, file) }); captures.push(file);
      const checks = await page.evaluate(async selector => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('#content, dialog[open]')].some(x => x.getClientRects().length && x.scrollWidth > x.clientWidth + 1), findings: (await axe.run(document.querySelector(selector), { runOnly: ['color-contrast', 'button-name', 'label'] })).violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) })) }), scope);
      assert.equal(checks.overflow, false, `${name}/${view} overflow`); assert.deepEqual(checks.findings, [], `${name}/${view} accessibility`);
    }
    await nav('tools'); const form = page.locator('#image-generation-form'); await form.waitFor();
    assert.equal(await form.locator('[data-image-api]').isVisible(), false); await capture('native-settings', '#image-generation-form');
    await form.locator('[name=provider]').selectOption('openai'); await form.locator('[name=keyId]').selectOption('image-test'); await capture('api-settings', '#image-generation-form');
    await form.locator('[name=previewFirst]').focus(); await page.keyboard.press('Space'); await form.locator('[type=submit]').click();
    await page.waitForFunction(async () => (await window.dock.call('state')).value.shared.imageGeneration.provider === 'openai'); assert.equal(state.shared.imageGeneration.previewFirst, false);
    await form.locator('[name=provider]').selectOption('compatible'); await form.locator('[name=model]').fill('local-image-model'); await form.locator('[name=url]').fill('http://example.com/images/edits'); await form.locator('[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#image-generation-form .form-error').textContent.includes('HTTPS')); await capture('endpoint-error', '#image-generation-form');
    assert.equal(state.shared.imageGeneration.provider, 'openai');
    await form.locator('[name=provider]').selectOption('gemini'); assert.match(await form.locator('[name=model]').inputValue(), /nano-banana/); assert.equal(await form.locator('[name=url]').isVisible(), false);
    await form.locator('[name=provider]').selectOption('meshy'); assert.equal(await form.locator('[data-image-api]').isVisible(), false);
    await nav('reviews'); await page.locator('[data-wb=review-open]').first().click(); await page.locator('.review-concepts').waitFor();
    await page.locator('.review-concepts').evaluate(x => x.scrollIntoView({ block: 'start' })); await capture('review-route', '.review-concepts');
    await page.locator('[data-wb=generate-preview]').click(); await page.locator('[data-preview-jobs] [data-wb=preview]').waitFor(); assert.equal(calls, 1);
    await page.locator('[data-preview-jobs] [data-wb=preview]').click(); await page.locator('#result-preview img').waitFor();
    assert.match(await page.locator('.wb-dialog').textContent(), /Mocked image response/); assert.equal(await page.locator('.wb-dialog').evaluate(x => x.scrollTop), 0); await capture('returned-image', '.wb-dialog');
    await page.keyboard.press('Escape'); await page.locator('.wb-dialog').waitFor({ state: 'hidden' });
    await page.locator('[data-wb=review-open]').first().click(); await page.locator('[data-wb=image-settings]').click(); await form.waitFor(); assert.equal(await form.locator('[name=provider]').inputValue(), 'openai');
    await nav('usage'); const usage = page.locator('.image-usage'); await usage.waitFor(); await usage.evaluate(x => x.scrollIntoView({ block: 'start' }));
    assert.match(await usage.textContent(), /Unavailable/); assert.equal(await usage.locator('tbody td').nth(4).textContent(), '0'); await capture('image-usage', '.image-usage');
    await usage.locator('[data-wb=concept-delete]').click(); await page.waitForFunction(async () => (await window.dock.call('state')).value.workbench.concepts.length === 0);
    assert.equal(state.workbench.conceptUsage.length, 1); assert.ok(state.workbench.results.some(x => x.id === 'mock-image'));
    assert.deepEqual(errors, []);
    reports.push({ profile: name, engine: browser.version(), emulated: name !== 'pc', captures, checks: ['generator choices and field states', 'keyboard preview toggle', 'save and invalid endpoint recovery', 'selected review provider', 'single mocked generation and preview opening', 'change generator navigation', 'unknown versus zero usage', 'selected axe checks', 'no horizontal overflow', 'no page errors'], paidRequests: 0 });
    await browser.close(); browser = null; console.log('PASS ' + name + ' screen preview settings, routing and Results');
  }
  fs.writeFileSync(path.join(out, 'visual-checks.json'), JSON.stringify(reports, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
