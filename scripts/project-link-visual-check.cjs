'use strict';
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.build', 'prompt7-project-link'), dist = path.join(root, 'dist');
const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json'))); // Run project-link-smoke.cjs first.
const server = http.createServer((req, res) => {
  const name = req.url.split('?')[0], file = name === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, name === '/' ? 'index.html' : name);
  if ((name !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
let browser; const reports = [];
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options), state = structuredClone(fixture), errors = [], captures = [];
    const small = ['android', 'iphone'].includes(name);
    state.mode = 'dashboard'; state.settings.suggestProjects = true; state.settings.sidebarCollapsed = small;
    state.settings.consoleDefaults.cwd = 'C:\\Projects\\Robonslaught'; state.sessions = state.sessions.slice(0, 1);
    Object.assign(state.sessions[0], { name: 'Robonslaught', cwd: state.settings.consoleDefaults.cwd, projectId: null, nameMode: 'custom' });
    Object.assign(state.projects[0], { name: 'Robonslaught', category: 'Game', goals: 'Build a playable arena and finish a public demo.', nextStep: 'Gather playtest feedback', milestones: [{ text: 'Playable arena', done: true }, { text: 'Demo ready for players', done: false }], folders: [{ path: state.settings.consoleDefaults.cwd }] });
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      let value;
      if (method === 'state') return { ok: true, value: state };
      if (method === 'session.buffer') {
        const session = state.sessions.find(item => item.id === payload);
        return { ok: true, value: { data: 'PS C:\\Projects\\Robonslaught>\r\n\r\nProject linking preview\r\nThis console keeps its running session.\r\n', sequence: 0, launchId: session?.launchId || null } };
      }
      if (method === 'session.models') return { ok: true, value: [] };
      if (method === 'settings') Object.assign(state.settings, payload);
      else if (method === 'mode') state.mode = payload;
      else if (method === 'session.project') { const s = state.sessions.find(x => x.id === payload.id); s.projectId = payload.projectId; s.nameMode = payload.useProjectName ? 'project' : 'custom'; if (s.nameMode === 'project') s.name = state.projects.find(x => x.id === s.projectId).name; value = s; }
      else if (method === 'projects.save') { value = { ...payload, id: payload.id || 'new-project', createdAt: Date.now(), status: payload.status || 'active', lastActiveAt: null }; state.projects = [value, ...state.projects.filter(x => x.id !== value.id)]; }
      else if (!['session.resize', 'session.input', 'session.acknowledge'].includes(method)) throw Error('Unexpected fixture call ' + method);
      return { ok: true, value, state };
    });
    await context.addInitScript(() => { let changed; window.dock = { call: async (m, p) => { const r = await window.fixtureCall(m, p); if (r.state) changed?.(r.state); return r; }, onState: f => { changed = f; }, onOutput: () => {}, onSelect: () => {} }; });
    const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port); await page.locator('#project-suggestion').waitFor(); await page.addScriptTag({ url: '/_axe.js' });
    async function capture(view) {
      await page.evaluate(async () => { await document.fonts.ready; document.getAnimations().filter(x => x.effect?.getTiming().iterations !== Infinity).forEach(x => x.finish()); });
      const file = `${name}-${view}.png`; await page.screenshot({ path: path.join(out, file) }); captures.push(file);
      const checks = await page.evaluate(async () => ({
        overflow: document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('#project-suggestion, dialog[open], #content')].some(x => x.getClientRects().length && x.scrollWidth > x.clientWidth + 1),
        findings: (await axe.run(document, { runOnly: ['color-contrast', 'button-name', 'label', 'aria-dialog-name'] })).violations.map(x => ({ id: x.id, targets: x.nodes.map(n => n.target) }))
      }));
      assert.equal(checks.overflow, false, `${name}/${view} overflow`); assert.deepEqual(checks.findings, [], `${name}/${view} accessibility`);
    }
    async function nav(view) {
      if (state.settings.sidebarCollapsed) await page.locator('#sidebar-toggle').click();
      await page.locator(`[data-page=${view}]`).first().click();
      if (small && !state.settings.sidebarCollapsed && await page.locator('#sidebar-toggle').isVisible()) await page.locator('#sidebar-toggle').click();
    }
    await capture('suggestion');
    await page.locator('[data-project-setup]').focus(); await page.keyboard.press('Enter'); await page.locator('#console-project-picker').waitFor();
    assert.equal(await page.locator('#console-project-form [name=projectId]').evaluate(x => x === document.activeElement), true);
    await capture('picker'); await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[data-project-setup]') === document.activeElement);
    await page.locator('[data-project-stop]').focus(); await page.keyboard.press('Enter'); await page.locator('#project-suggestion').waitFor({ state: 'hidden' });
    assert.equal(state.settings.suggestProjects, false);
    assert.equal(await page.locator('.console-project').evaluate(x => x === document.activeElement), true);
    // Manual setup remains reachable after opting out, including create-from-chat.
    await page.locator('.console-project').click(); await page.locator('[data-project-create]').click();
    assert.equal(await page.locator('#project-form [name=name]').inputValue(), 'Robonslaught');
    assert.equal(await page.locator('#project-form [name=folders]').inputValue(), state.sessions[0].cwd);
    await page.locator('#project-form [name=goals]').fill('Bring my existing game into Projects.'); await capture('new-project'); await page.keyboard.press('Escape');
    await page.locator('.console-project').click(); await page.locator('#console-project-form [name=projectId]').selectOption(state.projects[0].id);
    const naming = page.locator('#console-project-form [name=useProjectName]'); assert.equal(await naming.isChecked(), false);
    await naming.focus(); await page.keyboard.press('Space'); assert.equal(await naming.isChecked(), true); await capture('title-choice');
    await page.locator('#console-project-form [type=submit]').click(); await page.locator('#console-project-picker').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#project-suggestion').isVisible(), false);
    assert.equal(state.sessions[0].nameMode, 'project');
    const linkedPanel = page.locator(`.session-card[data-console-id="${state.sessions[0].id}"]`);
    await linkedPanel.locator('[data-action="toggle-console"]').click(); await linkedPanel.locator('.console-expand[aria-expanded=true]').waitFor(); await capture('linked-console');
    await linkedPanel.locator('.console-project').click(); await page.locator('[data-project-view]').click();
    await page.locator('.project-card').waitFor(); await page.locator('.project-milestones summary').click(); await capture('progress');
    await nav('settings'); const toggle = page.locator('[data-setting=suggestProjects]');
    assert.equal(await toggle.isChecked(), false); await toggle.focus(); await page.keyboard.press('Space');
    await page.waitForFunction(async () => (await window.dock.call('state')).value.settings.suggestProjects === true);
    await page.locator('#project-settings').evaluate(x => x.scrollIntoView({ block: 'start' })); await capture('settings');
    assert.deepEqual(errors, []);
    reports.push({ profile: name, engine: browser.version(), emulated: name !== 'pc', captures, checks: ['suggestion opt-out', 'manual setup after opt-out', 'prefilled existing folder', 'keyboard and Escape', 'focus return', 'link and project progress navigation', 'settings switch', 'selected axe checks', 'no horizontal overflow', 'no page errors'] });
    await browser.close(); browser = null; console.log('PASS ' + name + ' project linking and progress');
  }
  fs.writeFileSync(path.join(out, 'visual-checks.json'), JSON.stringify(reports, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
