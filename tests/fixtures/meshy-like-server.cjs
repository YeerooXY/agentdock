'use strict';
// Stands in for the Meshy MCP server: echoes arguments and reports a balance
// that drops by 20 credits for each generation. No network, no real credits.
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
let balance = 100;
const server = new Server({ name: 'meshy-fixture', version: '1' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
  { name: 'meshy_check_balance', inputSchema: { type: 'object', properties: {} } },
  { name: 'meshy_text_to_3d', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, ai_model: { type: 'string' } } } },
] }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  if (request.params.name === 'meshy_check_balance') return { content: [{ type: 'text', text: JSON.stringify({ balance }) }] };
  balance -= 20;
  return { content: [{ type: 'text', text: JSON.stringify(request.params.arguments) }] };
});
server.connect(new StdioServerTransport());
