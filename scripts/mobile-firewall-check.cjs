'use strict';
// Isolated phone-setup UI with mocked IPC. No firewall, pairing, agent or paid
// requests are made. Run after npm run build and playwright install chromium.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const bundle = buildSync({ stdin: { contents: `import { mobileUI } from './src/mobile-ui.js'; window.createPhoneSetup = mobileUI;`, resolveDir: root }, bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' } }).outputFiles[0].text;
let browser;
(async () => {
  browser = await chromium.launch({ ...(process.env.PADDOCK_TEST_CHROMIUM ? { executablePath: process.env.PADDOCK_TEST_CHROMIUM } : {}), ...(process.env.PADDOCK_TEST_CHROMIUM_ARGS ? { args: JSON.parse(process.env.PADDOCK_TEST_CHROMIUM_ARGS) } : {}) });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } }), errors = [], calls = [];
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(10000);
  let status = 'allowed', cancel = false, holdCheck = false, releaseCheck;
  const mobile = { name: 'Studio PC', enabled: true, host: '100.64.0.5', port: 47831, mode: 'tailscale', network: {}, devices: [{ id: 'test-phone', name: 'My phone', connected: true }], interfaces: [{ name: 'Tailscale', address: '100.64.0.5', tailscale: true }] };
  await page.exposeFunction('fixtureCall', async (method, payload) => {
    calls.push(method);
    if (method === 'mobile.check-firewall') {
      if (holdCheck) await new Promise(resolve => { releaseCheck = resolve; });
      mobile.network = { firewall: status, firewallRulePresent: ['allowed', 'outdated'].includes(status), firewallError: status === 'unknown' ? 'Windows could not read the rule.' : '' };
    }
    if (method === 'mobile.firewall') {
      if (cancel) { mobile.network = { firewall: 'unknown' }; throw Error('Windows Firewall was not changed.'); }
      status = payload.remove ? 'missing' : 'allowed'; mobile.network = { firewall: status, firewallRulePresent: !payload.remove };
    }
    if (method === 'mobile.configure') throw Error('Unchanged setup must not restart the connection');
    return structuredClone(mobile);
  });
  await page.setContent('<!doctype html><html lang="en"><meta charset="utf-8"><title>Phone setup check</title><body></body></html>');
  const cssFile = fs.readdirSync(path.join(root, 'dist/assets')).find(file => /^index-.*\.css$/.test(file));
  await page.addStyleTag({ path: path.join(root, 'dist/assets', cssFile) });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(mobile => {
    window.fixture = { platform: 'win32', mobile };
    window.ui = window.createPhoneSetup({ call: window.fixtureCall, getState: () => window.fixture,
      escape: value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), icon: () => '×', toast: () => {} });
    window.ui.open();
  }, mobile);
  await page.locator('[data-mobile=step][data-step="1"]').click();
  await page.getByText('Already configured', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-mobile=firewall]').count(), 0);
  assert.ok(calls.every(method => method === 'mobile.check-firewall'));
  const out = path.join(root, 'artifacts/firewall-setup'); fs.mkdirSync(out, { recursive: true });
  await page.screenshot({ path: path.join(out, 'configured.png') });
  // Closing and reopening loses no real rule and makes no mutation request.
  await page.locator('[data-mobile=close]').first().click(); await page.evaluate(() => window.ui.open());
  await page.locator('[data-mobile=enable]').click();
  await page.getByText('Already configured', { exact: true }).waitFor();
  assert.equal(calls.includes('mobile.configure'), false);
  await page.locator('[data-mobile=next]').click();
  assert.equal(await page.getByRole('heading', { name: 'Pair your phone' }).count(), 1);
  await page.locator('[data-mobile=previous]').click();
  await page.getByText('Already configured', { exact: true }).waitFor();
  status = 'outdated'; await page.locator('[data-mobile=check-firewall]').click();
  await page.getByRole('button', { name: 'Update firewall rule', exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, 'needs-update.png') });
  cancel = true; await page.locator('[data-mobile=firewall]').click();
  await page.getByRole('alert').filter({ hasText: 'Windows Firewall was not changed.' }).waitFor();
  assert.equal(await page.getByText('Already configured', { exact: true }).count(), 0);
  cancel = false; await page.locator('[data-mobile=firewall]').click();
  await page.getByText('Already configured', { exact: true }).waitFor();
  status = 'missing'; await page.locator('[data-mobile=check-firewall]').click();
  await page.getByRole('button', { name: 'Allow Paddock in Windows Firewall', exact: true }).waitFor();
  await page.locator('[data-mobile=firewall]').click(); await page.getByText('Already configured', { exact: true }).waitFor();
  status = 'unknown'; await page.locator('[data-mobile=check-firewall]').click();
  await page.getByText('The firewall status could not be checked.', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(out, 'unknown.png') });
  holdCheck = true; await page.locator('[data-mobile=check-firewall]').click();
  await page.getByText('Checking the existing firewall rule…', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-mobile=firewall]').count(), 0);
  await page.locator('[data-mobile=close]').first().click();
  holdCheck = false; status = 'allowed'; releaseCheck();
  await page.evaluate(() => window.ui.open()); await page.locator('[data-mobile=enable]').click();
  await page.getByText('Already configured', { exact: true }).waitFor();
  await page.locator('summary').click(); await page.locator('[data-mobile=remove-firewall]').click();
  await page.getByRole('button', { name: 'Allow Paddock in Windows Firewall', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, 'narrow.png') });
  assert.equal(await page.locator('dialog').evaluate(el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 1), false);
  assert.deepEqual(errors, []);
  console.log('PASS: existing rule, reopen, unchanged connection, outdated/missing rule, cancellation, unknown/checking state, close during check, explicit removal and narrow layout. No real firewall changes.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
