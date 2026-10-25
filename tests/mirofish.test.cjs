'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { mirofishEndpoint, callMiroFish, checkMiroFish, tools } = require('../electron/mirofish.cjs');
const { ToolIntegrations } = require('../electron/integrations.cjs');
const { SharedHub } = require('../electron/shared.cjs');

test('MiroFish adapter validates loopback URLs and bounds simulation rounds before any network request', async () => {
  assert.equal(mirofishEndpoint(), 'http://127.0.0.1:5001');
  for (const url of ['http://example.com', 'http://localhost.evil', 'http://secret@localhost:5001', 'http://localhost/api', 'http://localhost/?key=secret']) assert.throws(() => mirofishEndpoint(url), /local HTTP/);
  let calls = 0; const fetcher = async () => { calls++; return Response.json({ success: true }); };
  await assert.rejects(callMiroFish(undefined, 'start_simulation', { simulation_id: 'sim_a', max_rounds: 41 }, { fetcher }), /Invalid/);
  await assert.rejects(callMiroFish(undefined, 'start_simulation', { simulation_id: '../escape', max_rounds: 5 }, { fetcher }), /Invalid/);
  await assert.rejects(callMiroFish(undefined, 'delete_project', {}, { fetcher }), /Invalid/);
  assert.equal(calls, 0);
});
test('MiroFish uploads selected text as multipart and uses the official POST polling routes without retries', async () => {
  const calls = [], fetcher = async (url, init) => { calls.push({ url: String(url), ...init }); return Response.json({ success: true, data: { task_id: 'task_a' } }); };
  await callMiroFish(undefined, 'create_project', { project_name: 'Launch', simulation_requirement: 'Compare messaging', documents: [{ title: 'Brief', text: 'Selected product evidence' }] }, { fetcher });
  assert.ok(calls[0].body instanceof FormData); assert.equal(await calls[0].body.get('files').text(), '# Brief\n\nSelected product evidence');
  assert.equal(calls[0].body.get('files').name, 'seed-1.md'); assert.equal(calls[0].redirect, 'error');
  for (const [name, route] of [['preparation_status', '/api/simulation/prepare/status'], ['report_status', '/api/report/generate/status']]) {
    await callMiroFish(undefined, name, { simulation_id: 'sim_a' }, { fetcher });
    assert.equal(new URL(calls.at(-1).url).pathname, route); assert.equal(calls.at(-1).method, 'POST'); assert.deepEqual(JSON.parse(calls.at(-1).body), { simulation_id: 'sim_a' });
  }
  let failures = 0;
  await assert.rejects(callMiroFish(undefined, 'start_simulation', { simulation_id: 'sim_a', max_rounds: 5 }, { fetcher: async () => { failures++; return new Response('PRIVATE_PROVIDER_ERROR', { status: 500 }); } }), error => !error.message.includes('PRIVATE_PROVIDER_ERROR'));
  assert.equal(failures, 1);
  await assert.rejects(checkMiroFish(undefined, { fetcher: async () => Response.json({ status: 'ok', service: 'Unrelated app' }) }), /identify/);
});
test('MiroFish uses a real MCP subprocess and mock HTTP backend; guidance and tools disappear on disable', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-miro-')), requests = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ route: req.url, method: req.method, body }); res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/health' ? { status: 'ok', service: 'MiroFish Backend' } : { success: true, data: { simulation_id: 'sim_a', status: 'running' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const adapter = path.join(root, 'mirofish-mcp.cjs');
  await require('esbuild').build({ entryPoints: [path.resolve(__dirname, '../electron/mirofish-mcp.cjs')], outfile: adapter, bundle: true, platform: 'node', target: 'node24', format: 'cjs', legalComments: 'eof' });
  const runtime = { node: process.execPath, mirofish: adapter };
  const integration = new ToolIntegrations(root, runtime, { detect: () => ({}) });
  const hub = new SharedHub(root, { list: () => [] }, { integrations: integration });
  t.after(async () => { await hub.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
  const connection = await integration.prepare('mirofish', { backendUrl: `http://127.0.0.1:${server.address().port}` });
  assert.deepEqual(requests.map(x => x.route), ['/health']);
  assert.deepEqual(connection.envKeys, {}); await hub.saveConnection(connection);
  assert.match(hub.summary(), /## Rehearsing launch scenarios/);
  assert.equal((await hub.list('mirofish')).filter(x => x.name).length, tools.length);
  await hub.invoke('dock_call', { tool: 'mirofish/start_simulation', arguments: { simulation_id: 'sim_a', max_rounds: 3 } });
  assert.deepEqual(JSON.parse(requests.at(-1).body), { simulation_id: 'sim_a', max_rounds: 3 });
  assert.equal(requests.at(-1).route, '/api/simulation/start');
  await hub.saveConnection({ ...connection, enabled: false });
  assert.doesNotMatch(hub.summary(), /## Rehearsing launch scenarios/); assert.deepEqual(await hub.list('mirofish'), []);
});
