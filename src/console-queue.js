// Messages queued for an agent console are sent one at a time when its turn
// finishes. Saved prompts can be queued or typed into the console.
export function consoleQueue({ call, getState, escape: e, icon, toast, paste, agentProviders }) {
  const panel = document.createElement('section');
  panel.id = 'queue-panel'; panel.popover = 'auto'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'queue-title');
  panel.innerHTML = `<div class="queue-heading"><h2 id="queue-title">Queue</h2><button type="button" class="icon-button" data-queue-close aria-label="Close queue">${icon('close')}</button></div>
    <p class="queue-hint" data-queue-hint></p><ol class="queue-list" data-queue-list></ol>
    <form class="queue-form"><label>Message<textarea name="text" rows="3" maxlength="16000" placeholder="Sent when the current turn finishes"></textarea></label>
      <div class="queue-save" data-queue-save hidden><label>Prompt name<input name="promptName" maxlength="60" autocomplete="off"></label><label class="chooser-check" data-queue-project hidden><input type="checkbox" name="projectOnly"><span>Only for this console's project</span></label><div class="queue-buttons"><button type="button" class="secondary" data-queue-save-cancel>Cancel</button><button type="button" class="primary" data-queue-save-confirm>Save prompt</button></div></div>
      <p class="form-error" role="alert"></p>
      <div class="queue-buttons" data-queue-actions><button type="button" class="subtle" data-queue-save-open>Save as prompt</button><button type="button" class="secondary" data-queue-type title="Type into the console without sending">Type now</button><button type="submit" class="primary" data-queue-submit>Queue</button></div></form>
    <details class="queue-prompts"><summary data-queue-prompt-count>Saved prompts</summary><ul data-queue-prompts></ul></details>
    <label class="chooser-check queue-pause"><input type="checkbox" name="paused" data-queue-pause><span>Pause sending<small>Queued messages wait until you resume or send one.</small></span></label>`;
  document.body.append(panel);
  const form = panel.querySelector('form'), error = form.querySelector('.form-error');
  let targetId = null, editingId = null, opener = null, busy = false;
  const session = id => getState()?.sessions.find(x => x.id === id && x.alive && !x.dismissed);
  const eligible = s => !!s && s.alive && !s.dismissed && (s.purpose || 'agent') === 'agent' && agentProviders().includes(s.provider);
  const queue = id => getState()?.queues?.[id] || { paused: false, entries: [] };
  const prompts = s => (getState()?.prompts || []).filter(p => !p.projectId || p.projectId === s?.projectId);
  const label = count => count ? `${count} queued` : 'Queue a message';
  function button(s) {
    if (!eligible(s)) return '';
    const count = queue(s.id).entries.length;
    return `<button type="button" class="queue-toggle${count ? ' has-items' : ''}" data-queue-open="${e(s.id)}" aria-haspopup="dialog" aria-label="${e(label(count))} for ${e(s.name)}" title="Queue messages for when this turn finishes">${icon('list')}<span data-queue-count>${count ? count : ''}</span></button>`;
  }
  function sync() {
    // Cards can render before the agent list arrives; add or drop toggles here.
    for (const card of document.querySelectorAll('.session-card[data-console-id]')) {
      const s = session(card.dataset.consoleId), current = card.querySelector(':scope > [data-queue-open]');
      if (eligible(s) && !current) card.querySelector(':scope > .console-panel-body')?.insertAdjacentHTML('afterend', button(s));
      if (!eligible(s) && current) current.remove();
    }
    for (const b of document.querySelectorAll('[data-queue-open]')) {
      const s = session(b.dataset.queueOpen), count = s ? queue(s.id).entries.length : 0;
      b.classList.toggle('has-items', count > 0); b.querySelector('[data-queue-count]').textContent = count || '';
      if (s) b.setAttribute('aria-label', `${label(count)} for ${s.name}`);
    }
    if (targetId && panel.matches(':popover-open')) {
      if (!session(targetId)) { panel.hidePopover(); return; }
      renderList();
    }
  }
  function renderList() {
    const s = session(targetId), q = queue(targetId);
    panel.querySelector('#queue-title').textContent = `Queue · ${s.name}`;
    panel.querySelector('[data-queue-hint]').textContent = q.paused ? 'Paused. Nothing is sent automatically.' : 'Sent one at a time, each after the agent finishes a turn. Typing in the console first skips that turn.';
    panel.querySelector('[data-queue-pause]').checked = q.paused;
    panel.querySelector('[data-queue-list]').innerHTML = q.entries.length ? q.entries.map((x, i) => `<li data-entry="${e(x.id)}"${x.id === editingId ? ' class="editing"' : ''}><span class="queue-index">${i + 1}</span><p>${e(x.text)}</p><div class="queue-entry-actions">
      <button type="button" class="icon-button" data-queue-move="-1" aria-label="Move message ${i + 1} up" ${i ? '' : 'disabled'}>${icon('up')}</button><button type="button" class="icon-button" data-queue-move="1" aria-label="Move message ${i + 1} down" ${i < q.entries.length - 1 ? '' : 'disabled'}>${icon('down')}</button>
      <button type="button" class="subtle" data-queue-edit>Edit</button><button type="button" class="subtle" data-queue-send>Send now</button><button type="button" class="icon-button" data-queue-remove aria-label="Remove message ${i + 1}">${icon('close')}</button></div></li>`).join('') : '<li class="queue-empty">No queued messages.</li>';
    if (editingId && !q.entries.some(x => x.id === editingId)) stopEditing();
    const list = prompts(s);
    panel.querySelector('[data-queue-prompt-count]').textContent = `Saved prompts (${list.length})`;
    panel.querySelector('[data-queue-prompts]').innerHTML = list.length ? list.map(p => `<li data-prompt="${e(p.id)}"><div><strong>${e(p.name)}</strong><small>${e(p.text)}</small></div><button type="button" class="subtle" data-prompt-use>Use</button><button type="button" class="icon-button" data-prompt-remove aria-label="Delete saved prompt ${e(p.name)}">${icon('close')}</button></li>`).join('') : '<li class="queue-empty">Save a message as a prompt to reuse it in any console.</li>';
  }
  function stopEditing() {
    editingId = null; form.querySelector('[data-queue-submit]').textContent = 'Queue';
  }
  function place() {
    const anchor = opener?.isConnected ? opener.getBoundingClientRect() : null, gutter = 8;
    const width = Math.min(440, window.innerWidth - gutter * 2), height = panel.getBoundingClientRect().height || 320;
    const left = anchor ? Math.max(gutter, Math.min(anchor.right - width, window.innerWidth - width - gutter)) : (window.innerWidth - width) / 2;
    const top = anchor && anchor.top - height - gutter >= gutter ? anchor.top - height - gutter : Math.max(gutter, Math.min(anchor ? anchor.bottom + gutter : gutter, window.innerHeight - height - gutter));
    Object.assign(panel.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${window.innerHeight - gutter * 2}px` });
  }
  function open(id, trigger) {
    if (!session(id)) { toast('This console is no longer open.', true); return; }
    if (targetId !== id) { form.reset(); stopEditing(); form.querySelector('[data-queue-save]').hidden = true; }
    targetId = id; opener = trigger; error.textContent = '';
    renderList(); panel.showPopover(); place(); form.elements.text.focus();
  }
  async function run(action) {
    if (busy) return; busy = true; error.textContent = '';
    try { await action(); } catch (failure) { error.textContent = failure.message; } finally { busy = false; }
  }
  panel.addEventListener('toggle', event => {
    if (event.newState === 'closed' && opener?.isConnected && (!document.activeElement || document.activeElement === document.body || panel.contains(document.activeElement))) opener.focus({ preventScroll: true });
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = form.elements.text.value;
    run(async () => {
      if (editingId) await call('queue.edit', { id: targetId, entryId: editingId, text });
      else await call('queue.add', { id: targetId, text });
      form.elements.text.value = ''; stopEditing();
    });
  });
  form.elements.text.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); form.requestSubmit(); } });
  panel.addEventListener('change', event => {
    if (event.target.matches('[data-queue-pause]')) run(() => call('queue.pause', { id: targetId, paused: event.target.checked }));
  });
  panel.addEventListener('click', event => {
    const b = event.target.closest('button'); if (!b) return;
    const entryId = b.closest('[data-entry]')?.dataset.entry, promptId = b.closest('[data-prompt]')?.dataset.prompt, saveRow = form.querySelector('[data-queue-save]');
    if (b.hasAttribute('data-queue-close')) panel.hidePopover();
    else if (b.dataset.queueMove) run(() => call('queue.move', { id: targetId, entryId, offset: Number(b.dataset.queueMove) }));
    else if (b.hasAttribute('data-queue-remove')) run(() => call('queue.remove', { id: targetId, entryId }));
    else if (b.hasAttribute('data-queue-send')) run(async () => { await call('queue.send', { id: targetId, entryId }); toast('Message sent.'); });
    else if (b.hasAttribute('data-queue-edit')) {
      editingId = entryId; form.elements.text.value = queue(targetId).entries.find(x => x.id === entryId)?.text || '';
      form.querySelector('[data-queue-submit]').textContent = 'Save'; renderList(); form.elements.text.focus();
    } else if (b.hasAttribute('data-queue-type')) {
      const text = form.elements.text.value;
      if (!text.trim()) { error.textContent = 'Type a message first.'; return; }
      try { paste(targetId, text); } catch (failure) { error.textContent = failure.message; return; }
      form.elements.text.value = ''; stopEditing(); panel.hidePopover(); toast('Typed into the console. Press Enter there to send.');
    } else if (b.hasAttribute('data-queue-save-open')) {
      if (!form.elements.text.value.trim()) { error.textContent = 'Type the prompt text first.'; return; }
      const s = session(targetId); saveRow.hidden = false;
      form.querySelector('[data-queue-project]').hidden = !s?.projectId; form.elements.projectOnly.checked = false;
      form.querySelector('[data-queue-actions]').hidden = true; form.elements.promptName.focus();
    } else if (b.hasAttribute('data-queue-save-cancel')) { saveRow.hidden = true; form.querySelector('[data-queue-actions]').hidden = false; }
    else if (b.hasAttribute('data-queue-save-confirm')) run(async () => {
      const s = session(targetId);
      await call('prompt.save', { name: form.elements.promptName.value, text: form.elements.text.value, projectId: form.elements.projectOnly.checked ? s?.projectId : null });
      form.elements.promptName.value = ''; saveRow.hidden = true; form.querySelector('[data-queue-actions]').hidden = false; toast('Prompt saved.');
    });
    else if (b.hasAttribute('data-prompt-use')) {
      form.elements.text.value = (getState()?.prompts || []).find(p => p.id === promptId)?.text || '';
      stopEditing(); form.elements.text.focus();
    } else if (b.hasAttribute('data-prompt-remove')) run(() => call('prompt.remove', promptId));
  });
  // Light dismiss closes the panel on pointerdown, before the toggle's click.
  let closedByToggle = false;
  document.addEventListener('pointerdown', event => { const b = event.target.closest?.('[data-queue-open]'); closedByToggle = !!b && panel.matches(':popover-open') && targetId === b.dataset.queueOpen; }, true);
  document.addEventListener('click', event => {
    const b = event.target.closest?.('[data-queue-open]'); if (!b) return;
    if (closedByToggle || (panel.matches(':popover-open') && targetId === b.dataset.queueOpen)) { closedByToggle = false; panel.hidePopover(); return; }
    open(b.dataset.queueOpen, b);
  });
  window.addEventListener('resize', () => { if (panel.matches(':popover-open')) place(); });
  // Adding messages or opening saved prompts changes the height; keep it on screen.
  new ResizeObserver(() => { if (panel.matches(':popover-open')) place(); }).observe(panel);
  return { button, sync, open };
}
