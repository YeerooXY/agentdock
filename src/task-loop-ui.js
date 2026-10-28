import './task-loop.css';

export function taskLoopUI({ call, getState, getPage, escape: e, renderPage, toast, openResult }) {
  let choices = null, selected = '', showForm = false, loading = false, busy = false, error = '', detailStamp = '', listStamp = '', announcement = '', request = 0;
  const draft = { repo: '', title: '', criteria: '', implementer: '', model: '', effort: '', reviewer: '', reviewerModel: '', checks: '', workflow: 'current', maxRounds: '3', timeLimitMinutes: '30' };
  const running = job => ['implementing', 'checking', 'reviewing'].includes(job.state);
  const jobs = () => getState()?.tasks || [];
  const status = value => ({ 'needs-you': 'Needs you', 'not-set': 'Not set', 'changes-requested': 'Changes requested', approve: 'Approved', unclear: 'No clear verdict', done: 'Done' }[value] || value?.replace(/^./, letter => letter.toUpperCase()) || 'Not run');
  const chip = value => `<span class="task-status" data-status="${e(value)}">${e(status(value))}</span>`;
  const elapsed = value => value == null ? 'Running' : `${Math.floor(value / 60000)}m ${Math.floor(value / 1000) % 60}s`;
  const count = value => value == null ? 'not reported' : Number(value).toLocaleString();
  const usage = value => value ? `${count(value.inputTokens)} input / ${count(value.outputTokens)} output tokens${value.cachedInputTokens != null ? ` / ${count(value.cachedInputTokens)} cached input` : ''}` : 'Usage not reported';
  const reviewerHint = () => (choices.suggestion ? `Suggested: ${choices.why}` : choices.why) + (draft.reviewer ? ' The changed code is sent to the reviewer’s vendor.' : '');
  const time = value => value.elapsedMs == null && value.startedAt ? `data-task-elapsed="${value.startedAt}"` : '';
  const options = (items, value) => items.map(item => `<option value="${e(item.id ?? item.path)}" ${(item.id ?? item.path) === value ? 'selected' : ''}>${e(item.label)}</option>`).join('');
  const field = (name, label, attrs = '') => `<label for="task-${name}">${label}<input id="task-${name}" name="${name}" value="${e(draft[name])}" ${attrs}></label>`;
  const select = (name, label, html, attrs = '') => `<label for="task-${name}">${label}<select id="task-${name}" name="${name}" ${attrs}>${html}</select></label>`;
  const staticOptions = (name, items) => items.map(([value, label]) => `<option value="${value}" ${draft[name] === value ? 'selected' : ''}>${label}</option>`).join('');
  function form() {
    if (!choices) return `<section class="surface" aria-busy="${loading}"><p role="status">${error ? e(error) : 'Loading repositories and accounts…'}</p>${error ? '<button type="button" data-task-action="reload">Retry</button>' : ''}</section>`;
    const unavailable = !choices.repos.length || !choices.implementers.length;
    return `<form id="task-form" class="surface task-form" aria-labelledby="task-form-title"><h2 id="task-form-title" tabindex="-1">New task</h2>
      ${!choices.repos.length ? '<p>Add a project folder or open a local console to select a repository.</p>' : ''}
      ${!choices.implementers.length ? '<p>Install and sign in to Claude Code, Codex or Kiro to start a task.</p>' : ''}
      ${select('repo', 'Repository', '<option value="">Select a folder</option>' + options(choices.repos, draft.repo), 'required')}
      ${field('title', 'Title', 'required maxlength="200" autocomplete="off"')}
      <label for="task-criteria">Acceptance criteria<textarea id="task-criteria" name="criteria" rows="4" maxlength="12000" required>${e(draft.criteria)}</textarea></label>
      <div class="task-form-pair">${select('implementer', 'Implementer', options(choices.implementers, draft.implementer), 'required')}${field('model', 'Model (optional)', 'maxlength="120" placeholder="CLI default"')}</div>
      <div class="task-form-pair">${select('reviewer', 'Reviewer', '<option value="">No review</option>' + options(choices.reviewers, draft.reviewer), 'aria-describedby="task-reviewer-reason"')}${field('reviewerModel', 'Reviewer model (optional)', `maxlength="120" placeholder="CLI default" ${!draft.reviewer ? 'disabled' : ''}`)}</div>
      <p id="task-reviewer-reason" class="field-hint">${e(reviewerHint())}</p>
      ${field('checks', 'Checks command (optional)', 'maxlength="4000" placeholder="npm test" spellcheck="false" aria-describedby="task-checks-help"')}
      <p id="task-checks-help" class="field-hint">Runs in the work folder with a 15-minute timeout.</p>
      ${select('workflow', 'Workflow', staticOptions('workflow', [['current', 'Current branch'], ['worktree', 'Separate worktree']]), 'aria-describedby="task-workflow-help"')}
      <p id="task-workflow-help" class="field-hint">${draft.workflow === 'worktree' ? 'Creates a branch and worktree from HEAD. Keep or remove them manually after the task.' : 'Edits your working copy on its current branch. Pre-existing changes are excluded from the task diff.'}</p>
      <div class="task-form-pair">${field('maxRounds', 'Max rounds', 'type="number" min="1" max="5" required')}${field('timeLimitMinutes', 'Time limit (minutes)', 'type="number" min="5" max="120" required')}</div>
      <p class="form-error" id="task-form-error" role="alert" ${error ? 'tabindex="-1"' : ''}>${e(error)}</p>
      <div class="task-actions"><button type="submit" class="primary" ${busy || unavailable ? 'disabled' : ''}>${busy ? 'Starting…' : 'Start'}</button>${jobs().length ? '<button type="button" data-task-action="cancel-form">Cancel</button>' : ''}</div>
    </form>`;
  }
  function list() {
    return jobs().length ? jobs().map(job => `<li><button type="button" data-task-action="select" data-id="${e(job.id)}" aria-current="${job.id === selected && !showForm ? 'true' : 'false'}"><strong>${e(job.title)}</strong>${chip(job.state)}<small>${job.rounds.length}/${job.maxRounds} rounds</small></button></li>`).join('') : '<li class="field-hint">No tasks yet.</li>';
  }
  function step(name, value, round) {
    if (!value) return `<section class="task-step"><h4>${name}</h4><span class="field-hint">Not run</span></section>`;
    const check = name === 'Checks', review = name === 'Review';
    return `<section class="task-step"><div class="task-step-heading"><h4>${name}</h4>${chip(value.state)}<span ${time(value)}>${e(elapsed(value.elapsedMs))}</span></div>
      ${value.label ? `<p>${e(value.label)} / ${e(value.model || 'CLI default')}</p><p class="field-hint">${e(usage(value.usage))}</p>` : ''}
      ${value.summary ? `<p>${e(value.summary)}</p>` : ''}
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
      <div class="task-actions">${running(job) ? `<button type="button" data-task-action="stop" data-id="${e(job.id)}">Stop</button>` : ''}${['passed', 'needs-you'].includes(job.state) ? `<button type="button" class="primary" data-task-action="accept" data-id="${e(job.id)}">Accept</button>` : ''}${job.resultId ? `<button type="button" data-task-action="report" data-id="${e(job.id)}">Open report</button>` : ''}</div>
      ${job.reportError ? `<p class="form-error">${e(job.reportError)}</p>` : ''}
      ${job.error ? `<p class="form-error">${e(job.error)}</p>` : ''}
      <details data-task-details="criteria"><summary>Acceptance criteria and assignments</summary><p class="task-criteria">${e(job.criteria)}</p><p>Implementer: ${e(job.implementer.label)} / ${e(job.implementer.model || 'CLI default')}. ${e(job.why.implementer)}</p><p>Reviewer: ${e(job.reviewer?.label || 'No review')}${job.reviewer ? ` / ${e(job.reviewer.model || 'CLI default')}` : ''}. ${e(job.why.reviewer)}</p><p>Checks: <code>${e(job.checks || 'Not set')}</code></p><p>Limits: ${job.maxRounds} rounds · ${job.timeLimitMinutes} minutes</p></details>
      ${job.unresolved.length ? `<section class="task-unresolved"><h3>Unresolved items</h3><ul>${job.unresolved.map(item => `<li>${e(item)}</li>`).join('')}</ul></section>` : ''}
      <ol class="task-rounds">${job.rounds.map(round => `<li><h3>Round ${round.number} <small ${time(round)}>${e(elapsed(round.elapsedMs))}</small></h3>${step('Implement', round.implement, round.number)}${step('Checks', round.check, round.number)}${step('Review', round.review, round.number)}</li>`).join('')}</ol>
      <section class="task-progress" ${running(job) || job.log.length ? '' : 'hidden'}><h3>Progress</h3><pre id="task-progress-log" tabindex="0" role="region" aria-label="Task progress">${e(job.log.join('\n'))}</pre></section>
      <section><h3>Diff stat</h3>${job.diffError ? `<p class="form-error">${e(job.diffError)}</p>` : ''}<pre tabindex="0">${e(job.diffStat || (running(job) ? 'Available when the round finishes.' : 'No task changes.'))}</pre></section>
      <details data-task-details="diff"><summary>Final diff</summary><pre tabindex="0" aria-label="Task diff">${e(job.finalDiff || 'No task changes.')}</pre></details>
    </article>`;
  }
  function render() {
    if (!selected && jobs().length) selected = jobs()[0].id;
    if (!jobs().length) showForm = true;
    detailStamp = ''; listStamp = ''; announcement = '';
    return `<div class="task-page"><header class="page-heading"><h1>Tasks</h1><div class="task-actions"><button type="button" data-task-action="refresh">Refresh</button><button type="button" class="primary" data-task-action="new">New task</button></div></header><p id="task-announcement" class="task-announcement" role="status" aria-live="polite" aria-atomic="true"></p><div class="task-layout"><nav aria-label="Repository tasks"><ul class="task-list">${list()}</ul></nav><div id="task-content">${showForm ? form() : detail(jobs().find(job => job.id === selected))}</div></div></div>`;
  }
  async function loadChoices(resetReviewer = false) {
    if (loading && !resetReviewer) return;
    const version = ++request; loading = true;
    try {
      const next = await call('tasks.candidates', { implementer: draft.implementer });
      if (version !== request) return;
      const first = !choices; choices = next; error = '';
      if (!choices.implementers.some(choice => choice.id === draft.implementer)) draft.implementer = choices.implementers[0]?.id || '';
      if (!choices.repos.some(choice => choice.path === draft.repo)) draft.repo = choices.repos[0]?.path || '';
      if (first || resetReviewer || (draft.reviewer && !choices.reviewers.some(choice => choice.id === draft.reviewer))) draft.reviewer = choices.suggestion || '';
    } catch (failure) { if (version === request) error = failure.message; }
    finally {
      if (version === request) {
        loading = false;
        if (getPage() === 'tasks' && showForm) {
          const activeName = document.activeElement?.closest('#task-form') ? document.activeElement.name : null;
          document.querySelector('#task-content').innerHTML = form();
          if (activeName) document.querySelector('#task-form')?.elements.namedItem(activeName)?.focus();
        }
      }
    }
  }
  function sync() {
    if (getPage() !== 'tasks') return;
    const listNode = document.querySelector('.task-list'); if (!listNode) return;
    const nextList = JSON.stringify(jobs().map(({ id, state, title, rounds, maxRounds }) => [id, state, title, rounds.length, maxRounds])) + selected + showForm;
    if (listStamp !== nextList) {
      const focusId = listNode.contains(document.activeElement) ? document.activeElement.dataset.id : null;
      listNode.innerHTML = list(); listStamp = nextList;
      if (focusId) listNode.querySelector(`[data-id="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
    }
    if (showForm) return;
    const job = jobs().find(job => job.id === selected); if (!job) return;
    const nextAnnouncement = `${job.id}:${job.state}`;
    if (nextAnnouncement !== announcement) {
      const region = document.querySelector('#task-announcement');
      if (region) { region.textContent = `${job.title}: ${status(job.state)}.`; announcement = nextAnnouncement; }
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
    if (event.target.closest('#task-form') && event.target.name in draft) draft[event.target.name] = event.target.value;
  });
  document.addEventListener('change', event => {
    if (!event.target.closest('#task-form')) return;
    draft[event.target.name] = event.target.value;
    if (event.target.name === 'implementer') loadChoices(true);
    if (event.target.name === 'reviewer') {
      document.querySelector('#task-reviewerModel').disabled = !draft.reviewer;
      document.querySelector('#task-reviewer-reason').textContent = reviewerHint();
    }
    if (event.target.name === 'workflow') document.querySelector('#task-workflow-help').textContent = draft.workflow === 'worktree' ? 'Creates a branch and worktree from HEAD. Keep or remove them manually after the task.' : 'Edits your working copy on its current branch. Pre-existing changes are excluded from the task diff.';
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'task-form') return;
    event.preventDefault(); event.stopImmediatePropagation(); if (busy || loading) return;
    busy = true; const formNode = event.target, submit = formNode.querySelector('[type=submit]'); submit.disabled = true;
    Object.assign(draft, Object.fromEntries(new FormData(formNode))); error = '';
    try {
      const job = await call('tasks.start', { repo: draft.repo, title: draft.title, criteria: draft.criteria, implementer: { accountId: draft.implementer, model: draft.model }, reviewer: draft.reviewer ? { accountId: draft.reviewer, model: draft.reviewerModel } : null,
        checks: draft.checks, workflow: draft.workflow, maxRounds: Number(draft.maxRounds), timeLimitMinutes: Number(draft.timeLimitMinutes) });
      if (!jobs().some(item => item.id === job.id)) getState().tasks = [job, ...jobs()];
      selected = job.id; showForm = false; renderPage(); document.querySelector('#task-detail-title')?.focus();
    } catch (failure) {
      error = failure.message;
      const message = document.querySelector('#task-form-error');
      if (message) { message.textContent = error; message.tabIndex = -1; message.focus(); }
    } finally { busy = false; submit.disabled = false; }
  }, true);
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-task-action]'); if (!button) return;
    const action = button.dataset.taskAction, id = button.dataset.id;
    if (action === 'new' || action === 'cancel-form' || action === 'select') {
      showForm = action === 'new'; if (id) selected = id;
      error = ''; renderPage(); document.querySelector(showForm ? '#task-form-title' : '#task-detail-title')?.focus();
      if (showForm) loadChoices(); return;
    }
    button.disabled = true;
    try {
      if (action === 'reload') await loadChoices();
      if (action === 'refresh') { await call('tasks.list'); await loadChoices(); sync(); }
      if (action === 'stop' || action === 'accept') {
        const job = await call(`tasks.${action}`, { id });
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
