'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isPrivate, isPublic, publicHost, internetOptions, networkRelation } = require('../electron/mobile-address.cjs');
const { MobileNetwork } = require('../electron/mobile-network.cjs');
const config = { host: '192.168.1.10', port: 47831, externalPort: 47831, mode: 'internet', publicHost: 'dock-test.duckdns.org', routerMode: 'automatic', mappingId: '00000000-0000-4000-8000-000000000000' };
test('public connections require explicit mode and a routable address', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.1.1', '100.64.0.1']) { assert.ok(isPrivate(ip)); assert.ok(!isPublic(ip)); assert.throws(() => publicHost(ip)); }
  assert.equal(isPrivate('192.168.evil'), false);
  for (const ip of ['256.0.0.1', '169.254.169.254', '0.0.0.0', '224.0.0.1', '198.51.100.1', '203.0.113.1', '::1']) { assert.ok(!isPublic(ip)); assert.throws(() => publicHost(ip)); }
  for (const host of ['https://host.com', 'host.com:1234', 'user@host.com', 'host.local', '-host.com', 'host.com/path', 'host..com']) assert.throws(() => publicHost(host));
  assert.equal(publicHost(' Example.COM '), 'example.com'); assert.equal(publicHost('8.8.8.8'), '8.8.8.8');
  assert.equal(internetOptions({ publicHost: '8.8.8.8' }).mode, 'local');
  assert.throws(() => internetOptions({ ...config, mode: 'anything' }));
  assert.throws(() => internetOptions({ ...config, externalPort: 443 }));
  assert.throws(() => internetOptions({ ...config, publicHost: 'other.com', duckKeyId: 'duckdns' }));
  assert.equal(internetOptions({ ...config, duckKeyId: 'duckdns' }).duckKeyId, 'duckdns');
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
test('mapping cleanup waits for startup and removes only the mapping tracked by Dock', async () => {
  const calls = []; let unblock;
  const started = new Promise(resolve => { unblock = resolve; });
  const n = new MobileNetwork({ helper: async (_, action) => { calls.push(action); if (action === 'map') await started; return {}; } });
  const starting = n.start(config), stopping = n.stop(); unblock();
  await Promise.all([starting, stopping]);
  assert.deepEqual(calls, ['map', 'unmap']); assert.equal(n.snapshot().mapped, false); assert.equal(n.timer, null);
  calls.length = 0; await n.start({ ...config, routerMode: 'manual' }); await n.stop(); assert.deepEqual(calls, []);
});
test('Duck DNS reads the bound vault key, refuses redirects and keeps errors free of credentials', async () => {
  const secret = '12345678-1234-4234-8234-123456789012', calls = [];
  const n = new MobileNetwork({ getKey: id => { assert.equal(id, 'ddns'); return secret; }, helper: async () => ({}), fetcher: async (url, opts) => { calls.push({ url: new URL(url), opts }); return new Response('OK'); } });
  await n.start({ ...config, routerMode: 'manual', duckKeyId: 'ddns' }); await n.stop();
  assert.equal(calls.length, 1); assert.equal(calls[0].url.hostname, 'www.duckdns.org'); assert.equal(calls[0].url.searchParams.get('domains'), 'dock-test'); assert.equal(calls[0].url.searchParams.get('token'), secret); assert.equal(calls[0].opts.redirect, 'error');
  assert.ok(!JSON.stringify(n.snapshot()).includes(secret));
  n.fetcher = async () => { throw Error('https://example.invalid/?token=' + secret); };
  await n.start({ ...config, routerMode: 'manual', duckKeyId: 'ddns' }); await n.stop();
  assert.match(n.snapshot().dnsError, /Duck DNS could not/); assert.ok(!JSON.stringify(n.snapshot()).includes(secret));
});
test('local mode and test mode never open router ports or contact DNS providers', async () => {
  const n = new MobileNetwork({ testMode: true, helper: () => assert.fail('network mutation'), fetcher: () => assert.fail('network request') });
  await n.start(config); await n.stop();
  await assert.rejects(n.inspect(config.host), /disabled during tests/);
  await assert.rejects(n.firewall(config), /disabled during tests/);
  const local = new MobileNetwork({ helper: () => assert.fail('mapping in local mode') });
  await local.start({ ...config, mode: 'local' }); await local.stop();
});
