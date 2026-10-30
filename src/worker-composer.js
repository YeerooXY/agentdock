import './worker-composer.css';
// Keep the composer node in place through output and task status updates.
export function workerComposer({ call, escape: e, toast }) {
  const drafts = new Map();
  function sync(card, session) {
    if (!session.taskId) return;
    let form = card.querySelector('[data-worker-composer]');
    if (!form) {
      form = document.createElement('form'); form.dataset.workerComposer = session.id;
      form.className = 'worker-composer';
      form.innerHTML = `<label>Worker message<textarea rows="2" maxlength="16000" aria-label="Worker message for ${e(session.name)}"></textarea></label><button type="submit" class="secondary">Queue</button><span role="status" aria-live="polite"></span>`;
      const input = form.querySelector('textarea'); input.value = drafts.get(session.consoleKey) || '';
      input.addEventListener('input', () => drafts.set(session.consoleKey, input.value));
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const text = input.value; if (!text.trim() || form.dataset.busy) return;
        const target = form.workerSession;
        if (target.consoleCapabilities?.steering !== true) return;
        // A retry of the same submission keeps its ID after a lost reply.
        if (form.submission?.text !== text) form.submission = { text, id: crypto.randomUUID() };
        form.dataset.busy = 'true'; form.querySelector('button').disabled = true;
        try {
          const result = await call('worker.submit', { id: target.id, consoleKey: target.consoleKey,
            launchId: target.launchId, submissionId: form.submission.id, text });
          form.querySelector('[role="status"]').textContent = result.status === 'acknowledged' ? 'Delivered' : result.status === 'uncertain' ? 'Delivery unconfirmed' : 'Queued';
          if (input.value === text) { input.value = ''; drafts.delete(target.consoleKey); form.submission = null; }
        } catch (error) { toast(error.message, true); }
        finally { delete form.dataset.busy; form.querySelector('button').disabled = form.workerSession.consoleCapabilities?.steering !== true; }
      });
      card.querySelector('.console-panel-body').after(form);
    }
    form.workerSession = session;
    const supported = session.consoleCapabilities?.steering === true;
    form.querySelector('textarea').disabled = !supported;
    form.querySelector('button').disabled = !supported || !!form.dataset.busy;
    form.querySelector('[role="status"]').textContent = supported ? session.steeringState || '' : 'Steering unavailable for this CLI';
  }
  return { sync };
}
