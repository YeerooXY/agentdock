'use strict';
module.exports = {
  id: 'opencode',
  settings: { strategy: 'cli' },
  console: { modelChoices: true, liveModelMenu: true },
  catalog: {
    name: 'OpenCode',
    command: 'opencode',
    install: {
      npm: 'opencode-ai'
    },
    docs: 'https://opencode.ai/docs/',
    auth: 'Use /connect to choose your provider, including Z.AI.',
    native: true
  },
  launch: {
    modelFlag: '--model',
    unrestricted: [
      '--auto'
    ]
  },
  accounts: null,
  usage: {
    reader: 'opencode',
    method: 'undocumented-api',
    precision: 'exact',
    source: 'OpenCode Go account service'
  }
};
