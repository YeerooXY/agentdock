'use strict';
module.exports = {
  id: 'droid',
  catalog: {
    name: 'Factory Droid',
    command: 'droid',
    install: {
      npm: 'droid'
    },
    docs: 'https://docs.factory.com/droid-cli/quickstart',
    auth: 'Sign in with Factory when prompted.'
  },
  // Verified 4 November 2026 (scripts/verify-cli-flags.cjs): interactive droid
  // has no --model flag; only `droid exec` does. The model is chosen inside Droid.
  launch: {
    unrestricted: [
      '--auto',
      'high'
    ],
    mcp: '.factory/mcp.json'
  },
  accounts: null,
  usage: {
    reader: null,
    state: 'no-reader',
    nativeHint: '/limits in Droid'
  }
};
