export function updatesUI({ call, getState, escape: e, icon, toast }) {
  function content() {
    const state = getState(), u = state.updates || { current: state.version }, r = u.release;
    return `<div class="section-label"><h2>Updates</h2><span>${e(u.current || state.version)}</span></div><p class="field-hint">${r ? `Version ${e(r.version)} is available · ${Math.ceil(r.size / 1024 / 1024)} MB` : u.checkedAt && !u.error ? 'You’re up to date.' : 'Check GitHub for a newer version.'}</p>${u.error ? `<p class="form-error" role="alert">${e(u.error)}</p>` : ''}${u.downloading ? `<progress class="update-progress" max="100" value="${u.progress}" aria-label="Update download"></progress><p role="status">Downloading · ${u.progress}%</p>` : ''}<div class="update-actions"><button class="secondary" data-update="check" ${u.checking || u.downloading ? 'disabled' : ''}>${icon('refresh')}${u.checking ? 'Checking…' : 'Check for updates'}</button>${r ? `<button class="primary" data-update="${u.downloaded ? 'install' : 'download'}" ${u.checking || u.downloading ? 'disabled' : ''}>${u.downloaded ? 'Install update' : 'Download update'}</button>` : ''}</div>${u.downloaded ? '<p class="field-hint">Download verified. Installation closes Paddock.</p>' : ''}`;
  }
  function render() { return `<section id="updates-settings" class="surface">${content()}</section>`; }
  function sync() { const host = document.getElementById('updates-settings'); if (host) { const active = document.activeElement?.dataset.update; host.innerHTML = content(); if (active) host.querySelector(`[data-update="${active}"]`)?.focus({ preventScroll: true }); } }
  document.addEventListener('click', async event => { const button = event.target.closest('[data-update]'); if (!button) return; button.disabled = true; try { await call('updates.' + button.dataset.update); } catch (error) { toast(error.message, true); } finally { sync(); } });
  return { render, sync };
}
