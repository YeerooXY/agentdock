'use strict';
const path = require('node:path');

function parseGoModels(text) {
  const ids = String(text).replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').split(/\r?\n/).map(line => line.trim());
  return [...new Set(ids.filter(id => /^opencode-go\/[\w.-]{1,100}$/.test(id)))].slice(0, 100)
    .map(id => ({ id, available: true, funding: 'included', source: 'Authenticated OpenCode Go allowance and CLI model discovery' }));
}

// The native data directory retains account authentication. Configuration and
// project discovery are isolated so user plugins, MCP and agents cannot add tools.
function documentationConfig(directory, model, local = null) {
  const agent = 'paddock-documentation';
  const permission = { '*': 'deny' };
  const config = { ...(local || {}), model, small_model: model,
    enabled_providers: [model.split('/')[0]], share: 'disabled', autoupdate: false,
    instructions: [], plugin: [], mcp: {}, permission, tools: { '*': false },
    agent: { [agent]: { description: 'Write documentation from supplied evidence.', mode: 'primary',
      steps: 1, permission, tools: { '*': false } } } };
  return { agent, config, environment: {
    XDG_CONFIG_HOME: path.join(directory, 'config'), OPENCODE_CONFIG_DIR: path.join(directory, 'config', 'opencode'),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config), OPENCODE_PERMISSION: JSON.stringify(permission),
    OPENCODE_DISABLE_PROJECT_CONFIG: '1', OPENCODE_DISABLE_CLAUDE_CODE: '1',
  } };
}

module.exports = { parseGoModels, documentationConfig };
