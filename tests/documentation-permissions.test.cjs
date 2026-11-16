'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { documentationPermission } = require('../electron/documentation-permissions.cjs');
test('only exact context and documentation reads bypass the first tool prompt', () => {
  const input = { hook_event_name: 'PermissionRequest', tool_name: 'mcp__paddock__dock_call', tool_input: { tool: 'dock/knowledge_context', arguments: { query: 'startup' } } };
  assert.equal(documentationPermission(input).hookSpecificOutput.decision.behavior, 'allow');
  for (const tool of ['dock/knowledge_write', 'dock/knowledge_initialize', 'dock/knowledge_source_capture', 'dock/console_open', 'dock/knowledge_context_extra']) {
    assert.equal(documentationPermission({ ...input, tool_input: { tool } }), null);
  }
  assert.equal(documentationPermission({ ...input, tool_name: 'Bash' }), null);
  assert.equal(documentationPermission({ ...input, hook_event_name: 'PreToolUse' }), null);
});
