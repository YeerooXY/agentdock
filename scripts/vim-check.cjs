'use strict';
const shellCommand = require('./shell-commands.cjs');
const { openPage } = require('./ui-navigation.cjs');
const assert = require('node:assert/strict');

async function checkVimControls({ page, app, invoke, eventually, capture }) {
  const mode = () => page.locator('body').getAttribute('data-vim-mode');
  const slot = () => page.locator('body').getAttribute('data-vim-slot');
  const key = value => page.keyboard.press(value);
  const sequence = async value => { for (const letter of value) await key(letter); };
  const normal = async () => { await key('Control+Shift+Space'); await eventually(async () => await mode() === 'normal'); };
  const initial = await invoke('state'), defaults = initial.settings.consoleDefaults;
  assert.equal(initial.settings.vimControls, false);
  const expanded = page.locator('.session-card.console-expanded');
  if (await expanded.count()) {
    await expanded.locator('[data-action="toggle-console"]').click();
    await expanded.waitFor({ state: 'detached' });
  }
  await openPage(page, 'consoles');
  await page.locator('.session-card[data-slot="1"]').focus(); await key('j');
  assert.equal(await mode(), 'off'); assert.equal(await slot(), '1');
  assert.equal(await page.locator('.vim-mode:visible').count(), 0);

  await page.locator('[data-page=settings]').click();
  await openPage(page, 'console-settings');
  await page.locator('[data-setting=vimControls]').check();
  await eventually(async () => (await invoke('state')).settings.vimControls === true);
  await normal();
  for (const [pressed, expected] of [['l', '2'], ['j', '5'], ['h', '4'], ['k', '1'], ['3', '3'], ['l', '3'], ['9', '9'], ['j', '9']]) {
    await key(pressed); assert.equal(await slot(), expected);
    assert.equal(await page.locator(`.session-card[data-slot="${expected}"]`).evaluate(el => el === document.activeElement && el.classList.contains('vim-selected')), true);
  }
  await sequence('gg'); assert.equal(await slot(), '1');
  await key('Shift+G'); assert.equal(await slot(), '9');
  await key('r');
  const title = page.locator('.session-card[data-slot="9"] .console-name');
  assert.equal(await mode(), 'insert');
  await title.fill('Vim workspace'); await invoke('settings', { notifications: false });
  assert.equal(await title.inputValue(), 'Vim workspace');
  await title.press('Enter'); await eventually(async () => (await invoke('state')).settings.slotNames[9] === 'Vim workspace');
  assert.equal(await mode(), 'normal');
  await capture('test-vim-grid.png');

  await key('Shift+N'); await page.locator('#console-chooser[open]').waitFor();
  await page.locator('#one-off-console-form .console-options>summary').click();
  await page.locator('#one-off-console-form [name=name]').fill('hjkl123');
  assert.equal(await page.locator('#one-off-console-form [name=name]').inputValue(), 'hjkl123');
  await key('Escape'); await page.locator('#console-chooser').waitFor({ state: 'hidden' });
  assert.equal((await invoke('state')).sessions.filter(x => x.alive).length, 1);

  await key('n');
  await eventually(async () => (await invoke('state')).sessions.some(x => x.alive && x.slot === 9));
  const created = (await invoke('state')).sessions.find(x => x.alive && x.slot === 9);
  assert.equal(created.provider, 'shell'); assert.equal(created.name, 'Vim workspace');
  await eventually(async () => await mode() === 'insert' && shellCommand.prompt((await invoke('session.buffer', created.id)).data));
  await page.keyboard.type(shellCommand.join('VIM_', 'hjkl123')); await key('Enter');
  await eventually(async () => (await invoke('session.buffer', created.id)).data.includes('VIM_hjkl123'));
  await page.evaluate(() => {
    window.vimPassThrough = [];
    document.addEventListener('keydown', event => {
      if (event.target.closest('.xterm')) window.vimPassThrough.push({ key: event.key, ctrl: event.ctrlKey, prevented: event.defaultPrevented });
    }, true);
  });
  await key('Escape'); await key('Control+w'); await key('Control+c');
  const keys = await page.evaluate(() => window.vimPassThrough);
  assert.ok(keys.some(x => x.key === 'Escape' && !x.prevented));
  assert.ok(keys.some(x => x.key === 'w' && x.ctrl && !x.prevented));
  assert.ok(keys.some(x => x.key === 'c' && x.ctrl && !x.prevented));
  assert.equal(await mode(), 'insert');
  assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu()), null, 'Native menu shortcuts must not close Paddock or steal editor keys');
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'W', modifiers: ['control'] });
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'W', modifiers: ['control'] });
  });
  assert.equal((await invoke('state')).mode, 'dashboard');
  assert.equal(await mode(), 'insert');
  await normal(); assert.equal(await slot(), '9');
  await key('Enter');
  await eventually(async () => (await invoke('state')).mode === 'fullscreen' && !(await invoke('state')).transitioning && await mode() === 'insert');
  await normal();
  assert.equal(await page.locator('#consoles-page').isVisible(), true);
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), true);
  await key('i'); assert.equal(await mode(), 'insert');
  assert.equal(await page.locator('.session-card[data-slot="9"] .xterm-helper-textarea').evaluate(el => el === document.activeElement), true);
  await normal();
  await key('f'); await eventually(async () => (await invoke('state')).mode === 'dashboard' && !(await invoke('state')).transitioning);
  await key('f'); await eventually(async () => (await invoke('state')).mode === 'fullscreen' && !(await invoke('state')).transitioning);

  const sidebar = (await invoke('state')).settings.sidebarCollapsed;
  await key('b'); await eventually(async () => (await invoke('state')).settings.sidebarCollapsed !== sidebar);
  await key('b'); await eventually(async () => (await invoke('state')).settings.sidebarCollapsed === sidebar);
  await key('Shift+?'); await page.locator('#vim-help[open]').waitFor();
  await capture('test-vim-help.png');
  await key('Escape'); await page.locator('#vim-help').waitFor({ state: 'hidden' });
  assert.equal(await mode(), 'normal');

  await sequence('gu'); await eventually(async () => await page.locator('#content h1').innerText() === 'Usage');
  await sequence('ga'); await eventually(async () => await page.locator('#api-form').isVisible());
  await page.locator('#api-form textarea[name=prompt]').focus();
  await page.keyboard.type('hjkl 123 gn gi');
  assert.equal(await page.locator('#api-form textarea[name=prompt]').inputValue(), 'hjkl 123 gn gi');
  assert.equal(await mode(), 'insert');
  await page.locator('#api-form textarea[name=prompt]').fill('');
  await normal(); await sequence('gs'); await openPage(page, 'console-settings'); await page.locator('[data-setting=vimControls]').waitFor();
  await key('Shift+G');
  assert.ok(await page.locator('.settings-stage').evaluate(el => el.scrollTop > 0));
  // Scrolling can still be settling when the key returns; wait for the final position.
  await sequence('gg'); await eventually(async () => await page.locator('.settings-stage').evaluate(el => el.scrollTop) === 0);
  await key('Control+d'); assert.ok(await page.locator('.settings-stage').evaluate(el => el.scrollTop > 0));
  await key('Control+u'); await eventually(async () => await page.locator('.settings-stage').evaluate(el => el.scrollTop) === 0);
  await sequence('gc'); await eventually(async () => await page.locator('#consoles-page').isVisible());
  await key('d'); await eventually(async () => (await invoke('state')).mode === 'hud' && !(await invoke('state')).transitioning);
  await key('1'); await key('l'); assert.equal(await slot(), '2');
  assert.equal(await page.locator('.hud-slot[data-slot="2"]').evaluate(el => el === document.activeElement && el.classList.contains('vim-selected')), true);
  await key('1'); await key('Enter');
  await eventually(async () => (await invoke('state')).mode === 'fullscreen' && !(await invoke('state')).transitioning && await mode() === 'insert');
  await normal(); await key('d');
  await eventually(async () => (await invoke('state')).mode === 'hud' && !(await invoke('state')).transitioning);
  await key('?'); await page.locator('#vim-help[open]').waitFor();
  assert.equal(await page.locator('#vim-help').evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await capture('test-vim-hud-help.png');
  await key('Escape'); await sequence('gc');
  await eventually(async () => (await invoke('state')).mode === 'dashboard' && !(await invoke('state')).transitioning);

  await page.reload(); await page.waitForSelector('.session-grid');
  assert.equal((await invoke('state')).settings.vimControls, true);
  assert.equal(await mode(), 'normal');
  assert.deepEqual((await invoke('state')).settings.consoleDefaults, defaults);
  await invoke('session.end', created.id);
  await eventually(async () => !(await invoke('state')).sessions.find(x => x.id === created.id)?.alive);
  await invoke('slot.name', { slot: 9, name: '', sessionId: null });
  await sequence('gs'); await openPage(page, 'console-settings'); await page.locator('[data-setting=vimControls]').uncheck();
  await eventually(async () => (await invoke('state')).settings.vimControls === false);
  await openPage(page, 'consoles');
  await page.locator('.session-card[data-slot="1"]').focus(); await key('j');
  assert.equal(await mode(), 'off'); assert.equal(await page.locator('.vim-selected').count(), 0);
}

module.exports = { checkVimControls };
