'use strict';
module.exports = {
  id: 'kiro',
  catalog: {
    name: 'Kiro',
    command: 'kiro-cli',
    install: {
      script: 'https://cli.kiro.dev/install.ps1',
      shScript: 'https://cli.kiro.dev/install'
    },
    docs: 'https://kiro.dev/docs/cli/setup/',
    auth: 'Run kiro-cli login, or sign in when the chat opens.',
    windowsBuild: 22000
  },
  launch: {
    args: [
      'chat'
    ],
    modelFlag: '--model',
    unrestricted: [
      '--trust-tools=fs_read,fs_write'
    ],
    mcp: '.kiro/settings/mcp.json'
  },
  accounts: null,
  usage: {
    reader: 'kiro',
    method: 'native-command',
    precision: 'exact',
    source: 'Kiro /usage estimate'
  }
};
