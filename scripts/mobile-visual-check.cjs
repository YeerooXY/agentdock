'use strict';
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'mobile-views'); fs.mkdirSync(out, { recursive: true });
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'console-layout', 'fixture.json')));
const server = http.createServer((req, res) => { const pathname = req.url.split('?')[0]; const file = pathname === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(root, 'dist', pathname === '/' ? 'index.html' : pathname); if (pathname !== '/_axe.js' && !file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); } res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); fs.createReadStream(file).pipe(res); });
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, { ...devices['Pixel 7'] }], ['iphone', webkit, { ...devices['iPhone 13'] }]];
const markdown = fs.readFileSync(path.join(__dirname, 'fixtures/result-preview.md'), 'utf8');
const reports = []; let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const qr = await require('qrcode').toDataURL('Agent Dock visual test — this is not a pairing credential');
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options); const state = structuredClone(fixture);
    state.mode = 'dashboard'; state.settings.setupComplete = true; state.settings.sidebarCollapsed = false;
    state.mobile = { enabled: true, host: '192.168.1.5', port: 47831, interfaces: [{ address: '192.168.1.5', name: 'Wi-Fi', tailscale: false }], devices: [{ id: 'phone-demo', name: 'Android phone', connected: true, alerts: true }], push: { configured: true, project: 'agent-dock-demo' }, pairingExpires: Date.now() + 300000 };
    state.workbench.results = [{ id: '01010101-0101-4101-8101-010101010101', title: '2 changed files', kind: 'code', status: 'needs-review', summary: 'Changes during this turn', ext: '.json', size: 700, at: Date.now(), project: 'C:/Projects/Trader', consoleKey: 'trader', consoleName: 'Trader', groupId: 'turn-demo', seenAt: null, image: false, source: 'Agent' }];
    let unsafeMarkdown = false;
    state.workbench.results.push({ ...state.workbench.results[0], id: '02020202-0202-4202-8202-020202020202', title: 'Verification notes', kind: 'test', ext: '.md' });
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      if (method === 'state') return { ok: true, value: state };
      if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0 } };
      if (method === 'session.models') return { ok: true, value: [] };
      if (method === 'mobile.invite') return { ok: true, value: { code: 'visual-fixture-only', qr, expires: state.mobile.pairingExpires } };
      if (method === 'workbench.results.preview' && (payload.id || payload) === '02020202-0202-4202-8202-020202020202') return { ok: true, value: { text: unsafeMarkdown ? '# Unsafe fixture\n<script>window.unsafeResult=true</script>\n<img src="https://example.invalid/tracker" onerror="window.unsafeResult=true">\n[Run](javascript:alert(1))\n![Remote](https://example.invalid/image)' : markdown } };
      if (method === 'workbench.results.preview') return { ok: true, value: { diff: { notes: ['Other consoles were active in this folder. Authorship may overlap.'], changes: [{ file: 'src/components/page.js', type: 'modified', patch: '--- src/components/page.js\n+++ src/components/page.js\n@@ -1 +1 @@\n-const status = "waiting";\n+const status = "ready";' }, { file: 'assets/preview.png', type: 'added', omitted: 'Binary file' }] } } };
      if (method === 'settings') Object.assign(state.settings, payload);
      if (method === 'mode') state.mode = payload;
      return { ok: true };
    });
    await context.addInitScript(() => { window.dock = { call: (method, payload) => window.fixtureCall(method, payload), onState: () => {}, onOutput: () => {}, onSelect: () => {} }; });
    const page = await context.newPage(), errors = [], captures = [], checks = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(15000);
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.session-grid').waitFor();
    await page.addScriptTag({ url: '/_axe.js' });
    async function capture(view) {
      await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().filter(x => x.effect?.getTiming().iterations !== Infinity).forEach(x => x.finish()); });
      const file = `${name}-${view}.png`; await page.screenshot({ path: path.join(out, file) }); captures.push(file);
      const findings = await page.evaluate(async () => (await axe.run(document, { runOnly: ['color-contrast','button-name','label','aria-dialog-name'] })).violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) })));
      assert.deepEqual(findings, [], `${name} ${view} accessibility checks`);
      const overflow = await page.evaluate(() => { const d = document.querySelector('dialog[open]'); return d ? d.scrollWidth > d.clientWidth + 1 || d.getBoundingClientRect().right > innerWidth + 1 : document.documentElement.scrollWidth > innerWidth + 1; }); assert.equal(overflow, false, `${name} ${view} overflow`); checks.push(view);
    }
    await page.locator('[data-page=settings]').click(); await page.locator('[data-mobile=open]').click(); await capture('connection');
    await page.locator('.mobile-step summary').focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.mobile-step details[open]').count(), 1); await capture('remote-help');
    await page.keyboard.press('Enter'); assert.equal(await page.locator('.mobile-step details[open]').count(), 0);
    await page.locator('[data-mobile=next]').click(); await page.locator('[data-mobile=pair]').click(); await capture('pair-phone');
    await page.locator('[data-mobile=next]').click(); await capture('alerts');
    await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => document.querySelector('dialog[open]').contains(document.activeElement)));
    await page.locator('[data-mobile=close]').last().click();
    await page.locator('[data-page=results]').first().click(); await page.getByRole('button', { name: '2 changed files', exact: true }).click(); await capture('code-diff');
    await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.getByRole('button', { name: 'Verification notes', exact: true }).click(); await page.locator('.result-markdown h1').waitFor(); await capture('markdown');
    assert.equal(await page.locator('.result-markdown table').count(), 1); assert.equal(await page.locator('.result-markdown pre code').count(), 1);
    await page.keyboard.press('Escape'); unsafeMarkdown = true; await page.getByRole('button', { name: 'Verification notes', exact: true }).click(); await page.locator('.result-markdown h1').waitFor();
    assert.equal(await page.locator('.result-markdown script,.result-markdown img,.result-markdown iframe,.result-markdown a').count(), 0); assert.equal(await page.evaluate(() => window.unsafeResult), undefined);
    assert.deepEqual(errors, []); reports.push({ profile: name, engine: browser.version(), emulated: name !== 'pc', captures, checks }); console.log('PASS ' + name + ' mobile setup, keyboard flow and code diff'); await browser.close(); browser = null;
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(reports, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
