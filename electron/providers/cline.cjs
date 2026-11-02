'use strict';
module.exports = {
  id: 'cline',
  catalog: {
    name: 'Cline',
    command: 'cline',
    install: {
      npm: 'cline'
    },
    docs: 'https://docs.cline.bot/usage/cli-overview',
    auth: 'Run cline auth to choose the Cline provider, ClinePass or your provider key.'
  },
  launch: {
    modelFlag: '--model',
    unrestricted: [
      '--auto-approve',
      'true'
    ],
    mcp: '.cline/data/settings/cline_mcp_settings.json'
  },
  accounts: null,
  usage: {
    reader: null,
    state: 'no-source'
  }
};
