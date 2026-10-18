import blenderLogo from './assets/tool-logos/blender.png';
import unityLogo from './assets/tool-logos/unity.png';
import meshyLogo from './assets/tool-logos/meshy.svg';

const logos = { blender: blenderLogo, unity: unityLogo, meshy: meshyLogo };
export const toolLogo = id => Object.hasOwn(logos, id) ? `<span class="integration-mark integration-mark-${id}" aria-hidden="true"><img src="${logos[id]}" alt="" width="32" height="32"></span>` : '';

export function integrationCards(state, e) {
  return `<section class="integrations" aria-label="Built-in tools"><div class="section-label"><h2>3D tools</h2><button type="button" class="subtle" data-integration-refresh>Check installed apps</button></div><div class="integration-grid">${(state.integrations || []).map(item => {
    const note = item.id === 'blender' ? 'Installs the MCP server and enables its Blender add-on. In Blender, open N → MCP for Blender and start the server.' : item.id === 'unity' ? 'Choose a project. Dock adds Unity Pipeline so the CLI can reach the editor.' : 'Uses your Meshy account. Generating assets spends Meshy credits.';
    const status = item.job?.message || item.setupNote || (item.connected ? item.enabled ? 'Connected to Dock' : 'Disabled' : item.available ? 'Ready to set up' : item.id === 'blender' ? 'Install Blender, then check again.' : item.id === 'unity' ? 'Install Unity CLI, then check again.' : 'Meshy is missing from this build.');
    return `<article class="integration-card" data-integration="${e(item.id)}"><div class="integration-heading">${toolLogo(item.id)}<h3>${e(item.name)}</h3><button type="button" class="subtle" data-docs="${e(item.id)}">Setup guide</button></div><p>${e(item.description)}</p><p class="field-hint">${e(note)}</p>${item.id === 'unity' ? `<label>Unity project<div class="folder-input"><input name="projectPath" value="${e(item.projectPath)}" placeholder="Choose a project folder"><button type="button" data-unity-folder aria-label="Choose Unity project">…</button></div></label>` : item.id === 'meshy' ? `<label>Saved Meshy key<select name="meshyKey"><option value="">Choose a key</option>${state.vault.entries.map(key => `<option value="${e(key.id)}" ${key.id === item.keyId ? 'selected' : ''}>${e(key.label)} · ${e(key.id)}</option>`).join('')}</select></label>` : ''}<p class="integration-status" data-integration-status role="status">${e(status)}</p><div class="button-row"><button type="button" class="secondary" data-integration-setup="${e(item.id)}" ${!item.available || item.job?.busy ? 'disabled' : ''}>${item.id === 'blender' ? item.ready ? 'Update tools' : 'Set up Blender' : item.connected ? 'Save connection' : 'Connect'}</button>${item.id === 'meshy' ? '<button type="button" class="subtle" data-meshy-key>Add key</button>' : ''}</div></article>`;
  }).join('')}</div><details class="tool-brand-notices field-hint"><summary>Logo credits</summary><p>Blender and its logo belong to the Blender Foundation. Meshy and its logo belong to MESHY LLC.</p><p>Agent Dock is not sponsored by or affiliated with Unity Technologies or its affiliates. Unity and the Unity logo are trademarks or registered trademarks of Unity Technologies or its affiliates in the U.S. and elsewhere.</p></details></section>`;
}

export function workingGuides(state, e) {
  return `<section class="working-guides surface"><h2>Ways of working</h2>${(state.shared.guides || []).map(guide => `<div class="working-guide"><label class="check-row"><input type="checkbox" data-working-guide="${e(guide.id)}" ${guide.enabled ? 'checked' : ''}><span><strong>${e(guide.name)}</strong><small>${e(guide.description)}</small></span></label><details><summary>Read guide</summary><pre>${e(guide.content)}</pre></details></div>`).join('')}</section>`;
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
  document.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    try {
      if (button.hasAttribute('data-integration-refresh')) { await call('integrations.refresh'); render(); }
      if (button.hasAttribute('data-unity-folder')) {
        const field = button.closest('[data-integration]').querySelector('[name=projectPath]');
        const folder = await call('pickFolder', { cwd: field.value }); if (folder) field.value = folder;
      }
      if (button.hasAttribute('data-meshy-key')) {
        navigate('vault'); const form = document.querySelector('#vault-form');
        form.elements.provider.value = 'meshy'; form.elements.label.value = 'Meshy AI'; form.elements.key.focus();
      }
      if (button.dataset.integrationSetup) {
        const card = button.closest('[data-integration]');
        const payload = { id: button.dataset.integrationSetup, projectPath: card.querySelector('[name=projectPath]')?.value, keyId: card.querySelector('[name=meshyKey]')?.value };
        button.disabled = true;
        try { await call('integrations.setup', payload); render(); toast('Tool connected.'); }
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
