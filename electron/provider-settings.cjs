'use strict';
// Provider settings adapters for session launch.
// Each adapter exposes:
//   launchArgs(ctx) -> { executable, args, env }
//   switchMethod     'resume' (codex, claude) | 'none'
//   native           true when Paddock launches the CLI itself with its own
//                    permission, model and effort flags (codex, claude)
//
// ctx fields supplied by Sessions.createOne:
//   purpose, model, resumeId, resumePath, resumeModel, resumeEffort,
//   permissions, account, node, helper, summary, summaryPath,
//   mcpConfig, dir, cwd, isWsl, claudeInstall, discussion,
//   hub (boolean), codexScrollback, nativeCodex, programLaunch,
//   prepareCli, cliAgents, agentHome, cliSetup, findProgram,
//   runtime, bridgeHelper, atomicJson, shQuote, wslPath, quote,
//   customLaunch, shellLaunch, provider, command, profiles
//
// This is a refactor only. Launch arguments, environment and files written
// are byte-identical to the original if/else chain in sessions.cjs.

const path = require('node:path');

function codexAdapter() {
  return {
    switchMethod: 'resume', native: true,
    launchArgs(ctx) {
      const { resumeId, resumeModel, resumeEffort, permissions, account, node, helper,
        summary, summaryPath, hub, codexScrollback,
        nativeCodex, programLaunch, atomicJson, purpose, bridgeHelper, cwd } = ctx;

      const executable = nativeCodex();
      if (!executable) throw new Error('Codex CLI was not found. Install it, then restart Paddock.');

      const args = [...(resumeId ? ['--no-daemon', 'resume', resumeId, '--cd', cwd] : ['--no-daemon'])];

      // Inline mode keeps the console's scrollback and text selection.
      if (codexScrollback()) args.push('--no-alt-screen');

      if (purpose === 'agent') {
        if (!node) throw new Error('Node.js is needed for completion notifications.');
        args.push('-c', `notify=${JSON.stringify([node, helper, 'codex-notify'])}`);
      }

      if (account?.profile) args.push('-c', `sqlite_home=${JSON.stringify(path.join(account.configDir, 'sqlite'))}`);

      if (!resumeId && ctx.model) args.push('--model', ctx.model);
      if (resumeId && resumeModel) args.push('--model', resumeModel);
      if (resumeEffort !== null) args.push('-c', `model_reasoning_effort=${JSON.stringify(resumeEffort)}`);

      if (hub && purpose === 'agent') {
        const context = JSON.stringify(summary).length < 22000 ? summary
          : `Before doing any work, call the paddock dock_context tool to load the shared user instructions and tool summary. The same instructions are in ${summaryPath}. Refresh them at the start of each task. Use dock_tools to discover tools and dock_call to invoke them.`;
        const values = {
          developer_instructions: context,
          'mcp_servers.paddock.command': node,
          'mcp_servers.paddock.args': [bridgeHelper],
          'mcp_servers.paddock.env_vars': ['PADDOCK_BRIDGE_URL', 'PADDOCK_BRIDGE_TOKEN'],
          'mcp_servers.paddock.tool_timeout_sec': 150,
          'mcp_servers.paddock.default_tools_approval_mode': 'approve'
        };
        for (const [key, value] of Object.entries(values)) args.push('-c', `${key}=${JSON.stringify(value)}`);
      }

      if (permissions === 'unrestricted') args.push('--dangerously-bypass-approvals-and-sandbox');

      return { executable, args, env: {} };
    }
  };
}

function claudeAdapter() {
  return {
    switchMethod: 'resume', native: true,
    launchArgs(ctx) {
      const { resumeId, resumePath, resumeModel, resumeEffort, permissions, node, helper,
        summaryPath, mcpConfig, dir, isWsl, claudeInstall, discussion, hub,
        purpose, programLaunch, atomicJson, shQuote, wslPath, cwd } = ctx;

      const claude = claudeInstall?.path;
      if (!claude) throw new Error('Claude Code was not found. Install it, then restart Paddock.');
      if (purpose === 'agent' && !node) throw new Error('Node.js is needed for Claude tracking.');

      const command = mode => isWsl
        ? `${shQuote(wslPath(node))} ${shQuote(helper)} ${mode}`
        : `"${node.replaceAll('\\', '/')}" "${helper.replaceAll('\\', '/')}" ${mode}`;

      const claudeArgs = [];

      if (purpose === 'agent') {
        const hooks = {};
        for (const type of ['SessionStart', 'UserPromptSubmit', 'Stop', 'PermissionRequest', 'Notification', 'StopFailure', 'SessionEnd']) {
          hooks[type] = [{ hooks: [{ type: 'command', command: command(type), timeout: 15 }] }];
        }
        const settings = path.join(dir, 'claude-settings.json');
        atomicJson(settings, { hooks, statusLine: { type: 'command', command: command('statusline') } });
        claudeArgs.push('--settings', isWsl ? wslPath(settings) : settings);
      }

      if (!resumeId && ctx.model) claudeArgs.push('--model', ctx.model);
      if (resumeId && resumeModel) claudeArgs.push('--model', resumeModel);
      if (resumeEffort !== null) claudeArgs.push('--effort', resumeEffort);
      if (resumeId) claudeArgs.push('--resume', resumePath || resumeId);
      if (hub && purpose === 'agent') {
        claudeArgs.push(
          '--append-system-prompt-file', isWsl ? wslPath(summaryPath) : summaryPath,
          '--mcp-config', isWsl ? wslPath(mcpConfig) : mcpConfig
        );
      }
      if (permissions === 'unrestricted') claudeArgs.push('--dangerously-skip-permissions');
      if (discussion) claudeArgs.push('--', discussion);

      let executable, args;
      if (isWsl) {
        executable = 'wsl.exe';
        args = ['-d', claudeInstall.distro, '--cd', cwd, '--exec', claude, ...claudeArgs];
      } else {
        ({ executable, args } = programLaunch(claude, claudeArgs));
      }

      return { executable, args, env: {} };
    }
  };
}

function cliAdapter() {
  return {
    switchMethod: 'none', native: false,
    launchArgs(ctx) {
      const { resumeId, permissions, model, account, node, summary, summaryPath,
        cliAgents, agentHome, cliSetup, findProgram, hub, programLaunch,
        prepareCli, runtime, bridgeHelper, dir, customLaunch, shellLaunch,
        provider, command, profiles } = ctx;

      if (cliAgents.has(provider)) {
        const agent = cliAgents.get(provider);
        const program = cliSetup?.executable(provider) || findProgram(agent.command);
        if (!program) throw new Error(`${agent.name} was not found. Open Settings \u2192 Set up agents to install it.`);
        const prepared = hub
          ? prepareCli(provider, { directory: dir, runtime: { ...runtime, node, tools: bridgeHelper }, summary, summaryPath, home: agentHome, configDir: account?.profile ? account.configDir : null, model, permissions, profiles: profiles || [] })
          : { args: [...(agent.args || []), ...(model && agent.model ? [agent.model, model] : [])], env: {} };
        if (provider === 'antigravity' && resumeId) prepared.args.push('--conversation', resumeId);
        const { executable, args } = programLaunch(program, prepared.args, { bypass: true });
        return { executable, args, env: prepared.env };
      }

      if (provider === 'custom') {
        const { quote, mcpConfig } = ctx;
        if (typeof command !== 'string' || !command.trim() || command.length > 4000 || command.includes('\0')) {
          throw new Error('Enter the command you want this console to run.');
        }
        const resolved = hub ? command.replaceAll('{instructions}', quote(summaryPath)).replaceAll('{mcp_config}', quote(mcpConfig)) : command;
        const { executable, args } = customLaunch(resolved);
        return { executable, args, env: {} };
      }

      // shell and other built-in providers that need no special handling
      const { executable, args } = shellLaunch();
      return { executable, args, env: {} };
    }
  };
}

const ADAPTERS = {
  codex: codexAdapter(),
  claude: claudeAdapter()
};

function settingsAdapter(provider) {
  return ADAPTERS[provider] || cliAdapter();
}

module.exports = { settingsAdapter, codexAdapter, claudeAdapter, cliAdapter };
