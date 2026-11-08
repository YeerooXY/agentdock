// Settings > Agents: additional accounts, cross-agent reviews and routing.
// Keeps the add-account draft and the rename dialog state across rerenders.
import { escapeHtml as escape } from '../html-escape.js';
import { accountMark } from '../account-identity.js';

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
    return `<section class="surface delegation-settings"><div class="section-label"><div><h2>Cross-agent reviews</h2><p>An agent can ask another of your subscriptions to review its changes.</p></div></div><label class="check-row"><input type="checkbox" data-setting="delegationEnabled" ${on ? 'checked' : ''}>Allow cross-agent reviews</label><label class="check-row"><input type="checkbox" data-setting="delegationPanels" ${state.settings.delegationPanels !== false ? 'checked' : ''}>Show reviews in the console grid</label><fieldset class="delegation-reviewers" ${on ? '' : 'disabled'}><legend>Reviewers</legend>${[['claude', 'Claude Code'], ['codex', 'Codex'], ['kiro', 'Kiro'], ['antigravity', 'Antigravity'], ['copilot', 'GitHub Copilot'], ['grok', 'Grok Build']].map(([id, name]) => `<label class="check-row"><input type="checkbox" data-delegation-provider="${id}" ${allowed.includes(id) ? 'checked' : ''}>${name}</label>`).join('')}</fieldset><p class="field-hint">Paddock runs the reviewer’s own CLI read-only with your sign-in, chooses an eligible account and saves each review in Results. The changed code goes to the reviewer’s vendor. Up to 2 at a time and 20 an hour.</p>${rows ? `<div class="delegation-list">${rows}</div>` : ''}</section>`;
  }
  function routingSection() {
    const routing = getState().settings.routing;
    if (!routing) return '';
    const rows = list => list.map(item => `${item.accountId} ${item.model}`).join('\n');
    return `<section class="surface delegation-settings"><h2>Routing</h2><form id="routing-form"><label class="check-row"><input type="checkbox" name="discoverAccounts" ${routing.discoverAccounts ? 'checked' : ''}>Discover connected accounts</label><label class="check-row"><input type="checkbox" name="preferFree" ${routing.preferFree !== false ? 'checked' : ''}>Prefer free cloud allowances</label><label>Account funding<textarea name="accountFunding" rows="3" spellcheck="false" placeholder="antigravity:default free">${escape(Object.entries(routing.accountFunding || {}).map(([id, kind]) => `${id} ${kind}`).join('\n'))}</textarea></label><p class="field-hint">Use an account ID and free, included, metered or unknown. Unlisted accounts use their reported plan. Metered accounts require an explicit task assignment.</p><p class="field-hint">Enter one account ID and model per line, in preference order.</p>${['small', 'medium', 'large'].map(size => `<label>${size[0].toUpperCase() + size.slice(1)} tasks<textarea name="${size}" rows="3" spellcheck="false">${escape(rows(routing[size]))}</textarea></label>`).join('')}<label>Default reviewer <input name="reviewer" value="${escape(routing.defaultReviewer ? rows([routing.defaultReviewer]) : '')}" placeholder="Account ID and model, or leave blank"></label><label class="check-row"><input type="checkbox" name="claudeReviewsOnly" ${routing.claudeReviewsOnly ? 'checked' : ''}>Suggest Claude for reviews only</label><label>Excluded models<textarea name="excludedModels" rows="5" spellcheck="false">${escape(routing.excludedModels.join('\n'))}</textarea></label><p class="form-error" role="alert"></p><button type="submit" class="secondary">Save routing</button></form></section>`;
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
        const parse = text => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => { const parts = line.split(/\s+/); if (parts.length !== 2) throw new Error('Enter an account ID and model on each line.'); return { accountId: parts[0], model: parts[1] }; });
        const reviewer = parse(data.reviewer || ''); if (reviewer.length > 1) throw new Error('Enter one default reviewer.');
        await call('settings', { routing: { discoverAccounts: !!data.discoverAccounts, preferFree: !!data.preferFree, accountFunding: Object.fromEntries(parse(data.accountFunding || '').map(row => [row.accountId, row.model])), small: parse(data.small), medium: parse(data.medium), large: parse(data.large), defaultReviewer: reviewer[0] || null, claudeReviewsOnly: !!data.claudeReviewsOnly, excludedModels: data.excludedModels.split(/\r?\n/).map(line => line.trim()).filter(Boolean) } });
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
    if (!button.dataset.delegationStop) return false;
    button.disabled = true; return call('workbench.delegation.stop', button.dataset.delegationStop);
  }
  // Opens the add-account form for a provider, from Usage.
  function openNewAccount(provider) {
    draft.provider = provider; navigate('agent-settings');
    const select = $('#account-profile-form [name=provider]'); if (select && !select.disabled) select.value = provider;
    const form = $('#account-profile-form'); form?.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' }); form?.elements.label.focus({ preventScroll: true });
  }
  return { render: () => accountsSection() + delegationSection() + routingSection(), submits, actions, click, openNewAccount };
}
