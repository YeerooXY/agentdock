'use strict';
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { DOCK_TOOLS, textResult } = require('./tool-contract.cjs');
const server = new Server({ name: 'agent-dock', version: '0.2.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: DOCK_TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const response = await fetch(process.env.AGENT_DOCK_BRIDGE_URL, { method: 'POST', headers: { Authorization: `Bearer ${process.env.AGENT_DOCK_BRIDGE_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request.params), redirect: 'error', signal: AbortSignal.timeout(140000) });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch { return textResult('Agent Dock is unavailable. Open it and start this console again.', true); }
});
server.connect(new StdioServerTransport()).catch(() => { process.exitCode = 1; });
