'use strict';
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.build/code-panel-20261025'); fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const profiles = [['pc', chromium, { viewport: { width: 1440, height: 1000 } }], ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } }], ['android', chromium, { ...devices['Pixel 7'] }], ['iphone', webkit, { ...devices['iPhone 13'] }]];
const server = http.createServer((req, res) => {
  const file = path.join(root, 'dist', req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file)] || 'text/html'); fs.createReadStream(file).pipe(res);
});
let browser; const reports = [];
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options), state = structuredClone(base), calls = [], errors = [];
    state.mode = 'dashboard'; state.settings.setupComplete = true; state.settings.suggestProjects = false; state.settings.sidebarCollapsed = true; state.codePanels = []; state.codeRevision = 0;
    state.sessions = state.sessions.slice(0, 2).map((s, i) => ({ ...s, id: `source-${i}`, consoleKey: `key-${i}`, alive: true, dismissed: false, state: 'open', purpose: 'agent', provider: 'codex', launchId: null, name: i ? 'Long project title to check header alignment' : 'Example project', slot: i + 1, width: 1, height: 1 }));
    if (!state.sessions.length) state.sessions = [{ id: 'source-0', consoleKey: 'key-0', alive: true, state: 'open', purpose: 'agent', provider: 'codex', name: 'Example', cwd: root, slot: 1 }];
    state.mobile = { ...state.mobile, enabled: true, name: 'Test PC', mode: 'local', host: '192.168.1.10', interfaces: [{ name: 'Wi-Fi', address: '192.168.1.10' }], devices: [], push: {}, network: {} };
    state.limits = [{ id: 'kiro:default', accountId: 'kiro:default', provider: 'kiro', name: 'Kiro', source: 'Synthetic fixture', observedAt: Date.now(), windows: [{ label: 'Free plan credits', used: 7.95, total: 50, unit: 'credits', usedPercent: 15.9, resetLabel: 'Resets on 2026-11-01' }] }];
    state.usageAccounts = [{ id: 'copilot:default', provider: 'copilot', label: 'Copilot' }, { id: 'kiro:default', provider: 'kiro', label: 'Kiro', hasUsage: true }];
    const after = 'export function greeting(name) {\n  return `Hello, ${name}!`;\n}\n';
    const report = { id: 'turn-one', mode: 'turn', at: Date.now(), changes: [{ file: 'src/greeting.js', type: 'modified' }], notes: ['Folder changes during this turn; other editors and agents may contribute.'] };
    let page;
    await context.exposeFunction('fixtureCall', async (method, payload) => {
      calls.push([method, payload]); let value = [];
      if (method === 'state') value = state;
      if (method === 'session.buffer') value = { data: '\x1b[?2004hcopy this terminal text\r\n', sequence: 0 };
      if (method === 'code.create') { value = { id: 'code-one', kind: 'code', alive: true, state: 'open', slot: 3, width: 1, height: 1, name: 'Code', cwd: root, codeSourceKey: 'key-0' }; state.codePanels.push(value); }
      if (method === 'code.report') value = report;
      if (method === 'code.file') value = { file: payload.path, before: payload.reportId ? 'export function greeting(name) {\n  return "Hello";\n}\n' : null, after, mode: payload.reportId ? 'turn' : 'file' };
      if (method === 'code.browse') value = { path: payload.path || '', items: payload.path ? [{ name: 'greeting.js', path: 'src/greeting.js' }] : [{ name: 'src', path: 'src', directory: true }] };
      if (method === 'code.close') state.codePanels = [];
      if (method === 'mode') state.mode = payload;
      if (method === 'settings') Object.assign(state.settings, payload);
      if (method === 'mobile.status') value = state.mobile;
      if (['code.create', 'code.close', 'mode', 'settings'].includes(method)) setTimeout(() => page.evaluate(s => window.fixtureState(s), state).catch(() => {}), 5);
      return { ok: true, value };
    });
    await context.addInitScript(() => { window.dock = { call: (m, p) => window.fixtureCall(m, p), onState: fn => window.fixtureState = fn, onOutput: fn => window.fixtureOutput = fn, onSelect: () => {} }; });
    await context.addInitScript({ path: require.resolve('axe-core/axe.min.js') });
    page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const access = async selector => {
      const violations = await page.evaluate(async selector => (await axe.run(document.querySelector(selector), { runOnly: ['color-contrast', 'button-name', 'label', 'aria-valid-attr-value'] })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), selector);
      assert.deepEqual(violations, [], `${name} accessibility: ${selector}`);
    };
    await page.locator('[data-code-action=create]').focus(); await page.keyboard.press('Enter'); await page.locator('.code-panel .cm-content').waitFor();
    assert.equal(await page.locator('.terminal-instance').count(), state.sessions.length, 'opening code keeps terminals');
    await page.locator('.code-panel [data-action=toggle-console]').click(); await page.locator('.code-panel.console-expanded').waitFor();
    await page.locator('[data-code-action=full]').click(); await page.locator('.code-panel .cm-content').focus();
    if (name === 'iphone') {
      await page.locator('.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^1$/ }).click();
      await page.keyboard.down('Shift'); await page.locator('.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^3$/ }).click(); await page.keyboard.up('Shift');
    } else { await page.keyboard.press('Control+Home'); await page.keyboard.press('Control+Shift+End'); }
    await page.locator('[data-code-action=copy]:not([disabled])').waitFor(); await page.locator('[data-code-action=copy]').focus(); await page.keyboard.press('Enter');
    assert.equal(calls.filter(([m]) => m === 'clipboard.write').at(-1)[1], after.trimEnd());
    await page.locator('[data-code-action=send]').click();
    const sent = calls.filter(([m]) => m === 'session.input').at(-1)?.[1]?.data;
    assert.ok(sent?.startsWith('\x1b[200~'), JSON.stringify(calls.slice(-5))); assert.ok(sent?.endsWith('\x1b[201~')); assert.match(sent, /src\/greeting.js:1-3/);
    // Ask agent: the shortcut and the context menu prepare the same context; Esc sends nothing; the note reaches the draft.
    const inputs = () => calls.filter(([m]) => m === 'session.input').length;
    const composer = page.locator('.ask-agent-dialog');
    await page.locator('.code-panel .cm-content').focus(); await page.keyboard.press('Control+Home'); await page.keyboard.press('Control+Shift+End');
    await page.keyboard.press(name === 'mac' || name === 'iphone' ? 'Meta+Shift+A' : 'Control+Shift+A'); await composer.waitFor();
    const viaShortcut = await composer.locator('p').first().textContent();
    const before = inputs(); await page.keyboard.press('Escape'); await composer.waitFor({ state: 'detached' });
    assert.equal(inputs(), before, `${name}: Esc sends nothing`);
    await page.locator('.code-panel .cm-line').first().click({ button: 'right' }); await page.locator('.ask-agent-menu').waitFor();
    await page.locator('.ask-agent-menu button').first().click(); await composer.waitFor();
    assert.equal(await composer.locator('p').first().textContent(), viaShortcut, `${name}: menu and shortcut agree`);
    await composer.locator('textarea').fill('Why does this greet twice?');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${name}: composer overflow`);
    const box = await composer.boundingBox(), view = page.viewportSize();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1, `${name}: composer inside the viewport`);
    await access('.ask-agent-dialog');
    await page.screenshot({ path: path.join(out, `${name}-ask-agent.png`) });
    await composer.locator('[data-draft]').click(); await composer.waitFor({ state: 'detached' });
    const asked = calls.filter(([m]) => m === 'session.input').at(-1)?.[1]?.data;
    assert.match(asked, /^\x1b\[200~Why does this greet twice\?/); assert.match(asked, /File: src\/greeting\.js:1-3/); assert.ok(!asked.endsWith('\r'), `${name}: no Enter`);
    await page.locator('[data-code-action=diff]').click(); await page.locator('.cm-deletedChunk').waitFor();
    await access('.code-panel');
    assert.deepEqual(await page.evaluate(async () => (await axe.run({ include: ['.window-drag-handle'] }, { runOnly: ['aria-prohibited-attr'] })).violations.map(x => x.id)), []);
    await page.screenshot({ path: path.join(out, `${name}-code.png`) });
    await page.locator('[data-code-action=browse]').click(); await page.locator('[data-directory]').click(); await page.locator('[data-code-path="src/greeting.js"]').click();
    assert.equal(await page.locator('.code-panel .cm-content').getAttribute('contenteditable'), 'false');
    await page.locator('[data-code-action=close]').click(); await page.locator('.code-panel').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.terminal-instance').count(), state.sessions.length);
    // The setup modal keeps its outside controls stationary through all steps.
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('dock-mobile-setup')));
    const dialog = page.locator('.mobile-setup'); await dialog.waitFor(); const initial = await dialog.boundingBox(), next = await dialog.locator('.mobile-footer button').last().boundingBox();
    const nameInput = await dialog.locator('[data-field=name]').boundingBox(), save = await dialog.locator('[data-mobile=rename-pc]').boundingBox();
    assert.ok(Math.abs(nameInput.y + nameInput.height - save.y - save.height) < 2, `${name} Save name aligns with input`);
    await page.screenshot({ path: path.join(out, `${name}-phone.png`) });
    await access('.mobile-setup');
    for (let step = 1; step <= 3; step++) {
      await dialog.locator('.mobile-footer button').last().click(); const box = await dialog.boundingBox(), button = await dialog.locator('.mobile-footer button').last().boundingBox();
      assert.ok(Math.abs(box.y - initial.y) < 2 && Math.abs(box.height - initial.height) < 2, `${name} phone dialog stays fixed`);
      assert.ok(Math.abs(button.y - next.y) < 2, `${name} footer stays fixed`);
    }
    await dialog.locator('[aria-label="Close phone setup"]').click();
    if (await page.locator('#sidebar-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#sidebar-toggle').click();
    await page.locator('[data-page=settings]').first().click(); await page.locator('.settings-navigation [data-page=tools]').click();
    const builtins = page.locator('.integrations[aria-label="Built-in tools"]');
    for (const [suffix, id] of [['tools', 'blender'], ['tools-second', 'rea']]) {
      await page.locator(`[data-integration=${id}]`).evaluate(el => { const stage = el.closest('.settings-stage'); stage.scrollTop += el.getBoundingClientRect().top - (innerWidth < 700 ? 150 : 100); });
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(out, `${name}-${suffix}.png`) });
    }
    await access('.integrations[aria-label="Built-in tools"]');
    if (name === 'pc' || name === 'mac') {
      const ys = await page.locator('[data-integration] .integration-fields').evaluateAll(xs => xs.slice(0, 3).map(x => x.getBoundingClientRect().y));
      if (ys.length === 3) assert.ok(Math.max(...ys) - Math.min(...ys) < 2, `${name} tool fields align`);
      const inputY = await page.locator('[data-integration=unity] input,[data-integration=meshy] input').evaluateAll(xs => xs.map(x => x.getBoundingClientRect().y));
      assert.ok(Math.max(...inputY) - Math.min(...inputY) < 2, `${name} input controls align`);
      const guides = await page.locator('[data-integration] [data-docs]').evaluateAll(xs => xs.filter(x => x.textContent === 'Setup guide').map(x => ({ name: x.closest('[data-integration]').dataset.integration, y: x.getBoundingClientRect().y, titleHeight: x.previousElementSibling.getBoundingClientRect().height, titleStyle: [getComputedStyle(x.previousElementSibling).fontSize, getComputedStyle(x.previousElementSibling).lineHeight, getComputedStyle(x.previousElementSibling).minHeight] })));
      assert.ok(Math.abs(guides[3].y - guides[4].y) < 2, `${name} second-row guides align: ${JSON.stringify(guides)}`);
    }
    await page.locator('[aria-label="Close settings"]').click();
    if (await page.locator('#sidebar-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#sidebar-toggle').click();
    await page.locator('[data-page=usage]').first().click(); await page.locator('.quota-card').first().waitFor();
    assert.match(await page.locator('.quota-card').first().textContent(), /Kiro.*Free plan credits/s);
    assert.match(await page.locator('.quota-card').first().textContent(), /7.95 of 50 credits used/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'no page overflow');
    assert.deepEqual(errors, []); reports.push({ profile: name, emulated: true, checks: 'read-only diff, file browse, keyboard copy, selected draft context, preserved consoles, fixed phone setup, alignment, subscription order, contrast and control labels', passed: true });
    await context.close(); await browser.close(); browser = null;
  }
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(reports, null, 2)); console.log(JSON.stringify(reports));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await browser?.close(); server.close(); });
