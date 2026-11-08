// The "Open console" chooser dialog: computer, project, agent/account, model
// and folder for one console. Opening the console itself is the app's openNew.
import { escapeHtml as escape } from '../html-escape.js';
import { remainingPercent } from '../account-identity.js';
import { holdToChoose } from '../launch-gesture.js';
import { shellPicker } from '../shell-picker.js';
import { number } from '../ui/format.js';
import { limitAccountId } from '../ui/providers.js';
import { gridCapacity, coveredSlots } from './panels.js';

const RECENT_KEY = 'console-recent';
const recentChoices = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '{}'); } catch { return {}; } };
function rememberChoice(provider, accountId) {
  const recent = recentChoices(); recent[`${provider}|${accountId || ''}`] = Date.now();
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* order falls back to open consoles */ }
}
function shortReset(at) {
  if (!at || at <= Date.now()) return '';
  const date = new Date(at);
  return at - Date.now() < 86400000 ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { weekday: 'short' });
}

export function consoleChooser({ call, getState, view, providerName, consoleProviders, shellMark, openSetup, projects, renderHud, openNew }) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#console-chooser'), form = $('#one-off-console-form');
  let chooserOpener = null, chooserModelRequest = 0;

  // The window with the least left decides what an account can still do.
  function choiceUsage(provider, accountId) {
    let tightest = null, stale = false;
    for (const entry of getState().limits.filter(x => x.provider === provider && limitAccountId(x) === accountId)) {
      if (!Number.isFinite(entry.observedAt) || Date.now() - entry.observedAt > 5 * 60000) stale = true;
      for (const w of entry.windows || []) {
        const left = w.unlimited ? null : remainingPercent(w.usedPercent);
        if (left !== null && (!tightest || left < tightest.left)) tightest = { left, resetsAt: w.resetsAt };
      }
    }
    if (!tightest) return { left: null, detail: '' };
    const reset = shortReset(tightest.resetsAt);
    return { left: tightest.left, detail: `${number(tightest.left)}% left${reset ? ', resets ' + reset : ''}${stale ? ', cached' : ''}` };
  }
  function consoleFeatures(provider) {
    return getState().agents?.find(agent => agent.id === provider)?.consoleFeatures || {};
  }
  // Agent choices: installed agents only, one row per signed-in Codex or Claude
  // account, most recently used first.
  function consoleChoices() {
    const state = getState(), host = state.sshHosts?.find(h => h.id === form.elements.remoteHostId.value);
    if (host) return ['shell', ...(host.agents || [])].map(provider => ({ provider, accountId: '', label: providerName(provider), group: 'On ' + host.name }));
    const installed = provider => ['shell', 'custom'].includes(provider) || !!state.agents?.find(x => x.id === provider)?.installed || !!state.capabilities?.[provider];
    const rows = [];
    for (const provider of consoleProviders().filter(installed)) {
      const accounts = (state.accounts || []).filter(a => a.provider === provider && !a.unavailableReason && (!a.profile || a.loginCompletedAt));
      if (accounts.length > 1) for (const a of accounts) rows.push({ provider, accountId: a.id, label: `${providerName(provider)}, ${a.label}` });
      else rows.push({ provider, accountId: accounts[0]?.id || '', label: providerName(provider) });
    }
    const recent = recentChoices();
    for (const row of rows) {
      const opened = state.sessions.filter(s => s.provider === row.provider && (!row.accountId || (s.accountId || `${s.provider}:default`) === row.accountId)).map(s => s.createdAt || 0);
      row.usedAt = Math.max(recent[`${row.provider}|${row.accountId}`] || 0, ...opened);
      Object.assign(row, choiceUsage(row.provider, row.accountId || `${row.provider}:default`));
    }
    for (const provider of new Set(rows.map(row => row.provider))) {
      const same = rows.filter(row => row.provider === provider && row.left !== null);
      if (rows.filter(row => row.provider === provider).length > 1 && same.length) same.reduce((a, b) => b.left > a.left ? b : a).best = true;
    }
    const used = rows.filter(row => row.usedAt).sort((a, b) => b.usedAt - a.usedAt).slice(0, 5);
    for (const row of rows) row.group = used.includes(row) ? 'Recent' : 'Other installed';
    return [...used, ...rows.filter(row => !used.includes(row))];
  }
  const picker = shellPicker(form.elements.provider, form.elements.accountId, {
    mark: shellMark, escape, choices: consoleChoices, more: { label: 'Install more agents…', open: () => { dialog.close(); openSetup(); } }
  });

  function fields() {
    const provider = form.elements.provider.value;
    picker.sync();
    const agent = consoleFeatures(provider).model === true, customModel = agent && form.elements.model.value === '__custom__';
    $('#one-off-model').hidden = !agent; form.elements.model.disabled = !agent;
    $('#one-off-custom-model').hidden = !customModel; form.elements.customModel.disabled = !customModel; form.elements.customModel.required = customModel;
    const permissions = consoleFeatures(provider).permissions === true;
    $('#one-off-permissions').hidden = !permissions; form.elements.permissions.disabled = !permissions;
    $('#one-off-command').hidden = provider !== 'custom'; form.elements.command.disabled = provider !== 'custom'; form.elements.command.required = provider === 'custom';
  }
  async function models() {
    const request = ++chooserModelRequest, provider = form.elements.provider.value;
    const select = form.elements.model;
    select.innerHTML = '<option value="">Agent default</option><option value="__custom__">Enter a model…</option>';
    form.elements.customModel.value = ''; fields();
    if (form.elements.remoteHostId.value || consoleFeatures(provider).modelChoices !== true) return;
    try {
      const list = await call('session.models', provider);
      if (request !== chooserModelRequest || !dialog.open) return;
      for (const model of list) select.add(new Option(model.name, model.id), select.lastElementChild);
    } catch { /* A custom model can still be entered when the local list is unavailable. */ }
  }
  function choose(button) {
    const state = getState();
    if (view.openingConsole || dialog.open) return;
    const occupied = coveredSlots(state);
    const slot = Number(button.dataset.slot) || Array.from({ length: gridCapacity(state) }, (_, i) => i + 1).find(x => !occupied.has(x));
    if (slot && occupied.has(slot)) return;
    form.reset(); form.dataset.slot = slot || '';
    form.elements.remoteHostId.innerHTML = '<option value="">This PC</option>' + (state.sshHosts || []).map(h => `<option value="${escape(h.id)}">${escape(h.name)} (SSH)</option>`).join('');
    $('#chooser-remote-folder').hidden = true;
    form.elements.cwd.closest('label').hidden = false;
    form.elements.provider.innerHTML = consoleProviders().map(p => `<option value="${p}">${providerName(p)}</option>`).join('');
    form.elements.projectId.innerHTML = '<option value="">No project</option>' + (state.projects || []).filter(x => x.status !== 'archived').map(x => `<option value="${escape(x.id)}">${escape(x.name)}${x.category ? ', ' + escape(x.category) : ''}</option>`).join('');
    $('#chooser-project-folders').hidden = true;
    for (const key of ['provider', 'cwd', 'name', 'command']) form.elements[key].value = state.settings.consoleDefaults[key] || '';
    form.elements.accountId.value = consoleChoices().find(row => row.provider === form.elements.provider.value)?.accountId || '';
    form.elements.name.value = state.settings.slotNames?.[slot] || form.elements.name.value;
    form.elements.permissions.value = state.settings.agentPermissions;
    form.querySelector('details').open = false; form.querySelector('.form-error').textContent = '';
    $('#console-chooser-title').textContent = slot ? `Console ${slot}` : 'New console';
    chooserOpener = button; dialog.showModal(); models(); form.elements.name.focus();
  }
  const launchGesture = holdToChoose({ onChoose: choose, disabled: () => view.openingConsole || dialog.open });
  function selectProject(id) {
    const project = getState().projects?.find(x => x.id === id);
    form.elements.projectId.value = id || '';
    $('#chooser-project-folders').hidden = !project;
    if (!project) return;
    form.elements.projectFolder.innerHTML = project.folders.map(x => `<option value="${escape(x.path)}">${escape(x.label || x.path)}</option>`).join('');
    form.elements.cwd.value = project.folders[0].path; form.elements.name.value = project.name;
  }
  $('#chooser-new-project').addEventListener('click', () => {
    const slot = form.dataset.slot; dialog.close();
    projects().edit(undefined, project => { choose({ dataset: { slot } }); selectProject(project.id); });
  });
  dialog.addEventListener('cancel', event => { if (view.openingConsole) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    const state = getState();
    ++chooserModelRequest; launchGesture.cancel();
    if (state.mode === 'hud') renderHud();
    if (!view.openingConsole) {
      const slot = form.dataset.slot;
      const opener = chooserOpener?.isConnected ? chooserOpener : document.querySelector(`${state.mode === 'hud' ? '#hud' : '#consoles-page'} [data-action="new"][data-slot="${slot}"]`);
      opener?.focus();
    }
    chooserOpener = null;
  });
  document.addEventListener('change', event => {
    const input = event.target;
    if (input.form?.getAttribute('id') !== 'one-off-console-form') return;
    const state = getState();
    if (input.name === 'remoteHostId') {
      const host = state.sshHosts?.find(h => h.id === input.value);
      $('#chooser-remote-folder').hidden = !host;
      form.elements.cwd.closest('label').hidden = !!host;
      form.elements.remoteFolder.value = host?.folder || '.';
      form.elements.provider.innerHTML = (host ? ['shell', ...(host.agents || [])] : consoleProviders()).map(p => `<option value="${p}">${providerName(p)}</option>`).join('');
      form.elements.accountId.value = ''; form.elements.permissions.value = 'default'; $('#one-off-worktree').hidden = !!host; form.elements.worktree.checked = false; models();
    } else if (input.name === 'provider') {
      // Keep the account only while it belongs to the chosen agent.
      const account = input.form.elements.accountId;
      if (!account.value.startsWith(input.value + ':') && !(state.accounts || []).some(a => a.id === account.value && a.provider === input.value)) account.value = consoleChoices().find(row => row.provider === input.value)?.accountId || '';
      models();
    }
    else if (input.name === 'model') fields();
    else if (input.name === 'projectId') selectProject(input.value);
    else if (input.name === 'projectFolder') input.form.elements.cwd.value = input.value;
  });

  return {
    choose,
    isOpen: () => dialog.open,
    close: () => dialog.close(),
    gestureActive: () => launchGesture.active,
    // New agents appear in the provider list while the chooser is closed.
    syncProviders() {
      const providerSelect = form.elements.provider;
      if (providerSelect && !dialog.open) for (const provider of consoleProviders()) if (!providerSelect.querySelector(`[value="${provider}"]`)) providerSelect.add(new Option(providerName(provider), provider));
    },
    async submit(target, data) {
      target.querySelector('.form-error').textContent = '';
      const { customModel, projectFolder, ...overrides } = data;
      if (overrides.model === '__custom__') overrides.model = customModel;
      if (!overrides.accountId) delete overrides.accountId;
      await openNew(target.dataset.slot, overrides);
      rememberChoice(data.provider, data.accountId);
    }
  };
}
