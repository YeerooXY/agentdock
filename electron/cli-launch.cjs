'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { byId } = require('./cli-catalog.cjs');
const { atomicJson } = require('./storage.cjs');
const bridgeVariables = ['AGENT_DOCK_BRIDGE_URL', 'AGENT_DOCK_BRIDGE_TOKEN', 'AGENT_DOCK_INSTRUCTIONS'];
function bridgeConfig(runtime, syntax = 'shell') {
  const config = { command: runtime.node, args: [runtime.tools] };
  if (syntax !== 'inherit') config.env = Object.fromEntries(bridgeVariables.map(key => [key, syntax === 'cursor' ? '${env:' + key + '}' : '${' + key + '}']));
  return config;
}
function saveManagedMcp(file, server) {
  const exists = fs.existsSync(file), before = exists ? fs.readFileSync(file, 'utf8') : '';
  if (before.length > 2_000_000) throw new Error('The agent’s MCP configuration is too large to update automatically.');
  let after;
  if (file.endsWith('.toml')) {
    const start = '# BEGIN AGENT DOCK', end = '# END AGENT DOCK';
    if (before.includes('[mcp_servers.agent_dock]') && !before.includes(start)) throw new Error('This agent already has a different agent_dock connection. Rename it in that agent’s settings first.');
    const block = `${start}\n[mcp_servers.agent_dock]\ncommand = ${JSON.stringify(server.command)}\nargs = ${JSON.stringify(server.args)}\nenv = { ${Object.entries(server.env || {}).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join(', ')} }\n${end}`;
    after = before.includes(start) ? before.replace(/# BEGIN AGENT DOCK[\s\S]*?# END AGENT DOCK/, block) : before.replace(/\s*$/, '') + '\n\n' + block + '\n';
  } else {
    let config;
    try { config = before.trim() ? JSON.parse(before) : {}; }
    catch { throw new Error('The agent’s MCP file is not valid JSON. Fix it in the agent’s settings, then retry.'); }
    if (!config || Array.isArray(config) || typeof config !== 'object' || (config.mcpServers && (typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)))) throw new Error('The agent’s MCP configuration has an unsupported format.');
    const previous = config.mcpServers?.agent_dock;
    if (previous && !previous.args?.some(arg => typeof arg === 'string' && /agent-tools\.cjs$/.test(arg))) throw new Error('This agent already has a different agent_dock connection. Rename it in that agent’s settings first.');
    if (JSON.stringify(previous) === JSON.stringify(server)) return { file, changed: false };
    config.mcpServers = { ...config.mcpServers, agent_dock: server };
    after = JSON.stringify(config, null, 2) + '\n';
  }
  if (before === after) return { file, changed: false };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (exists && !fs.existsSync(file + '.agent-dock-backup')) fs.copyFileSync(file, file + '.agent-dock-backup', fs.constants.COPYFILE_EXCL);
  const temp = file + '.agent-dock-tmp'; fs.writeFileSync(temp, after, { mode: 0o600 }); fs.renameSync(temp, file);
  return { file, changed: true };
}
function prepareCli(id, { directory, runtime, summary, summaryPath, home = os.homedir(), model, permissions }) {
  const agent = byId.get(id), env = {}, args = [...(agent.args || [])];
  if (model && agent.model) args.push(agent.model, model);
  if (permissions === 'unrestricted' && agent.unrestricted) args.push(...agent.unrestricted);
  const mcpFile = path.join(directory, 'mcp.json');
  atomicJson(mcpFile, { mcpServers: { agent_dock: bridgeConfig(runtime) } });
  if (id === 'opencode') {
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ instructions: [summaryPath], mcp: { agent_dock: { type: 'local', command: [runtime.node, runtime.tools], environment: Object.fromEntries(bridgeVariables.map(key => [key, '{env:' + key + '}'])), enabled: true } } });
  } else if (id === 'copilot') {
    atomicJson(mcpFile, { mcpServers: { agent_dock: { type: 'local', ...bridgeConfig(runtime), tools: ['*'] } } });
    fs.writeFileSync(path.join(directory, 'AGENTS.md'), summary, { mode: 0o600 });
    env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = [process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS, directory].filter(Boolean).join(',');
    args.push('--additional-mcp-config', '@' + mcpFile);
  } else if (id === 'gemini' || id === 'qwen') {
    fs.writeFileSync(path.join(directory, 'AGENT_DOCK.md'), summary, { mode: 0o600 });
    const settingsFile = path.join(directory, 'cli-settings.json');
    atomicJson(settingsFile, { mcpServers: { agent_dock: bridgeConfig(runtime) }, context: { fileName: [id === 'gemini' ? 'GEMINI.md' : 'QWEN.md', 'AGENTS.md', 'AGENT_DOCK.md'], includeDirectories: [directory], loadFromIncludeDirectories: true } });
    env[id === 'gemini' ? 'GEMINI_CLI_SYSTEM_DEFAULTS_PATH' : 'QWEN_CODE_SYSTEM_DEFAULTS_PATH'] = settingsFile;
  } else if (id === 'kimi') args.push('--mcp-config-file', mcpFile);
  else if (agent.mcp) {
    const syntax = id === 'cursor' ? 'cursor' : ['cline', 'antigravity'].includes(id) ? 'inherit' : 'shell';
    saveManagedMcp(path.join(home, agent.mcp), bridgeConfig(runtime, syntax));
    if (id === 'grok') args.push('--rules', `Before each task, call agent_dock dock_context for shared instructions and tools. Shared instructions are also in ${summaryPath}.`);
    if (id === 'droid') args.push('--append-system-prompt-file', summaryPath);
    if (id === 'pi') args.push('--append-system-prompt', summaryPath);
  }
  return { args, env };
}
module.exports = { prepareCli, bridgeConfig, saveManagedMcp };
