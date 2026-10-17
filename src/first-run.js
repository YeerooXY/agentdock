export function firstRun({ call, escape, icon, getState }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'first-run'; dialog.setAttribute('aria-labelledby', 'first-run-title'); dialog.setAttribute('aria-describedby', 'first-run-hint');
  document.body.append(dialog);
  let opened = false, manual = false, busy = false;
  const selected = new Set(), agents = () => getState().agents || [];
  dialog.addEventListener('cancel', event => { if (!manual || busy) event.preventDefault(); });
  function update() {
    if (!dialog.querySelector('form')) return;
    const form = dialog.querySelector('form'), select = form.elements.provider;
    for (const agent of agents()) {
      const option = select.querySelector(`[value="${agent.id}"]`);
      if (option) option.disabled = !agent.installed && !selected.has(agent.id);
      const row = dialog.querySelector(`[data-setup-agent="${agent.id}"]`); if (!row) continue;
      const status = row.querySelector('.setup-install-status'), checkbox = row.querySelector('input'), job = agent.job;
      checkbox.disabled = busy || agent.installed || !agent.installable; checkbox.checked = selected.has(agent.id);
      row.dataset.status = job?.state || (agent.installed ? 'installed' : 'available');
      status.textContent = job?.state === 'error' ? job.error : job?.state === 'installing' ? 'Installing…' : job?.state === 'queued' ? 'Waiting…' : agent.installed ? 'Installed' : !agent.installable ? agent.requirement : 'Not installed';
    }
    if (select.selectedOptions[0]?.disabled) select.value = 'shell';
    const provider = select.value, agent = agents().find(x => x.id === provider);
    dialog.querySelector('#setup-command').hidden = provider !== 'custom'; form.elements.command.required = provider === 'custom';
    dialog.querySelector('#setup-agent-hint').textContent = agent?.auth || (provider === 'shell' ? 'PowerShell is ready to use.' : 'Use any other CLI with its launch command.');
    const guide = dialog.querySelector('[data-setup-guide]'); guide.hidden = !agent; guide.dataset.docs = agent?.id || '';
    const pending = [...selected].filter(id => !agents().find(x => x.id === id)?.installed), submit = form.querySelector('[type=submit]');
    submit.disabled = busy; submit.textContent = busy ? 'Setting up…' : pending.length ? `Install ${pending.length} & ${manual ? 'save' : 'open Dock'}` : manual ? 'Save choices' : 'Open Dock';
    form.elements.provider.disabled = busy; form.elements.cwd.readOnly = busy; form.elements.launchNow.disabled = busy;
    form.elements.mobileSetup.disabled = busy; form.elements.mobileMode.disabled = busy; dialog.querySelector('#setup-mobile-mode').hidden = !form.elements.mobileSetup.checked;
    dialog.querySelector('[data-setup-refresh]').disabled = busy; dialog.querySelector('[data-setup-close]').disabled = busy;
  }
  function open(isManual = false) {
    if (dialog.open) return;
    manual = isManual; opened = true; selected.clear();
    const defaults = getState().settings.consoleDefaults;
    dialog.innerHTML = `<form id="first-run-form">
      <button type="button" class="icon-button setup-close" data-setup-close aria-label="${manual ? 'Close setup' : 'Exit Agent Dock'}">${icon('close')}</button>
      <div class="setup-star" aria-hidden="true">${icon('dock')}</div>
      <h1 id="first-run-title">${manual ? 'Set up your agents.' : 'Make yourself at home.'}</h1>
      <p id="first-run-hint">Your folder. Your agents. Ready to go.</p>
      <div class="setup-columns"><section aria-label="Workspace">
        <label>Project folder<div class="folder-input"><input name="cwd" required value="${escape(defaults.cwd)}" autofocus><button type="button" data-action="pick-folder" aria-label="Choose your first project folder">${icon('folder')}</button></div></label>
        <label>Default console<select name="provider">${agents().map(agent => `<option value="${agent.id}">${escape(agent.name)}</option>`).join('')}<option value="shell">PowerShell</option><option value="custom">Custom command</option></select></label>
        <label id="setup-command" hidden>Command<textarea name="command" rows="2" maxlength="4000" spellcheck="false" placeholder="The command to run">${escape(defaults.command)}</textarea></label>
        <p id="setup-agent-hint" class="field-hint"></p><button type="button" class="subtle" data-setup-guide data-docs="codex">Setup guide ↗</button>
        <label class="setup-check"><input type="checkbox" name="launchNow"><span>Open this console when setup finishes</span></label>
        <label class="setup-check"><input type="checkbox" name="mobileSetup"><span>Connect my Android phone next</span></label>
        <label id="setup-mobile-mode" hidden>Phone connection<select name="mobileMode"><option value="local">Same Wi-Fi</option><option value="internet">Direct internet through my router</option></select></label>
        <div class="setup-zai"><strong>Z.AI / GLM</strong><p>Choose OpenCode, then connect Z.AI in its console.</p><button type="button" class="subtle" data-docs="zai">Connection guide ↗</button></div>
      </section><section class="setup-agents" aria-label="Install agents">
        <div class="setup-agents-heading"><h2>Install agents <span class="optional">optional</span></h2><button type="button" class="subtle" data-setup-refresh>Check again</button></div>
        <p class="field-hint">Tick the ones you want. Your own account or API billing applies.</p>
        <div class="setup-agent-list">${agents().map(agent => `<div class="setup-agent" data-setup-agent="${agent.id}"><label><input type="checkbox" value="${agent.id}" data-install-agent><span><strong>${escape(agent.name)}</strong><small class="setup-install-status" role="status"></small></span></label><button type="button" class="subtle" data-docs="${agent.id}" aria-label="${escape(agent.name)} setup guide">↗</button></div>`).join('')}</div>
        <p class="setup-tools-note">Dock connects shared tools and instructions. Existing MCP settings are kept, with a backup when changed.</p>
      </section></div>
      <p class="form-error" role="alert"></p>
      <div class="setup-footer"><span>Run this again from Settings.</span><button type="submit" class="primary">Open Dock</button></div>
    </form>`;
    dialog.querySelector('[name=provider]').value = defaults.provider; update(); dialog.showModal();
  }
  dialog.addEventListener('input', () => { dialog.querySelector('.form-error').textContent = ''; });
  dialog.addEventListener('change', event => {
    if (event.target.matches('[data-install-agent]')) {
      const id = event.target.value;
      if (event.target.checked) { selected.add(id); if (dialog.querySelector('[name=provider]').value === 'shell' && selected.size === 1) dialog.querySelector('[name=provider]').value = id; }
      else selected.delete(id);
    }
    update();
  });
  dialog.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-setup-close')) { if (manual) dialog.close(); else await call('quit'); return; }
    if (!button.hasAttribute('data-setup-refresh')) return;
    button.disabled = true;
    try { await call('agents.refresh'); update(); }
    catch (error) { dialog.querySelector('.form-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  dialog.addEventListener('submit', async event => {
    event.preventDefault(); event.stopPropagation(); if (busy) return;
    const form = event.target, data = { ...Object.fromEntries(new FormData(form)), launchNow: form.elements.launchNow.checked };
    busy = true; form.querySelector('.form-error').textContent = ''; update();
    try {
      await call('setup.validate', data);
      const pending = [...selected].filter(id => !agents().find(x => x.id === id)?.installed);
      if (pending.length) {
        await call('agents.install', pending);
        if (pending.some(id => !agents().find(x => x.id === id)?.installed)) throw new Error('Some agents need another try. Retry, or untick them to continue.');
      }
      await call('setup.complete', data); dialog.close(); document.querySelector('.session-card [data-action=new]')?.focus(); if (form.elements.mobileSetup.checked) document.dispatchEvent(new CustomEvent('dock-mobile-setup', { detail: { mode: form.elements.mobileMode.value } }));
    } catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { busy = false; update(); }
  });
  return { open: () => open(true), receive() { if (!getState().settings.setupComplete && !opened) open(); else if (dialog.open) update(); } };
}
