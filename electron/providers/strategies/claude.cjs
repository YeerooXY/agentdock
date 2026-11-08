'use strict';
const path = require('node:path');
const { commonRuntime, envValue } = require('./common.cjs');
const WSL_AGENT_VARIABLES = ['PADDOCK_DATA_DIR', 'PADDOCK_SESSION_ID', 'PADDOCK_LAUNCH_ID', 'PADDOCK_ACCOUNT_ID', 'PADDOCK_BRIDGE_URL', 'PADDOCK_BRIDGE_TOKEN', 'PADDOCK_INSTRUCTIONS/p', 'PADDOCK_MCP_CONFIG/p'];
function claudeAdapter() {
  return {
    ...commonRuntime,
    switchMethod: 'resume', native: true, label: 'Claude Code',
    resolveInstall({ claudeTarget, getClaude, findProgram }) {
      const install = claudeTarget || getClaude() || { kind: 'native', path: findProgram('claude') };
      return { install, wsl: install.kind === 'wsl' };
    },
    prepareEditor({ id, launchId, purpose, node, draftBridge, wsl, root, ensureOwnedDirectory }) {
      if (purpose !== 'agent' || !node || !draftBridge || wsl) return { editorRoots: [], tempRoot: null };
      const launchTemp = path.join(root, 'sessions', id, 'draft-editor', launchId);
      ensureOwnedDirectory(path.dirname(path.dirname(launchTemp)), path.dirname(launchTemp));
      ensureOwnedDirectory(path.dirname(launchTemp), launchTemp);
      return { editorRoots: [path.join(launchTemp, 'claude')], tempRoot: launchTemp };
    },
    applyEnvironment(env, { account, wsl, tempRoot, bridge, purpose, wslPath }) {
      const editorTemp = tempRoot && bridge;
      if (editorTemp) env.CLAUDE_CODE_TMPDIR = wsl ? wslPath(tempRoot) : tempRoot;
      if (!wsl) return;
      if (account?.profile) {
        const configured = envValue(env, 'CLAUDE_CONFIG_DIR');
        if (configured && path.isAbsolute(configured)) env.CLAUDE_CONFIG_DIR = wslPath(configured);
      }
      const inherited = (env.WSLENV || '').split(':').filter(Boolean).filter(value => purpose !== 'setup' || !value.split('/')[0].toLowerCase().startsWith('paddock_'));
      env.WSLENV = [...new Set([...inherited, ...(purpose === 'agent' ? WSL_AGENT_VARIABLES : []), ...(envValue(env, 'CLAUDE_CONFIG_DIR') ? ['CLAUDE_CONFIG_DIR/p'] : []), ...(editorTemp ? ['CLAUDE_CODE_TMPDIR/p'] : [])])].join(':');
    },
    sessionFields: ({ install, wsl }) => ({ claudeTarget: install, ...(wsl ? { draftSupportReason: 'Account switching is unavailable for Claude Code in WSL.' } : {}) }),
    loginExecutable: ({ getClaude, findProgram }) => getClaude()?.path || findProgram('claude'),
    loginLaunch({ executable, args, env, cwd, getClaude, wslPath }) {
      const install = getClaude() || { kind: 'native', path: executable };
      if (install.kind !== 'wsl') return { executable, args };
      const config = envValue(env, 'CLAUDE_CONFIG_DIR');
      if (config && path.isAbsolute(config)) env.CLAUDE_CONFIG_DIR = wslPath(config);
      env.WSLENV = [...new Set([...(env.WSLENV || '').split(':').filter(Boolean), 'CLAUDE_CONFIG_DIR/p', 'PADDOCK_ACCOUNT_ID'])].join(':');
      return { executable: 'wsl.exe', args: ['-d', install.distro, '--cd', cwd, '--exec', executable, ...args] };
    },
    checkDraft(draft, stage, { hasClaudeEditorContext }) {
      if (!hasClaudeEditorContext(draft)) return;
      const error = new Error(`Turn off "Show last response in external editor" in Claude Code before switching. ${stage === 'source' ? 'The current console and draft are still running.' : 'Keep the original console open.'}`);
      error.code = 'claude-editor-context'; throw error;
    },
    resumePath: ({ target, history, selection }) => path.join(target.configDir, 'projects', selection ? history.relative : history.path),
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


module.exports = { claudeAdapter };
