'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { byId } = require('./cli-catalog.cjs');
const { atomicJson } = require('./storage.cjs');
const { STRATA_MODEL, strataConfig } = require('./local-models.cjs');
const bridgeVariables = ['PADDOCK_BRIDGE_URL', 'PADDOCK_BRIDGE_TOKEN', 'PADDOCK_INSTRUCTIONS'];
function bridgeConfig(runtime, syntax = 'shell') {
  const config = { command: runtime.node, args: [runtime.tools] };
  if (syntax !== 'inherit') config.env = Object.fromEntries(bridgeVariables.map(key => [key, syntax === 'cursor' ? '${env:' + key + '}' : '${' + key + '}']));
  return config;
}
function sameTomlLaunch(text, server) {
  // Grok serializes its TOML settings, discarding our comments and choosing
  // literal strings for Windows paths. Recognize the exact launch it retained.
  // This is deliberately a narrow recognizer, not a TOML editor: leave the
  // entire file intact, including nested env tables and user options.
  if (/'''|"""/.test(text)) return false;
  const sections = [...text.matchAll(/^\s*\[([^\r\n]+)\][ \t]*(?:#[^\r\n]*)?\r?$/gm)];
  const matches = sections.filter(section => /^mcp_servers\s*\.\s*(?:paddock|"paddock"|'paddock')$/.test(section[1]));
  if (matches.length !== 1) return false;
  const section = matches[0], index = sections.indexOf(section);
  const body = text.slice(section.index + section[0].length, sections[index + 1]?.index ?? text.length);
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const string = value => `(?:${escape(JSON.stringify(value))}${/[\r\n']/.test(value) ? '' : `|${escape("'" + value + "'")}`})`;
  const trivia = '(?:\\s|#[^\\r\\n]*(?:\\r?\\n|$))*';
  const command = new RegExp(`^[ \\t]*command[ \\t]*=[ \\t]*${string(server.command)}[ \\t]*(?:#[^\\r\\n]*)?\\r?$`, 'm');
  const args = new RegExp(`^[ \\t]*args[ \\t]*=[ \\t]*\\[${trivia}${server.args.map(string).join(`${trivia},${trivia}`)}${trivia},?${trivia}\\][ \\t]*(?:#[^\\r\\n]*)?\\r?$`, 'm');
  return (body.match(/^[ \t]*command\s*=/gm) || []).length === 1 && (body.match(/^[ \t]*args\s*=/gm) || []).length === 1 && command.test(body) && args.test(body);
}
function saveManagedMcp(file, server) {
  const exists = fs.existsSync(file), before = exists ? fs.readFileSync(file, 'utf8') : '';
  if (before.length > 2_000_000) throw new Error('The agent’s MCP configuration is too large to update automatically.');
  let after;
  if (file.endsWith('.toml')) {
    const start = '# BEGIN PADDOCK', end = '# END PADDOCK';
    if (!before.includes(start) && sameTomlLaunch(before, server)) return { file, changed: false };
    if (/^\s*\[mcp_servers\s*\.\s*(?:paddock|"paddock"|'paddock')(?:\s*\]|\s*\.)/m.test(before) && !before.includes(start)) throw new Error('This agent already has a different paddock connection. Rename it in that agent’s settings first.');
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
function prepareCli(id, { directory, runtime, summary, summaryPath, home = os.homedir(), configDir = null, model, permissions, profiles = [] }) {
  const agent = byId.get(id), env = {}, args = [...(agent.args || [])];
  if (model && agent.model) args.push(agent.model, model);
  if (permissions === 'unrestricted' && agent.unrestricted) args.push(...agent.unrestricted);
  const mcpFile = path.join(directory, 'mcp.json');
  atomicJson(mcpFile, { mcpServers: { paddock: bridgeConfig(runtime) } });
  if (id === 'opencode') {
    // OpenCode substitutes environment references before parsing JSON. Serialize
    // the known instructions path here so Windows backslashes remain escaped.
    const environment = Object.fromEntries(bridgeVariables.map(key => [key, key === 'PADDOCK_INSTRUCTIONS' ? summaryPath : '{env:' + key + '}']));
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ ...(model === STRATA_MODEL ? strataConfig(profiles) : {}), instructions: [summaryPath], mcp: { paddock: { type: 'local', command: [runtime.node, runtime.tools], environment, enabled: true } } });
  } else if (id === 'copilot') {
    atomicJson(mcpFile, { mcpServers: { paddock: { type: 'local', ...bridgeConfig(runtime), tools: ['*'] } } });
    fs.writeFileSync(path.join(directory, 'AGENTS.md'), summary, { mode: 0o600 });
    env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS = [process.env.COPILOT_CUSTOM_INSTRUCTIONS_DIRS, directory].filter(Boolean).join(',');
    args.push('--additional-mcp-config', '@' + mcpFile);
  } else if (id === 'cline') {
    // A shared Cline hub retains the environment of its first console. Keep
    // this launch local so its MCP child inherits this console's bridge grant.
    // The native SDK inherits process.env; interpolation is not needed here.
    saveManagedMcp(path.join(home, agent.mcp), bridgeConfig(runtime, 'inherit'));
    env.CLINE_SESSION_BACKEND_MODE = 'local';
  } else if (id === 'qwen') {
    fs.writeFileSync(path.join(directory, 'PADDOCK.md'), summary, { mode: 0o600 });
    const settingsFile = path.join(directory, 'cli-settings.json');
    atomicJson(settingsFile, { mcpServers: { paddock: bridgeConfig(runtime) }, context: { fileName: ['QWEN.md', 'AGENTS.md', 'PADDOCK.md'], includeDirectories: [directory], loadFromIncludeDirectories: true } });
    env.QWEN_CODE_SYSTEM_DEFAULTS_PATH = settingsFile;
  } else if (id === 'kimi' || agent.mcp) {
    const syntax = id === 'cursor' ? 'cursor' : ['cline', 'antigravity', 'kimi'].includes(id) ? 'inherit' : 'shell';
    // The maintained Kimi Code CLI discovers its user MCP file; the former
    // kimi-cli --mcp-config-file option is no longer supported.
    // Extra accounts keep their MCP configuration in their own folder.
    const userMcp = id === 'pi' && configDir ? path.join(configDir, 'mcp.json') : id === 'grok' && configDir ? path.join(configDir, 'config.toml')
      : path.join(home, id === 'kimi' ? '.kimi-code/mcp.json' : agent.mcp);
    saveManagedMcp(userMcp, bridgeConfig(runtime, syntax));
    if (id === 'antigravity') {
      require('./antigravity-session.cjs').prepareAntigravityTracking(home, runtime);
      env.PADDOCK_CLI_PROVIDER = 'antigravity';
    }
    if (id === 'grok') args.push('--rules', `Before each task, call paddock dock_context for shared instructions and tools. Shared instructions are also in ${summaryPath}.`);
    if (id === 'kiro') {
      // Kiro V3's headless permission matcher uses action IDs, not the
      // display selectors (@paddock/tool). Grant only our three bridge tools;
      // Paddock continues enforcing the called tool's own permissions.
      const bridgeTools = ['mcp_paddock_dock_context', 'mcp_paddock_dock_tools', 'mcp_paddock_dock_call'];
      const trustIndex = args.findIndex(arg => arg.startsWith('--trust-tools='));
      const alreadyTrusted = trustIndex < 0 ? [] : args[trustIndex].slice('--trust-tools='.length).split(',').filter(Boolean);
      const trust = '--trust-tools=' + [...new Set([...alreadyTrusted, ...bridgeTools])].join(',');
      if (trustIndex < 0) args.push(trust); else args[trustIndex] = trust;
    }
    if (id === 'droid') args.push('--append-system-prompt-file', summaryPath);
    if (id === 'pi') args.push('--append-system-prompt', summaryPath);
  }
  return { args, env };
}
module.exports = { prepareCli, bridgeConfig, saveManagedMcp };
