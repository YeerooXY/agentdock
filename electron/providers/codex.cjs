'use strict';
module.exports = {
  id: 'codex',
  settings: { strategy: 'codex' },
  session: { identityEvents: 'uuid', persistConversation: true, recentUsageDefaultOnly: true, focusReports: false, steering: true },
  console: { modelChoices: true, mobileModelChoices: true, liveModelMenu: true, permissions: true },
  screen: { selectors: ['›'], banner: '^>_ OpenAI Codex', emptyPrompts: ['› Ask Codex to do anything'] },
  catalog: {
    name: 'Codex',
    command: 'codex',
    install: {
      script: 'https://chatgpt.com/codex/install.ps1',
      shScript: 'https://chatgpt.com/codex/install.sh'
    },
    docs: 'https://learn.chatgpt.com/docs/codex/cli',
    auth: 'Sign in with ChatGPT in your console.',
    native: true
  },
  launch: {},
  accounts: {
    isolation: {
      env: 'CODEX_HOME',
      defaultSubdir: '.codex'
    },
    login: {
      args: [
        'login'
      ],
      instruction: ''
    },
    models: true,
    resume: true
  },
  usage: {
    reader: 'codex',
    method: 'native-rpc',
    precision: 'exact',
    source: 'Codex account rate limits'
  }
};
