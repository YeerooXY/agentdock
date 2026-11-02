'use strict';
module.exports = {
  id: 'gemini',
  catalog: {
    name: 'Gemini CLI',
    command: 'gemini',
    install: {
      npm: '@google/gemini-cli'
    },
    docs: 'https://geminicli.com/docs/get-started/installation/',
    auth: 'Choose a Google sign-in or another supported Google authentication method when prompted.',
    native: true,
    windowsBuild: 26100
  },
  launch: {
    modelFlag: '--model',
    unrestricted: [
      '--approval-mode',
      'yolo'
    ]
  },
  accounts: {
    isolation: {
      env: 'GEMINI_CLI_HOME',
      defaultSubdir: '.gemini',
      homeScoped: true,
      envOverrides: {
        GEMINI_FORCE_FILE_STORAGE: 'true',
        GEMINI_FORCE_ENCRYPTED_FILE_STORAGE: 'true'
      },
      clearEnv: [
        'GEMINI_CLI_CUSTOM_OAUTH_CREDS',
        'GOOGLE_GENAI_USE_VERTEXAI',
        'GOOGLE_GENAI_USE_GCA'
      ]
    },
    login: {
      args: [],
      instruction: 'Use /auth to sign in to this account, then exit the sign-in console.',
      credentialFiles: [
        'gemini-credentials.json',
        'oauth_creds.json'
      ]
    },
    models: false,
    resume: false
  },
  usage: {
    reader: null,
    state: 'no-reader',
    nativeHint: '/stats model in Gemini CLI'
  }
};
