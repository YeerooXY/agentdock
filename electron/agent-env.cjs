'use strict';
// Markers a parent agent session sets for its own child processes. When Paddock is
// started from inside an agent (for example a restart run by Claude Code), they leak
// into every console: CLAUDE_CODE_CHILD_SESSION turns off transcript saving, and the
// messaging socket and token belong to the parent session.
const INHERITED_SESSION_VARS = [
  'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_EXECPATH', 'CLAUDE_CODE_TMPDIR',
  'CODEX_THREAD_ID', 'CODEX_SANDBOX', 'CODEX_SANDBOX_NETWORK_DISABLED', 'CODEX_CI'
];
function stripInheritedSessionEnv(env) {
  const names = new Set(INHERITED_SESSION_VARS.map(name => name.toLowerCase()));
  for (const key of Object.keys(env)) if (names.has(key.toLowerCase())) delete env[key];
  return env;
}
module.exports = { INHERITED_SESSION_VARS, stripInheritedSessionEnv };
