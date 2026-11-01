'use strict';
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { tools, UpscaylEngine } = require('./upscayl-engine.cjs');
const engine = new UpscaylEngine(process.argv[2], process.argv[3]);
const server = new Server({ name: 'paddock-upscayl', version: '1' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const name = request.params.name;
    if (!tools.some(tool => tool.name === name)) throw Error('Unknown Upscayl tool.');
    const result = name === 'models' ? { models: engine.listModels(), defaultModel: 'high-fidelity-4x' } : await engine.upscale(request.params.arguments || {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
});
server.onclose = () => engine.close();
process.on('SIGTERM', () => { engine.close(); process.exit(0); });
server.connect(new StdioServerTransport()).catch(() => { process.stderr.write('Could not start the Upscayl adapter.\n'); process.exitCode = 1; });
