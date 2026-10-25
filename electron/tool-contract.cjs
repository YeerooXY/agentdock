'use strict';
const DOCK_TOOLS = [
  { name: 'dock_context', description: 'Get the latest shared user instructions and available connections. Call at the start of each task.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'dock_tools', description: 'List tool names and short descriptions. Select a connection or full tool name to retrieve input schemas.', inputSchema: { type: 'object', properties: { connection: { type: 'string' }, tool: { type: 'string' } }, additionalProperties: false } },
  { name: 'dock_call', description: 'Call a shared tool with the name and arguments from dock_tools. Credentials are supplied by Paddock.', inputSchema: { type: 'object', properties: { tool: { type: 'string' }, arguments: { type: 'object', additionalProperties: true } }, required: ['tool', 'arguments'], additionalProperties: false } }
];
const textResult = (text, isError = false) => ({ content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) });
module.exports = { DOCK_TOOLS, textResult };
