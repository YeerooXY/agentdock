import './mobile.css';
export function mobileUI({ call, getState, escape: e, icon, toast, navigate }) {
  const dialog = document.createElement('dialog'); dialog.className = 'mobile-setup'; dialog.setAttribute('aria-labelledby', 'mobile-title'); document.body.append(dialog);
  let invite = null, step = 0, busy = false, deviceStamp = '', networkStamp = '', checkId = 0, draft = null, current = null;
  const state = () => current || getState().mobile || { interfaces: [], devices: [], network: {} };
  const button = (action, label, primary = false) => `<button type="button" data-mobile="${action}" class="${primary ? 'primary' : 'secondary'}">${label}</button>`;
  const renderSettings = () => `<section class="surface"><div class="section-label"><h2>Android</h2>${button('open', 'Connect a phone', true)}</div><p class="field-hint">${state().enabled ? `${state().devices.length} paired · ${state().devices.filter(x => x.connected).length} connected` : 'Phone connection is off.'}</p>${state().error ? `<p role="alert">${e(state().error)}</p>` : ''}</section>`;
  const phoneNames = new Map();
  // Phones connect only through Tailscale, so only this PC's 100.x addresses are offered.
  const defaultHost = s => s.interfaces.find(x => x.tailscale)?.address || '';
  const options = (items, selected) => items.map(([value, label]) => `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(label)}</option>`).join('');
  function remember() { for (const input of dialog.querySelectorAll('[data-phone-name]')) phoneNames.set(input.dataset.phoneName, input.value); for (const input of dialog.querySelectorAll('[data-field]')) draft[input.dataset.field] = input.value; }
  // The Connection step shows the PC, the encrypted Tailscale link and the
  // phone, animated to match how far the connection has come.
  const linkState = s => !s.interfaces.some(x => x.tailscale) ? 'missing' : !s.enabled ? 'found' : s.devices.some(d => d.connected) ? 'linked' : 'waiting';
  const linkCaptions = { missing: 'Waiting for Tailscale on this PC.', found: 'Tailscale found. Enable the connection below.', waiting: 'Connection on. Waiting for your phone.', linked: 'Your phone is connected.' };
  const linkPath = 'M134 50C178 18 214 92 262 58';
  const linkArt = s => `<figure class="mobile-link" data-state="${linkState(s)}"><svg viewBox="0 0 340 114" aria-hidden="true" focusable="false"><g class="link-pc"><rect x="16" y="14" width="112" height="72" rx="8" class="device-body"/><rect x="24" y="22" width="96" height="56" rx="4" class="device-screen"/><path d="M40 40l10 8-10 8M56 58h16" class="device-glyph"/><path d="M72 86v12M52 100h40" class="device-stand"/></g><path d="${linkPath}" class="link-track"/><path d="${linkPath}" class="link-flow" pathLength="100"/><path d="M262 58C214 92 178 18 134 50" class="link-flow link-return" pathLength="100"/><g class="link-lock"><circle cx="197" cy="55" r="15"/><rect x="190" y="54" width="14" height="10" rx="2"/><path d="M193 54v-3a4 4 0 0 1 8 0v3"/></g><g class="link-phone"><circle cx="296" cy="58" r="30" class="phone-ring"/><rect x="274" y="10" width="44" height="96" rx="9" class="device-body"/><rect x="279" y="20" width="34" height="74" rx="4" class="device-screen"/><path d="M286 58l7 7 13-14" class="phone-check" pathLength="1"/></g></svg><figcaption role="status">${linkCaptions[linkState(s)]}</figcaption></figure>`;
  function updateLink() {
    const figure = dialog.querySelector('.mobile-link'), next = linkState(state());
    if (!figure || figure.dataset.state === next) return;
    figure.dataset.state = next; figure.querySelector('figcaption').textContent = linkCaptions[next];
  }
  function connectionChanged() {
    const s = state();
    return draft.host !== s.host;
  }
  function pairingRequest(s) {
    const request = s.pendingPairing;
    if (!request) return '';
    return `<section class="mobile-approval" aria-labelledby="phone-approval-title"><h3 id="phone-approval-title">${request.state === 'approved' ? 'Phone approved' : 'Allow this phone?'}</h3><p>${e(request.name)}</p><div class="mobile-match-code" aria-label="Verification code ${e(request.code)}">${e(request.code.slice(0, 3))} ${e(request.code.slice(3))}</div><p>${request.state === 'approved' ? 'Waiting for the phone to finish connecting.' : 'Check that this code matches your phone. Allowing access gives it control of your consoles and Results.'}</p><p class="field-hint">Expires ${new Date(request.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>${request.state === 'pending' ? `<div class="wb-toolbar"><button type="button" class="secondary" data-mobile="deny" data-id="${e(request.id)}">Deny</button><button type="button" class="primary" data-mobile="approve" data-id="${e(request.id)}">Codes match — Allow</button></div>` : ''}</section>`;
  }
  function firewallPage(s) {
    const n = s.network || {}, status = n.firewall || 'unknown';
    if (!s.enabled) return '<h2>Windows Firewall</h2><p>Enable the connection on the first step.</p>';
    const scope = 'your Tailscale address, from Tailscale devices';
    const retry = button('check-firewall', 'Check again');
    if (status === 'checking') return '<h2>Windows Firewall</h2><p role="status">Checking the existing firewall rule…</p><p class="field-hint">This check does not change Windows settings or ask for administrator approval.</p>';
    if (status === 'allowed') return `<h2>Windows Firewall</h2><p class="mobile-success" role="status"><strong>Already configured</strong></p><p>Paddock’s firewall rule matches this connection. No need to allow it again.</p><p class="field-hint">The rule covers Paddock’s TCP port on ${scope}. Pair your phone next, or continue using your paired phone.</p><div class="wb-toolbar">${retry}</div><details><summary>Manage firewall rule</summary>${button('remove-firewall', 'Remove firewall rule')}</details>`;
    const outdated = status === 'outdated', missing = status === 'missing';
    const message = outdated ? 'The firewall rule needs updating for this connection.' : missing ? 'Paddock’s firewall rule was not found.' : 'The firewall status could not be checked.';
    const action = outdated ? 'Update firewall rule' : missing ? 'Allow Paddock in Windows Firewall' : 'Configure firewall rule';
    return `<h2>Windows Firewall</h2><p role="status">${message}</p>${n.firewallError ? `<p class="field-hint">${e(n.firewallError)}</p>` : ''}<div class="wb-toolbar">${button('firewall', action, outdated || missing)}${retry}</div><p class="field-hint">Only configuring or updating the rule asks for administrator approval. The rule covers Paddock’s TCP port on ${scope}.</p><p class="field-hint">If your phone already connects, you can continue without changing the firewall. This checks Paddock’s own rule, not other rules you may have configured.</p>`;
  }
  function renderFirewall() {
    if (!dialog.open || busy || step !== 1) return;
    const focus = dialog.contains(document.activeElement) ? document.activeElement.dataset.mobile : null;
    render();
    if (focus) (dialog.querySelector(`[data-mobile="${CSS.escape(focus)}"]`) || dialog.querySelector('[data-mobile=next]'))?.focus();
  }
  async function checkFirewall() {
    if (!state().enabled || getState().platform && getState().platform !== 'win32') return;
    const id = ++checkId;
    current = { ...state(), network: { ...state().network, firewall: 'checking', firewallError: '' } }; renderFirewall();
    try {
      const checked = await call('mobile.check-firewall');
      if (id !== checkId) return;
      current = checked || current;
    } catch (error) {
      if (id !== checkId) return;
      current = { ...state(), network: { ...state().network, firewall: 'unknown', firewallError: error.message } };
    }
    renderFirewall();
  }
  function render() {
    const s = state(), addresses = s.interfaces.filter(x => x.tailscale);
    const pages = [
      `<h2>Connect your phone</h2>${linkArt(s)}<div class="wb-toolbar"><button type="button" class="secondary" data-docs="android-download">Get the Android app ↗</button></div>
      ${s.notice ? `<p class="mobile-network-note" role="status">${e(s.notice)}</p>` : ''}
      <div class="mobile-name-row"><label>This PC’s name<input data-field="name" value="${e(draft.name)}" maxlength="64" autocomplete="off"></label>${button('rename-pc', 'Save name')}</div>
      <p>Your phone reaches this PC through Tailscale, an encrypted private network. Only devices signed in to your Tailscale account can connect, at home or away. No router port forwarding is needed.</p>
      <ol class="mobile-steps"><li>Install Tailscale on this PC and sign in. <button type="button" class="subtle" data-docs="tailscale">Get Tailscale ↗</button></li><li>Install Tailscale on your phone, sign in to the same account and turn it on.</li><li>Choose this PC’s Tailscale address below.</li></ol>
      ${addresses.length ? `<label>PC address<select data-field="host" id="mobile-host">${options(addresses.map(x => [x.address, `Tailscale · ${x.address}`]), draft.host)}</select></label>` : '<p class="mobile-network-note" role="status">No Tailscale address found. Sign in to Tailscale on this PC, then refresh.</p>'}
      <p class="field-hint">Keep Tailscale on, on both devices, and keep this PC awake with Paddock running.</p>${button('refresh', 'Refresh addresses')}
      <div class="wb-toolbar mobile-enable">${button('enable', s.enabled ? connectionChanged() ? 'Save connection' : 'Continue setup' : 'Enable connection', true)}${s.enabled ? button('disable', 'Turn off') : s.host ? button('remove-firewall', 'Remove firewall rule') : ''}</div>`,
      getState().platform && getState().platform !== 'win32' ? `<h2>Firewall</h2>${!s.enabled ? '<p>Enable the connection on the first step.</p>' : getState().platform === 'darwin'
        ? '<p>The first time your phone connects, macOS asks whether Paddock may accept incoming connections. Choose <strong>Allow</strong>.</p><p class="field-hint">If you turned on the firewall in Stealth Mode or set it to block all connections, add Paddock in System Settings → Network → Firewall → Options.</p>'
        : `<p>If a firewall is on, allow incoming TCP connections to port ${e(String(s.port))} from your Tailscale network. With ufw: <code>sudo ufw allow in on tailscale0 to any port ${e(String(s.port))} proto tcp</code></p><p class="field-hint">Many desktop Linux systems have no firewall turned on, so no step is needed.</p>`}` :
      firewallPage(s),
      `<h2>Pair your phone</h2><p>Scan the QR code, compare the code on both screens, then approve this phone here. Tailscale must be on, on the phone.</p>${s.pendingPairing ? pairingRequest(s) : invite ? `<div class="pairing-code"><img src="${e(invite.qr)}" alt="One-use Paddock pairing code" width="280" height="280"><p>Expires ${new Date(invite.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div><div class="wb-toolbar">${button('copy', 'Copy pairing code')}${button('pair', 'New code')}</div>` : button('pair', 'Show QR code', true)}<div class="mobile-devices">${s.devices.length ? s.devices.map(d => `<div class="mobile-device"><span><label>Phone name<input data-phone-name="${e(d.id)}" aria-label="Name for ${e(d.name)}" value="${e(phoneNames.get(d.id) ?? d.name)}" maxlength="64" autocomplete="off"></label><small>${d.connected ? 'Connected' : 'Paired'}${d.alerts ? ' · Alerts enabled' : ''}</small></span><button type="button" class="secondary" data-mobile="rename-phone" data-id="${e(d.id)}">Save name</button><button type="button" class="subtle danger" data-mobile="revoke" data-id="${e(d.id)}">Remove</button></div>`).join('') : '<p class="field-hint">No phones paired yet.</p>'}</div>`,
      `<h2>Alerts</h2><p>Paddock sends alerts straight to your phone over this connection. No cloud account is needed.</p><ol class="mobile-steps"><li>In the Android app, open Settings and turn on <strong>Stay connected</strong>.</li><li>Allow notifications when Android asks.</li><li>Keep this PC awake with Paddock running.</li></ol>${s.devices.length ? `<p class="${s.devices.some(d => d.alerts) ? 'mobile-success' : 'field-hint'}">Alerts on for ${s.devices.filter(d => d.alerts).length} of ${s.devices.length} paired phone${s.devices.length === 1 ? '' : 's'}.</p>` : ''}<p class="field-hint">Alerts show the console name and whether it is ready or needs you. Android battery saving can delay them.</p><div class="wb-toolbar"><button type="button" class="subtle" data-docs="mobile-guide">Detailed guide ↗</button></div>`
    ];
    dialog.innerHTML = `<div class="mobile-heading"><h1 id="mobile-title">Phone setup</h1><button type="button" class="icon-button" data-mobile="close" aria-label="Close phone setup">${icon('close')}</button></div><nav class="mobile-tabs" aria-label="Setup steps">${['Connection', 'Firewall', 'Pair phone', 'Alerts'].map((name, i) => `<button type="button" data-mobile="step" data-step="${i}" ${step === i ? 'aria-current="step"' : ''}>${i + 1}. ${name}</button>`).join('')}</nav><section class="mobile-step">${pages[step]}</section><p class="form-error" role="alert"></p><p class="mobile-progress" role="status"></p><div class="mobile-footer">${step > 0 ? button('previous', 'Back') : '<span></span>'}${button(step === 3 ? 'close' : 'next', step === 3 ? 'Done' : 'Next', true)}</div>`;
  }
  function open({ resume = false, pair = false } = {}) {
    current = getState().mobile || null;
    if (!resume) {
      const s = state(); step = pair ? 2 : 0; invite = null;
      phoneNames.clear();
      draft = { name: s.name || '', host: s.host || defaultHost(s) };
    }
    render(); if (!dialog.open) dialog.showModal();
    void checkFirewall();
  }
  dialog.addEventListener('input', () => { remember(); dialog.querySelector('.form-error').textContent = ''; });
  dialog.addEventListener('change', event => {
    remember(); const field = event.target.dataset.field;
    if (field === 'host') { render(); dialog.querySelector(`#mobile-${field}`)?.focus(); }
  });
  dialog.addEventListener('cancel', event => { if (busy) { event.preventDefault(); return; } ++checkId; invite = null; call('mobile.cancel-pairing').catch(() => {}); });
  document.addEventListener('dock-mobile-setup', event => open(event.detail || {}));
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-mobile]'); if (!target || busy) return;
    const action = target.dataset.mobile;
    if (action === 'open') return open();
    remember();
    if (action === 'close') { ++checkId; dialog.close(); invite = null; await call('mobile.cancel-pairing'); return; }
    if (action === 'check-firewall') return checkFirewall();
    if (['step','next','previous'].includes(action)) {
      const next = action === 'step' ? Number(target.dataset.step) : step + (action === 'next' ? 1 : -1);
      if (next > 0 && !state().enabled) { dialog.querySelector('.form-error').textContent = 'Enable your connection first, or close setup to do this later.'; return; }
      if (next > 0 && connectionChanged()) { dialog.querySelector('.form-error').textContent = 'Save your connection changes first.'; return; }
      step = next; render(); dialog.querySelector('.mobile-step h2').setAttribute('tabindex', '-1'); dialog.querySelector('.mobile-step h2').focus(); if (step === 1) void checkFirewall(); return;
    }
    // Reopening setup with an unchanged connection must not restart the
    // listener, disconnect a paired phone or ask Windows for permission.
    if (action === 'enable' && state().enabled && !connectionChanged()) { step = 1; render(); void checkFirewall(); return; }
    ++checkId;
    busy = true; dialog.setAttribute('aria-busy', 'true'); for (const input of dialog.querySelectorAll('button,input,select')) input.disabled = true;
    dialog.querySelector('.mobile-progress').textContent = action.includes('firewall') ? 'Waiting for Windows…' : 'Saving…';
    try {
      if (action === 'enable') { await call('mobile.configure', { ...draft, mode: 'tailscale', enabled: true, port: 47831 }); invite = null; step = 1; }
      if (action === 'rename-pc') await call('mobile.rename', { name: draft.name });
      if (action === 'rename-phone') { await call('mobile.rename', { id: target.dataset.id, name: phoneNames.get(target.dataset.id) }); phoneNames.delete(target.dataset.id); }
      if (action === 'disable') { await call('mobile.configure', { enabled: false }); invite = null; }
      if (action === 'pair') invite = await call('mobile.invite');
      if (action === 'approve' || action === 'deny') await call('mobile.decide-pairing', { id: target.dataset.id, allow: action === 'approve' });
      if (action === 'copy') { await navigator.clipboard.writeText(invite.code); toast('Pairing code copied.'); }
      if (action === 'revoke') await call('mobile.revoke', target.dataset.id);
      if (action === 'router') await call('mobile.router');
      if (action === 'windows-network') await call('mobile.windows-network');
      if (action === 'firewall' || action === 'remove-firewall') await call('mobile.firewall', { remove: action === 'remove-firewall' });
      current = await call('mobile.status') || current;
      if (!draft.host || !current?.interfaces?.some(x => x.address === draft.host)) draft.host = defaultHost(current || state());
      render();
      if (action === 'enable') dialog.scrollTop = 0;
    } catch (error) {
      if (action.includes('firewall')) { current = await call('mobile.status').catch(() => current); render(); }
      for (const input of dialog.querySelectorAll('button,input,select')) input.disabled = false;
      dialog.querySelector('.form-error').textContent = error.message; dialog.querySelector('.mobile-progress').textContent = '';
    } finally { busy = false; dialog.removeAttribute('aria-busy'); }
  });
  return { renderSettings, open, receive() {
    current = getState().mobile || current;
    const next = JSON.stringify([state().devices, state().pendingPairing]), network = JSON.stringify(state().network);
    const changed = next !== deviceStamp, networkChanged = network !== networkStamp; deviceStamp = next; networkStamp = network;
    if (invite && !state().pairingExpires) invite = null;
    if (dialog.open && !busy && step === 2 && changed) { remember(); render(); }
    if (networkChanged) renderFirewall();
    if (dialog.open && step === 0) updateLink();
  } };
}
