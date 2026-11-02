'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { programLaunch } = require('./platform.cjs');
const { antigravityEvent } = require('./antigravity-events.cjs');
const { piLaunch, piPrompt, piEvent, piProgress } = require('./pi-worker.cjs');
const extended = require('./extended-workers.cjs');
const { validateEffort, launchArgs: effortLaunchArgs } = require('./task-effort.cjs');

const names = Object.freeze({ claude: 'Claude Code', codex: 'Codex', kiro: 'Kiro', antigravity: 'Antigravity', copilot: 'GitHub Copilot', grok: 'Grok Build', pi: 'Pi',
  ...Object.fromEntries(extended.NATIVE_WORKERS.map(id => [id, extended.names[id]])) });
const NATIVE_WORKERS = Object.freeze(['antigravity', 'copilot', 'grok', 'pi', ...extended.NATIVE_WORKERS]);
const isNativeWorker = provider => NATIVE_WORKERS.includes(provider);
const counter = value => Number.isFinite(value) && value >= 0 ? value : null;
const sum = values => values.every(value => counter(value) !== null) ? counter(values.reduce((a, b) => a + b, 0)) : null;

function workerLaunch(provider, executable, { model, effort, review = false, workFolder, promptFile } = {}) {
  // Validate before dispatch so unsupported settings cannot be dropped.
  validateEffort(provider, effort);
  if (extended.NATIVE_WORKERS.includes(provider)) return extended.extensionLaunch(provider, executable, { model, review, workFolder, promptFile });
  if (provider === 'pi') return piLaunch(executable, { model, effort, review, workFolder, promptFile });
  const selected = effortLaunchArgs(provider, effort);
  const chosen = [...(model ? ['--model', model] : []), ...selected.args];
  if (provider === 'copilot') {
    const tools = ['view', 'grep', 'glob', ...(review ? [] : ['edit', 'create', 'apply_patch'])];
    return { ...programLaunch(executable, ['--output-format', 'json', '--no-ask-user', '--no-auto-update', '--no-color',
      '--disable-builtin-mcps', '--disable-mcp-server', 'paddock', '--disallow-temp-dir', '--allow-all-tools',
      '--available-tools', tools.join(','), '--deny-tool', 'shell', ...(review ? ['--deny-tool', 'write'] : []), ...chosen]), effortDispatch: selected.evidence };
  }
  if (provider === 'antigravity') {
    const settings = { agentMode: review ? 'plan' : 'accept-edits', toolPermission: 'request-review',
      allowNonWorkspaceAccess: false, useG1Credits: false, artifactReviewPolicy: 'always-proceed', notifications: false,
      permissions: { allow: [`read_file(${workFolder})`, ...(review ? [] : [`write_file(${workFolder})`])],
        deny: ['command(*)', 'mcp(*)', 'read_url(*)', 'execute_url(*)', ...(review ? ['write_file(*)'] : [])] } };
    return programLaunch(executable, ['--input-format', 'stream-json', '--output-format', 'stream-json',
      '--disable-slash-commands', '--settings', JSON.stringify(settings), ...chosen]);
  }
  if (provider === 'grok') {
    if (!promptFile) throw new Error('The Grok worker needs a private prompt file.');
    const scope = path.resolve(workFolder).replaceAll('\\', '/') + '/**';
    return { ...programLaunch(executable, ['--prompt-file', promptFile, '--output-format', 'streaming-json', '--max-turns', '12',
      '--permission-mode', 'dontAsk', '--tools', ['read_file', 'grep', 'list_dir', ...(review ? [] : ['search_replace', 'write_file'])].join(','),
      '--disallowed-tools', 'Agent', '--disable-web-search', '--allow', 'Read', '--allow', 'Grep',
      '--deny', 'Bash', '--deny', 'MCPTool', ...(review ? ['--deny', 'Edit', '--deny', 'Write'] : ['--allow', `Edit(${scope})`, '--allow', `Write(${scope})`]), ...chosen]), effortDispatch: selected.evidence };
  }
  throw new Error('This provider has no native worker adapter.');
}
function workerInput(provider, brief) {
  if (extended.NATIVE_WORKERS.includes(provider)) return extended.extensionInput(provider, brief);
  if (['grok','pi'].includes(provider)) return '';
  return provider === 'antigravity' ? JSON.stringify({ event: 'user', message: { content: brief } }) + '\n' : brief;
}
function workerPrompt(provider, folder, brief) {
  if (extended.NATIVE_WORKERS.includes(provider)) return extended.extensionPrompt(provider, folder, brief);
  if (provider === 'pi') return piPrompt(folder, brief);
  if (provider !== 'grok') return undefined;
  const file = path.join(folder, 'prompt.txt'); fs.writeFileSync(file, brief, { mode: 0o600 }); return file;
}
function workerState(maxText = 6000) { return { text: '', usage: null, complete: false, error: false, maxText, seen: new Set() }; }
function workerEvent(provider, state, event) {
  if (!event || typeof event !== 'object') return state;
  if (extended.NATIVE_WORKERS.includes(provider)) return extended.extensionEvent(provider, state, event);
  if (provider === 'antigravity') return antigravityEvent(state, event);
  if (provider === 'pi') return piEvent(state, event);
  if (provider === 'grok') {
    if (event.type === 'text' && typeof event.data === 'string') state.text = (state.text + event.data).slice(-state.maxText);
    if (['end', 'error'].includes(event.type)) {
      state.complete = true;
      state.error ||= event.type === 'error' || !['end_turn', 'stop_sequence'].includes(event.stopReason);
      const u = event.usage;
      if (u) state.usage = { inputTokens: event.usage_is_incomplete ? null : sum([u.input_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens]),
        outputTokens: event.usage_is_incomplete ? null : counter(u.output_tokens), cachedInputTokens: counter(u.cache_read_input_tokens),
        turns: counter(event.num_turns), reportedCost: event.cost_is_partial || event.usage_is_incomplete ? null : counter(event.total_cost_usd) };
    }
    return state;
  }
  if (provider !== 'copilot') return state;
  const data = event.data || {};
  if (event.type === 'assistant.message' && !event.agentId && typeof data.content === 'string') state.text = data.content.slice(-state.maxText);
  if (event.type === 'session.error') state.error = true;
  if (event.type === 'session.idle') { state.complete = true; state.error ||= data.aborted === true; }
  if (event.type === 'result') { state.complete = true; state.error ||= event.exitCode !== 0; }
  if (['session.shutdown', 'session.usage_checkpoint'].includes(event.type)) {
    if (event.type === 'session.shutdown') { state.complete = true; state.error ||= data.shutdownType !== 'routine'; }
    const metrics = data.accountingSnapshot?.modelMetrics || data.modelMetrics;
    if (metrics && Object.keys(metrics).length) {
      const rows = Object.values(metrics).map(m => m.usage || {});
      state.usage = { inputTokens: sum(rows.map(u => u.inputTokens)), outputTokens: sum(rows.map(u => u.outputTokens)),
        cachedInputTokens: sum(rows.map(u => u.cacheReadTokens)) };
    }
  }
  if (['assistant.usage', 'session.usage_record'].includes(event.type)) {
    const u = event.type === 'session.usage_record' ? data.usage : data;
    if (!u || typeof u !== 'object') return state;
    const key = u.accounting?.usageId || u.apiCallId || event.id;
    if (key && state.seen.has(key)) return state;
    if (key) state.seen.add(key);
    const previous = state.usage;
    state.usage = Object.fromEntries([['inputTokens', 'inputTokens'], ['outputTokens', 'outputTokens'], ['cachedInputTokens', 'cacheReadTokens']]
      .map(([target, source]) => [target, previous ? sum([previous[target], u[source]]) : counter(u[source])]));
  }
  return state;
}
function workerReply(provider, stdout) {
  const state = workerState();
  for (const line of stdout.split(/\r?\n/)) { try { workerEvent(provider, state, JSON.parse(line)); } catch {} }
  workerFinalize(provider, state, 0);
  if (!state.complete || state.error || !state.text.trim()) throw new Error('The worker returned no successful final answer.');
  return { text: state.text.trim(), usage: state.usage,
    verdict: /VERDICT:\s*approve\b/i.test(state.text) ? 'approve' : /VERDICT:\s*changes-requested/i.test(state.text) ? 'changes-requested' : 'unclear' };
}
function workerProgress(provider, event) {
  if (extended.NATIVE_WORKERS.includes(provider)) return extended.extensionProgress(provider, event);
  if (provider === 'pi') return piProgress(event);
  if (provider === 'antigravity') {
    if (event.event === 'result' && typeof event.result?.response === 'string') return [event.result.response];
    return event.event === 'step_update' && event.step_update?.state === 'ACTIVE' ? ['Working'] : [];
  }
  if (provider === 'grok') return event.type === 'tool_call' ? ['Using project tool'] : [];
  if (provider === 'copilot') {
    if (event.type === 'assistant.message' && !event.agentId && typeof event.data?.content === 'string') return [event.data.content];
    return event.type === 'tool.execution_start' ? ['Using project tool'] : [];
  }
  return [];
}
function workerFinalize(provider, state, code) {
  if (extended.NATIVE_WORKERS.includes(provider)) return extended.extensionFinalize(provider, state, code);
  return state;
}
module.exports = { names, NATIVE_WORKERS, isNativeWorker, workerLaunch, workerInput, workerPrompt, workerState, workerEvent, workerFinalize, workerReply, workerProgress };
