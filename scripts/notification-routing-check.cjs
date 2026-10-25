'use strict';
const { openPage } = require('./ui-navigation.cjs');
// Run after test:desktop to reuse its synthetic state. No production profile.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/notification-routing');
const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json'), 'utf8'));
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
    browser = await engine.launch(); const context = await browser.newContext(options), state = structuredClone(fixture), previews = [];
    state.mode = 'dashboard'; state.settings.sidebarCollapsed = false;
    const base = { kind: 'report', status: 'passed', ext: '.md', size: 100, project: 'C:/Projects', seenAt: null, image: false, consoleKey: 'same-chat', consoleName: 'Agentdock', summary: 'Synthetic notification routing check.' };
    state.workbench.results = Array.from({ length: 17 }, (_, i) => ({ ...base, id: `result-${i}`, groupId: `prompt-${i}`, at: 1792593000000 - i * 60000, title: i === 16 ? 'The completed prompt' : `Newer prompt ${i}` }));
    state.workbench.results.unshift({ ...base, id: 'other-chat', groupId: 'other-prompt', consoleKey: 'another-chat', consoleName: 'Other chat', at: 1792593000001, title: 'Unrelated report' });
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      if (method === 'state') return { ok: true, value: state };
      if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0 } };
      if (method === 'session.models') return { ok: true, value: [] };
      if (method === 'mode') { state.mode = payload; setTimeout(() => page.evaluate(s => window.fixtureState(s), state).catch(() => {}), 0); return { ok: true }; }
      if (method === 'workbench.results.preview') { previews.push(payload.id); return { ok: true, value: { text: '# Finished prompt\n\nThis is the result linked to the notification. Newer prompts stay separate.' } }; }
      if (method === 'workbench.results.seen') { for (const item of state.workbench.results) if (payload.includes(item.id)) item.seenAt ||= Date.now(); return { ok: true }; }
      return { ok: true };
    });
    await context.addInitScript(() => { window.dock = { call: (method, payload) => window.fixtureCall(method, payload), onState: fn => window.fixtureState = fn, onOutput() {}, onSelect() {}, onNotice: fn => window.fixtureNotice = fn }; });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('.session-grid').waitFor();
    await page.addScriptTag({ url: '/_axe.js' });
    await openPage(page, 'results');
    await page.locator('.result-controls').evaluate(el => el.open = true);
    await page.locator('#result-search').fill('Unrelated report');
    const notice = { kind: 'ready', sessionId: state.sessions[0].id, destination: 'results', resultId: 'result-16', turnId: 'prompt-16' };
    await page.evaluate(item => window.fixtureNotice(item), notice);
    await page.locator('.wb-dialog[open] h2').filter({ hasText: 'The completed prompt' }).waitFor();
    assert.equal(await page.locator('.session-card.console-expanded').count(), 0); assert.deepEqual(previews, ['result-16']);
    assert.equal(await page.locator('#result-search').inputValue(), '');
    assert.equal(await page.locator('.result-page-number').innerText(), '2 / 2');
    const issues = await page.evaluate(async () => (await axe.run(document, { runOnly: ['color-contrast', 'button-name', 'label', 'aria-dialog-name'] })).violations.map(x => x.id));
    assert.deepEqual(issues, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(out, `${name}-notification-result.png`) });
    await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(), 0);
    state.workbench.results = state.workbench.results.filter(x => x.id !== 'result-16');
    await page.evaluate(s => window.fixtureState(s), state); await page.evaluate(item => window.fixtureNotice(item), notice);
    await page.locator('#toast').filter({ hasText: 'These results are no longer available.' }).waitFor();
    assert.equal(await page.locator('.session-card.console-expanded').count(), 0); assert.deepEqual(previews, ['result-16']);
    await page.evaluate(item => window.fixtureNotice(item), { kind: 'ready', destination: 'results', sessionId: state.sessions[0].id, turnId: 'empty-prompt' });
    // A text-only turn opens its console, where the reply is.
    await page.locator('#toast').filter({ hasText: 'Its reply is in this console.' }).waitFor();
    await page.locator(`.session-card.console-expanded[data-console-id="${state.sessions[0].id}"]`).waitFor(); assert.deepEqual(errors, []);
    rows.push({ profile: name, browser: browser.version(), emulated: name !== 'pc', passed: ['Exact completed prompt despite newer results and filters', 'Correct pagination', 'Deleted result does not open a console', 'A text-only turn opens its console', 'Keyboard Escape', 'Scoped contrast and labels', 'No overflow or page errors'], screenshot: `${name}-notification-result.png` });
    await browser.close(); browser = null; console.log('PASS ' + name);
  }
  fs.writeFileSync(path.join(out, 'browser-checks.json'), JSON.stringify(rows, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
