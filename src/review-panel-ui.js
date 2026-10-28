import './review-panel.css';

export function reviewPanelUI({ call, getState, escape: e, icon, resizeHandles, toast, openResult }) {
  const list = value => Array.isArray(value) ? value : [];
  function card(panel) {
    return `<article class="session-card review-panel" data-console-id="${e(panel.id)}" data-slot="${panel.slot}"><header class="console-panel-header"><button class="console-grip" draggable="true" data-console-drag="${e(panel.id)}" aria-label="Move review panel" title="Drag to move. Alt + 1–9 moves to a slot.">${icon('check')}</button><span class="slot">${String(panel.slot).padStart(2, '0')}</span><strong class="review-title">${e(panel.name)}<small>for ${e(panel.consoleName || 'a console')}</small></strong><button class="icon-button" data-action="toggle-console" data-id="${e(panel.id)}" aria-label="Expand review panel">${icon('expand')}</button><button class="icon-button" data-review-action="close" aria-label="Close panel" title="Close panel">${icon('close')}</button></header><div class="review-panel-body"><div class="review-summary"><span class="review-state" role="status"></span><time class="review-elapsed" aria-label="Elapsed time"></time></div><p class="review-error" hidden></p><pre class="review-log" tabindex="0" role="region" aria-label="Review progress"></pre><div class="review-actions"><button class="secondary" data-review-action="stop" hidden>Stop</button><button class="secondary" data-review-action="result" hidden>Open result</button></div></div>${resizeHandles(panel.slot)}</article>`;
  }
  function elapsed(job) {
    const seconds = Math.max(0, Math.floor(((job.finishedAt || Date.now()) - job.startedAt) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function mount(panel, body) {
    const job = list(getState()?.delegations).find(x => x?.id === panel.reviewId);
    const status = body.querySelector('.review-state');
    const text = !job ? 'Review unavailable' : job.state === 'done'
      ? `Done · ${job.verdict === 'approve' ? 'Approved' : job.verdict === 'changes-requested' ? 'Changes requested' : 'No clear verdict'}`
      : ({ running: 'Running', failed: 'Failed', stopped: 'Stopped' }[job.state] || job.state);
    if (status.textContent !== text) status.textContent = text;
    body.dataset.state = job?.state || 'unavailable';
    body.querySelector('.review-elapsed').textContent = job ? elapsed(job) : '';
    const error = body.querySelector('.review-error');
    error.hidden = !job?.error; error.textContent = job?.error || '';
    const log = body.querySelector('.review-log'), next = list(job?.log).join('\n');
    if (log.textContent !== next) {
      const follow = log.scrollHeight - log.clientHeight - log.scrollTop < 24;
      const top = log.scrollTop;
      log.textContent = next;
      if (follow) log.scrollTop = log.scrollHeight; else log.scrollTop = top;
    }
    body.querySelector('[data-review-action="stop"]').hidden = job?.state !== 'running';
    body.querySelector('[data-review-action="result"]').hidden = !job?.resultId;
  }
  setInterval(() => {
    for (const panel of list(getState()?.codePanels)) {
      if (panel?.kind !== 'review') continue;
      const job = list(getState()?.delegations).find(x => x?.id === panel.reviewId);
      const time = document.querySelector(`.review-panel[data-console-id="${panel.id}"] .review-elapsed`);
      if (time && job) time.textContent = elapsed(job);
    }
  }, 1000);
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-review-action]'); if (!button) return;
    const panel = list(getState()?.codePanels).find(x => x?.id === button.closest('.review-panel')?.dataset.consoleId);
    if (!panel) return;
    const job = list(getState()?.delegations).find(x => x?.id === panel.reviewId);
    button.disabled = true;
    try {
      if (button.dataset.reviewAction === 'close') await call('review.close', panel.id);
      if (button.dataset.reviewAction === 'stop' && job?.state === 'running') await call('workbench.delegation.stop', job.id);
      if (button.dataset.reviewAction === 'result' && job?.resultId) await openResult(job.resultId);
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  });
  return { card, mount };
}
