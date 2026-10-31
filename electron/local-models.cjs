'use strict';
// Strata's server accepts the client model alias; /v1/models identifies the loaded model.
const STRATA_MODEL = 'strata/local';
const STRATA_ACCOUNT = 'opencode:strata';
function validOpenCodeTaskModel(accountId, model) {
  return accountId === STRATA_ACCOUNT ? model === STRATA_MODEL : /^(?:opencode-go\/[\w.-]+|opencode\/[\w.-]+-free)$/.test(model);
}
function strataConfig(profiles) {
  const profile = profiles.find(item => item.id === 'strata');
  let url;
  try { url = new URL(profile?.url); } catch {}
  if (!profile || profile.protocol !== 'chat' || profile.keyId || !url || url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/v1/chat/completions') {
    throw new Error('Save the Strata Chat Completions API on localhost with No key first. Authenticated servers need Strata’s own OpenCode setup.');
  }
  return {
    // Restrict this console's model selection to Strata; supply no vault credentials.
    model: STRATA_MODEL, small_model: STRATA_MODEL, enabled_providers: ['strata'], share: 'disabled', autoupdate: false,
    // Matches the 256K Strata preset; compaction leaves room for OpenCode's ~15K-token tool prompt.
    compaction: { auto: true, buffer: 20000 },
    provider: { strata: { npm: '@ai-sdk/openai-compatible', name: 'Strata (local)',
      options: { baseURL: `${url.origin}/v1` },
      models: { local: { name: 'Strata (256K)', tool_call: true, reasoning: true, limit: { context: 262144, input: 245760, output: 16384 } } } } }
  };
}
function strataModels(profiles) {
  try { strataConfig(profiles); return [{ id: STRATA_MODEL, name: 'Strata (local · 256K)' }]; } catch { return []; }
}
function strataTaskCandidates(executable, profiles) {
  return executable && strataModels(profiles).length
    ? [{ id: STRATA_ACCOUNT, provider: 'opencode', label: 'Strata (local)', executable, model: STRATA_MODEL, local: true }]
    : [];
}
module.exports = { STRATA_MODEL, STRATA_ACCOUNT, strataConfig, strataModels, strataTaskCandidates, validOpenCodeTaskModel };
