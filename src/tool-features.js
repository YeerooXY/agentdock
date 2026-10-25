import blenderLogo from './assets/tool-logos/blender.png';
import unityLogo from './assets/tool-logos/unity.png';
import meshyLogo from './assets/tool-logos/meshy.svg';
import playwrightLogo from './assets/tool-logos/playwright.svg';
import chromeDevtoolsLogo from './assets/tool-logos/chrome-devtools.png';
import context7Logo from './assets/tool-logos/context7.png';
import notionLogo from './assets/tool-logos/notion.png';
import stripeLogo from './assets/tool-logos/stripe.png';
import githubLogo from './assets/tool-logos/github.svg';
import mirofishLogo from './assets/tool-logos/mirofish.png';

const logos = { blender: blenderLogo, unity: unityLogo, meshy: meshyLogo, playwright: playwrightLogo, 'chrome-devtools': chromeDevtoolsLogo, context7: context7Logo, notion: notionLogo, stripe: stripeLogo, github: githubLogo, mirofish: mirofishLogo };
// Tools without a published logo get a plain monogram instead of borrowed art.
export const toolLogo = (id, name = id) => Object.hasOwn(logos, id) ? `<span class="integration-mark integration-mark-${id}" aria-hidden="true"><img src="${logos[id]}" alt="" width="32" height="32"></span>` : `<span class="integration-mark integration-monogram" aria-hidden="true">${String(name).split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase()}</span>`;

// Keys are entered where a service is connected. Saving the card stores the
// key encrypted on this PC and connects the tool in the same step.
export function keyField(state, e, { keyId, label, getKey }) {
  const saved = state.vault.entries.some(x => x.id === keyId);
  const input = `<input type="password" name="newKey" autocomplete="off" spellcheck="false" placeholder="${saved ? 'Paste a new key to replace it' : 'Paste your key'}">`;
  return `<div class="key-entry" data-key-id="${e(keyId)}" data-key-label="${e(label)}"><label>${e(label)}${input}</label><p class="field-hint">${saved ? `<span class="key-saved">Saved and encrypted on this PC.</span> ` : 'Encrypted on this PC. Agents never see its value. '}${getKey ? `<button type="button" class="subtle inline-link" data-docs="${e(getKey)}">Get a key ↗</button>` : ''}</p></div>`;
}
export async function storeKey(container, call) {
  const box = container.querySelector('.key-entry'); if (!box) return '';
  const input = box.querySelector('[name=newKey]'), value = input.value.trim();
  if (value) { await call('vault.save', { provider: box.dataset.keyId, key: value, label: box.dataset.keyLabel }); input.value = ''; }
  return box.dataset.keyId;
}
export function savedKeys(state, e) {
  if (!state.vault.entries.length) return '';
  return `<section class="surface saved-key-list"><h2>Saved keys</h2><p class="field-hint">Encrypted with ${({ win32: 'your Windows account', darwin: 'the macOS Keychain' })[state.platform] || 'your system keyring'}. Replace a key from the tool or API that uses it.</p><div class="saved-keys">${state.vault.entries.map(x => `<div class="saved-key"><div><strong>${e(x.label)}</strong><small>${e(x.id)} · ${new Date(x.savedAt).toLocaleDateString()}</small></div><button class="subtle danger" data-remove-key="${e(x.id)}">Remove</button></div>`).join('')}</div></section>`;
}

export function integrationCards(state, e) {
  return `<section class="integrations" aria-label="Built-in tools"><div class="section-label"><h2>Built-in tools</h2><button type="button" class="subtle" data-integration-refresh>Check installed apps</button></div><div class="integration-grid">${(state.integrations || []).map(item => {
    const note = item.id === 'mirofish' ? 'Connect your separately running backend. Simulations use its model and Zep services and can incur charges. Results are hypotheses to test with real users.' : item.id === 'rea' ? 'Installs REA locally. No service key needed. Native analysis needs an engine such as Ghidra; web observation needs a Chrome-family browser.' : item.id === 'blender' ? 'Installs the MCP server and enables its Blender add-on. In Blender, open N → MCP for Blender and start the server.' : item.id === 'unity' ? 'Choose a project. Paddock adds Unity Pipeline so the CLI can reach the editor.' : 'Uses your Meshy account. Generating assets spends Meshy credits.';
    const status = item.job?.message || item.setupNote || (item.connected ? item.enabled ? 'Connected to Paddock' : 'Disabled' : item.available ? 'Ready to set up' : item.id === 'mirofish' ? 'The MiroFish adapter is missing from this build.' : item.id === 'rea' ? 'Dock’s Node/npm runtime is missing.' : item.id === 'blender' ? 'Install Blender, then check again.' : item.id === 'unity' ? 'Install Unity CLI, then check again.' : 'Meshy is missing from this build.');
    return `<article class="integration-card" data-integration="${e(item.id)}"><div class="integration-heading">${toolLogo(item.id, item.name)}<h3>${e(item.name)}</h3><button type="button" class="subtle" data-docs="${e(item.id)}">Setup guide</button></div><p>${e(item.description)}</p><p class="field-hint">${e(note)}</p><div class="integration-fields">${item.id === 'mirofish' ? `<label>Local backend URL<input name="backendUrl" value="${e(item.backendUrl)}" placeholder="http://127.0.0.1:5001"></label>` : item.id === 'unity' ? `<label>Unity project<div class="folder-input"><input name="projectPath" value="${e(item.projectPath)}" placeholder="Choose a project folder"><button type="button" data-unity-folder aria-label="Choose Unity project">…</button></div></label>` : item.id === 'meshy' ? keyField(state, e, { keyId: item.keyId || 'meshy', label: 'Meshy API key', getKey: 'meshy' }) : ''}</div><p class="integration-status" data-integration-status role="status">${e(status)}</p><div class="button-row"><button type="button" class="secondary" data-integration-setup="${e(item.id)}" ${!item.available || item.job?.busy ? 'disabled' : ''}>${item.id === 'mirofish' ? item.connected ? 'Check connection' : 'Connect MiroFish' : item.id === 'rea' ? item.connected ? 'Repair connection' : 'Set up REA' : item.id === 'blender' ? item.ready ? 'Update tools' : 'Set up Blender' : item.connected ? 'Save connection' : 'Connect'}</button></div></article>`;
  }).join('')}</div><details class="tool-brand-notices field-hint"><summary>Logo credits</summary><p>Blender and its logo belong to the Blender Foundation. Meshy and its logo belong to MESHY LLC. Playwright belongs to Microsoft, Chrome DevTools to Google, Context7 to Upstash, Notion to Notion Labs, Stripe to Stripe and GitHub to GitHub. MiroFish belongs to its authors. Logos identify each tool; Paddock is not affiliated with their owners.</p><p>Paddock is not sponsored by or affiliated with Unity Technologies or its affiliates. Unity and the Unity logo are trademarks or registered trademarks of Unity Technologies or its affiliates in the U.S. and elsewhere.</p></details></section>`;
}

// Recommended tools from their makers. Adding installs one pinned package.
export function catalogCards(state, e) {
  const items = state.toolCatalog || []; if (!items.length) return '';
  return `<section class="integrations tool-catalog" aria-label="Recommended tools"><div class="section-label"><h2>Recommended tools</h2><span>From each tool’s maker · pinned versions</span></div><div class="integration-grid">${items.map(item => {
    const status = item.job?.message || (item.added ? 'Added. Set its limits under Shared tools.' : item.key ? `Paste your ${item.key.label} to add it.` : 'No key needed.');
    const credentials = !item.added && item.key ? keyField(state, e, { keyId: item.id, label: item.key.label, getKey: 'key-' + item.id }) : '';
    const action = item.added ? '<span class="connection connected">Added</span>' : `<button type="button" class="primary" data-catalog-add="${e(item.id)}" ${item.job?.busy ? 'disabled' : ''}>Add ${e(item.name)}</button>`;
    return `<article class="integration-card" data-catalog="${e(item.id)}"><div class="integration-heading">${toolLogo(item.id, item.name)}<h3>${e(item.name)}</h3><button type="button" class="subtle" data-docs="${e(item.id)}">Docs</button></div><p>${e(item.description)}</p><p class="field-hint">${e(item.maker)} · ${e(item.license)} · ${item.type === 'http' ? 'hosted server' : 'v' + e(item.version)}</p>${credentials}<p class="field-hint" data-catalog-status role="status">${e(status)}</p><div class="button-row catalog-action-row">${action}</div></article>`;
  }).join('')}</div></section>`;
}

// Per-tool limits Paddock enforces: access, highest model, daily budget.
export function toolPolicy(connection, state, e) {
  const policy = connection.policy || {}, limits = state.toolLimits?.[connection.id] || { models: [], unit: 'paid calls' };
  const access = !connection.enabled ? 'off' : policy.access || 'allowed';
  const models = limits.models.length ? `<label>Max model<select name="maxModel"><option value="">No limit</option>${limits.models.map(m => `<option value="${e(m)}" ${policy.maxModel === m ? 'selected' : ''}>${e(m)}</option>`).join('')}</select></label>` : '';
  return `<form class="tool-policy" data-tool-policy="${e(connection.id)}"><label>Access<select name="access">${[['allowed', 'Allowed'], ['ask', 'Ask me first'], ['off', 'Off']].map(([v, l]) => `<option value="${v}" ${access === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${models}<label>Daily budget, ${e(limits.unit)}<input name="dailyBudget" type="number" min="0" step="1" inputmode="numeric" placeholder="No limit" value="${policy.dailyBudget ?? ''}"></label><button type="submit" class="secondary">Save limits</button></form>`;
}

export function workingGuides(state, e) {
  return `<section class="working-guides surface"><h2>Ways of working</h2>${(state.shared.guides || []).map(guide => `<div class="working-guide"><label class="check-row"><input type="checkbox" data-working-guide="${e(guide.id)}" ${guide.enabled ? 'checked' : ''}><span><strong>${e(guide.name)}</strong><small>${e(guide.description)}</small></span></label><details><summary>Read guide</summary><pre>${e(guide.content)}</pre></details></div>`).join('')}</section>`;
}

const skillStates = { installed: 'Installed', outdated: 'Update available', modified: 'Changed by you', conflict: 'Folder already used by another skill', 'not-installed': 'Not installed' };
export function skillPackCards(state, e) {
  const { packs = [], busy = false } = state.skills || {};
  if (!packs.length) return '';
  const size = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `<section class="skill-packs surface"><div class="section-label"><h2>Skill packs <span class="optional">optional</span></h2><button type="button" class="subtle" data-skill-refresh ${busy ? 'disabled' : ''}>Check again</button></div><p class="field-hint">Installing copies a pack into each installed agent's skills folder. Agents load it only when a task matches. Uninstall removes the files Paddock added and keeps any you changed.</p>${packs.map(pack => {
    const installable = pack.targets.some(t => ['not-installed', 'outdated'].includes(t.state)), removable = pack.targets.some(t => ['installed', 'outdated', 'modified'].includes(t.state));
    const label = !pack.targets.some(t => t.state !== 'not-installed') ? 'Install' : 'Update';
    return `<article class="skill-pack" data-skill-pack="${e(pack.id)}"><div class="skill-pack-heading"><div><h3>${e(pack.name)}</h3><small>${pack.source === 'local' ? 'Local · this PC only' : 'Included with Paddock'} · ${size(pack.size)}</small></div><div class="button-row">${installable ? `<button type="button" class="secondary" data-skill-install="${e(pack.id)}" ${busy || pack.error ? 'disabled' : ''}>${label}</button>` : ''}${removable ? `<button type="button" class="subtle danger" data-skill-uninstall="${e(pack.id)}" ${busy ? 'disabled' : ''}>Uninstall</button>` : ''}</div></div><p>${e(pack.description)}</p>${pack.error ? `<p class="form-error">${e(pack.error)}</p>` : ''}<details><summary>Folders</summary><ul class="skill-targets">${pack.targets.map(t => `<li data-state="${e(t.state)}"><span class="mono">${e(t.path)}</span><small>${e(t.agents.join(', ') || 'Agents that read the shared folder')} · ${e(skillStates[t.state] || t.state)}</small></li>`).join('')}</ul></details></article>`;
  }).join('')}</section>`;
}

export function creativeToolCards(state, e) {
  return `<section class="creative-tools surface"><h2>Free creative tools</h2><p class="field-hint">Keep your preferred tools. If you need an alternative, these independent ArtCraft apps offer MCP interfaces. Features and release maturity vary. Preparing settings installs and runs nothing.</p><details><summary>Browse optional alternatives</summary><div class="integration-grid">${(state.shared.creativeTools || []).map(item => `<article class="integration-card"><h3>${e(item.name)}</h3><p>${e(item.purpose)}</p><div class="button-row"><button type="button" class="secondary" data-creative-prepare="${e(item.id)}">Prepare MCP settings</button><button type="button" class="subtle" data-docs="${e(item.id)}">Official project</button></div></article>`).join('')}</div></details></section>`;
}

export function syncIntegrationJobs(state) {
  for (const item of state.integrations || []) {
    const card = document.querySelector(`[data-integration="${item.id}"]`);
    if (!card) continue;
    if (item.job) card.querySelector('[data-integration-status]').textContent = item.job.message;
    card.querySelector('[data-integration-setup]').disabled = !item.available || !!item.job?.busy;
  }
}

export function toolFeatures({ call, getState, navigate, render, toast, escape: e }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'tool-catalog'; dialog.setAttribute('aria-labelledby', 'tool-catalog-title');
  document.body.append(dialog);
  // The Instructions page is not re-rendered on state updates, so the pack list
  // refreshes itself and keeps open folder lists and keyboard focus.
  function refreshSkillPacks(focusId) {
    const current = document.querySelector('.skill-packs'); if (!current) return;
    const open = new Set([...current.querySelectorAll('.skill-pack details[open]')].map(x => x.closest('[data-skill-pack]').dataset.skillPack));
    const template = document.createElement('template'); template.innerHTML = skillPackCards(getState(), e);
    const next = template.content.querySelector('.skill-packs'); if (!next) return;
    for (const id of open) next.querySelector(`[data-skill-pack="${id}"] details`)?.setAttribute('open', '');
    current.replaceWith(next);
    if (focusId) next.querySelector(`[data-skill-pack="${focusId}"] .button-row button`)?.focus({ preventScroll: true });
    const preview = document.querySelector('.summary-preview pre'); if (preview) preview.textContent = getState().shared.summary;
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    try {
      if (button.dataset.skillInstall || button.dataset.skillUninstall || button.hasAttribute('data-skill-refresh')) {
        const install = !!button.dataset.skillInstall, id = button.dataset.skillInstall || button.dataset.skillUninstall;
        button.disabled = true;
        try {
          if (!id) { await call('skills.refresh'); return; }
          const results = await call(install ? 'skills.install' : 'skills.uninstall', id);
          const problems = results.filter(x => ['skipped', 'failed', 'kept'].includes(x.state));
          toast(problems.length ? problems.map(x => x.reason).join(' ') : install ? 'Skill pack installed. New agent sessions load it.' : 'Skill pack removed.', problems.some(x => x.state !== 'kept'));
        } finally { refreshSkillPacks(id); }
        return;
      }
      if (button.dataset.creativePrepare) {
        const item = getState().shared.creativeTools?.find(x => x.id === button.dataset.creativePrepare);
        if (!item) return;
        if (getState().shared.connections.some(x => x.id === item.id)) { toast('This tool already has a connection. Review it in Shared tools.'); return; }
        const form = document.querySelector('#tool-form');
        if (form.elements.id.value || form.elements.name.value) { toast('Save or clear the current tool form first.'); return; }
        form.reset(); form.elements.id.readOnly = false;
        for (const [key, value] of Object.entries({ id: item.id, name: item.name, description: item.description, command: item.command, args: item.args.join('\n'), type: 'stdio', keyId: '' })) form.elements[key].value = value;
        form.elements.enabled.checked = false;
        form.elements.type.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('#tool-form-title').textContent = 'Prepare ' + item.name;
        form.scrollIntoView({ block: 'start' }); form.elements.command.focus();
        toast('Choose the installed CLI path and project access roots before enabling. Nothing was saved or started.');
      }
      if (button.dataset.catalogAdd) {
        const card = button.closest('[data-catalog]'), status = card.querySelector('[data-catalog-status]');
        button.disabled = true;
        try { const keyId = await storeKey(card, call); await call('catalog.add', { id: button.dataset.catalogAdd, keyId }); render(); toast('Tool added.'); }
        catch (error) { status.textContent = error.message; }
        finally { if (button.isConnected) button.disabled = false; }
      }
      if (button.hasAttribute('data-integration-refresh')) { await call('integrations.refresh'); render(); }
      if (button.hasAttribute('data-unity-folder')) {
        const field = button.closest('[data-integration]').querySelector('[name=projectPath]');
        const folder = await call('pickFolder', { cwd: field.value }); if (folder) field.value = folder;
      }
      if (button.dataset.integrationSetup) {
        const card = button.closest('[data-integration]');
        const payload = { id: button.dataset.integrationSetup, projectPath: card.querySelector('[name=projectPath]')?.value, backendUrl: card.querySelector('[name=backendUrl]')?.value };
        button.disabled = true;
        try { payload.keyId = await storeKey(card, call) || undefined; await call('integrations.setup', payload); render(); toast('Tool connected.'); }
        catch (error) { card.querySelector('[data-integration-status]').textContent = error.message; }
        finally { if (button.isConnected) button.disabled = false; }
      }
      if (button.dataset.browseTool) {
        const connection = getState().shared.connections.find(x => x.id === button.dataset.browseTool);
        dialog.innerHTML = `<div class="dialog-heading"><h2 id="tool-catalog-title">${e(connection?.name || 'Tools')}</h2><button type="button" class="icon-button" data-close-catalog aria-label="Close tools">×</button></div><p class="catalog-state" role="status">Loading tools…</p><div class="catalog-tools"></div>`;
        dialog.showModal();
        try {
          const tools = await call('tools.catalog', button.dataset.browseTool);
          const failures = tools.filter(x => x.error), available = tools.filter(x => !x.error);
          dialog.querySelector('.catalog-state').textContent = failures.length ? failures[0].error : `${available.length} tools available to your agents.`;
          dialog.querySelector('.catalog-tools').innerHTML = available.map(tool => `<details><summary>${e(tool.name)}</summary><p>${e(tool.description)}</p><pre>${e(JSON.stringify(tool.inputSchema, null, 2))}</pre></details>`).join('');
        } catch (error) { dialog.querySelector('.catalog-state').textContent = error.message; }
      }
      if (button.hasAttribute('data-close-catalog')) dialog.close();
    } catch (error) { toast(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest?.('[data-tool-policy]'); if (!form) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const button = form.querySelector('[type=submit]'), data = Object.fromEntries(new FormData(form)); button.disabled = true;
    try { await call('tools.policy', { id: form.dataset.toolPolicy, policy: { access: data.access, maxModel: data.maxModel || null, dailyBudget: data.dailyBudget === '' ? null : data.dailyBudget } }); render(); toast('Limits saved. Agents see them on their next task.'); }
    catch (error) { toast(error.message, true); }
    finally { if (button.isConnected) button.disabled = false; }
  }, true);
  document.addEventListener('change', async event => {
    const input = event.target; if (!input.dataset.workingGuide) return;
    input.disabled = true;
    try {
      const selected = [...document.querySelectorAll('[data-working-guide]:checked')].map(x => x.dataset.workingGuide);
      await call('shared.guides', selected);
      const preview = document.querySelector('.summary-preview pre'); if (preview) preview.textContent = getState().shared.summary;
      toast(input.checked ? 'Guide shared with your agents.' : 'Guide disabled.');
    } catch (error) { input.checked = !input.checked; toast(error.message, true); }
    finally { input.disabled = false; }
  });
}
