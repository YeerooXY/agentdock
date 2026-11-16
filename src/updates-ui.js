export function updatesUI({ call, getState, escape: e, icon, toast }) {
  let shown = '';
  function content() {
    const state = getState(), u = state.updates || { current: state.version }, r = u.release;
    const wait = u.checking || u.downloading ? 'disabled' : '';
    // One action slot: the update action takes the place of Check for updates.
    const kind = r ? (u.downloaded ? 'install' : 'download') : 'check';
    const label = r ? (u.downloaded ? 'Install update' : 'Download update') : `${icon('refresh')}${u.checking ? 'Checking…' : 'Check for updates'}`;
    const entering = kind !== shown && shown !== '' ? ' update-enter' : '';
    shown = kind;
    return `<div class="section-label"><h2>Updates</h2><span>${e(u.current || state.version)}</span></div><p class="field-hint">${r ? `Version ${e(r.version)} is available. ${Math.ceil(r.size / 1024 / 1024)} MB` : u.checkedAt && !u.error ? 'You’re up to date.' : 'Check GitHub for a newer version.'}</p>${u.error ? `<p class="form-error" role="alert">${e(u.error)}</p>` : ''}${u.downloading ? `<progress class="update-progress" max="100" value="${u.progress}" aria-label="Update download"></progress><p role="status">Downloading ${u.progress}%</p>` : ''}<div class="update-actions"><button class="${r ? 'primary' : 'secondary'}${entering}" data-update="${kind}" ${wait}>${label}</button></div>${u.downloaded ? '<p class="field-hint">Download verified. Installation closes Paddock.</p>' : ''}`;
  }
  function render() { return `<section id="updates-settings" class="surface">${content()}</section>`; }
  // keepFocus: the clicked button was focused; a disabled or replaced button drops focus to the page.
  function sync(keepFocus = false) {
    const host = document.getElementById('updates-settings');
    if (!host) return;
    const focused = keepFocus || host.contains(document.activeElement);
    host.innerHTML = content();
    if (focused) host.querySelector('[data-update]')?.focus({ preventScroll: true });
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-update]');
    if (!button) return;
    const focused = document.activeElement === button;
    button.disabled = true;
    try { await call('updates.' + button.dataset.update); } catch (error) { toast(error.message, true); } finally { sync(focused); }
  });
  return { render, sync };
}
