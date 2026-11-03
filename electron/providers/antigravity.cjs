'use strict';
module.exports = {
  id: 'antigravity',
  catalog: {
    name: 'Google Antigravity',
    command: 'agy',
    install: {
      script: 'https://antigravity.google/cli/install.ps1',
      shScript: 'https://antigravity.google/cli/install.sh',
      installArgs: [
        '--skip-path'
      ]
    },
    docs: 'https://antigravity.google/docs/cli/install/',
    auth: 'Sign in with Google when the CLI opens.',
    windowsBuild: 22000
  },
  launch: {
    unrestricted: [
      '--dangerously-skip-permissions'
    ],
    mcp: '.gemini/config/mcp_config.json'
  },
  // Antigravity keeps its sign-in in one Windows credential ("gemini:antigravity"),
  // so extra accounts switch that credential instead of using a folder. One
  // account is signed in at a time. See docs/account-isolation-2026-11-03.md.
  accounts: {
    switch: {
      target: 'gemini:antigravity'
    },
    login: {
      args: [],
      instruction: 'Sign in with the Google account you want to add, then close the sign-in console.'
    },
    models: false,
    resume: false
  },
  usage: {
    reader: 'antigravity',
    method: 'screen',
    precision: 'exact',
    source: 'Antigravity /usage',
    nativeHint: '/usage in Antigravity'
  }
};
