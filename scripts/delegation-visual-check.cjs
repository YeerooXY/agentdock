'use strict';
// Usage settings and live Review panels. Synthetic state; no reviewer CLI calls.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'dist'), out = path.join(root, 'artifacts/delegation');
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0], file = p === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(dist, p === '/' ? 'index.html' : p);
  if ((p !== '/_axe.js' && !file.startsWith(dist + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, devices['Pixel 7']], ['iphone', webkit, devices['iPhone 13']]];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const errors = [];
  for (const [name, engine, options] of profiles) {
    for (const enabled of [false, true]) {
      const browser = await engine.launch(), context = await browser.newContext(options), state = structuredClone(base);
      state.mode = 'dashboard'; Object.assign(state.settings, { setupComplete: true, sidebarCollapsed: false, delegationEnabled: enabled, delegationProviders: ['claude', 'codex'] });
      state.ledger = []; state.usageAccounts = [];
      state.delegations = enabled ? [
        { id: 'a', state: 'running', noFreeSlot: true, reviewer: { label: 'Codex · Work account' }, why: 'Codex · Work account: a different vendor from Claude Code, 62% left, resets in 3 hours.', consoleName: 'Builder', startedAt: Date.now() },
        { id: 'b', state: 'done', verdict: 'changes-requested', reviewer: { label: 'Claude Code' }, why: 'Claude Code: the same vendor as the caller, usage unknown.', consoleName: 'A very long console name that needs to wrap on a phone screen', startedAt: Date.now() - 600000 },
        { id: 'c', state: 'failed', reviewer: { label: 'Claude Code' }, why: '', error: 'Claude Code exited with code 1. The reviewer returned no answer. Sign in to Claude Code in a console first.', consoleName: 'Builder', startedAt: Date.now() - 900000 }
      ] : [];
      await context.exposeFunction('fixtureCall', method => ({ ok: true, value: method === 'state' ? state : method === 'session.buffer' ? { data: '', sequence: 0 } : method === 'explorer.list' ? (enabled ? { entries: [], truncated: false } : []) : [] }));
      // The off scenario deliberately retains the old malformed Explorer array
      // response: its inherited .entries function must never become a file list.
      await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(`${name}/usage-${enabled ? 'on' : 'off'}: ${e.stack || e.message}`));
      await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('[data-page=usage]').click();
      const section = page.locator('.delegation-settings'); await section.waitFor(); await section.scrollIntoViewIfNeeded();
      if (await page.locator('[data-delegation-stop]').count() !== (enabled ? 1 : 0)) errors.push(`${name}: wrong Stop count`);
      if (await page.locator('.delegation-reviewers').evaluate(x => x.disabled) === enabled) errors.push(`${name}: reviewer choice ${enabled ? 'disabled' : 'enabled'}`);
      if (!(await page.locator('[data-setting=delegationPanels]').isChecked())) errors.push(`${name}: panels should default on`);
      if (enabled && !(await section.textContent()).includes('No free slot')) errors.push(`${name}: missing No free slot`);
      await page.addScriptTag({ url: '/_axe.js' });
      const axe = await page.evaluate(async () => (await window.axe.run('.delegation-settings', { runOnly: ['color-contrast', 'button-name', 'label'] })).violations.map(x => x.id));
      if (axe.length) errors.push(`${name}: axe ${axe.join(', ')}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.querySelector('#content').scrollWidth > document.querySelector('#content').clientWidth + 1)) errors.push(`${name}: overflow`);
      await section.screenshot({ path: path.join(out, `${name}-${enabled ? 'on' : 'off'}.png`) });
      await browser.close();
    }
    for (const scenario of ['running', 'approve', 'changes-requested', 'failed', 'stopped']) {
      const browser = await engine.launch(), context = await browser.newContext(options), state = structuredClone(base), calls = [];
      const finished = scenario !== 'running', done = ['approve', 'changes-requested'].includes(scenario);
      state.mode = 'dashboard'; state.platform = ['mac', 'iphone'].includes(name) ? 'darwin' : 'win32';
      Object.assign(state.settings, { setupComplete: true, sidebarCollapsed: true, delegationEnabled: true, delegationPanels: true, ambientMotion: false, launchEffect: false, grid: { columns: 2, rows: 2 } });
      state.grid = { columns: 2, rows: 2 }; state.sessions = []; state.recent = []; state.ledger = [];
      const job = { id: 'review-fixture', state: done ? 'done' : scenario, verdict: done ? scenario : null, reviewer: { label: 'Claude Code · Work' }, consoleName: 'Builder with a long console name',
        startedAt: Date.now() - 65_000, finishedAt: finished ? Date.now() : null, resultId: finished ? 'review-result' : null,
        error: scenario === 'failed' ? 'Claude Code exited with code 1. Sign in to Claude Code in a console first.' : '',
        log: ['Reading src/app.js', 'Searching files', 'Checking the panel lifecycle', ...Array.from({ length: 70 }, (_, i) => `Reading src/components/component-${i}.js`), 'Checking ' + 'a-very-long-file-name/'.repeat(12), ...(done ? [`Verdict: ${scenario}`] : [])] };
      job.reviewer.label = 'Claude Code · ' + 'LongReviewerAccount'.repeat(8);
      state.delegations = [job]; state.codePanels = [{ id: 'review-panel', kind: 'review', provider: 'review', reviewId: job.id, name: `Review · ${job.reviewer.label}`, consoleName: job.consoleName, alive: true, state: 'open', slot: 1, width: 1, height: 1 }];
      state.workbench.results = [{ id: 'review-result', title: 'Review by Claude Code', kind: 'report', ext: '.md', status: 'passed', at: Date.now(), consoleName: job.consoleName }];
      let page;
      await context.exposeFunction('fixtureCall', async (method, payload) => {
        calls.push(method);
        let value = [];
        if (method === 'mode') state.mode = payload;
        if (method === 'review.close') state.codePanels = [];
        if (method === 'workbench.delegation.stop') { job.state = 'stopped'; job.finishedAt = Date.now(); }
        if (method === 'state') value = state;
        if (method === 'explorer.list') value = { entries: [], truncated: false };
        if (method === 'workbench.results.preview') value = { text: 'VERDICT: approve\nFINDINGS:\n- none' };
        if (['mode', 'review.close', 'workbench.delegation.stop'].includes(method)) await page.evaluate(next => window.fixtureState(next), state);
        return { ok: true, value };
      });
      await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: () => {}, onSelect: () => {}, onNotice: () => {} }; });
      page = await context.newPage(); page.on('pageerror', e => errors.push(`${name}/${scenario}: ${e.stack || e.message}`));
      await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('[data-page=consoles]').first().click();
      const panel = page.locator('.review-panel'); await panel.waitFor(); await panel.scrollIntoViewIfNeeded();
      if (await panel.locator('input,textarea').count()) errors.push(`${name}/${scenario}: review has input`);
      if (await panel.locator('[data-review-action=stop]:visible').count() !== (finished ? 0 : 1)) errors.push(`${name}/${scenario}: wrong Stop visibility`);
      if (await panel.locator('[data-review-action=result]:visible').count() !== (finished ? 1 : 0)) errors.push(`${name}/${scenario}: wrong result visibility`);
      await page.addScriptTag({ url: '/_axe.js' });
      const axe = await page.evaluate(async () => (await window.axe.run('.review-panel', { runOnly: ['color-contrast', 'button-name', 'label'] })).violations.map(x => x.id));
      if (axe.length) errors.push(`${name}/${scenario}: axe ${axe.join(', ')}`);
      const overflow = await panel.evaluate(node => [node, ...node.querySelectorAll('.review-panel-body,.review-log,.review-actions,.console-panel-header')].filter(x => x.scrollWidth > x.clientWidth + 1).map(x => `${x.className}: ${x.scrollWidth}/${x.clientWidth}`));
      if (overflow.length) errors.push(`${name}/${scenario}: panel overflow (${overflow.join(', ')})`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) errors.push(`${name}/${scenario}: page overflow`);
      await panel.screenshot({ path: path.join(out, `${name}-panel-${scenario}.png`) });
      if (!finished) {
        const log = panel.locator('.review-log');
        await log.evaluate(node => { node.scrollTop = 0; });
        job.log.push('Reading another file'); await page.evaluate(next => window.fixtureState(next), state);
        if (await log.evaluate(node => node.scrollTop) > 1) errors.push(`${name}: progress moved a scrolled-up log`);
        await log.evaluate(node => { node.scrollTop = node.scrollHeight; });
        job.log.push('Checking final edges'); await page.evaluate(next => window.fixtureState(next), state);
        if (await log.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop) > 24) errors.push(`${name}: progress did not follow`);
      }
      await panel.locator('[data-action=toggle-console]').click();
      await page.locator('.review-panel.console-expanded').waitFor();
      await panel.screenshot({ path: path.join(out, `${name}-panel-${scenario}-expanded.png`) });
      await panel.locator('[data-action=toggle-console]').click();
      if (finished) {
        await panel.locator('[data-review-action=result]').click();
        await page.locator('#result-preview').waitFor();
        if (!calls.includes('workbench.results.preview')) errors.push(`${name}/${scenario}: result did not open`);
        await page.keyboard.press('Escape');
      }
      const panelFixture = state.codePanels[0];
      await panel.locator('[data-review-action=close]').click(); await panel.waitFor({ state: 'detached' });
      if (!finished && (job.state !== 'running' || calls.includes('workbench.delegation.stop'))) errors.push(`${name}: closing stopped the review`);
      if (!finished) {
        state.codePanels = [panelFixture]; await page.evaluate(next => window.fixtureState(next), state);
        await panel.locator('[data-review-action=stop]').click();
        await panel.locator('.review-state').filter({ hasText: 'Stopped' }).waitFor();
        if (job.state !== 'stopped' || calls.filter(x => x === 'workbench.delegation.stop').length !== 1) errors.push(`${name}: explicit Stop failed`);
        job.log = {}; await page.evaluate(next => window.fixtureState(next), state);
        if (await panel.locator('.review-log').textContent() !== '') errors.push(`${name}: invalid log array was rendered`);
        state.delegations = {}; await page.evaluate(next => window.fixtureState(next), state);
        await panel.locator('.review-state').filter({ hasText: 'Review unavailable' }).waitFor();
        state.codePanels = {}; await page.evaluate(next => window.fixtureState(next), state);
        await panel.waitFor({ state: 'detached' });
      }
      if (calls.some(x => ['session.write', 'session.send', 'session.create'].includes(x))) errors.push(`${name}/${scenario}: review sent console input`);
      await browser.close();
    }
  }
  server.close(); console.log(errors.length ? errors.join('\n') : 'no page errors');
  if (errors.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
