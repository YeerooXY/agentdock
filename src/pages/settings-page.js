// Settings categories. General, Appearance and Consoles render here; Agents and
// Tools come from their own controllers. Inputs with data-setting save on change.
import { escapeHtml as escape } from '../html-escape.js';
import { accountMark } from '../account-identity.js';
import { settingsShell } from '../settings-ui.js';
import { openConsoleEffect } from '../console-effects.js';
import { frameStyles as themeChoices, lightingStyles, starLevels } from '../console-themes.js';
import { icon } from '../ui/icons.js';
import { pageHeading } from '../ui/format.js';
import { starLevel } from '../ui/theme-sync.js';
import { gridSize } from '../console/panels.js';

// Panels created after this controller are read through getters: remoteHosts, phone, updates.
export function settingsPage({ getState, getPage, call, toast, providerName, consoleProviders, appearance, accounts, tools, panels, submitForm }) {
  const $ = selector => document.querySelector(selector);
  let focusGridCell = null, focusAgentId = null;

  function launchDefaults() {
    const state = getState(), defaults = state.settings.consoleDefaults;
    return `<form id="console-defaults-form" class="surface"><h2>Console defaults</h2><div class="form-pair"><label>Agent or shell<select name="provider">${consoleProviders().map(provider => `<option value="${provider}" ${defaults.provider === provider ? 'selected' : ''}>${providerName(provider)}</option>`).join('')}</select></label><label id="default-permissions">Permissions<select name="permissions" data-setting="agentPermissions"><option value="unrestricted" ${state.settings.agentPermissions === 'unrestricted' ? 'selected' : ''}>Unrestricted</option><option value="default" ${state.settings.agentPermissions !== 'unrestricted' ? 'selected' : ''}>Agent defaults</option></select></label></div><label>Startup folder<div class="folder-input"><input name="cwd" required value="${escape(defaults.cwd)}"><button type="button" data-action="pick-folder" aria-label="Choose startup folder">${icon('folder')}</button></div></label><label>Name <span class="optional">optional</span><input name="name" maxlength="64" value="${escape(defaults.name)}" placeholder="Uses the folder name"></label><label id="default-command">Custom command<textarea name="command" rows="3" maxlength="4000" spellcheck="false" placeholder="The command to run">${escape(defaults.command)}</textarea></label><p id="default-provider-hint" class="field-hint"></p><p class="form-error" role="alert"></p><button type="submit" class="primary">Save defaults</button></form>`;
  }
  function desktopSettings() {
    const state = getState();
    return '<section class="surface"><h2>Desktop</h2><label class="toggle-row"><span><strong>Notify when an agent needs you</strong></span><input type="checkbox" data-setting="notifications" ' + (state.settings.notifications ? 'checked' : '') + '></label><label class="toggle-row"><span><strong>Confirm before ending a console</strong><small>Turn off to end or remove the selected console without a prompt.</small></span><input type="checkbox" data-setting="confirmConsoleEnd" ' + (state.settings.confirmConsoleEnd !== false ? 'checked' : '') + '></label><label class="toggle-row"><span><strong>Keep PC awake while agents work</strong><small>Your screen can still turn off.</small></span><input type="checkbox" data-setting="keepAwakeWhileWorking" ' + (state.settings.keepAwakeWhileWorking ? 'checked' : '') + '></label></section>';
  }
  function installedAgents() {
    const all = getState().agents || [];
    const installed = all.filter(agent => agent.installed), available = all.filter(agent => !agent.installed);
    const agentRow = agent => {
      const job = agent.job, busy = job?.state === 'installing' || job?.state === 'queued';
      const sub = job?.state === 'error' ? escape(job.error) : job?.state === 'installing' ? 'Installing…' : job?.state === 'queued' ? 'Waiting…' : agent.installed ? 'Ready on this PC' : !agent.installable && agent.requirement ? escape(agent.requirement) : 'Available to install';
      return `<div class="agent-row" data-agent-row="${escape(agent.id)}">${accountMark(agent.id)}<div class="agent-row-main"><div class="agent-row-title"><strong class="agent-row-name">${escape(agent.name)}</strong>${agent.command ? `<code class="cmd-badge">${escape(agent.command)}</code>` : ''}</div><small class="agent-row-sub">${sub}</small></div><button type="button" class="${agent.installed ? 'secondary' : 'primary'} btn-row" data-agent-install="${escape(agent.id)}" ${busy ? 'disabled' : ''}>${agent.installed ? 'Update' : 'Install'}</button></div>`;
    };
    return `<section class="surface installed-agents-surface"><div class="section-label"><div><h2>Installed agents</h2><p class="field-hint">${installed.length} ready on this PC, ${available.length} available to install</p></div><button type="button" class="secondary" data-action="agent-setup">Set up agents</button></div><div class="directory-split"><div class="dir-column" aria-label="Installed on this PC"><div class="dir-col-head"><h3 class="dir-col-title">Installed on this PC</h3><span class="count-tag">${installed.length} ready</span></div>${installed.length ? installed.map(agentRow).join('') : '<p class="field-hint">No agents detected on this PC yet.</p>'}</div><div class="dir-column" aria-label="Available to install"><div class="dir-col-head"><h3 class="dir-col-title">Available to install</h3><span class="count-tag muted">${available.length} available</span></div>${available.length ? available.map(agentRow).join('') : '<p class="field-hint">All supported agents are installed.</p>'}</div></div></section>`;
  }
  function quitSettings() {
    return '<section class="surface"><div class="setting-row"><span><strong>Quit Paddock</strong><small>Ends every console. Closing the window keeps them running in the tray.</small></span><button class="secondary danger" data-action="quit">Quit Paddock</button></div></section>';
  }
  function shortcutSettings() {
    return '<section class="surface"><h2>Shortcuts</h2><div class="shortcut-row"><span>Show or hide Paddock</span><kbd>Ctrl Alt Space</kbd></div><div class="shortcut-row"><span>Search consoles and pages</span><kbd>Ctrl K</kbd></div><div class="shortcut-row"><span>Open a console</span><kbd>Ctrl Alt 1-9</kbd></div><div class="shortcut-row"><span>Restore expanded console</span><kbd>Ctrl Shift Enter</kbd></div><p class="field-hint">Close hides Paddock in the system tray. Consoles keep running. Use Quit to stop the app.</p></section>';
  }
  function startupSettings() {
    const state = getState();
    return `<section class="surface"><h2>Startup</h2><label class="toggle-row"><span><strong>Restore previous consoles</strong><small>${state.safeMode ? 'Restart normally to change this setting.' : 'Reopen your panels and folders. Saved agent chats resume; shells and custom commands restart.'}</small></span><input type="checkbox" data-setting="restoreConsoles" ${state.settings.restoreConsoles ? 'checked' : ''} ${state.safeMode ? 'disabled' : ''}></label><label class="toggle-row"><span><strong>Keep scrollback in Codex consoles</strong><small>Codex runs inline, so you can scroll up and select text to copy. Applies to Codex consoles opened after the change.</small></span><input type="checkbox" data-setting="codexScrollback" ${state.settings.codexScrollback !== false ? 'checked' : ''}></label><p id="workspace-error" class="form-error" role="alert">${escape(state.workspaceError || '')}</p></section>`;
  }
  function projectSettings() {
    const settings = getState().settings;
    return `<section class="surface" id="project-settings"><h2>Projects</h2><label class="toggle-row"><span><strong>Tasks per project</strong><small>The most delegated tasks and reviews that run together in each project. Tasks on the same current branch still run one at a time.</small></span><select data-setting="maxParallelTasks">${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}" ${(settings.maxParallelTasks || 5) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label><label class="toggle-row"><span><strong>Suggest project setup</strong><small>Ask when a chat has no project. “Don't ask again” turns this off.</small></span><input type="checkbox" data-setting="suggestProjects" ${getState().settings.suggestProjects !== false ? 'checked' : ''}></label><label class="toggle-row"><span><strong>Automatic documentation</strong><small>Chooses an available local, free or included worker. Up to four attempts per hour per project. When off, notes remain available on demand.</small></span><input type="checkbox" data-setting="knowledgeAutomatic" ${settings.knowledgeMode === 'automatic' ? 'checked' : ''}></label><label class="toggle-row"><span><strong>Resolve verified tasks automatically</strong><small>Record successful execution without an Accept action. Isolated publication still requires current checks.</small></span><input type="checkbox" data-setting="autoResolveTasks" ${settings.autoResolveTasks !== false ? 'checked' : ''}></label><button class="subtle" data-page="projects">View project progress ${icon('arrow')}</button></section>`;
  }
  function appearanceSettings() {
    const state = getState();
    const options = (choices, selected) => choices.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}></option>`.replace('></option>', `>${label}</option>`)).join('');
    const theme = state.settings.trimStyle || 'classic', stars = starLevel(state.settings);
    return `<section class="surface"><h2>Theme</h2><p class="field-hint">Colors the sidebar, buttons, settings and every console. Each console can still use its own theme: click the color dot in its header.</p>
    <fieldset class="theme-choices"><legend class="sr-only">Theme</legend>${themeChoices.map(([id, label]) => `<label class="theme-choice" data-frame="${id}"><input type="radio" name="theme" data-setting="trimStyle" value="${id}" ${id === theme ? 'checked' : ''}><span class="theme-chip" aria-hidden="true"></span><strong>${label}</strong></label>`).join('')}</fieldset>
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
    const { columns, rows } = gridSize(getState());
    const curCol = focusGridCell?.col || columns, curRow = focusGridCell?.row || rows;
    const nums = Array.from({ length: 8 }, (_, i) => i + 1);
    const cells = nums.flatMap(r => nums.map(c => {
      const active = c <= curCol && r <= curRow, cursor = c === curCol && r === curRow;
      return `<button type="button" class="matrix-cell${active ? ' active' : ''}${cursor ? ' cursor' : ''}" data-grid-col="${c}" data-grid-row="${r}" tabindex="${cursor ? '0' : '-1'}" aria-label="${c} ${c === 1 ? 'column' : 'columns'} by ${r} ${r === 1 ? 'row' : 'rows'}" aria-pressed="${c === columns && r === rows}"></button>`;
    })).join('');
    return `<section id="grid-form" class="surface matrix-card"><div class="matrix-head"><div><h2>Console grid</h2><p class="field-hint">Hover and click a cell, or use arrow keys and Enter. Minimum 2 × 2, up to 8 × 8.</p></div><output class="matrix-badge" id="matrix-readout">${curCol} × ${curRow} <small>(${curCol * curRow} consoles)</small></output></div><div class="matrix-picker"><div class="matrix-axis-cols" aria-hidden="true">${nums.map(n => `<span>${n}</span>`).join('')}</div><div class="matrix-body"><div class="matrix-axis-rows" aria-hidden="true">${nums.map(n => `<span>${n}</span>`).join('')}</div><div class="matrix-cells" role="grid" aria-label="Console grid size">${cells}</div></div></div><div class="matrix-footer"><span class="matrix-status" id="matrix-status">Saved layout: <strong>${columns} columns × ${rows} rows</strong></span><span class="field-hint">Full grids grow automatically when you add a console.</span></div><p class="form-error" role="alert"></p></section>`;
  }
  function previewGrid(col, row) {
    const c = Math.max(2, Math.min(8, col)), r = Math.max(2, Math.min(8, row));
    const readout = $('#matrix-readout');
    if (readout) readout.innerHTML = `${c} × ${r} <small>(${c * r} consoles)</small>`;
    for (const cell of document.querySelectorAll('#grid-form .matrix-cell')) {
      const cc = Number(cell.dataset.gridCol), cr = Number(cell.dataset.gridRow);
      cell.classList.toggle('active', cc <= c && cr <= r);
      cell.classList.toggle('cursor', cc === c && cr === r);
    }
  }
  function keyboardSettings() {
    return `<section class="surface"><h2>Keyboard</h2><div class="shortcut-row"><span>New console</span><kbd>Ctrl Shift N</kbd></div><p class="field-hint">Right-click + to choose a name, agent or folder.</p><label class="toggle-row"><span><strong>Vim controls</strong><small>Use h/j/k/l to move around Paddock.</small></span><input type="checkbox" data-setting="vimControls" ${getState().settings.vimControls ? 'checked' : ''}></label><p class="field-hint">Ctrl+Shift+Space returns control to Paddock. Press i to type in a console.</p><button class="subtle" data-action="vim-help">View shortcuts</button></section>`;
  }

  function render() {
    const page = getPage(), state = getState();
    let content;
    if (page === 'appearance') content = appearanceSettings();
    else if (page === 'console-settings') content = '<div class="settings-column">' + launchDefaults() + keyboardSettings() + '</div><div class="settings-column">' + gridSettings() + '</div>';
    else if (page === 'agent-settings') content = installedAgents() + accounts.render();
    else if (page === 'project-settings') content = projectSettings();
    else if (page === 'devices') content = (panels.remoteHosts()?.html() || '') + (panels.phone()?.renderSettings() || '');
    else if (page === 'api-settings') content = tools.renderApis();
    else if (page === 'tools' || page === 'add-tools') content = tools.renderTracked();
    else if (page === 'instructions') content = tools.renderInstructions();
    else if (page === 'previews') content = pageHeading('', 'Previews', '');
    else content = '<div class="settings-general-columns"><div class="settings-column">' + desktopSettings() + shortcutSettings() + '</div><div class="settings-column">' + startupSettings() + quitSettings() + '</div></div>' + (panels.updates()?.render() || '');
    return settingsShell(page, `<div class="settings-layout${page === 'console-settings' ? ' settings-console-grid' : ''}">${content}</div>`, icon('close'), state.settings.trimStyle || 'classic');
  }
  function launchDefaultsFields() {
    const form = $('#console-defaults-form'); if (!form) return;
    const state = getState(), provider = form.elements.provider.value;
    $('#default-command').hidden = provider !== 'custom';
    $('#default-permissions').hidden = state.agents?.find(x => x.id === provider)?.consoleFeatures?.permissions !== true;
    $('#default-provider-hint').textContent = provider === 'claude' ? state.capabilities.claude ? 'Claude Code, ' + state.capabilities.claudeLocation : 'Claude Code was not found.' : provider === 'custom' ? 'Shared files: {instructions} and {mcp_config}.' : '';
  }
  function mount() {
    if (getPage() === 'console-settings') {
      launchDefaultsFields();
      if (focusGridCell && document.activeElement === document.body) {
        $(`#grid-form .matrix-cell[data-grid-col="${focusGridCell.col}"][data-grid-row="${focusGridCell.row}"]`)?.focus({ preventScroll: true });
      }
    } else if (getPage() === 'agent-settings' && focusAgentId && document.activeElement === document.body) {
      $(`[data-agent-install="${CSS.escape(focusAgentId)}"]`)?.focus({ preventScroll: true });
    }
  }

  document.addEventListener('pointerover', event => {
    const cell = event.target.closest('#grid-form .matrix-cell');
    if (cell) previewGrid(Number(cell.dataset.gridCol), Number(cell.dataset.gridRow));
  });
  document.addEventListener('pointerout', event => {
    const cells = event.target.closest('#grid-form .matrix-cells');
    if (cells && !cells.contains(event.relatedTarget)) {
      const saved = gridSize(getState()), col = focusGridCell?.col || saved.columns, row = focusGridCell?.row || saved.rows;
      previewGrid(col, row);
    }
  });
  document.addEventListener('keydown', event => {
    const cell = event.target.closest('#grid-form .matrix-cell');
    if (!cell) return;
    const moves = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[event.key];
    if (!moves) return;
    event.preventDefault();
    const col = Math.max(2, Math.min(8, Number(cell.dataset.gridCol) + moves[0]));
    const row = Math.max(2, Math.min(8, Number(cell.dataset.gridRow) + moves[1]));
    focusGridCell = { col, row };
    for (const item of document.querySelectorAll('#grid-form .matrix-cell')) {
      item.tabIndex = Number(item.dataset.gridCol) === col && Number(item.dataset.gridRow) === row ? 0 : -1;
    }
    previewGrid(col, row);
    $(`#grid-form .matrix-cell[data-grid-col="${col}"][data-grid-row="${row}"]`)?.focus({ preventScroll: true });
  });
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
    if (button.matches('#grid-form .matrix-cell')) {
      const columns = Math.max(2, Number(button.dataset.gridCol)), rows = Math.max(2, Number(button.dataset.gridRow));
      focusGridCell = { col: columns, row: rows };
      const err = $('#grid-form .form-error'); if (err) err.textContent = '';
      call('grid.configure', { columns, rows }).then(() => toast('Grid updated.')).catch(error => {
        const msg = $('#grid-form .form-error'); if (msg) msg.textContent = error.message;
        toast(error.message, true);
      }).finally(() => {
        const target = $(`#grid-form .matrix-cell[data-grid-col="${columns}"][data-grid-row="${rows}"]`);
        if (target && document.activeElement === document.body) target.focus({ preventScroll: true });
      });
      return true;
    }
    if (button.dataset.agentInstall) {
      const id = button.dataset.agentInstall;
      focusAgentId = id; button.disabled = true;
      call('agents.install', [id]).then(next => {
        const agent = next?.agents?.find(x => x.id === id);
        if (agent?.job?.state === 'error') toast(agent.job.error, true);
        else toast(agent?.installed ? `${agent.name} is ready.` : `${id} updated.`);
      }).catch(error => toast(error.message, true)).finally(() => {
        const target = $(`[data-agent-install="${CSS.escape(id)}"]`);
        if (target) { target.disabled = false; if (document.activeElement === document.body) target.focus({ preventScroll: true }); }
      });
      return true;
    }
    if (!button.matches('[data-settings-replay]')) return false;
    const preview = $('.settings-content .console-theme-preview'); if (preview && getState().settings.launchEffect !== false) openConsoleEffect(preview);
    return true;
  }
  const submits = {
    'console-defaults-form': (form, data) => submitForm(form, async () => {
      form.querySelector('.form-error').textContent = '';
      const { permissions, ...consoleDefaults } = data;
      await call('settings', { consoleDefaults, agentPermissions: permissions }); toast('Defaults saved.');
    })
  };
  return { render, mount, click, submits };
}
