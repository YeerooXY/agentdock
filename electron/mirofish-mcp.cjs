'use strict';
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { tools, mirofishEndpoint, callMiroFish } = require('./mirofish.cjs');
const base = mirofishEndpoint(process.argv[2]);
const server = new Server({ name: 'agent-dock-mirofish', version: '1' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try { return { content: [{ type: 'text', text: JSON.stringify(await callMiroFish(base, request.params.name, request.params.arguments || {})) }] }; }
  catch (error) { return { isError: true, content: [{ type: 'text', text: error.name === 'TimeoutError' ? 'MiroFish timed out. Check project/task status before retrying; backend work may still be running.' : error.message }] }; }
});
server.connect(new StdioServerTransport()).catch(() => { process.stderr.write('Could not start the MiroFish adapter.\n'); process.exitCode = 1; });
