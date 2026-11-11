// Saved prompts only edit the console's draft. Enter stays with the owner.
export function consolePrompts({ call, getState, escape: e, icon, toast, paste, agentProviders }) {
  const panel = document.createElement('section');
  panel.id = 'prompts-panel'; panel.popover = 'auto'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'prompts-title');
  panel.innerHTML = `<header><h2 id="prompts-title">Saved prompts</h2><button type="button" class="icon-button" data-prompts-close aria-label="Close saved prompts">${icon('close')}</button></header>
    <ul data-prompts-list></ul><form class="prompt-form"><label>Message<textarea name="text" rows="3" maxlength="16000"></textarea></label>
    <label>Prompt name<input name="promptName" maxlength="60"></label><label class="chooser-check" data-project-scope><input type="checkbox" name="projectOnly"><span>Only for this project</span></label>
    <p class="form-error" role="alert"></p><footer><button type="button" class="secondary" data-type>Type into console</button><button type="submit" class="primary">Save prompt</button></footer></form>`;
  document.body.append(panel);
  const form = panel.querySelector('form'), error = panel.querySelector('.form-error'), list = panel.querySelector('ul');
  let targetId = null, opener = null, stamp = '', busy = false;
  const session = id => getState()?.sessions.find(s => s.id === id && s.alive && !s.dismissed);
  const eligible = s => s && !s.taskId && (s.purpose || 'agent') === 'agent' && agentProviders().includes(s.provider);
  const prompts = () => (getState()?.prompts || []).filter(p => !p.projectId || p.projectId === session(targetId)?.projectId);
  function button(s) {
    return eligible(s) ? `<button type="button" class="prompts-toggle icon-button" data-prompts-open="${e(s.id)}" aria-haspopup="dialog" aria-label="Saved prompts for ${e(s.name)}" title="Saved prompts">${icon('file')}</button>` : '';
  }
  function render() {
    const saved = prompts(), next = JSON.stringify(saved);
    if (stamp === next) return;
    const focused = list.contains(document.activeElement), oldId = document.activeElement?.closest('[data-prompt]')?.dataset.prompt;
    stamp = next;
    list.innerHTML = saved.map(p => `<li data-prompt="${e(p.id)}"><div><strong>${e(p.name)}</strong><p>${e(p.text)}</p></div><button type="button" class="subtle" data-use>Use</button><button type="button" class="icon-button" data-remove aria-label="Delete saved prompt ${e(p.name)}">${icon('close')}</button></li>`).join('');
    if (focused) (list.querySelector(`[data-prompt="${CSS.escape(oldId || '')}"] [data-use]`) || list.querySelector('[data-use]') || form.elements.text).focus();
  }
  function place() {
    const rect = opener?.isConnected ? opener.getBoundingClientRect() : null;
    const width = Math.min(440, innerWidth - 16);
    const above = rect ? rect.top - 16 : innerHeight - 16;
    const below = rect ? innerHeight - rect.bottom - 16 : 0;
    const useAbove = above >= below;
    Object.assign(panel.style, { width: `${width}px`, maxHeight: `${Math.max(48, useAbove ? above : below)}px` });
    const height = panel.getBoundingClientRect().height;
    Object.assign(panel.style, { left: `${Math.max(8, Math.min(rect?.right - width || 8, innerWidth - width - 8))}px`, top: `${rect ? useAbove ? Math.max(8, rect.top - height - 8) : rect.bottom + 8 : 8}px` });
  }
  function sync() {
    if (targetId && panel.matches(':popover-open')) {
      if (!session(targetId)) { panel.hidePopover(); return; }
      render();
    }
  }
  function open(id, trigger) {
    if (!session(id)) return;
    if (targetId !== id) form.reset();
    targetId = id; opener = trigger; error.textContent = ''; stamp = '';
    panel.querySelector('[data-project-scope]').hidden = !session(id).projectId;
    render(); panel.showPopover(); place(); form.elements.text.focus();
  }
  async function run(action) {
    if (busy) return; busy = true; error.textContent = '';
    try { await action(); render(); } catch (failure) { error.textContent = failure.message; } finally { busy = false; }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      if (!session(targetId)) throw Error('This console is no longer open.');
      await call('prompt.save', { name: form.elements.promptName.value, text: form.elements.text.value, projectId: form.elements.projectOnly.checked ? session(targetId).projectId : null });
      toast('Prompt saved.');
    });
  });
  panel.addEventListener('click', event => {
    const b = event.target.closest('button'); if (!b) return;
    const id = b.closest('[data-prompt]')?.dataset.prompt;
    if (b.hasAttribute('data-prompts-close')) panel.hidePopover();
    else if (b.hasAttribute('data-use')) {
      form.elements.text.value = prompts().find(p => p.id === id)?.text || ''; form.elements.text.focus();
    } else if (b.hasAttribute('data-remove')) void run(() => call('prompt.remove', id));
    else if (b.hasAttribute('data-type')) {
      try {
        if (!session(targetId)) throw Error('This console is no longer open.');
        if (!form.elements.text.value.trim()) throw Error('Type a message first.');
        paste(targetId, form.elements.text.value); panel.hidePopover();
      } catch (failure) { error.textContent = failure.message; }
    }
  });
  panel.addEventListener('toggle', event => {
    if (event.newState === 'closed' && (!document.activeElement || document.activeElement === document.body || panel.contains(document.activeElement))) {
      const target = opener?.isConnected ? opener : document.querySelector(`[data-prompts-open="${CSS.escape(targetId || '')}"]`) || document.querySelector('.session-card .console-grip, #consoles-page button:not([disabled])');
      target?.focus({ preventScroll: true });
    }
  });
  let closedByToggle = false;
  document.addEventListener('pointerdown', event => {
    const b = event.target.closest?.('[data-prompts-open]');
    closedByToggle = !!b && panel.matches(':popover-open') && targetId === b.dataset.promptsOpen;
  }, true);
  document.addEventListener('click', event => {
    const b = event.target.closest?.('[data-prompts-open]');
    if (!b) return;
    if (closedByToggle) { closedByToggle = false; return; }
    open(b.dataset.promptsOpen, b);
  });
  window.addEventListener('resize', () => { if (panel.matches(':popover-open')) place(); });
  new ResizeObserver(() => { if (panel.matches(':popover-open')) place(); }).observe(panel);
  return { button, sync, open };
}
