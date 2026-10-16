'use strict';
const path = require('node:path');
const fs = require('node:fs');

function runtimeFiles({ isPackaged = false, resourcesPath, findProgram }) {
  const directory = isPackaged ? path.join(resourcesPath, 'runtime') : __dirname;
  const node = isPackaged ? path.join(directory, 'node.exe') : findProgram('node.exe') || findProgram('node');
  if (isPackaged && !fs.existsSync(node)) throw new Error('Dock’s runtime is missing. Reinstall Agent Dock.');
  return { node, event: path.join(directory, 'agent-event.cjs'), tools: path.join(directory, 'agent-tools.cjs'), meshy: path.join(isPackaged ? directory : path.join(__dirname, '..', '.build', 'runtime'), 'meshy-mcp.cjs'), meshyCli: path.join(isPackaged ? directory : path.join(__dirname, '..', 'node_modules'), 'meshy-cli', 'dist', 'index.js') };
}
module.exports = { runtimeFiles };
