import './mobile.css';
export function mobileUI({ call, getState, escape: e, icon, toast, navigate }) {
  const dialog = document.createElement('dialog'); dialog.className = 'mobile-setup'; dialog.setAttribute('aria-labelledby', 'mobile-title'); document.body.append(dialog);
  let invite = null, step = 0, busy = false, deviceStamp = '', draft = null, current = null;
  const state = () => current || getState().mobile || { interfaces: [], devices: [], push: {}, network: {} };
  const button = (action, label, primary = false) => `<button type="button" data-mobile="${action}" class="${primary ? 'primary' : 'secondary'}">${label}</button>`;
  const renderSettings = () => `<section class="surface"><div class="section-label"><h2>Android</h2>${button('open', 'Connect a phone', true)}</div><p class="field-hint">${state().enabled ? `${state().devices.length} paired · ${state().devices.filter(x => x.connected).length} connected` : 'Phone connection is off.'}</p>${state().error ? `<p role="alert">${e(state().error)}</p>` : ''}</section>`;
  const phoneNames = new Map();
  const defaultHost = (s, mode) => mode === 'tailscale' ? s.interfaces.find(x => x.tailscale)?.address || '' : s.interfaces.find(x => !x.local && !x.tailscale)?.address || s.interfaces.find(x => !x.tailscale)?.address || '';
  const options = (items, selected) => items.map(([value, label]) => `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(label)}</option>`).join('');
  function remember() { for (const input of dialog.querySelectorAll('[data-phone-name]')) phoneNames.set(input.dataset.phoneName, input.value); for (const input of dialog.querySelectorAll('[data-field]')) draft[input.dataset.field] = input.value; }
  function connectionChanged() {
    const s = state();
    return draft.host !== s.host || draft.mode !== (s.mode || 'local');
  }
  function pairingRequest(s) {
    const request = s.pendingPairing;
    if (!request) return '';
    return `<section class="mobile-approval" aria-labelledby="phone-approval-title"><h3 id="phone-approval-title">${request.state === 'approved' ? 'Phone approved' : 'Allow this phone?'}</h3><p>${e(request.name)}</p><div class="mobile-match-code" aria-label="Verification code ${e(request.code)}">${e(request.code.slice(0, 3))} ${e(request.code.slice(3))}</div><p>${request.state === 'approved' ? 'Waiting for the phone to finish connecting.' : 'Check that this code matches your phone. Allowing access gives it control of your consoles and Results.'}</p><p class="field-hint">Expires ${new Date(request.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>${request.state === 'pending' ? `<div class="wb-toolbar"><button type="button" class="secondary" data-mobile="deny" data-id="${e(request.id)}">Deny</button><button type="button" class="primary" data-mobile="approve" data-id="${e(request.id)}">Codes match — Allow</button></div>` : ''}</section>`;
  }
  function render() {
    const s = state(), tailscale = draft.mode === 'tailscale', n = s.network || {};
    const addresses = s.interfaces.filter(x => tailscale ? x.tailscale : !x.tailscale);
    const pages = [
      `<h2>Connect your phone</h2><div class="wb-toolbar"><button type="button" class="secondary" data-docs="android-download">Get the Android app ↗</button></div>
      ${s.notice ? `<p class="mobile-network-note" role="status">${e(s.notice)}</p>` : ''}
      <div class="mobile-name-row"><label>This PC’s name<input data-field="name" value="${e(draft.name)}" maxlength="64" autocomplete="off"></label>${button('rename-pc', 'Save name')}</div>
      <label>Where will you connect?<select data-field="mode" id="mobile-mode">${options([['local', 'Same Wi-Fi'], ['tailscale', 'Anywhere · Tailscale']], draft.mode)}</select></label>
      ${tailscale ? `<p>Tailscale connects your phone and PC over an encrypted private network. No router changes or open ports.</p>
      <ol class="mobile-steps"><li>Install Tailscale on this PC and sign in. <button type="button" class="subtle" data-docs="tailscale">Get Tailscale ↗</button></li><li>Install Tailscale on your phone, sign in to the same account and turn it on.</li><li>Choose this PC’s Tailscale address below.</li></ol>` : '<p>Put your phone and PC on the same Wi-Fi. No extra app or account is needed.</p>'}
      ${addresses.length ? `<label>PC address<select data-field="host" id="mobile-host">${options(addresses.map(x => [x.address, `${x.tailscale ? 'Tailscale' : x.local ? 'This PC only' : x.name} · ${x.address}`]), draft.host)}</select></label>` : `<p class="mobile-network-note" role="status">${tailscale ? 'No Tailscale address found. Sign in to Tailscale on this PC, then refresh.' : 'No Wi-Fi or Ethernet address found. Connect this PC to a network, then refresh.'}</p>`}
      <p class="field-hint">${tailscale ? 'Your phone must have Tailscale turned on to reach this PC. Keep this PC awake with Paddock running.' : 'Choose your Wi-Fi or Ethernet address. Keep this PC awake with Paddock running.'}</p>${button('refresh', 'Refresh addresses')}
      <div class="wb-toolbar mobile-enable">${button('enable', s.enabled ? 'Save connection' : 'Enable connection', true)}${s.enabled ? button('disable', 'Turn off') : s.host ? button('remove-firewall', 'Remove firewall rule') : ''}</div>`,
      `<h2>Windows Firewall</h2>${!s.enabled ? '<p>Enable the connection on the first step.</p>' : `<p>${s.mode === 'tailscale' ? 'Allow devices on your Tailscale network to reach Paddock.' : 'Allow the phone connection on your home network.'}</p>
      <div class="wb-toolbar">${button('firewall', 'Allow Paddock in Windows Firewall', true)}${n.firewall === 'allowed' ? button('remove-firewall', 'Remove firewall rule') : ''}</div><p class="field-hint">Windows asks for administrator approval. The rule covers only Paddock’s TCP port on ${s.mode === 'tailscale' ? 'your Tailscale address, from Tailscale devices' : 'this address, from your local network'}.</p>${n.firewall === 'allowed' ? '<p class="mobile-success">Firewall rule added.</p>' : ''}`}`,
      `<h2>Pair your phone</h2><p>Scan the QR code, compare the code on both screens, then approve this phone here.${s.mode === 'tailscale' ? ' To test, turn off Wi-Fi on the phone and keep Tailscale on.' : ''}</p>${s.pendingPairing ? pairingRequest(s) : invite ? `<div class="pairing-code"><img src="${e(invite.qr)}" alt="One-use Paddock pairing code" width="280" height="280"><p>Expires ${new Date(invite.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div><div class="wb-toolbar">${button('copy', 'Copy pairing code')}${button('pair', 'New code')}</div>` : button('pair', 'Show QR code', true)}<div class="mobile-devices">${s.devices.length ? s.devices.map(d => `<div class="mobile-device"><span><label>Phone name<input data-phone-name="${e(d.id)}" aria-label="Name for ${e(d.name)}" value="${e(phoneNames.get(d.id) ?? d.name)}" maxlength="64" autocomplete="off"></label><small>${d.connected ? 'Connected' : 'Paired'}${d.alerts ? ' · Alerts enabled' : ''}</small>${d.lastInternetAt ? '<small class="mobile-success">Internet connection verified</small>' : ''}</span><button type="button" class="secondary" data-mobile="rename-phone" data-id="${e(d.id)}">Save name</button><button type="button" class="subtle danger" data-mobile="revoke" data-id="${e(d.id)}">Remove</button></div>`).join('') : '<p class="field-hint">No phones paired yet.</p>'}</div>${s.mode === 'internet' && !s.devices.some(d => d.lastInternetAt) ? '<p class="field-hint">Internet access is unverified until a paired phone connects from outside your home network.</p>' : ''}`,
      `<h2>Cloud alerts <span class="optional">optional</span></h2><p>Use your own Firebase project. Notifications contain a generic alert, never console text or API keys.</p><ol class="mobile-steps"><li><button type="button" class="subtle" data-docs="firebase">Create a Firebase project ↗</button> You can skip Google Analytics.</li><li>Add an Android app with package <code>com.yeeroo.agentdock.mobile</code>. Download <code>google-services.json</code>.</li><li>In Project settings → Service accounts, generate a private key. Use a dedicated project for Paddock.</li><li>Import both files here, then enable alerts in the Android app. Paddock encrypts the private key on this PC.</li></ol><div class="wb-toolbar">${button('firebase', s.push.configured ? 'Replace Firebase setup' : 'Import Firebase files', true)}<button type="button" class="subtle" data-docs="mobile-guide">Detailed guide ↗</button></div>${s.push.configured ? `<p class="mobile-success">Connected to ${e(s.push.project)}</p><div class="wb-toolbar">${button('test', 'Send test alert')}${button('remove-push', 'Remove Firebase')}</div>` : ''}${s.push.error ? `<p role="alert">${e(s.push.error)}</p>` : ''}<p class="field-hint">FCM delivery is currently free. Paddock needs no cloud hosting. Your provider’s terms still apply.</p>`
    ];
    dialog.innerHTML = `<div class="mobile-heading"><h1 id="mobile-title">Phone setup</h1><button type="button" class="icon-button" data-mobile="close" aria-label="Close phone setup">${icon('close')}</button></div><nav class="mobile-tabs" aria-label="Setup steps">${['Connection', 'Firewall', 'Pair phone', 'Alerts'].map((name, i) => `<button type="button" data-mobile="step" data-step="${i}" ${step === i ? 'aria-current="step"' : ''}>${i + 1}. ${name}</button>`).join('')}</nav><section class="mobile-step">${pages[step]}</section><p class="form-error" role="alert"></p><p class="mobile-progress" role="status"></p><div class="mobile-footer">${step > 0 ? button('previous', 'Back') : '<span></span>'}${button(step === 3 ? 'close' : 'next', step === 3 ? 'Done' : 'Next', true)}</div>`;
  }
  function open({ mode, resume = false, pair = false } = {}) {
    current = getState().mobile || null;
    if (!resume) {
      const s = state(); step = pair ? 2 : 0; invite = null;
      phoneNames.clear();
      const chosen = mode || s.mode || 'local';
      draft = { name: s.name || '', mode: chosen, host: s.host && (s.mode || 'local') === chosen ? s.host : defaultHost(s, chosen) };
    }
    render(); if (!dialog.open) dialog.showModal();
  }
  dialog.addEventListener('input', () => { remember(); dialog.querySelector('.form-error').textContent = ''; });
  dialog.addEventListener('change', event => { remember(); if (event.target.dataset.field === 'mode') { draft.host = defaultHost(state(), draft.mode); render(); dialog.querySelector('#mobile-mode').focus(); } });
  dialog.addEventListener('cancel', event => { if (busy) { event.preventDefault(); return; } invite = null; call('mobile.cancel-pairing').catch(() => {}); });
  document.addEventListener('dock-mobile-setup', event => open(event.detail || {}));
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-mobile]'); if (!target || busy) return;
    const action = target.dataset.mobile;
    if (action === 'open') return open();
    remember();
    if (action === 'close') { dialog.close(); invite = null; await call('mobile.cancel-pairing'); return; }
    if (['step','next','previous'].includes(action)) {
      const next = action === 'step' ? Number(target.dataset.step) : step + (action === 'next' ? 1 : -1);
      if (next > 0 && !state().enabled) { dialog.querySelector('.form-error').textContent = 'Enable your connection first, or close setup to do this later.'; return; }
      if (next > 0 && connectionChanged()) { dialog.querySelector('.form-error').textContent = 'Save your connection changes first.'; return; }
      step = next; render(); dialog.querySelector('.mobile-step h2').setAttribute('tabindex', '-1'); dialog.querySelector('.mobile-step h2').focus(); return;
    }
    busy = true; dialog.setAttribute('aria-busy', 'true'); for (const input of dialog.querySelectorAll('button,input,select')) input.disabled = true;
    dialog.querySelector('.mobile-progress').textContent = action.includes('firewall') ? 'Waiting for Windows…' : 'Saving…';
    try {
      if (action === 'enable') { await call('mobile.configure', { ...draft, enabled: true, port: 47831 }); invite = null; step = 1; }
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
      if (action === 'firebase') await call('mobile.import-push');
      if (action === 'remove-push') await call('mobile.remove-push');
      if (action === 'test') { await call('mobile.test-push'); toast('Test alert sent.'); }
      current = await call('mobile.status') || current;
      if (!draft.host || !current?.interfaces?.some(x => x.address === draft.host)) draft.host = defaultHost(current || state(), draft.mode);
      render();
      if (action === 'enable') dialog.scrollTop = 0;
    } catch (error) {
      for (const input of dialog.querySelectorAll('button,input,select')) input.disabled = false;
      dialog.querySelector('.form-error').textContent = error.message; dialog.querySelector('.mobile-progress').textContent = '';
    } finally { busy = false; dialog.removeAttribute('aria-busy'); }
  });
  return { renderSettings, open, receive() { current = getState().mobile || current; const next = JSON.stringify([state().devices, state().pendingPairing]); const changed = next !== deviceStamp; deviceStamp = next; if (invite && !state().pairingExpires) invite = null; if (dialog.open && !busy && step === 2 && changed) { remember(); render(); } } };
}
