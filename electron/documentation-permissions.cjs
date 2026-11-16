'use strict';
const READ_ONLY = new Set(['dock/knowledge_directory', 'dock/knowledge_guide', 'dock/knowledge_context', 'dock/knowledge_state', 'dock/knowledge_resolve', 'dock/knowledge_bundle', 'dock/knowledge_source_resolve', 'dock/knowledge_source_extract', 'dock/knowledge_read']);
function documentationPermission(input) {
  if (input?.hook_event_name !== 'PermissionRequest') return null;
  const direct = ['mcp__paddock__dock_context', 'mcp__paddock__dock_tools'].includes(input.tool_name);
  const routed = input.tool_name === 'mcp__paddock__dock_call' && READ_ONLY.has(input.tool_input?.tool);
  return direct || routed ? { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } } : null;
}
module.exports = { documentationPermission };
