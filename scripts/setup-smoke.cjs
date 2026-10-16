'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data');
fs.mkdirSync(parent, { recursive: true });
const work = fs.mkdtempSync(path.join(parent, 'setup-desktop-')), profile = path.join(work, 'profile'); fs.mkdirSync(profile);
const executablePath = process.argv.find(arg => arg.startsWith('--app='))?.slice(6);
let app;
(async () => {
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? [] : [root]), '--smoke-test', `--data-dir=${profile}`], timeout: 30000 });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const call = (method, payload) => page.evaluate(async ([m, p]) => { const r = await window.dock.call(m, p); if (!r.ok) throw Error(r.error); return r.value; }, [method, payload]);
  await page.locator('#first-run[open]').waitFor();
  const state = await call('state'); assert.equal(state.agents.length, 14);
  assert.equal(await page.locator('[data-install-agent]:checked').count(), 0);
  await assert.rejects(call('agents.install', ['pi']), /disabled during tests/);
  const form = page.locator('#first-run-form');
  await form.locator('[name=cwd]').fill(work); await form.locator('[name=provider]').selectOption('shell'); await form.locator('[name=launchNow]').check();
  await form.locator('[type=submit]').click(); await page.locator('#first-run').waitFor({ state: 'hidden' });
  const opened = (await call('state')).sessions.filter(x => x.alive);
  assert.equal(opened.length, 1); assert.equal(opened[0].cwd, work); assert.equal(opened[0].provider, 'shell');
  await call('session.input', { id: opened[0].id, data: "Write-Output ('SETUP_' + 'LAUNCH_OK')\r" });
  await page.waitForFunction(async id => (await window.dock.call('session.buffer', id)).value.data.includes('SETUP_LAUNCH_OK'), opened[0].id);
  await page.locator('[data-page=settings]').click(); await page.locator('[data-action=agent-setup]').click();
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#first-run').isVisible(), false);
  assert.equal((await call('state')).sessions.filter(x => x.alive).length, 1, 'Reopening setup does not launch or end consoles');

  // Prepare with the agent-facing service, then apply through the real UI after restart.
  await app.close(); app = null;
  const { SharedHub } = require('../electron/shared.cjs');
  const { SetupRequests } = require('../electron/setup-requests.cjs');
  const hub = new SharedHub(profile, { list: () => [] });
  new SetupRequests(profile, { getHub: () => hub }).prepare({ kind: 'api', config: { id: 'testapi', name: 'Prepared API', protocol: 'chat', url: 'https://example.com/v1/chat/completions' } }, { consoleName: 'Setup check' });
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? [] : [root]), '--smoke-test', `--data-dir=${profile}`], timeout: 30000 });
  const second = await app.firstWindow(); second.setDefaultTimeout(15000);
  await second.locator('.session-grid').waitFor();
  await second.locator('[data-page=tools]').click();
  await second.getByRole('heading', { name: 'Prepared API' }).waitFor();
  await second.locator('[data-setup-apply]').click();
  await second.waitForFunction(async () => (await window.dock.call('state')).value.shared.profiles.some(x => x.id === 'testapi'));
  await second.waitForFunction(async () => (await window.dock.call('state')).value.workbench.setupRequests.length === 0);
  assert.deepEqual(errors, []);
  console.log('PASS: optional setup, launch immediately in the chosen folder, manual reopen, installation guard, persisted agent request and Apply. No third-party installs or paid requests.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close().catch(() => {});
  assert.equal(path.dirname(fs.realpathSync(work)), fs.realpathSync(parent)); fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
