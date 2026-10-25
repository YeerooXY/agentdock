'use strict';
// Evidence collection for a single-evaluator simulated-user walkthrough.
// No paid model requests, agent installations or production profile access.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { openPage } = require('./ui-navigation.cjs');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data'), out = path.join(root, 'artifacts/simulated-users');
fs.mkdirSync(parent, { recursive: true }); fs.mkdirSync(out, { recursive: true });
const work = fs.mkdtempSync(path.join(parent, 'user-walkthrough-')), profile = path.join(work, 'profile'), project = path.join(work, 'Website');
fs.mkdirSync(profile); fs.mkdirSync(project);
const steps = [], errors = []; let app, page;
async function until(check) { const end = Date.now() + 20000; while (Date.now() < end) { if (await check()) return; await new Promise(r => setTimeout(r, 100)); } throw Error('Evidence step timed out'); }
async function capture(id, perspective, action, observation, assistance = null) {
  await page.evaluate(async () => { await document.fonts.ready; for (const a of document.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) a.finish(); });
  await page.screenshot({ path: path.join(out, id + '.png') });
  steps.push({ id, perspective, action, observation, assistance, screenshot: id + '.png' });
  fs.writeFileSync(path.join(out, 'steps.json'), JSON.stringify(steps, null, 2));
}
function hashes() {
  return Object.fromEntries(['src/app.js', 'src/first-run.js', 'src/projects-ui.js', 'src/console-projects.js', 'src/workbench-ui.js', 'src/style.css', 'mobile/lib/main.dart', 'mobile/lib/terminal_keys.dart'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
}
const started = { at: new Date().toISOString(), branch: execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), files: hashes() };
(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PADDOCK_')));
  app = await electron.launch({ args: [root, '--smoke-test', '--data-dir=' + profile], env, timeout: 30000 });
  page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
  const call = (method, payload) => page.evaluate(async ([m,p]) => { const r = await window.dock.call(m,p); if (!r.ok) throw Error(r.error); return r.value; }, [method,payload]);
  await page.locator('#first-run[open]').waitFor();
  const firstState = await call('state');
  fs.writeFileSync(path.join(out, 'first-state.json'), JSON.stringify(firstState));
  await capture('01-first-use', 'first-use', 'Open a fresh Paddock profile', { title: await page.locator('#first-run-title').innerText(), hint: await page.locator('#first-run-hint').innerText(), agentChoices: await page.locator('[data-setup-agent]').count(), defaultConsole: await page.locator('#first-run [name=provider]').inputValue(), openConsoleChecked: await page.locator('#first-run [name=launchNow]').isChecked(), agentPermissions: firstState.settings.agentPermissions });
  const form = page.locator('#first-run-form');
  await form.locator('[name=provider]').selectOption('shell');
  await form.locator('[name=cwd]').fill(path.join(work, 'Missing'));
  await form.locator('[type=submit]').click();
  await page.locator('#first-run .form-error').filter({ hasText: 'existing project folder' }).waitFor();
  await capture('02-folder-recovery', 'first-use', 'Try a missing folder', { error: await page.locator('#first-run .form-error').innerText(), typedFolderRetained: await form.locator('[name=cwd]').inputValue() === path.join(work, 'Missing') });
  await form.locator('[name=cwd]').fill(project); await form.locator('[type=submit]').click();
  await page.locator('#first-run').waitFor({ state: 'hidden' });
  assert.equal((await call('state')).sessions.length, 0);
  await capture('03-empty-console-grid', 'first-use', 'Finish setup without the optional launch checkbox', { sessions: 0, panels: await page.locator('.session-card').count(), visibleMainText: await page.locator('#consoles-page').innerText() });
  await page.locator('.session-card[data-slot="1"] [data-action=new]').click();
  await until(async () => (await call('state')).sessions.some(s => s.alive));
  const one = (await call('state')).sessions.find(s => s.alive);
  await until(async () => (await call('session.buffer', one.id)).data.includes('PS '));
  await capture('04-first-console', 'first-use', 'Click a plus panel', { provider: one.provider, name: one.name, suggestion: await page.locator('#project-suggestion').isVisible(), routeLimit: 'PowerShell proves launch; provider sign-in and a first AI answer were not exercised.' });
  await page.locator('.session-card[data-slot="2"] [data-action=new]').click({ button: 'right' });
  await page.locator('#console-chooser[open]').waitFor();
  await capture('05-one-time-options', 'several-projects', 'Right-click another plus panel', { labels: await page.locator('#console-chooser').innerText() }, 'Evaluator knows the right-click gesture; discoverability is a judgment to validate with people.');
  await page.locator('#one-off-console-form [name=name]').fill('Docs');
  await page.locator('#one-off-console-form [name=provider]').selectOption('shell');
  await page.locator('#one-off-console-form [type=submit]').click();
  await until(async () => (await call('state')).sessions.filter(s => s.alive).length === 2);
  await capture('05b-two-consoles', 'several-projects', 'Open a second named shell in the same folder', { names: (await call('state')).sessions.filter(s => s.alive).map(s => s.name), sameFolder: (await call('state')).sessions.every(s => s.cwd === project) });
  await openPage(page, 'projects'); await page.locator('[data-project-new]').first().click();
  await capture('06-new-project', 'several-projects', 'Create a project for the existing Website folder', { labels: await page.locator('#project-editor').innerText() });
  await page.locator('#project-form [name=name]').fill('Website'); await page.locator('#project-form [name=folders]').fill(project);
  await page.locator('#project-form [type=submit]').click(); await page.locator('#project-editor').waitFor({ state: 'hidden' });
  const autoOpenedPlan = await page.locator('#project-plan[open]').count() === 1;
  await capture('07-project-save', 'several-projects', 'Save the folder as a project', { status: (await call('state')).projects[0].status, autoOpenedPlan, actions: await page.locator('.project-actions').innerText() });
  if (!autoOpenedPlan) await page.locator('[data-project-plan]').first().click();
  await page.locator('#project-plan[open]').waitFor();
  await capture('08-project-planning', 'several-projects', autoOpenedPlan ? 'Inspect planning opened automatically after Save' : 'Open the project roadmap', { labels: await page.locator('#project-plan').innerText() });
  await page.keyboard.press('Escape');
  await openPage(page, 'devices');
  await page.locator('[data-mobile=open]').click();
  await capture('09-phone-setup', 'phone-continuation', 'Open Connect a phone on the PC', { labels: await page.locator('dialog[open]').innerText() }, 'Network/pairing was not enabled in this profile. Native paired-phone evidence is separately cited.');
  await page.keyboard.press('Escape');
  await openPage(page, 'usage');
  await capture('10-account-usage', 'privacy-and-cost', 'Inspect Usage with no recorded account data', { labels: await page.locator('#content').innerText() });
  await openPage(page, 'api-settings');
  await capture('11-api-settings', 'privacy-and-cost', 'Find API connections', { labels: await page.locator('.settings-content').innerText() });
  await openPage(page, 'vault');
  await capture('12-key-storage', 'privacy-and-cost', 'Inspect key setup without entering a key', { labels: await page.locator('.settings-content').innerText(), keys: (await call('state')).vault.entries.length });
  // Supply a synthetic agent result through this test shell's own local bridge.
  const bridgeFile = path.join(profile, 'fixture-grant.json');
  await call('session.input', { id: one.id, data: `@{url=$env:PADDOCK_BRIDGE_URL;token=$env:PADDOCK_BRIDGE_TOKEN} | ConvertTo-Json -Compress | Set-Content -LiteralPath '${bridgeFile.replaceAll("'", "''")}'\r` });
  await until(() => fs.existsSync(bridgeFile));
  const grant = JSON.parse(fs.readFileSync(bridgeFile, 'utf8').replace(/^\uFEFF/, '')); fs.unlinkSync(bridgeFile);
  async function tool(name, args = {}) { const r = await fetch(grant.url, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+grant.token }, body:JSON.stringify({name:'dock_call',arguments:{tool:name,arguments:args}}) }); const v=await r.json(); if(v.isError)throw Error(v.content[0].text); return JSON.parse(v.content[0].text); }
  await tool('dock/start_turn'); await tool('dock/save_result', { title:'Website check',text:'# Website check\n\nSynthetic completed result for the walkthrough. No AI work was submitted.',kind:'report',status:'passed',summary:'Example output saved by an agent.' }); await tool('dock/finish_turn');
  await openPage(page, 'results'); await page.locator('[data-wb=preview]').first().waitFor();
  await capture('13-completed-results', 'several-projects', 'Find completed work in Results', { headings: await page.locator('.result-console-heading h2').allTextContents() }, 'Completion was supplied by the fixture, not by a paid model or participant.');
  await page.locator('[data-wb=preview]').first().click(); await page.locator('.wb-dialog[open]').waitFor();
  await capture('14-result-preview', 'first-use', 'Open the saved report', { title: await page.locator('.wb-dialog[open] h2').innerText() });
  await page.keyboard.press('Escape');
  await call('settings', { notifications:false });
  const before = (await call('state')).workbench.results.length;
  await tool('dock/start_turn');
  const empty = await tool('dock/notify', { title:'Text-only completion fixture',kind:'ready' });
  await app.evaluate(({ BrowserWindow }, notice) => BrowserWindow.getAllWindows()[0].webContents.send('dock:notice',notice), empty);
  await page.locator('#toast').filter({ hasText:'No results were saved for this prompt.' }).waitFor();
  await capture('15-no-saved-result', 'first-use', 'Activate a completion with no saved files/report', { savedResultsBefore:before,savedResultsAfter:(await call('state')).workbench.results.length,noticeResultId:empty.resultId,message:await page.locator('#toast').innerText() }, 'Fixture marks a turn ready and injects notification activation; no AI answer or OS toast was tested.');
  const state = await call('state'); state.sessions.forEach(s => { s.cwd = 'C:/Test/Website'; }); state.settings.consoleDefaults.cwd = 'C:/Test/Website'; state.settings.notifications = false;
  fs.writeFileSync(path.join(out, 'fixture.json'), JSON.stringify(state));
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'walkthrough.json'), JSON.stringify({ method:'Script-assisted single-evaluator walkthrough, not independent participants', ...started, finishedAt:new Date().toISOString(), endFiles:hashes(), steps, pageErrors:errors, noPaidModelRequests:true, productionProfileTouched:false }, null, 2));
  console.log('Recorded '+steps.length+' walkthrough states. Interpretations belong in the review, not these observations.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await app?.close();
  const resolved = fs.realpathSync(work);
  if (path.dirname(resolved) !== fs.realpathSync(parent) || !path.basename(resolved).startsWith('user-walkthrough-')) throw Error('Unexpected test cleanup target');
  fs.rmSync(resolved, { recursive:true, force:true });
});
