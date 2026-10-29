'use strict';
// Render the production first-run and API views in four local browser profiles.
// The bridge is synthetic: no CLI install, login, model call or external request.
const { chromium, webkit, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { initialSettings } = require('../electron/settings.cjs');
const { catalog } = require('../electron/cli-catalog.cjs');
const { openPage } = require('./ui-navigation.cjs');

const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.join(root, '.build', 'agent-installation-verification-2026-10-25', 'visual');
const workspace = path.join(out, 'workspace'); fs.mkdirSync(workspace, { recursive: true }); fs.mkdirSync(out, { recursive: true });
const baseFixture = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'console-layout', 'fixture.json'), 'utf8'));
const profiles = [
  ['windows-chromium', chromium, { viewport: { width: 1440, height: 900 } }],
  ['desktop-webkit-mac-emulation', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }],
  ['android-chromium-pixel7-emulation', chromium, devices['Pixel 7']],
  ['iphone-webkit-iphone13-emulation', webkit, devices['iPhone 13']]
];
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});

let browser; const results = [];
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [name, engine, options] of profiles.filter(([name]) => !process.env.PADDOCK_VISUAL_PROFILE || process.env.PADDOCK_VISUAL_PROFILE.split(',').includes(name))) {
    browser = await engine.launch();
    const state = structuredClone(baseFixture);
    const settings = initialSettings({ ...state.settings, setupComplete: false, suggestProjects: false }, root, state.capabilities);
    settings.consoleDefaults.cwd = workspace; settings.consoleDefaults.provider = 'qwen';
    const agents = catalog.map(agent => ({ id: agent.id, name: agent.name, auth: agent.auth, docs: agent.docs, installed: true, installable: true, requirement: 'Windows 10/11', job: { state: 'installed' } }));
    agents.find(agent => agent.id === 'pi').installed = false;
    agents.find(agent => agent.id === 'pi').job = { state: 'missing' };
    Object.assign(state, { mode: 'dashboard', agents, projects: [], settings, shared: { ...state.shared, connections: [], instructions: '', profiles: [] },
      vault: { ...state.vault, available: true, entries: [] }, workbench: { ...state.workbench, setupRequests: [] }, version: 'fixture' });
    const context = await browser.newContext(options), errors = [], blocked = [], calls = [];
    let installAttempts = 0;
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      blocked.push(route.request().url()); return route.abort();
    });
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      calls.push(method);
      if (method === 'state') return { ok: true, value: state };
      if (method === 'agents.install') {
        installAttempts += 1;
        for (const id of payload) {
          const agent = state.agents.find(item => item.id === id);
          agent.installed = true;
          agent.job = installAttempts === 1
            ? { state: 'error', error: 'The version check failed. Retry or open the setup guide.', checkFailed: true }
            : { state: 'installed' };
        }
        if (installAttempts === 1) return { ok: false, error: 'Some agents need another try. Retry, or untick them to continue.' };
        return { ok: true, value: state };
      }
      if (method === 'setup.complete') { state.settings.setupComplete = true; return { ok: true, value: true }; }
      if (method === 'setup.validate') return { ok: true, value: true };
      return { ok: true, value: true };
    });
    await context.exposeFunction('fixtureGetState', () => state);
    await context.addInitScript(() => { window.dock = { call: async (method, payload) => {
      const result = await window.fixtureCall(method, payload);
      if (method === 'agents.install') window.fixtureStateListener?.(await window.fixtureGetState());
      return result;
    }, onState: callback => { window.fixtureStateListener = callback; }, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(origin); await page.waitForTimeout(1200);
    if (!await page.locator('#first-run[open]').count()) {
      const detail = await page.evaluate(async () => ({ title: document.title, body: document.body.innerText.slice(0, 800), state: await window.dock.call('state') }));
      throw new Error(`${name}: first-run did not open: ${JSON.stringify({ errors, detail })}`);
    }
    assert.equal(await page.locator('#first-run-title').textContent(), 'Set up Paddock.');
    assert.equal(await page.locator('#first-run-hint').textContent(), 'Choose a project folder and default console.');
    assert.equal(await page.locator('[data-setup-agent]').count(), 14);
    assert.match(await page.locator('#setup-agent-hint').textContent(), /Qwen OAuth ended April 15, 2026/);
    assert.equal(await page.locator('[data-setup-guide]').getAttribute('data-docs'), 'qwen');
    const retry = page.locator('[data-setup-agent=pi] input');
    await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()); });
    const firstRunMetrics = await page.locator('#first-run').evaluate(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
    const firstRunShot = `${name}-first-run.png`; await page.screenshot({ path: path.join(out, firstRunShot) });
    await retry.check(); await page.locator('#first-run-form [type=submit]').click();
    await page.locator('#first-run-form .form-error').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#first-run[open]').count(), 1, `${name}: failed version check keeps setup open`);
    assert.equal(await retry.isChecked(), true, `${name}: failed choice stays selected for retry`);
    assert.equal(await retry.isDisabled(), false, `${name}: installed-but-checkFailed agent remains retryable`);
    assert.match(await page.locator('[data-setup-agent=pi] .setup-install-status').textContent(), /version check failed/);
    assert.match(await page.locator('#first-run-form .form-error').textContent(), /another try/);
    await page.locator('#first-run-form [type=submit]').click();
    await page.waitForTimeout(600);
    if (await page.locator('#first-run').isVisible()) throw new Error(`${name}: retry did not complete: ${JSON.stringify({ error: await page.locator('#first-run-form .form-error').textContent(), calls, pi: state.agents.find(agent => agent.id === 'pi') })}`);
    assert.ok(calls.includes('agents.install'), `${name}: retry button called the installer`);
    assert.equal(installAttempts, 2, `${name}: first failed install is followed by a successful retry`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: no horizontal overflow`);
    assert.deepEqual(errors, [], `${name}: no renderer errors`); assert.deepEqual(blocked, [], `${name}: no external requests`);
    results.push({ profile: name, engine: browser.version(), viewport: page.viewportSize(), firstRun: firstRunMetrics, screenshots: [firstRunShot], retryStatePassed: true, blockedRequests: blocked, errors });
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(results, null, 2));
    await context.close(); await browser.close(); browser = null; console.log(`PASS ${name}`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
