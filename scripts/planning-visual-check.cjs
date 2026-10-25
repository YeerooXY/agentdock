'use strict';
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Projects } = require('../electron/projects.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts', 'planning'), parent = path.join(root, 'test-data');
const fixture = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json')));
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, { ...devices['Pixel 7'] }], ['iphone', webkit, { ...devices['iPhone 13'] }]];
const server = http.createServer((req, res) => {
  const name = req.url.split('?')[0], file = name === '/axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(root, 'dist', name === '/' ? 'index.html' : name);
  if ((name !== '/axe.js' && !file.startsWith(path.join(root, 'dist') + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); fs.createReadStream(file).pipe(res);
});
let browser, directory; const reports = [];
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  for (const [name, engine, options] of profiles) {
    directory = fs.mkdtempSync(path.join(parent, 'planning-visual-')); const projectFolder = path.join(directory, 'Learning app'); fs.mkdirSync(projectFolder);
    const projects = new Projects(directory), state = structuredClone(fixture), errors = [], captures = [], violations = [];
    const example = structuredClone(fixture.projects[0]); example.folders = [{ path: projectFolder }]; example.plan.approvals = {}; example.status = 'planning'; example.plan.proposals = {}; example.plan.skipped = {}; delete example.plan.proposal;
    projects.store(example);
    for (const [status, title] of [['active', 'Course notes'], ['paused', 'Archive importer'], ['complete', 'Note viewer'], ['archived', 'Quiz prototype']]) {
      const item = structuredClone(example); item.id = randomUUID(); item.name = title; item.status = status; item.lastActiveAt = null;
      if (status === 'active' || status === 'complete') item.plan.approvals = Object.fromEntries(['brief', 'research', 'infrastructure', 'roadmap'].map(s => [s, Date.now()]));
      projects.store(item);
    }
    state.projects = projects.list(); state.settings.sidebarCollapsed = false; state.mode = 'dashboard';
    browser = await engine.launch(); const context = await browser.newContext(options);
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      try {
        let value;
        if (method === 'state') return { ok: true, value: state };
        if (method === 'session.buffer') return { ok: true, value: { data: '', sequence: 0 } };
        if (method === 'session.models') return { ok: true, value: [] };
        if (method === 'settings') Object.assign(state.settings, payload);
        else if (method === 'projects.plan.review') value = projects.review(payload.id, payload);
        else if (method === 'projects.plan.later') value = projects.addLater(payload.id, payload);
        else if (method === 'projects.plan.thumb') value = '';
        else if (method === 'projects.folder') { value = projects.folderPath(payload.id, payload.index, payload.planFiles); state.openedFolder = value; }
        else if (!['session.resize', 'session.acknowledge'].includes(method)) throw Error('Unexpected fixture call ' + method);
        state.projects = projects.list(); return { ok: true, value, state };
      } catch (error) { return { ok: false, error: error.message }; }
    });
    await context.addInitScript(() => { let changed; window.dock = { call: async (method, payload) => { const r = await window.fixtureCall(method, payload); if (r.state) changed?.(r.state); return r; }, onState: fn => { changed = fn; }, onOutput: () => {}, onSelect: () => {} }; });
    const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port); await page.locator('.session-grid').waitFor(); await page.addScriptTag({ url: '/axe.js' });
    await page.locator('[data-page=projects]').click(); if (['android', 'iphone'].includes(name)) await page.locator('#sidebar-toggle').click();
    async function capture(view) {
      await page.evaluate(async () => { document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()); await document.fonts.ready; });
      const file = `${name}-${view}.png`; await page.screenshot({ path: path.join(out, file) }); captures.push(file);
      const result = await page.evaluate(async () => {
        const axeResult = await axe.run(document, { runOnly: ['color-contrast', 'button-name', 'label', 'aria-dialog-name'] });
        const targets = [document.documentElement, document.querySelector('#content'), ...document.querySelectorAll('dialog[open], dialog[open] .plan-main, dialog[open] .plan-side')].filter(Boolean);
        return { overflow: targets.some(el => el.scrollWidth > el.clientWidth + 1), violations: axeResult.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })) };
      });
      assert.equal(result.overflow, false, `${name}/${view}: horizontal overflow`);
      if (result.violations.length) violations.push({ view, items: result.violations });
    }
    await page.locator('[data-project-status]').selectOption(''); await capture('project-states');
    assert.equal(await page.locator('[data-status=active]').count(), 1);
    await page.locator('.page-heading [data-project-new]').click(); const creation = page.locator('#project-form');
    await creation.locator('[name=name]').fill('A new learning app'); await creation.locator('[name=goals]').fill('Practice class notes with short quizzes.');
    assert.equal(await creation.locator('[name=milestones]').isVisible(), true); await capture('first-brief');
    await page.keyboard.press('Escape'); await page.locator('#project-editor').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('.page-heading [data-project-new]') === document.activeElement);
    await page.locator(`[data-project-plan="${example.id}"]`).click(); const dialog = page.locator('#project-plan'), form = page.locator('#project-plan-form');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement?.closest('#project-plan')), true);
    await dialog.locator('[data-plan-step=brief]').click(); await capture('brief-read');
    await dialog.locator('[data-plan-edit]').click(); await form.locator('[name=audience]').fill('Students practicing their own class notes.');
    await dialog.locator('[data-plan-step=research]').click(); await dialog.locator('[data-plan-step=brief]').click();
    assert.equal(await form.locator('[name=audience]').inputValue(), 'Students practicing their own class notes.'); await capture('brief-edit');
    await form.locator('[value=approve]').click(); await dialog.locator('[data-plan-step=research]').click();
    await dialog.locator('[data-plan-approve]').click(); await dialog.locator('.plan-error').filter({ hasText: 'at least one finding' }).waitFor(); await capture('research-error');
    await dialog.locator('[data-plan-skip]').click(); await dialog.locator('[data-plan-step=research] .plan-badge').filter({ hasText: 'Not needed' }).waitFor();
    await dialog.locator('[data-plan-step=infrastructure]').click(); await capture('setup-read');
    await dialog.locator('[data-plan-step=roadmap]').click(); await dialog.locator('[data-plan-edit]').click();
    await form.locator('[name=scope]').fill('Import notes and complete one local practice session.'); await form.locator('[name=excluded]').fill('Accounts and sync.');
    await capture('roadmap-edit');
    const close = await dialog.locator('[data-plan-close]').boundingBox(); assert.ok(close.y >= 0 && close.y + close.height <= (options.viewport?.height || 1000), 'Close remains visible');
    await form.locator('[value=approve]').click(); await page.waitForFunction(() => document.querySelector('[data-plan-step=roadmap] .plan-badge')?.textContent === 'Approved');
    assert.equal(projects.get(example.id).status, 'active');
    await dialog.locator('#plan-later').fill('Shared study groups'); await dialog.locator('[data-plan-later-form] button').click(); await dialog.locator('.plan-later li').filter({ hasText: 'Shared study groups' }).waitFor();
    await capture('roadmap-read');
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(id => document.activeElement?.dataset.projectPlan === id, example.id);
    await page.locator(`[data-project-folder-open="${example.id}"]`).click(); assert.equal(state.openedFolder, projectFolder);
    if (name === 'pc') {
      await page.setViewportSize({ width: 720, height: 500 }); await page.locator(`[data-project-plan="${example.id}"]`).click(); await capture('small-desktop-roadmap'); await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 320, height: 740 }); await page.locator(`[data-project-plan="${example.id}"]`).click();
      await dialog.locator('h2').evaluate(el => { el.textContent = 'LearningApplicationWithLongUnbrokenProjectNameAndRevisionNumber123'; });
      await capture('narrow-long-name'); await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []); reports.push({ profile: name, engine: browser.version(), emulated: name !== 'pc', captures, violations, checks: ['read mode', 'unsaved text preserved across steps', 'actionable validation', 'not needed', 'roadmap approval without earlier sections', 'Later features separate', 'visible close control', 'folder link', 'Escape and focus return', 'no horizontal overflow'] });
    await browser.close(); browser = null;
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(parent)); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 }); directory = null;
    console.log('PASS ' + name + ' planning flow and visual checks');
  }
  fs.writeFileSync(path.join(out, 'visual-checks.json'), JSON.stringify(reports, null, 2)); assert.ok(reports.every(r => !r.violations.length), 'Review accessibility findings');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); server.close();
  if (directory) { assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(parent)); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 }); }
});
