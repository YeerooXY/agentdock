'use strict';
// Navigation and fixture shapes follow the visual checks in scripts/. No Electron IPC is used.
const fs = require('node:fs');
const path = require('node:path');
const { openPage, openResultFolder } = require('../ui-navigation.cjs');
const themes = ['classic', 'blue', 'hot-pink', 'violet', 'void', 'redline', 'cyber', 'icy', 'fiery', 'gamer', 'normal'];
const long = 'Release review project with a very long name and folder path '.repeat(5);
const now = Date.now();
const c = (id, label, prepare = () => {}, setup) => ({ id, label, prepare, setup });
const manual = (id, label, reason) => ({ id, label, manual: true, reason });
const nav = target => async page => openPage(page, target);
const click = selector => async page => page.locator(selector).first().click();
const settings = (target, selector) => async page => { await openPage(page, target); if (selector) await page.locator(selector).scrollIntoViewIfNeeded(); };
const project = (i = 0) => ({ id: `project-${i}`, name: `Project ${i + 1}`, category: 'App', status: 'active', goals: 'Import notes and practice questions.', nextStep: 'Review the import screen', folders: [{ path: 'C:\\Workspace' }], milestones: [], createdAt: now, lastActiveAt: now,
  plan: { revision: 1, brief: {}, research: {}, infrastructure: {}, scope: '', excluded: '', approvals: {}, skipped: {}, proposals: {}, references: [], laterFeatures: [] } });
const result = (i = 0, ext = '.md') => ({ id: `result-${i}`, title: `Review file ${i + 1}`, kind: ext === '.png' ? 'image' : ext === '.js' ? 'code' : 'report', status: 'passed', ext, image: ext === '.png', size: 1024, at: now - i * 1000, consoleKey: 'console-0', consoleName: 'Review console', groupId: `turn-${Math.floor(i / 4)}`, turnId: `turn-${Math.floor(i / 4)}`, summary: 'Synthetic release review file.', project: 'C:\\Workspace', seenAt: null });
function consoles(s, count) { const template = s.sessions[0]; s.sessions = Array.from({ length: count }, (_, i) => ({ ...template, id: `console-${i}`, consoleKey: `console-${i}`, slot: i + 1, width: 1, height: 1, provider: 'codex', purpose: 'agent', name: `Console ${i + 1}`, cwd: 'C:\\Workspace', alive: true, dismissed: false, state: 'ready', launchId: null, projectId: null })); }
function limits(s, count = 2, percent = 38, stale = false) {
  s.usageAccounts = Array.from({ length: count }, (_, i) => ({ id: `codex:account-${i}`, provider: 'codex', label: `Account ${i + 1}`, hasUsage: true }));
  s.accounts = s.usageAccounts.map(x => ({ ...x, profile: true }));
  s.limits = s.usageAccounts.map(x => ({ id: x.id, accountId: x.id, provider: x.provider, name: x.label, source: 'Synthetic fixture', observedAt: now - (stale ? 86400000 : 0), windows: [{ minutes: 300, usedPercent: percent, resetsAt: now + 3600000 }] }));
}
function baseline(base) {
  const s = structuredClone(base);
  Object.assign(s.settings, { setupComplete: true, sidebarCollapsed: false, suggestProjects: false, trimStyle: 'classic', slotNames: {}, slotTrims: {}, usageShown: [], usageHidden: [] });
  Object.assign(s, { mode: 'dashboard', projects: [project()], queues: {}, prompts: [], codePanels: [], codeRevision: 0, ledger: [], messages: [], delegations: [], screenshot: null, sshHosts: [], accountError: null, storageError: null, workspaceError: null });
  consoles(s, 2); limits(s);
  s.shared = { ...s.shared, connections: [], profiles: [], instructions: '', summary: '', instructionSources: [] };
  s.vault = { available: true, entries: [] };
  s.workbench = { results: [], concepts: [], unreadResults: 0, setupRequests: [] };
  s.mobile = { enabled: false, host: '', name: 'Review PC', port: 47831, mode: 'tailscale', interfaces: [], devices: [], push: {}, network: {} };
  s.updates = { current: s.version, checkedAt: now, checking: false, release: null, error: '' };
  s._fixture = { report: { id: 'turn-one', mode: 'turn', at: now, changes: [{ file: 'src/greeting.js', type: 'modified' }], notes: [] }, codeText: 'export function greeting(name) {\n  return `Hello, ${name}!`;\n}\n' };
  return s;
}
const grid = nav('consoles');
const code = async page => {
  await grid(page); await page.locator('[data-code-action=create]').first().click(); await page.locator('.code-panel').waitFor();
  await page.locator('[data-code-caption]').filter({ hasText: /files?$/ }).waitFor();
  if (await page.locator('[data-code-path]').count()) await page.locator('.code-panel .cm-content').waitFor();
};
const plan = async page => { await openPage(page, 'projects'); await page.locator('[data-project-plan]').first().click(); };
const queue = async page => { await grid(page); await page.locator('[data-queue-open]').first().click(); };
const previewResult = async page => {
  await openPage(page, 'results'); await openResultFolder(page); await page.locator('[data-wb=preview]').first().click();
  await page.waitForFunction(() => { const preview = document.querySelector('#result-preview'); return preview && preview.textContent !== 'Loading…'; });
};
const registry = {};
function item(id, main, setup, cases) { registry[id] = { main, setup, cases }; }
item('1.1', '#first-run', async () => {}, [
  ...['missing', 'installed', 'installing', 'error'].map(status => c(status, { missing: 'No agents installed', installed: 'All agents installed', installing: 'Install in progress', error: 'Install failed' }[status], s => { s.settings.setupComplete = false; s.agents.forEach(a => { a.installed = status === 'installed'; a.job = { state: status, error: 'Installation failed. Try again.' }; }); })),
  c('skip', 'Skip optional agents and tools', s => { s.settings.setupComplete = false; }, async page => {
    await page.locator('#first-run-form [name=provider]').selectOption('shell');
    await page.locator('#first-run-form [name=launchNow]').uncheck();
    await page.locator('#first-run-form [name=mobileSetup]').uncheck();
    await page.locator('#first-run-form [type=submit]').click();
    await page.locator('#first-run').waitFor({ state: 'hidden' });
  }),
  c('long', 'Long project folder', s => { s.settings.setupComplete = false; s.settings.consoleDefaults.cwd = 'C:\\Workspace\\' + long; }),
  manual('install-real', 'Install agents and optional tools', 'Installation and discovery require the desktop backend.')
]);
registry['1.1'].cases.find(x => x.id === 'skip').main = '#consoles-page';
item('1.2', '#updates-settings', settings('general-settings', '#updates-settings'), [
  c('current', 'Up to date'), c('available', 'Update available', s => { s.updates.release = { version: '0.6.0-review', size: 150000000 }; }),
  ...['Download failed. Try again.', 'Offline. Check your connection.'].map((error, i) => c(i ? 'offline' : 'download-failed', error, s => { s.updates.error = error; })),
  manual('install', 'Download and install an update', 'Downloading and restarting require Electron and network access.')
]);
item('2.1', '#consoles-page', grid, [c('empty', 'No consoles', s => consoles(s, 0)), c('one', 'One console', s => consoles(s, 1)), c('nine', 'All nine slots full', s => consoles(s, 9)), c('mixed', 'Mixed sizes', s => { s.sessions[0].width = 2; s.sessions[0].height = 2; s.sessions[1].slot = 3; }), c('long', 'Long names and folders', s => s.sessions.forEach(x => { x.name = long; x.cwd += long; })), c('error', 'Console restore error', s => { s.sessions[0].alive = false; s.sessions[0].restoreError = 'Folder unavailable. Choose another folder.'; })]);
item('2.2', '#console-chooser', async page => { await grid(page); await page.locator('.session-card.empty [data-action=new]').first().click({ button: 'right' }); await page.locator('.shell-picker-trigger').click(); }, [c('none', 'No agents installed', s => s.agents.forEach(a => a.installed = false)), c('many', 'Many accounts', s => limits(s, 20)), c('near-limit', 'Account near its limit', s => limits(s, 2, 98)), c('stale', 'Stale account usage', s => limits(s, 2, 80, true)), c('long', 'Long account names', s => s.accounts.forEach(a => a.label = long))]);
item('2.3', '.session-card[data-console-id="console-0"]', grid, [c('long', 'Long name and folder', s => { s.sessions[0].name = long; s.sessions[0].cwd += long; }), ...['active', 'ready', 'attention', 'error', 'ended'].map(status => c(status, `Console status: ${status}`, s => { s.sessions[0].state = status; s.sessions[0].alive = status !== 'ended'; }))]);
item('2.4', '#console-color-dialog', click('[data-frame-slot="1"]'), [...themes.map(theme => c(theme, `Console trim: ${theme}`, s => { s.settings.slotTrims = { 1: theme }; })), c('reset', 'Reset to default', s => { s.settings.slotTrims = {}; })]);
item('2.5', '#consoles-page', grid, [c('mixed', 'Mixed sizes at this window width', s => { s.sessions[0].width = 2; s.sessions[1].slot = 3; }), c('swap', 'Move onto an occupied slot', () => {}, async page => { await page.locator('[data-console-drag="console-0"]').focus(); await page.keyboard.press('Alt+2'); })]);
item('2.6', '#queue-panel', queue, [c('empty', 'Empty queue'), ...[false, true].map(paused => c(paused ? 'paused' : 'twenty', paused ? 'Paused queue' : 'Twenty queued messages', s => { s.queues['console-0'] = { paused, entries: Array.from({ length: 20 }, (_, i) => ({ id: `q-${i}`, text: `Message ${i + 1}: inspect the import screen.`, createdAt: now })) }; })), c('edit', 'Edit, reorder and remove', s => { s.queues['console-0'] = { paused: false, entries: [0, 1, 2].map(i => ({ id: `q-${i}`, text: `Message ${i}`, createdAt: now })) }; }, async page => { await page.locator('[data-queue-move="1"]').first().click(); await page.locator('[data-queue-remove]').first().click(); await page.locator('[data-queue-edit]').first().click(); }), c('long', 'Long queued message', s => { s.queues['console-0'] = { paused: false, entries: [{ id: 'long', text: long.repeat(10), createdAt: now }] }; }), manual('delivery', 'Send after a turn ends; send failure', 'Turn completion and delivery require a real agent process.')]);
item('2.7', '#consoles-page', grid, [c('banner', 'Project suggestion', s => { s.settings.suggestProjects = true; consoles(s, 1); }), ...['stop'].map(action => c(action, action === 'stop' ? "Don't ask again" : 'Dismiss suggestion', s => { s.settings.suggestProjects = true; consoles(s, 1); }, click(`[data-project-${action}]`))), c('long', 'Long console name', s => { s.settings.suggestProjects = true; consoles(s, 1); s.sessions[0].name = long; })]);
item('2.8', '.settings-content', nav('tools'), [c('none', 'No setup requests'), c('several', 'Several setup requests', s => { s.workbench.setupRequests = Array.from({ length: 5 }, (_, i) => ({ id: `setup-${i}`, kind: 'tool', consoleName: 'Review console', config: { id: `tool-${i}`, name: `Tool ${i + 1}`, command: 'synthetic-tool', args: [] } })); }), c('key', 'Key needed', s => { s.workbench.setupRequests = [{ id: 'key', kind: 'key', consoleName: long, config: { id: 'review-key', name: 'Review tool key' } }]; }), manual('apply', 'Apply setup and handle a connection failure', 'Tool startup and credential binding require the backend.')]);
item('2.9', '#consoles-page', grid, [c('none', 'No screenshot'), ...['local', 'wsl', 'ssh'].map(kind => c(kind, `Latest screenshot: ${kind} console`, s => { s._fixture.screenshot = true; s._fixture.destination = kind; if (kind === 'ssh') s.sessions[0].remoteHostId = 'host'; if (kind === 'wsl') s.sessions[0].provider = 'wsl'; })), manual('paste', 'Paste locally, translate WSL path, refuse SSH', 'Clipboard files and path translation require the desktop backend.')]);
item('2.10', '#file-preview', async page => { await grid(page); const row = page.locator('.terminal-instance').first().locator('.xterm-rows > div').filter({ hasText: 'C:\\Workspace\\review.md' }).first(); await row.waitFor(); const box = await row.boundingBox(); await page.mouse.move(box.x + 50, box.y + box.height / 2); await page.waitForTimeout(200); await page.mouse.click(box.x + 50, box.y + box.height / 2); }, [...['text', 'markdown', 'image', 'folder', 'binary', 'large', 'missing'].map(kind => { const test = c(kind, `File preview: ${kind}`, s => { s._fixture.fileKind = kind; }); if (kind === 'missing') test.main = '#toast'; return test; })]);
item('2.11', '.code-panel', code, [c('changes', 'Code and diff'), c('empty', 'No changes', s => { s._fixture.report.changes = []; }), c('hundred', 'One hundred changed files', s => { s._fixture.report.changes = Array.from({ length: 100 }, (_, i) => ({ file: `src/component-${i}.js`, type: 'modified' })); }), c('huge', 'Huge file', s => { s._fixture.codeText = 'const longLine = "' + 'x'.repeat(2000) + '";\n' + 'export const value = 1;\n'.repeat(10000); }), c('private', 'Private files omitted from report', s => { s._fixture.report.notes = ['Private files are hidden.']; }), manual('privacy', 'Verify private files cannot be read', 'The synthetic report cannot verify backend file filtering.')]);
item('2.12', '.ask-agent-dialog', async page => { await code(page); await page.locator('.code-panel .cm-content').waitFor(); await page.locator('.code-panel .cm-content').focus(); await page.keyboard.press('Control+Home'); await page.keyboard.press('Control+Shift+End'); await page.keyboard.press('Control+Shift+A'); }, [c('selection', 'Ask about selected code'), c('busy', 'Queue while console is busy', s => { s.sessions[0].state = 'active'; }), c('long', 'Long code selection', s => { s._fixture.codeText = 'const value = "' + long + '";\n'; }), c('changed', 'File changed since selection', () => {}, async (page, s) => { s._fixture.changedCode = true; await page.locator('.ask-agent-dialog [data-draft]').click(); await page.locator('.ask-agent-dialog [data-stale]').waitFor(); }), c('closed', 'Selected target closed', () => {}, async (page, s) => {
  // Close the selected destination while its source stays open, so the code
  // panel and captured selection survive the session update.
  const destination = s.sessions[1];
  await page.locator('.ask-agent-dialog select').selectOption(destination.id);
  destination.alive = false; destination.state = 'ended';
  await page.evaluate(value => window.fixtureState(value), s);
  await page.waitForFunction(closedId => {
    const select = document.querySelector('.ask-agent-dialog select');
    return select && select.value !== closedId && select.value !== '' && ![...select.options].some(option => option.value === closedId);
  }, destination.id);
})]);
item('2.13', '.web-panel', async page => { await grid(page); await page.locator('[data-web-action=create]').first().click(); }, [c('empty', 'Server not running'), c('wrong-port', 'Wrong port (blocked locally)', s => { s._fixture.webUrl = 'http://127.0.0.1:1/'; }), c('local', 'Local preview in a single grid slot', s => { s._fixture.webUrl = '/__preview'; }), manual('phone', 'Phone width preview', 'The current renderer has no phone-width preview control; review whether to add it or cut this case.')]);
item('2.14', '#ssh-dialog', async page => { await openPage(page, 'devices'); await page.getByRole('button', { name: 'Add SSH host' }).click(); await page.locator('#ssh-form [name=name]').fill('Review host'); await page.locator('#ssh-form [name=host]').fill('review.example.test'); await page.locator('#ssh-form [name=user]').fill('developer'); await page.getByRole('button', { name: 'Scan host identity' }).click(); }, [c('new', 'New host key'), c('changed', 'Changed host key', s => { s._fixture.sshChanged = true; }), c('offline', 'Host offline', s => { s._fixture.sshError = 'Host is offline. Check the address and connection.'; }), manual('connect', 'Connect to a trusted remote console', 'SSH trust, authentication and remote execution require a real backend.')]);
item('2.15', '#consoles-page', grid, [c('expanded', 'Expanded console', () => {}, click('[data-action=toggle-console]')), manual('fullscreen', 'F11 with an expanded console', 'Native fullscreen and titlebar geometry require Electron.'), manual('hud', 'Corner HUD with alerts', 'The HUD uses a separate native window.'), manual('tray', 'Hide to tray and restore', 'The system tray and preserved processes require Electron.')]);
item('2.16', '#consoles-page', grid, [c('help', 'Keyboard shortcut list', s => { s.settings.vimControls = true; }, async page => { await page.keyboard.press('Control+Shift+Space'); await page.keyboard.press('?'); }), ...Object.entries({ c: 'consoles', u: 'usage', a: 'api-settings', t: 'tools', i: 'instructions', s: 'settings' }).map(([key, target]) => { const test = c(`key-${key}`, `Page shortcut: g ${key}`, s => { s.settings.vimControls = true; }, async page => { await page.keyboard.press('Control+Shift+Space'); await page.keyboard.press('g'); await page.keyboard.press(key); await page.locator(['tools', 'instructions', 'settings', 'api-settings'].includes(target) ? '.settings-content' : (target === 'consoles' ? '#consoles-page' : '#content')).waitFor(); }); test.main = ['tools', 'instructions', 'settings', 'api-settings'].includes(target) ? '.settings-content' : (target === 'consoles' ? '#consoles-page' : '#content'); return test; }), c('typing', 'Page keys while typing', s => { s.settings.vimControls = true; }, async page => { await page.locator('.xterm-helper-textarea').first().focus(); await page.keyboard.type('gcgu gagtgi gs'); await page.locator('#consoles-page').waitFor(); })]);
item('2.17', '#explorer-pane', async page => { await grid(page); if (await page.locator('#explorer-pane').isHidden()) await page.locator('#explorer-toggle').click(); await page.locator('#explorer-pane [role=treeitem]').first().waitFor(); }, [c('root', 'Project root listing', s => { s.settings.sidebarCollapsed = false; }), c('expanded', 'Folder expanded', s => { s.settings.sidebarCollapsed = false; }, async page => { await page.locator('#explorer-pane [role=treeitem]').filter({ hasText: 'src' }).first().click(); await page.locator('#explorer-pane [role=treeitem]').filter({ hasText: 'greeting.js' }).first().waitFor(); }), c('filter', 'Filtered by file name', s => { s.settings.sidebarCollapsed = false; }, async page => { await page.locator('#explorer-pane input').first().fill('READ'); })]);
registry['2.16'].cases[0].main = '#vim-help';
item('3.1', '#content', nav('projects'), [c('empty', 'No projects', s => { s.projects = []; }), c('thirty', 'Thirty projects', s => { s.projects = Array.from({ length: 30 }, (_, i) => project(i)); }), c('long', 'Long names and goals', s => { s.projects[0].name = long; s.projects[0].goals = long.repeat(10); })]);
item('3.2', '#project-editor', async page => { await openPage(page, 'projects'); await page.locator('[data-project-edit]').first().click(); }, [c('no-folders', 'No folders', s => { s.projects[0].folders = []; }), ...[false, true].map(done => c(done ? 'done' : 'ten', done ? 'All milestones done' : 'Ten milestones', s => { s.projects[0].milestones = Array.from({ length: 10 }, (_, i) => ({ text: `Milestone ${i + 1}`, done })); })), c('long', 'Long project details', s => { s.projects[0].goals = long.repeat(10); })]);
item('3.3', '#project-plan', plan, [c('empty', 'Empty plan'), c('proposal', 'Waiting proposal with before and after', s => { s.projects[0].plan.proposals.brief = { section: 'brief', agent: 'Review agent', data: { goals: 'Import PDFs and practice questions offline.' } }; }), c('skipped', 'Sections marked Not needed', s => { s.projects[0].plan.skipped = { research: true, infrastructure: true }; }), c('error', 'Plan files could not be saved', s => { s.projects[0].plan.files = { error: 'Project folder is unavailable. Try saving again.' }; })]);
item('3.4', '.plan-side', plan, [c('empty', 'Empty reference board'), c('fifty', 'Fifty reference files', s => { s.projects[0].plan.references = Array.from({ length: 50 }, (_, i) => ({ id: `ref-${i}`, kind: 'file', title: `Reference ${i + 1}.md`, value: `C:\\Workspace\\reference-${i}.md` })); }), c('long', 'Long reference path', s => { s.projects[0].plan.references = [{ id: 'long', kind: 'file', title: long, value: 'C:\\Workspace\\' + long }]; }), manual('broken', 'Broken external link', 'External links are blocked; check the target and recovery in the desktop app.'), manual('drop', 'Drag and drop reference files', 'Native dropped file paths require Electron.')]);
item('4.1', '#content', nav('results'), [c('empty', 'No results'), c('two-hundred', 'Two hundred results, including images, Markdown, code and ZIP', s => { s.workbench.results = Array.from({ length: 200 }, (_, i) => result(i, ['.png', '.md', '.js', '.zip'][i % 4])); }), c('long', 'Long result titles', s => { s.workbench.results = [{ ...result(), title: long, summary: long }]; })]);
item('4.2', '.wb-dialog', previewResult, [c('image', 'Large image', s => { s.workbench.results = [result(0, '.png')]; }), c('report', 'Long report', s => { s.workbench.results = [result()]; s._fixture.resultText = '# Review report\n\n' + (long + '\n\n').repeat(300); }), c('deleted', 'Deleted file', s => { s.workbench.results = [result()]; s._fixture.resultError = 'File no longer exists. Restore it or remove this result.'; })]);
item('4.3', '#content', nav('results'), [c('finished', 'Finished review with findings', s => { s.workbench.results = [{ ...result(), title: 'Website review', reviewId: 'review-one', status: 'changes-requested' }]; s._fixture.resultText = '# Website review\n\n- [x] Navigation works\n- [ ] Form labels need review\n'; }, previewResult), manual('running', 'Review running', 'Live review progress is maintained by the review backend, not the gallery fixture.'), manual('interrupted', 'Review interrupted', 'Interrupt and resume require a real review process.')]);
registry['4.3'].cases[0].main = '.wb-dialog';
item('5.1', '.account-switch-settings', nav('usage'), [c('unknown', 'Unknown usage', s => { s.limits = []; s.usageAccounts.forEach(a => a.hasUsage = false); s.settings.usageShown = s.usageAccounts.map(a => a.id); }), c('stale', 'Stale usage', s => limits(s, 2, 50, true)), c('nearly-full', 'Nearly full account', s => limits(s, 2, 99)), c('many', 'Many accounts', s => limits(s, 20)), c('long', 'Long account labels', s => { s.accounts.forEach(a => a.label = long); s.usageAccounts.forEach(a => a.label = long); s.limits.forEach(a => a.name = long); }), c('offline', 'Usage refresh failed', s => { s.accountError = 'Offline. Usage could not be refreshed.'; limits(s, 2, 50, true); })]);
item('5.2', '.ledger-panel', settings('usage', '.ledger-panel'), [c('empty', 'No API requests'), c('thousand', 'One thousand requests (latest 100 shown)', s => { s.ledger = Array.from({ length: 1000 }, (_, i) => ({ id: `request-${i}`, at: now - i * 1000, provider: 'openai', model: 'synthetic-model', usage: { input: 120, output: 30 }, status: i % 7 ? 'completed' : 'failed' })); }), c('long', 'Long model name', s => { s.ledger = [{ at: now, provider: 'openai', model: long, status: 'failed' }]; })]);
item('5.3', '.delegation-settings', settings('usage', '.delegation-settings'), ['off', 'on', 'running', 'failed', 'stopped'].map(status => c(status, `Cross-agent reviews: ${status}`, s => { s.settings.delegationEnabled = status !== 'off'; s.settings.delegationProviders = ['claude', 'codex']; s.delegations = ['off', 'on'].includes(status) ? [] : [{ id: 'review', state: status, reviewer: { label: 'Claude Code' }, why: 'Synthetic reviewer selection.', consoleName: 'Review console', startedAt: now, error: status === 'failed' ? 'Reviewer exited without an answer.' : '' }]; })));
item('7.1', '.settings-content', nav('general-settings'), [false, true].map(on => c(on ? 'on' : 'off', `All general switches ${on ? 'on' : 'off'}`, s => { for (const key of ['hudAlwaysOnTop', 'notifications', 'confirmConsoleEnd', 'keepAwakeWhileWorking', 'restoreConsoles', 'codexScrollback', 'autoSaveResults', 'suggestProjects']) s.settings[key] = on; s.settings.agentPermissions = on ? 'unrestricted' : 'default'; })));
item('7.2', '.settings-content', nav('appearance'), [c('default', 'Appearance settings with reduced motion'), ...themes.map(theme => c(`theme-${theme}`, `Preview theme: ${theme}`, s => { s._fixture.appearanceTheme = theme; }, async (page, s) => {
  const theme = s._fixture.appearanceTheme;
  // The radio itself ignores pointer events; its visible label is the real target.
  await page.locator(`.theme-choice[data-frame="${theme}"]`).click();
  await page.waitForFunction(value => document.body.dataset.trim === value && document.querySelector(`.theme-choice[data-frame="${value}"] input`)?.checked, theme);
})), ...['static', 'breathe', 'wave', 'spectrum', 'reactive'].map(lighting => c(lighting, `Lighting: ${lighting}`, s => { s.settings.lighting = lighting; })), c('off', 'Textures, stars and openings off', s => Object.assign(s.settings, { themeTextures: false, starDensity: 0, launchEffect: false, ambientMotion: false })), c('all', 'Textures, stars and openings enabled with reduced motion', s => Object.assign(s.settings, { themeTextures: true, starDensity: 4, launchEffect: true, ambientMotion: true }))]);
item('7.3', '.settings-content', nav('console-settings'), [c('defaults', 'Console defaults'), c('long', 'Long default folder and command', s => { s.settings.consoleDefaults.cwd += long; s.settings.consoleDefaults.command = long; }), manual('fonts', 'Odd fonts; huge and tiny terminal text', 'Fonts are fixed in the renderer; check OS font fallback and terminal text-size controls on actual desktop systems.')]);
item('7.4', '.mobile-setup', async page => { await openPage(page, 'devices'); await page.locator('[data-mobile=open]').click(); }, ['missing', 'found', 'waiting', 'linked', 'revoked'].map(status => c(status, { missing: 'No Tailscale', found: 'Tailscale found', waiting: 'Waiting for phone', linked: 'Phone connected', revoked: 'Phone revoked' }[status], s => { s.mobile.enabled = ['waiting', 'linked', 'revoked'].includes(status); s.mobile.interfaces = status === 'missing' ? [] : [{ name: 'Tailscale', address: '100.101.102.103', tailscale: true, local: false }]; s.mobile.devices = status === 'linked' ? [{ id: 'phone', name: 'Review phone', connected: true, alerts: false }] : []; })));
item('7.5', '.settings-content', nav('api-settings'), [c('none', 'No key'), manual('invalid', 'Invalid key', 'Key validation requires the provider; no network or model requests are made.')]);
item('7.6', '.settings-content', nav('tools'), [c('missing', 'Keys missing'), c('saved', 'Saved key metadata', s => { s.vault.entries = [{ id: 'review-key', label: 'Review tool', provider: 'meshy', createdAt: now }]; const tool = s.integrations.find(x => x.id === 'meshy'); if (tool) tool.keyId = 'review-key'; }), c('failed', 'Tool failed', s => { s.integrations.forEach(x => { x.ready = false; x.job = { state: 'error', error: 'Tool failed to start. Check its setup.' }; }); }), c('long', 'Long tool name', s => { s.integrations[0].name = long; })]);
item('7.7', '.settings-content', nav('instructions'), [c('empty', 'Empty shared instructions', s => { s.shared.instructions = ''; }), c('long', 'Very long instructions', s => { s.shared.instructions = ('Use the project folder and report test results.\n').repeat(1000); })]);
item('8.1', '#consoles-page', grid, [c('states', 'Ready, needs you and error states', s => { consoles(s, 3); ['ready', 'attention', 'error'].forEach((state, i) => s.sessions[i].state = state); }), c('console', 'Completion alert opens its console', () => {}, async (page, s) => { await page.evaluate(id => window.fixtureNotice({ kind: 'ready', sessionId: id }), s.sessions[0].id); await page.locator('.console-expanded[data-console-id="console-0"]').waitFor(); }), c('result', 'Completion alert opens its result', s => { s.workbench.results = [result()]; }, async page => { await page.evaluate(() => window.fixtureNotice({ kind: 'ready', destination: 'results', resultId: 'result-0' })); await page.locator('.wb-dialog').waitFor(); }), manual('many', 'Many completion alerts at once', 'Native notification stacking and click routing require Electron and the OS.')]);
registry['8.1'].cases.find(x => x.id === 'result').main = '.wb-dialog';

// Ended sessions leave the grid. Capture the empty slot rather than wait for a removed header.
registry['2.3'].cases.find(x => x.id === 'ended').main = '#consoles-page';
Object.assign(registry['2.4'].cases.find(x => x.id === 'reset'), {
  prepare: s => { s.settings.slotTrims = { 1: 'fiery' }; }, main: '#consoles-page',
  setup: async page => { await page.locator('#console-color-dialog [value=default]').check(); await page.locator('#console-color-dialog [type=submit]').click(); await page.locator('#console-color-dialog').waitFor({ state: 'hidden' }); }
});
registry['2.7'].cases.push(manual('dismiss', 'Dismiss suggestion', 'The current renderer only offers Set up project and Don\'t ask again; review whether to add Dismiss or cut this case.'));
registry['2.7'].main = '#app'; // Includes the banner, which sits outside the console grid.

registry['2.5'].cases.push(
  c('drag', 'Drag onto an occupied slot', () => {}, async page => {
    await page.locator('[data-console-drag="console-0"]').dragTo(page.locator('[data-console-drag="console-1"]'));
    await page.locator('.session-card[data-console-id="console-0"][data-slot="2"]').waitFor();
  }),
  c('resize', 'Resize across empty slots', s => { s.sessions[1].slot = 7; }, async page => {
    const handle = page.locator('.session-card[data-console-id="console-0"] [data-resize-edge="se"]');
    const from = await handle.boundingBox(), target = await page.locator('.session-card[data-slot="5"]').boundingBox();
    if (!from || !target) throw new Error('Resize handle or destination is missing');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down(); await page.mouse.move(target.x + target.width - 5, target.y + target.height - 5, { steps: 8 });
    await page.locator('.console-resize-feedback:not([hidden])').waitFor();
    await page.mouse.up();
    await page.waitForFunction(() => !document.body.classList.contains('console-resizing'));
  })
);
// Keep queue delivery evidence as well as the open composer state.
registry['2.12'].cases.push(c('queued', 'Queue selected code while busy', s => { s.sessions[0].state = 'active'; }, async page => {
  await page.locator('.ask-agent-dialog [data-queue]').click();
  await page.locator('.ask-agent-dialog').waitFor({ state: 'detached' });
  await page.locator('[data-queue-open]').first().click();
  await page.locator('#queue-panel .queue-list li[data-entry]').waitFor();
}));
registry['2.12'].cases.at(-1).main = '#queue-panel';
// The composer already positions itself in the viewport. A capture-time scroll can
// dismiss it in WebKit, especially after closing its destination removes a terminal.
registry['2.12'].cases.find(x => x.id === 'closed').scrollMain = false;
registry['2.15'].cases.push(c('f11-renderer', 'F11 with expanded console: renderer state', () => {}, async page => {
  await page.locator('[data-action=toggle-console]').first().click();
  await page.locator('.session-card.console-expanded').waitFor(); await page.keyboard.press('F11');
  await page.waitForFunction(() => !document.body.classList.contains('is-fullscreen'));
}));
const hudCase = c('hud-renderer', 'HUD with alerts: renderer state', s => { s.sessions[0].state = 'attention'; }, async page => {
  await page.locator('[data-action=hud]').click(); await page.locator('#hud').waitFor();
});
hudCase.main = '#hud'; registry['2.15'].cases.push(hudCase);
const missingNotice = c('missing', 'Alert for a removed result', () => {}, async page => {
  await page.evaluate(() => window.fixtureNotice({ kind: 'ready', destination: 'results', resultId: 'removed-result' }));
  await page.locator('#toast.visible').waitFor();
});
missingNotice.main = '#toast'; registry['8.1'].cases.push(missingNotice);
registry['7.4'].cases.push(manual('pair-real', 'Pair, reconnect and revoke a phone', 'Tailscale transport and credential revocation need the real desktop and phone apps.'));
registry['7.3'].cases.find(x => x.id === 'fonts').label = 'Font fallback on desktop systems';
registry['7.3'].cases.find(x => x.id === 'fonts').reason = 'The renderer uses a fixed font list; OS font fallback needs real Windows and macOS systems.';
for (const [id, step, count] of [['tiny', -1, 4], ['huge', 1, 10]]) {
  const test = c(id, `${id === 'tiny' ? 'Smallest' : 'Largest'} console text`, () => {}, async page => {
    await grid(page);
    for (let i = 0; i < count; i++) await page.locator(`[data-text-size="${step}"][data-id="console-0"]`).first().click();
  });
  test.main = '.session-card[data-console-id="console-0"]'; registry['7.3'].cases.push(test);
}
// Common data extremes for pages whose own inventory cases do not cover them.
for (const id of ['3.1', '3.2', '4.1', '7.1', '7.2', '7.3', '7.5', '7.7']) {
  const test = c('storage-error', 'Local settings or data unavailable', s => { s.storageError = 'Local data could not be loaded. Close Paddock and check folder access.'; });
  test.main = '#content'; registry[id].cases.push(test);
}

// The inventory is the source of order, titles and descriptions. Fail on additions without coverage.
const inventory = fs.readFileSync(path.resolve(__dirname, '../../docs/release-inventory.md'), 'utf8');
const rows = [...inventory.matchAll(/^\|\s*([1-8]\.\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|/gm)];
const items = rows.map(([, id, title, description]) => {
  if (!registry[id]) throw new Error(`Inventory item ${id} has no release-check entry`);
  const cases = registry[id].cases;
  if (!cases.length || new Set(cases.map(x => x.id)).size !== cases.length) throw new Error(`Missing or duplicate cases for ${id}`);
  for (const test of cases) if (test.manual ? !test.reason : typeof test.prepare !== 'function') throw new Error(`Incomplete case ${id}/${test.id}`);
  return { id, title: title.trim(), description: description.trim(), ...registry[id] };
});
if (items.length !== Object.keys(registry).length || new Set(items.map(x => x.id)).size !== items.length) throw new Error('Release inventory and item registry differ');
module.exports = { items, baseline };
