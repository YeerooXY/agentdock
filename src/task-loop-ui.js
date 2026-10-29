import './task-loop.css';

export function taskLoopUI({ call, getState, getPage, escape: e, renderPage, toast, openResult }) {
  let choices = null, selected = '', detailStamp = '', listStamp = '', announcement = '', request = 0;
  const planDrafts = new Map();
  const running = job => ['planning', 'reviewing-plan', 'building', 'implementing', 'checking', 'reviewing'].includes(job.state);
  const jobs = () => getState()?.tasks || [];
  const status = value => ({ 'needs-you': 'Needs you', 'not-set': 'Not set', 'plan-ready': 'Plan ready', 'reviewing-plan': 'Reviewing plan', 'changes-requested': 'Changes requested', approve: 'Approved', unclear: 'No clear verdict', done: 'Done' }[value] || value?.replace(/^./, letter => letter.toUpperCase()) || 'Not run');
  const chip = value => `<span class="task-status" data-status="${e(value)}">${e(status(value))}</span>`;
  const elapsed = value => value == null ? 'Running' : `${Math.floor(value / 60000)}m ${Math.floor(value / 1000) % 60}s`;
  const count = value => value == null ? 'not reported' : Number(value).toLocaleString();
  const usage = value => value ? `${count(value.inputTokens)} input / ${count(value.outputTokens)} output tokens${value.cachedInputTokens != null ? ` / ${count(value.cachedInputTokens)} cached input` : ''}${value.reportedCost != null ? ` / OpenCode reported cost $${value.reportedCost}` : ''}` : 'Usage not reported';
  const time = value => value.elapsedMs == null && value.startedAt ? `data-task-elapsed="${value.startedAt}"` : '';
  const options = (items, value) => items.map(item => `<option value="${e(item.id ?? item.path)}" ${(item.id ?? item.path) === value ? 'selected' : ''}>${e(item.label)}</option>`).join('');
  function list() {
    return jobs().length ? jobs().map(job => `<li><button type="button" data-task-action="select" data-id="${e(job.id)}" aria-current="${job.id === selected ? 'true' : 'false'}"><strong>${e(job.title)}</strong>${chip(job.state)}<small>${job.split ? `${(job.subtasks || []).filter(sub => sub.state === 'merged').length}/${job.subtasks?.length || 0} subtasks` : `${job.rounds.length}/${job.maxRounds} rounds`}</small></button></li>`).join('') : '';
  }
  function planDraft(job) {
    if (!planDrafts.has(job.id)) planDrafts.set(job.id, { assignments: Object.fromEntries((job.subtasks || []).map(sub => [sub.subtaskId, { accountId: sub.implementer?.accountId || '', model: sub.implementer?.model || '' }])), parallelLimit: job.parallelLimit || 2, implementer: { accountId: job.implementer.accountId, model: job.implementer.model || '' } });
    const settings = planDrafts.get(job.id);
    for (const sub of job.subtasks || []) if (!Object.hasOwn(settings.assignments, sub.subtaskId)) settings.assignments[sub.subtaskId] = { accountId: sub.implementer?.accountId || '', model: sub.implementer?.model || '' };
    return settings;
  }
  function plan(job) {
    if (!job.split) return '';
    const editable = job.state === 'plan-ready', settings = planDraft(job);
    const accounts = choices?.implementers || [];
    const accountOptions = current => options(accounts.some(account => account.id === current?.accountId) || !current?.accountId ? accounts : [...accounts, { id: current.accountId, label: current.accountId }], current?.accountId);
    const assignmentFields = (id, value, sub = '') => `<div class="task-form-pair"><div class="task-field"><label for="${id}-account">${sub ? 'Implementer for ' + e(sub) : 'Main implementer'}</label><select id="${id}-account" data-plan-field="accountId" data-sub="${e(sub)}"><option value="">Choose an agent</option>${accountOptions(value)}</select></div><div class="task-field"><label for="${id}-model">${sub ? 'Model for ' + e(sub) : 'Main implementer model'}</label><input id="${id}-model" data-plan-field="model" data-sub="${e(sub)}" maxlength="120" value="${e(value?.model || '')}" placeholder="CLI default; required for OpenCode"></div></div>`;
    return `<section class="task-plan" aria-labelledby="task-plan-title"><h3 id="task-plan-title">Plan</h3>
      <p>${job.planReview?.state === 'not-set' ? 'Plan not reviewed (No review).' : job.planReview?.verdict ? `Plan review: ${e(status(job.planReview.verdict))}.` : 'Plan review pending.'}</p>
      <details data-task-details="contracts"><summary>Contracts</summary><p class="task-criteria">${e(job.plan?.contracts || 'Available after planning.')}</p></details>
      ${(job.planRounds || []).some(round => round.review?.findings?.length || round.planner?.errors?.length || round.repair?.errors?.length) ? `<details data-task-details="plan-findings"><summary>Plan review findings and validation</summary>${job.planRounds.map(round => `<h4>Plan round ${round.number}</h4><ul>${[...(round.planner?.errors || []), ...(round.repair?.errors || []), ...(round.review?.findings || [])].map(finding => `<li>${e(finding)}</li>`).join('')}</ul>`).join('')}</details>` : ''}
      <ol class="task-subtasks">${(job.subtasks || []).map(sub => `<li><div class="task-detail-heading"><h4>${e(sub.title)}</h4>${chip(sub.state)}</div><p class="task-criteria">${e(sub.criteria)}</p>
        <p>Owns: <code>${e(sub.owns.join(', '))}</code></p><p>Dependencies: ${e(sub.dependsOn.join(', ') || 'None')}</p>
        ${editable ? assignmentFields(`task-sub-${sub.subtaskId}`, settings.assignments[sub.subtaskId], sub.subtaskId) : `<p>Implementer: ${e(sub.implementer?.label || 'Not assigned')} / ${e(sub.implementer?.model || 'CLI default')}</p>`}
        <p class="field-hint">${e(sub.assignmentReason || '')}</p><p>${sub.rounds.length} rounds · <span ${sub.runStartedAt ? `data-task-elapsed="${sub.runStartedAt - (sub.elapsedMs || 0)}"` : ''}>${e(elapsed(sub.runStartedAt ? Date.now() - sub.runStartedAt + (sub.elapsedMs || 0) : sub.elapsedMs || 0))}</span></p>
        ${sub.error ? `<p class="form-error">${e(sub.error)}</p>` : ''}${sub.unresolved?.length ? `<ul>${sub.unresolved.map(item => `<li>${e(item)}</li>`).join('')}</ul>` : ''}
        <a href="#task-sub-${e(sub.subtaskId)}-diff" data-task-action="subtask-diff" data-sub="${e(sub.subtaskId)}">View diff for ${e(sub.title)}</a>
        <details id="task-sub-${e(sub.subtaskId)}-diff" data-task-details="sub-diff-${e(sub.subtaskId)}"><summary>Subtask diff</summary><pre tabindex="0" aria-label="Diff for ${e(sub.title)}">${e(sub.finalDiff || 'No subtask changes.')}</pre></details>
        ${sub.rounds.length ? `<details data-task-details="sub-rounds-${e(sub.subtaskId)}"><summary>Rounds for ${e(sub.title)}</summary>${sub.rounds.map(round => `<h4>Round ${round.number}</h4>${step('Implement', round.implement, `${sub.subtaskId}-${round.number}`)}${step('Checks', round.check, `${sub.subtaskId}-${round.number}`)}${step('Review', round.review, `${sub.subtaskId}-${round.number}`)}`).join('')}</details>` : ''}</li>`).join('')}</ol>
      ${editable ? `${assignmentFields('task-main', settings.implementer)}<div class="task-field"><label for="task-parallel-limit">Maximum running subtasks</label><input id="task-parallel-limit" data-plan-field="parallelLimit" type="number" min="1" max="4" value="${settings.parallelLimit}"></div><div class="task-actions"><button class="primary" type="button" data-task-action="approvePlan" data-id="${e(job.id)}">Approve plan</button></div>` : ''}
    </section>`;
  }
  function step(name, value, round) {
    if (!value) return `<section class="task-step"><h4>${name}</h4><span class="field-hint">Not run</span></section>`;
    const check = name === 'Checks', review = name === 'Review';
    return `<section class="task-step"><div class="task-step-heading"><h4>${name}</h4>${chip(value.state)}<span ${time(value)}>${e(elapsed(value.elapsedMs))}</span></div>
      ${value.label ? `<p>${e(value.label)} / ${e(value.model || 'CLI default')}</p><p class="field-hint">${e(usage(value.usage))}</p>` : ''}
      ${value.summary ? `<p>${e(value.summary)}</p>` : ''}
      ${value.changedFiles?.length ? `<p>Changed files: <code>${e(value.changedFiles.join(', '))}</code></p>` : ''}
      ${check && value.state !== 'not-set' ? `<p>${value.outcome && value.state === 'stale' ? `${e(status(value.outcome))} when run. ` : ''}Exit code: ${value.exitCode ?? 'not reported'}${value.timedOut ? ' · Timed out' : ''}</p><details data-task-details="check-${round}"><summary>Check output</summary><pre tabindex="0" aria-label="Round ${round} check output">${e(value.output || 'No output reported.')}</pre></details>` : ''}
      ${review && value.verdict ? `<p>Verdict: ${e(status(value.verdict))}</p>${value.findings?.length ? `<ul>${value.findings.map(finding => `<li>${e(String(finding).replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>` : ''}` : ''}
    </section>`;
  }
  function detail(job) {
    if (!job) return '';
    return `<article class="surface task-detail" aria-labelledby="task-detail-title"><header class="task-detail-heading"><h2 id="task-detail-title" tabindex="-1">${e(job.title)}</h2>${chip(job.state)}</header>
      ${job.repo !== job.workFolder ? `<p>Repository: <span class="task-folder">${e(job.repo)}</span></p>` : ''}
      <p class="task-folder">${e(job.workFolder)}</p><p>${job.workflow === 'worktree' ? 'Separate worktree' : 'Current branch'}${job.branch ? ` · ${e(job.branch)}` : ''}</p>
      <p class="field-hint">Revision: <code>${e(job.sourceRevision)}</code></p>
      <div class="task-actions">${running(job) || job.state === 'plan-ready' ? `<button type="button" data-task-action="stop" data-id="${e(job.id)}">Stop</button>` : ''}${job.split && ['needs-you', 'interrupted', 'stopped'].includes(job.state) ? `<button type="button" data-task-action="resume" data-id="${e(job.id)}">Resume</button>` : ''}${['passed', 'needs-you'].includes(job.state) ? `<button type="button" class="primary" data-task-action="accept" data-id="${e(job.id)}">Accept</button>` : ''}${job.resultId ? `<button type="button" data-task-action="report" data-id="${e(job.id)}">Open report</button>` : ''}</div>
      ${job.reportError ? `<p class="form-error">${e(job.reportError)}</p>` : ''}
      ${job.error ? `<p class="form-error">${e(job.error)}</p>` : ''}
      <details data-task-details="criteria"><summary>Acceptance criteria and assignments</summary><p class="task-criteria">${e(job.criteria)}</p><p>Implementer: ${e(job.implementer.label)} / ${e(job.implementer.model || 'CLI default')}. ${e(job.why.implementer)}</p><p>Reviewer: ${e(job.reviewer?.label || 'No review')}${job.reviewer ? ` / ${e(job.reviewer.model || 'CLI default')}` : ''}. ${e(job.why.reviewer)}</p><p>Checks: <code>${e(job.checks || 'Not set')}</code></p><p>Limits: ${job.maxRounds} rounds · ${job.timeLimitMinutes} minutes</p></details>
      ${job.unresolved.length ? `<section class="task-unresolved"><h3>Unresolved items</h3><ul>${job.unresolved.map(item => `<li>${e(item)}</li>`).join('')}</ul></section>` : ''}
      ${plan(job)}
      <ol class="task-rounds">${job.rounds.map(round => `<li><h3>Round ${round.number} <small ${time(round)}>${e(elapsed(round.elapsedMs))}</small></h3>${step('Implement', round.implement, round.number)}${step('Checks', round.check, round.number)}${step('Review', round.review, round.number)}</li>`).join('')}</ol>
      <section class="task-progress" ${running(job) || job.log.length ? '' : 'hidden'}><h3>Progress</h3><pre id="task-progress-log" tabindex="0" role="region" aria-label="Task progress">${e(job.log.join('\n'))}</pre></section>
      <section><h3>Diff stat</h3>${job.diffError ? `<p class="form-error">${e(job.diffError)}</p>` : ''}<pre tabindex="0">${e(job.diffStat || (running(job) ? 'Available when the round finishes.' : 'No task changes.'))}</pre></section>
      <details data-task-details="diff"><summary>Final diff</summary><pre tabindex="0" aria-label="Task diff">${e(job.finalDiff || 'No task changes.')}</pre></details>
    </article>`;
  }
  function render() {
    if (!jobs().some(job => job.id === selected)) selected = jobs()[0]?.id || '';
    detailStamp = ''; listStamp = ''; announcement = '';
    return `<div class="task-page"><header class="page-heading"><h1>Tasks</h1><div class="task-actions"><button type="button" data-task-action="refresh">Refresh</button></div></header><p id="task-announcement" class="task-announcement" role="status" aria-live="polite" aria-atomic="true"></p><p class="task-empty field-hint" ${jobs().length ? 'hidden' : ''}>Ask any agent console to run a task; its progress shows here.</p><div class="task-layout" ${jobs().length ? '' : 'hidden'}><nav aria-label="Repository tasks"><ul class="task-list">${list()}</ul></nav><div id="task-content">${detail(jobs().find(job => job.id === selected))}</div></div></div>`;
  }
  async function loadChoices() {
    const version = ++request;
    try {
      const next = await call('tasks.candidates', { split: true });
      if (version !== request) return;
      choices = next; detailStamp = ''; sync();
    } catch (failure) { if (version === request) toast(failure.message, true); }
  }
  function sync() {
    if (getPage() !== 'tasks') return;
    const listNode = document.querySelector('.task-list'); if (!listNode) return;
    if (!jobs().some(job => job.id === selected)) selected = jobs()[0]?.id || '';
    document.querySelector('.task-layout').hidden = !jobs().length;
    document.querySelector('.task-empty').hidden = !!jobs().length;
    const nextList = JSON.stringify(jobs().map(({ id, state, title, rounds, maxRounds, subtasks }) => [id, state, title, rounds.length, maxRounds, subtasks?.map(sub => sub.state)])) + selected;
    if (listStamp !== nextList) {
      const focusId = listNode.contains(document.activeElement) ? document.activeElement.dataset.id : null;
      listNode.innerHTML = list(); listStamp = nextList;
      if (focusId) listNode.querySelector(`[data-id="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
    }
    const job = jobs().find(job => job.id === selected); if (!job) return;
    const subStatus = job.split ? (job.subtasks || []).map(sub => `${sub.title}: ${status(sub.state)}.`).join(' ') : '';
    const nextAnnouncement = `${job.id}:${job.state}:${subStatus}`;
    if (nextAnnouncement !== announcement) {
      const region = document.querySelector('#task-announcement');
      if (region) { region.textContent = `${job.title}: ${status(job.state)}.${subStatus ? ' ' + subStatus : ''}`; announcement = nextAnnouncement; }
    }
    const { log, ...rest } = job, stamp = JSON.stringify(rest);
    const content = document.querySelector('#task-content');
    if (stamp !== detailStamp) {
      const opened = [...content.querySelectorAll('details[open]')].map(node => node.dataset.taskDetails);
      const active = content.contains(document.activeElement) ? document.activeElement : null;
      const focus = active?.id ? `#${CSS.escape(active.id)}` : active?.dataset.taskAction ? `[data-task-action="${CSS.escape(active.dataset.taskAction)}"]` : active?.tagName === 'SUMMARY' ? `[data-task-details="${CSS.escape(active.parentElement.dataset.taskDetails)}"] > summary` : active?.getAttribute('aria-label') ? `[aria-label="${CSS.escape(active.getAttribute('aria-label'))}"]` : null;
      const oldLog = content.querySelector('#task-progress-log'), top = oldLog?.scrollTop || 0, follow = !oldLog || oldLog.scrollHeight - oldLog.clientHeight - top < 24;
      content.innerHTML = detail(job); detailStamp = stamp;
      for (const node of content.querySelectorAll('details')) node.open = opened.includes(node.dataset.taskDetails);
      const nextLog = content.querySelector('#task-progress-log'); if (nextLog) nextLog.scrollTop = follow ? nextLog.scrollHeight : top;
      if (focus) (content.querySelector(focus) || content.querySelector('#task-detail-title'))?.focus({ preventScroll: true });
    }
    const node = content.querySelector('#task-progress-log'), next = log.join('\n');
    if (node && node.textContent !== next) { const follow = node.scrollHeight - node.clientHeight - node.scrollTop < 24, top = node.scrollTop; node.textContent = next; node.scrollTop = follow ? node.scrollHeight : top; }
    for (const node of content.querySelectorAll('[data-task-elapsed]')) node.textContent = elapsed(Math.max(0, Date.now() - Number(node.dataset.taskElapsed)));
  }
  document.addEventListener('input', event => {
    if (event.target.dataset.planField) {
      const job = jobs().find(job => job.id === selected); if (!job || job.state !== 'plan-ready') return;
      const settings = planDraft(job), name = event.target.dataset.planField;
      if (name === 'parallelLimit') settings.parallelLimit = Number(event.target.value);
      else (event.target.dataset.sub ? settings.assignments[event.target.dataset.sub] : settings.implementer)[name] = event.target.value;
      return;
    }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-task-action]'); if (!button) return;
    const action = button.dataset.taskAction, id = button.dataset.id;
    if (action === 'subtask-diff') { event.preventDefault(); const details = document.getElementById(`task-sub-${button.dataset.sub}-diff`); if (details) { details.open = true; details.querySelector('pre')?.focus(); } return; }
    if (action === 'select') {
      selected = id; renderPage(); document.querySelector('#task-detail-title')?.focus(); return;
    }
    button.disabled = true;
    try {
      if (action === 'refresh') { await call('tasks.list'); await loadChoices(); sync(); }
      if (['stop', 'accept', 'resume', 'approvePlan'].includes(action)) {
        const job = await call(`tasks.${action}`, { id, ...(action === 'approvePlan' ? planDraft(jobs().find(job => job.id === id)) : {}) });
        getState().tasks = jobs().map(item => item.id === job.id ? job : item); sync();
      }
      if (action === 'report') { const job = jobs().find(item => item.id === id); if (job?.resultId) await openResult(job.resultId); }
    } catch (failure) { toast(failure.message, true); }
    finally { button.disabled = false; }
  });
  let polling = false;
  setInterval(async () => {
    if (getPage() !== 'tasks' || polling) return;
    polling = true;
    try { await call('tasks.list'); sync(); }
    catch {} finally { polling = false; }
  }, 3000);
  return { render, sync, mount() { if (getPage() === 'tasks') { if (!choices) loadChoices(); sync(); } } };
}
