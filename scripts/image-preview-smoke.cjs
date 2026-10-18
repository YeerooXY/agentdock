'use strict';
// Real IPC, vault and MCP bridge; generation stays blocked in this isolated profile.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data'), out = path.join(root, 'artifacts', 'image-preview');
fs.mkdirSync(parent, { recursive: true }); fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(parent, 'image-preview-')), project = path.join(profile, 'project'); fs.mkdirSync(project);
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false, autoSaveResults: false, suggestProjects: false, notifications: false, consoleDefaults: { provider: 'shell', cwd: project } }));
let app, page, server; const errors = [], checks = [];
const secret = 'SYNTHETIC_IMAGE_TEST_KEY_DO_NOT_USE';
const executablePath = process.argv.find(x => x.startsWith('--app='))?.slice(6);
const call = (method, payload) => page.evaluate(async ([m, p]) => { const r = await window.dock.call(m, p); if (!r.ok) throw Error(r.error); return r.value; }, [method, payload]);
async function until(fn) { const end = Date.now() + 45000; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 50)); } throw Error('Preview fixture timed out'); }
async function start() { app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? [] : [root]), '--smoke-test', `--data-dir=${profile}`] }); page = await app.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message)); await page.locator('.session-grid').waitFor(); }
async function stop() { await call('quit'); await app.close(); app = null; }
(async () => {
  await start(); await call('vault.save', { provider: 'image-test', key: secret, label: 'Image test account' });
  await page.locator('[data-page=tools]').click(); const form = page.locator('#image-generation-form'); await form.waitFor();
  assert.equal(await form.locator('[name=provider]').inputValue(), 'agent'); assert.equal(await form.locator('[name=previewFirst]').isChecked(), true);
  await form.locator('[name=provider]').selectOption('openai'); await form.locator('[name=keyId]').selectOption('image-test'); await form.locator('[type=submit]').click();
  await until(async () => (await call('state')).shared.imageGeneration.provider === 'openai');
  assert.equal((await call('state')).shared.imageGeneration.url, 'https://api.openai.com/v1/images/edits');
  await assert.rejects(call('images.settings', { provider: 'openai', keyId: 'missing-key' }), /Keys/);
  assert.ok(!JSON.stringify(await call('state')).includes(secret));
  checks.push('default native-first; saved API selection; vault key binding without renderer read-back');
  await form.locator('[name=provider]').selectOption('compatible'); await form.locator('[name=model]').fill('local-preview'); await form.locator('[name=url]').fill('http://example.com/images/edits'); await form.locator('[type=submit]').click();
  await until(async () => (await form.locator('.form-error').textContent()).includes('HTTPS'));
  assert.equal((await call('state')).shared.imageGeneration.provider, 'openai');
  await form.locator('[name=url]').fill('http://localhost:8188/v1/images/edits'); await form.locator('[name=previewFirst]').uncheck(); await form.locator('[type=submit]').click();
  await until(async () => (await call('state')).shared.imageGeneration.provider === 'compatible');
  await stop(); await start(); assert.equal((await call('state')).shared.imageGeneration.previewFirst, false);
  checks.push('invalid endpoint rejected without overwriting settings; local endpoint and preview switch survive restart');
  const session = await call('session.create', { provider: 'shell', cwd: project });
  const bridgeFile = path.join(profile, 'bridge.json');
  await call('session.input', { id: session.id, data: `@{url=$env:AGENT_DOCK_BRIDGE_URL;token=$env:AGENT_DOCK_BRIDGE_TOKEN} | ConvertTo-Json -Compress | Set-Content -LiteralPath '${bridgeFile.replaceAll("'", "''")}'\r` });
  await until(() => fs.existsSync(bridgeFile));
  const grant = JSON.parse(fs.readFileSync(bridgeFile, 'utf8').replace(/^\uFEFF/, ''));
  async function bridge(name, args = {}) {
    const r = await fetch(grant.url, { method: 'POST', headers: { Authorization: 'Bearer ' + grant.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args }) });
    assert.equal(r.status, 200); const value = await r.json(); assert.notEqual(value.isError, true); assert.ok(!JSON.stringify(value).includes(secret)); return value;
  }
  const tools = JSON.stringify(await bridge('dock_tools', { connection: 'dock' })); assert.match(tools, /dock\/generate_preview/);
  const context = JSON.stringify(await bridge('dock_context')); assert.match(context, /user selected compatible/); assert.doesNotMatch(context, /try to generate one flat/);
  await bridge('dock_call', { tool: 'dock/prepare_setup', arguments: { kind: 'image', config: { provider: 'gemini', keyId: 'image-test', previewFirst: true } } });
  assert.equal((await call('state')).shared.imageGeneration.provider, 'compatible', 'agent preparation must not change the selected provider');
  await page.locator('[data-page=tools]').click(); await page.locator('[data-setup-apply]').click();
  await until(async () => (await call('state')).shared.imageGeneration.provider === 'gemini');
  assert.equal((await call('state')).workbench.setupRequests.length, 0);
  assert.match(JSON.stringify(await bridge('dock_context')), /user selected gemini/);
  checks.push('existing agent bridge sees saved preference and preview tool; agent prepares settings, user applies in Tools');
  server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview test</title></head><body style="background:#080811;color:#e8dded;font:20px sans-serif;padding:30px"><main><h1>Preview test fixture</h1><p>A local screen for image-routing checks.</p></main></body></html>'); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  await page.locator('[data-page=reviews]').click(); await page.locator('#website-review-form [name=url]').fill('http://127.0.0.1:' + server.address().port); await page.locator('#website-review-form [name=brief]').fill('Improve this screen'); await page.locator('#website-review-form [type=submit]').click();
  await until(async () => { const r = (await call('state')).workbench.reviews[0]; if (r?.state === 'failed') throw Error(r.error); return r?.state === 'complete'; });
  const review = (await call('state')).workbench.reviews[0];
  await page.locator('[data-wb=review-open]').first().click(); await page.locator('[data-wb=generate-preview]').waitFor();
  assert.match(await page.locator('.preview-routing').textContent(), /Gemini/);
  await page.locator('[data-wb=copy-brief]').click(); const brief = await app.evaluate(({ clipboard }) => clipboard.readText()); assert.match(brief, /user selected gemini/); assert.match(brief, /dock\/generate_preview/);
  await page.locator('[data-wb=generate-preview]').click(); await until(async () => (await page.locator('[role=status]').allTextContents()).join(' ').includes('disabled during tests'));
  assert.equal((await call('state')).workbench.concepts.length, 0);
  await page.locator('[data-wb=image-settings]').click(); await page.locator('#image-generation-form').waitFor(); assert.equal(await page.locator('#image-generation-form [name=provider]').inputValue(), 'gemini');
  checks.push('real review screenshot; selected provider in brief and review; direct generation blocked in tests; Change generator opens settings');
  const fixture = await call('state'); fixture.fixtureReview = await call('workbench.review.get', review.id); fixture.fixtureImages = {};
  for (const item of fixture.workbench.results.filter(x => x.image)) fixture.fixtureImages[item.id] = await call('workbench.results.preview', item.id);
  // Avoid keeping the shell buffer containing the isolated bridge grant in visual fixtures.
  fixture.sessions = []; fs.writeFileSync(path.join(out, 'fixture.json'), JSON.stringify(fixture));
  assert.deepEqual(errors, []); await stop();
  fs.writeFileSync(path.join(out, 'native-checks.json'), JSON.stringify({ passed: true, checks, paidRequests: 0 }, null, 2));
  console.log('PASS saved image preferences, secure key binding, live MCP context, prepared setup, review route and paid-call guard');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await app?.close().catch(() => {}); server?.closeAllConnections?.(); if (server) await new Promise(r => server.close(r));
  assert.equal(path.dirname(fs.realpathSync(profile)), fs.realpathSync(parent)); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
