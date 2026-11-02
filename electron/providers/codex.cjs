'use strict';
module.exports = {
  id: 'codex',
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
