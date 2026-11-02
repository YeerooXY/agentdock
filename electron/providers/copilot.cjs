'use strict';
module.exports = {
  id: 'copilot',
  catalog: {
    name: 'GitHub Copilot',
    command: 'copilot',
    install: {
      npm: '@github/copilot'
    },
    docs: 'https://docs.github.com/en/copilot/get-started/cli-quickstart',
    auth: 'Use /login with your GitHub account.',
    native: true
  },
  launch: {
    modelFlag: '--model',
    unrestricted: [
      '--allow-all'
    ]
  },
  accounts: null,
  usage: {
    reader: 'copilot',
    method: 'undocumented-api',
    precision: 'exact',
    source: 'Copilot account service'
  }
};
