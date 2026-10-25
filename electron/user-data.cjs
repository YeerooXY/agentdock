'use strict';
const fs = require('node:fs');
const path = require('node:path');

function hasSavedData(directory) {
  let entries;
  try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  // Chromium may create its cache folder before our startup code runs. App
  // saves identify a profile; a directory and disposable usage cache do not.
  return entries.some(entry => !entry.isDirectory() && entry.name.endsWith('.json') && entry.name !== 'limits.json') ||
    ['results/index.json', 'ssh/hosts.json'].some(file => fs.existsSync(path.join(directory, file)));
}

function userDataPath(appData, current) {
  const legacy = path.join(appData, 'Agent Dock');
  // Keep an established Paddock profile, including its current conversations.
  // Existing Agent Dock installs retain absolute integration and result paths.
  return hasSavedData(current) || !hasSavedData(legacy) ? current : legacy;
}

module.exports = { userDataPath };
