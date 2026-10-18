'use strict';
// An isolated Electron profile and unpaid shell exercise the complete linking flow.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data'), out = path.join(root, 'artifacts', 'project-link');
fs.mkdirSync(parent, { recursive: true }); fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(parent, 'project-link-')), folder = path.join(profile, 'Existing game');
fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'keep.txt'), 'Existing project file');
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: true, autoSaveResults: false, notifications: false, consoleDefaults: { provider: 'shell', cwd: folder } }));
let app, page; const errors = [], checks = [];
const executablePath = process.argv.find(x => x.startsWith('--app='))?.slice(6);
async function until(fn) { const end = Date.now() + 20000; while (Date.now() < end) { if (await fn()) return; await new Promise(r => setTimeout(r, 50)); } throw Error('Project linking fixture timed out'); }
const call = (method, payload) => page.evaluate(async ([m, p]) => { const r = await window.dock.call(m, p); if (!r.ok) throw Error(r.error); return r.value; }, [method, payload]);
async function start() {
  app = await electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? [] : [root]), '--smoke-test', `--data-dir=${profile}`] }); page = await app.firstWindow(); page.setDefaultTimeout(20000);
  page.on('pageerror', e => errors.push(e.message)); await page.locator('.session-grid').waitFor();
}
async function stop() { await call('quit'); await app.close(); app = null; }
(async () => {
  await start();
  assert.equal((await call('state')).settings.suggestProjects, true);
  await page.locator('.session-card.empty [data-action=new]').first().click();
  await page.locator('#project-suggestion').waitFor();
  assert.ok(await page.evaluate(() => !!document.activeElement?.closest('.terminal-instance')), 'Suggestion must not steal terminal focus');
  await page.locator('[data-project-stop]').click(); await page.locator('#project-suggestion').waitFor({ state: 'hidden' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'settings.json'))).suggestProjects, false);
  await stop(); await start(); await until(async () => (await call('state')).sessions.length === 1);
  assert.equal((await call('state')).settings.suggestProjects, false); assert.equal(await page.locator('#project-suggestion').isVisible(), false);
  checks.push('nonmodal suggestion; decline persists through an app restart');
  const s = (await call('state')).sessions[0];
  await call('session.input', { id: s.id, data: "$linkProbe='KEPT_'+'AFTER_LINK'; Write-Output 'LINK_INITIALIZED'\r" });
  await until(async () => (await call('session.buffer', s.id)).data.includes('LINK_INITIALIZED'));
  // Explicit project setup remains available when suggestions are off.
  await page.locator(`[data-console-project="${s.id}"]`).click(); await page.locator('[data-project-create]').click();
  const form = page.locator('#project-form');
  assert.equal(await form.locator('[name=name]').inputValue(), s.name); assert.equal(await form.locator('[name=folders]').inputValue(), folder);
  assert.equal(await form.locator('[name=approach]').isVisible(), false);
  await form.locator('[name=goals]').fill('Ship a playable game'); await form.locator('[type=submit]').click();
  await page.locator('#project-editor').waitFor({ state: 'hidden' }); await until(async () => !!(await call('state')).sessions[0].projectId);
  let state = await call('state'), p = state.projects[0];
  assert.equal(state.sessions[0].id, s.id); assert.equal(state.sessions[0].cwd, folder); assert.equal(state.sessions[0].name, s.name);
  await call('session.input', { id: s.id, data: 'Write-Output $linkProbe\r' }); await until(async () => (await call('session.buffer', s.id)).data.includes('KEPT_AFTER_LINK'));
  assert.equal(fs.readFileSync(path.join(folder, 'keep.txt'), 'utf8'), 'Existing project file');
  checks.push('create a project from a live chat; folder prefilled; process and files preserved');
  await call('projects.save', { ...p, nextStep: 'Test the arena', milestones: [{ text: 'Playable arena', done: false }] });
  const bridgeFile = path.join(profile, 'bridge.json');
  await call('session.input', { id: s.id, data: `@{url=$env:AGENT_DOCK_BRIDGE_URL;token=$env:AGENT_DOCK_BRIDGE_TOKEN} | ConvertTo-Json -Compress | Set-Content -LiteralPath '${bridgeFile.replaceAll("'", "''")}'\r` });
  await until(() => fs.existsSync(bridgeFile));
  const grant = JSON.parse(fs.readFileSync(bridgeFile, 'utf8').replace(/^\uFEFF/, ''));
  async function bridge(name, args = {}) {
    const r = await fetch(grant.url, { method: 'POST', headers: { Authorization: 'Bearer ' + grant.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args }) });
    assert.equal(r.status, 200); const value = await r.json(); assert.notEqual(value.isError, true); return value;
  }
  assert.match(JSON.stringify(await bridge('dock_context')), /Ship a playable game/);
  await page.locator(`[data-console-project="${s.id}"]`).click(); await page.locator('[data-project-view]').click();
  await page.locator('.project-card').waitFor();
  await bridge('dock_call', { tool: 'dock/project_progress', arguments: { milestone: 0, done: true, nextStep: 'Gather playtest feedback' } });
  await until(async () => (await page.locator('.project-progress').textContent()).includes('1 / 1'));
  assert.match(await page.locator('.project-next').textContent(), /Gather playtest feedback/);
  checks.push('the same agent bridge reads project context; progress updates appear live in Projects');
  await page.locator('[data-page=settings]').click(); await page.locator('[data-setting=suggestProjects]').check();
  await until(async () => (await call('state')).settings.suggestProjects === true);
  await page.locator('[data-page=consoles]').first().click(); assert.equal(await page.locator('#project-suggestion').isVisible(), false);
  await page.locator('.session-card.empty [data-action=new]').first().click(); await page.locator('#project-suggestion').waitFor();
  const second = (await call('state')).sessions.find(x => x.id !== s.id);
  await page.locator('[data-project-setup]').click(); await page.locator('#console-project-form [name=projectId]').selectOption(p.id);
  await page.locator('#console-project-form [type=submit]').click(); await page.locator('#console-project-picker').waitFor({ state: 'hidden' });
  await until(async () => (await call('state')).sessions.every(x => x.projectId === p.id));
  assert.equal(await page.locator('#project-suggestion').isVisible(), false);
  // Unlink and then deliberately choose no future suggestions.
  await page.locator(`[data-console-project="${second.id}"]`).click(); await page.locator('#console-project-form [name=projectId]').selectOption('');
  await page.locator('#console-project-form [type=submit]').click(); await page.locator('#console-project-picker').waitFor({ state: 'hidden' });
  await page.locator('#project-suggestion').waitFor(); await page.locator('[data-project-stop]').click();
  const invalid = await page.evaluate(id => window.dock.call('session.project', { id, projectId: 'missing' }), s.id);
  assert.equal(invalid.ok, false); assert.equal((await call('state')).sessions.find(x => x.id === s.id).projectId, p.id);
  checks.push('re-enable suggestions; link an existing project; unlink; reject an invalid project without losing the previous link');
  state = await call('state'); fs.writeFileSync(path.join(out, 'fixture.json'), JSON.stringify(state));
  await stop(); await start(); await until(async () => (await call('state')).sessions.length === 2);
  state = await call('state'); assert.equal(state.sessions.find(x => x.consoleKey === s.consoleKey).projectId, p.id);
  assert.equal(state.sessions.find(x => x.consoleKey === second.consoleKey).projectId, null);
  assert.equal(state.settings.suggestProjects, false); assert.equal(await page.locator('#project-suggestion').isVisible(), false);
  checks.push('project association and opt-out survive workspace restoration');
  assert.deepEqual(errors, []); await stop();
  fs.writeFileSync(path.join(out, 'native-checks.json'), JSON.stringify({ passed: true, checks }, null, 2));
  console.log('PASS project suggestions, live linking, agent context, live progress and restart persistence');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await app?.close().catch(() => {});
  assert.equal(path.dirname(fs.realpathSync(profile)), fs.realpathSync(parent)); fs.rmSync(profile, { recursive: true, force: true });
});
