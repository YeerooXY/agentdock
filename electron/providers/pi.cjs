'use strict';
module.exports = {
  id: 'pi',
  settings: { strategy: 'cli' },
  catalog: {
    name: 'Pi',
    command: 'pi',
    install: {
      npm: '@earendil-works/pi-coding-agent',
      ignoreScripts: true
    },
    docs: 'https://pi.dev/docs/latest/quickstart',
    auth: 'Run /login to choose a provider, subscription, API key or local model.'
  },
  launch: {
    modelFlag: '--model',
    mcp: '.pi/agent/mcp.json'
  },
  accounts: {
    isolation: {
      env: 'PI_CODING_AGENT_DIR',
      defaultSubdir: '.pi/agent',
      clearEnv: [
        'PI_CODING_AGENT_SESSION_DIR'
      ]
    },
    login: {
      args: [],
      instruction: 'Use /login to sign in to this account, then exit the sign-in console.',
      credentialFiles: [
        'auth.json'
      ],
      credentialFields: [
        'key',
        'access',
        'refresh'
      ]
    },
    models: false,
    resume: false
  },
  usage: {
    reader: 'pi',
    method: 'documented-api',
    precision: 'exact',
    source: 'OpenRouter key limit'
  }
};
