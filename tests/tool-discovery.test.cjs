'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { SharedHub } = require('../electron/shared.cjs');
const { SetupRequests } = require('../electron/setup-requests.cjs');

test('agents discover REA before setup, by name and ID, without starting a provider', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-discovery-'));
  let ready = false;
  const hub = new SharedHub(root, { list: () => [] }, { integrations: { snapshot: () => [{ id: 'rea', available: true, ready }] } });
  t.after(async () => { await hub.close(); fs.rmSync(root, { recursive: true, force: true }); });
  hub.connect = () => { throw Error('Discovery must not launch an unconnected provider'); };
  const discover = async args => { const result = JSON.parse((await hub.invoke('dock_tools', args)).content[0].text); return Array.isArray(result) ? result : result.tools; };
  assert.match(hub.summary(), /Reverse Engineer Anything \(rea\)/);
  assert.match(hub.summary(), /Before reporting a tool missing, check dock\/setup_status/);
  assert.deepEqual(await discover({}), []);
  for (const args of [{ connection: 'rea' }, { connection: 'Reverse Engineer Anything' }, { connection: 'REA' }, { tool: 'rea/unknown' }]) {
    const notice = (await discover(args)).find(x => x.connection === 'rea');
    assert.equal(notice.state, 'setup-required');
    assert.equal(notice.setup, 'Tools → Reverse Engineer Anything');
    assert.equal(notice.inputSchema, undefined);
    assert.equal(notice.name, undefined);
  }
  const setup = new SetupRequests(root, { getHub: () => hub, getAgents: () => [] });
  assert.equal(setup.status().integrations.find(x => x.id === 'rea').ready, false);
  ready = true;
  assert.equal((await discover({ connection: 'rea' }))[0].state, 'ready-to-connect');
  assert.equal(setup.status().integrations.find(x => x.id === 'rea').ready, true);
  hub.config.connections = [{ id: 'rea', enabled: false }];
  const disabled = (await discover({ connection: 'rea' }))[0];
  assert.equal(disabled.state, 'disabled');
  assert.match(disabled.error, /disabled/);
  await assert.rejects(hub.invoke('dock_call', { tool: 'rea/unknown', arguments: {} }), /Tool connection is unavailable/);
});

test('connected tool discovery returns real schemas and retains connection failures', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-discovery-'));
  const hub = new SharedHub(root, { list: () => [] });
  t.after(async () => { await hub.close(); fs.rmSync(root, { recursive: true, force: true }); });
  assert.equal(hub.builtinTools().find(x => x.id === 'rea').ready, null);
  hub.config.connections = [{ id: 'rea', enabled: true }];
  hub.connect = async () => ({ tools: [{ name: 'inspect', inputSchema: { type: 'object' } }] });
  const result = JSON.parse((await hub.invoke('dock_tools', { connection: 'Reverse Engineer Anything' })).content[0].text);
  assert.deepEqual(result.tools.map(x => x.name), ['rea/inspect']);
  assert.equal(result.tools[0].inputSchema, undefined);
  const exact = JSON.parse((await hub.invoke('dock_tools', { tool: 'rea/inspect' })).content[0].text);
  assert.deepEqual(exact[0].inputSchema, { type: 'object' });
  hub.connect = async () => { throw Error('Provider unavailable'); };
  const failed = JSON.parse((await hub.invoke('dock_tools', { connection: 'rea' })).content[0].text);
  assert.equal(failed.tools[0].connection, 'rea');
  assert.match(failed.tools[0].error, /Provider unavailable/);
});

test('default discovery fetches missing counts once and summarizes integrations without dumping catalogs', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-discovery-'));
  const hub = new SharedHub(root, { list: () => [] });
  t.after(async () => { await hub.close(); fs.rmSync(root, { recursive: true, force: true }); });
  hub.config.connections = [
    { id: 'rea', name: 'Reverse Engineer Anything', integration: 'rea', enabled: true },
    { id: 'upscayl-local', name: 'Upscayl (local)', description: 'Enlarge local images.\nLong details stay out of discovery.', enabled: true },
    { id: 'meshy', name: 'Meshy', enabled: false },
  ];
  let connects = 0;
  hub.connect = async connection => {
    assert.equal(connection.id, 'upscayl-local'); connects++;
    hub.status.set(connection.id, { ok: true, count: 2 });
    return { tools: [{ name: 'models' }, { name: 'upscale_image' }] };
  };
  hub.status.set('rea', { ok: true, count: 207, at: Date.now() });
  const overview = JSON.parse((await hub.invoke('dock_tools')).content[0].text);
  assert.deepEqual(overview.map(item => item.connection), ['rea', 'upscayl-local']);
  assert.match(overview[0].description, /Inspect existing apps/);
  assert.equal(overview[1].description, 'Enlarge local images.');
  assert.equal(overview[0].toolCount, 207);
  assert.equal(overview[1].toolCount, 2);
  await hub.invoke('dock_tools'); assert.equal(connects, 1);
  assert.doesNotMatch(JSON.stringify(overview), /inputSchema|Long details|inspect_native/);
  assert.ok(JSON.stringify(overview).length < 1000);
});

test('compact descriptions stop at sentences or whole words and exact schemas retain full descriptions', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-discovery-'));
  const hub = new SharedHub(root, { list: () => [] });
  t.after(async () => { await hub.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const description = 'Generate a model. Once the user approves the selected model, generate a refined asset with the configured provider settings and account permissions.';
  hub.config.connections = [{ id: 'meshy', name: 'Meshy', enabled: true }];
  hub.connect = async () => ({ tools: [
    { name: 'generate', description, inputSchema: { type: 'object' } },
    { name: 'long', description: 'Generate '.repeat(20), inputSchema: { type: 'object' } },
    { name: 'sentence', description: 'Generate '.repeat(16) + 'once the user approves. Further details follow.', inputSchema: { type: 'object' } },
  ] });
  const compact = JSON.parse((await hub.invoke('dock_tools', { connection: 'meshy' })).content[0].text);
  assert.equal(compact.tools[0].description, 'Generate a model.');
  assert.match(compact.tools[1].description, /Generate…$/);
  assert.ok(compact.tools[1].description.length <= 120);
  assert.equal(compact.tools[2].description, 'Generate '.repeat(16) + 'once the user approves.');
  const exact = JSON.parse((await hub.invoke('dock_tools', { tool: 'meshy/generate' })).content[0].text);
  assert.equal(exact[0].description, description);
});

test('connection search returns matching names and individual lookup returns the exact schema', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-discovery-'));
  const hub = new SharedHub(root, { list: () => [] });
  t.after(async () => { await hub.close(); fs.rmSync(root, { recursive: true, force: true }); });
  hub.config.connections = [{ id: 'rea', name: 'Reverse Engineer Anything', enabled: true }];
  const schema = { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] };
  hub.connect = async () => ({ tools: [
    { name: 'inspect_android_package', description: 'Inspect an APK.', inputSchema: schema },
    { name: 'inspect_native_api', description: 'Inspect a native API.', inputSchema: schema },
  ] });
  const matches = JSON.parse((await hub.invoke('dock_tools', { connection: 'Reverse Engineer Anything', query: 'inspect android' })).content[0].text);
  assert.deepEqual(matches.tools.map(item => item.name), ['rea/inspect_android_package']);
  assert.equal(matches.tools[0].inputSchema, undefined);
  const exact = JSON.parse((await hub.invoke('dock_tools', { tool: matches.tools[0].name })).content[0].text);
  assert.deepEqual(exact[0].inputSchema, schema);
  await assert.rejects(hub.invoke('dock_tools', { query: 'android' }), /Choose a connection/);
});

test('large connection catalogs are paged and searchable without losing tool schemas', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-discovery-'));
  const hub = new SharedHub(root, { list: () => [] });
  t.after(async () => { await hub.close(); fs.rmSync(root, { recursive: true, force: true }); });
  hub.config.connections = [{ id: 'rea', name: 'REA', enabled: true }];
  const tools = Array.from({ length: 207 }, (_, i) => ({ name: `inspect_${i}`, description: `Inspect target ${i}.`, inputSchema: { type: 'object' } }));
  hub.connect = async () => ({ tools });
  const first = JSON.parse((await hub.invoke('dock_tools', { connection: 'rea' })).content[0].text);
  assert.equal(first.total, 207); assert.equal(first.tools.length, 20); assert.equal(first.nextOffset, 20);
  assert.ok(JSON.stringify(first).length < 4000);
  const second = JSON.parse((await hub.invoke('dock_tools', { connection: 'rea', offset: first.nextOffset })).content[0].text);
  assert.equal(second.tools[0].name, 'rea/inspect_20');
  const last = JSON.parse((await hub.invoke('dock_tools', { connection: 'rea', offset: 200 })).content[0].text);
  assert.equal(last.tools.length, 7); assert.equal(last.nextOffset, undefined);
  const search = JSON.parse((await hub.invoke('dock_tools', { connection: 'rea', query: 'target 206' })).content[0].text);
  assert.equal(search.total, 1); assert.equal(search.tools[0].name, 'rea/inspect_206');
});
