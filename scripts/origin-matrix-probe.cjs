'use strict';
// Manual, explicitly opted-in native account diagnostics. Never an automated test.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { programLaunch } = require('../electron/platform.cjs');
const { prepareCli } = require('../electron/cli-launch.cjs');
const { usageEnvironment } = require('../electron/subscription-usage.cjs');
const { stripInheritedSessionEnv } = require('../electron/agent-env.cjs');
const { killTree } = require('../electron/delegation.cjs');
const { AccountProfiles } = require('../electron/account-profiles.cjs');
if (process.argv[2] !== '--live') throw Error('Pass --live and explicit provider IDs to use connected free/included accounts.');
const ids = (process.argv[3] || '').split(',').filter(Boolean);
if (!ids.length) throw Error('Supply explicit provider IDs.');
const base = path.resolve(__dirname, '../artifacts/agent-matrix/origins');
const run = path.join(base, new Date().toISOString().replaceAll(':', '-')); fs.mkdirSync(run, { recursive: true });
const inventory = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../artifacts/agent-matrix/inventory.json')));
const upstream = { url: process.env.PADDOCK_BRIDGE_URL, token: process.env.PADDOCK_BRIDGE_TOKEN };
if (!upstream.url || !upstream.token) throw Error('Start from a connected Paddock console.');
const proxyToken = crypto.randomBytes(24).toString('hex'), results = new Map();
const reply = (text, isError = false) => ({ content: [{ type: 'text', text }], ...(isError ? { isError } : {}) });
const clean = value => String(value || '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/Bearer\s+\S+|\b(?:sk|ghp|gho|ghu|ghs|ghr)-[\w-]+|eyJ[\w.-]+/gi, '[redacted]').replaceAll(upstream.token, '[redacted]').replaceAll(proxyToken, '[redacted]').slice(-2200);
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', b => { if (body.length < 100000) body += b; });
  req.on('end', async () => {
    let result; const row = results.get(req.url.slice(1));
    try {
      if (!row || req.headers.authorization !== 'Bearer ' + proxyToken) throw Error('unauthorized');
      const call = JSON.parse(body);
      const allowed = call.name === 'dock_context' || call.name === 'dock_tools' || (call.name === 'dock_call' && call.arguments?.tool === 'dock/task_candidates');
      if (!allowed) { row.blockedCalls.push({ name: call.name, tool: call.arguments?.tool || null }); result = reply('This diagnostic allows only context, schemas and task_candidates. No other operations.', true); }
      else {
        const response = await fetch(upstream.url, { method: 'POST', headers: { Authorization: 'Bearer ' + upstream.token, 'Content-Type': 'application/json' }, body: JSON.stringify(call), signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw Error('upstream-status-' + response.status);
        result = await response.json();
        const text = (result.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
        const evidence = { name: call.name, tool: call.arguments?.tool || null, ok: !result.isError, responseChars: text.length };
        if (call.name === 'dock_context') {
          row.guidelines = { localFirst: /Local-first work|Local-first execution|ready local implementation/i.test(text), creativeExclusions: /radiating strokes|three-stroke|three short/i.test(text), includesProject: /Agentdock/.test(text) };
        }
        if (call.arguments?.tool === 'dock/task_candidates') {
          try { const data = JSON.parse(text); row.candidates = data; } catch { row.candidateResponse = clean(text); }
        }
        row.calls.push(evidence);
      }
    } catch (e) { result = reply('Diagnostic bridge unavailable: ' + clean(e.message), true); if (row) row.bridgeError = clean(e.message); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result));
  });
});
const brief = 'This is an owner-authorized read-only connector diagnostic. Call native Paddock MCP dock_context with includeProject:true. Then discover the dock/task_candidates schema with dock_tools, then execute dock_call({tool:"dock/task_candidates",arguments:{size:"small"}}). Report ORIGIN_OK, whether local-first guidance appeared, whether Strata is available, and available account IDs with their quota status. No file edits, shell commands, actual delegation, settings changes, retries or alternative models. Stop with a concrete blocker if a call fails. Keep the final reply under 120 words.';
function launchSpec(item, dir, env) {
  const summaryPath = path.join(dir, 'PADDOCK.md'); fs.writeFileSync(summaryPath, brief);
  const runtime = { node: process.execPath, tools: path.resolve(__dirname, '../electron/agent-tools.cjs') };
  const prepared = prepareCli(item.id, { directory: dir, runtime, summary: brief, summaryPath, home: path.join(dir, 'managed-home'), model: item.id === 'opencode' ? 'opencode-go/claude-haiku-5-5' : undefined });
  Object.assign(env, prepared.env, { PADDOCK_INSTRUCTIONS: summaryPath });
  if (process.env.ORIGIN_CLINE_GLOBAL === '1' && item.id === 'cline') delete env.CLINE_MCP_SETTINGS_PATH;
  const config = path.join(dir, 'mcp.json'), promptFile = path.join(dir, 'prompt.txt'); fs.writeFileSync(promptFile, brief);
  let args, input = '';
  switch (item.id) {
    case 'codex': args = ['exec', '--model', 'gpt-6-luna', '--sandbox', 'read-only', '-c', 'windows.sandbox=unelevated', '--json', '--ephemeral', '--skip-git-repo-check', '--color', 'never', '-c', 'approval_policy="never"', '-c', `mcp_servers.paddock.command=${JSON.stringify(runtime.node)}`, '-c', `mcp_servers.paddock.args=${JSON.stringify([runtime.tools])}`, '-c', 'mcp_servers.paddock.env_vars=["PADDOCK_BRIDGE_URL","PADDOCK_BRIDGE_TOKEN","PADDOCK_INSTRUCTIONS"]', '-c', 'mcp_servers.paddock.default_tools_approval_mode="approve"', '-']; input = brief; break;
    case 'claude': args = ['-p', '--output-format', 'stream-json', '--verbose', '--max-turns', '5', '--no-session-persistence', '--strict-mcp-config', '--mcp-config', config, '--tools', 'mcp__paddock__dock_context,mcp__paddock__dock_tools,mcp__paddock__dock_call', '--allowedTools', 'mcp__paddock__dock_context,mcp__paddock__dock_tools,mcp__paddock__dock_call']; input = brief; break;
    case 'antigravity': args = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--disable-slash-commands', '--settings', JSON.stringify({ agentMode: 'plan', toolPermission: 'request-review', useG1Credits: false, permissions: { allow: ['mcp(*)'], deny: ['command(*)', 'write_file(*)', 'read_url(*)', 'execute_url(*)'] } })]; input = JSON.stringify({ event: 'user', message: { content: brief } }) + '\n'; break;
    case 'copilot': args = [...prepared.args, '--output-format', 'json', '--no-ask-user', '--no-auto-update', '--no-color', '--disable-builtin-mcps', '--trust-folder', '--allow-tool', 'paddock', '--deny-tool', 'shell', '--deny-tool', 'write', '--excluded-tools', 'task']; input = brief; break;
    case 'opencode': args = ['run', '--format', 'json', '--model', 'opencode-go/claude-haiku-5-5', brief]; env.OPENCODE_PERMISSION = JSON.stringify({ '*': 'deny', paddock_dock_context: 'allow', paddock_dock_tools: 'allow', paddock_dock_call: 'allow' }); break;
    case 'cursor': args = ['--print', '--output-format', 'stream-json', '--mode', 'ask', '--approve-mcps', '--trust', '--workspace', dir, brief]; break;
    case 'grok': args = ['--prompt-file', promptFile, '--output-format', 'streaming-json', '--max-turns', '5', '--permission-mode', 'dontAsk', '--tools', '', '--no-subagents', '--disable-web-search', '--allow', 'MCPTool', '--deny', 'Bash', '--deny', 'Edit', '--deny', 'Write']; break;
    case 'kiro': args = ['chat', '--no-interactive', '--trust-workspace', '--trust-tools=mcp_paddock_dock_context,mcp_paddock_dock_tools,mcp_paddock_dock_call', '--output-format', 'stream-json', brief]; break;
    case 'qwen': args = ['--prompt', brief, '--mcp-config', config, '--allowed-mcp-server-names', 'paddock', '--allowed-tools', 'paddock', '--approval-mode', 'plan', '--advisor', 'off', '--max-wall-time', '45s', '--max-tool-calls', '4', '--output-format', 'stream-json']; break;
    case 'kimi': args = ['--output-format', 'stream-json', '--prompt', brief]; break;
    case 'cline': args = ['--plan', '--json', '--auto-approve', 'true', '--compaction', 'off', '--retries', '1', '--timeout', '50', brief]; break;
    case 'droid': args = ['exec', '--output-format', 'stream-json', '--disable-builtin-skills', '--only-tools', 'MCP:paddock', '--file', promptFile, '--cwd', dir]; break;
    case 'pi': {
      fs.mkdirSync(path.join(dir, '.pi'), { recursive: true }); fs.writeFileSync(path.join(dir, '.pi/settings.json'), JSON.stringify({ retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } }, compaction: { enabled: false }, cacheWarming: { enabled: false } }));
      args = ['--print', '--mode', 'json', '--provider', 'openrouter', '--model', 'cohere/north-mini-code:free', '--thinking', 'off', '--no-session', '--no-context-files', '--no-skills', '--no-prompt-templates', '--no-extensions', '-e', 'builtin:mcp', '-e', 'builtin:codemode', '--tools', 'codemode,mcp__paddock__dock_context,mcp__paddock__dock_tools,mcp__paddock__dock_call', '--approve', '@' + promptFile]; break;
    }
    case 'gemini': args = ['--prompt', brief, '--skip-trust', '--approval-mode', 'plan', '--allowed-mcp-server-names', 'paddock', '--allowed-tools', 'paddock', '--output-format', 'stream-json']; break;
    default: throw Error('Unknown provider');
  }
  const modules = path.join(process.env.APPDATA, 'Paddock/agents', item.id, 'node_modules');
  // Installed entrypoints preserve argument boundaries across Windows .cmd wrappers.
  const native = { cline: path.join(modules, '@cline/cli-windows-x64/bin/cline.exe') }[item.id];
  const entry = { qwen: '@qwen-code/qwen-code/cli-entry.js', gemini: '@google/gemini-cli/bundle/gemini.js' }[item.id];
  return { ...(native && fs.existsSync(native) ? { executable: native, args } : entry ? { executable: process.execPath, args: [path.join(modules, entry), ...args] } : programLaunch(item.executable, args)), input };
}
async function probe(id, url) {
  const item = inventory.find(x => x.id === id); if (!item) throw Error('Unknown inventory ID ' + id);
  const dir = path.join(run, id); fs.mkdirSync(dir, { recursive: true });
  const row = { id, startedAt: new Date().toISOString(), calls: [], blockedCalls: [], usageEvents: [], eventTypes: {}, finalText: '', timeout: false, accountId: id === 'codex' ? 'cb75b00b-2caf-4295-8256-0d28514a1531' : id + ':default' }; results.set(id, row);
  let env = stripInheritedSessionEnv(usageEnvironment());
  if (id === 'codex') env = new AccountProfiles(path.join(process.env.APPDATA, 'Paddock')).environment(row.accountId, 'codex', { baseEnv: env });
  Object.assign(env, { PADDOCK_BRIDGE_URL: url + '/' + id, PADDOCK_BRIDGE_TOKEN: proxyToken, NO_COLOR: '1', NO_OPEN_BROWSER: '1' });
  const launch = launchSpec(item, dir, env), start = Date.now();
  await new Promise(resolve => {
    let buffer = '', stderr = '', textTail = '';
    const child = spawn(launch.executable, launch.args, { cwd: dir, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    row.ownedPid = child.pid;
    const timer = setTimeout(() => { row.timeout = true; killTree(child); }, 60000);
    function event(line) { let e; try { e = JSON.parse(line); } catch { textTail = (textTail + line + '\n').slice(-4000); return; }
      const type = e.type || e.event || 'unknown'; row.eventTypes[type] = (row.eventTypes[type] || 0) + 1;
      const usage = e.usage || e.result?.usage || e.data?.usage || e.message?.usage || (e.type === 'session.shutdown' ? e.data?.modelMetrics : null);
      if (usage && typeof usage === 'object' && !['message_start', 'message_update'].includes(type)) row.usageEvents.push({ type, usage });
      if (['run_result', 'result'].includes(type)) row.terminalEvent = JSON.parse(clean(JSON.stringify(e)).startsWith('{') && JSON.stringify(e).length <= 2000 ? clean(JSON.stringify(e)) : JSON.stringify({ type, keys: Object.keys(e), error: e.error, result: typeof e.result === 'string' ? clean(e.result) : undefined }));
      if (type === 'agent_event') {
        row.agentEventTypes ||= {}; const inner = e.event?.type || e.event?.event || 'unknown'; row.agentEventTypes[inner] = (row.agentEventTypes[inner] || 0) + 1;
        if (e.event?.text && !/thinking|reasoning/i.test(inner)) row.finalText = clean(row.finalText + e.event.text);
        if (/end|complete|done/.test(inner) && !/thinking|reasoning/.test(e.event?.contentType || '')) {
          row.terminalAgentEvents ||= []; row.terminalAgentEvents.push({ type, event: { type: inner, contentType: e.event?.contentType, toolName: e.event?.toolName, text: e.event?.contentType === 'text' ? clean(e.event.text) : undefined, usage: e.event?.usage, durationMs: e.event?.durationMs, isError: e.event?.output?.isError } });
        }
      }
      const content = Array.isArray(e.message?.content) ? e.message.content : [];
      const text = e.result?.response || (typeof e.result === 'string' ? e.result : null) || (e.type === 'assistant.message' ? e.data?.content : null) || (e.type === 'text' ? e.data : null) || (e.type === 'message_end' ? content.filter(c => c.type === 'text').map(c => c.text).join('\n') : null) || e.item?.text || e.message?.errorMessage;
      if (typeof text === 'string') row.finalText = clean(row.finalText + '\n' + text);
      if (e.type === 'error' || e.event === 'error') row.errorEvent = clean(JSON.stringify(e));
    }
    child.stdout.on('data', b => { const lines = (buffer + b.toString()).split('\n'); buffer = lines.pop(); lines.forEach(event); });
    child.stderr.on('data', b => { stderr = (stderr + b.toString()).slice(-6000); });
    child.once('error', e => { row.launchError = clean(e.message); });
    child.once('close', code => { clearTimeout(timer); if (buffer) event(buffer); row.exitCode = code; row.elapsedMs = Date.now() - start; row.diagnostic = clean(stderr); if (!row.finalText) row.finalText = clean(textTail); resolve(); });
    child.stdin.end(launch.input);
  });
  row.passed = row.calls.some(c => c.name === 'dock_context' && c.ok) && row.calls.some(c => c.tool === 'dock/task_candidates' && c.ok);
  fs.writeFileSync(path.join(dir, 'evidence.json'), JSON.stringify(row, null, 2));
  console.log(JSON.stringify({ id, passed: row.passed, calls: row.calls, elapsedMs: row.elapsedMs, timeout: row.timeout, exitCode: row.exitCode, diagnostic: row.diagnostic, finalText: row.finalText }));
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const url = 'http://127.0.0.1:' + server.address().port;
  let index = 0; const worker = async () => { while (index < ids.length) { const id = ids[index++]; await probe(id, url); } };
  await Promise.all([worker(), worker()]); server.close();
  fs.writeFileSync(path.join(run, 'matrix.json'), JSON.stringify({ run, rows: [...results.values()] }, null, 2)); console.log(JSON.stringify({ run }));
})().catch(e => { console.error(clean(e.message)); server.close(); process.exitCode = 1; });
