'use strict';
// Contracts of the desktop renderer modules that load without a browser.
const test = require('node:test'), assert = require('node:assert/strict');
const panelsModule = import('../src/console/panels.js');
const providersModule = import('../src/ui/providers.js');
const formatModule = import('../src/ui/format.js');

test('desktop messages go directly to the terminal with no queue actions', async () => {
  const writes = [];
  const handlers = require('../electron/desktop-session-commands.cjs').desktopSessionCommands({
    sessions: { write: (id, text) => writes.push([id, text]) }
  });
  assert.deepEqual(Object.keys(handlers).filter(method => method.startsWith('queue.')), []);
  await handlers['session.input']({ id: 'selected', data: 'direct input' });
  assert.deepEqual(writes, [['selected', 'direct input']]);
});

test('account menus follow the served switch capability rather than provider names', async () => {
  const { accountSwitchMenu } = await import('../src/console/account-menu.js');
  const session = { id: 'sample', provider: 'future', switchMethod: 'resume', draftSupported: true,
    switchTargets: [{ id: 'target', label: 'Other account', ready: true }] };
  assert.match(accountSwitchMenu(session, 'panel', () => 'Agent'), /Switch to Other account/);
  assert.equal(accountSwitchMenu({ ...session, provider: 'codex', switchMethod: 'none' }, 'panel', () => 'Codex'), '');
  assert.equal(accountSwitchMenu({ ...session, taskId: 'worker' }, 'panel', () => 'Agent'), '');
});

test('panels: open consoles, grid capacity and covered cells', async () => {
  const { isOpenConsole, isReady, gridSize, gridCapacity, allPanels, coveredSlots, openPanel } = await panelsModule;
  assert.deepEqual(gridSize(undefined), { columns: 3, rows: 3 });
  assert.equal(gridCapacity({ grid: { columns: 4, rows: 2 } }), 8);
  assert.equal(isOpenConsole(null), false);
  assert.equal(isOpenConsole({ alive: true }), true);
  assert.ok(isOpenConsole({ alive: false, restoreError: 'gone' }), 'A failed restore stays open until removed');
  assert.equal(isOpenConsole({ alive: true, dismissed: true }), false);
  assert.equal(isReady({ alive: true, state: 'attention' }), true);
  assert.equal(isReady({ alive: true, state: 'active' }), false);
  const state = {
    grid: { columns: 3, rows: 3 },
    sessions: [{ id: 'wide', slot: 1, width: 2, height: 2, alive: true }, { id: 'hidden', slot: 3, alive: true, hidden: true }, { id: 'ended', slot: 9, alive: false }],
    codePanels: [{ id: 'review', kind: 'review', slot: 7, alive: true }, { id: 'code', kind: 'code', slot: 8, alive: true }]
  };
  assert.deepEqual(allPanels(state).map(item => item.id), ['wide', 'ended', 'review'], 'Hidden sessions and code/web panels stay out of the grid');
  const covered = coveredSlots(state);
  assert.deepEqual([...covered.keys()].sort((a, b) => a - b), [1, 2, 4, 5, 7]);
  assert.equal(covered.get(5).id, 'wide');
  assert.equal(openPanel(state, 'wide').id, 'wide');
  assert.equal(openPanel(state, 'hidden'), null, 'Hiding a console keeps it out of the grid without ending it');
  assert.equal(openPanel(state, 'ended'), null);
});

test('providers: names follow the platform and agent list; legacy limits map to default accounts', async () => {
  const { providerNames, limitAccountId } = await providersModule;
  let state;
  const { providerName, consoleProviders } = providerNames(() => state);
  assert.equal(providerName('shell'), 'PowerShell');
  assert.deepEqual(consoleProviders(), ['codex', 'claude', 'shell', 'custom']);
  state = { platform: 'linux', agents: [{ id: 'kiro', name: 'Kiro' }] };
  assert.equal(providerName('shell'), 'Shell');
  assert.equal(providerName('kiro'), 'Kiro');
  assert.equal(providerName('unknown'), 'unknown');
  assert.deepEqual(consoleProviders(), ['kiro', 'shell', 'custom']);
  assert.equal(limitAccountId({ provider: 'codex', id: 'codex' }), 'codex:default');
  assert.equal(limitAccountId({ provider: 'claude', id: 'claude:account' }), 'claude:default');
  assert.equal(limitAccountId({ provider: 'claude', id: 'claude:other' }), 'claude:other');
  assert.equal(limitAccountId({ provider: 'codex', id: 'x', accountId: 'codex:work' }), 'codex:work');
});

test('format: status badges escape and window labels name their span', async () => {
  const { badge, windowLabel, age, number } = await formatModule;
  assert.match(badge('ready'), />Ready<\/span>$/);
  assert.doesNotMatch(badge('<b>'), /<b>/);
  assert.equal(windowLabel(10080), 'Weekly');
  assert.equal(windowLabel(300), '5-hour');
  assert.equal(windowLabel(120), '2-hour');
  assert.equal(windowLabel(45), '45 min');
  assert.equal(windowLabel(null), 'Usage window');
  assert.equal(age(0), 'Not connected');
  assert.equal(age(Date.now()), 'Just updated');
  assert.equal(number(undefined), '—');
});
