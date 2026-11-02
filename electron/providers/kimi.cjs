'use strict';
module.exports = {
  id: 'kimi',
  catalog: {
    name: 'Kimi Code',
    command: 'kimi',
    install: {
      script: 'https://code.kimi.com/kimi-code/install.ps1',
      shScript: 'https://code.kimi.com/kimi-code/install.sh'
    },
    docs: 'https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/guides/getting-started.md',
    auth: 'Run /login to connect your account. For global accounts, use kimi login --region global.',
    native: true
  },
  launch: {
    modelFlag: '--model',
    unrestricted: [
      '--yolo'
    ]
  },
  accounts: null,
  usage: {
    reader: 'kimi',
    method: 'documented-api',
    precision: 'exact',
    source: 'Kimi Code account service',
    nativeHint: '/usage in Kimi Code'
  }
};
