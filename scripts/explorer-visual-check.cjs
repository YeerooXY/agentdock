'use strict';
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.build/explorer');
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const profiles = [
  ['pc', chromium, { viewport: { width: 1440, height: 1000 } }],
  ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }],
  ['android', chromium, { ...devices['Pixel 7'] }],
  ['iphone', webkit, { ...devices['iPhone 13'] }],
  ['desktop-760', chromium, { viewport: { width: 760, height: 900 } }]
];
const server = http.createServer((req, res) => {
  const file = path.resolve(root, 'dist', '.' + (req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
let browser;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options), calls = [], errors = [], state = structuredClone(base);
    state.mode = 'dashboard'; state.settings.setupComplete = true; state.settings.suggestProjects = false; state.settings.sidebarCollapsed = true;
    state.settings.explorerWidth = 260; state.settings.vimControls = true; state.codePanels = []; state.codeRevision = 0;
    state.projects = [{ id: 'project', name: 'Example', folders: [{ label: 'App', path: root }, { label: 'Docs', path: root + '/docs' }], milestones: [], progress: { done: 0, total: 0 } }];
    state.sessions = [{ ...base.sessions[0], id: 'source', consoleKey: 'source-key', projectId: 'project', cwd: root, alive: true, dismissed: false, remote: null, remoteHostId: null, state: 'open', purpose: 'agent', provider: 'codex', name: 'Example', slot: 1, width: 1, height: 1, launchId: null }];
    const original = structuredClone(state.sessions); let page;
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      calls.push([method, payload]); let value = [];
      if (method === 'state') value = state;
      if (method === 'session.buffer') value = { data: 'Fixture console\r\n', sequence: 0 };
      if (method === 'explorer.list') value = { entries: payload.path === 'src' ? [{ name: 'nested.js', path: 'src/nested.js', directory: false }] : [{ name: 'src', path: 'src', directory: true }, { name: 'readme.txt', path: 'readme.txt', directory: false }], truncated: false };
      if (method === 'code.create') { value = { id: 'code-one', kind: 'code', alive: true, state: 'open', slot: 2, width: 2, height: 2, name: 'Code', cwd: payload.root, codeSourceKey: null }; state.codePanels.push(value); }
      if (method === 'code.report') value = { id: 'empty', mode: 'working', changes: [], notes: [] };
      if (method === 'code.browse') value = { path: payload.path, items: [{ name: 'nested.js', path: 'src/nested.js', directory: false }] };
      if (method === 'code.file') value = { file: payload.path, before: null, after: 'export const fixture = true;\n', mode: 'file' };
      if (method === 'settings') Object.assign(state.settings, payload);
      if (['settings', 'code.create'].includes(method)) setTimeout(() => page.evaluate(s => window.fixtureState(s), state).catch(() => {}), 5);
      return { ok: true, value };
    });
    await context.addInitScript(() => { window.fixtureFiles = 0; window.dock = { call: async (m, p) => { const result = await window.fixtureCall(m, p); if (m === 'code.file') ++window.fixtureFiles; return result; }, onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    await context.addInitScript({ path: require.resolve('axe-core/axe.min.js') });
    page = await context.newPage(); page.on('pageerror', reason => errors.push(reason.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('.terminal-instance textarea').focus();
    const consoleCount = await page.locator('.terminal-instance').count();
    await page.locator('#explorer-toggle').click();
    const folder = page.locator('[role=treeitem][data-path=src]'); await folder.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.path), 'src', 'opening Explorer focuses the first item after loading');
    assert.equal(calls.filter(([m]) => m === 'explorer.list').every(([, p]) => p.path === ''), true, 'no eager descendant listing');
    await folder.focus(); await page.keyboard.press('ArrowRight');
    await page.locator('[role=treeitem][data-path="src/nested.js"]').waitFor();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.path), 'src/nested.js');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.path), 'src');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.locator('.code-panel .cm-content').waitFor();
    assert.equal(await page.locator('[data-code-filename]').textContent(), 'src/nested.js');
    assert.equal(await page.locator('[data-code-action=full]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('.code-panel').textContent(), /Read only/);
    assert.equal(await page.locator('.terminal-instance').count(), consoleCount);
    assert.deepEqual(state.sessions, original);
    assert.equal(calls.some(([m]) => /session\.(input|create|end|kill)|prompt|rename|delete|write|move/.test(m)), false, 'file opening never touches consoles or writes');
    if (options.viewport?.width < 900 || ['android', 'iphone'].includes(name)) await page.locator('#explorer-pane').waitFor({ state: 'hidden' });
    else assert.equal(await page.locator('[data-path="src/nested.js"]').getAttribute('aria-selected'), 'true');
    if (await page.locator('#explorer-pane').isHidden()) {
      await page.locator('#explorer-toggle').click();
      assert.equal(await page.evaluate(() => document.activeElement.dataset.path), 'src/nested.js', 'reopening Explorer focuses the selected file');
    }
    await page.locator('[data-path="src/nested.js"]').focus(); await page.keyboard.press('Space');
    await page.waitForFunction(() => window.fixtureFiles >= 2);
    assert.equal(calls.filter(([m]) => m === 'code.create').length, 1, 'reuse the matching Code panel');
    if (options.viewport?.width < 900 || ['android', 'iphone'].includes(name)) await page.locator('#explorer-pane').waitFor({ state: 'hidden' });
    if (await page.locator('#explorer-pane').isHidden()) await page.locator('#explorer-toggle').click();
    const width = page.locator('.explorer-resize'); await width.focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await width.getAttribute('aria-valuenow'), '270');
    await page.getByRole('searchbox', { name: 'Filter loaded filenames' }).fill('nested');
    assert.equal(await page.locator('[role=treeitem]').count(), 2);
    await page.getByRole('searchbox', { name: 'Filter loaded filenames' }).fill('');
    for (const selector of ['#sidebar', '#explorer-pane', '.code-panel']) {
      const violations = await page.evaluate(async selector => (await axe.run(document.querySelector(selector), { runOnly: ['color-contrast', 'button-name', 'label', 'aria-valid-attr-value'] })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), selector);
      assert.deepEqual(violations, [], `${name}: ${selector}`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: no horizontal overflow`);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    await page.locator('[aria-label="Explorer root"]').selectOption(root + '/docs');
    await page.waitForFunction(() => document.querySelector('.explorer-status')?.textContent.includes('Docs'));
    assert.match(await page.locator('.explorer-status').textContent(), /Showing Example/);
    await page.locator('[aria-label="Explorer root"]').selectOption(root);
    await page.locator('[data-path="src/nested.js"]').waitFor();
    assert.equal(calls.filter(([m]) => m === 'explorer.list').every(([, p]) => ['', 'src'].includes(p.path)), true);
    assert.deepEqual(errors, []); console.log(`${name}: Explorer checks passed (emulated)`);
    await context.close(); await browser.close(); browser = null;
  }
})().catch(reason => { console.error(reason); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
