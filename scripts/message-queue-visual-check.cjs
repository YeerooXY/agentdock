'use strict';
// The shipped renderer with fake IPC: an agent console's queue button opens a
// panel to queue, edit, reorder, send and save prompts. Run after npm run build:
// node scripts/message-queue-visual-check.cjs
const { chromium, webkit, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { initialSettings } = require('../electron/settings.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.join(root, '.build', 'message-queue');
fs.mkdirSync(out, { recursive: true });
const profiles = [
  ['windows-chromium', chromium, { viewport: { width: 1440, height: 900 } }],
  ['desktop-webkit-mac-emulation', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }],
  ['android-chromium-pixel7-emulation', chromium, devices['Pixel 7']],
  ['iphone-webkit-iphone13-emulation', webkit, devices['iPhone 13']],
];
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
const copy = value => JSON.parse(JSON.stringify(value));
const now = Date.now();
const session = (id, slot, provider, extra = {}) => ({ id, consoleKey: id, projectId: null, slot, width: 1, height: 1, name: id, nameMode: 'custom', cwd: 'C:\\Workspace', provider, permissions: 'default', launchModel: '', accountId: null, launchId: 'l-' + id, purpose: 'agent', switching: false, dismissed: false, draftSupported: false, switchTargets: [], state: 'active', alive: true, cols: 80, rows: 24, sequence: 0, usage: null, createdAt: now, updatedAt: now, ...extra });
function makeState() {
  return {
    mode: 'dashboard', transitioning: false, trayHidden: false, grid: { columns: 3, rows: 3 },
    sessions: [session('Kiro', 1, 'kiro', { projectId: 'p1' }), session('Shell', 2, 'shell', { state: 'open' })],
    settings: initialSettings({ setupComplete: true, suggestProjects: false, restoreConsoles: false, consoleDefaults: { provider: 'codex', cwd: 'C:\\Workspace', name: '', command: '' } }, 'C:\\Workspace', {}),
    agents: [{ id: 'kiro', name: 'Kiro', installed: true }, { id: 'codex', name: 'Codex', installed: true }],
    queues: {}, prompts: [{ id: 'all', name: 'Tests first', text: 'Write the failing test first.', projectId: null, updatedAt: now }, { id: 'other', name: 'Other project', text: 'Hidden here', projectId: 'p2', updatedAt: now }],
    accounts: [], limits: [], projects: [{ id: 'p1', name: 'Site', status: 'active' }], recent: [], accountError: null, refreshing: false, lastRefresh: 0, capabilities: {}, sshHosts: [], messages: [], ledger: [],
    summary: { requests: 0, tokens: 0 }, shared: { connections: [], profiles: [], imageGeneration: { provider: 'agent', previewFirst: true }, instructions: '' },
    workbench: { results: [], concepts: [], unreadResults: 0, setupRequests: [] }, vault: { available: false, entries: [] }, integrations: [], toolCatalog: [], toolLimits: {},
    defaultFolder: 'C:\\Workspace', version: 'fixture', screenshot: null,
  };
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const record = [];
  for (const [name, type, options] of profiles) {
    const browser = await type.launch({ headless: true });
    const context = await browser.newContext(options);
    const state = makeState(), calls = [], errors = [];
    let page, nextId = 1;
    const publish = () => page.evaluate(value => window.fixtureReceive?.(value), copy(state));
    const entries = () => (state.queues.Kiro ||= { paused: false, entries: [] }).entries;
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      if (method === 'state') return { ok: true, value: copy(state) };
      if (method === 'session.buffer') return { ok: true, value: { data: 'PS C:\\Workspace> ', sequence: 0, launchId: 'l-' + payload } };
      if (method.startsWith('queue.') || method.startsWith('prompt.') || method === 'session.input') calls.push([method, copy(payload)]);
      if (method === 'queue.add') { const entry = { id: 'e' + nextId++, text: payload.text, createdAt: now }; entries().push(entry); await publish(); return { ok: true, value: entry }; }
      if (method === 'queue.edit') { entries().find(x => x.id === payload.entryId).text = payload.text; await publish(); }
      if (method === 'queue.move') { const list = entries(), i = list.findIndex(x => x.id === payload.entryId), [item] = list.splice(i, 1); list.splice(i + payload.offset, 0, item); await publish(); }
      if (method === 'queue.remove' || method === 'queue.send') { state.queues.Kiro.entries = entries().filter(x => x.id !== payload.entryId); await publish(); }
      if (method === 'queue.pause') { state.queues.Kiro.paused = payload.paused; await publish(); }
      if (method === 'prompt.save') { state.prompts.push({ ...payload, id: 'saved', updatedAt: now }); await publish(); }
      return { ok: true, value: null };
    });
    await context.addInitScript(() => {
      window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: c => { window.fixtureReceive = c; }, onOutput: c => { window.fixtureOutput = c; }, onSelect: c => { window.fixtureSelect = c; }, onNotice: c => { window.fixtureNotice = c; } };
    });
    page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const toggle = page.locator('.session-card[data-console-id="Kiro"] [data-queue-open]');
    await toggle.waitFor({ state: 'attached' });
    assert.equal(await page.locator('.session-card[data-console-id="Shell"] [data-queue-open]').count(), 0, `${name}: plain shells have no queue`);
    await toggle.focus(); await toggle.click();
    const panel = page.locator('#queue-panel');
    await panel.waitFor({ state: 'visible' });
    assert.equal(await panel.locator('#queue-title').innerText(), 'Queue · Kiro');
    assert.match(await panel.locator('[data-queue-prompt-count]').innerText(), /\(1\)/, `${name}: prompts from other projects are hidden`);
    const text = panel.locator('textarea[name=text]');
    await text.fill('Check the header on phones');
    await panel.locator('[data-queue-submit]').click();
    await text.fill('Then run the tests\nand report back');
    await text.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await panel.locator('.queue-list li[data-entry]').nth(1).waitFor();
    assert.deepEqual(calls.filter(c => c[0] === 'queue.add').map(c => c[1]), [{ id: 'Kiro', text: 'Check the header on phones' }, { id: 'Kiro', text: 'Then run the tests\nand report back' }]);
    assert.equal(await toggle.locator('[data-queue-count]').innerText(), '2', `${name}: the button shows the count`);
    // Reorder and edit.
    await panel.locator('.queue-list li[data-entry]').nth(1).locator('[data-queue-move="-1"]').click();
    await page.waitForFunction(() => document.querySelector('.queue-list li[data-entry] p')?.textContent.startsWith('Then run'));
    await panel.locator('.queue-list li[data-entry]').nth(1).locator('[data-queue-edit]').click();
    assert.equal(await text.inputValue(), 'Check the header on phones');
    await text.fill('Check the header on iPhone'); await panel.locator('[data-queue-submit]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.queue-list li[data-entry] p')].some(p => p.textContent === 'Check the header on iPhone'));
    // Saved prompt: use it, then save a new one for this project.
    await panel.locator('.queue-prompts summary').click();
    await panel.locator('[data-prompt="all"] [data-prompt-use]').click();
    assert.equal(await text.inputValue(), 'Write the failing test first.');
    await text.fill('Keep the copy short.');
    await panel.locator('[data-queue-save-open]').click();
    await panel.locator('input[name=promptName]').fill('Short copy');
    await panel.locator('input[name=projectOnly]').check();
    await panel.locator('[data-queue-save-confirm]').click();
    await panel.locator('[data-prompt="saved"]').waitFor();
    assert.deepEqual(calls.find(c => c[0] === 'prompt.save')[1], { name: 'Short copy', text: 'Keep the copy short.', projectId: 'p1' });
    await panel.locator('[data-queue-pause]').check();
    await page.waitForFunction(() => document.querySelector('[data-queue-hint]').textContent.startsWith('Paused'));
    // Layout: panel inside the viewport, no overflowing rows.
    const box = await panel.boundingBox(), viewport = page.viewportSize();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${name}: panel fits ${JSON.stringify(box)}`);
    assert.equal(await panel.evaluate(el => [...el.querySelectorAll('li, .queue-buttons, .queue-heading')].every(x => x.scrollWidth <= x.clientWidth + 1)), true, `${name}: no clipped rows`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`);
    await page.screenshot({ path: path.join(out, `${name}-panel.png`) });
    // Send now and type now.
    await panel.locator('.queue-list li[data-entry]').first().locator('[data-queue-send]').click();
    await page.waitForFunction(() => document.querySelectorAll('.queue-list li[data-entry]').length === 1);
    await text.fill('typed only'); await panel.locator('[data-queue-type]').click();
    await panel.waitFor({ state: 'hidden' });
    assert.ok(calls.some(c => c[0] === 'session.input' && c[1].id === 'Kiro' && c[1].data.includes('typed only') && !c[1].data.includes('\r')), `${name}: type now does not press Enter`);
    await page.locator('.session-card[data-console-id="Kiro"]').screenshot({ path: path.join(out, `${name}-console.png`) });
    // The toggle closes an open panel instead of reopening it.
    await toggle.click(); await panel.waitFor({ state: 'visible' });
    await toggle.click(); await panel.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, [], name);
    record.push(`${name}: panel ${Math.round(box.width)}x${Math.round(box.height)} inside ${viewport.width}x${viewport.height}; queue, edit, reorder, send now, type now, pause and saved prompts checked`);
    await browser.close();
  }
  server.close();
  fs.writeFileSync(path.join(out, 'verification.md'), `# Message queue check\n\n${new Date().toISOString()}\n\nEmulated profiles (Playwright engines and device presets; not physical devices):\n\n${record.map(x => '- ' + x).join('\n')}\n\nReal-device font rendering on macOS and iOS is not verified by emulation.\n`);
  console.log(record.join('\n'));
})().catch(error => { console.error(error); server.close(); process.exit(1); });
