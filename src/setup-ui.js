export function setupRequests(state, e) {
  const items = state.workbench?.setupRequests || [];
  return `<section class="setup-requests" aria-label="Agent setup requests" ${items.length ? '' : 'hidden'}>${items.length ? '<h2>Ready to connect</h2>' : ''}${items.map(item => `<article class="surface setup-request"><div class="section-label"><div><h3>${e(item.config.name || item.config.id)}</h3><p class="field-hint">From ${e(item.consoleName)} · ${item.kind === 'key' ? 'Key entry' : item.kind === 'api' ? 'Model API' : 'Tool connection'}</p></div><div class="button-row"><button class="primary" data-setup-${item.kind === 'key' ? 'key' : 'apply'}="${e(item.id)}">${item.kind === 'key' ? 'Add key' : 'Apply settings'}</button><button class="subtle" data-setup-dismiss="${e(item.id)}">Dismiss</button></div></div>${item.kind === 'key' ? '<p>Enter the key in Keys. Its value stays out of chat.</p>' : `<p class="mono">${e(item.config.url || [item.config.command, ...(item.config.args || [])].join(' '))}</p><details><summary>Connection settings</summary><pre>${e(JSON.stringify(item.config, null, 2))}</pre></details>`}</article>`).join('')}</section>`;
}
export const apiPresets = {
  grok: { id: 'grok', name: 'Grok / xAI', protocol: 'chat', url: 'https://api.x.ai/v1/chat/completions', keyId: 'grok' },
  zai: { id: 'zai', name: 'Z.AI', protocol: 'chat', url: 'https://api.z.ai/api/paas/v4/chat/completions', keyId: 'zai' }
};
