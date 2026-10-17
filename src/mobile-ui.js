import './mobile.css';
export function mobileUI({ call, getState, escape: e, icon, toast }) {
  const dialog = document.createElement('dialog'); dialog.className = 'mobile-setup'; dialog.setAttribute('aria-labelledby', 'mobile-title'); document.body.append(dialog);
  let invite = null, step = 0, busy = false, deviceStamp = '', draft = null, current = null, awaitingKey = false;
  const state = () => current || getState().mobile || { interfaces: [], devices: [], push: {}, network: {} };
  const button = (action, label, primary = false) => `<button type="button" data-mobile="${action}" class="${primary ? 'primary' : 'secondary'}">${label}</button>`;
  const renderSettings = () => `<section class="surface"><div class="section-label"><h2>Android</h2>${button('open', 'Connect a phone', true)}</div><p class="field-hint">${state().enabled ? `${state().devices.length} paired · ${state().devices.filter(x => x.connected).length} connected` : 'Your consoles, wherever you are.'}</p>${state().error ? `<p role="alert">${e(state().error)}</p>` : ''}</section>`;
  const options = (items, selected) => items.map(([value, label]) => `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(label)}</option>`).join('');
  function remember() { for (const input of dialog.querySelectorAll('[data-field]')) draft[input.dataset.field] = input.value; }
  function connectionChanged() {
    const s = state();
    return draft.host !== s.host || draft.mode !== (s.mode || 'local') || draft.mode === 'internet' && ['publicHost', 'externalPort', 'routerMode', 'duckKeyId'].some(key => String(draft[key] || '') !== String(s[key] || ''));
  }
  function networkInfo(s) {
    const n = s.network || {};
    if (!n.checkedAt || n.checkedHost && n.checkedHost !== draft.host) return '';
    const heading = n.relation === 'upstream' ? 'Another router is in the way' : n.relation === 'direct' ? 'Public address found' : 'Router check';
    return `<div class="mobile-network-note" role="status"><strong>${heading}</strong>${n.routerName ? `<p>${e(n.routerName)}${n.upnp ? ' · automatic forwarding available' : ''}</p>` : ''}${n.relation === 'upstream' ? '<p>Forward the port on the upstream router too. If the shared address comes from your provider, ask for a public IPv4 address. A paid static address is not required.</p>' : n.relation === 'direct' ? '<p>Test with your phone on mobile data after setup.</p>' : '<p>We could not confirm internet access. You can still enter an address and use manual forwarding.</p>'}${n.error ? `<p>${e(n.error)}</p>` : ''}${n.gateway ? button('router', 'Open router settings ↗') : ''}</div>`;
  }
  function upstreamRule(s) {
    const n = s.network || {}, address = String(n.wanAddress || ''), parts = address.split('.').map(Number);
    const privateAddress = /^\d+\.\d+\.\d+\.\d+$/.test(address) && parts.every(x => x >= 0 && x <= 255) && (parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
    if (n.relation !== 'upstream' || !privateAddress || n.checkedHost && n.checkedHost !== s.host) return '';
    return `<div class="mobile-network-note mobile-upstream-rule"><strong>On the upstream router</strong><p>Forward TCP <b>${e(s.externalPort)}</b> to <b>${e(address)}:${e(s.externalPort)}</b>. Reserve this address there so it stays the same.</p></div>`;
  }
  function render() {
    const s = state(), internet = draft.mode === 'internet', n = s.network || {};
    const keys = (getState().vault?.entries || []).map(x => [x.id, x.label || x.id]);
    const pages = [
      `<h2>Connect your phone</h2><div class="wb-toolbar"><button type="button" class="secondary" data-docs="android-download">Get the Android app ↗</button></div>
      <label>Where will you connect?<select data-field="mode" id="mobile-mode">${options([['local', 'Same Wi-Fi / private network'], ['internet', 'Direct internet · your router']], draft.mode)}</select></label>
      <p>${internet ? 'Reach your PC through your home router. Your paired phone connects over an encrypted connection.' : 'Put your phone and PC on the same Wi-Fi. No extra app or account is needed.'}</p>
      <label>PC address<select data-field="host" id="mobile-host">${options(s.interfaces.map(x => [x.address, `${x.tailscale ? 'Private VPN' : x.local ? 'This PC only' : x.name} · ${x.address}`]), draft.host)}</select></label>
      ${internet ? `<div class="wb-toolbar">${button('inspect', 'Check my network')}${button('refresh', 'Refresh addresses')}</div><p class="field-hint">This reads your router settings and asks ipify for your public IP. No console content is sent.</p>${networkInfo(s)}
      <label>Public address or hostname<input data-field="publicHost" value="${e(draft.publicHost)}" placeholder="your-name.duckdns.org" maxlength="253" autocomplete="off" spellcheck="false"></label>
      <div class="mobile-fields"><label>Outside port<input data-field="externalPort" type="number" min="1024" max="65535" value="${e(draft.externalPort)}"></label><label>Router setup<select data-field="routerMode">${options([['automatic', 'Try automatic forwarding'], ['manual', 'I’ll add the rule myself']], draft.routerMode)}</select></label></div>
      <details><summary>Keep my address up to date</summary><p>A free Duck DNS hostname can follow a changing IP. Create the hostname, save its token in Keys, then choose it below.</p><div class="wb-toolbar"><button type="button" class="secondary" data-docs="duckdns">Create a Duck DNS hostname ↗</button>${button('keys', 'Add token in Keys')}</div><label>Duck DNS token<select data-field="duckKeyId">${options([['', 'No automatic DNS updates'], ...keys], draft.duckKeyId)}</select></label><p class="field-hint">Dock updates only the chosen Duck DNS hostname, every five minutes while internet access is on. Any other hostname can be managed by your router.</p></details>` : `<p class="field-hint">Choose your Wi-Fi or Ethernet address. Keep this PC awake with Dock running.</p>${button('refresh', 'Refresh addresses')}`}
      <div class="wb-toolbar mobile-enable">${button('enable', s.enabled ? 'Save connection' : internet ? 'Enable direct internet' : 'Enable connection', true)}${s.enabled ? button('disable', 'Turn off') : s.host ? button('remove-firewall', 'Remove firewall rule') : ''}</div>`,
      `<h2>Router & Windows</h2>${!s.enabled ? '<p>Enable the connection on the first step.</p>' : `<p>${s.mode === 'internet' ? 'Allow the connection through your router and Windows Firewall.' : 'Allow the phone connection on your home network.'}</p>
      ${s.mode === 'internet' ? `${networkInfo(s)}${upstreamRule(s)}<div class="mobile-route"><span>Outside TCP <strong>${e(s.externalPort)}</strong></span><span aria-hidden="true">→</span><span>This PC <strong>${e(s.host)}:47831</strong></span></div><p class="field-hint">For manual setup, reserve this PC’s local address in your router, then add the rule above. Keep router administration private.</p>${n.mapped ? '<p class="mobile-success">Forwarding rule added to your router.</p>' : ''}${n.routerError ? `<p class="mobile-network-note">${e(n.routerError)}</p>` : ''}${n.dnsError ? `<p role="alert">${e(n.dnsError)}</p>` : ''}${n.dnsUpdatedAt ? '<p class="mobile-success">Duck DNS updated.</p>' : ''}` : ''}
      <div class="wb-toolbar">${button('firewall', 'Allow Dock in Windows Firewall', true)}${n.firewall === 'allowed' ? button('remove-firewall', 'Remove firewall rule') : ''}</div><p class="field-hint">Windows asks for administrator approval. The rule covers only Dock’s TCP port, address and selected network adapter.</p>${n.firewall === 'allowed' ? '<p class="mobile-success">Firewall rule added.</p>' : ''}`}`,
      `<h2>Pair your phone</h2><p>In the Android app, choose Scan QR code.${s.mode === 'internet' ? ' Switch your phone to mobile data to test internet access.' : ''}</p>${invite ? `<div class="pairing-code"><img src="${e(invite.qr)}" alt="One-use Agent Dock pairing code" width="280" height="280"><p>Expires ${new Date(invite.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div><div class="wb-toolbar">${button('copy', 'Copy pairing code')}${button('pair', 'New code')}</div>` : button('pair', 'Show QR code', true)}<div class="mobile-devices">${s.devices.length ? s.devices.map(d => `<div class="mobile-device"><span><strong>${e(d.name)}</strong><small>${d.connected ? 'Connected' : 'Paired'}${d.alerts ? ' · Alerts enabled' : ''}</small>${d.lastInternetAt ? '<small class="mobile-success">Internet connection verified</small>' : ''}</span><button type="button" class="subtle danger" data-mobile="revoke" data-id="${e(d.id)}">Remove</button></div>`).join('') : '<p class="field-hint">No phones paired yet.</p>'}</div>${s.mode === 'internet' && !s.devices.some(d => d.lastInternetAt) ? '<p class="field-hint">Internet access is unverified until a paired phone connects from outside your home network.</p>' : ''}`,
      `<h2>Cloud alerts <span class="optional">optional</span></h2><p>Use your own Firebase project. Notifications contain a generic alert, never console text or API keys.</p><ol class="mobile-steps"><li><button type="button" class="subtle" data-docs="firebase">Create a Firebase project ↗</button> You can skip Google Analytics.</li><li>Add an Android app with package <code>com.yeeroo.agentdock.mobile</code>. Download <code>google-services.json</code>.</li><li>In Project settings → Service accounts, generate a private key. Use a dedicated project for Dock.</li><li>Import both files here, then enable alerts in the Android app. Dock encrypts the private key on this PC.</li></ol><div class="wb-toolbar">${button('firebase', s.push.configured ? 'Replace Firebase setup' : 'Import Firebase files', true)}<button type="button" class="subtle" data-docs="mobile-guide">Detailed guide ↗</button></div>${s.push.configured ? `<p class="mobile-success">Connected to ${e(s.push.project)}</p><div class="wb-toolbar">${button('test', 'Send test alert')}${button('remove-push', 'Remove Firebase')}</div>` : ''}${s.push.error ? `<p role="alert">${e(s.push.error)}</p>` : ''}<p class="field-hint">FCM delivery is currently free. Dock needs no cloud hosting. Your provider’s terms still apply.</p>`
    ];
    dialog.innerHTML = `<div class="mobile-heading"><h1 id="mobile-title">Phone setup</h1><button type="button" class="icon-button" data-mobile="close" aria-label="Close phone setup">${icon('close')}</button></div><nav class="mobile-tabs" aria-label="Setup steps">${['Connection', 'Router', 'Pair phone', 'Alerts'].map((name, i) => `<button type="button" data-mobile="step" data-step="${i}" ${step === i ? 'aria-current="step"' : ''}>${i + 1}. ${name}</button>`).join('')}</nav><section class="mobile-step">${pages[step]}</section><p class="form-error" role="alert"></p><p class="mobile-progress" role="status"></p><div class="mobile-footer">${step > 0 ? button('previous', 'Back') : '<span></span>'}${button(step === 3 ? 'close' : 'next', step === 3 ? 'Done' : 'Next', true)}</div>`;
  }
  function open({ mode, resume = false } = {}) {
    current = getState().mobile || null;
    if (!resume) {
      const s = state(); step = 0; invite = null;
      draft = { mode: mode || s.mode || 'local', host: s.host || s.interfaces.find(x => !x.local && !x.tailscale)?.address || s.interfaces[0]?.address || '', publicHost: s.publicHost || '', externalPort: String(s.externalPort || 47831), routerMode: s.mode === 'internet' ? s.routerMode || 'manual' : 'automatic', duckKeyId: s.duckKeyId || '' };
    }
    render(); if (!dialog.open) dialog.showModal();
  }
  dialog.addEventListener('input', () => { remember(); dialog.querySelector('.form-error').textContent = ''; });
  dialog.addEventListener('change', event => { remember(); if (event.target.dataset.field === 'mode') { render(); dialog.querySelector('#mobile-mode').focus(); } });
  dialog.addEventListener('cancel', event => { if (busy) { event.preventDefault(); return; } invite = null; call('mobile.cancel-pairing').catch(() => {}); });
  document.addEventListener('dock-mobile-setup', event => open(event.detail || {}));
  document.addEventListener('dock-key-saved', event => { if (!awaitingKey) return; awaitingKey = false; draft.duckKeyId = event.detail.id; open({ resume: true }); });
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-mobile]'); if (!target || busy) return;
    const action = target.dataset.mobile;
    if (action === 'open') return open();
    remember();
    if (action === 'close') { dialog.close(); invite = null; await call('mobile.cancel-pairing'); return; }
    if (action === 'keys') {
      awaitingKey = true; dialog.close(); document.querySelector('[data-page=vault]').click();
      const form = document.querySelector('#vault-form'); form.elements.provider.value = 'duckdns'; form.elements.label.value = 'Duck DNS'; form.elements.key.focus(); return;
    }
    if (['step','next','previous'].includes(action)) {
      const next = action === 'step' ? Number(target.dataset.step) : step + (action === 'next' ? 1 : -1);
      if (next > 0 && !state().enabled) { dialog.querySelector('.form-error').textContent = 'Enable your connection first, or close setup to do this later.'; return; }
      if (next > 0 && connectionChanged()) { dialog.querySelector('.form-error').textContent = 'Save your connection changes first.'; return; }
      step = next; render(); dialog.querySelector('.mobile-step h2').setAttribute('tabindex', '-1'); dialog.querySelector('.mobile-step h2').focus(); return;
    }
    busy = true; dialog.setAttribute('aria-busy', 'true'); for (const input of dialog.querySelectorAll('button,input,select')) input.disabled = true;
    dialog.querySelector('.mobile-progress').textContent = action === 'inspect' ? 'Checking your network…' : action.includes('firewall') ? 'Waiting for Windows…' : 'Saving…';
    try {
      if (action === 'inspect') { const checked = await call('mobile.inspect-network', { host: draft.host }); if (!draft.publicHost && checked.publicAddress) draft.publicHost = checked.publicAddress; }
      if (action === 'enable') { await call('mobile.configure', { ...draft, externalPort: Number(draft.externalPort), enabled: true, port: 47831 }); invite = null; step = 1; }
      if (action === 'disable') { await call('mobile.configure', { enabled: false }); invite = null; }
      if (action === 'pair') invite = await call('mobile.invite');
      if (action === 'copy') { await navigator.clipboard.writeText(invite.code); toast('Pairing code copied.'); }
      if (action === 'revoke') await call('mobile.revoke', target.dataset.id);
      if (action === 'router') await call('mobile.router');
      if (action === 'windows-network') await call('mobile.windows-network');
      if (action === 'firewall' || action === 'remove-firewall') await call('mobile.firewall', { remove: action === 'remove-firewall' });
      if (action === 'firebase') await call('mobile.import-push');
      if (action === 'remove-push') await call('mobile.remove-push');
      if (action === 'test') { await call('mobile.test-push'); toast('Test alert sent.'); }
      current = await call('mobile.status') || current;
      if (!draft.host && current?.interfaces?.length) draft.host = current.interfaces.find(x => !x.local && !x.tailscale)?.address || current.interfaces[0].address;
      render();
      if (action === 'enable') dialog.scrollTop = 0;
    } catch (error) {
      for (const input of dialog.querySelectorAll('button,input,select')) input.disabled = false;
      dialog.querySelector('.form-error').textContent = error.message; dialog.querySelector('.mobile-progress').textContent = '';
    } finally { busy = false; dialog.removeAttribute('aria-busy'); }
  });
  return { renderSettings, open, receive() { current = getState().mobile || current; const next = JSON.stringify(state().devices); const changed = next !== deviceStamp; deviceStamp = next; if (invite && !state().pairingExpires) invite = null; if (dialog.open && !busy && step === 2 && changed) render(); } };
}
