'use strict';
const path = require('node:path');
const fs = require('node:fs');

function runtimeFiles({ isPackaged = false, resourcesPath, findProgram }) {
  const directory = isPackaged ? path.join(resourcesPath, 'runtime') : __dirname;
  const preparedNode = path.join(__dirname, '..', '.build', 'runtime', 'node.exe');
  const node = isPackaged ? path.join(directory, 'node.exe') : fs.existsSync(preparedNode) ? preparedNode : findProgram('node.exe') || findProgram('node');
  if (isPackaged && !fs.existsSync(node)) throw new Error('Dock’s runtime is missing. Reinstall Paddock.');
  return { node, mirofish: path.join(directory, 'mirofish-mcp.cjs'), npm: isPackaged ? path.join(directory, 'npm', 'bin', 'npm-cli.js') : path.join(__dirname, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'), event: path.join(directory, 'agent-event.cjs'), tools: path.join(directory, 'agent-tools.cjs'), draftEditor: path.join(directory, 'draft-editor.cjs'), meshy: path.join(isPackaged ? directory : path.join(__dirname, '..', '.build', 'runtime'), 'meshy-mcp.cjs'), meshyCli: path.join(isPackaged ? directory : path.join(__dirname, '..', 'node_modules'), 'meshy-cli', 'dist', 'index.js') };
}
module.exports = { runtimeFiles };
