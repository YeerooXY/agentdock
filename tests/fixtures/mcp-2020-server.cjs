'use strict';
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const server = new Server({ name: 'rea-schema-fixture', version: '1' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'echo', inputSchema: {
  $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { tuple: { type: 'array', prefixItems: [{ type: 'integer' }], items: false } }, required: ['tuple'], additionalProperties: false
} }] }));
server.setRequestHandler(CallToolRequestSchema, async request => ({ content: [{ type: 'text', text: JSON.stringify(request.params.arguments) }] }));
server.connect(new StdioServerTransport());
