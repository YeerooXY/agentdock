export function firstRun({ call, escape, icon, getState }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'first-run';
  dialog.setAttribute('aria-labelledby', 'first-run-title');
  dialog.setAttribute('aria-describedby', 'first-run-hint');
  document.body.append(dialog);
  dialog.addEventListener('cancel', event => event.preventDefault());
  let opened = false;

  function agentFields() {
    const form = dialog.querySelector('form'), provider = form.elements.provider.value;
    dialog.querySelector('#setup-command').hidden = provider !== 'custom';
    form.elements.command.required = provider === 'custom';
    const guide = dialog.querySelector('[data-docs]');
    guide.hidden = !['codex', 'claude'].includes(provider);
    guide.dataset.docs = provider;
    dialog.querySelector('#setup-agent-hint').textContent = provider === 'shell' ? 'PowerShell is ready to use.' : provider === 'custom' ? 'Run another CLI with your own command.' : 'Sign in when your first console opens.';
  }
  function updateAgents() {
    const state = getState(), select = dialog.querySelector('[name=provider]');
    for (const provider of ['codex', 'claude']) {
      const option = select.querySelector(`[value=${provider}]`);
      option.disabled = !state.capabilities[provider];
      option.textContent = `${provider === 'codex' ? 'Codex' : 'Claude Code'}${option.disabled ? ' — install first' : ''}`;
    }
    if (select.selectedOptions[0]?.disabled) select.value = 'shell';
    dialog.querySelector('#setup-missing').hidden = state.capabilities.codex && state.capabilities.claude;
    for (const provider of ['codex', 'claude']) dialog.querySelector(`#setup-missing [data-docs=${provider}]`).hidden = !!state.capabilities[provider];
    agentFields();
  }
  dialog.addEventListener('input', () => { dialog.querySelector('.form-error').textContent = ''; });
  dialog.addEventListener('change', event => { if (event.target.name === 'provider') agentFields(); dialog.querySelector('.form-error').textContent = ''; });
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('[data-setup-refresh]');
    if (!button) return;
    button.disabled = true;
    try { await call('agents.refresh'); updateAgents(); }
    catch (error) { dialog.querySelector('.form-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  dialog.addEventListener('submit', async event => {
    event.preventDefault(); event.stopPropagation();
    const form = event.target, submit = form.querySelector('[type=submit]');
    submit.disabled = true; form.querySelector('.form-error').textContent = '';
    try { await call('setup.complete', Object.fromEntries(new FormData(form))); dialog.close(); document.querySelector('.session-card [data-action=new]')?.focus(); }
    catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { submit.disabled = false; }
  });
  return {
    receive() {
      if (getState().settings.setupComplete) { if (dialog.open) dialog.close(); return; }
      if (opened) return;
      opened = true;
      const defaults = getState().settings.consoleDefaults;
      dialog.innerHTML = `<form id="first-run-form">
        <button type="button" class="icon-button setup-close" data-action="quit" aria-label="Exit Agent Dock">${icon('close')}</button>
        <div class="setup-star" aria-hidden="true">${icon('star')}</div>
        <h1 id="first-run-title">Make yourself at home.</h1>
        <p id="first-run-hint">Choose where your consoles open.</p>
        <label>Project folder<div class="folder-input"><input name="cwd" required value="${escape(defaults.cwd)}" autofocus><button type="button" data-action="pick-folder" aria-label="Choose your first project folder">${icon('folder')}</button></div></label>
        <label>Default console<select name="provider"><option value="codex">Codex</option><option value="claude">Claude Code</option><option value="shell">PowerShell</option><option value="custom">Custom command</option></select></label>
        <label id="setup-command" hidden>Command<textarea name="command" rows="2" maxlength="4000" spellcheck="false" placeholder="The command to run"></textarea></label>
        <div class="setup-agent-note"><p id="setup-agent-hint" class="field-hint"></p><button type="button" class="subtle" data-docs="codex">Setup guide ↗</button></div>
        <div id="setup-missing"><span>Need an agent?</span><button type="button" class="subtle" data-docs="codex">Get Codex ↗</button><button type="button" class="subtle" data-docs="claude">Get Claude ↗</button><button type="button" class="subtle" data-setup-refresh>Check again</button></div>
        <p class="form-error" role="alert"></p>
        <div class="setup-footer"><span>You can change these in Settings.</span><button type="submit" class="primary">Open Dock ${icon('arrow')}</button></div>
      </form>`;
      dialog.querySelector('[name=provider]').value = defaults.provider;
      updateAgents(); dialog.showModal();
    }
  };
}
