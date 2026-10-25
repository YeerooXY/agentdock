// Project suggestions never take focus from a running terminal.
export function consoleProjects({ call, getState, getView, projects, navigate, escape: e, icon, toast }) {
  const prompt = document.createElement('section');
  prompt.id = 'project-suggestion'; prompt.hidden = true; prompt.setAttribute('aria-label', 'Project suggestion');
  prompt.innerHTML = `<div><strong data-suggestion-title></strong><p>Keep its goals and progress in Projects.</p></div><div class="project-suggestion-actions"><button class="primary" data-project-setup>Set up project</button><button class="subtle" data-project-stop>Don't ask again</button></div>`;
  document.querySelector('.titlebar').after(prompt);
  const dialog = document.createElement('dialog'); dialog.id = 'console-project-picker'; dialog.setAttribute('aria-labelledby', 'console-project-title');
  dialog.innerHTML = `<form id="console-project-form"><div class="dialog-heading"><h2 id="console-project-title">Console project</h2><button type="button" class="icon-button" data-project-picker-close aria-label="Close project chooser">${icon('close')}</button></div>
    <p data-project-chat></p><p class="project-current-folder" data-project-cwd></p>
    <label>Project<select name="projectId"><option value="">No project</option></select></label>
    <label class="toggle-row" data-project-title-choice hidden><span>Use project name as chat title</span><input type="checkbox" name="useProjectName"></label>
    <div class="project-picker-links"><button type="button" class="secondary" data-project-create>${icon('plus')}New project</button><button type="button" class="subtle" data-project-view hidden>View project</button></div>
    <p class="field-hint" data-project-help></p>
    <p class="form-error" role="alert"></p><div class="project-dialog-actions"><button type="button" class="secondary" data-project-picker-close>Cancel</button><button type="submit" class="primary">Save</button></div></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  let targetId, opener, busy = false;
  const session = id => getState()?.sessions.find(x => x.id === id && !x.dismissed && (x.alive || x.restoreError));
  const project = id => getState()?.projects?.find(x => x.id === id);
  function button(s) {
    const p = project(s.projectId), label = p ? `Project: ${p.name}` : 'Add to project';
    return `<button class="icon-button console-project ${p ? 'linked' : ''}" data-console-project="${e(s.id)}" title="${e(label)}" aria-label="${e(label)}">${icon('folder')}</button>`;
  }
  function sync() {
    const state = getState(); if (!state) return;
    for (const b of document.querySelectorAll('[data-console-project]')) {
      const p = project(session(b.dataset.consoleProject)?.projectId), label = p ? `Project: ${p.name}` : 'Add to project';
      b.classList.toggle('linked', !!p); b.title = label; b.setAttribute('aria-label', label);
    }
    const view = getView(), selected = session(view.selectedId) || state.sessions.find(x => !x.dismissed && (x.alive || x.restoreError));
    const visible = state.settings.suggestProjects !== false && state.settings.setupComplete && state.mode !== 'hud' && ['consoles', 'overview'].includes(view.page) && selected && !project(selected.projectId);
    if (!visible && !prompt.hidden && prompt.contains(document.activeElement)) document.querySelector(`[data-console-project="${prompt.dataset.sessionId}"]`)?.focus({ preventScroll: true });
    prompt.hidden = !visible;
    if (visible) {
      prompt.dataset.sessionId = selected.id;
      prompt.querySelector('[data-suggestion-title]').textContent = `Add “${selected.name}” to a project?`;
    }
  }
  function options(value = '') {
    form.elements.projectId.innerHTML = '<option value="">No project</option>' + (getState().projects || []).map(p => `<option value="${e(p.id)}">${e(p.name)}${p.status === 'active' ? '' : ` (${e(p.status)})`}</option>`).join('');
    form.elements.projectId.value = project(value) ? value : '';
    form.querySelector('[data-project-view]').hidden = !form.elements.projectId.value;
    form.querySelector('[data-project-title-choice]').hidden = !form.elements.projectId.value;
    form.querySelector('[data-project-help]').textContent = form.elements.projectId.value
      ? 'This chat can read the project’s goals and progress on its next turn. Its console folder stays the same.'
      : 'No project is linked. Choose a saved project to share its goals and progress with this chat.';
  }
  function open(id, trigger = document.activeElement, selectedProject) {
    const s = session(id); if (!s) { toast('This console is no longer open.', true); return; }
    targetId = id; opener = trigger;
    form.querySelector('[data-project-chat]').textContent = s.name;
    form.querySelector('[data-project-cwd]').textContent = s.cwd;
    form.querySelector('.form-error').textContent = '';
    options(selectedProject !== undefined ? selectedProject : s.projectId);
    form.elements.useProjectName.checked = s.nameMode === 'project' || s.nameMode === 'folder' || (!s.nameMode && s.name === project(s.projectId)?.name);
    dialog.showModal(); form.elements.projectId.focus();
  }
  async function attach(id, projectId, useProjectName) {
    await call('session.project', { id, projectId: projectId || null, ...(projectId && useProjectName != null ? { useProjectName } : {}) });
    sync(); toast(projectId ? 'Chat linked. See its progress in Projects.' : 'Chat removed from project.');
  }
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    // Native dialogs can restore focus before this event. Preserve a user's
    // next focused control or a newly opened dialog instead of stealing focus.
    const focused = document.activeElement;
    if (focused && focused !== document.body && !dialog.contains(focused) && focused.getClientRects().length) return;
    if (opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true });
    else [...document.querySelectorAll('[data-console-project]')].find(b => b.dataset.consoleProject === targetId && b.getClientRects().length)?.focus({ preventScroll: true });
  });
  form.addEventListener('change', () => {
    form.querySelector('[data-project-view]').hidden = !form.elements.projectId.value;
    form.querySelector('[data-project-title-choice]').hidden = !form.elements.projectId.value;
    form.querySelector('[data-project-help]').textContent = form.elements.projectId.value
      ? 'This chat can read the project’s goals and progress on its next turn. Its console folder stays the same.'
      : 'No project is linked. Choose a saved project to share its goals and progress with this chat.';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const id = targetId, projectId = form.elements.projectId.value;
    const useProjectName = form.elements.useProjectName.checked;
    busy = true; for (const b of form.querySelectorAll('button, select, input')) b.disabled = true;
    try { await attach(id, projectId, useProjectName); dialog.close(); }
    catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { busy = false; for (const b of form.querySelectorAll('button, select, input')) b.disabled = false; }
  });
  document.addEventListener('click', async event => {
    const b = event.target.closest('button'); if (!b) return;
    try {
      if (b.dataset.consoleProject) open(b.dataset.consoleProject, b);
      if (b.hasAttribute('data-project-setup')) open(prompt.dataset.sessionId, b);
      if (b.hasAttribute('data-project-stop')) {
        b.disabled = true;
        try { await call('settings', { suggestProjects: false }); sync(); toast('Project suggestions off. Turn them on in Settings → Projects.'); }
        finally { b.disabled = false; }
      }
      if (b.hasAttribute('data-project-picker-close') && !busy) dialog.close();
      if (b.hasAttribute('data-project-view')) {
        const id = form.elements.projectId.value;
        dialog.close(); navigate('projects'); projects.reveal(id);
      }
      if (b.hasAttribute('data-project-create')) {
        const id = targetId, s = session(id), trigger = opener;
        if (!s) throw new Error('This console is no longer open.');
        dialog.close();
        projects.edit(undefined, saved => {
          attach(id, saved.id).catch(error => { open(id, trigger, saved.id); form.querySelector('.form-error').textContent = error.message; });
        }, trigger, { name: s.name, cwd: s.cwd });
      }
    } catch (error) { toast(error.message, true); }
  });
  return { button, sync };
}
