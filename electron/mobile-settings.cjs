'use strict';
// Paired phones can inspect configuration. Vault contents and connection bindings
// remain in the main process; editing credentials remains on the PC.
function settingsSummary({ shared = {}, keys = [] } = {}) {
  return {
    apis: (shared.profiles || []).map(({ id, name, protocol }) => ({ id, name, protocol })),
    keys: keys.map(({ id, label }) => ({ id, name: label || id })),
    tools: (shared.connections || []).map(({ id, name, enabled }) => ({ id, name, enabled: !!enabled })),
    instructions: typeof shared.instructions === 'string' ? shared.instructions.slice(0, 20000) : '',
  };
}
module.exports = { settingsSummary };
