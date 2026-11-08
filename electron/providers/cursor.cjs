'use strict';
module.exports = {
  id: 'cursor',
  settings: { strategy: 'cli' },
  catalog: {
    name: 'Cursor',
    command: 'agent',
    aliases: [
      'cursor-agent'
    ],
    install: {
      script: 'https://cursor.com/install?win32=true',
      shScript: 'https://cursor.com/install'
    },
    docs: 'https://cursor.com/docs/cli/installation',
    auth: 'Sign in with Cursor when the CLI opens.'
  },
  launch: {
    modelFlag: '--model',
    unrestricted: [
      '--force'
    ],
    mcp: '.cursor/mcp.json'
  },
  accounts: null,
  usage: {
    reader: 'cursor',
    method: 'screen',
    precision: 'rounded',
    source: 'Cursor /usage (rounded)',
    nativeHint: 'the Cursor usage dashboard'
  }
};
