'use strict';
// Paired phones can inspect configuration. Vault contents and connection bindings
// remain in the main process; editing credentials remains on the PC.
function settingsSummary({ shared = {}, keys = [], integrations = [], setupRequests = [], capabilities = [], redact = value => value } = {}) {
  const summary = {
    apis: (shared.profiles || []).map(({ id, name, protocol }) => ({ id, name, protocol })),
    keys: keys.map(({ id, label }) => ({ id, name: label || id })),
    tools: (shared.connections || []).map(({ id, name, enabled }) => ({ id, name, enabled: !!enabled })),
    instructions: typeof shared.instructions === 'string' ? shared.instructions.slice(0, 20000) : '',
  };
  if (!capabilities.includes('tools.status')) return summary;

  // Allowlisted fields only. Never serialize a snapshot, binding or request config.
  // Redact saved values in the main process before applying diagnostic heuristics.
  const hidden = [...keys.map(x => x.id), ...integrations.map(x => x.keyId),
    ...setupRequests.filter(x => x.kind === 'key').map(x => x.config?.id)].filter(Boolean);
  const configs = [...(shared.connections || []), ...(shared.profiles || []), ...setupRequests.map(x => x.config || {})];
  for (const config of configs) {
    if (config.keyId) hidden.push(config.keyId);
    for (const field of ['envKeys', 'headerKeys', 'queryKeys']) {
      for (const [name, binding] of Object.entries(config[field] || {})) {
        hidden.push(name, binding?.key);
      }
    }
    hidden.push(config.command, ...(config.args || []));
  }
  const clean = value => {
    let text = String(redact(typeof value === 'string' ? value : ''));
    for (const secret of hidden.filter(x => typeof x === 'string' && x.length).sort((a, b) => b.length - a.length)) {
      text = text.split(secret).join('[redacted]');
    }
    return text
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi, '[redacted]')
      .replace(/["'][A-Za-z]:[\\/][^"'\r\n]*["']|["']\/[^"'\r\n]*["']/g, '[redacted]')
      .replace(/(?:[A-Za-z]:[\\/]|\\\\|\/)[^,;<>"'\r\n]*/g, '[redacted]')
      .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, '[redacted]')
      .replace(/(?:["']?[\w.-]*(?:token|secret|password|credential|authorization|key)[\w.-]*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi, '[redacted]')
      .replace(/\b(?:sk-|xai-|gh[pousr]_|github_pat_|npm_|AIza|AKIA)[\w.-]+/g, '[redacted]')
      .replace(/\b[A-Za-z0-9_+/.=-]{24,}\b/g, '[redacted]')
      .replace(/\b[A-Z][A-Z0-9_]*_[A-Z0-9_]+\b/g, '[redacted]')
      .replace(/\b(?:command|args|environment|env)\s*[:=].*/gi, '[redacted]')
      .replace(/(?:^|\n).*\b(?:npx|npm|uvx|node|python|powershell|cmd\.exe)\b[^\r\n]*/gi, '[redacted]')
      .replace(/[^\r\n]*--[a-z][\w-]*(?:[=\s][^\r\n]*)?/gi, '[redacted]')
      .replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 200);
  };
  const connectionStatus = (connection, integration) => {
    if (connection?.enabled === false || integration?.enabled === false) return 'Off';
    const bindings = ['envKeys', 'headerKeys', 'queryKeys'].flatMap(field => Object.values(connection?.[field] || {}));
    if (bindings.some(x => x?.key && !keys.some(key => key.id === x.key)) ||
        (integration?.id === 'meshy' && (!integration.keyId || !keys.some(key => key.id === integration.keyId)))) return 'Key missing';
    if (connection?.status?.ok === false || (integration?.job && !integration.job.busy)) return 'Failing';
    if (integration && (!integration.ready || !connection || integration.job?.busy)) return 'Needs setup';
    return connection?.status?.ok === true ? 'Connected' : 'Needs setup';
  };
  const tool = (connection, integration) => {
    const name = clean(integration?.name || connection?.name) || 'Tool';
    const status = connectionStatus(connection, integration);
    return {
      name, enabled: connection?.enabled !== false && integration?.enabled !== false,
      status, error: clean(connection?.status?.error || (integration?.job?.busy ? '' : integration?.job?.message)),
      action: status === 'Key missing'
        ? `On your PC: Open Settings → Tools and paste the key on the ${name} card.`
        : status === 'Off'
          ? `On your PC: Open Settings → Tools and enable ${name}.`
          : `On your PC: Open Settings → Tools and ${status === 'Connected' ? 'review' : status === 'Failing' ? 'test' : 'set up'} ${name}.`,
    };
  };
  summary.keys = [];
  summary.tools = [
    ...integrations.flatMap(item => {
      const connections = (shared.connections || []).filter(x => x.integration === item.id);
      return connections.length ? connections.map(connection => tool(connection, item)) : [tool(undefined, item)];
    }),
    ...(shared.connections || []).filter(x => !integrations.some(item => item.id === x.integration)).map(item => tool(item)),
  ];
  summary.setupRequests = setupRequests.map(item => ({
    agent: clean(item.consoleName) || 'Agent',
    name: clean(item.config?.name) || ({ tool: 'Tool connection', api: 'Model API', key: 'Key entry', image: 'Image generator' }[item.kind] || 'Setup'),
    kind: { tool: 'Tool connection', api: 'Model API', key: 'Key entry', image: 'Image generator' }[item.kind] || 'Setup',
    action: item.kind === 'key'
      ? 'On your PC: Open Settings → Tools and paste the key on the request card.'
      : 'On your PC: Open Settings → Tools and review and apply the request.',
  }));
  return summary;
}
module.exports = { settingsSummary };
