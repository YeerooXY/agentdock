// Provider names and console choices read from the current state. The main
// process decides which agents exist; this only names them.
export function providerNames(getState) {
  const providerName = value => {
    const state = getState();
    return ({ codex: 'Codex', claude: 'Claude Code', shell: state?.platform && state.platform !== 'win32' ? 'Shell' : 'PowerShell', custom: 'Custom', openai: 'OpenAI', anthropic: 'Anthropic' })[value] || state?.agents?.find(x => x.id === value)?.name || value;
  };
  const consoleProviders = () => { const state = getState(); return [...(state?.agents?.length ? state.agents.map(x => x.id) : ['codex', 'claude']), 'shell', 'custom']; };
  return { providerName, consoleProviders };
}
// Older limit readings carry no accountId. They belong to the provider's default account.
export const limitAccountId = entry => entry.accountId || (entry.provider === 'codex' ? 'codex:default' : entry.provider === 'claude' && entry.id === 'claude:account' ? 'claude:default' : entry.id);
