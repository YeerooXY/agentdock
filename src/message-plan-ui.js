export function messagePlanUI({ call, escape: e, getChoices, selectJob, toast }) {
  const draft = { text: '', images: '', repo: '', checks: '' };
  let busy = false;
  const limits = new Map(), approving = new Set();
  const assignment = value => value ? `${value.accountId} / ${value.model || 'CLI default'}` : 'Not available';
  const repoOptions = () => `<option value="">Choose a folder</option>${(getChoices()?.repos || []).map(repo => `<option value="${e(repo.path)}" ${draft.repo === repo.path ? 'selected' : ''}>${e(repo.label || repo.path)}</option>`).join('')}`;
  function composer() {
    return `<details class="surface" data-message-composer><summary>Plan a message</summary><form id="message-plan-form">
      <div class="task-field"><label for="message-plan-repo">Folder</label><select id="message-plan-repo" data-message-field="repo" required>${repoOptions()}</select></div>
      <div class="task-field"><label for="message-plan-text">Message</label><textarea id="message-plan-text" data-message-field="text" maxlength="16000" rows="4" required>${e(draft.text)}</textarea></div>
      <div class="task-field"><label for="message-plan-images">Image paths</label><textarea id="message-plan-images" data-message-field="images" rows="2" placeholder="One absolute PNG, JPEG or WebP path per line">${e(draft.images)}</textarea></div>
      <div class="task-field"><label for="message-plan-checks">Checks command</label><input id="message-plan-checks" data-message-field="checks" maxlength="4000" value="${e(draft.checks)}"></div>
      <p class="field-hint">Uses the dispatcher in Settings &gt; Agents. Work starts after you approve the plan.</p>
      <button id="message-plan-submit" type="submit" class="primary" aria-disabled="${busy}">${busy ? 'Planning…' : 'Create plan'}</button><p class="form-error" role="alert"></p>
    </form></details>`;
  }
  // Model name only; the account ID stays in the details.
  const model = value => value ? (value.model || 'CLI default').split('/').pop() : 'Not available';
  function plan(job) {
    const ready = job.state === 'plan-ready', items = job.plan?.subtasks || [], parallel = job.executionMode === 'parallel';
    const lanes = items.filter(sub => sub.kind !== 'question'), execution = job.dispatchTasks?.find(entry => entry.itemId === 'lanes');
    const count = `${lanes.length} ${lanes.length === 1 ? 'task' : 'tasks'}`;
    const actions = `<div class="task-actions">${ready ? `<button type="button" class="primary" data-task-action="approveMessage" data-id="${e(job.id)}" aria-disabled="${approving.has(job.id)}">${approving.has(job.id) ? 'Approving…' : 'Approve plan'}</button>` : ''}${['planning', 'building', 'plan-ready'].includes(job.state) ? `<button type="button" data-task-action="stop" data-id="${e(job.id)}">Stop</button>` : `<button type="button" data-task-action="close" data-id="${e(job.id)}">Close</button>`}</div>`;
    return `<article class="surface task-detail message-plan" aria-labelledby="task-detail-title"><header class="message-plan-head"><div class="task-detail-heading"><h2 id="task-detail-title" tabindex="-1">Message plan</h2><span class="task-status">${e(({ 'plan-ready': 'Plan ready', 'needs-you': 'Needs you' })[job.state] || job.state)}</span></div>${actions}</header>
      <blockquote class="message-plan-request">${e(job.criteria)}</blockquote>
      <p class="message-plan-summary">${job.plan ? `${count}, ${parallel ? 'in parallel lanes' : 'run in order on the current branch'}. ` : ''}Planned by ${e(model(job.implementer))}.</p>
      ${job.error ? `<p class="form-error" role="alert">${e(job.error)}</p>` : ''}
      ${job.plan ? `${parallel && lanes.length ? `<section aria-labelledby="message-integration-title"><h3 id="message-integration-title">Lanes and integration</h3>
        <p>${lanes.length} work ${lanes.length === 1 ? 'lane' : 'lanes'}. Independent lanes use separate worktrees. Shared files and dependencies run in order.</p>
        ${ready ? `<div class="task-field"><label for="message-parallel-limit">Maximum simultaneous lanes</label><input id="message-parallel-limit" data-message-limit="${e(job.id)}" type="number" min="1" max="10" step="1" required value="${e(limits.get(job.id) ?? job.parallelLimit ?? 6)}" aria-describedby="message-lane-capacity"></div>` : `<p>Maximum simultaneous lanes: ${e(job.parallelLimit ?? 6)}.</p>`}
        <p id="message-lane-capacity" class="field-hint">Project and account capacity may reduce the number running at once.</p>
        <p>Integration: ${e(model(job.integration?.implementer))}, reviewed by ${e(model(job.integration?.reviewer))}. It merges the lane results and runs combined checks.</p>${ready ? '<p>Commit or stash local changes before starting parallel lanes.</p>' : ''}
        ${job.integration?.warnings?.length ? `<p>${e(job.integration.warnings.join(' '))}</p>` : ''}</section>` : ''}
        ${execution ? `<p><button type="button" data-task-action="select" data-id="${e(execution.taskId)}">Open lanes and integration</button></p>` : ''}<ol class="task-subtasks message-plan-items">${items.map(sub => {
        const started = !parallel && job.dispatchTasks?.find(entry => entry.itemId === sub.id);
        if (sub.kind === 'question') return `<li><h3>${e(sub.title)}</h3><p class="task-criteria">${e(sub.answer)}</p></li>`;
        return `<li><div class="message-plan-row"><h3>${e(sub.title)}</h3><span class="message-plan-tag" data-size="${e(sub.size)}">${e(sub.kind)}, ${e(sub.size)}</span></div>
          <p class="message-plan-route">${e(model(sub.implementer))} <span>reviewed by ${e(model(sub.reviewer))}</span></p>
          ${sub.kind === 'design' ? `<p class="message-plan-note">Concept selection required. ${parallel ? 'Select concepts before starting parallel lanes.' : 'The queue pauses here.'}</p>` : ''}
          <details><summary>Details</summary><p class="task-criteria">${e(sub.criteria)}</p><p>Likely files: <code>${e(sub.owns.join(', '))}</code></p>${sub.dependsOn.length ? `<p>After: ${e(sub.dependsOn.join(', '))}</p>` : ''}${sub.images.length ? `<p>Images: ${sub.images.map(image => `<code>${e(image)}</code>`).join(', ')}</p>` : ''}${sub.warnings?.length ? `<p class="message-plan-note">${e(sub.warnings.join(' '))}</p>` : ''}<p class="field-hint">Worker ${e(assignment(sub.implementer))}. Reviewer ${e(assignment(sub.reviewer))}. ${e(sub.assignmentReason || '')}</p></details>
          ${started ? `<button type="button" data-task-action="select" data-id="${e(started.taskId)}">Open task</button>` : ''}</li>`;
      }).join('')}</ol>${job.plan.contracts ? `<details class="message-plan-rules"><summary>Shared rules for every task</summary><p>${e(job.plan.contracts)}</p>${job.plan.conflicts.length ? `<p>Shared files: ${job.plan.conflicts.map(pair => `${e(pair.before)} before ${e(pair.after)}`).join(', ')}.</p>` : ''}</details>` : ''}` : '<p role="status">Planning…</p>'}</article>`;
  }
  function updateRepos() {
    const node = document.getElementById('message-plan-repo');
    if (node) node.innerHTML = repoOptions();
  }
  document.addEventListener('input', event => {
    if (event.target.dataset?.messageLimit) limits.set(event.target.dataset.messageLimit, Number(event.target.value));
    const field = event.target.dataset?.messageField;
    if (field && Object.hasOwn(draft, field)) draft[field] = event.target.value;
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (form.id !== 'message-plan-form') return;
    event.preventDefault(); if (busy) return;
    busy = true; const button = form.querySelector('button[type=submit]'); button.setAttribute('aria-disabled', 'true'); button.textContent = 'Planning…';
    form.querySelector('.form-error').textContent = '';
    try {
      const job = await call('tasks.planMessage', { text: draft.text, repo: draft.repo, images: draft.images.split(/\r?\n/).map(line => line.trim()).filter(Boolean), checks: draft.checks });
      busy = false;
      selectJob(job);
      const composer = document.querySelector('[data-message-composer]'); if (composer) composer.open = false;
      const heading = document.getElementById('task-detail-title'); heading?.focus(); heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
    } catch (error) { if (form.isConnected) form.querySelector('.form-error').textContent = error.message; else toast(error.message, true); }
    finally {
      busy = false;
      const current = document.getElementById('message-plan-submit');
      if (current) { current.setAttribute('aria-disabled', 'false'); current.textContent = 'Create plan'; }
      if (document.activeElement === document.body) (current || document.getElementById('task-detail-title'))?.focus({ preventScroll: true });
    }
  });
  function approval(job) {
    if (job?.executionMode !== 'parallel') return {};
    const value = limits.get(job.id) ?? job.parallelLimit ?? 6;
    if (!Number.isInteger(value) || value < 1 || value > 10) { document.getElementById('message-parallel-limit')?.focus(); throw Error('Run 1 to 10 lanes at once.'); }
    return { parallelLimit: value };
  }
  function setApproving(id, value) {
    if (value) approving.add(id); else approving.delete(id);
    const button = document.querySelector(`[data-task-action="approveMessage"][data-id="${CSS.escape(id)}"]`);
    if (button) { button.setAttribute('aria-disabled', String(value)); button.textContent = value ? 'Approving…' : 'Approve plan'; }
  }
  return { composer, plan, updateRepos, approval, setApproving, isApproving: id => approving.has(id) };
}
