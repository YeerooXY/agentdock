'use strict';
module.exports = {
  id: 'claude',
  settings: { strategy: 'claude' },
  session: { persistConversation: true, steering: true },
  console: { modelChoices: true, mobileModelChoices: true, liveModelMenu: true, permissions: true },
  screen: { selectors: ['❯'], banner: 'Claude Code v|^[▐▛▜▝▘█▀▌ ]+$', emptyPrompts: [] },
  catalog: {
    name: 'Claude Code',
    command: 'claude',
    install: {
      script: 'https://claude.ai/install.ps1',
      shScript: 'https://claude.ai/install.sh'
    },
    docs: 'https://code.claude.com/docs/en/setup',
    auth: 'Sign in with your Claude account in your console.',
    native: true
  },
  launch: {},
  accounts: {
    isolation: {
      env: 'CLAUDE_CONFIG_DIR',
      defaultSubdir: '.claude'
    },
    login: {
      args: [
        'auth',
        'login'
      ],
      instruction: ''
    },
    models: true,
    resume: true
  },
  usage: {
    reader: 'claude',
    method: 'native-rpc',
    precision: 'exact',
    source: 'Claude Code account service'
  }
};
