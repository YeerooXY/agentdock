import './mobile.css';
export function mobileUI({ call, getState, escape: e, icon, toast }) {
  const dialog = document.createElement('dialog'); dialog.className = 'mobile-setup'; dialog.setAttribute('aria-labelledby', 'mobile-title'); document.body.append(dialog);
  let invite = null, step = 0, busy = false, deviceStamp = '';
  const state = () => getState().mobile || { interfaces: [], devices: [], push: {} };
  const button = (action, label, primary = false) => `<button type="button" data-mobile="${action}" class="${primary ? 'primary' : 'secondary'}">${label}</button>`;
  const renderSettings = () => `<section class="surface"><div class="section-label"><h2>Android</h2>${button('open', 'Connect a phone', true)}</div><p class="field-hint">${state().enabled ? `${state().devices.length} paired · ${state().devices.filter(x => x.connected).length} connected` : 'Your consoles, wherever you are.'}</p>${state().error ? `<p role="alert">${e(state().error)}</p>` : ''}</section>`;
  function render() {
    const s = state();
    const pages = [
      `<h2>Connect directly</h2><p>Put your phone and PC on the same Wi-Fi. No extra app or account is needed.</p><div class="wb-toolbar"><button type="button" class="secondary" data-docs="android-download">Get the Android app ↗</button></div><label>PC address<select id="mobile-host">${s.interfaces.map(x => `<option value="${e(x.address)}" ${x.address === s.host ? 'selected' : ''}>${e(x.tailscale ? 'Tailscale' : x.local ? 'This PC only' : x.name)} · ${e(x.address)}</option>`).join('')}</select></label><p class="field-hint">Choose your Wi-Fi or Ethernet address. Keep this PC awake with Dock running.</p><div class="wb-toolbar">${button('refresh', 'Refresh addresses')} ${button('enable', s.enabled ? 'Update connection' : 'Enable connection', true)} ${s.enabled ? button('disable', 'Turn off') : ''}</div><details><summary>Away from home</summary><p>Remote access currently needs a private VPN connection between your devices.</p><button type="button" class="subtle" data-docs="mobile-guide">Remote setup guide ↗</button></details>`,
      `<h2>Pair your phone</h2><p>In the Android app, choose Scan QR code.</p>${invite ? `<div class="pairing-code"><img src="${e(invite.qr)}" alt="One-use Agent Dock pairing code" width="280" height="280"><p>Expires ${new Date(invite.expires).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div><div class="wb-toolbar">${button('copy', 'Copy pairing code')}${button('pair', 'New code')}</div>` : button('pair', 'Show QR code', true)}<div class="mobile-devices">${s.devices.length ? s.devices.map(d => `<div class="mobile-device"><span><strong>${e(d.name)}</strong><small>${d.connected ? 'Connected' : 'Paired'}${d.alerts ? ' · Alerts enabled' : ''}</small></span><button type="button" class="subtle danger" data-mobile="revoke" data-id="${e(d.id)}">Remove</button></div>`).join('') : '<p class="field-hint">No phones paired yet.</p>'}</div>`,
      `<h2>Cloud alerts <span class="optional">optional</span></h2><p>Use your own Firebase project. Notifications contain a generic alert, never console text or API keys.</p><ol class="mobile-steps"><li><button type="button" class="subtle" data-docs="firebase">Create a Firebase project ↗</button> You can skip Google Analytics.</li><li>Add an Android app with package <code>com.yeeroo.agentdock.mobile</code>. Download <code>google-services.json</code>.</li><li>In Project settings → Service accounts, generate a private key. Use a dedicated project for Dock.</li><li>Import both files here, then enable alerts in the Android app. Dock encrypts the private key on this PC.</li></ol><div class="wb-toolbar">${button('firebase', s.push.configured ? 'Replace Firebase setup' : 'Import Firebase files', true)}<button type="button" class="subtle" data-docs="mobile-guide">Detailed guide ↗</button></div>${s.push.configured ? `<p class="mobile-success">Connected to ${e(s.push.project)}</p><div class="wb-toolbar">${button('test', 'Send test alert')}${button('remove-push', 'Remove Firebase')}</div>` : ''}${s.push.error ? `<p role="alert">${e(s.push.error)}</p>` : ''}<p class="field-hint">FCM delivery is currently free. Dock needs no cloud hosting. Your provider’s terms still apply. You can delete the downloaded private-key file after importing it.</p>`
    ];
    dialog.innerHTML = `<div class="mobile-heading"><h1 id="mobile-title">Phone setup</h1><button type="button" class="icon-button" data-mobile="close" aria-label="Close phone setup">${icon('close')}</button></div><nav class="mobile-tabs" aria-label="Setup steps">${['Connection', 'Pair phone', 'Alerts'].map((name, i) => `<button type="button" data-mobile="step" data-step="${i}" ${step === i ? 'aria-current="step"' : ''}>${i + 1}. ${name}</button>`).join('')}</nav><section class="mobile-step">${pages[step]}</section><p class="form-error" role="alert"></p><div class="mobile-footer">${step > 0 ? button('previous', 'Back') : '<span></span>'}${button(step === 2 ? 'close' : 'next', step === 2 ? 'Done' : 'Next', true)}</div>`;
  }
  function open() { step = 0; invite = null; render(); if (!dialog.open) dialog.showModal(); }
  dialog.addEventListener('cancel', () => { invite = null; call('mobile.cancel-pairing').catch(() => {}); });
  document.addEventListener('dock-mobile-setup', open);
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-mobile]'); if (!target || busy) return;
    const action = target.dataset.mobile;
    if (action === 'open') return open();
    if (action === 'close') { dialog.close(); invite = null; await call('mobile.cancel-pairing'); return; }
    if (['step','next','previous'].includes(action)) { step = action === 'step' ? Number(target.dataset.step) : step + (action === 'next' ? 1 : -1); render(); return; }
    busy = true; const host = dialog.querySelector('#mobile-host')?.value; target.disabled = true;
    try {
      if (action === 'refresh') await call('mobile.status');
      if (action === 'enable') { await call('mobile.configure', { enabled: true, host, port: 47831 }); step = 1; }
      if (action === 'disable') await call('mobile.configure', { enabled: false });
      if (action === 'pair') invite = await call('mobile.invite');
      if (action === 'copy') { await navigator.clipboard.writeText(invite.code); toast('Pairing code copied.'); }
      if (action === 'revoke') await call('mobile.revoke', target.dataset.id);
      if (action === 'firebase') await call('mobile.import-push');
      if (action === 'remove-push') await call('mobile.remove-push');
      if (action === 'test') { await call('mobile.test-push'); toast('Test alert sent.'); }
      busy = false; render();
    } catch (error) { busy = false; target.disabled = false; dialog.querySelector('.form-error').textContent = error.message; }
  });
  return { renderSettings, open, receive() { const next = JSON.stringify(state().devices); const changed = next !== deviceStamp; deviceStamp = next; if (invite && !state().pairingExpires) invite = null; if (dialog.open && !busy && step === 1 && changed) render(); } };
}
