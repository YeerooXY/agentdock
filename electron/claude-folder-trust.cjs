'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { readJson, atomicJson } = require('./storage.cjs');
const { envValue } = require('./providers/strategies/common.cjs');
// Marks one owner-saved project folder as trusted in the account's own Claude
// config, keeping every other entry. Unknown folders keep Claude's trust prompt.
function trustClaudeFolder(env, folder) {
  const configured = envValue(env, 'CLAUDE_CONFIG_DIR');
  // shortcut: ignores Claude's legacy ~/.claude/.config.json location; upgrade if those installs report the prompt.
  const file = configured && path.isAbsolute(configured) ? path.join(configured, '.claude.json') : path.join(os.homedir(), '.claude.json');
  const key = process.platform === 'win32' ? folder.replaceAll('\\', '/') : folder;
  try { if (fs.lstatSync(file).isSymbolicLink()) return false; } catch (error) { if (error.code !== 'ENOENT') return false; }
  let config;
  try { config = readJson(file, {}); } catch { return false; }
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const projects = config.projects && typeof config.projects === 'object' && !Array.isArray(config.projects) ? config.projects : {};
  if (projects[key]?.hasTrustDialogAccepted === true || projects[folder]?.hasTrustDialogAccepted === true) return true;
  atomicJson(file, { ...config, projects: { ...projects, [key]: { ...projects[key], hasTrustDialogAccepted: true } } });
  return true;
}

module.exports = { trustClaudeFolder };
