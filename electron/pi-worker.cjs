'use strict';
// Native Pi worker adapter. Pi runs one bounded print-mode turn with file tools
// only: no shell, MCP, extensions, skills, context files, prompt templates or
// saved session. The brief is passed as a private @file, never as an argument.
const fs = require('node:fs');
const path = require('node:path');

const counter = value => Number.isFinite(value) && value >= 0 ? value : null;
const sum = values => values.every(value => counter(value) !== null) ? counter(values.reduce((a, b) => a + b, 0)) : null;
// Providers whose model ids themselves contain slashes. A selected route such as
// openrouter/cohere/north-mini-code:free splits at the first slash only.
const ROUTE_PROVIDERS = Object.freeze(['openrouter', 'anthropic', 'openai', 'google', 'groq', 'xai', 'mistral', 'cerebras', 'deepseek', 'ollama', 'github-copilot', 'opencode', 'kimi-coding', 'zai']);
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,199}$/;

// Returns { provider, model } or null. Never lets a value start an option.
function piRoute(model) {
  if (model && typeof model === 'object') {
    const provider = typeof model.provider === 'string' ? model.provider.trim() : '', id = typeof model.model === 'string' ? model.model.trim() : '';
    if (!id) return null;
    if (!SAFE_NAME.test(id) || (provider && (!SAFE_NAME.test(provider) || provider.includes('/')))) throw new Error('The selected Pi model route is invalid.');
    return { provider: provider || null, model: id };
  }
  if (typeof model !== 'string' || !model.trim()) return null;
  const text = model.trim();
  if (!SAFE_NAME.test(text) || text.includes('//') || text.endsWith('/')) throw new Error('The selected Pi model route is invalid.');
  const slash = text.indexOf('/');
  const head = slash > 0 ? text.slice(0, slash).toLowerCase() : '';
  return ROUTE_PROVIDERS.includes(head) ? { provider: head, model: text.slice(slash + 1) } : { provider: null, model: text };
}

function piSdkPath(executable) {
  let directory = path.dirname(path.resolve(executable));
  try { directory = path.dirname(fs.realpathSync(executable)); } catch {}
  for (let i = 0; i < 7; i++, directory = path.dirname(directory)) {
    for (const relative of ['dist/index.js', '@earendil-works/pi-coding-agent/dist/index.js', 'node_modules/@earendil-works/pi-coding-agent/dist/index.js']) {
      const candidate = path.join(directory, relative);
      if (fs.existsSync(candidate) && candidate.includes('pi-coding-agent')) return candidate;
    }
  }
  throw new Error('This Pi installation has no supported SDK for bounded workers.');
}
function piLaunch(executable, { model, effort, review = false, workFolder, promptFile, sdkPath } = {}) {
  if (!promptFile || !path.isAbsolute(promptFile)) throw new Error('The Pi worker needs a private prompt file.');
  if (workFolder && path.resolve(path.dirname(promptFile)) === path.resolve(workFolder)) throw new Error('The Pi prompt file must stay outside the work folder.');
  const route = piRoute(model);
  if (!route) throw new Error('Choose an explicit discovered Pi model route.');
  // An explicit route overrides the saved default for this process only, so a
  // chosen free model is never replaced by a paid saved default.
  const optionsFile = path.join(path.dirname(promptFile), 'run.json');
  const selected = require('./task-effort.cjs').launchArgs('pi', effort);
  fs.writeFileSync(optionsFile, JSON.stringify({ route, effort: effort || null, review, workFolder, promptFile }), { mode: 0o600 });
  return { executable: process.execPath, args: [path.join(__dirname, 'pi-worker-runner.mjs'), sdkPath || piSdkPath(executable), optionsFile], env: { ELECTRON_RUN_AS_NODE: '1' }, effortDispatch: effort ? selected.evidence : { requested: null, status: 'adapter-default', value: 'off' } };
}
function piPrompt(folder, brief) {
  const file = path.join(folder, 'prompt.txt');
  fs.writeFileSync(file, String(brief), { mode: 0o600 });
  return file;
}
const piState = (maxText = 6000) => ({ text: '', usage: null, complete: false, error: false, maxText, seen: new Set() });

function messageText(message) {
  return (Array.isArray(message.content) ? message.content : []).filter(c => c && c.type === 'text' && typeof c.text === 'string').map(c => c.text).join('\n');
}
function addUsage(state, u, message) {
  const key = typeof message.responseId === 'string' ? 'r:' + message.responseId : Number.isFinite(message.timestamp) ? 't:' + message.timestamp : null;
  if (key && state.seen.has(key)) return;
  if (key) state.seen.add(key);
  const valid = u && typeof u === 'object';
  // Pi's input excludes cache traffic; total input includes cache reads and writes.
  const row = { inputTokens: valid ? sum([u.input, u.cacheRead, u.cacheWrite]) : null, outputTokens: valid ? counter(u.output) : null,
    cachedInputTokens: valid ? counter(u.cacheRead) : null, reportedCost: valid ? counter(u.cost?.total) : null };
  const previous = state.usage;
  state.usage = previous
    ? { inputTokens: sum([previous.inputTokens, row.inputTokens]), outputTokens: sum([previous.outputTokens, row.outputTokens]),
        cachedInputTokens: sum([previous.cachedInputTokens, row.cachedInputTokens]), reportedCost: sum([previous.reportedCost, row.reportedCost]), turns: previous.turns + 1 }
    : { ...row, turns: 1 };
}
function piEvent(state, event) {
  if (!event || typeof event !== 'object' || state.complete) return state;
  if (event.type === 'worker_effort' && ['off','minimal','low','medium','high','xhigh','max'].includes(event.effective)) state.effortEffective = { value: event.effective, source: 'Pi SDK' };
  if (event.type === 'message_end' && event.message?.role === 'assistant') {
    const message = event.message;
    if (['error', 'aborted'].includes(message.stopReason) || message.errorMessage) state.error = true;
    const text = messageText(message);
    if (text.trim()) state.text = text.slice(-state.maxText);
    addUsage(state, message.usage, message);
  }
  // agent_end can precede retries or follow-up work; only agent_settled is terminal.
  if (event.type === 'agent_settled') { state.complete = true; state.error ||= event.aborted === true; }
  return state;
}
function piReply(stdout) {
  const state = piState();
  for (const line of String(stdout).split(/\r?\n/)) { try { piEvent(state, JSON.parse(line)); } catch {} }
  if (!state.complete || state.error || !state.text.trim()) throw new Error('The worker returned no successful final answer.');
  return { text: state.text.trim(), usage: state.usage,
    verdict: /VERDICT:\s*approve\b/i.test(state.text) ? 'approve' : /VERDICT:\s*changes-requested/i.test(state.text) ? 'changes-requested' : 'unclear' };
}
function piProgress(event) {
  if (event?.type === 'tool_execution_start') return ['Using project tool'];
  if (event?.type === 'message_end' && event.message?.role === 'assistant') { const text = messageText(event.message); return text.trim() ? [text] : []; }
  return [];
}
module.exports = { ROUTE_PROVIDERS, piRoute, piSdkPath, piLaunch, piPrompt, piState, piEvent, piReply, piProgress };
