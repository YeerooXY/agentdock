'use strict';
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { DOCK_TOOLS, textResult } = require('./tool-contract.cjs');
const fs = require('node:fs');
let instructions = 'Call dock_context at the start of each task for the user\'s shared instructions and connected tools. Use dock_tools to discover them. Use dock/notify when work finishes or needs the user. Never request secret values in chat; have the user enter or select a key in Settings → Tools or API.';
try {
  const file = process.env.PADDOCK_INSTRUCTIONS;
  if (file && fs.statSync(file).size <= 200000) instructions += '\n\n' + fs.readFileSync(file, 'utf8');
} catch {}
const server = new Server({ name: 'agent-dock', version: '0.5.0' }, { capabilities: { tools: {} }, instructions });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: DOCK_TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const response = await fetch(process.env.PADDOCK_BRIDGE_URL, { method: 'POST', headers: { Authorization: `Bearer ${process.env.PADDOCK_BRIDGE_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request.params), redirect: 'error', signal: AbortSignal.timeout(140000) });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch { return textResult('Paddock is unavailable. Open it and start this console again.', true); }
});
server.connect(new StdioServerTransport()).catch(() => { process.exitCode = 1; });
