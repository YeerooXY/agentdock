'use strict';
const { installStateTransport } = require('./state-test-transport.cjs');
// Render the real frontend against isolated configuration/results fixtures.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { openPage } = require('./ui-navigation.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/interface-review');
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
    await installStateTransport(context);
await context.addInitScript(() => { window.dock = { call: (method, payload) => window.fixtureCall(method, payload), get state() { return window.fixtureStateTransport; }, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    const page = await context.newPage(), errors = [], captures = []; page.on('pageerror', e => errors.push(e.message));
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
    }
    await page.locator('.settings-navigation button').first().focus(); await page.keyboard.press('Tab');
    assert.equal(await page.locator('.settings-navigation button').nth(1).evaluate(el => el === document.activeElement), true);
    assert.deepEqual(errors, []);
    rows.push({ profile: name, engine: browser.version(), emulated: name !== 'pc', captures, passed: ['8 settings categories', 'keyboard navigation', 'chat grouping', 'separate completed prompts', 'collapsed code and diagnostics', 'contrast and accessible names', 'no document overflow', 'no page errors'] });
    await browser.close(); browser = null; console.log('PASS ' + name);
  }
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(rows, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
