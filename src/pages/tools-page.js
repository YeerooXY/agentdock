// Settings > Tools, APIs and Instructions: shared tool connections, API
// profiles, key setup requests and the shared instructions form.
import { sharedViews } from '../shared-ui.js';
import { setupRequests, apiPresets } from '../setup-ui.js';
import { escapeHtml as escape } from '../html-escape.js';
import { icon } from '../ui/icons.js';
import { pageHeading } from '../ui/format.js';

function toolPayload(form, data) {
  const parse = (value, field) => { try { return JSON.parse(value || '{}'); } catch { throw new Error(`${field} needs valid JSON.`); } };
  const bindings = parse(data.extraKeys, 'Key bindings');
  if (!bindings || Array.isArray(bindings) || typeof bindings !== 'object') throw new Error('Key bindings must be an object.');
  if (data.keyId) { const target = data.keyTarget.trim() || (data.type === 'stdio' ? 'API_KEY' : 'Authorization'); bindings[target] = { key: data.keyId, prefix: data.type === 'stdio' ? '' : data.keyPrefix }; }
  return { id: data.id, name: data.name, description: data.description, type: data.type, enabled: form.elements.enabled.checked, command: data.command, args: data.args.split(/\r?\n/).filter(x => x !== ''), cwd: data.cwd, url: data.url, method: data.method, ...(data.type === 'stdio' ? { envKeys: bindings } : { headerKeys: bindings, queryKeys: parse(data.queryKeys, 'Query bindings') }), ...(data.type === 'rest' ? { inputSchema: parse(data.inputSchema, 'Input schema') } : {}) };
}
function toolFields() {
  const form = document.querySelector('#tool-form'); if (!form) return;
  const type = form.elements.type.value, local = type === 'stdio';
  form.querySelectorAll('[data-tool-stdio]').forEach(x => x.hidden = !local);
  form.querySelectorAll('[data-tool-http]').forEach(x => x.hidden = local);
  form.querySelector('[data-tool-rest]').hidden = type !== 'rest';
  form.querySelector('[data-key-target]').firstChild.textContent = local ? 'Environment variable' : 'Header name';
  form.elements.keyTarget.placeholder = local ? 'API_KEY' : 'Authorization';
}

// Fresh setup snapshots go through the bootstrap's normal state intake.
export function toolsPage({ getState, receiveState, call, toast, getPage, renderPage, navigate, imageGenerator, submitForm }) {
  const $ = selector => document.querySelector(selector);
  const views = () => sharedViews(getState(), { escape, icon, pageHeading });
  // Connections and integration states shown by the Tools lists, without live status.
  const listKey = () => { const state = getState(); return JSON.stringify([state.shared.connections.map(x => [x.id, x.enabled, x.integration]), (state.integrations || []).map(x => [x.id, x.connected, x.ready, x.enabled])]); };
  let renderedList = '';

  function render() { return views().tools(); }
  // Settings renders Tools through here so later state updates can tell when the lists changed.
  function renderTracked() { const markup = render(); renderedList = listKey(); return markup; }
  function refreshSections() {
    if (getPage() !== 'tools') return;
    renderedList = listKey();
    const drafts = [...document.querySelectorAll('.integrations input, .integrations select')].map(field => [field.name, field.value]);
    const focusedSetup = document.activeElement?.dataset.integrationSetup;
    const template = document.createElement('template'); template.innerHTML = render();
    for (const selector of ['.integrations', '.connection-list', '.setup-requests']) document.querySelector(selector)?.replaceWith(template.content.querySelector(selector));
    for (const [name, value] of drafts) { const field = document.querySelector(`.integrations [name="${name}"]`); if (field) field.value = value; }
    if (focusedSetup) document.querySelector(`[data-integration-setup="${focusedSetup}"]`)?.focus({ preventScroll: true });
  }
  // Live connection status, list changes and setup requests while Tools is open.
  function receive() {
    if (getPage() !== 'tools') return;
    const state = getState();
    for (const connection of state.shared.connections) {
      const label = document.querySelector(`[data-tool-status="${connection.id}"]`);
      if (label) { label.textContent = !connection.enabled ? 'Disabled' : connection.status ? connection.status.ok ? `${connection.status.count} tools` : 'Check connection' : 'Ready to connect'; label.classList.toggle('connected', !!connection.status?.ok); }
    }
  }
  // A setup call can return before its state update arrives; redraw once it does.
  function afterReceive() {
    if (getPage() !== 'tools') return;
    const state = getState();
    if (renderedList && renderedList !== listKey()) refreshSections();
    const section = document.querySelector('.setup-requests');
    const next = JSON.stringify(state.workbench?.setupRequests || []);
    if (section && section.dataset.items !== next) { const template = document.createElement('template'); template.innerHTML = setupRequests(state, escape); template.content.firstElementChild.dataset.items = next; section.replaceWith(template.content.firstElementChild); }
  }
  function mount() {
    if (getPage() !== 'tools') return;
    $('.settings-content .page-heading').insertAdjacentHTML('afterend', imageGenerator().render()); imageGenerator().mount();
  }
  function editTool(id) {
    const item = getState().shared.connections.find(x => x.id === id); if (!item) return;
    const form = $('#tool-form'); form.reset(); form.elements.id.readOnly = true;
    for (const key of ['id', 'name', 'description', 'type', 'command', 'cwd', 'url', 'method']) if (item[key]) form.elements[key].value = item[key];
    form.elements.enabled.checked = item.enabled;
    form.elements.args.value = (item.args || []).join('\n');
    const pairs = Object.entries(item.type === 'stdio' ? item.envKeys || {} : item.headerKeys || {});
    if (pairs.length) { const [name, ref] = pairs.shift(); form.elements.keyTarget.value = name; form.elements.keyId.value = ref.key; form.elements.keyPrefix.value = ref.prefix; }
    form.elements.extraKeys.value = JSON.stringify(Object.fromEntries(pairs), null, 2);
    form.elements.queryKeys.value = JSON.stringify(item.queryKeys || {}, null, 2);
    if (item.inputSchema) form.elements.inputSchema.value = JSON.stringify(item.inputSchema, null, 2);
    $('#tool-form-title').textContent = 'Edit tool'; toolFields(); form.scrollIntoView({ block: 'start' });
  }

  document.addEventListener('change', event => {
    const input = event.target;
    if (input.form?.getAttribute('id') === 'tool-form' && input.name === 'type') toolFields();
  });

  // Data-attribute buttons, checked in this order.
  const clicks = [
    ['setupApply', async (button, id) => {
      button.disabled = true;
      try { await call('workbench.setup.apply', id); receiveState(await call('state')); renderPage(); toast('Settings saved.'); }
      finally { button.disabled = false; }
    }],
    ['setupDismiss', async (button, id) => { await call('workbench.setup.dismiss', id); }],
    ['setupKey', async (button, id) => {
      const item = getState().workbench.setupRequests.find(x => x.id === id); if (!item) return;
      const field = button.closest('.setup-request').querySelector('[name=newKey]');
      if (!field.value.trim()) { field.focus(); toast('Paste the key first.', true); return; }
      await call('vault.save', { provider: item.config.id, key: field.value.trim(), label: item.config.name || item.config.id }); field.value = '';
      await call('workbench.setup.dismiss', item.id); toast('Key saved and encrypted.');
    }],
    ['apiPreset', (button, id) => {
      const preset = getState().shared.profiles.find(item => item.id === id) || apiPresets[id];
      if (!preset) return;
      if (!$('#profile-form')) navigate('api-settings');
      const form = $('#profile-form');
      form.reset(); form.elements.id.readOnly = false;
      if (!form.elements.keyId.querySelector(`[value="${preset.keyId}"]`)) form.elements.keyId.add(new Option(preset.keyId + ' (paste the key beside this)', preset.keyId));
      for (const [key, value] of Object.entries(preset)) form.elements[key].value = value;
      $('#profile-editor').open = true; form.elements.url.focus();
    }],
    ['removeKey', async (button, id) => { await call('vault.remove', id); renderPage(); toast('Key removed.'); }],
    ['editTool', (button, id) => { editTool(id); }],
    ['removeTool', async (button, id) => { await call('tools.remove', id); renderPage(); toast('Tool removed.'); }],
    ['testTool', async (button, id) => {
      button.disabled = true; button.textContent = 'Connecting…';
      try { const result = await call('tools.test', id); toast(result.message); }
      finally { button.disabled = false; button.textContent = 'Test connection'; }
    }],
    ['removeProfile', async (button, id) => { await call('profiles.remove', id); renderPage(); }],
    ['editProfile', (button, id) => {
      const profile = getState().shared.profiles.find(x => x.id === id), form = $('#profile-form');
      for (const key of ['id','name','protocol','url','keyId']) form.elements[key].value = profile[key];
      form.elements.id.readOnly = true; $('#profile-editor').open = true; form.scrollIntoView();
    }]
  ];
  // Returns false when no tool button matched, else true or the running promise.
  function click(button) {
    for (const [key, run] of clicks) if (button.dataset[key]) return run(button, button.dataset[key]) || true;
    return false;
  }
  const actions = {
    'reset-tool'() { $('#tool-form').reset(); $('#tool-form').elements.id.readOnly = false; $('#tool-form-title').textContent = 'Add a tool'; toolFields(); }
  };
  const submits = {
    'instructions-form': (form, data) => submitForm(form, async () => { await call('shared.instructions', data.instructions); renderPage(); toast('Instructions saved.'); }),
    'tool-form': (form, data) => submitForm(form, async () => { await call('tools.save', toolPayload(form, data)); renderPage(); toast('Tool saved.'); }),
    'profile-form': (form, data) => submitForm(form, async () => {
      const { newKey, ...profile } = data;
      if (newKey?.trim()) { await call('vault.save', { provider: profile.id, key: newKey.trim(), label: profile.name || profile.id }); profile.keyId = profile.id; }
      await call('profiles.save', profile); renderPage(); toast('API saved.');
    })
  };
  return {
    render, renderTracked, refreshSections, receive, afterReceive, mount, click, actions, submits,
    renderApis: () => views().apis(),
    renderInstructions: () => views().instructions()
  };
}
