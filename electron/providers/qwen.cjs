'use strict';
module.exports = {
  id: 'qwen',
  catalog: {
    name: 'Qwen Code',
    command: 'qwen',
    install: {
      npm: '@qwen-code/qwen-code'
    },
    docs: 'https://qwenlm.github.io/qwen-code-docs/en/users/quickstart/',
    auth: 'Run /auth to choose QwenCloud, ModelStudio, a provider or a custom endpoint. Qwen OAuth ended April 15, 2026.',
    native: true
  },
  launch: {
    modelFlag: '--model',
    unrestricted: [
      '--approval-mode',
      'yolo'
    ]
  },
  accounts: null,
  usage: {
    reader: null,
    state: 'no-source'
  }
};
