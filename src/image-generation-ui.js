export function imageGenerationUI({ call, getState, escape: e, toast }) {
  const providers = [['agent', 'Agent’s own generator first'], ['openai', 'OpenAI'], ['gemini', 'Gemini / Nano Banana'], ['meshy', 'Meshy'], ['compatible', 'Compatible image API']];
  const presets = { openai: { model: 'gpt-image-2.5-flare', keyId: 'openai' }, gemini: { model: 'gemini-nano-banana-2.1', keyId: 'gemini' } };
  function render() {
    const config = getState().shared.imageGeneration || { provider: 'agent', previewFirst: true };
    const keys = getState().vault.entries || [];
    return `<section class="surface image-generation-settings"><form id="image-generation-form"><h2>Screen previews</h2><label class="toggle-row"><span><strong>Preview vague design requests</strong><small>Try a visual idea first when you ask to “improve this screen”.</small></span><input name="previewFirst" type="checkbox" ${config.previewFirst !== false ? 'checked' : ''}></label>
      <label>Image generator<select name="provider">${providers.map(([id, name]) => `<option value="${id}" ${config.provider === id ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      <div data-image-api><div class="form-pair"><label>Image model<input name="model" maxlength="150" value="${e(config.model)}" placeholder="Image model name"></label><label>Saved API key<select name="keyId"><option value="">No key</option>${keys.map(k => `<option value="${e(k.id)}" ${k.id === config.keyId ? 'selected' : ''}>${e(k.label)}</option>`).join('')}${config.keyId && !keys.some(x => x.id === config.keyId) ? `<option value="${e(config.keyId)}" selected>Missing key: ${e(config.keyId)}</option>` : ''}</select></label></div><label data-image-endpoint>Image edit endpoint<input name="url" type="url" value="${e(config.url)}" placeholder="https://example.com/v1/images/edits"></label><button type="button" class="subtle" data-page="vault">Add key in Keys</button></div>
      <p class="field-hint" data-image-hint></p><p class="form-error" role="alert"></p><button class="primary" type="submit">Save preview settings</button></form></section>`;
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
    form.querySelector('[data-image-hint]').textContent = provider === 'agent' ? 'Uses the current agent’s image tool. Meshy is the fallback if it is unavailable or fails.' : provider === 'meshy' ? 'Uses Meshy CLI sign-in from Website review. Generating sends your screenshot and prompt to Meshy and spends credits.' : provider === 'compatible' ? 'Use an OpenAI Images JSON edit endpoint that returns base64 images. Sends the screenshot and prompt to this endpoint. Your provider may charge for generation.' : 'Generating sends the screenshot and prompt to this provider and uses your API billing. Saving these settings sends no image request.';
  }
  document.addEventListener('change', event => { if (event.target.form?.id === 'image-generation-form' && event.target.name === 'provider') fields(true); });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'image-generation-form') return;
    event.preventDefault(); const form = event.target, button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const config = Object.fromEntries(new FormData(form)); config.previewFirst = form.elements.previewFirst.checked;
      await call('images.settings', config); form.querySelector('.form-error').textContent = ''; toast('Preview settings saved.');
    } catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  function usage() {
    const entries = getState().workbench?.conceptUsage || [];
    if (!entries.length) return '';
    const work = getState().workbench, jobs = new Set(work.concepts.map(x => x.id)), results = new Set(work.results.map(x => x.id));
    return `<section class="surface image-usage"><h2>Image generation</h2><p class="field-hint">Provider-reported usage. API image spending is separate from the text API estimates above; check your provider’s billing.</p><div class="table-scroll"><table><thead><tr><th>Time</th><th>Generator</th><th>Status</th><th>Input tokens</th><th>Output tokens</th><th>Credits</th><th>Details</th></tr></thead><tbody>${entries.map(x => `<tr><td>${e(new Date(x.at).toLocaleString())}</td><td>${e(x.provider || 'meshy')}${x.model ? '<small>' + e(x.model) + '</small>' : ''}</td><td>${e(x.state)}</td><td>${e(x.usage?.input ?? 'Unavailable')}</td><td>${e(x.usage?.output ?? 'Unavailable')}</td><td>${e(x.credits ?? 'Unavailable')}</td><td>${results.has(x.resultId) ? `<button class="subtle" data-wb="preview" data-id="${e(x.resultId)}">View preview</button>` : ''}${jobs.has(x.id) ? `<button class="subtle" data-wb="concept-delete" data-id="${e(x.id)}" ${['submitting','waiting','downloading'].includes(x.state) ? 'disabled' : ''} title="Remove prompt and job details; keep the saved image and usage record">Remove job</button>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  return { render, mount: fields, usage };
}
