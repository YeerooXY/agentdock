'use strict';
// Render the real frontend against isolated configuration/results fixtures.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { openPage } = require('./ui-navigation.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/settings-permissions/browser');
fs.mkdirSync(out, { recursive: true });
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json'), 'utf8'));
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0], file = pathname === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, pathname === '/' ? 'index.html' : pathname);
  if ((pathname !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
const rows = []; let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options), state = structuredClone(fixture);
    state.mode = 'dashboard'; state.settings.setupComplete = true; state.settings.sidebarCollapsed = false;
    const base = { kind: 'report', status: 'passed', ext: '.md', size: 120, project: 'C:/Projects', at: 1792573200000, seenAt: null, image: false, summary: 'Settings categories and navigation checked.' };
    state.workbench.results = [
      { ...base, id: 'a', title: 'Settings checks', consoleKey: 'chat-one', consoleName: 'Agentdock', groupId: 'one' },
      { ...base, id: 'b', title: '2 changed files', kind: 'code', ext: '.json', changeCount: 2, consoleKey: 'chat-one', consoleName: 'Agentdock', groupId: 'one' },
      { ...base, id: 'c', title: 'Mobile choices', consoleKey: 'chat-two', consoleName: 'Phone controls', groupId: 'two', summary: 'Effort changes preserve the selected model.' },
      { ...base, id: 'd', title: 'Earlier prompt', consoleKey: 'chat-one', consoleName: 'Agentdock', groupId: 'three', at: base.at - 60000 },
    ];
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      if (method === 'state') return { ok: true, value: state };
      if (method === 'settings') { Object.assign(state.settings, payload); return { ok: true }; }
      if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0 } };
      if (method === 'session.models') return { ok: true, value: [] };
      if (method === 'workbench.results.preview') return { ok: true, value: payload.id === 'b' ? { diff: { notes: ['No Git inventory.', 'Other consoles were active in this folder.'], changes: [{ file: 'src/settings-ui.js', type: 'added', patch: '+export const categories = [];' }, { file: 'src/app.js', type: 'modified', patch: '-old\n+updated' }] } } : { text: '# Checks complete\n\nSettings and navigation checked in this synthetic verification fixture.' } };
      if (method === 'workbench.results.seen') { for (const item of state.workbench.results) if (payload.includes(item.id)) item.seenAt ||= Date.now(); return { ok: true }; }
      return { ok: true };
    });
    await context.addInitScript(() => { window.dock = { call: (method, payload) => window.fixtureCall(method, payload), onState: () => {}, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    const page = await context.newPage(), errors = [], captures = [], smallText = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.session-grid').waitFor();
    await page.addScriptTag({ url: '/_axe.js' });
    async function capture(view) {
      await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().filter(x => x.effect?.getTiming().iterations !== Infinity).forEach(x => x.finish()); });
      const file = `${name}-${view}.png`; await page.screenshot({ path: path.join(out, file) }); captures.push(file);
      const issues = await page.evaluate(async () => (await axe.run(document, { runOnly: ['color-contrast', 'button-name', 'label', 'aria-dialog-name'] })).violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) })));
      assert.deepEqual(issues, [], `${name}/${view}: accessibility checks`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}/${view}: overflow`);
    }
    await page.locator('[data-page=settings]').click();
    for (const category of ['general-settings', 'appearance', 'console-settings', 'devices', 'api-settings', 'vault', 'tools', 'instructions']) {
      await openPage(page, category);
      assert.equal(await page.locator('.settings-navigation [aria-current=page]').count(), 1);
      assert.equal(await page.locator('h1').allTextContents().then(x => x.filter(x => x === 'Settings').length), 1);
      await capture(category);
      smallText.push(...await page.locator('.settings-workspace').evaluate((root, category) => [...root.querySelectorAll('*')].filter(el => el.getClientRects().length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 14).map(el => ({category,tag:el.tagName,text:el.textContent.trim().slice(0,90),size:getComputedStyle(el).fontSize})), category));
      if (category === 'general-settings') {
        const columns = await page.locator('.settings-general-columns').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        assert.equal(columns, name === 'pc' || name === 'mac' ? 2 : 1);
      }
    }
    await page.locator('.settings-navigation button').first().focus(); await page.keyboard.press('Tab');
    assert.equal(await page.locator('.settings-navigation button').nth(1).evaluate(el => el === document.activeElement), true);
    await openPage(page, 'results');
    assert.deepEqual(await page.locator('.result-console-heading h2').allTextContents(), ['Agentdock', 'Phone controls']);
    assert.equal(await page.locator('.result-batch').count(), 3);
    assert.equal(await page.getByText('Revision unavailable', { exact: true }).count(), 0);
    await capture('results');
    await page.locator('.result-controls').evaluate(el => el.open = true);
    await page.locator('#result-search').fill('Mobile choices');
    assert.equal(await page.locator('.result-batch').count(), 1);
    assert.match(await page.locator('.result-controls > summary').innerText(), /Filter active/);
    await page.locator('#result-search').fill('');
    await page.locator('.result-controls').evaluate(el => el.open = false);
    await page.locator('[data-wb=preview][data-id=b]').first().click(); await page.locator('.code-change').first().waitFor();
    assert.equal(await page.locator('.code-change[open]').count(), 0);
    assert.equal(await page.getByText('No Git inventory.', { exact: true }).isVisible(), false);
    await capture('code-details');
    await page.locator('.code-change summary').first().focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.code-change[open]').count(), 1);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, name + '-small-text.json'), JSON.stringify(smallText, null, 2));
    assert.deepEqual(smallText, [], name + ': Settings text below 14px');
    {
      await page.setViewportSize({width:320,height:820});
      for (const category of ['general-settings','appearance','console-settings','devices','api-settings','vault','tools','instructions']) {
        await openPage(page, category);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name + '/' + category + ': 320px reflow');
        await page.locator('.settings-workspace').evaluate(root => {
          const nodes = [root, ...root.querySelectorAll('*')].filter(el => !el.closest('svg'));
          const sizes = nodes.map(el => parseFloat(getComputedStyle(el).fontSize));
          nodes.forEach((el, i) => el.style.setProperty('font-size', sizes[i] * 2 + 'px', 'important'));
        });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, name + '/' + category + ': doubled text at 320px');
      }
      await page.screenshot({path:path.join(out, name + '-320px.png')});
    }
    rows.push({ profile: name, engine: browser.version(), emulated: name !== 'pc', captures, passed: ['8 settings categories with 14px minimum text', 'responsive two-column layout', '320px reflow with doubled text', 'keyboard navigation', 'chat grouping', 'separate completed prompts', 'collapsed code and diagnostics', 'contrast and accessible names', 'no document overflow', 'no page errors'] });
    await browser.close(); browser = null; console.log('PASS ' + name);
  }
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(rows, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
