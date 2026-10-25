import { consoleTheme, frameStyles } from './console-themes.js';
import { openConsoleEffect } from './console-effects.js';
export { frameStyles } from './console-themes.js';

const skin = '<span class="console-skin" aria-hidden="true"><i class="theme-halo"></i><i class="theme-wave"></i><i class="theme-trace"></i></span>';

export function consoleAppearance({ call, getState }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'console-color-dialog';
  dialog.setAttribute('aria-labelledby', 'console-color-title');
  dialog.innerHTML = `<form><h2 id="console-color-title">Console theme</h2><fieldset><legend class="sr-only">Console theme</legend><div class="console-color-options">${[['default', 'Use default'], ...frameStyles].map(([value, label]) => `<label data-frame="${value}"><input type="radio" name="frame" value="${value}"><span class="frame-swatch" aria-hidden="true"></span><span>${label}</span></label>`).join('')}</div></fieldset><div class="console-theme-preview" data-frame="classic">${skin}<header>Theme preview</header><pre><span class="preview-prompt">&gt;</span> Open console<span class="preview-cursor" aria-hidden="true"></span></pre></div><div class="theme-preview-caption"><span data-theme-detail></span><button class="secondary" type="button" data-preview-opening>Replay opening</button></div><p class="form-error" role="alert"></p><div class="dialog-footer"><button type="button" class="secondary" data-cancel-color>Cancel</button><button type="submit" class="primary">Apply</button></div></form>`;
  document.body.append(dialog);
  let target, opener;
  const form = dialog.querySelector('form');
  function preview(play = false) {
    const style = form.elements.frame.value === 'default' ? getState().settings.trimStyle || 'classic' : form.elements.frame.value;
    const panel = dialog.querySelector('.console-theme-preview'); panel.dataset.frame = style;
    dialog.querySelector('[data-theme-detail]').textContent = consoleTheme(style).detail;
    if (play && getState().settings.launchEffect !== false) openConsoleEffect(panel, style);
  }
  form.addEventListener('change', event => { if (event.target.name === 'frame') preview(true); });
  dialog.querySelector('[data-preview-opening]').addEventListener('click', () => preview(true));
  dialog.querySelector('[data-cancel-color]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    dialog.querySelector('.launch-burst')?.remove();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    else document.querySelector(`.session-card[data-slot="${target?.slot}"] .console-color-button`)?.focus({ preventScroll: true });
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-frame-slot]');
    if (!button) return;
    opener = button;
    const slot = Number(button.dataset.frameSlot), state = getState();
    const session = state.sessions.find(x => x.slot === slot && (x.alive || x.restoreError));
    target = { slot, sessionId: session?.id || null };
    dialog.querySelector('h2').textContent = `Console ${slot} theme`;
    form.elements.frame.value = state.settings.slotTrims?.[slot] || 'default';
    form.querySelector('[value=default]').closest('label').dataset.frame = state.settings.trimStyle || 'classic';
    form.querySelector('.form-error').textContent = '';
    dialog.showModal();
    preview();
    dialog.querySelector('[data-preview-opening]').disabled = getState().settings.launchEffect === false || matchMedia('(prefers-reduced-motion: reduce)').matches;
    form.querySelector('input:checked').focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try { await call('slot.trim', { ...target, style: form.elements.frame.value }); dialog.close(); }
    catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  return {
    button: slot => `<button class="icon-button console-color-button" data-frame-slot="${slot}" aria-label="Console ${slot} theme" title="Console theme" aria-haspopup="dialog"><span class="frame-swatch" aria-hidden="true"></span></button>`,
    sync(panel, slot) {
      panel.dataset.frame = getState().settings.slotTrims?.[slot] || getState().settings.trimStyle || 'classic';
      const current = panel.querySelector(':scope > .console-skin');
      if (current && !current.querySelector('.theme-wave')) current.remove();
      if (!panel.querySelector(':scope > .console-skin')) panel.insertAdjacentHTML('afterbegin', skin);
    },
    syncSettings() {
      const settings = getState().settings, id = settings.trimStyle || 'classic';
      const sample = document.querySelector('.settings-content .console-theme-preview');
      if (sample) {
        sample.dataset.frame = id;
        sample.querySelector('header').textContent = consoleTheme(id).label;
        const detail = sample.parentElement.querySelector('.theme-detail'); if (detail) detail.textContent = consoleTheme(id).detail;
      }
      if (dialog.open) {
        form.querySelector('[value=default]').closest('label').dataset.frame = id;
        preview();
        dialog.querySelector('[data-preview-opening]').disabled = settings.launchEffect === false || matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
    },
    preview(style) {
      const id = frameStyles.some(([value]) => value === style) ? style : 'classic';
      return `<div class="console-theme-preview" data-frame="${id}">${skin}<header>${consoleTheme(id).label}</header><pre><span class="preview-prompt">&gt;</span> Open console<span class="preview-cursor" aria-hidden="true"></span></pre></div><div class="theme-preview-caption"><p class="theme-detail">${consoleTheme(id).detail}</p><button class="secondary" type="button" data-settings-replay>Replay opening</button></div>`;
    }
  };
}
