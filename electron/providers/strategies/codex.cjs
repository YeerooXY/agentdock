'use strict';
const path = require('node:path');
const { commonRuntime, plainTerminalText } = require('./common.cjs');
const UUID_TEXT = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
function hasCodexFolderTrustPrompt(value) {
  const text = plainTerminalText(value).toLowerCase();
  return /folder\s*access/.test(text) && /trust\s*this\s*folder/.test(text);
}
// Codex writes no identity event while resuming, so its local /status command
// is the confirmation. The composer must be empty before and after the check.
async function confirmResumeIdentity({ waitForOutputIdle, captureNativeDraft }, session, expectedId) {
  if (!/^[a-f0-9-]{36}$/i.test(expectedId || '')) throw new Error('The selected Codex conversation ID is unavailable. Keep the original console open.');
  await waitForOutputIdle(session);
  if (await captureNativeDraft(session) !== '') throw new Error('The selected account opened with a draft already present. Keep the original console open.');
  const originalBuffer = session.buffer, initialSequence = session.sequence;
  session.terminal.write('/status');
  await waitForOutputIdle(session, { afterSequence: initialSequence });
  const popupSequence = session.sequence;
  session.terminal.write('\x1b');
  await waitForOutputIdle(session, { afterSequence: popupSequence });
  if (await captureNativeDraft(session, { dismissCodexStatusPopup: true }) !== '/status') throw new Error('Codex did not confirm its local status command. Keep the original console open.');
  const commandSequence = session.sequence;
  const statusStart = session.buffer.length;
  session.terminal.write('\r');
  await waitForOutputIdle(session, { afterSequence: commandSequence });
  const statusText = plainTerminalText(session.buffer.slice(statusStart));
  const match = statusText.match(new RegExp(`(?:^|\\n)\\s*Session:\\s*(${UUID_TEXT})`, 'i'));
  if (!match) throw new Error('Codex did not report the selected conversation ID. Keep the original console open.');
  if (match[1].toLowerCase() !== expectedId.toLowerCase()) throw new Error('Codex opened a different conversation. Keep the original console open.');
  if (await captureNativeDraft(session) !== '') throw new Error('Codex did not return to an empty composer after its local status check. Keep the original console open.');
  session.buffer = originalBuffer;
  session.providerSessionId = expectedId;
}
function codexAdapter() {
  return {
    ...commonRuntime,
    switchMethod: 'resume', native: true, label: 'Codex',
    prepareEditor: ({ account }) => ({ editorRoots: account?.configDir ? [path.join(account.configDir, 'editor')] : [], tempRoot: null }),
    // `hold` reserves the console's layout cell while the startup hook runs.
    prepareTracking({ purpose, login, executable, args, account, prepareSession, hold, options }) {
      if (purpose !== 'agent' || login) return '';
      return (async () => {
        const release = hold();
        try { args.push(...await prepareSession(executable, { ...options, sqliteHome: account?.profile ? path.join(account.configDir, 'sqlite') : null })); return ''; }
        catch { return 'Paddock: Update Codex to restore chats before the first reply finishes.\r\n'; }
        finally { release(); }
      })();
    },
    appendDiscussion(args, { login, discussion }) { if (!login && discussion) args.push('--', discussion); },
    loginExecutable: ({ nativeCodex }) => nativeCodex(),
    loginLaunch: ({ executable, args }) => ({ executable, args }),
    confirmResumeIdentity,
    resumeModel: ({ targetAccountId, source, getThreadModel }) => getThreadModel(targetAccountId, source.providerSessionId),
    stageFailure: ({ buffer, targetLabel }) => hasCodexFolderTrustPrompt(buffer)
      ? `${targetLabel} needs to trust this project folder before it can resume here. Select "Set up ${targetLabel}" in this console's account menu. Paddock kept this console and its draft open.`
      : null,
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


module.exports = { codexAdapter, hasCodexFolderTrustPrompt };
