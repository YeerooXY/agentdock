'use strict';
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { DOCK_TOOLS, textResult } = require('./tool-contract.cjs');
const fs = require('node:fs');
let instructions = 'Start each task with dock_context({includeProject:true}) to include linked-project details in one call. On later tasks pass sinceContextRevision from your own previous response while its instructions remain in context; omit it if you no longer have them. Changed instruction revisions invalidate cached shared details; returned project updates replace cached project details. Only consoles whose study instructions explicitly enable quiet mode follow the quiet refresh cadence and omit routine completion alerts; all other consoles keep normal task tracking. Reuse known tool schemas; use dock_tools when a needed schema is missing or changes. After finish_turn, omit the separate ready notification call when notifyReady is false (Paddock is focused). Keep needed question/error status signals and the normal background notification policy. Never request secret values in chat; have the user enter or select a key in Settings → Tools or API.';
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
