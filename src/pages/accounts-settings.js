// Settings > Agents: additional accounts, cross-agent reviews and routing.
// Keeps the add-account draft and the rename dialog state across rerenders.
import { escapeHtml as escape } from '../html-escape.js';
import { accountMark } from '../account-identity.js';
import { tierOptions, excludedModelCandidates } from './routing-controls.js';

export function accountSettings({ getState, call, toast, providerName, getPage, renderPage, navigate, reducedMotion, submitForm }) {
  const $ = selector => document.querySelector(selector);
  let draft = { provider: 'codex', label: '', error: '' }, busy = false, created = null;
  let renameOpener = null, renameBusy = false;
  const profileProviders = () => getState().accountProviders || [];
  const profileProvider = provider => profileProviders().find(item => item.id === provider);

  function providerSupport() {
    const supported = profileProviders().filter(provider => provider.namedProfiles).map(provider => escape(provider.name)).join(', ');
    const remaining = profileProviders().filter(provider => !provider.namedProfiles).map(provider => escape(provider.name)).join(', ');
    return `<details class="account-provider-support"><summary>Provider support</summary><p>Extra accounts: ${supported || 'Unavailable'}.</p>${remaining ? `<p>${remaining}: separate sign-ins are not available yet. You can use the existing account for each agent.</p>` : ''}<p>Usage reporting and switching an existing conversation depend on the provider.</p></details>`;
  }
  function accountsSection() {
    const profileCards = (getState().accounts || []).filter(account => account.profile).map(account => `<article class="account-profile-row"><div>${accountMark(account.provider)}<span><strong>${escape(account.label)}</strong><small>${providerName(account.provider)} ${account.loginCompletedAt ? 'Signed in' : 'Sign-in needed'}</small></span></div><span><button class="subtle" data-action="account-login" data-id="${escape(account.id)}" ${profileProvider(account.provider)?.namedProfiles ? '' : 'disabled'}>${account.loginCompletedAt ? 'Sign in again' : 'Sign in'}</button><button class="subtle" data-action="account-rename" data-id="${escape(account.id)}" data-label="${escape(account.label)}">Rename</button><button class="subtle danger" data-action="account-remove" data-id="${escape(account.id)}" aria-label="Remove ${escape(account.label)}">Remove</button></span></article>`).join('');
    return `<section class="surface account-switch-panel"><div class="section-label"><h2>Accounts</h2></div><form id="account-profile-form" class="account-profile-form"><label>Provider<select name="provider" ${created ? 'disabled' : ''}>${profileProviders().map(provider => `<option value="${escape(provider.id)}" ${draft.provider === provider.id ? 'selected' : ''} ${provider.namedProfiles ? '' : 'disabled'}>${escape(provider.name)}${provider.namedProfiles ? '' : ' (separate accounts unavailable)'}</option>`).join('')}</select></label><label>Account name<input name="label" required maxlength="64" autocomplete="off" value="${escape(draft.label)}" ${created ? 'disabled' : ''}></label><button class="secondary" type="submit" ${busy || !profileProvider(draft.provider)?.namedProfiles ? 'disabled' : ''}>${created ? 'Retry sign-in' : 'Add account'}</button>${profileProvider(draft.provider)?.loginInstruction ? `<p class="field-hint">${escape(profileProvider(draft.provider).loginInstruction)}</p>` : ''}${created ? '<p class="field-hint">This account is saved. Retry sign-in to open its console.</p>' : ''}<p class="form-error" role="alert">${escape(draft.error)}</p></form>${providerSupport()}<div class="account-profile-list">${profileCards || '<p class="section-note">No additional accounts.</p>'}</div><p class="section-note">Use subscriptions within provider terms. Switching accounts must respect each provider’s rate limits and restrictions.</p></section>`;
  }
  // Cross-agent reviews: optional, off by default, limited to the user's own sign-ins.
  function delegationSection() {
    const state = getState();
    const on = state.settings.delegationEnabled === true, allowed = state.settings.delegationProviders || ['claude', 'codex', 'kiro', 'antigravity', 'copilot', 'grok'];
    const states = { running: 'Reviewing', done: 'Done', failed: 'Failed', stopped: 'Stopped' };
    const rows = (state.delegations || []).filter((job, index) => job.state === 'running' || index < 6).map(job => `<div class="delegation-row"><span><strong>${escape(job.reviewer.label)}</strong>, ${states[job.state] || escape(job.state)}${job.verdict ? ', ' + (job.verdict === 'approve' ? 'Approved' : job.verdict === 'changes-requested' ? 'Changes requested' : 'No clear verdict') : ''}${job.noFreeSlot ? ', No free slot' : ''}<small>For ${escape(job.consoleName || 'a console')}. ${escape(job.error || job.why)}</small></span>${job.state === 'running' ? `<button class="secondary" data-delegation-stop="${escape(job.id)}">Stop</button>` : ''}</div>`).join('');
    return `<section class="surface delegation-settings"><div class="section-label"><div><h2>Cross-agent reviews</h2><p>An agent can ask another of your subscriptions to review its changes.</p></div></div><label class="check-row"><input type="checkbox" data-setting="delegationEnabled" ${on ? 'checked' : ''}>Allow cross-agent reviews</label><label class="check-row"><input type="checkbox" data-setting="delegationPanels" ${state.settings.delegationPanels !== false ? 'checked' : ''}>Show reviews in the console grid</label><fieldset class="delegation-reviewers" ${on ? '' : 'disabled'}><legend>Reviewers</legend>${[['claude', 'Claude Code'], ['codex', 'Codex'], ['kiro', 'Kiro'], ['antigravity', 'Antigravity'], ['copilot', 'GitHub Copilot'], ['grok', 'Grok Build']].map(([id, name]) => `<label class="check-row"><input type="checkbox" data-delegation-provider="${id}" ${allowed.includes(id) ? 'checked' : ''}>${name}</label>`).join('')}</fieldset><p class="field-hint">Paddock runs the reviewer’s own CLI read-only with your sign-in, chooses an eligible account and keeps each report in worker history. The changed code goes to the reviewer’s vendor. Up to 2 at a time and 20 an hour.</p>${rows ? `<div class="delegation-list">${rows}</div>` : ''}</section>`;
  }
  // Build a tier-entry row: a select pre-selected to storedValue (or first option), with a remove button.
  function tierEntryHtml(tierName, opts, storedValue, index) {
    const optHtml = `<option value="">Automatic</option>` +
      opts.map(o => `<option value="${escape(o.value)}"${o.value === storedValue ? ' selected' : ''}>${escape(o.label)}</option>`).join('');
    return `<div class="routing-tier-row"><select name="${escape(tierName)}-entry" aria-label="${escape(tierName[0].toUpperCase() + tierName.slice(1))} tasks entry ${index + 1}">${optHtml}</select><button type="button" class="subtle" data-remove-tier-row aria-label="Remove entry ${index + 1} from ${tierName} tasks">Remove</button></div>`;
  }
  function tierFieldsetHtml(tierName, accounts, stored) {
    const opts = tierOptions(accounts, stored);
    const entries = stored.length
      ? stored.map((entry, i) => tierEntryHtml(tierName, opts, `${entry.accountId} ${entry.model}`, i))
      : [tierEntryHtml(tierName, opts, '', 0)];
    const label = tierName[0].toUpperCase() + tierName.slice(1);
    return `<fieldset class="routing-tier-list" data-tier="${escape(tierName)}"><legend>${escape(label)} tasks</legend><div class="routing-tier-entries">${entries.join('')}</div><button type="button" class="subtle" data-add-tier-row="${escape(tierName)}">Add entry</button></fieldset>`;
  }
  function routingSection() {
    const state = getState(), routing = state.settings.routing;
    if (!routing) return '';
    const accounts = state.accounts || [];
    // Reviewer select: single select with Automatic + discovered + stored-not-found options.
    const reviewerStored = routing.defaultReviewer ? [routing.defaultReviewer] : [];
    const reviewerOpts = tierOptions(accounts, reviewerStored);
    const reviewerValue = routing.defaultReviewer ? `${routing.defaultReviewer.accountId} ${routing.defaultReviewer.model}` : '';
    const reviewerOptHtml = `<option value="">None</option>` +
      reviewerOpts.map(o => `<option value="${escape(o.value)}"${o.value === reviewerValue ? ' selected' : ''}>${escape(o.label)}</option>`).join('');
    const dispatcher = state.settings.dispatcher, dispatcherValue = dispatcher ? `${dispatcher.accountId} ${dispatcher.model}` : '';
    const dispatcherOptions = `<option value="">Small routing tier</option>` + tierOptions(accounts, dispatcher ? [dispatcher] : []).map(o => `<option value="${escape(o.value)}"${o.value === dispatcherValue ? ' selected' : ''}>${escape(o.label)}</option>`).join('');
    // Excluded-models checklist: all discovered model IDs, pre-checked if in excludedModels.
    const excluded = new Set(routing.excludedModels || []);
    const candidateIds = excludedModelCandidates(accounts);
    // Stored excluded models not in discovered list stay visible.
    const extraExcluded = [...excluded].filter(id => !candidateIds.includes(id));
    const allExcludedCandidates = candidateIds.concat(extraExcluded);
    const excludedChecklistHtml = allExcludedCandidates.length
      ? allExcludedCandidates.map(id => `<label class="check-row toggle-row"><input type="checkbox" name="excludedModel" value="${escape(id)}"${excluded.has(id) ? ' checked' : ''}><span>${escape(id)}</span></label>`).join('')
      : '<p class="field-hint">No models discovered yet. Connect an account to see available models.</p>';
    return `<section class="surface delegation-settings"><h2>Routing</h2><form id="routing-form"><label>Dispatcher<select name="dispatcher" aria-label="Dispatcher">${dispatcherOptions}</select></label><label class="check-row"><input type="checkbox" name="autoApproveSmallPlans" ${state.settings.autoApproveSmallPlans ? 'checked' : ''}>Start small plans without approval</label><p class="field-hint">One or two small tasks that run in order. Larger, design or parallel plans still wait for approval.</p><label class="check-row"><input type="checkbox" name="discoverAccounts" ${routing.discoverAccounts ? 'checked' : ''}>Discover connected accounts</label><label class="check-row"><input type="checkbox" name="preferFree" ${routing.preferFree !== false ? 'checked' : ''}>Prefer free allowances for small tasks</label><label>Account funding<textarea name="accountFunding" rows="3" spellcheck="false" placeholder="antigravity:default free">${escape(Object.entries(routing.accountFunding || {}).map(([id, kind]) => `${id} ${kind}`).join('\n'))}</textarea></label><p class="field-hint">Use an account ID and free, included, metered or unknown. Unlisted accounts use their reported plan. Metered accounts require an explicit task assignment. Free workers for medium or large tasks also require an explicit assignment.</p>${['small', 'medium', 'large'].map(size => tierFieldsetHtml(size, accounts, routing[size] || [])).join('')}<label>Default reviewer<select name="reviewer" aria-label="Default reviewer">${reviewerOptHtml}</select></label><label class="check-row"><input type="checkbox" name="claudeReviewsOnly" ${routing.claudeReviewsOnly ? 'checked' : ''}>Suggest Claude for reviews only</label><fieldset class="routing-excluded-list"><legend>Excluded models</legend>${excludedChecklistHtml}</fieldset><p class="form-error" role="alert"></p><button type="submit" class="secondary">Save routing</button></form></section>`;
  }

  $('#account-rename-dialog').addEventListener('close', () => {
    const dialog = $('#account-rename-dialog'), active = document.activeElement;
    const id = $('#account-rename-form').dataset.id;
    const fallback = id ? document.querySelector(`[data-action="account-rename"][data-id="${CSS.escape(id)}"]`) : null;
    const target = renameOpener?.isConnected ? renameOpener : fallback;
    const focusReturned = active === renameOpener || active === fallback;
    const focusVacant = active === dialog || dialog.contains(active) || active === document.body || active === document.documentElement;
    if (focusReturned || focusVacant) target?.focus({ preventScroll: true });
    renameOpener = null;
  });
  document.addEventListener('input', event => {
    const input = event.target;
    if (input.form?.id === 'account-profile-form' && input.name === 'label') { draft.label = input.value; draft.error = ''; }
    if (input.form?.id === 'account-rename-form') input.form.querySelector('.form-error').textContent = '';
  });
  document.addEventListener('change', async event => {
    const input = event.target;
    if (input.form?.id === 'account-profile-form' && input.name === 'provider') { draft.provider = input.value; draft.error = ''; renderPage(); }
    if (input.dataset.delegationProvider) {
      const chosen = [...document.querySelectorAll('[data-delegation-provider]')].filter(x => x.checked).map(x => x.dataset.delegationProvider);
      try { await call('settings', { delegationProviders: chosen }); } catch (error) { input.checked = !input.checked; toast(error.message, true); }
    }
  });

  const submits = {
    async 'routing-form'(form, data) {
      try {
        const parseText = text => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => { const parts = line.split(/\s+/); if (parts.length !== 2) throw new Error('Enter an account ID and funding type on each line.'); return { accountId: parts[0], model: parts[1] }; });
        const parsePair = value => { if (!value) return null; const parts = value.trim().split(/\s+/); if (parts.length !== 2) throw new Error('Select a valid account and model for the reviewer.'); return { accountId: parts[0], model: parts[1] }; };
        // Collect tier entries from select lists (multiple selects share name="size-entry").
        const tierEntries = size => [...form.querySelectorAll(`[name="${size}-entry"]`)].map(s => s.value).filter(Boolean).map(v => { const parts = v.split(/\s+/); return parts.length === 2 ? { accountId: parts[0], model: parts[1] } : null; }).filter(Boolean);
        const reviewer = parsePair(data.reviewer);
        const dispatcher = parsePair(data.dispatcher);
        const excludedModels = new FormData(form).getAll('excludedModel');
        await call('settings', { dispatcher, autoApproveSmallPlans: !!data.autoApproveSmallPlans, routing: { discoverAccounts: !!data.discoverAccounts, preferFree: !!data.preferFree, accountFunding: Object.fromEntries(parseText(data.accountFunding || '').map(row => [row.accountId, row.model])), small: tierEntries('small'), medium: tierEntries('medium'), large: tierEntries('large'), defaultReviewer: reviewer, claudeReviewsOnly: !!data.claudeReviewsOnly, excludedModels } });
        toast('Routing saved.');
      } catch (error) { form.querySelector('.form-error').textContent = error.message; }
    },
    async 'account-profile-form'(form, data) {
      if (busy) return;
      busy = true;
      draft = { provider: data.provider || created?.provider || 'codex', label: data.label ?? created?.label ?? '', error: '' };
      await submitForm(form, async () => {
        form.querySelector('.form-error').textContent = '';
        if (!created) {
          const account = await call('accounts.create', { provider: data.provider, label: data.label });
          created = { id: account.id, provider: data.provider, label: data.label };
        }
        await call('accounts.login', { id: created.id });
        created = null;
        draft = { provider: 'codex', label: '', error: '' };
        if (form.isConnected) { form.elements.provider.value = 'codex'; form.elements.label.value = ''; }
        toast('Account added. Sign in from the new console.');
      }, {
        onError: error => { draft.error = error.message; },
        onDone: () => {
          const restoreFocus = document.activeElement === document.body || form.contains(document.activeElement);
          busy = false;
          if (getPage() !== 'agent-settings') return;
          renderPage();
          if (restoreFocus && document.activeElement === document.body) {
            const next = $('#account-profile-form');
            // A saved account disables the provider and name fields; the retry button is the next control.
            (created ? next?.querySelector('[type="submit"]') : next?.elements.provider)?.focus({ preventScroll: true });
          }
        }
      });
    },
    async 'account-rename-form'(form, data) {
      if (renameBusy) return;
      renameBusy = true;
      await submitForm(form, async () => {
        await call('accounts.rename', { id: form.dataset.id, label: data.label });
        $('#account-rename-dialog').close();
        toast('Account name updated.');
        const renamed = document.querySelector(`[data-action="account-rename"][data-id="${CSS.escape(form.dataset.id)}"]`);
        if (renamed) renamed.focus({ preventScroll: true });
        else if (renameOpener?.isConnected) renameOpener.focus({ preventScroll: true });
        renameOpener = null;
      }, {
        onError: error => { form.querySelector('.form-error').textContent = error.message; },
        onDone: submit => { renameBusy = false; if (submit?.isConnected) submit.disabled = false; }
      });
    }
  };
  const actions = {
    async 'account-login'(button) { await call('accounts.login', { id: button.dataset.id }); toast('Sign-in console opened.'); },
    async 'account-remove'(button) {
      try { if (await call('accounts.remove', button.dataset.id)) toast('Account removed.'); }
      catch (error) { toast(error.message, true); }
    },
    'account-rename'(button) {
      renameOpener = button;
      const form = $('#account-rename-form');
      form.dataset.id = button.dataset.id;
      form.elements.label.value = button.dataset.label || '';
      form.querySelector('.form-error').textContent = '';
      $('#account-rename-dialog').showModal();
      form.elements.label.focus(); form.elements.label.select();
    },
    'cancel-account-rename'() { $('#account-rename-dialog').close(); }
  };
  // Returns false when no button matched, else the running promise.
  function click(button) {
    if (button.dataset.delegationStop) { button.disabled = true; return call('workbench.delegation.stop', button.dataset.delegationStop); }
    // Add a tier entry row to the given tier fieldset.
    if (button.dataset.addTierRow) {
      const tierName = button.dataset.addTierRow;
      const container = button.closest(`[data-tier="${CSS.escape(tierName)}"]`)?.querySelector('.routing-tier-entries');
      if (!container) return false;
      const index = container.children.length;
      // Reuse the same options as existing rows in this tier (clone the first select's options).
      const refSelect = container.querySelector('select');
      const opts = refSelect ? [...refSelect.options].map(o => ({ value: o.value, label: o.text, notFound: false })) : [];
      // Build a new row with an empty (Automatic) selection.
      const row = document.createElement('div');
      row.className = 'routing-tier-row';
      row.innerHTML = `<select name="${escape(tierName)}-entry" aria-label="${escape(tierName[0].toUpperCase() + tierName.slice(1))} tasks entry ${index + 1}">${opts.map(o => `<option value="${escape(o.value)}">${escape(o.label)}</option>`).join('')}</select><button type="button" class="subtle" data-remove-tier-row aria-label="Remove entry ${index + 1} from ${tierName} tasks">Remove</button>`;
      container.appendChild(row);
      row.querySelector('select').focus({ preventScroll: true });
      return true;
    }
    // Remove a tier entry row.
    if (Object.prototype.hasOwnProperty.call(button.dataset, 'removeTierRow')) {
      const row = button.closest('.routing-tier-row');
      if (!row) return false;
      const container = row.parentElement;
      const isOnly = container.children.length === 1;
      if (isOnly) {
        // Keep one row; just reset its value to Automatic.
        const sel = row.querySelector('select'); if (sel) { sel.value = ''; sel.focus({ preventScroll: true }); }
        return true;
      }
      const next = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      (next?.querySelector('select') || button.closest('fieldset')?.querySelector('button[data-add-tier-row]'))?.focus({ preventScroll: true });
      return true;
    }
    return false;
  }
  // Opens the add-account form for a provider, from Usage.
  function openNewAccount(provider) {
    draft.provider = provider; navigate('agent-settings');
    const select = $('#account-profile-form [name=provider]'); if (select && !select.disabled) select.value = provider;
    const form = $('#account-profile-form'); form?.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' }); form?.elements.label.focus({ preventScroll: true });
  }
  return { render: () => accountsSection() + delegationSection() + routingSection(), submits, actions, click, openNewAccount };
}
