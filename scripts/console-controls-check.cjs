'use strict';
const { _electron: electron } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data');
fs.mkdirSync(parent, { recursive: true });
const profile = fs.mkdtempSync(path.join(parent, 'console-controls-'));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false, grid: { columns: 2, rows: 3 }, trimStyle: 'classic', launchEffect: false, confirmConsoleEnd: false }));
let app;
(async () => {
  app = await electron.launch({ args: [root, '--smoke-test', '--startup-check', `--data-dir=${profile}`] });
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  page.on('pageerror', e => console.error('renderer', e.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await page.waitForSelector('.session-grid', { state: 'attached' });
  const call = (method, payload) => page.evaluate(async ([method, payload]) => { const r = await window.dock.call(method, payload); if (!r.ok) throw Error(r.error); return r.value; }, [method, payload]);
  await page.locator('nav [data-page="consoles"]').click();
  const first = await call('session.create', { provider: 'shell', cwd: root, name: 'Playtime', slot: 1 });
  const second = await call('session.create', { provider: 'shell', cwd: root, name: 'FamilyHub', slot: 2 });
  await call('session.layout', { id: second.id, height: 3 });
  await page.waitForTimeout(500);
  for (const id of [first.id, second.id]) {
    const result = await page.locator(`.session-grid [data-console-id="${id}"]`).evaluate(card => ({
      id: card.dataset.consoleId, name: card.querySelector('.console-name').value,
      close: card.querySelector('[data-action="end-session"]').dataset.id,
      terminal: card.querySelector('[data-terminal-id]')?.dataset.terminalId,
      edges: [...card.querySelectorAll('[data-resize-edge]')].map(h => { const r = h.getBoundingClientRect(), hit = document.elementFromPoint(r.x+r.width/2, r.y+r.height/2); return { edge: h.dataset.resizeEdge, hit: hit?.closest('[data-console-id]')?.dataset.consoleId }; })
    }));
    assert.equal(result.id, result.close); assert.equal(result.id, result.terminal);
    for (const edge of result.edges) assert.equal(edge.hit, id, edge.edge);
  }
  const handle = page.locator(`.session-grid [data-console-id="${first.id}"] [data-resize-edge=s]`);
  await handle.focus(); await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => !document.body.classList.contains('console-layout-active'));
  const state = await call('state');
  assert.equal(state.sessions.find(x => x.id === first.id).height, 2);
  assert.equal(state.sessions.find(x => x.id === second.id).height, 3);
  // Errors use the same readable treatment without stealing keyboard focus.
  const errorButton = page.locator(`.session-grid [data-console-id="${first.id}"] [data-action="end-session"]`);
  await errorButton.evaluate(b => { b.dataset.id = 'missing-console-for-test'; });
  await errorButton.click();
  await page.locator('#toast.visible.error').waitFor();
  assert.equal(await page.locator('#toast').getAttribute('role'), 'alert');
  assert.equal(await page.locator('#toast').evaluate(e => getComputedStyle(e).fontSize), '14px');
  await errorButton.evaluate((b, id) => { b.dataset.id = id; }, first.id);
  // Exercise pointer capture on the other console, then cancel the preview.
  const other = page.locator(`.session-grid [data-console-id="${second.id}"] [data-resize-edge=n]`);
  await other.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).forEach(a => a.finish()));
  const rect = await other.boundingBox();
  await page.mouse.move(rect.x + rect.width/2, rect.y + rect.height/2); await page.mouse.down();
  await page.waitForSelector('.console-resize-active');
  assert.equal(await page.locator('.console-resize-active').getAttribute('data-console-id'), second.id);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await page.waitForFunction(() => !document.body.classList.contains('console-layout-active'));
  for (const [id, key] of [[first.id, 'Enter'], [second.id, 'Space']]) {
    const close = page.locator(`.session-grid [data-console-id="${id}"] [data-action="end-session"]`);
    await close.focus(); await page.keyboard.press(key);
    await page.locator(`.session-grid [data-console-id="${id}"]`).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'new');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement === document.body), false);
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement.dataset.action), 'new');
  }
  assert.equal((await call('state')).sessions.filter(s => s.alive && !s.dismissed).length, 0);
  console.log('PASS live console creation, resize identity, closing and keyboard focus');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (app) await app.close();
  if (path.dirname(fs.realpathSync(profile)) === fs.realpathSync(parent)) fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
});
