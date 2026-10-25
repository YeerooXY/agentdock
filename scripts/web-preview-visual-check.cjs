'use strict';
// The shipped renderer with fake IPC: a preview panel shows a local server,
// reloads when its linked console finishes a turn, and the titlebar opens one.
// Run after npm run build: node scripts/web-preview-visual-check.cjs
const { chromium, webkit, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { initialSettings } = require('../electron/settings.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.join(root, '.build', 'web-preview');
fs.mkdirSync(out, { recursive: true });
const profiles = [
  ['windows-chromium', chromium, { viewport: { width: 1440, height: 900 } }],
  ['desktop-webkit-mac-emulation', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }],
  ['android-chromium-pixel7-emulation', chromium, devices['Pixel 7']],
  ['iphone-webkit-iphone13-emulation', webkit, devices['iPhone 13']],
];
const app = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
let hits = 0;
const site = http.createServer((req, res) => { hits++; res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><title>Site</title><body style="font:20px sans-serif;margin:24px"><h1>Local site</h1><p id="hit">Load ${hits}</p></body>`); });
const copy = value => JSON.parse(JSON.stringify(value));
const now = Date.now();
function makeState(sitePort) {
  return {
    mode: 'dashboard', transitioning: false, trayHidden: false, grid: { columns: 3, rows: 3 },
    sessions: [{ id: 'kiro-1', consoleKey: 'kiro-key', projectId: null, slot: 1, width: 1, height: 1, name: 'Kiro', nameMode: 'custom', cwd: 'C:\\Workspace', provider: 'kiro', permissions: 'default', launchModel: '', accountId: null, launchId: 'l1', purpose: 'agent', switching: false, dismissed: false, draftSupported: false, switchTargets: [], state: 'active', alive: true, cols: 80, rows: 24, sequence: 0, usage: null, createdAt: now, updatedAt: now }],
    codePanels: [{ id: 'web-1', kind: 'web', provider: 'web', purpose: 'web', alive: true, state: 'open', name: 'Preview', url: `http://127.0.0.1:${sitePort}/`, slot: 2, width: 2, height: 2, codeSourceKey: 'kiro-key', consoleKey: 'web-key' }],
    settings: initialSettings({ setupComplete: true, suggestProjects: false, restoreConsoles: false, consoleDefaults: { provider: 'codex', cwd: 'C:\\Workspace', name: '', command: '' } }, 'C:\\Workspace', {}),
    agents: [{ id: 'kiro', name: 'Kiro', installed: true }], queues: {}, prompts: [],
    accounts: [], limits: [], projects: [], recent: [], accountError: null, refreshing: false, lastRefresh: 0, capabilities: {}, sshHosts: [], messages: [], ledger: [],
    summary: { requests: 0, tokens: 0 }, shared: { connections: [], profiles: [], imageGeneration: { provider: 'agent', previewFirst: true }, instructions: '' },
    workbench: { results: [], concepts: [], unreadResults: 0, setupRequests: [] }, vault: { available: false, entries: [] }, integrations: [], toolCatalog: [], toolLimits: {},
    defaultFolder: 'C:\\Workspace', version: 'fixture', screenshot: null,
  };
}
(async () => {
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
  const record = [];
  for (const [name, type, options] of profiles) {
    const browser = await type.launch({ headless: true });
    const context = await browser.newContext(options);
    const state = makeState(site.address().port), calls = [], errors = [];
    let page;
    const publish = () => page.evaluate(value => window.fixtureReceive?.(value), copy(state));
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      if (method === 'state') return { ok: true, value: copy(state) };
      if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0, launchId: 'l1' } };
      if (method.startsWith('web.')) calls.push([method, copy(payload)]);
      if (method === 'web.create') { state.codePanels.push({ ...state.codePanels[0], id: 'web-2', url: '', slot: 4, width: 1, height: 1, codeSourceKey: payload.sourceId ? 'kiro-key' : null }); await publish(); }
      if (method === 'web.url') { if (!/^(localhost|127\.0\.0\.1)/.test(payload.url)) throw new Error('Preview shows local servers only: localhost, 127.0.0.1 or [::1].'); state.codePanels.find(x => x.id === payload.id).url = 'http://' + payload.url + '/'; await publish(); }
      return { ok: true, value: null };
    });
    await context.addInitScript(() => {
      window.dock = { call: (m, p) => window.fixtureCall(m, p).then(r => r, e => { throw e; }), onState: c => { window.fixtureReceive = c; }, onOutput: c => { window.fixtureOutput = c; }, onSelect: c => { window.fixtureSelect = c; }, onNotice: c => { window.fixtureNotice = c; } };
    });
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${app.address().port}`);
    const panel = page.locator('.web-panel[data-console-id="web-1"]');
    await panel.waitFor();
    const frame = page.frameLocator('.web-panel[data-console-id="web-1"] iframe');
    await frame.locator('#hit').waitFor();
    const before = hits;
    // The linked console finishes a turn: the preview reloads once.
    state.sessions[0].state = 'ready'; await publish();
    await page.waitForFunction(() => true); await page.waitForTimeout(400);
    assert.equal(hits, before + 1, `${name}: a finished turn reloads the preview`);
    await publish(); await page.waitForTimeout(200);
    assert.equal(hits, before + 1, `${name}: staying ready does not reload again`);
    await panel.locator('[data-web-action="reload"]').click(); await page.waitForTimeout(300);
    assert.equal(hits, before + 2, `${name}: the reload button reloads`);
    assert.match(await panel.locator('[data-web-action="reload"]').getAttribute('title'), /Kiro finishes a turn/);
    const header = await panel.locator('.console-panel-header').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
    assert.equal(header, true, `${name}: preview header fits`);
    await page.screenshot({ path: path.join(out, `${name}-grid.png`) });
    // Titlebar button opens an empty panel with guidance and a focused address field.
    const create = page.locator('.titlebar [data-web-action="create"]');
    if (await create.isVisible()) {
      await create.click();
      const added = page.locator('.web-panel[data-console-id="web-2"]');
      await added.locator('.web-empty').waitFor();
      await added.locator('input[name=url]').fill('example.com');
      await added.locator('input[name=url]').press('Enter');
      await page.locator('.toast, [role=status]').filter({ hasText: 'local servers only' }).first().waitFor();
      await added.locator('input[name=url]').fill(`127.0.0.1:${site.address().port}`);
      await added.locator('input[name=url]').press('Enter');
      await page.frameLocator('.web-panel[data-console-id="web-2"] iframe').locator('#hit').waitFor();
      await added.screenshot({ path: path.join(out, `${name}-new-panel.png`) });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`);
    const closeBox = await page.locator('.titlebar .window-actions button').last().boundingBox();
    assert.ok(closeBox && closeBox.x + closeBox.width <= page.viewportSize().width + 1, `${name}: titlebar window buttons stay visible ${await page.locator(".titlebar").evaluate(el => [...el.children].map(c => c.className + ":" + Math.round(c.getBoundingClientRect().width)).join(" "))}`);
    assert.deepEqual(errors, [], name);
    record.push(`${name}: preview loaded, reloaded on a finished turn and on demand; titlebar button ${await create.isVisible() ? 'opened a panel and rejected a non-local address' : 'hidden at this width'}`);
    await browser.close();
  }
  app.close(); site.close();
  fs.writeFileSync(path.join(out, 'verification.md'), `# Web preview check\n\n${new Date().toISOString()}\n\nEmulated profiles (Playwright engines and device presets; not physical devices):\n\n${record.map(x => '- ' + x).join('\n')}\n\nThe Electron frame-navigation guard is covered by the desktop suite, not this browser fixture.\n`);
  console.log(record.join('\n'));
})().catch(error => { console.error(error); app.close(); site.close(); process.exit(1); });
