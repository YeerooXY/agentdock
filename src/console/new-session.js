export function newSessionDialog(session, trigger, { call, opened }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'console-chooser';
  dialog.setAttribute('aria-label', 'New session');
  dialog.innerHTML = `<form><div class="dialog-heading"><h2>New session</h2></div><label>Handoff<textarea name="handoff" rows="6" maxlength="4000" placeholder="Current task, decisions, checks and next steps"></textarea></label><p>The new console receives this handoff and the project map hint. The current console stays open.</p><p class="form-error" role="alert"></p><div class="dialog-footer"><button type="button" class="secondary">Cancel</button><button type="submit" class="primary">Open session</button></div></form>`;
  const form = dialog.querySelector('form');
  dialog.querySelector('button[type="button"]').onclick = () => dialog.close();
  let next = null;
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (next) opened(next);
    else if (trigger.isConnected) trigger.focus();
    else document.querySelector(`[data-console-id="${session.id}"] button`)?.focus();
  });
  form.onsubmit = async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try { next = await call('session.fresh', { id: session.id, launchId: session.launchId, handoff: form.elements.handoff.value }); dialog.close(); }
    catch (error) { form.querySelector('.form-error').textContent = error.message; submit.disabled = false; submit.focus(); }
  };
  document.body.append(dialog); dialog.showModal(); form.elements.handoff.focus();
}
