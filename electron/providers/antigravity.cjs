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
  accounts: null,
  usage: {
    reader: 'antigravity',
    method: 'screen',
    precision: 'exact',
    source: 'Antigravity /usage',
    nativeHint: '/usage in Antigravity'
  }
};
