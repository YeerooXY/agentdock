'use strict';
const { codexAdapter, hasCodexFolderTrustPrompt } = require('./codex.cjs');
const { claudeAdapter } = require('./claude.cjs');
const { cliAdapter } = require('./cli.cjs');
const { commonRuntime, envValue, plainTerminalText } = require('./common.cjs');
const SETTINGS_STRATEGIES = Object.freeze(['codex', 'claude', 'cli']);
function createSettings({ strategy = 'cli', resumeFlag } = {}) {
  if (strategy === 'codex') return codexAdapter();
  if (strategy === 'claude') return claudeAdapter();
  if (strategy === 'cli') return cliAdapter({ resumeFlag });
  throw new Error('Unknown provider settings strategy.');
}
module.exports = { SETTINGS_STRATEGIES, createSettings, codexAdapter, claudeAdapter, cliAdapter, commonRuntime, envValue, plainTerminalText, hasCodexFolderTrustPrompt };
