'use strict';
const { openPage } = require('./ui-navigation.cjs');
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts/ssh');
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  const file = pathname === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(root, 'dist', pathname === '/' ? 'index.html' : pathname);
  if ((pathname !== '/_axe.js' && !file.startsWith(path.join(root, 'dist') + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
const profiles = [
  ['pc', chromium, { viewport: { width: 1440, height: 1000 } }],
  ['mac', webkit, { viewport: { width: 1440, height: 1000 } }],
  ['android', chromium, { ...devices['Pixel 7'] }],
  ['iphone', webkit, { ...devices['iPhone 13'] }],
];
const reports = []; let browser;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch();
    const context = await browser.newContext(options), state = structuredClone(base), errors = [], calls = [];
    state.mode = 'dashboard'; state.settings.setupComplete = true; state.settings.sidebarCollapsed = false; state.sshHosts = []; state.sessions = [];
    let page;
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      calls.push({ method, payload });
      if (method === 'ssh.scan') return { ok: true, value: { probeId: 'fixture-probe', fingerprint: 'SHA256:verified-test-fingerprint', algorithm: 'ssh-ed25519' } };
      if (method === 'ssh.approve') {
        assert.equal(payload.verified, true);
        state.sshHosts = [{ id: 'fixture-host', name: 'Linux development', host: 'vm.example.test', port: 22, user: 'developer', folder: '/home/developer/projects', agents: ['claude'], checkedAt: Date.now() }];
        await page.evaluate(s => window.fixtureState(s), state);
        return { ok: true, value: state.sshHosts };
      }
      return { ok: true, value: method === 'state' ? state : method === 'session.buffer' ? { data: '', sequence: 0 } : [] };
    });
    await context.addInitScript(() => {
      window.dock = { call:(m,p) => window.fixtureCall(m,p), onState:fn => window.fixtureState = fn, onOutput:()=>{}, onSelect:()=>{}, onNotice:()=>{} };
    });
    page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await openPage(page, 'devices');
    await page.getByRole('button', { name: 'Add SSH host' }).click();
    const form = page.locator('#ssh-form');
    await form.locator('[name=name]').fill('Linux development');
    await form.locator('[name=host]').fill('vm.example.test');
    await form.locator('[name=user]').fill('developer');
    await form.locator('[name=folder]').fill('/home/developer/projects');
    await form.getByRole('button', { name: 'Scan host identity' }).click();
    await page.locator('#ssh-identity:not([hidden])').waitFor();
    await page.getByRole('button', { name: 'Save trusted host' }).click();
    assert.equal(calls.filter(c => c.method === 'ssh.approve').length, 0);
    await page.locator('#ssh-verified').check();
    assert.equal(await page.locator('#ssh-identity').isVisible(), true, 'Checking verification preserves the scanned identity');
    await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()); });
    await page.screenshot({ path: path.join(out, name + '-ssh-identity.png') });
    await page.addScriptTag({ url: '/_axe.js' });
    const axe = await page.evaluate(async () => (await window.axe.run('#ssh-dialog', { runOnly: ['color-contrast', 'button-name', 'label'] })).violations.map(x => x.id));
    assert.deepEqual(axe, [], name + ' dialog accessibility');
    assert.equal(await form.evaluate(x => x.scrollWidth > x.clientWidth + 1), false, name + ' dialog overflow');
    await page.getByRole('button', { name: 'Save trusted host' }).click();
    await page.locator('#ssh-dialog:not([open])').waitFor({ state: 'attached' });
    assert.equal(calls.filter(c => c.method === 'ssh.approve').length, 1);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#ssh-dialog').evaluate(x => x.open), false);
    await page.locator('[data-page=consoles]').first().click();
    // The ordinary desktop right-click opens the one-time console chooser.
    const button = page.locator('#consoles-page [data-action=new]').first();
    await button.click({ button: 'right' });
    await page.locator('#console-chooser[open]').waitFor();
    await page.locator('#one-off-console-form [name=remoteHostId]').selectOption('fixture-host');
    assert.equal(await page.locator('#one-off-console-form [name=remoteFolder]').inputValue(), '/home/developer/projects');
    await page.locator('#one-off-console-form [name=provider]').selectOption('claude');
    await page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()));
    await page.screenshot({ path: path.join(out, name + '-ssh-console.png') });
    assert.deepEqual(errors, [], name + ' page errors');
    reports.push({ profile: name, checks: ['host scan and explicit trust', 'no trust before verification', 'SSH destination and agent choices', 'keyboard Escape', 'dialog contrast and labels', 'no form overflow'], emulated: name !== 'pc' });
    await browser.close(); browser = null;
  }
  fs.writeFileSync(path.join(out, 'visual-checks.json'), JSON.stringify(reports, null, 2));
  console.log('PASS: SSH settings and console chooser in four browser profiles.');
})().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
