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
  const actions = [];
  const n = new MobileNetwork({ platform: 'win32', helper: async (_, action) => { actions.push(action); return { firewall: 'missing' }; }, fetcher: () => assert.fail('network request') });
  await n.start({ ...config, mode: 'tailscale' }); await n.stop();
  await n.start({ ...config, mode: 'local' }); await n.stop();
  assert.deepEqual(actions, ['firewall-status', 'firewall-status']);
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
  const local = new MobileNetwork({ platform: 'linux', helper: () => assert.fail('Windows helper on Linux') });
  await local.start({ ...config, mode: 'local' }); await local.stop();
});

test('a saved Windows rule is detected after restart without approval or recreation', async () => {
  const actions = [];
  const helper = async (_, action, settings) => {
    actions.push(action); assert.deepEqual(settings, config);
    return { firewall: 'allowed', firewallRulePresent: true };
  };
  const first = new MobileNetwork({ platform: 'win32', helper });
  await first.start(config); assert.equal(first.snapshot().firewall, 'allowed'); await first.stop();
  const restarted = new MobileNetwork({ platform: 'win32', helper });
  await restarted.start(config);
  assert.equal(restarted.snapshot().firewall, 'allowed'); assert.ok(restarted.snapshot().firewallCheckedAt);
  await restarted.firewall(config);
  assert.deepEqual(actions, ['firewall-status', 'firewall-status', 'firewall-status']);
});

test('only an explicit repair changes a missing or outdated rule, with the same scope', async () => {
  for (const initial of ['missing', 'outdated']) {
    const actions = [];
    const n = new MobileNetwork({ platform: 'win32', program: 'C:\\Paddock\\Paddock.exe', helper: async (_, action, settings, options) => {
      actions.push(action); assert.deepEqual(settings, config); assert.equal(options.program, 'C:\\Paddock\\Paddock.exe');
      return { firewall: action === 'firewall' ? 'allowed' : initial, firewallRulePresent: action === 'firewall' || initial === 'outdated' };
    } });
    await n.start(config); assert.equal(n.snapshot().firewall, initial); assert.deepEqual(actions, ['firewall-status']);
    await n.firewall(config); assert.equal(n.snapshot().firewall, 'allowed');
    assert.deepEqual(actions, ['firewall-status', 'firewall-status', 'firewall']);
  }
});

test('failed checks stay unknown and cancelled approval never reports success', async () => {
  const actions = []; let readable = false;
  const n = new MobileNetwork({ platform: 'win32', helper: async (_, action) => {
    actions.push(action);
    if (!readable) throw new Error('Cannot read Windows rules');
    if (action === 'firewall') throw new Error('Windows Firewall was not changed.');
    return { firewall: 'outdated', firewallRulePresent: true };
  } });
  await n.start(config);
  assert.equal(n.snapshot().firewall, 'unknown'); assert.match(n.snapshot().firewallError, /Cannot read/);
  assert.deepEqual(actions, ['firewall-status']);
  readable = true; await assert.rejects(n.firewall(config), /not changed/);
  assert.equal(n.snapshot().firewall, 'unknown');
  assert.equal((await n.checkFirewall(config)).firewall, 'outdated');
});

test('concurrent checks coalesce and old addresses cannot overwrite current status', async () => {
  const pending = [];
  const n = new MobileNetwork({ platform: 'win32', helper: (_, action, settings) => new Promise(resolve => pending.push({ action, settings, resolve })) });
  const first = n.checkFirewall(config), same = n.checkFirewall(config);
  assert.equal(first, same); assert.equal(n.snapshot().firewall, 'checking');
  await Promise.resolve(); assert.equal(pending.length, 1);
  n.resetFirewall();
  const changed = { ...config, host: '100.64.0.5' }, second = n.checkFirewall(changed);
  await Promise.resolve();
  pending[1].resolve({ firewall: 'missing', firewallRulePresent: false }); await second;
  pending[0].resolve({ firewall: 'allowed', firewallRulePresent: true }); await first;
  assert.equal(n.snapshot().firewall, 'missing'); assert.equal(n.snapshot().firewallRulePresent, false);
});

test('a connection change during a preflight check cancels the obsolete repair', async () => {
  let finish;
  const n = new MobileNetwork({ platform: 'win32', helper: (_, action) => {
    assert.equal(action, 'firewall-status'); return new Promise(resolve => { finish = resolve; });
  } });
  const repair = n.firewall(config); await Promise.resolve();
  n.resetFirewall(); finish({ firewall: 'missing' });
  await assert.rejects(repair, /connection changed/);
  assert.equal(n.snapshot().firewall, 'unknown');
});

test('removal is verified and an unverified helper response is never shown as configured', async () => {
  let response = { firewall: 'allowed', firewallRulePresent: true };
  const n = new MobileNetwork({ platform: 'win32', helper: async (_, action) => action === 'firewall-remove' ? { firewall: 'missing', firewallRulePresent: false } : response });
  assert.equal((await n.firewall(config, true)).firewall, 'missing');
  response = { firewall: true };
  assert.equal((await n.checkFirewall(config)).firewall, 'unknown');
  assert.match(n.snapshot().firewallError, /could not confirm/);
});
