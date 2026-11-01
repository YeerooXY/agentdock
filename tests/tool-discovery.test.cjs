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
  const discover = async args => JSON.parse((await hub.invoke('dock_tools', args)).content[0].text);
  assert.match(hub.summary(), /Reverse Engineer Anything \(rea\)/);
  assert.match(hub.summary(), /Before reporting a tool missing, check dock\/setup_status/);
  for (const args of [{}, { connection: 'rea' }, { connection: 'Reverse Engineer Anything' }, { connection: 'REA' }, { tool: 'rea/unknown' }]) {
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
  assert.deepEqual(result.map(x => x.name), ['rea/inspect']);
  assert.deepEqual(result[0].inputSchema, { type: 'object' });
  hub.connect = async () => { throw Error('Provider unavailable'); };
  const failed = JSON.parse((await hub.invoke('dock_tools', { connection: 'rea' })).content[0].text);
  assert.equal(failed[0].connection, 'rea');
  assert.match(failed[0].error, /Provider unavailable/);
});
