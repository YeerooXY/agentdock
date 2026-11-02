'use strict';
module.exports = {
  id: 'grok',
  catalog: {
    name: 'Grok Build',
    command: 'grok',
    install: {
      script: 'https://x.ai/cli/install.ps1',
      shScript: 'https://x.ai/cli/install.sh'
    },
    docs: 'https://docs.x.ai/build/overview',
    auth: 'Sign in with your xAI account when prompted.'
  },
  launch: {
    modelFlag: '--model',
    unrestricted: [
      '--always-approve'
    ],
    mcp: '.grok/config.toml'
  },
  accounts: null,
  usage: {
    reader: null,
    state: 'no-source',
    nativeHint: 'the xAI subscription dashboard'
  }
};
