'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const Ajv = require('ajv');
const { meshyZodPlugin } = require('../scripts/meshy-build.cjs');
const { z } = require('../electron/meshy-zod.cjs');

test('Meshy record compatibility uses patched Zod collection bounds', () => {
  assert.deepEqual(z.record(z.string()).parse({ glb: 'model.glb' }), { glb: 'model.glb' });
  assert.equal(z.record(z.string()).safeParse({ glb: 123 }).success, false);
  assert.deepEqual(z.record(z.string(), z.number()).parse({ count: 2 }), { count: 2 });
  let visits = 0;
  const bounded = z.array(z.string().refine(() => { visits++; return true; })).max(5);
  const result = bounded.safeParse(Array(10000).fill('image.png'));
  assert.equal(result.success, false);
  assert.equal(result.error.issues.length, 1);
  assert.equal(visits, 0, 'An oversized collection is rejected before its elements are parsed');
});

test('bundled Meshy publishes every schema and validates calls against a local API fixture', { timeout: 45000 }, async () => {
  const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data');
  fs.mkdirSync(parent, { recursive: true });
  const work = fs.mkdtempSync(path.join(parent, 'meshy-schema-'));
  const entry = require.resolve('@meshy-ai/meshy-mcp-server');
  const schemaPath = name => JSON.stringify(path.join(path.dirname(entry), 'schemas', name + '.js'));
  const schemasEntry = path.join(work, 'schemas.js');
  fs.writeFileSync(schemasEntry, [
    `export { CreativeLabInputSchema } from ${schemaPath('creative-lab')};`,
    `export { TaskStatusOutputSchema } from ${schemaPath('output')};`,
    `export { ImageToImageInputSchema } from ${schemaPath('image')};`
  ].join('\n'));
  let client, server;
  try {
    await build({ entryPoints: { server: entry, schemas: schemasEntry }, outdir: work, outExtension: { '.js': '.cjs' },
      bundle: true, platform: 'node', target: 'node24', format: 'cjs', logLevel: 'silent',
      alias: { dotenv: path.join(root, 'electron/no-dotenv.cjs') }, plugins: [meshyZodPlugin()] });
    const schemas = require(path.join(work, 'schemas.cjs'));
    const creative = schemas.CreativeLabInputSchema.parse({ product: 'keychain', build_options: { size_mm: 40, has_closed_back: true, badge_shape: 'star' } });
    assert.equal(creative.timeout_seconds, 300);
    assert.equal(creative.response_format, 'markdown');
    assert.equal(creative.build_options.size_mm, 40);
    assert.equal(schemas.CreativeLabInputSchema.safeParse({ product: 'keychain', build_options: { invalid: [] } }).success, false);
    assert.equal(schemas.CreativeLabInputSchema.safeParse({ product: 'keychain', unexpected: true }).success, false);
    const status = { outcome: 'SUCCEEDED', task_id: 'fixture', status: 'SUCCEEDED', progress: 100,
      model_urls: { glb: 'https://example.invalid/model.glb' }, printability: { metrics: { volume: 1 } }, result: { nested: { value: true } } };
    assert.deepEqual(schemas.TaskStatusOutputSchema.parse(status), status);
    assert.equal(schemas.TaskStatusOutputSchema.safeParse({ ...status, model_urls: { glb: 123 } }).success, false);
    const requests = [];
    server = http.createServer(async (request, response) => {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      requests.push({ url: request.url, body: body ? JSON.parse(body) : null });
      response.setHeader('Content-Type', 'application/json');
      if (request.url === '/openapi/v1/balance') return response.end(JSON.stringify({ balance: 23, monthly_credits: 20, permanent_credits: 3 }));
      if (request.url === '/openapi/v2/text-to-3d') return response.end(JSON.stringify({ result: 'fixture-task' }));
      response.writeHead(404); response.end('{}');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    // The child has a dummy key and can connect only to the fixture port.
    const api = `http://127.0.0.1:${server.address().port}`;
    client = new Client({ name: 'paddock-offline-schema-test', version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ['--require', path.join(__dirname, 'fixtures/meshy-offline.cjs'), path.join(work, 'server.cjs')],
      cwd: work, stderr: 'pipe', env: { MESHY_API_HOST: api, MESHY_API_KEY: 'TEST_ONLY_NO_REQUESTS', PADDOCK_TEST_API: api,
        USERPROFILE: work, HOME: work, SystemRoot: process.env.SystemRoot || '' } });
    transport.stderr?.on('data', () => {});
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 28);
    const ajv = new Ajv({ strict: false, validateFormats: false });
    for (const tool of tools) {
      assert.ok(Object.keys(tool.inputSchema.properties).length, tool.name + ' retains its parameters');
      ajv.compile(tool.inputSchema);
      if (tool.outputSchema) ajv.compile(tool.outputSchema);
    }
    assert.equal(requests.length, 0, 'Discovery makes no API requests');
    const balance = await client.callTool({ name: 'meshy_check_balance', arguments: {} });
    assert.equal(balance.isError, undefined);
    assert.equal(balance.structuredContent.balance, 23);
    assert.match(balance.content[0].text, /Meshy Credit Balance/);
    const created = await client.callTool({ name: 'meshy_text_to_3d', arguments: { prompt: 'Fixture cube', response_format: 'json' } });
    assert.equal(created.isError, undefined);
    assert.equal(created.structuredContent.task_id, 'fixture-task');
    assert.equal(requests.at(-1).body.prompt, 'Fixture cube');
    assert.equal(requests.at(-1).body.mode, 'preview');
    const beforeInvalid = requests.length;
    const invalid = await client.callTool({ name: 'meshy_text_to_3d', arguments: { prompt: 42 } });
    assert.equal(invalid.isError, true);
    const imageTool = tools.find(tool => tool.name === 'meshy_image_to_image');
    const aiModel = imageTool.inputSchema.properties.ai_model.enum[0];
    const oversized = await client.callTool({ name: 'meshy_image_to_image', arguments: {
      ai_model: aiModel, prompt: 'Fixture', reference_image_urls: Array(10000).fill(42)
    } });
    assert.equal(oversized.isError, true);
    assert.ok(JSON.stringify(oversized.content).length < 1500, 'Oversized input produces a bounded validation error');
    assert.equal(requests.length, beforeInvalid, 'Invalid requests never reach the API');
  } finally {
    if (client) await client.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (path.dirname(fs.realpathSync(work)) !== fs.realpathSync(parent)) throw new Error('Unexpected test directory');
    fs.rmSync(work, { recursive: true, force: true });
  }
});
