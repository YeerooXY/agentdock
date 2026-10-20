export function sshUI({ call, escape, getState, toast, render }) {
  let probe = null, busy = false;
  function html() {
    return `<section class="surface"><div class="section-label"><h2>Linux hosts</h2><button type="button" class="primary" data-ssh="add">Add SSH host</button></div>
      <p class="field-hint">Connect from this PC. The paired phone uses the same connection. Install SSH and tmux on the Linux host.</p>
      ${(getState().sshHosts || []).map(h => `<article class="ssh-host"><strong>${escape(h.name)}</strong><p>${escape(h.user)}@${escape(h.host)}:${h.port} · ${escape(h.folder)}</p>
        <p class="field-hint">${h.checkedAt ? `Checked ${escape(new Date(h.checkedAt).toLocaleString())} · ${h.agents.map(escape).join(', ') || 'Linux shell'}` : 'Check SSH-key login and installed agents.'}</p>
        <div class="button-row"><button data-ssh="check" data-id="${h.id}">Check connection</button><button data-ssh="edit" data-id="${h.id}">Edit</button><button data-ssh="remove" data-id="${h.id}">Remove</button></div></article>`).join('')}
      <p class="field-hint">Remote sessions reconnect through tmux. VM tools, Results capture and completion tracking are separate from this PC.</p></section>`;
  }
  function open(id = '') {
    const h = getState().sshHosts?.find(x => x.id === id) || {};
    document.querySelector('#ssh-dialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'ssh-dialog'; dialog.setAttribute('aria-labelledby', 'ssh-title');
    dialog.innerHTML = `<form id="ssh-form"><div class="dialog-heading"><h2 id="ssh-title">${id ? 'Edit' : 'Add'} SSH host</h2><button type="button" data-ssh="cancel" aria-label="Close SSH settings">×</button></div>
      <input type="hidden" name="id" value="${escape(id)}">
      <label>Name<input name="name" required maxlength="64" value="${escape(h.name || '')}"></label>
      <div class="form-pair"><label>Hostname or IP<input name="host" required value="${escape(h.host || '')}" spellcheck="false"></label><label>SSH port<input name="port" type="number" min="1" max="65535" value="${h.port || 22}" required></label></div>
      <label>Linux username<input name="user" required value="${escape(h.user || '')}" spellcheck="false"></label>
      <label>Linux folder<input name="folder" required value="${escape(h.folder || '.')}" spellcheck="false"></label>
      <label>SSH key on this PC (optional)<div class="folder-input"><input name="identityFile" value="${escape(h.identityFile || '')}" readonly><button type="button" data-ssh="key">Choose key</button></div></label>
      <p class="field-hint">Keys stay on this PC. Passwords are entered directly in the SSH console. Connection checks and Close console require SSH-key login.</p>
      <section id="ssh-identity" hidden></section><p class="form-error" role="alert"></p>
      <div class="dialog-footer"><button type="button" data-ssh="cancel">Cancel</button><button type="submit" class="primary">Scan host identity</button></div></form>`;
    document.body.append(dialog); probe = null; dialog.showModal();
    dialog.querySelector('[name=name]').focus();
    dialog.querySelector('form').addEventListener('input', event => {
      if (event.target.id === 'ssh-verified') { dialog.querySelector('.form-error').textContent = ''; return; }
      if (!probe) return;
      probe = null; dialog.querySelector('#ssh-identity').hidden = true;
    });
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); event.stopPropagation();
      if (busy) return;
      busy = true; const form = event.currentTarget, button = form.querySelector('[type=submit]');
      button.disabled = true; form.querySelector('.form-error').textContent = '';
      try {
        const data = Object.fromEntries(new FormData(form)); if (!data.id) delete data.id;
        const signature = JSON.stringify(Object.fromEntries(new FormData(form)));
        const scanned = await call('ssh.scan', data);
        if (signature !== JSON.stringify(Object.fromEntries(new FormData(form))) || !dialog.open) throw new Error('Host details changed. Scan again.');
        probe = scanned;
        const panel = dialog.querySelector('#ssh-identity');
        panel.hidden = false;
        panel.innerHTML = `<h3>${probe.changed ? 'Host identity changed' : 'Verify host identity'}</h3>
          ${probe.changed ? '<p class="form-error">The saved key is different. Confirm why it changed before trusting this host.</p>' : ''}
          <p>On the VM console, run:</p><code class="ssh-code">ssh-keygen -lf /etc/ssh/ssh_host_${probe.algorithm === 'ssh-ed25519' ? 'ed25519' : probe.algorithm.startsWith('ecdsa') ? 'ecdsa' : 'rsa'}_key.pub</code>
          <p>Compare its SHA256 fingerprint:</p><code class="ssh-code">${escape(probe.fingerprint)}</code>
          <label class="toggle-row"><span>I compared the fingerprint on the VM and it matches.</span><input type="checkbox" id="ssh-verified"></label>
          <button type="button" class="primary" data-ssh="approve">Save trusted host</button>`;
        panel.scrollIntoView({ block: 'nearest' });
      } catch (error) { form.querySelector('.form-error').textContent = error.message; }
      finally { busy = false; button.disabled = false; }
    });
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-ssh]'); if (!button) return;
    const action = button.dataset.ssh, id = button.dataset.id;
    if (action === 'add' || action === 'edit') { open(id); return; }
    if (action === 'cancel') { document.querySelector('#ssh-dialog')?.close(); return; }
    if (busy) return;
    busy = true; button.disabled = true;
    try {
      if (action === 'key') {
        const file = await call('ssh.keyFile');
        const form = document.querySelector('#ssh-form');
        if (file && form) { form.elements.identityFile.value = file; probe = null; form.querySelector('#ssh-identity').hidden = true; }
      } else if (action === 'approve') {
        if (!probe || !document.querySelector('#ssh-verified')?.checked) throw new Error('Compare the fingerprint on the VM, then check the box.');
        await call('ssh.approve', { probeId: probe.probeId, fingerprint: probe.fingerprint, verified: true });
        document.querySelector('#ssh-dialog').close(); render(); toast('SSH host saved.');
      } else if (action === 'check') {
        await call('ssh.check', id); render(); toast('Linux connection and agents checked.');
      } else if (action === 'remove' && window.confirm('Remove this saved SSH host?')) {
        await call('ssh.remove', id); render(); toast('SSH host removed.');
      }
    } catch (error) {
      const field = document.querySelector('#ssh-dialog[open] .form-error');
      if (field) field.textContent = error.message; else toast(error.message);
    } finally { busy = false; button.disabled = false; }
  });
  return { html };
}
