'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isPrivate, isPublic, isTailscale, publicHost, connectionOptions, networkRelation } = require('../electron/mobile-address.cjs');
const { MobileNetwork, runHelper } = require('../electron/mobile-network.cjs');
const config = { host: '192.168.1.10', port: 47831, externalPort: 47831, mode: 'tailscale', mappingId: '00000000-0000-4000-8000-000000000000' };
test('connections are same Wi-Fi or Tailscale; direct internet is retired', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.1.1', '100.64.0.1']) { assert.ok(isPrivate(ip)); assert.ok(!isPublic(ip)); assert.throws(() => publicHost(ip)); }
  assert.equal(isPrivate('192.168.evil'), false);
  for (const ip of ['100.64.0.1', '100.101.102.103', '100.127.255.254']) assert.ok(isTailscale(ip));
  for (const ip of ['100.63.0.1', '100.128.0.1', '192.168.1.1', '8.8.8.8', '100.64.evil', '::1']) assert.ok(!isTailscale(ip));
  assert.equal(connectionOptions({}).mode, 'local');
  assert.equal(connectionOptions({ mode: 'tailscale', publicHost: 'ignored.example' }).mode, 'tailscale');
  assert.equal(connectionOptions({ mode: 'tailscale', publicHost: 'ignored.example' }).publicHost, '');
  assert.throws(() => connectionOptions({ mode: 'internet' }), /replaced by Tailscale/);
  assert.throws(() => connectionOptions({ mode: 'anything' }));
});
test('the network helper only accepts a Tailscale address for firewall rules', async () => {
  if (process.platform !== 'win32') return;
  await assert.rejects(runHelper('missing.ps1', 'inspect', { host: '100.64.0.5' }), /Wi-Fi or Ethernet/);
  await assert.rejects(runHelper('missing.ps1', 'map', { ...config, host: '100.64.0.5' }), /Wi-Fi or Ethernet/);
  await assert.rejects(runHelper('missing.ps1', 'firewall', { ...config, host: '100.64.0.5', mappingId: 'bad' }), /Invalid phone connection settings/);
});
test('starting the connection never maps router ports or contacts DNS providers', async () => {
  const n = new MobileNetwork({ helper: () => assert.fail('router mapping'), fetcher: () => assert.fail('network request') });
  await n.start({ ...config, mode: 'tailscale' }); await n.stop();
  await n.start({ ...config, mode: 'local' }); await n.stop();
});
test('network checks distinguish upstream NAT from unverified or matching addresses', async () => {
  assert.equal(networkRelation('192.168.100.4', '8.8.8.8'), 'upstream');
  assert.equal(networkRelation('100.64.1.2', '8.8.8.8'), 'upstream');
  assert.equal(networkRelation('8.8.8.8', '8.8.8.8'), 'direct');
  assert.equal(networkRelation('8.8.8.8', '1.1.1.1'), 'upstream');
  assert.equal(networkRelation('', '8.8.8.8'), 'unknown');
  const n = new MobileNetwork({ helper: async () => ({ gateway: '192.168.1.1', wanAddress: '192.168.100.4', upnp: true }), fetcher: async () => new Response('8.8.8.8') });
  assert.equal((await n.inspect(config.host)).relation, 'upstream');
  assert.ok(n.snapshot().checkedAt); assert.equal(n.snapshot().publicAddress, '8.8.8.8');
});
test('local mode and test mode never open router ports or contact DNS providers', async () => {
  const n = new MobileNetwork({ testMode: true, helper: () => assert.fail('network mutation'), fetcher: () => assert.fail('network request') });
  await n.start(config); await n.stop();
  await assert.rejects(n.inspect(config.host), /disabled during tests/);
  await assert.rejects(n.firewall(config), /disabled during tests/);
  const local = new MobileNetwork({ helper: () => assert.fail('mapping in local mode') });
  await local.start({ ...config, mode: 'local' }); await local.stop();
});
