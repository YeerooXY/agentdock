'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { INHERITED_SESSION_VARS, stripInheritedSessionEnv } = require('../electron/agent-env.cjs');

test('consoles do not inherit a parent agent session', () => {
  const env = Object.fromEntries(INHERITED_SESSION_VARS.map(name => [name, 'parent']));
  Object.assign(env, { claude_code_child_session: '1', PATH: 'C:\bin', CLAUDE_CONFIG_DIR: 'C:\claude', CLAUDE_CODE_USE_BEDROCK: '1', CODEX_HOME: 'C:\codex' });
  stripInheritedSessionEnv(env);
  assert.deepEqual(env, { PATH: 'C:\bin', CLAUDE_CONFIG_DIR: 'C:\claude', CLAUDE_CODE_USE_BEDROCK: '1', CODEX_HOME: 'C:\codex' });
});
