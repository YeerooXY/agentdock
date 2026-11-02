import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Run the installed Pi SDK with native authentication and in-memory settings.
// This avoids modifying project or user settings to disable hidden retries.
const [sdkFile, optionsFile] = process.argv.slice(2);
let session;
const emit = event => process.stdout.write(JSON.stringify(event) + '\n');
try {
  const options = JSON.parse(fs.readFileSync(optionsFile, 'utf8'));
  const pi = await import(pathToFileURL(sdkFile).href);
  const settingsManager = pi.SettingsManager.inMemory({ retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
    compaction: { enabled: false }, cacheWarming: { enabled: false }, defaultProjectTrust: 'always' });
  const modelRuntime = await pi.ModelRuntime.create({ allowModelNetwork: false });
  const models = await modelRuntime.getAvailable(options.route.provider || undefined);
  const model = models.find(m => m.id === options.route.model && (!options.route.provider || m.provider === options.route.provider));
  if (!model) throw Error('Selected native model is unavailable.');
  const resourceLoader = { getExtensions: () => ({ extensions: [], errors: [], runtime: pi.createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }), getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }), getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => 'Complete the assigned bounded file task. Follow the supplied project rules. Use only the supplied file tools. Never delegate. Return a concise result and actual verification limits.',
    getSystemPromptSource: () => undefined, getAppendSystemPrompt: () => [], getAppendSystemPromptSources: () => [], extendResources: () => {}, reload: async () => {} };
  const created = await pi.createAgentSession({ cwd: options.workFolder, model, modelRuntime, settingsManager, resourceLoader,
    thinkingLevel: options.effort || 'off', tools: options.review ? ['read'] : ['read','write','edit'], excludeTools: ['mcp__*'], sessionManager: pi.SessionManager.inMemory(options.workFolder) });
  session = created.session;
  if (created.modelFallbackMessage) throw Error('The selected route was unavailable; fallback refused.');
  // Local Strata draft supplied the requested/effective comparison. Only an
  // explicit choice is enforced; omitted effort preserves the adapter default.
  emit({ type: 'worker_effort', requested: options.effort || null, effective: session.thinkingLevel, source: 'Pi SDK' });
  if (options.effort && session.thinkingLevel !== options.effort) throw Error('Selected model does not support the requested thinking level.');
  if (process.argv.includes('--prepare-only')) {
    emit({ type: 'worker_prepared', provider: model.provider, model: model.id, generation: false });
    session.dispose(); session = undefined;
    process.exit(0);
  }
  let responses = 0, calls = 0, budgetHit = false;
  session.subscribe(event => {
    if (event.type === 'message_end' && event.message?.role === 'assistant') responses++;
    if (event.type === 'tool_execution_start') calls++;
    if (!budgetHit && (responses > 12 || calls > 24)) {
      budgetHit = true;
      emit({ type: 'worker_limit', kind: 'budget', responses, calls });
      void session.abort();
    }
    if (['message_end','agent_settled','tool_execution_start'].includes(event.type)) emit(budgetHit && event.type === 'agent_settled' ? { ...event, aborted: true } : event);
  });
  await session.prompt(fs.readFileSync(options.promptFile, 'utf8'));
  await session.waitForIdle();
  if (budgetHit) process.exitCode = 1;
} catch {
  emit({ type: 'message_end', message: { role: 'assistant', stopReason: 'error', errorMessage: 'The bounded Pi worker could not complete its selected route.', content: [] } });
  emit({ type: 'agent_settled', aborted: true }); process.exitCode = 1;
} finally { session?.dispose(); }
