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
  launch: {
    modelFlag: '--model',
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
