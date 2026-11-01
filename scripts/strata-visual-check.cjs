'use strict';
// Production UI with a synthetic desktop bridge; no model calls or installs.
const { chromium, webkit, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { initialSettings } = require('../electron/settings.cjs');
const { catalog } = require('../electron/cli-catalog.cjs');
const { strataModels } = require('../electron/local-models.cjs');
const { openPage } = require('./ui-navigation.cjs');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist');
const out = path.join(root, '.build', 'strata-trial', 'visual');
fs.mkdirSync(out, { recursive: true });
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'artifacts', 'console-layout', 'fixture.json'), 'utf8'));
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const profiles = [
  ['windows-chromium', chromium, { viewport: { width: 1440, height: 900 } }],
  ['mac-webkit-emulated', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }],
  ['android-chromium-emulated', chromium, devices['Pixel 7']],
  ['iphone-webkit-emulated', webkit, devices['iPhone 13']]
];
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/test-axe.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(axeSource); }
  const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
let browser; const results = [];
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch();
    const state = structuredClone(fixture);
    Object.assign(state, { mode: 'dashboard', projects: [], sessions: [], settings: initialSettings({ ...state.settings, setupComplete: true, suggestProjects: false }, root, state.capabilities),
      agents: catalog.map(agent => ({ ...agent, installed: true })), shared: { ...state.shared, connections: [], profiles: [] }, vault: { available: true, entries: [] }, workbench: { ...state.workbench, setupRequests: [] } });
    const context = await browser.newContext(options), errors = [], blocked = [], calls = [];
    let saves = 0;
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      blocked.push(route.request().url()); return route.abort();
    });
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      calls.push({ method, payload });
      if (method === 'state') return { ok: true, value: state };
      if (method === 'session.models') return { ok: true, value: payload === 'opencode' ? strataModels(state.shared.profiles) : [] };
      if (method === 'profiles.save') {
        if (++saves === 1) return { ok: false, error: 'Fixture: settings could not be saved. Try again.' };
        state.shared.profiles = [payload];
      }
      return { ok: true, value: true };
    });
    await context.exposeFunction('fixtureGetState', () => state);
    await context.addInitScript(() => { window.dock = { call: async (method, payload) => {
      const result = await window.fixtureCall(method, payload);
      if (method === 'profiles.save' && result.ok) window.fixtureStateListener?.(await window.fixtureGetState());
      return result;
    }, onState: callback => { window.fixtureStateListener = callback; }, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin); await openPage(page, 'tools');
    await page.addScriptTag({ url: `${origin}/test-axe.js` });
    const accessibility = async selector => {
      const violations = await page.evaluate(async selector => (await axe.run(document.querySelector(selector), { runOnly: ['color-contrast', 'label', 'button-name', 'select-name'] })).violations.map(item => item.id), selector);
      assert.deepEqual(violations, [], `${name}: accessible controls and contrast in ${selector}`);
    };
    await page.locator('.local-ai details summary').click();
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.local-ai').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await accessibility('.local-ai');
    await page.screenshot({ path: path.join(out, `${name}-tools.png`) });
    await page.locator('.local-ai [data-docs=strata]').click();
    assert.ok(calls.some(x => x.method === 'docs' && x.payload === 'strata'));
    await page.locator('.local-ai [data-api-preset=strata]').focus(); await page.keyboard.press('Enter');
    const form = page.locator('#profile-form');
    assert.equal(await form.locator('[name=url]').inputValue(), 'http://127.0.0.1:8080/v1/chat/completions');
    assert.equal(await form.locator('[name=protocol]').inputValue(), 'chat');
    assert.equal(await form.locator('[name=keyId]').inputValue(), '');
    assert.equal(await form.locator('[name=newKey]').inputValue(), '');
    assert.equal(saves, 0, 'Opening a preset must not save or start anything');
    await form.locator('[name=url]').fill('http://127.0.0.1:8081/v1/chat/completions');
    await form.locator('[type=submit]').click();
    await form.locator('.form-error').filter({ hasText: 'Fixture:' }).waitFor();
    assert.equal(await form.locator('[name=url]').inputValue(), 'http://127.0.0.1:8081/v1/chat/completions');
    await page.screenshot({ path: path.join(out, `${name}-api-error.png`) });
    await accessibility('#profile-form');
    await form.locator('[type=submit]').click();
    await page.locator('[data-edit-profile=strata]').waitFor();
    await openPage(page, 'tools');
    await page.locator('.local-ai [data-api-preset=strata]').click();
    assert.equal(await form.locator('[name=url]').inputValue(), 'http://127.0.0.1:8081/v1/chat/completions', 'Review preserves a saved custom port');
    await page.screenshot({ path: path.join(out, `${name}-api-saved.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.equal(await form.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    await page.keyboard.press('Escape');
    await openPage(page, 'consoles');
    const empty = page.locator('.session-card.empty').first(), box = await empty.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.locator('#console-chooser').waitFor({ state: 'visible' }); await page.mouse.up();
    await page.locator('#one-off-console-form [name=provider]').selectOption('opencode', { force: true });
    await page.locator('#one-off-console-form [name=model] option[value="strata/local"]').waitFor({ state: 'attached' });
    await page.locator('#one-off-console-form [name=model]').selectOption('strata/local');
    await page.screenshot({ path: path.join(out, `${name}-chooser.png`) });
    await accessibility('#console-chooser');
    assert.equal(await page.locator('#one-off-console-form [name=model]').inputValue(), 'strata/local');
    assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
    assert.ok(!calls.some(x => /install|api\.run|tools\.save/.test(x.method)));
    results.push({ profile: name, engine: browser.version(), viewport: page.viewportSize(), passed: true, errors, blocked });
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(results, null, 2));
    console.log(`PASS ${name}`); await context.close(); await browser.close(); browser = null;
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
