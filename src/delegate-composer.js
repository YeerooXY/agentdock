// One-line delegation field under each owner console. Enter sends the message to the
// configured dispatcher, which splits it into worker tasks; the owner approves the plan here.
// The node stays in place through output and status updates, like the worker composer.
export function delegateComposer({ call, escape: e, toast, openTask }) {
  const drafts = new Map(), plans = new Map(), forms = new Map();
  const items = job => (job.plan?.subtasks || []).filter(sub => sub.kind !== 'question').length;

  function show(key) {
    const form = forms.get(key); if (!form?.isConnected) return;
    const plan = plans.get(key), actions = form.querySelector('.delegate-actions');
    form.querySelector('[role="status"]').textContent = plan?.status || '';
    const ready = plan?.job?.state === 'plan-ready' && !plan.approving;
    if (actions.hidden === ready) {
      const hadFocus = actions.contains(document.activeElement);
      actions.hidden = !ready;
      // Approve and Review leave the page when the plan is handled; focus returns to the field.
      if (hadFocus && !ready) form.querySelector('textarea').focus({ preventScroll: true });
    }
    form.querySelector('textarea').disabled = !!plan?.busy;
  }

  function set(key, value) { plans.set(key, { ...plans.get(key), ...value }); show(key); }

  async function send(key, session, text) {
    set(key, { busy: true, job: null, status: 'Planning…' });
    try {
      const job = await call('tasks.planMessage', { text, repo: session.cwd, executionMode: 'serial' });
      const count = items(job), tasks = `${count} ${count === 1 ? 'task' : 'tasks'}`;
      if (job.autoApproved) set(key, { busy: false, job, status: `Started automatically: ${tasks}.` });
      else if (job.state === 'plan-ready') set(key, { busy: false, job, status: job.error || (count ? `Plan ready: ${tasks}.` : 'Answered. Review the plan for the reply.') });
      else set(key, { busy: false, job, status: job.error || 'Planning stopped.' });
      const form = forms.get(key), input = form?.querySelector('textarea');
      // A failed plan keeps the message so the owner can retry.
      if (input && (job.state === 'plan-ready' || job.autoApproved) && input.value.trim() === text) { input.value = ''; drafts.delete(key); fit(input); }
      // Disabling the field during planning can drop focus to the body in some engines; return it to the field.
      if (form?.isConnected && (document.activeElement === document.body || document.activeElement === input)) input.focus({ preventScroll: true });
    } catch (error) { set(key, { busy: false, status: error.message }); }
  }

  async function approve(key) {
    const job = plans.get(key)?.job; if (!job) return;
    set(key, { approving: true, status: 'Approving…' });
    try {
      await call('tasks.approveMessage', { id: job.id });
      set(key, { approving: false, job: { ...job, state: 'approved' }, status: `Approved. ${items(job)} ${items(job) === 1 ? 'task' : 'tasks'} queued.` });
    } catch (error) { set(key, { approving: false, status: '' }); toast(error.message, true); }
  }

  function fit(input) { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }

  function remove(card) {
    const form = card.querySelector('[data-delegate-composer]'); if (!form) return;
    const hadFocus = form.contains(document.activeElement);
    form.remove();
    if (hadFocus) card.querySelector('.console-grip')?.focus({ preventScroll: true });
  }

  function sync(card, session) {
    // Worker consoles have their own composer; review panels and closed consoles get none.
    if (session.taskId || session.kind === 'review' || !session.alive || !session.cwd) { remove(card); return; }
    const key = session.consoleKey || session.id;
    let form = card.querySelector('[data-delegate-composer]');
    if (form && form.dataset.delegateComposer !== key) { remove(card); form = null; }
    if (!form) {
      form = document.createElement('form'); form.dataset.delegateComposer = key; form.className = 'delegate-composer';
      form.innerHTML = `<textarea rows="1" maxlength="16000" aria-label="Delegate a task from ${e(session.name || 'this console')}" placeholder="Delegate a task. Enter sends, Shift+Enter adds a line."></textarea>
        <div class="delegate-footer"><span role="status" aria-live="polite"></span><span class="delegate-actions" hidden><button type="button" class="primary" data-delegate="approve">Approve</button><button type="button" class="secondary" data-delegate="review">Review plan</button></span></div>`;
      const input = form.querySelector('textarea'); input.value = drafts.get(key) || '';
      input.addEventListener('input', () => { drafts.set(key, input.value); fit(input); });
      input.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
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
      card.querySelector('.console-panel-body').after(form);
      forms.set(key, form);
      if (input.value) fit(input);
    }
    form.session = session;
    show(key);
  }
  return { sync };
}
