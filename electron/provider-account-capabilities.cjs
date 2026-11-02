'use strict';
const { catalog } = require('./cli-catalog.cjs');

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      deepFreeze(obj[key]);
    }
  }
  return obj;
}

function buildDescriptor(id) {
  const base = {
    id,
    name: catalog.find(provider => provider.id === id)?.name || id,
    namedProfiles: false,
    isolation: null,
    login: null,
    usage: ['codex', 'claude', 'antigravity', 'copilot', 'cursor', 'pi', 'kiro', 'kimi', 'opencode'].includes(id),
    models: false,
    resume: false,
    reason: 'Separate sign-in storage has not been verified for this provider.'
  };

  const overrides = {
    codex: {
      namedProfiles: true,
      isolation: { env: 'CODEX_HOME', defaultSubdir: '.codex' },
      login: { args: ['login'], instruction: '' },
      usage: true,
      models: true,
      resume: true,
      reason: ''
    },
    claude: {
      namedProfiles: true,
      isolation: { env: 'CLAUDE_CONFIG_DIR', defaultSubdir: '.claude' },
      login: { args: ['auth', 'login'], instruction: '' },
      usage: true,
      models: true,
      resume: true,
      reason: ''
    },
    gemini: {
      namedProfiles: true,
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
        credentialFiles: ['gemini-credentials.json', 'oauth_creds.json']
      },
      usage: false,
      models: false,
      resume: false,
      reason: ''
    },
    pi: {
      namedProfiles: true,
      isolation: {
        env: 'PI_CODING_AGENT_DIR',
        defaultSubdir: '.pi/agent',
        clearEnv: ['PI_CODING_AGENT_SESSION_DIR']
      },
      login: {
        args: [],
        instruction: 'Use /login to sign in to this account, then exit the sign-in console.',
        credentialFiles: ['auth.json'],
        credentialFields: ['key', 'access', 'refresh']
      },
      usage: true,
      models: false,
      resume: false,
      reason: ''
    }
  };

  const merged = { ...base, ...(overrides[id] || {}) };
  return deepFreeze(merged);
}

const table = Object.fromEntries(
  catalog.map(({ id }) => [id, buildDescriptor(id)])
);

function getAccountProvider(id) {
  return typeof id === 'string' && Object.hasOwn(table, id) ? table[id] : null;
}

function listAccountProviders() {
  return Object.values(table);
}

function supportsNamedProfiles(id) {
  const desc = getAccountProvider(id);
  return desc ? desc.namedProfiles : false;
}

module.exports = { getAccountProvider, listAccountProviders, supportsNamedProfiles };
