'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { SharedHub, validateConnection, validateProfile } = require('../electron/shared.cjs');
const { runApi } = require('../electron/api-run.cjs');
const { Sessions } = require('../electron/sessions.cjs');
const { findClaude, wslPath } = require('../electron/adapters.cjs');
const { Vault } = require('../electron/storage.cjs');
const parent = path.resolve(__dirname, '..', 'test-data'); fs.mkdirSync(parent, { recursive: true });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(parent, 'shared-'));
  const secret = 'TEST_ONLY_SECRET_VALUE';
  const vault = { list: () => [{ id: 'fixture_key', label: 'Fixture key' }], get: id => { assert.equal(id, 'fixture_key'); return secret; } };
  const hub = new SharedHub(root, vault);
  t.after(async () => { await hub.close(); assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(parent)); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, hub, secret };
}
test('arbitrary vault IDs and multiline credentials preserve exact values; snapshots omit secrets', t => {
  const { root } = fixture(t);
  const vault = new Vault(path.join(root, 'vault.json'), { isEncryptionAvailable: () => true, encryptString: x => Buffer.from(x), decryptString: x => x.toString() });
  vault.set('blender_token', '  line1\nline2  ', 'Blender');
  assert.equal(vault.get('blender_token'), '  line1\nline2  ');
  assert.equal(vault.list()[0].id, 'blender_token'); assert.ok(!JSON.stringify(vault.list()).includes('line1'));
  assert.throws(() => vault.set('__proto__', 'x'), /key ID/);
});
test('MCP tool discovery, schema checking, bound credentials and invocation use a real subprocess', async t => {
  const { hub, secret } = fixture(t);
  await hub.saveConnection({ id: 'fixture', name: 'Fixture', type: 'stdio', command: process.execPath, args: [path.join(__dirname, 'fixtures', 'mcp-server.cjs')], envKeys: { FIXTURE_KEY: 'fixture_key' } });
  assert.equal((await hub.test('fixture')).count, 1);
  assert.equal((await hub.list())[0].name, 'fixture/echo');
  await assert.rejects(() => hub.invoke('dock_call', { tool: 'fixture/echo', arguments: { wrong: true } }), /input schema/);
  const result = await hub.invoke('dock_call', { tool: 'fixture/echo', arguments: { value: 'hello' } });
  const value = JSON.parse(result.content[0].text); assert.equal(value.value, 'hello'); assert.equal(value.bound, true); assert.equal(value.unbound, false); assert.equal(value.secret, '[credential removed]');
  assert.ok(!JSON.stringify(hub.snapshot()).includes(secret));
  assert.ok(!fs.readFileSync(hub.summaryPath, 'utf8').includes(secret));
  await hub.saveConnection({ ...hub.config.connections[0], enabled: false });
  assert.deepEqual(await hub.list(), []);
  await assert.rejects(() => hub.invoke('dock_call', { tool: 'fixture/echo', arguments: { value: 'x' } }), /unavailable/);
});
test('private bridge requires its session token, rejects browser origins, and revokes ended sessions', async t => {
  const { hub } = fixture(t); await hub.start();
  const env = hub.grant('session');
  const send = headers => fetch(env.AGENT_DOCK_BRIDGE_URL, { method: 'POST', headers, body: JSON.stringify({ name: 'dock_context' }) });
  assert.equal((await send({})).status, 403);
  assert.equal((await send({ Authorization: `Bearer ${env.AGENT_DOCK_BRIDGE_TOKEN}`, Origin: 'https://example.com' })).status, 403);
  const client = new Client({ name: 'bridge-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve(__dirname, '../electron/agent-tools.cjs')], env, stderr: 'pipe' }));
  t.after(() => client.close());
  assert.equal((await client.listTools()).tools.length, 3);
  hub.instructions('Use short sentences.');
  assert.match((await client.callTool({ name: 'dock_context', arguments: {} })).content[0].text, /Use short sentences/);
  hub.revoke('session'); assert.equal((await send({ Authorization: `Bearer ${env.AGENT_DOCK_BRIDGE_TOKEN}` })).status, 403);
});
test('HTTP tools bind credentials only to their configured endpoint and reject redirects', async t => {
  const { hub, secret } = fixture(t); let seen;
  const server = http.createServer(async (req, res) => { seen = { url: req.url, auth: req.headers.authorization }; if (req.url.startsWith('/redirect')) { res.writeHead(302, { Location: '/wrong' }); res.end(); } else { res.end(secret + ' response'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const connection = { id: 'service', type: 'rest', method: 'GET', url: `http://127.0.0.1:${server.address().port}/request`, headerKeys: { Authorization: { key: 'fixture_key', prefix: 'Bearer ' } }, inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } };
  await hub.saveConnection(connection);
  const output = await hub.invoke('dock_call', { tool: 'service/request', arguments: { query: 'a&b' } });
  assert.equal(seen.auth, `Bearer ${secret}`); assert.equal(seen.url, '/request?query=a%26b'); assert.equal(output.content[0].text, '[credential removed] response');
  await hub.saveConnection({ ...connection, url: connection.url.replace('/request', '/redirect') });
  assert.equal((await hub.invoke('dock_call', { tool: 'service/request', arguments: { query: 'x' } })).isError, true); assert.ok(seen.url.startsWith('/redirect'));
  assert.throws(() => validateConnection({ ...connection, url: 'http://example.com/api' }), /HTTPS/);
  assert.throws(() => validateProfile({ id: 'test', protocol: 'chat', url: 'https://key@example.com' }), /credentials/);
});
for (const protocol of ['responses', 'anthropic', 'chat']) test(`${protocol} API receives shared instructions, executes a tool and records every billed step`, async t => {
  const { hub } = fixture(t); hub.instructions('Reply briefly.'); let count = 0; const saved = [];
  const result = await runApi({ provider: 'custom', model: 'test', prompt: 'PRIVATE_PROMPT', maxOutput: 100 }, 'PRIVATE_KEY', { input: 2, output: 4 }, { profile: { id: 'custom', protocol, url: 'https://example.com/model' }, hub, onEntry: entry => saved.push(entry), fetcher: async (_, options) => {
    const body = JSON.parse(options.body); count++;
    assert.match(protocol === 'chat' ? body.messages[0].content : protocol === 'anthropic' ? body.system : body.instructions, /Reply briefly/);
    assert.equal(body.tools.length, 3);
    if (count === 2) assert.match(JSON.stringify(body), /Agent Dock shared instructions/);
    const usage = protocol === 'chat' ? { prompt_tokens: 20, completion_tokens: 10 } : { input_tokens: 20, output_tokens: 10 };
    const data = protocol === 'responses' ? { usage, status: 'completed', output: count === 1 ? [{ type: 'function_call', name: 'dock_context', call_id: 'call1', arguments: '{}' }] : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done' }] }] } : protocol === 'anthropic' ? { usage, content: count === 1 ? [{ type: 'tool_use', id: 'call1', name: 'dock_context', input: {} }] : [{ type: 'text', text: 'Done' }] } : { usage, choices: [{ finish_reason: count === 1 ? 'tool_calls' : 'stop', message: count === 1 ? { role: 'assistant', tool_calls: [{ id: 'call1', type: 'function', function: { name: 'dock_context', arguments: '{}' } }] } : { role: 'assistant', content: 'Done' } }] };
    return { ok: true, json: async () => data };
  } });
  assert.equal(result.text, 'Done'); assert.equal(count, 2); assert.equal(saved.length, 2); assert.equal(saved.reduce((n, x) => n + x.usage.total, 0), 60); assert.ok(!JSON.stringify(saved).includes('PRIVATE_'));
});
test('known CLI adapters receive the same context and MCP bridge without vault credentials in arguments', async t => {
  const { root, hub, secret } = fixture(t); await hub.start(); const launched = [];
  const sessions = new Sessions(root, { hub, claude: { kind: 'wsl', distro: 'Ubuntu', path: '/home/test/.local/bin/claude' }, nativeCodex: () => 'C:\\codex.exe', findProgram: () => 'C:\\Program Files\\nodejs\\node.exe', pty: { spawn(executable, args, options) { launched.push({ executable, args, options }); return { onData() {}, onExit() {}, kill() {} }; } } });
  await sessions.create({ provider: 'codex', cwd: root, permissions: 'unrestricted' });
  await sessions.create({ provider: 'claude', cwd: root, permissions: 'unrestricted' });
  assert.ok(launched[0].args.some(x => x.startsWith('developer_instructions=')));
  assert.ok(launched[0].args.some(x => x.startsWith('mcp_servers.agent_dock.command=')));
  assert.equal(launched[1].executable, 'wsl.exe'); assert.ok(launched[1].args.includes('--append-system-prompt-file')); assert.ok(launched[1].args.includes('--mcp-config')); assert.ok(launched[1].args.includes('--dangerously-skip-permissions'));
  assert.ok(!JSON.stringify(launched).includes(secret));
  assert.ok(!JSON.stringify(launched.map(x => x.args)).includes(launched[0].options.env.AGENT_DOCK_BRIDGE_TOKEN));
});
test('installed WSL path can reach the Windows shared MCP bridge without a model request', { timeout: 30000 }, async t => {
  const claude = findClaude(); if (claude?.kind !== 'wsl') { t.skip('No WSL Claude installation'); return; }
  const { hub } = fixture(t); await hub.start();
  const client = new Client({ name: 'wsl-test', version: '1' }); t.after(() => client.close());
  await client.connect(new StdioClientTransport({ command: 'wsl.exe', args: ['-d', claude.distro, '--exec', wslPath(process.execPath), path.resolve(__dirname, '../electron/agent-tools.cjs')], env: { ...hub.grant('wsl-session'), WSLENV: 'AGENT_DOCK_BRIDGE_URL:AGENT_DOCK_BRIDGE_TOKEN' }, stderr: 'pipe' }));
  const result = await client.callTool({ name: 'dock_context', arguments: {} }); assert.equal(result.isError, undefined); assert.match(result.content[0].text, /Agent Dock/);
});
for (const type of ['http', 'sse']) test(`${type} MCP authenticates discovery and calls against a real local server`, async t => {
  const { hub, secret } = fixture(t);
  const mcp = new Server({ name: 'remote-fixture', version: '1' }, { capabilities: { tools: {} } });
  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'hello', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }] }));
  mcp.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: 'text', text: 'Remote tool reached' }] }));
  let transport;
  if (type === 'http') { transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => 'fixture-session' }); await mcp.connect(transport); }
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${secret}`) { res.writeHead(401); res.end(); return; }
    try {
      if (type === 'http') await transport.handleRequest(req, res);
      else if (req.method === 'GET') { transport = new SSEServerTransport('/messages', res); await mcp.connect(transport); }
      else await transport.handlePostMessage(req, res);
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await mcp.close(); server.closeAllConnections(); server.close(); });
  await hub.saveConnection({ id: 'remote', type, url: `http://127.0.0.1:${server.address().port}/mcp`, headerKeys: { Authorization: { key: 'fixture_key', prefix: 'Bearer ' } } });
  assert.equal((await hub.test('remote')).count, 1);
  const result = await hub.invoke('dock_call', { tool: 'remote/hello', arguments: {} });
  assert.equal(result.content[0].text, 'Remote tool reached');
});
test('API tool loops stop at the step limit and preserve billing records when a continuation fails', async () => {
  const hub = { summary: () => 'Instructions', invoke: async () => ({ content: [{ type: 'text', text: 'result' }] }) };
  const profile = { id: 'example', protocol: 'responses', url: 'https://example.com/model' };
  const raw = { model: 'test', prompt: 'x' };
  const toolReply = { output: [{ type: 'function_call', name: 'dock_context', call_id: 'id', arguments: '{}' }], usage: { input_tokens: 3, output_tokens: 2 } };
  let count = 0;
  const limit = await runApi(raw, '', {}, { profile, hub, fetcher: async () => { count++; return { ok: true, json: async () => toolReply }; } });
  assert.equal(count, 8); assert.equal(limit.entries.length, 8); assert.equal(limit.entry.status, 'incomplete');
  count = 0; const saved = [];
  const failure = await runApi(raw, '', {}, { profile, hub, onEntry: entry => saved.push(entry), fetcher: async () => ++count === 1 ? { ok: true, json: async () => toolReply } : { ok: false, status: 429 } });
  assert.equal(count, 2); assert.equal(saved.length, 2); assert.equal(failure.entries[0].usage.total, 5); assert.equal(failure.entry.httpStatus, 429);
});
