'use strict';
const fs = require('node:fs');
const path = require('node:path');

function linkDependencies(repo, workFolder) {
  const source = path.join(repo, 'node_modules'), target = path.join(workFolder, 'node_modules');
  try {
    if (!fs.existsSync(source) || fs.existsSync(target)) return false;
    fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch { return false; }
}

module.exports = { linkDependencies };
