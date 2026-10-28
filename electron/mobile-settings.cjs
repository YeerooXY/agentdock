'use strict';
// Paired phones can inspect configuration. Vault contents and connection bindings
// remain in the main process; editing credentials remains on the PC.
function settingsSummary({ shared = {}, keys = [], integrations = [], setupRequests = [], capabilities = [], redact = value => value } = {}) {
  const summary = {
    apis: (shared.profiles || []).map(({ id, name, protocol }) => ({ id, name, protocol })),
    keys: [{ name: `Saved keys: ${keys.length}` }],
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
    hidden.push(...[config.command, ...(config.args || [])].filter(value =>
      typeof value === 'string' && (value.length >= 8 || /[\\/]|^(?:sk-|gh\w+_|%[A-Z_]+%)/i.test(value))));
  }
  const toolSources = [
    ...integrations.flatMap(integration => {
      const connections = (shared.connections || []).filter(x => x.integration === integration.id);
      return connections.length ? connections.map(connection => ({ connection, integration })) : [{ integration }];
    }),
    ...(shared.connections || []).filter(x => !integrations.some(item => item.id === x.integration)).map(connection => ({ connection })),
  ];
  // One vault redaction pass per summary, over allowlisted strings only.
  const fields = redact({
    tools: toolSources.map(({ connection, integration }) => ({
      name: integration?.name || connection?.name || '',
      error: connection?.status?.error || (integration?.job?.busy ? '' : integration?.job?.message) || '',
    })),
    requests: setupRequests.map(item => ({ agent: item.consoleName || '', name: item.config?.name || '' })),
  });
  const clean = value => {
    let text = typeof value === 'string' ? value : '';
    for (const secret of hidden.filter(x => typeof x === 'string' && x.length).sort((a, b) => b.length - a.length)) {
      text = text.split(secret).join('[redacted]');
    }
    return text
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi, '[redacted]')
      .replace(/["'](?:[A-Za-z]:[\\/]|\\|\/|%[A-Z_]+%[\\/])[^"'\r\n]*["']/gi, '[redacted]')
      .replace(/(^|[\s(])(?:[A-Za-z]:[\\/]|\\[^\\\s]|\\\\|\/[^/\s]|%[A-Z_]+%[\\/])[^<>"'\r\n]*/gim, '$1[redacted]')
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
    return connection?.status?.ok === true ? 'Connected' : 'Not checked';
  };
  summary.tools = toolSources.map(({ connection, integration }, index) => {
    const name = clean(fields.tools[index].name) || 'Tool';
    const status = connectionStatus(connection, integration);
    return {
      name, enabled: connection?.enabled !== false && integration?.enabled !== false,
      status, error: clean(fields.tools[index].error),
      action: status === 'Key missing'
        ? `On your PC: Open Settings → Tools and paste the key on the ${name} card.`
        : status === 'Off'
          ? `On your PC: Open Settings → Tools and enable ${name}.`
          : `On your PC: Open Settings → Tools and ${status === 'Connected' ? 'review' : ['Failing', 'Not checked'].includes(status) ? 'test' : 'set up'} ${name}.`,
    };
  });
  summary.setupRequests = setupRequests.map((item, index) => {
    const kind = { tool: 'Tool connection', api: 'Model API', key: 'Key entry', image: 'Image generator' }[item.kind] || 'Setup';
    const name = clean(fields.requests[index].name);
    return {
      agent: clean(fields.requests[index].agent) || 'Agent',
      name: !name || /\[(?:redacted|credential removed)\]/.test(name) || item.config?.name === item.config?.id ? kind : name,
      kind,
      action: item.kind === 'key'
        ? 'On your PC: Open Settings → Tools and paste the key on the request card.'
        : 'On your PC: Open Settings → Tools and review and apply the request.',
    };
  });
  return summary;
}
module.exports = { settingsSummary };
