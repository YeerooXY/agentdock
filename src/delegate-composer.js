// Plan mode: a field under an owner console, opened from a header button. Enter sends the message to
// the configured dispatcher, which splits it into worker tasks; the owner approves the plan here.
// The field keeps its node, draft and plan status through output and status re-renders.
export function delegateComposer({ call, escape: e, toast, openTask, icon = () => '' }) {
  const drafts = new Map(), plans = new Map(), forms = new Map(), open = new Set();
  let nextId = 0;
  const items = job => (job.plan?.subtasks || []).filter(sub => sub.kind !== 'question').length;
  const tasks = count => `${count} ${count === 1 ? 'task' : 'tasks'}`;

  function show(key) {
    const form = forms.get(key); if (!form?.isConnected) return;
    const plan = plans.get(key), actions = form.querySelector('.delegate-actions');
    form.querySelector('[role="status"]').textContent = plan?.status || '';
    const ready = plan?.job?.state === 'plan-ready' && !plan.approving;
    if (actions.hidden === ready) {
      const hadFocus = actions.contains(document.activeElement);
      actions.hidden = !ready;
      // Approve and Review leave when the plan is handled; focus returns to the field.
      if (hadFocus && !ready) form.querySelector('textarea').focus({ preventScroll: true });
    }
    form.querySelector('textarea').disabled = !!plan?.busy;
    // A waiting plan stays visible on the header button while the field is closed.
    form.toggle?.classList.toggle('has-plan', !!plan?.busy || ready);
  }

  function set(key, value) { plans.set(key, { ...plans.get(key), ...value }); show(key); }

  async function send(key, session, text) {
    set(key, { busy: true, job: null, status: 'Planning…' });
    try {
      const job = await call('tasks.planMessage', { text, repo: session.cwd, executionMode: 'serial', ...(session.accountId ? { accountId: session.accountId } : {}) });
      const count = items(job);
      if (job.autoApproved) set(key, { busy: false, job, status: `Started automatically: ${tasks(count)}.` });
      else if (job.state === 'plan-ready') set(key, { busy: false, job, status: job.error || (count ? `Plan ready: ${tasks(count)}.` : 'Answered. Review the plan for the reply.') });
      else set(key, { busy: false, job, status: job.error || 'Planning stopped.' });
      const form = forms.get(key), input = form?.querySelector('textarea');
      // A failed plan keeps the message so the owner can retry.
      if (input && (job.state === 'plan-ready' || job.autoApproved) && input.value.trim() === text) { input.value = ''; drafts.delete(key); fit(input); }
      // Disabling the field during planning can drop focus to the body in some engines; return it to the field.
      if (form?.isConnected && !form.hidden && (document.activeElement === document.body || document.activeElement === input)) input.focus({ preventScroll: true });
    } catch (error) { set(key, { busy: false, status: error.message }); }
  }

  async function approve(key) {
    const job = plans.get(key)?.job; if (!job) return;
    set(key, { approving: true, status: 'Approving…' });
    try {
      await call('tasks.approveMessage', { id: job.id });
      set(key, { approving: false, job: { ...job, state: 'approved' }, status: `Approved. ${tasks(items(job))} queued.` });
    } catch (error) { set(key, { approving: false, status: '' }); toast(error.message, true); }
  }

  function fit(input) { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }

  function setOpen(key, value, { focus = true } = {}) {
    const form = forms.get(key); if (!form) return;
    if (value) open.add(key); else open.delete(key);
    const wasInside = form.contains(document.activeElement);
    form.hidden = !value;
    form.toggle.setAttribute('aria-pressed', String(value));
    if (value && focus) form.querySelector('textarea').focus({ preventScroll: true });
    if (!value && wasInside) form.toggle.focus({ preventScroll: true });
  }

  function remove(card) {
    const form = card.querySelector('[data-delegate-composer]'), toggle = card.querySelector('[data-delegate-toggle]');
    const hadFocus = form?.contains(document.activeElement) || toggle === document.activeElement;
    form?.remove(); toggle?.remove();
    if (hadFocus) card.querySelector('.console-grip')?.focus({ preventScroll: true });
  }

  function build(card, session, key) {
    const label = e(session.name || 'this console');
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'icon-button delegate-toggle'; toggle.dataset.delegateToggle = key;
    toggle.title = 'Plan mode'; toggle.setAttribute('aria-label', `Plan mode for ${session.name || 'this console'}`); toggle.setAttribute('aria-pressed', 'false');
    toggle.innerHTML = icon('list');
    const form = document.createElement('form');
    form.dataset.delegateComposer = key; form.className = 'delegate-composer'; form.hidden = true; form.id = `delegate-composer-${++nextId}`;
    toggle.setAttribute('aria-controls', form.id);
    form.innerHTML = `<textarea rows="1" maxlength="16000" aria-label="Plan a longer task from ${label}" title="Enter sends, Shift+Enter adds a line" placeholder="Plan a longer task"></textarea>
      <div class="delegate-footer"><span role="status" aria-live="polite"></span><span class="delegate-actions" hidden><button type="button" class="primary" data-delegate="approve">Approve</button><button type="button" class="secondary" data-delegate="review">Review plan</button></span></div>`;
    form.toggle = toggle;
    const input = form.querySelector('textarea'); input.value = drafts.get(key) || '';
    input.addEventListener('input', () => { drafts.set(key, input.value); fit(input); });
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(key, false); return; }
      if (event.target !== input || event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      event.preventDefault(); form.requestSubmit();
    });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text || plans.get(key)?.busy) return;
      send(key, form.session, text);
    });
    form.addEventListener('click', event => {
      const action = event.target.closest('[data-delegate]')?.dataset.delegate;
      if (action === 'approve') approve(key);
      if (action === 'review' && plans.get(key)?.job) openTask(plans.get(key).job);
    });
    toggle.addEventListener('click', () => setOpen(key, form.hidden));
    const header = card.querySelector('.console-panel-header'), anchor = header?.querySelector('[data-action="toggle-console"]');
    if (anchor) anchor.before(toggle); else header?.append(toggle);
    card.querySelector('.console-panel-body').after(form);
    forms.set(key, form);
    if (input.value) fit(input);
    return form;
  }

  function sync(card, session) {
    // Worker consoles have their own composer; review panels and closed consoles get none.
    if (session.taskId || session.kind === 'review' || !session.alive || !session.cwd) { remove(card); return; }
    const key = session.consoleKey || session.id;
    let form = card.querySelector('[data-delegate-composer]');
    if (form && form.dataset.delegateComposer !== key) { remove(card); form = null; }
    if (!form || !card.querySelector('[data-delegate-toggle]')) { remove(card); form = build(card, session, key); setOpen(key, open.has(key), { focus: false }); }
    form.session = session;
    show(key);
  }
  return { sync };
}
