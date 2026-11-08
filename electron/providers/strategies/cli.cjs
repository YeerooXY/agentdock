'use strict';
const { commonRuntime } = require('./common.cjs');
function cliAdapter({ resumeFlag } = {}) {
  return {
    ...commonRuntime,
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
        if (resumeFlag && resumeId) prepared.args.push(resumeFlag, resumeId);
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


module.exports = { cliAdapter };
