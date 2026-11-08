'use strict';
const { isPrivate } = require('./mobile-address.cjs');
const { NO_VALUE } = require('./command-result.cjs');

function desktopMobileCommands({ mobile, publish, qrCode, shell }) {
  return {
    'mobile.configure': async payload => { await mobile.configure(payload); return NO_VALUE; },
    'mobile.invite': async () => {
      const invite = await mobile.invite();
      return { ...invite, qr: await qrCode(invite.code, { width: 280, margin: 2, errorCorrectionLevel: 'M' }) };
    },
    'mobile.cancel-pairing': async () => { mobile.cancelPairing(); return NO_VALUE; },
    'mobile.decide-pairing': async payload => { mobile.decidePairing(payload); return NO_VALUE; },
    'mobile.revoke': async payload => { mobile.revoke(payload); return NO_VALUE; },
    'mobile.rename': async payload => mobile.rename(payload),
    'mobile.status': async () => { const value = mobile.snapshot(); publish(); return value; },
    'mobile.check-firewall': async () => { await mobile.network.checkFirewall(mobile.config); return mobile.snapshot(); },
    'mobile.inspect-network': async payload => mobile.network.inspect(payload?.host),
    'mobile.firewall': async payload => {
      if (!mobile.server && payload?.remove !== true) throw new Error('Enable the phone connection first.');
      return mobile.network.firewall(mobile.config, payload?.remove === true);
    },
    'mobile.windows-network': async () => { await shell.openExternal('ms-settings:network-status'); return NO_VALUE; },
    'mobile.router': async () => {
      const gateway = mobile.network.snapshot().gateway;
      if (!gateway || !isPrivate(gateway)) throw new Error('Check your network first.');
      await shell.openExternal(`http://${gateway}/`); return NO_VALUE;
    }
  };
}

module.exports = { desktopMobileCommands };
