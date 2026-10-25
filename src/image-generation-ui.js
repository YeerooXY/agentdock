export function imageGenerationUI({ call, getState, escape: e, toast }) {
  const providers = [['agent', 'Agent’s own generator first'], ['openai', 'OpenAI'], ['gemini', 'Gemini / Nano Banana'], ['meshy', 'Meshy'], ['compatible', 'Compatible image API']];
  const presets = { openai: { model: 'gpt-image-2.5-flare', keyId: 'openai' }, gemini: { model: 'gemini-nano-banana-2.1', keyId: 'gemini' } };
  function render() {
    const config = getState().shared.imageGeneration || { provider: 'agent', previewFirst: true };
    const keys = getState().vault.entries || [];
    return `<section class="surface image-generation-settings"><form id="image-generation-form"><h2>Screen previews</h2><label class="toggle-row"><span><strong>Preview vague design requests</strong><small>Try a visual idea first when you ask to “improve this screen”.</small></span><input name="previewFirst" type="checkbox" ${config.previewFirst !== false ? 'checked' : ''}></label>
      <label>Image generator<select name="provider">${providers.map(([id, name]) => `<option value="${id}" ${config.provider === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      <div data-image-api><div class="form-pair"><label>Image model<input name="model" maxlength="150" value="${e(config.model)}" placeholder="Image model name"></label><label>Saved API key<select name="keyId"><option value="">No key</option>${keys.map(k => `<option value="${e(k.id)}" ${k.id === config.keyId ? 'selected' : ''}>${e(k.label)}</option>`).join('')}${config.keyId && !keys.some(x => x.id === config.keyId) ? `<option value="${e(config.keyId)}" selected>Missing key: ${e(config.keyId)}</option>` : ''}</select></label></div><label>Or paste a new key<input type="password" name="newKey" autocomplete="off" spellcheck="false" placeholder="Saved for this image generator"></label><label data-image-endpoint>Image edit endpoint<input name="url" type="url" value="${e(config.url)}" placeholder="https://example.com/v1/images/edits"></label></div>
      <p class="field-hint" data-image-hint></p><p class="form-error" role="alert"></p><button class="primary" type="submit">Save preview settings</button></form><details class="image-auth"><summary>Meshy CLI sign-in</summary><div data-image-connection aria-live="polite">${connection()}</div></details></section>`;
  }
  function fields(reset = false) {
    const form = document.querySelector('#image-generation-form'); if (!form) return;
    const provider = form.elements.provider.value, api = ['openai', 'gemini', 'compatible'].includes(provider);
    form.querySelector('[data-image-api]').hidden = !api;
    for (const field of form.querySelectorAll('[data-image-api] input, [data-image-api] select')) field.disabled = !api;
    form.elements.model.required = api;
    form.elements.keyId.required = api && provider !== 'compatible';
    form.querySelector('[data-image-endpoint]').hidden = provider !== 'compatible'; form.elements.url.required = provider === 'compatible'; form.elements.url.disabled = provider !== 'compatible';
    if (reset) {
      const saved = getState().shared.imageGeneration, preset = saved?.provider === provider ? saved : presets[provider] || {};
      form.elements.model.value = preset.model || ''; form.elements.keyId.value = [...form.elements.keyId.options].some(x => x.value === preset.keyId) ? preset.keyId : ''; form.elements.url.value = preset.url || '';
    }
    form.querySelector('[data-image-hint]').textContent = provider === 'agent' ? 'Uses the current agent’s image tool. Meshy is the fallback if it is unavailable or fails.' : provider === 'meshy' ? 'Uses Meshy CLI sign-in below. Generating sends your screenshot and prompt to Meshy and spends credits.' : provider === 'compatible' ? 'Use an OpenAI Images JSON edit endpoint that returns base64 images. Sends the screenshot and prompt to this endpoint. Your provider may charge for generation.' : 'Generating sends the screenshot and prompt to this provider and uses your API billing. Saving these settings sends no image request.';
  }
  function connection() {
    const auth = getState().workbench?.meshyAuth || { state: 'unchecked' };
    if (auth.state === 'connected') return '<p>Meshy connected.</p>';
    if (auth.state === 'starting') return '<p>Starting Meshy sign-in…</p>';
    if (auth.state === 'waiting') return `<p>Enter this code on Meshy: <strong>${e(auth.code)}</strong></p><button class="secondary" data-image-auth="open-login">Open Meshy sign-in</button>`;
    return `<div class="wb-toolbar"><button class="subtle" data-image-auth="auth-status">Check sign-in</button><button class="secondary" data-image-auth="connect">Connect Meshy</button></div>${auth.error ? `<p role="alert">${e(auth.error)}</p>` : ''}`;
  }
  function sync() {
    const node = document.querySelector('[data-image-connection]');
    if (node) { const html = connection(); if (node.innerHTML !== html) node.innerHTML = html; }
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-image-auth]'); if (!button) return;
    button.disabled = true;
    try { await call('workbench.concept.' + button.dataset.imageAuth); sync(); }
    catch (error) { toast(error.message, true); }
    finally { if (button.isConnected) button.disabled = false; }
  });
  document.addEventListener('change', event => { if (event.target.form?.id === 'image-generation-form' && event.target.name === 'provider') fields(true); });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'image-generation-form') return;
    event.preventDefault(); const form = event.target, button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const { newKey, ...config } = Object.fromEntries(new FormData(form)); config.previewFirst = form.elements.previewFirst.checked;
      if (newKey?.trim()) { const id = config.provider === 'compatible' ? 'image-api' : config.provider; await call('vault.save', { provider: id, key: newKey.trim(), label: `${id} image key` }); config.keyId = id; form.elements.newKey.value = ''; }
      await call('images.settings', config); form.querySelector('.form-error').textContent = ''; toast('Preview settings saved.');
    } catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  function usage() {
    const entries = getState().workbench?.conceptUsage || [];
    if (!entries.length) return '';
    const work = getState().workbench, jobs = new Map(work.concepts.map(x => [x.id, x])), results = new Set(work.results.map(x => x.id));
    return `<section class="surface image-usage"><h2>Image generation</h2><p class="field-hint">Provider-reported usage. Check your provider’s billing for spending.</p><div class="table-scroll"><table><thead><tr><th>Time</th><th>Generator</th><th>Status</th><th>Input tokens</th><th>Output tokens</th><th>Credits</th><th>Details</th></tr></thead><tbody>${entries.map(x => `<tr><td>${e(new Date(x.at).toLocaleString())}</td><td>${e(x.provider || 'meshy')}${x.model ? '<small>' + e(x.model) + '</small>' : ''}</td><td>${e(x.state)}</td><td>${e(x.usage?.input ?? 'Unavailable')}</td><td>${e(x.usage?.output ?? 'Unavailable')}</td><td>${e(x.credits ?? 'Unavailable')}</td><td>${results.has(x.resultId) ? `<button class="subtle" data-wb="preview" data-id="${e(x.resultId)}">View preview</button>` : ''}${jobs.get(x.id)?.taskId && ['failed','interrupted'].includes(x.state) ? `<button class="subtle" data-wb="concept-resume" data-id="${e(x.id)}">Resume task</button>` : ''}${jobs.has(x.id) ? `<button class="subtle" data-wb="concept-delete" data-id="${e(x.id)}" ${['submitting','waiting','downloading'].includes(x.state) ? 'disabled' : ''} title="Remove prompt and job details; keep the saved image and usage record">Remove job</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  return { render, mount: fields, sync, usage };
}
