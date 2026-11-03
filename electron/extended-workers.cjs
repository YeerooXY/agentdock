'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { programLaunch } = require('./platform.cjs');
const { findProgram } = require('./adapters.cjs');

const names = Object.freeze({ cline: 'Cline', kimi: 'Kimi Code', droid: 'Factory Droid', cursor: 'Cursor', qwen: 'Qwen Code' });
const capabilities = Object.freeze({
  cline: { builder: true, reviewer: true, isolation: 'per-process file-tool guard', retries: 'one consecutive mistake; provider transport retries are native' },
  kimi: { builder: true, reviewer: true, isolation: 'explicit agent tool allowlist', retries: 'native retries reported as failure', usage: 'not emitted by print mode' },
  droid: { builder: true, reviewer: true, isolation: 'native only-tools allowlist', retries: 'native transport policy' },
  // Verified 3 November 2026 (Cursor 2026.10.22): a private CURSOR_CONFIG_DIR
  // permission list denied the shell, MCP and web, rejected writes outside the
  // task folder by absolute and relative path, and bound a Task subagent the
  // same way. The sign-in stays in the system keychain.
  cursor: { builder: true, reviewer: true, isolation: 'private permission config: no shell, MCP or web; writes only in the task folder; subagents inherit it', retries: 'native' },
  // Rechecked 3 November 2026 (Qwen Code 0.26.1): --exclude-tools removes the
  // shell, but with edits auto-approved it wrote a file outside the task folder
  // by absolute path. It stays off until writes can be confined.
  qwen: { builder: false, reviewer: false, reason: 'This CLI version can write files outside the task folder when edits are approved. A bounded worker profile still needs verification.' }
});
const NATIVE_WORKERS = Object.freeze(Object.keys(capabilities).filter(id => capabilities[id].builder));
const count = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
const sum = list => list.every(n => count(n) !== null) ? count(list.reduce((a, b) => a + b, 0)) : null;
const readTools = ['Read', 'Grep', 'Glob', 'LS'];
const tail = (s, text) => { if (typeof text === 'string') s.text = text.slice(-(s.maxText || 6000)); };
function privateWrite(folder, name, text) {
  const file = path.join(folder, name); fs.writeFileSync(file, text, { mode: 0o600 }); return file;
}
function nativeLaunch(provider, executable, args) {
  if (process.platform !== 'win32' || !/\.cmd$/i.test(executable) || provider !== 'cline') return programLaunch(executable, args);
  // PowerShell's npm shim does not forward piped stdin. Resolve only the known
  // installed package entry, never execute wrapper contents or copy credentials.
  const modules = path.dirname(path.dirname(executable));
  const binary = path.join(modules, '@cline', `cli-windows-${process.arch}`, 'bin', 'cline.exe');
  if (fs.existsSync(binary)) return { executable: binary, args };
  throw Error('The native CLI entry could not be resolved for piped worker input. Update this CLI before delegating.');
}
function extensionPrompt(provider, folder, brief) {
  if (!NATIVE_WORKERS.includes(provider)) throw Error(capabilities[provider]?.reason || 'This provider has no bounded worker adapter.');
  return privateWrite(folder, 'prompt.txt', brief);
}

// This is both the testable policy and the function embedded in Cline's native
// per-launch PreToolUse hook. No shell, browser, MCP, skills or delegation tool
// can reach its executor. Unknown tool names and malformed inputs fail closed.
function clineToolDecision(event, workFolder, review, readOnlyFiles = []) {
  const fs = require('node:fs'), path = require('node:path');
  const name = event?.tool_call?.name || event?.preToolUse?.toolName;
  const input = event?.tool_call?.input ?? event?.preToolUse?.parameters;
  const deny = () => ({ cancel: true, errorMessage: 'This worker is limited to files in its assigned folder.' });
  const allowed = ['read_files', 'search_codebase', 'submit_and_exit', ...(review ? [] : ['editor', 'apply_patch'])];
  if (!allowed.includes(name) || !input || typeof input !== 'object') return deny();
  const root = fs.realpathSync(workFolder);
  const within = target => {
    if (typeof target !== 'string' || !target || target.includes('\0')) return false;
    const resolved = path.resolve(root, target);
    if (name === 'read_files' && readOnlyFiles.includes(resolved)) return true;
    const relative = path.relative(root, resolved);
    if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) return false;
    let existing = resolved;
    while (!fs.existsSync(existing)) { const parent = path.dirname(existing); if (parent === existing) return false; existing = parent; }
    const realRelative = path.relative(root, fs.realpathSync(existing));
    return realRelative !== '..' && !realRelative.startsWith('..' + path.sep) && !path.isAbsolute(realRelative);
  };
  if (name === 'submit_and_exit') return {};
  if (name === 'apply_patch') {
    const patch = typeof input.patch === 'string' ? input.patch : typeof input.input === 'string' ? input.input : null;
    if (!patch) return deny();
    const paths = [...patch.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)].map(m => m[1].trim());
    return paths.length && paths.every(within) ? {} : deny();
  }
  const paths = [];
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['path', 'file', 'file_path', 'directory', 'cwd'].includes(key) && typeof child === 'string') paths.push(child);
      else if (['paths', 'files'].includes(key) && Array.isArray(child)) for (const p of child) typeof p === 'string' ? paths.push(p) : visit(p);
      else if (child && typeof child === 'object') visit(child);
    }
  };
  visit(input);
  // Native search defaults to its cwd; other file operations must name a path.
  if (!paths.length && name !== 'search_codebase') return deny();
  return paths.every(within) ? {} : deny();
}

function extensionLaunch(provider, executable, { model, review = false, workFolder, promptFile } = {}) {
  if (!NATIVE_WORKERS.includes(provider)) throw Error(capabilities[provider]?.reason || 'This provider has no bounded worker adapter.');
  if (!promptFile || !workFolder) throw Error('This worker needs a private prompt folder and an assigned working folder.');
  const temp = path.dirname(promptFile), chosen = model ? ['--model', model] : [];
  if (provider === 'droid') return programLaunch(executable, ['exec', '--output-format', 'json', '--file', promptFile,
    '--only-tools', [...readTools, ...(review ? [] : ['Edit', 'Create', 'ApplyPatch'])].join(','),
    '--disable-builtin-skills', '--cwd', workFolder, ...(review ? [] : ['--auto', 'low']), ...chosen]);
  if (provider === 'cursor') {
    // Forward slashes: Cursor permission globs do not accept backslashes.
    const scope = path.resolve(workFolder).split(path.sep).join('/') + '/**', config = path.join(temp, 'cursor-config');
    fs.mkdirSync(config, { recursive: true });
    privateWrite(config, 'cli-config.json', JSON.stringify({ version: 1, permissions: {
      allow: ['Read(**)', ...(review ? [] : [`Write(${scope})`])], deny: ['Shell(*)', 'Mcp(*:*)', 'WebFetch(*)'] } }));
    return { ...programLaunch(executable, ['-p', '--output-format', 'stream-json', '--trust', '--workspace', workFolder,
      ...(review ? ['--mode', 'plan'] : []), ...chosen, `Read the instruction file ${promptFile} and complete its assigned task.`]),
      env: { CURSOR_CONFIG_DIR: config } };
  }
  if (provider === 'kimi') {
    const skills = path.join(temp, 'empty-skills'); fs.mkdirSync(skills, { recursive: true });
    const profile = privateWrite(temp, 'worker.md', ['---', 'name: paddock-worker', 'description: Execute one assigned file task.',
      'tools:', ...['Read', 'Grep', 'Glob', ...(review ? [] : ['Write', 'Edit'])].map(t => `  - ${t}`),
      'disallowedTools:', '  - Bash', '  - Agent', '  - mcp__*', 'subagents: []', '---',
      'Complete only the supplied task. Read its instruction file. Do not delegate. Report unavailable capabilities.'].join('\n'));
    return programLaunch(executable, ['--output-format', 'stream-json', '--agent-file', profile, '--skills-dir', skills,
      '--prompt', `Read ${promptFile} and complete that assigned task.`, ...chosen]);
  }
  if (provider === 'cline') {
    const hooks = path.join(temp, 'hooks'); fs.mkdirSync(hooks, { recursive: true });
    const ownerConfig = process.env.CLINE_DIR || path.join(os.homedir(), '.cline');
    const ownerData = process.env.CLINE_DATA_DIR || path.join(ownerConfig, 'data');
    const providers = process.env.CLINE_PROVIDER_SETTINGS_PATH || path.join(ownerData, 'settings', 'providers.json');
    privateWrite(hooks, 'PreToolUse.cjs', `'use strict';\nconst decide = ${clineToolDecision.toString()};\nlet input=''; process.stdin.on('data',c=>{input+=c;if(input.length>1048576)process.exit(2);}); process.stdin.on('end',()=>{try{const event=JSON.parse(input);const result=decide(event,${JSON.stringify(path.resolve(workFolder))},${review},${JSON.stringify([path.resolve(promptFile)])});require('node:fs').appendFileSync(${JSON.stringify(path.join(temp, 'guard-audit.jsonl'))},JSON.stringify({tool:event.tool_call?.name||event.preToolUse?.toolName,denied:result.cancel===true})+'\\n');console.log(JSON.stringify(result));}catch{console.log(JSON.stringify({cancel:true,errorMessage:'Worker tool guard could not validate this call.'}));}});\n`);
    const mcp = privateWrite(temp, 'mcp.json', JSON.stringify({ mcpServers: {} }));
    return { ...nativeLaunch(provider, executable, ['--json', '--yolo', '--compaction', 'off', '--retries', '1', '--timeout', '300',
      '--hooks-dir', hooks, '--cwd', workFolder, ...(review ? ['--plan'] : []), ...chosen, `Read the instruction file ${promptFile} and complete its assigned task.`]),
      env: { CLINE_SESSION_BACKEND_MODE: 'local', CLINE_MCP_SETTINGS_PATH: mcp,
        CLINE_DIR: temp, CLINE_DATA_DIR: path.join(temp, 'data'), CLINE_PROVIDER_SETTINGS_PATH: providers } };
  }
}
function extensionInput() { return ''; }
function extensionEvent(provider, state, event) {
  if (!event || typeof event !== 'object') return state;
  const inner = event.type === 'agent_event' ? event.event : event;
  if (inner && ['retry', 'retrying', 'turn.step.retrying'].includes(inner.type)) { state.retryAttempted = true; state.error = true; }
  if (event.type === 'error' || event.error || event.aborted === true) state.error = true;
  if (provider === 'cline' && event.type === 'run_result') {
    state.complete = true; state.error ||= event.finishReason !== 'completed'; tail(state, event.text);
    const u = event.aggregateUsage || event.usage;
    // Cline's SDK normalizes inputTokens as total prompt tokens across vendors.
    if (u) state.usage = { inputTokens: count(u.inputTokens), outputTokens: count(u.outputTokens), cachedInputTokens: count(u.cacheReadTokens), reportedCost: count(u.totalCost) };
  }
  if (provider === 'droid' && event.type === 'result') {
    state.complete = true; state.error ||= event.subtype !== 'success' || event.is_error !== false; tail(state, event.result);
    const u = event.usage;
    if (u) state.usage = { inputTokens: sum([u.input_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens]), outputTokens: count(u.output_tokens), cachedInputTokens: count(u.cache_read_input_tokens) };
  }
  if (provider === 'cursor') {
    if (event.type === 'assistant') tail(state, (event.message?.content || []).filter(c => c?.type === 'text').map(c => c.text).join('') || state.text);
    if (event.type === 'result') {
      state.complete = true; state.error ||= event.is_error !== false || event.subtype !== 'success'; tail(state, event.result);
      const u = event.usage;
      // Cursor reports prompt tokens without cache reads; the total includes both.
      if (u) state.usage = { inputTokens: sum([u.inputTokens, u.cacheReadTokens, u.cacheWriteTokens]), outputTokens: count(u.outputTokens), cachedInputTokens: count(u.cacheReadTokens) };
    }
  }
  if (provider === 'kimi') {
    if (event.role === 'assistant' && typeof event.content === 'string') tail(state, event.content);
    if (event.type === 'retrying' || event.type === 'error') state.error = true;
  }
  return state;
}
function extensionFinalize(provider, state, exitCode) {
  if (exitCode !== 0) state.error = true;
  // Current Kimi print emits messages rather than a terminal event. Its native
  // runner exits zero only after a completed turn and background settlement.
  if (provider === 'kimi' && exitCode === 0 && state.text.trim() && !state.error) state.complete = true;
  return state;
}
function extensionProgress(provider, event) {
  if (provider === 'cline') return event.type === 'run_result' && typeof event.text === 'string' ? [event.text] : [];
  if (provider === 'cursor') return event.type === 'tool_call' && event.subtype === 'started' ? ['Using project tool'] : [];
  return [];
}
module.exports = { names, capabilities, NATIVE_WORKERS, extensionLaunch, extensionPrompt, extensionInput, extensionEvent, extensionFinalize, extensionProgress, clineToolDecision };
