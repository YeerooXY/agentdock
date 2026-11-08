// Settings categories. General, Appearance and Consoles render here; Agents and
// Tools come from their own controllers. Inputs with data-setting save on change.
import { escapeHtml as escape } from '../html-escape.js';
import { settingsShell } from '../settings-ui.js';
import { openConsoleEffect } from '../console-effects.js';
import { consoleTheme, frameStyles as themeChoices, lightingStyles, starLevels } from '../console-themes.js';
import { icon } from '../ui/icons.js';
import { pageHeading } from '../ui/format.js';
import { starLevel } from '../ui/theme-sync.js';
import { gridSize } from '../console/panels.js';

// Panels created after this controller are read through getters: remoteHosts, phone, updates.
export function settingsPage({ getState, getPage, call, toast, providerName, consoleProviders, appearance, accounts, tools, panels, submitForm }) {
  const $ = selector => document.querySelector(selector);

  function launchDefaults() {
    const state = getState(), defaults = state.settings.consoleDefaults;
    return `<form id="console-defaults-form" class="surface"><h2>Console defaults</h2><div class="form-pair"><label>Agent or shell<select name="provider">${consoleProviders().map(provider => `<option value="${provider}" ${defaults.provider === provider ? 'selected' : ''}>${providerName(provider)}</option>`).join('')}</select></label><label id="default-permissions">Permissions<select name="permissions" data-setting="agentPermissions"><option value="unrestricted" ${state.settings.agentPermissions === 'unrestricted' ? 'selected' : ''}>Unrestricted</option><option value="default" ${state.settings.agentPermissions !== 'unrestricted' ? 'selected' : ''}>Agent defaults</option></select></label></div><label>Startup folder<div class="folder-input"><input name="cwd" required value="${escape(defaults.cwd)}"><button type="button" data-action="pick-folder" aria-label="Choose startup folder">${icon('folder')}</button></div></label><label>Name <span class="optional">optional</span><input name="name" maxlength="64" value="${escape(defaults.name)}" placeholder="Uses the folder name"></label><label id="default-command">Custom command<textarea name="command" rows="3" maxlength="4000" spellcheck="false" placeholder="The command to run">${escape(defaults.command)}</textarea></label><p id="default-provider-hint" class="field-hint"></p><p class="form-error" role="alert"></p><button type="submit" class="primary">Save defaults</button></form>`;
  }
  function baseSettings() {
    const state = getState();
    const installed = (state.agents || []).map(agent => '<div class="connection-row"><span>' + escape(agent.name) + '</span><span>' + (agent.installed ? 'Installed' : 'Not installed') + '</span><button class="subtle" data-docs="' + agent.id + '">Guide</button></div>').join('');
    return pageHeading('', 'Settings', '') + '<div class="settings-layout"><section class="surface"><h2>Desktop</h2><label class="toggle-row"><span><strong>Keep HUD above other apps</strong><small>Other windows can cover the HUD when this is off.</small></span><input type="checkbox" data-setting="hudAlwaysOnTop" ' + (state.settings.hudAlwaysOnTop ? 'checked' : '') + '></label><label class="toggle-row"><span><strong>Notify when an agent needs you</strong></span><input type="checkbox" data-setting="notifications" ' + (state.settings.notifications ? 'checked' : '') + '></label><label class="toggle-row"><span><strong>Confirm before ending a console</strong><small>Turn off to end or remove the selected console without a prompt.</small></span><input type="checkbox" data-setting="confirmConsoleEnd" ' + (state.settings.confirmConsoleEnd !== false ? 'checked' : '') + '></label><label class="toggle-row"><span><strong>Tasks per project</strong><small>The most delegated tasks and reviews that run together in each project. Tasks on the same current branch still run one at a time.</small></span><select data-setting="maxParallelTasks">' + Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${(state.settings.maxParallelTasks || 5) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('') + '</select></label><label class="toggle-row"><span><strong>Keep PC awake while agents work</strong><small>Your screen can still turn off.</small></span><input type="checkbox" data-setting="keepAwakeWhileWorking" ' + (state.settings.keepAwakeWhileWorking ? 'checked' : '') + '></label></section><section class="surface"><div class="section-label"><h2>Agents</h2><button class="primary" data-action="agent-setup">Set up agents</button></div>' + installed + '<button class="secondary danger" data-action="quit">Quit Paddock</button></section></div>';
  }
  function shortcutSettings() {
    return '<section class="surface"><h2>Shortcuts</h2><div class="shortcut-row"><span>Show or collapse</span><kbd>Ctrl Alt Space</kbd></div><div class="shortcut-row"><span>Open a console</span><kbd>Ctrl Alt 1-9</kbd></div><div class="shortcut-row"><span>Restore expanded console</span><kbd>Ctrl Shift Enter</kbd></div><p class="field-hint">Close hides Paddock in the system tray. Consoles keep running. Use Quit to stop the app.</p></section>';
  }
  function startupSettings() {
    const state = getState();
    return `<section class="surface"><h2>Startup</h2><label class="toggle-row"><span><strong>Restore previous consoles</strong><small>${state.safeMode ? 'Restart normally to change this setting.' : 'Reopen your panels and folders. Saved agent chats resume; shells and custom commands restart.'}</small></span><input type="checkbox" data-setting="restoreConsoles" ${state.settings.restoreConsoles ? 'checked' : ''} ${state.safeMode ? 'disabled' : ''}></label><label class="toggle-row"><span><strong>Keep scrollback in Codex consoles</strong><small>Codex runs inline, so you can scroll up and select text to copy. Applies to Codex consoles opened after the change.</small></span><input type="checkbox" data-setting="codexScrollback" ${state.settings.codexScrollback !== false ? 'checked' : ''}></label><p id="workspace-error" class="form-error" role="alert">${escape(state.workspaceError || '')}</p></section>`;
  }
  function resultsSettings() {
    return `<section class="surface"><h2>Results</h2><p class="field-hint">Agents save the documents, images, designs, reports and exports you ask them to create. Add other files from Results.</p><label class="toggle-row"><span><strong>Also capture file changes</strong><small>Copy code diffs and changed images after each turn.</small></span><input type="checkbox" data-setting="autoSaveResults" ${getState().settings.autoSaveResults === true ? 'checked' : ''}></label><p class="field-hint">Optional. Turning this off stops current captures. Requested outputs and files you add are still saved.</p></section>`;
  }
  function projectSettings() {
    const settings = getState().settings, worker = settings.knowledgeWorker;
    const candidates = (getState().accounts || []).filter(account => ['claude', 'antigravity'].includes(account.provider));
    const choices = [...candidates.map(account => ({ id: account.id, label: account.label || account.provider })), { id: 'opencode:strata', label: 'Strata (local)' }];
    if (worker && !choices.some(account => account.id === worker.accountId)) choices.push({ id: worker.accountId, label: worker.accountId });
    const workerForm = `<details><summary>Documentation worker</summary><form id="knowledge-worker-form"><label>Account<select name="accountId" required><option value="">Choose account</option>${choices.map(account => `<option value="${escape(account.id)}" ${worker?.accountId === account.id ? 'selected' : ''}>${escape(account.label)}</option>`).join('')}</select></label><label>Native model<input name="model" maxlength="120" required value="${escape(worker?.model || '')}" placeholder="Model ID from your agent"></label><label>Allowance type<select name="funding" required><option value="">Choose allowance</option>${[['included', 'Included subscription'], ['free', 'Free allocation'], ['local', 'Local model']].map(([value, label]) => `<option value="${value}" ${worker?.funding === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p class="field-hint">Automatic maintenance permits up to four attempts per hour on this route. No paid API fallback. Unknown or exhausted allowance pauses dispatch.</p><p class="form-error" role="alert"></p><button type="submit" class="secondary">Save worker</button><p id="knowledge-worker-status" role="status" tabindex="-1">${worker ? 'Documentation worker saved.' : 'Choose a worker before enabling automatic maintenance.'}</p></form></details>`;
    return `<section class="surface" id="project-settings"><h2>Projects</h2><label class="toggle-row"><span><strong>Suggest project setup</strong><small>Ask when a chat has no project. “Don't ask again” turns this off.</small></span><input type="checkbox" data-setting="suggestProjects" ${getState().settings.suggestProjects !== false ? 'checked' : ''}></label><label class="toggle-row"><span><strong>Project knowledge</strong><small>On demand allows local inventory and saved notes. Automatic also updates notes after managed changes, using your selected model allowance.</small></span><select data-setting="knowledgeMode"><option value="off" ${getState().settings.knowledgeMode === 'off' ? 'selected' : ''}>Off</option><option value="read" ${getState().settings.knowledgeMode === 'read' ? 'selected' : ''}>On demand</option><option value="automatic" ${settings.knowledgeMode === 'automatic' ? 'selected' : ''} ${worker ? '' : 'disabled'}>Automatic</option></select></label>${workerForm}<label class="toggle-row"><span><strong>Resolve verified tasks automatically</strong><small>Record successful execution without an Accept action. Isolated publication still requires current checks.</small></span><input type="checkbox" data-setting="autoResolveTasks" ${settings.autoResolveTasks !== false ? 'checked' : ''}></label><button class="subtle" data-page="projects">View project progress ${icon('arrow')}</button></section>`;
  }
  function appearanceSettings() {
    const state = getState();
    const options = (choices, selected) => choices.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
    const theme = state.settings.trimStyle || 'classic', stars = starLevel(state.settings);
    return `<section class="surface"><h2>Theme</h2><p class="field-hint">Colors the sidebar, buttons, settings and every console. Each console can still use its own theme: click the color dot in its header.</p>
    <fieldset class="theme-choices"><legend class="sr-only">Theme</legend>${themeChoices.map(([id, label]) => `<label class="theme-choice" data-frame="${id}"><input type="radio" name="theme" data-setting="trimStyle" value="${id}" ${id === theme ? 'checked' : ''}><span class="theme-chip" aria-hidden="true"></span><span><strong>${label}</strong><small>${consoleTheme(id).detail}</small></span></label>`).join('')}</fieldset>
    <div class="settings-theme-preview">${appearance.preview(theme)}</div></section>
  <section class="surface"><h2>Lighting</h2>
    <label>Effect<select data-setting="lighting">${options(lightingStyles, state.settings.lighting || 'static')}</select></label>
    <p class="field-hint">Wave sends one color wave across every console and the sidebar edge. Reactive lights a console when you type in it or it prints output.</p>
    <label>Speed<select data-setting="lightingSpeed">${options([['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']], state.settings.lightingSpeed || 'normal')}</select></label>
    <label>Trim width<select data-setting="trimWidth">${options([1, 2, 3, 4, 6].map(value => [String(value), `${value} px`]), String(state.settings.trimWidth || 1))}</select></label>
  </section>
  <section class="surface"><h2>Sky</h2>
    <label class="star-scale">Stars <output id="star-level-name">${starLevels[stars]}</output><input type="range" min="0" max="4" step="1" value="${stars}" data-setting="starDensity" aria-valuetext="${starLevels[stars]}"></label>
    <p class="field-hint">More stars are brighter. Arctic shows snow, Inferno embers and Cyber falling data. Console apps can cover them with their own backgrounds.</p>
    <label class="toggle-row"><span><strong>Theme textures</strong><small>Painted backgrounds behind each console, such as frost for Arctic and lava for Inferno.</small></span><input type="checkbox" data-setting="themeTextures" ${state.settings.themeTextures !== false ? 'checked' : ''}></label>
    <label class="toggle-row"><span><strong>Ambient motion</strong><small>Drifting stars, shooting stars and lighting effects.</small></span><input type="checkbox" data-setting="ambientMotion" ${state.settings.ambientMotion !== false ? 'checked' : ''}></label>
  </section>
  <section class="surface"><h2>Consoles</h2>
    <label class="toggle-row"><span><strong>Console animations</strong><small>Theme openings and session effects.</small></span><input type="checkbox" data-setting="launchEffect" ${state.settings.launchEffect !== false ? 'checked' : ''}></label>
    <label class="toggle-row"><span><strong>Blink cursor</strong></span><input type="checkbox" data-setting="cursorBlink" ${state.settings.cursorBlink ? 'checked' : ''}></label>
  </section>`;
  }
  function gridSettings() {
    return `<form id="grid-form" class="surface"><h2>Console grid</h2><div class="form-pair">${[['columns','Columns'],['rows','Rows']].map(([name,label]) => `<label>${label}<input name="${name}" type="number" min="2" max="8" value="${gridSize(getState())[name]}" required></label>`).join('')}</div><p class="field-hint">A full grid makes room or grows when you add a console. Up to 64 panels.</p><p class="form-error" role="alert"></p><button type="submit" class="primary">Apply grid</button></form>`;
  }
  function keyboardSettings() {
    return `<section class="surface"><h2>Keyboard</h2><div class="shortcut-row"><span>New console</span><kbd>Ctrl Shift N</kbd></div><p class="field-hint">Right-click + to choose a name, agent or folder.</p><label class="toggle-row"><span><strong>Vim controls</strong><small>Use h/j/k/l to move around Paddock.</small></span><input type="checkbox" data-setting="vimControls" ${getState().settings.vimControls ? 'checked' : ''}></label><p class="field-hint">Ctrl+Shift+Space returns control to Paddock. Press i to type in a console.</p><button class="subtle" data-action="vim-help">View shortcuts</button></section>`;
  }

  function render() {
    const page = getPage(), state = getState();
    const base = document.createElement('template'); base.innerHTML = baseSettings();
    const sections = [...base.content.querySelectorAll('.settings-layout > .surface')];
    let content;
    if (page === 'appearance') content = appearanceSettings();
    else if (page === 'console-settings') content = '<div class="settings-column">' + launchDefaults() + keyboardSettings() + '</div><div class="settings-column">' + gridSettings() + (sections[1]?.outerHTML || '') + '</div>';
    else if (page === 'agent-settings') content = accounts.render();
    else if (page === 'devices') content = (panels.remoteHosts()?.html() || '') + (panels.phone()?.renderSettings() || '');
    else if (page === 'api-settings') content = tools.renderApis();
    else if (page === 'tools') content = tools.renderTracked();
    else if (page === 'instructions') content = tools.renderInstructions();
    else content = '<div class="settings-general-columns"><div class="settings-column">' + (sections[0]?.outerHTML || '') + shortcutSettings() + '</div><div class="settings-column">' + startupSettings() + projectSettings() + resultsSettings() + '</div></div>' + (panels.updates()?.render() || '');
    return settingsShell(page, `<div class="settings-layout${page === 'console-settings' ? ' settings-console-grid' : ''}">${content}</div>`, icon('close'), state.settings.trimStyle || 'classic');
  }
  function launchDefaultsFields() {
    const form = $('#console-defaults-form'); if (!form) return;
    const state = getState(), provider = form.elements.provider.value;
    $('#default-command').hidden = provider !== 'custom';
    $('#default-permissions').hidden = state.agents?.find(x => x.id === provider)?.consoleFeatures?.permissions !== true;
    $('#default-provider-hint').textContent = provider === 'claude' ? state.capabilities.claude ? 'Claude Code, ' + state.capabilities.claudeLocation : 'Claude Code was not found.' : provider === 'custom' ? 'Shared files: {instructions} and {mcp_config}.' : '';
  }
  function mount() { if (getPage() === 'console-settings') launchDefaultsFields(); }

  document.addEventListener('change', async event => {
    const input = event.target;
    if (input.form?.getAttribute('id') === 'console-defaults-form' && input.name === 'provider') launchDefaultsFields();
    if (input.dataset.setting) {
      const checkbox = input.type === 'checkbox', key = input.dataset.setting, wasFocused = document.activeElement === input;
      const previous = getState().settings[key] ?? (checkbox ? !input.checked : input.value);
      input.disabled = true;
      try { await call('settings', { [key]: checkbox ? input.checked : input.value }); }
      catch (error) { if (checkbox) input.checked = previous; else input.value = previous; toast(error.message, true); }
      finally {
        input.disabled = false;
        if (wasFocused && input.isConnected && document.activeElement === document.body) input.focus({ preventScroll: true });
      }
    }
  });
  document.addEventListener('input', event => {
    const input = event.target;
    if (input.dataset.setting === 'starDensity') { const name = starLevels[Number(input.value)] || ''; $('#star-level-name').textContent = name; input.setAttribute('aria-valuetext', name); }
  });

  function click(button) {
    if (!button.matches('[data-settings-replay]')) return false;
    const preview = $('.settings-content .console-theme-preview'); if (preview && getState().settings.launchEffect !== false) openConsoleEffect(preview);
    return true;
  }
  const submits = {
    'knowledge-worker-form': (form, data) => {
      const hadFocus = form.contains(document.activeElement);
      if (hadFocus) { const status = form.querySelector('#knowledge-worker-status'); status.textContent = 'Saving worker...'; status.focus({ preventScroll: true }); }
      return submitForm(form, async () => {
        await call('settings', { knowledgeWorker: { accountId: data.accountId, model: data.model, funding: data.funding } });
        const status = document.querySelector('#knowledge-worker-status'); if (status) status.textContent = 'Documentation worker saved.';
        const option = document.querySelector('[data-setting="knowledgeMode"] option[value="automatic"]'); if (option) option.disabled = false;
      }, { onDone: () => {
        const live = document.querySelector('#knowledge-worker-form'), submit = live?.querySelector('[type="submit"]');
        if (submit) submit.disabled = false;
        if (hadFocus && submit && (document.activeElement === document.body || document.activeElement?.id === 'knowledge-worker-status')) {
          const details = live.closest('details'); if (details) details.open = true;
          submit.focus({ preventScroll: true });
        }
      } });
    },
    'grid-form': (form, data) => submitForm(form, async () => {
      form.querySelector('.form-error').textContent = '';
      await call('grid.configure', { columns: Number(data.columns), rows: Number(data.rows) }); toast('Grid updated.');
    }),
    'console-defaults-form': (form, data) => submitForm(form, async () => {
      form.querySelector('.form-error').textContent = '';
      const { permissions, ...consoleDefaults } = data;
      await call('settings', { consoleDefaults, agentPermissions: permissions }); toast('Defaults saved.');
    })
  };
  return { render, mount, click, submits };
}
