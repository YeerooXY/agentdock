import './review-panel.css';

export function reviewPanelUI({ call, getState, escape: e, icon, resizeHandles, toast, openResult }) {
  const list = value => Array.isArray(value) ? value : [];
  const jobFor = panel => list(getState()?.delegations).find(x => x?.id === panel.reviewId);
  const jobIcon = job => job?.state === 'done' && job.verdict === 'approve' ? 'check' : ['done', 'failed', 'stopped'].includes(job?.state) ? 'close' : 'list';
  function card(panel) {
    return `<article class="session-card review-panel" data-console-id="${e(panel.id)}" data-slot="${panel.slot}"><header class="console-panel-header"><button class="console-grip" draggable="true" data-console-drag="${e(panel.id)}" aria-label="Move review panel ${String(panel.slot).padStart(2, '0')}" title="Drag to move. Alt + 1–9 moves to a slot.">${icon(jobIcon(jobFor(panel)))}</button><span class="slot">${String(panel.slot).padStart(2, '0')}</span><strong class="review-title">${e(panel.name)}<small>for ${e(panel.consoleName || 'a console')}</small></strong><button class="icon-button" data-action="toggle-console" data-id="${e(panel.id)}" aria-label="Expand review panel ${String(panel.slot).padStart(2, '0')}">${icon('expand')}</button><button class="icon-button" data-review-action="close" aria-label="Close review panel ${String(panel.slot).padStart(2, '0')}" title="Close panel">${icon('close')}</button></header><div class="review-panel-body"><div class="review-summary"><span class="review-state" role="status"></span><time class="review-elapsed" datetime="PT0S" aria-label="Elapsed time"></time></div><p class="review-error" hidden></p><pre class="review-log" tabindex="0" role="region" aria-label="Review progress"></pre><div class="review-actions"><button class="secondary" data-review-action="stop" hidden>Stop</button><button class="secondary" data-review-action="result" hidden>Open result</button></div></div>${resizeHandles(panel.slot)}</article>`;
  }
  function updateElapsed(time, job) {
    if (!job) { time.textContent = ''; time.removeAttribute('datetime'); return; }
    const seconds = Math.max(0, Math.floor(((job.finishedAt || Date.now()) - job.startedAt) / 1000));
    time.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    time.setAttribute('datetime', `PT${seconds}S`);
  }
  function mount(panel, body) {
    const job = jobFor(panel), card = body.closest('.review-panel'), slot = String(panel.slot).padStart(2, '0');
    const grip = card.querySelector('.console-grip'), nextIcon = jobIcon(job);
    if (grip.dataset.reviewIcon !== nextIcon) { grip.innerHTML = icon(nextIcon); grip.dataset.reviewIcon = nextIcon; }
    grip.setAttribute('aria-label', `Move review panel ${slot}`);
    card.querySelector('[data-review-action="close"]').setAttribute('aria-label', `Close review panel ${slot}`);
    card.querySelector('[data-review-action="stop"]').setAttribute('aria-label', `Stop review in panel ${slot}`);
    card.querySelector('[data-review-action="result"]').setAttribute('aria-label', `Open result for review panel ${slot}`);
    const status = body.querySelector('.review-state');
    const text = !job ? 'Review unavailable' : job.state === 'done'
      ? `Done · ${job.verdict === 'approve' ? 'Approved' : job.verdict === 'changes-requested' ? 'Changes requested' : 'No clear verdict'}`
      : ({ running: 'Running', failed: 'Failed', stopped: 'Stopped' }[job.state] || job.state);
    if (status.textContent !== text) status.textContent = text;
    body.dataset.state = job?.state || 'unavailable';
    updateElapsed(body.querySelector('.review-elapsed'), job);
    const error = body.querySelector('.review-error');
    error.hidden = !!job && !job.error; error.textContent = job ? job.error || '' : 'Close this panel.';
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
      const job = jobFor(panel);
      const time = document.querySelector(`.review-panel[data-console-id="${panel.id}"] .review-elapsed`);
      if (time) updateElapsed(time, job);
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
