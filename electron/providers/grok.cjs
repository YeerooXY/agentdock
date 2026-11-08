'use strict';
module.exports = {
  id: 'grok',
  settings: { strategy: 'cli' },
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
  // Verified 3 November 2026 (Windows): the whole sign-in lives in
  // $GROK_HOME/auth.json and nothing goes to the system keychain, so an empty
  // GROK_HOME starts signed out. See docs/account-isolation-2026-11-03.md.
  accounts: {
    isolation: {
      env: 'GROK_HOME',
      defaultSubdir: '.grok',
      clearEnv: [
        'GROK_DEPLOYMENT_KEY'
      ]
    },
    login: {
      args: [
        'login'
      ],
      instruction: 'Sign in with the xAI account you want to add, then close the sign-in console.',
      credentialFiles: [
        'auth.json'
      ],
      credentialFields: [
        'refresh_token',
        'key'
      ]
    },
    models: false,
    resume: false
  },
  usage: {
    reader: null,
    state: 'no-source',
    nativeHint: 'the xAI subscription dashboard'
  }
};
