
export function taskLoopUI({ call, getState, getPage, escape: e, renderPage, toast, openResult }) {
  let choices = null, selected = '', detailStamp = '', listStamp = '', announcement = '', request = 0, bucket = '';
  const planDrafts = new Map();
  const running = job => ['planning', 'reviewing-plan', 'building', 'implementing', 'checking', 'reviewing'].includes(job.state);
  const jobs = () => getState()?.tasks || [];
  const historic = job => ['accepted', 'stopped', 'failed'].includes(job.state);
  const finished = job => ['passed', 'accepted', 'needs-you', 'failed', 'interrupted', 'stopped'].includes(job.state);
  const visibleJobs = () => jobs().filter(job => historic(job) === (bucket === 'history'));
  const tabs = () => `<div class="task-tabs" aria-label="Task view"><button type="button" data-task-action="filter" data-id="active" aria-pressed="${bucket === 'active'}">Active (${jobs().filter(job => !historic(job)).length})</button><button type="button" data-task-action="filter" data-id="history" aria-pressed="${bucket === 'history'}">History (${jobs().filter(historic).length})</button></div>`;
  const status = value => ({ 'needs-you': 'Needs you', 'not-set': 'Not set', 'plan-ready': 'Plan ready', 'reviewing-plan': 'Reviewing plan', 'changes-requested': 'Changes requested', approve: 'Approved', unclear: 'No clear verdict', done: 'Done' }[value] || value?.replace(/^./, letter => letter.toUpperCase()) || 'Not run');
  const chip = value => `<span class="task-status" data-status="${e(value)}">${e(status(value))}</span>`;
  const toolTags = 'tool_call|tool_calls|tool_use|tool_result|function_calls?|function_results?|antml:[a-z_]+|invoke|thinking';
  const clean = value => String(value ?? '')
    .replace(new RegExp(`<(${toolTags})\\b[^>]*>[\\s\\S]*?</\\1\\s*>`, 'gi'), ' ')
    .replace(new RegExp(`<(${toolTags})\\b[^>]*>[\\s\\S]*$`, 'i'), ' ')
    .replace(new RegExp(`</?(${toolTags})\\b[^>]*>`, 'gi'), ' ')
    .replace(/\s+/g, ' ').trim();
  const outcomeFor = job => {
    const results = getState()?.workbench?.results || [];
    const linked = results.find(item => item.id === job.resultId && item.outcome?.type === 'task' && item.outcome.taskId === job.id);
    return (linked || results.find(item => item.taskId === job.id && item.outcome?.type === 'task'))?.outcome || null;
  };
  const verdict = (job, outcome) => {
    const value = outcome?.verdict || ({ passed: 'ready', accepted: 'ready', 'needs-you': 'needs-decision', interrupted: 'interrupted', stopped: 'interrupted', failed: 'failed' }[job.state]);
    if (value === 'ready') { const label = 'Passed'; return `<span class="task-status task-result-verdict" data-status="passed">${label}</span>`; }
    if (['failed', 'failed-checks'].includes(value)) { const label = 'Failed'; return `<span class="task-status task-result-verdict" data-status="failed">${label}</span>`; }
    return '<span class="task-status task-result-verdict" data-status="needs-you">Needs you</span>';
  };
  const elapsed = value => value == null ? 'Running' : `${Math.floor(value / 60000)}m ${Math.floor(value / 1000) % 60}s`;
  const count = value => value == null ? 'not reported' : Number(value).toLocaleString();
  const usage = value => value ? `${count(value.inputTokens)} input / ${count(value.outputTokens)} output tokens${value.cachedInputTokens != null ? ` / ${count(value.cachedInputTokens)} cached input` : ''}${value.reportedCost != null ? ` / OpenCode reported cost $${value.reportedCost}` : ''}` : 'Usage not reported';
  const time = value => value.elapsedMs == null && value.startedAt ? `data-task-elapsed="${value.startedAt}"` : '';
  const options = (items, value) => items.map(item => `<option value="${e(item.id ?? item.path)}" ${(item.id ?? item.path) === value ? 'selected' : ''}>${e(item.label)}</option>`).join('');
  function list() {
    return visibleJobs().map(job => {
      const summary = (finished(job) ? outcomeFor(job)?.outcome : '') || job.error || job.unresolved?.[0] || (job.state === 'passed' ? 'Checks complete. Ready for review.' : job.state === 'accepted' ? 'Accepted.' : job.state === 'stopped' ? 'Stopped.' : job.criteria);
      return `<li><button type="button" data-task-action="select" data-id="${e(job.id)}" aria-current="${job.id === selected ? 'true' : 'false'}"><strong>${e(job.title)}</strong>${chip(job.state)}<small>${job.split ? `${(job.subtasks || []).filter(sub => sub.state === 'merged').length}/${job.subtasks?.length || 0} subtasks` : `${job.rounds.length}/${job.maxRounds} rounds`}</small><span class="task-card-summary">${e(clean(summary))}</span></button></li>`;
    }).join('');
  }
  function planDraft(job) {
    const assignment = value => ({ accountId: value?.accountId || '', model: value?.model || '', effort: value?.requestedEffort || value?.effort || '' });
    if (!planDrafts.has(job.id)) planDrafts.set(job.id, { assignments: Object.fromEntries((job.subtasks || []).map(sub => [sub.subtaskId, assignment(sub.implementer)])), parallelLimit: job.parallelLimit || 2, implementer: assignment(job.implementer) });
    const settings = planDrafts.get(job.id);
    for (const sub of job.subtasks || []) if (!Object.hasOwn(settings.assignments, sub.subtaskId)) settings.assignments[sub.subtaskId] = assignment(sub.implementer);
    return settings;
  }
  function plan(job) {
    if (!job.split) return '';
    const editable = job.state === 'plan-ready', settings = planDraft(job);
    const accounts = choices?.implementers || [];
    const accountOptions = current => options(accounts.some(account => account.id === current?.accountId) || !current?.accountId ? accounts : [...accounts, { id: current.accountId, label: current.accountId }], current?.accountId);
    const assignmentFields = (id, value, sub = '') => {
      const account = accounts.find(item => item.id === value?.accountId), efforts = account?.efforts || [];
      const effortOptions = ['', ...efforts.filter(item => item !== '')];
      if (value?.effort && !effortOptions.includes(value.effort)) effortOptions.push(value.effort);
      return `<div class="task-form-pair"><div class="task-field"><label for="${id}-account">${sub ? 'Implementer for ' + e(sub) : 'Main implementer'}</label><select id="${id}-account" data-plan-field="accountId" data-sub="${e(sub)}"><option value="">Choose an agent</option>${accountOptions(value)}</select></div><div class="task-field"><label for="${id}-model">${sub ? 'Model for ' + e(sub) : 'Main implementer model'}</label><input id="${id}-model" data-plan-field="model" data-sub="${e(sub)}" maxlength="120" value="${e(value?.model || '')}" placeholder="CLI default; required for OpenCode"></div><div class="task-field"><label for="${id}-effort">Requested effort</label><select id="${id}-effort" data-plan-field="effort" data-sub="${e(sub)}">${effortOptions.map(item => `<option value="${e(item)}" ${item === (value?.effort || '') ? 'selected' : ''}>${e(item || 'Native default')}</option>`).join('')}</select></div></div>`;
    };
    return `<section class="task-plan" aria-labelledby="task-plan-title"><h3 id="task-plan-title">Plan</h3>
      <p>${job.planReview?.state === 'not-set' ? 'Plan not reviewed (No review).' : job.planReview?.verdict ? `Plan review: ${e(status(job.planReview.verdict))}.` : 'Plan review pending.'}</p>
      ${job.planReview?.reused && job.planReview.planRevision != null && job.planRevision != null ? `<p>Findings from revision ${e(job.planReview.planRevision)}; plan revised to ${e(job.planRevision)}, not re-reviewed.</p>` : ''}
      <details data-task-details="contracts"><summary>Contracts</summary><p class="task-criteria">${e(job.plan?.contracts || 'Available after planning.')}</p></details>
      ${(job.planRounds || []).some(round => round.review?.findings?.length || round.planner?.errors?.length || round.repair?.errors?.length) ? `<details data-task-details="plan-findings"><summary>Plan review findings and validation</summary>${job.planRounds.map(round => `<h4>Plan round ${round.number}</h4><ul>${[...(round.planner?.errors || []), ...(round.repair?.errors || []), ...(round.review?.reused ? [] : round.review?.findings || [])].map(finding => `<li>${e(finding)}</li>`).join('')}</ul>`).join('')}</details>` : ''}
      <ol class="task-subtasks">${(job.subtasks || []).map(sub => `<li><div class="task-detail-heading"><h4>${e(sub.title)}</h4>${chip(sub.state)}</div><p class="task-criteria">${e(sub.criteria)}</p>
        <p>Owns: <code>${e(sub.owns.join(', '))}</code></p><p>Dependencies: ${e(sub.dependsOn.join(', ') || 'None')}</p>
        ${editable ? assignmentFields(`task-sub-${sub.subtaskId}`, settings.assignments[sub.subtaskId], sub.subtaskId) : `<p>Implementer: ${e(sub.implementer?.label || 'Not assigned')} / ${e(sub.implementer?.model || 'CLI default')}</p>`}
        <p class="field-hint">${e(sub.assignmentReason || '')}</p><p>${sub.rounds.length} rounds. <span ${sub.runStartedAt ? `data-task-elapsed="${sub.runStartedAt - (sub.elapsedMs || 0)}"` : ''}>${e(elapsed(sub.runStartedAt ? Date.now() - sub.runStartedAt + (sub.elapsedMs || 0) : sub.elapsedMs || 0))}</span></p>
        ${sub.error ? `<p class="form-error">${e(clean(sub.error))}</p>` : ''}${sub.unresolved?.length ? `<ul>${sub.unresolved.map(item => `<li>${e(clean(item))}</li>`).join('')}</ul>` : ''}
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
      ${value.label ? `<p>${e(value.label)} / ${e(value.model || 'CLI default')}</p>${effort(value)}<p class="field-hint">${e(usage(value.usage))}</p>` : ''}
      ${value.summary ? `<p>${e(clean(value.summary))}</p>` : ''}
      ${value.changedFiles?.length ? `<p>Changed files: <code>${e(value.changedFiles.join(', '))}</code></p>` : ''}
      ${check && value.state !== 'not-set' ? `<p>${value.outcome && value.state === 'stale' ? `${e(status(value.outcome))} when run. ` : ''}Exit code: ${value.exitCode ?? 'not reported'}${value.timedOut ? '. Timed out' : ''}</p><details data-task-details="check-${round}"><summary>Check output</summary><pre tabindex="0" aria-label="Round ${round} check output">${e(value.output || 'No output reported.')}</pre></details>` : ''}
      ${review && value.verdict ? `<p>${value.state === 'stale' ? 'Previous verdict' : 'Verdict'}: ${e(status(value.verdict))}</p>${value.findings?.length ? `<ul>${value.findings.map(finding => `<li>${e(clean(String(finding).replace(/^\s*[-*•]\s+/, '')))}</li>`).join('')}</ul>` : ''}` : ''}
    </section>`;
  }
  function effort(value) {
    const requested = value?.requestedEffort || value?.effort;
    if (!requested) return value?.effortDispatch?.status === 'adapter-default' ? `<p class="field-hint">Effort: adapter default (${e(value.effortDispatch.value)}).</p>` : value?.effortDispatch?.status === 'native-default' ? '<p class="field-hint">Effort: native default.</p>' : '';
    const dispatch = value.effortDispatch;
    const sent = dispatch?.method === 'flag' ? `Sent with ${dispatch.flag}.` : ['config','sdk'].includes(dispatch?.method) ? `Sent with ${dispatch.key}.` : 'Awaiting dispatch.';
    const observed = value.effortEffective ? `${value.effortEffective.source} reports ${value.effortEffective.value}.` : 'Provider-effective effort is not reported.';
    return `<p class="field-hint">Requested effort: ${e(requested)}. ${e(sent)} ${e(observed)}</p>`;
  }
  function technical(job) {
    return `<details data-task-details="criteria"><summary>Acceptance criteria and assignments</summary><p class="task-criteria">${e(job.criteria)}</p><p>Implementer: ${e(job.implementer.label)} / ${e(job.implementer.model || 'CLI default')}. ${e(job.why.implementer)}</p>${effort(job.implementer)}<p>Reviewer: ${e(job.reviewer?.label || 'No review')}${job.reviewer ? ` / ${e(job.reviewer.model || 'CLI default')}` : ''}. ${e(job.why.reviewer)}</p>${effort(job.reviewer)}<p>Checks: <code>${e(job.checks || 'Not set')}</code></p><p>Limits: ${job.maxRounds} rounds, ${job.timeLimitMinutes} minutes</p></details>
      ${!finished(job) && job.unresolved.length ? `<section class="task-unresolved"><h3>Unresolved items</h3><ul>${job.unresolved.map(item => `<li>${e(clean(item))}</li>`).join('')}</ul></section>` : ''}
      ${plan(job)}
      <ol class="task-rounds">${job.rounds.map(round => `<li><h3>Round ${round.number} <small ${time(round)}>${e(elapsed(round.elapsedMs))}</small></h3>${step('Implement', round.implement, round.number)}${step('Checks', round.check, round.number)}${step('Review', round.review, round.number)}</li>`).join('')}</ol>
      <section class="task-progress" ${running(job) || job.log.length ? '' : 'hidden'}><h3>Progress</h3><pre id="task-progress-log" tabindex="0" role="region" aria-label="Task progress">${e(job.log.join('\n'))}</pre></section>
      <section><h3>Diff stat</h3>${job.diffError ? `<p class="form-error">${e(job.diffError)}</p>` : ''}<pre tabindex="0">${e(job.diffStat || (running(job) ? 'Available when the round finishes.' : 'No task changes.'))}</pre></section>
      <details data-task-details="diff"><summary>Final diff</summary><pre tabindex="0" aria-label="Task diff">${e(job.finalDiff || 'No task changes.')}</pre></details>`;
  }
  function result(job) {
    const outcome = outcomeFor(job), files = outcome?.changedFiles, checks = outcome?.checks;
    const openItems = (outcome?.unresolved || []).map(clean).filter(Boolean);
    const outcomeText = clean(outcome?.outcome || (job.reportError ? 'The outcome could not be saved.' : job.resultId ? 'No structured outcome was saved for this task.' : 'The outcome is being saved.'));
    const checkLabels = { passed: 'Passed', failed: 'Failed', stale: 'Out of date', 'not-run': 'Not run', none: 'No checks' };
    const checkState = { passed: 'passed', failed: 'failed', stale: 'stale', 'not-run': 'not-set', none: 'not-set' }[checks?.status] || 'not-set';
    const withIssues = openItems.length > 0 || checks?.status === 'failed' || (!outcome && job.unresolved?.length);
    return `<article class="surface task-detail task-result" aria-labelledby="task-detail-title"><header class="task-detail-heading"><h2 id="task-detail-title" tabindex="-1">${e(job.title)}</h2>${verdict(job, outcome)}</header>
      <p class="task-result-outcome">${e(outcomeText)}</p>
      <div class="task-result-grid"><section class="task-result-group"><h3>Changed files${files ? ` (${files.count})` : ''}</h3>${files ? files.top.length ? `<ul class="task-result-files">${files.top.map(file => `<li><code>${e(clean(file))}</code></li>`).join('')}</ul>${files.count > files.top.length ? `<p>Showing the first ${files.top.length} files.</p>` : ''}` : '<p>No files changed.</p>' : '<p>Not reported.</p>'}</section>
      <section class="task-result-group"><h3>Checks</h3><p>${checks ? `<span class="task-status" data-status="${checkState}">${e(checkLabels[checks.status] || status(checks.status))}</span> ${e(clean(checks.summary))}` : 'Not reported.'}</p></section></div>
      <section class="task-result-group task-result-open"><h3>Open items</h3>${outcome ? openItems.length ? `<ul>${openItems.map(item => `<li>${e(item)}</li>`).join('')}</ul>` : '<p>None.</p>' : '<p>Not reported.</p>'}</section>
      <div class="task-actions task-result-actions">${['passed', 'needs-you'].includes(job.state) ? `<button type="button" class="${withIssues ? 'secondary' : 'primary'}" data-task-action="accept" data-id="${e(job.id)}">${withIssues ? 'Accept with issues' : 'Accept'}</button>` : ''}${job.split && ['needs-you', 'interrupted', 'stopped'].includes(job.state) ? `<button type="button" data-task-action="resume" data-id="${e(job.id)}">Resume</button>` : ''}<button type="button" data-task-action="seen" data-id="${e(job.id)}" ${job.acknowledgedAt ? 'disabled' : ''}>Mark as seen</button><button type="button" data-task-action="close" data-id="${e(job.id)}">Close</button></div>
      ${job.reportError ? `<p class="form-error">${e(clean(job.reportError))}</p>` : ''}${job.error ? `<p class="form-error">${e(clean(job.error))}</p>` : ''}
      <details class="task-result-details" data-task-details="result-details"><summary>Details</summary>
        ${job.repo !== job.workFolder ? `<p>Repository: <span class="task-folder">${e(job.repo)}</span></p>` : ''}<p class="task-folder">${e(job.workFolder)}</p><p>${job.workflow === 'worktree' ? 'Separate worktree' : 'Current branch'}${job.branch ? `, ${e(job.branch)}` : ''}</p><p class="field-hint">Revision: <code>${e(job.sourceRevision)}</code></p>
        ${job.resultId ? `<div class="task-actions"><button type="button" data-task-action="report" data-id="${e(job.id)}">Open markdown report</button></div>` : ''}${technical(job)}
      </details>
    </article>`;
  }
  function detail(job) {
    if (!job) return '';
    if (finished(job)) return result(job);
    return `<article class="surface task-detail" aria-labelledby="task-detail-title"><header class="task-detail-heading"><h2 id="task-detail-title" tabindex="-1">${e(job.title)}</h2>${chip(job.state)}</header>
      ${job.repo !== job.workFolder ? `<p>Repository: <span class="task-folder">${e(job.repo)}</span></p>` : ''}
      <p class="task-folder">${e(job.workFolder)}</p><p>${job.workflow === 'worktree' ? 'Separate worktree' : 'Current branch'}${job.branch ? `, ${e(job.branch)}` : ''}</p>
      <p class="field-hint">Revision: <code>${e(job.sourceRevision)}</code></p>
      <div class="task-actions">${running(job) || job.state === 'plan-ready' ? `<button type="button" data-task-action="stop" data-id="${e(job.id)}">Stop</button>` : ''}${job.resultId ? `<button type="button" data-task-action="report" data-id="${e(job.id)}">Open markdown report</button>` : ''}</div>
      ${job.reportError ? `<p class="form-error">${e(clean(job.reportError))}</p>` : ''}${job.error ? `<p class="form-error">${e(clean(job.error))}</p>` : ''}${technical(job)}
    </article>`;
  }
  function render() {
    if (!bucket) bucket = jobs().length && jobs().every(historic) ? 'history' : 'active';
    if (!visibleJobs().some(job => job.id === selected)) selected = visibleJobs()[0]?.id || '';
    detailStamp = ''; listStamp = ''; announcement = '';
    return `<div class="task-page"><header class="page-heading"><h1>Tasks</h1><div class="task-actions"><button type="button" data-task-action="refresh">Refresh</button></div></header>${tabs()}<p id="task-announcement" class="task-announcement" role="status" aria-live="polite" aria-atomic="true"></p><p class="task-empty field-hint" ${visibleJobs().length ? 'hidden' : ''}>${bucket === 'history' ? 'No finished tasks.' : 'No active tasks. Start a task from a console.'}</p><div class="task-layout" ${visibleJobs().length ? '' : 'hidden'}><nav aria-label="Repository tasks"><ul class="task-list">${list()}</ul></nav><div id="task-content">${detail(jobs().find(job => job.id === selected))}</div></div></div>`;
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
    if (!visibleJobs().some(job => job.id === selected)) selected = visibleJobs()[0]?.id || '';
    document.querySelector('.task-layout').hidden = !visibleJobs().length;
    document.querySelector('.task-empty').hidden = !!visibleJobs().length;
    for (const node of document.querySelectorAll('[data-task-action=filter]')) {
      const history = node.dataset.id === 'history';
      node.textContent = `${history ? 'History' : 'Active'} (${jobs().filter(job => historic(job) === history).length})`;
      node.setAttribute('aria-pressed', String(node.dataset.id === bucket));
    }
    const nextList = JSON.stringify(visibleJobs().map(job => {
      const { id, state, title, rounds, maxRounds, subtasks, error, unresolved } = job;
      return [id, state, title, rounds.length, maxRounds, subtasks?.map(sub => sub.state), error, unresolved, outcomeFor(job)];
    })) + selected;
    if (listStamp !== nextList) {
      const focused = listNode.contains(document.activeElement) ? document.activeElement.closest('[data-task-action=select]') : null;
      const focusId = focused?.dataset.id, focusIndex = focused ? [...listNode.querySelectorAll('[data-task-action=select]')].indexOf(focused) : -1;
      listNode.innerHTML = list(); listStamp = nextList;
      if (focused) {
        const buttons = [...listNode.querySelectorAll('[data-task-action=select]')];
        const target = buttons.find(node => node.dataset.id === focusId) || buttons[Math.min(focusIndex, buttons.length - 1)] || document.querySelector(`[data-task-action=filter][data-id="${bucket}"]`);
        target?.focus({ preventScroll: true });
      }
    }
    const content = document.querySelector('#task-content'), job = jobs().find(job => job.id === selected);
    if (!job) {
      const hadFocus = content?.contains(document.activeElement);
      if (content) { content.innerHTML = ''; detailStamp = ''; }
      if (hadFocus) document.querySelector(`[data-task-action=filter][data-id="${bucket}"]`)?.focus({ preventScroll: true });
      return;
    }
    const subStatus = job.split ? (job.subtasks || []).map(sub => `${sub.title}: ${status(sub.state)}.`).join(' ') : '';
    const nextAnnouncement = `${job.id}:${job.state}:${subStatus}`;
    if (nextAnnouncement !== announcement) {
      const region = document.querySelector('#task-announcement');
      if (region) { region.textContent = `${job.title}: ${status(job.state)}.${subStatus ? ' ' + subStatus : ''}`; announcement = nextAnnouncement; }
    }
    const { log, ...rest } = job, stamp = JSON.stringify([rest, outcomeFor(job)]);
    if (stamp !== detailStamp) {
      const opened = [...content.querySelectorAll('details[open]')].map(node => node.dataset.taskDetails);
      const active = content.contains(document.activeElement) ? document.activeElement : null;
      const focus = active?.id ? `#${CSS.escape(active.id)}` : active?.dataset.taskAction ? `[data-task-action="${CSS.escape(active.dataset.taskAction)}"]${active.hasAttribute('data-id') ? `[data-id="${CSS.escape(active.dataset.id)}"]` : ''}` : active?.tagName === 'SUMMARY' ? `[data-task-details="${CSS.escape(active.parentElement.dataset.taskDetails)}"] > summary` : active?.getAttribute('aria-label') ? `[aria-label="${CSS.escape(active.getAttribute('aria-label'))}"]` : null;
      const oldActions = active?.closest('.task-actions'), actionIndex = oldActions ? [...oldActions.querySelectorAll('button')].indexOf(active) : -1, resultActions = oldActions?.classList.contains('task-result-actions');
      const oldLog = content.querySelector('#task-progress-log'), top = oldLog?.scrollTop || 0, follow = !oldLog || oldLog.scrollHeight - oldLog.clientHeight - top < 24;
      content.innerHTML = detail(job); detailStamp = stamp;
      for (const node of content.querySelectorAll('details')) node.open = opened.includes(node.dataset.taskDetails);
      const nextLog = content.querySelector('#task-progress-log'); if (nextLog) nextLog.scrollTop = follow ? nextLog.scrollHeight : top;
      if (active) {
        let target = focus ? content.querySelector(focus) : null;
        if (!target || target.disabled) {
          const container = resultActions ? content.querySelector('.task-result-actions') : content.querySelector('.task-actions');
          const actions = [...(container?.querySelectorAll('button:not(:disabled)') || [])];
          target = actions[Math.min(Math.max(actionIndex, 0), actions.length - 1)] || content.querySelector('#task-detail-title');
        }
        target?.focus({ preventScroll: true });
      }
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
      else {
        const assignment = event.target.dataset.sub ? settings.assignments[event.target.dataset.sub] : settings.implementer;
        assignment[name] = event.target.value;
        if (name === 'accountId') { assignment.effort = ''; detailStamp = ''; sync(); document.getElementById(event.target.id)?.focus({ preventScroll: true }); }
      }
      return;
    }
  });
  function focusSuccessor(action) {
    if (action === 'close') {
      (document.querySelector(`[data-task-action=select][data-id="${CSS.escape(selected)}"]`) || document.querySelector(`[data-task-action=filter][data-id="${bucket}"]`))?.focus({ preventScroll: true });
      return;
    }
    const names = { accept: ['seen', 'close'], seen: ['close'], stop: ['accept', 'resume', 'seen', 'close'], resume: ['stop'], approvePlan: ['stop'] }[action] || [];
    for (const name of names) {
      const target = document.querySelector(`#task-content [data-task-action="${name}"]:not(:disabled)`);
      if (target) { target.focus({ preventScroll: true }); return; }
    }
    document.querySelector('#task-detail-title')?.focus({ preventScroll: true });
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-task-action]'); if (!button) return;
    const action = button.dataset.taskAction, id = button.dataset.id;
    if (action === 'filter') { bucket = id; selected = ''; renderPage(); document.querySelector(`[data-task-action=filter][data-id="${bucket}"]`)?.focus(); return; }
    if (action === 'subtask-diff') { event.preventDefault(); const details = document.getElementById(`task-sub-${button.dataset.sub}-diff`); if (details) { details.open = true; details.querySelector('pre')?.focus(); } return; }
    if (action === 'select') {
      selected = id; renderPage(); document.querySelector('#task-detail-title')?.focus(); return;
    }
    button.disabled = true;
    try {
      if (action === 'refresh') { await call('tasks.list'); await loadChoices(); sync(); }
      if (['stop', 'accept', 'resume', 'approvePlan'].includes(action)) {
        const job = await call(`tasks.${action}`, { id, ...(action === 'approvePlan' ? planDraft(jobs().find(job => job.id === id)) : {}) });
        getState().tasks = jobs().map(item => item.id === job.id ? job : item);
        if (historic(job)) { bucket = 'history'; selected = job.id; detailStamp = ''; listStamp = ''; }
        sync(); if (!button.isConnected) focusSuccessor(action);
      }
      if (action === 'seen') {
        const job = await call('tasks.acknowledge', { id });
        getState().tasks = jobs().map(item => item.id === job.id ? job : item); sync();
        if (!button.isConnected) focusSuccessor(action);
      }
      if (action === 'close') {
        await call('tasks.dismiss', { id });
        getState().tasks = jobs().filter(item => item.id !== id); sync();
        if (!button.isConnected) focusSuccessor(action);
      }
      if (action === 'report') { const job = jobs().find(item => item.id === id); if (job?.resultId) await openResult(job.resultId); }
    } catch (failure) { toast(failure.message, true); }
    finally { if (button.isConnected) { button.disabled = false; if (document.activeElement === document.body) button.focus({ preventScroll: true }); } }
  });
  return { render, sync, mount() { if (getPage() === 'tasks') { if (!choices) loadChoices(); sync(); } } };
}
