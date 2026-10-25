'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data'); fs.mkdirSync(parent, { recursive: true });
const folder = fs.mkdtempSync(path.join(parent, 'code-native-')), project = path.join(folder, 'project'), data = path.join(folder, 'profile'); fs.mkdirSync(project);
const out = path.join(root, '.build/code-panel-20261025'); fs.mkdirSync(out, { recursive: true });
const git = (...args) => execFileSync('git', ['-C', project, ...args], { windowsHide: true, stdio: 'ignore' });
let app;
(async () => {
  git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
  fs.writeFileSync(path.join(project, 'app.js'), 'export const message = "before";\n'); git('add', '.'); git('commit', '-qm', 'baseline');
  fs.writeFileSync(path.join(project, 'app.js'), 'export const message = "after";\n');
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ setupComplete: true, suggestProjects: false, restoreConsoles: false, launchEffect: false, consoleDefaults: { provider: 'shell', cwd: project, name: 'Fixture', command: '' } }));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
  app = await electron.launch({ args: [root, '--smoke-test', `--data-dir=${data}`], env, timeout: 30000 });
  const page = await app.firstWindow(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(10000);
  await page.waitForSelector('.session-grid');
  const call = async (method, payload) => { const r = await page.evaluate(([m, p]) => window.dock.call(m, p), [method, payload]); assert.equal(r.ok, true, r.error); return r.value; };
  await call('setup.complete', { provider: 'shell', cwd: project, name: 'Fixture', command: '', launchNow: false });
  await call('settings', { suggestProjects: false, launchEffect: false });
  const source = await call('session.create', { provider: 'shell', cwd: project, name: 'Fixture', slot: 1 });
  const code = await call('code.create', { sourceId: source.id });
  await page.locator('.code-panel .cm-content').waitFor();
  assert.equal((await call('code.report', { id: code.id })).mode, 'working');
  await call('session.layout', { id: code.id, slot: 2, width: 2, height: 2 });
  assert.equal((await call('state')).codePanels[0].width, 2);
  await page.locator('.code-panel [data-action=toggle-console]').click(); await page.locator('.code-panel.console-expanded').waitFor();
  await page.locator('[data-code-action=full]').click(); await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+Home'); await page.keyboard.press('Control+Shift+End');
  // Exercise the real renderer -> IPC path without replacing the user's clipboard.
  await app.evaluate(({ clipboard }) => { globalThis.originalClipboardWrite = clipboard.writeText; clipboard.writeText = text => { globalThis.copiedFixture = text; }; });
  await page.locator('[data-code-action=copy]:not([disabled])').click();
  assert.equal(await app.evaluate(() => globalThis.copiedFixture), 'export const message = "after";');
  await page.locator('[data-code-action=close]').click();
  assert.equal((await call('state')).sessions.find(s => s.id === source.id).alive, true);
  assert.equal((await call('state')).settings.slotNames[2], undefined);
  // A real shell supplies harmless output; copying a terminal selection must
  // use the clipboard IPC while Ctrl+C without a selection still reaches it.
  await call('session.input', { id: source.id, data: 'Clear-Host; Write-Output "PADDOCK_COPY_FIXTURE"\r' });
  const terminal = page.locator('.terminal-instance').first();
  await page.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent.includes('PADDOCK_COPY_FIXTURE'));
  const line = terminal.locator('.xterm-rows>div').filter({ hasText: /^PADDOCK_COPY_FIXTURE\s*$/ }).first();
  const rect = await line.boundingBox(); assert.ok(rect);
  const cell = await terminal.locator('.xterm-char-measure-element').first().evaluate(x => x.getBoundingClientRect().width / (x.textContent.length || 1));
  await page.mouse.move(rect.x + 1, rect.y + rect.height / 2); await page.mouse.down(); await page.mouse.move(rect.x + (cell || 8) * 20, rect.y + rect.height / 2, { steps: 10 }); await page.mouse.up();
  await page.keyboard.press('Control+c');
  assert.match(await app.evaluate(() => globalThis.copiedFixture), /PADDOCK_COPY_FIXTURE/);
  await page.screenshot({ path: path.join(out, 'native-grid.png') });
  assert.deepEqual(errors, []);
  const result = { passed: true, native: 'Windows Electron', checks: ['real working-tree diff', 'grid resize and expansion', 'read-only code copy through IPC', 'terminal selection copy through IPC', 'closing code preserves shell'], clipboard: 'Native clipboard writer intercepted to preserve user clipboard', paidRequests: 0 };
  fs.writeFileSync(path.join(out, 'native-checks.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  await app?.close(); assert.equal(path.dirname(fs.realpathSync(folder)), fs.realpathSync(parent)); fs.rmSync(folder, { recursive: true, force: true });
});
