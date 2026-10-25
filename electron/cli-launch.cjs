'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { byId } = require('./cli-catalog.cjs');
const { atomicJson } = require('./storage.cjs');
const bridgeVariables = ['PADDOCK_BRIDGE_URL', 'PADDOCK_BRIDGE_TOKEN', 'PADDOCK_INSTRUCTIONS'];
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
    const start = '# BEGIN PADDOCK', end = '# END PADDOCK';
    if (before.includes('[mcp_servers.paddock]') && !before.includes(start)) throw new Error('This agent already has a different paddock connection. Rename it in that agent’s settings first.');
    const block = `${start}\n[mcp_servers.paddock]\ncommand = ${JSON.stringify(server.command)}\nargs = ${JSON.stringify(server.args)}\nenv = { ${Object.entries(server.env || {}).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join(', ')} }\n${end}`;
    // Replace the block written under the app's former name, Agent Dock.
    const managed = before.includes(start) ? /# BEGIN PADDOCK[\s\S]*?# END PADDOCK/ : /# BEGIN AGENT DOCK[\s\S]*?# END AGENT DOCK/;
    after = managed.test(before) ? before.replace(managed, block) : before.replace(/\s*$/, '') + '\n\n' + block + '\n';
  } else {
    let config;
    try { config = before.trim() ? JSON.parse(before) : {}; }
    catch { throw new Error('The agent’s MCP file is not valid JSON. Fix it in the agent’s settings, then retry.'); }
    if (!config || Array.isArray(config) || typeof config !== 'object' || (config.mcpServers && (typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)))) throw new Error('The agent’s MCP configuration has an unsupported format.');
    const ours = entry => entry?.args?.some(arg => typeof arg === 'string' && /agent-tools\.cjs$/.test(arg));
    const previous = config.mcpServers?.paddock, legacy = ours(config.mcpServers?.agent_dock);
    if (previous && !ours(previous)) throw new Error('This agent already has a different paddock connection. Rename it in that agent’s settings first.');
    if (!legacy && JSON.stringify(previous) === JSON.stringify(server)) return { file, changed: false };
    config.mcpServers = { ...config.mcpServers, paddock: server };
    if (legacy) delete config.mcpServers.agent_dock; // Written under the app's former name.
    after = JSON.stringify(config, null, 2) + '\n';
  }
  if (before === after) return { file, changed: false };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (exists && !fs.existsSync(file + '.paddock-backup') && !fs.existsSync(file + '.agent-dock-backup')) fs.copyFileSync(file, file + '.paddock-backup', fs.constants.COPYFILE_EXCL);
  const temp = file + '.paddock-tmp'; fs.writeFileSync(temp, after, { mode: 0o600 }); fs.renameSync(temp, file);
  return { file, changed: true };
}
function prepareCli(id, { directory, runtime, summary, summaryPath, home = os.homedir(), model, permissions }) {
  const agent = byId.get(id), env = {}, args = [...(agent.args || [])];
  if (model && agent.model) args.push(agent.model, model);
  if (permissions === 'unrestricted' && agent.unrestricted) args.push(...agent.unrestricted);
  const mcpFile = path.join(directory, 'mcp.json');
  atomicJson(mcpFile, { mcpServers: { paddock: bridgeConfig(runtime) } });
  if (id === 'opencode') {
    // OpenCode substitutes environment references before parsing JSON. Serialize
    // the known instructions path here so Windows backslashes remain escaped.
    const environment = Object.fromEntries(bridgeVariables.map(key => [key, key === 'PADDOCK_INSTRUCTIONS' ? summaryPath : '{env:' + key + '}']));
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ instructions: [summaryPath], mcp: { paddock: { type: 'local', command: [runtime.node, runtime.tools], environment, enabled: true } } });
  } else if (id === 'copilot') {
    atomicJson(mcpFile, { mcpServers: { paddock: { type: 'local', ...bridgeConfig(runtime), tools: ['*'] } } });
    fs.writeFileSync(path.join(directory, 'AGENTS.md'), summary, { mode: 0o600 });
    env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = [process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS, directory].filter(Boolean).join(',');
    args.push('--additional-mcp-config', '@' + mcpFile);
  } else if (id === 'gemini') {
    // System defaults are administrator-owned policy files in current Gemini.
    // Use its ordinary user MCP settings; initialization supplies shared context.
    saveManagedMcp(path.join(home, '.gemini', 'settings.json'), bridgeConfig(runtime));
  } else if (id === 'qwen') {
    fs.writeFileSync(path.join(directory, 'PADDOCK.md'), summary, { mode: 0o600 });
    const settingsFile = path.join(directory, 'cli-settings.json');
    atomicJson(settingsFile, { mcpServers: { paddock: bridgeConfig(runtime) }, context: { fileName: ['QWEN.md', 'AGENTS.md', 'PADDOCK.md'], includeDirectories: [directory], loadFromIncludeDirectories: true } });
    env.QWEN_CODE_SYSTEM_DEFAULTS_PATH = settingsFile;
  } else if (id === 'kimi' || agent.mcp) {
    const syntax = id === 'cursor' ? 'cursor' : ['cline', 'antigravity', 'kimi'].includes(id) ? 'inherit' : 'shell';
    // The maintained Kimi Code CLI discovers its user MCP file; the former
    // kimi-cli --mcp-config-file option is no longer supported.
    saveManagedMcp(path.join(home, id === 'kimi' ? '.kimi-code/mcp.json' : agent.mcp), bridgeConfig(runtime, syntax));
    if (id === 'grok') args.push('--rules', `Before each task, call paddock dock_context for shared instructions and tools. Shared instructions are also in ${summaryPath}.`);
    if (id === 'droid') args.push('--append-system-prompt-file', summaryPath);
    if (id === 'pi') args.push('--append-system-prompt', summaryPath);
  }
  return { args, env };
}
module.exports = { prepareCli, bridgeConfig, saveManagedMcp };
