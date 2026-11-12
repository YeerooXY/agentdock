'use strict';
const DOCK_TOOLS = [
  { name: 'dock_context', description: 'Read project context when needed. Retain sinceContextRevision to omit unchanged instructions.', inputSchema: { type: 'object', properties: { detail: { enum: ['project', 'shared', 'study'] }, includeProject: { type: 'boolean' }, sinceContextRevision: { type: 'object', properties: { instructions: { type: 'string', pattern: '^[a-f0-9]{64}$' }, project: { anyOf: [{ type: 'string', pattern: '^[a-f0-9]{64}$' }, { type: 'null' }] } }, required: ['instructions', 'project'], additionalProperties: false }, sinceReflectionRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, additionalProperties: false } },
  { name: 'dock_tools', description: 'List connected tools and setup notices for unconnected built-in tools. Select a connection ID/name or full tool name for schemas. Check dock/setup_status before reporting a tool unavailable.', inputSchema: { type: 'object', properties: { connection: { type: 'string' }, tool: { type: 'string' } }, additionalProperties: false } },
  { name: 'dock_call', description: 'Call a shared tool with the name and arguments from dock_tools. Credentials are supplied by Paddock.', inputSchema: { type: 'object', properties: { tool: { type: 'string' }, arguments: { type: 'object', additionalProperties: true } }, required: ['tool', 'arguments'], additionalProperties: false } }
];
const textResult = (text, isError = false) => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) });
module.exports = { DOCK_TOOLS, textResult };
