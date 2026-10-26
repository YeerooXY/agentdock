'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const powershell = process.platform === 'win32' ? 'powershell.exe' : process.env.PADDOCK_TEST_PWSH;

test('the real PowerShell helper checks scope and never elevates for status or an existing rule', { skip: !powershell }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-firewall-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = path.join(root, 'rule.json');
  const allowed = {
    rule: { Name: 'AgentDock-Mobile-00000000-0000-4000-8000-000000000000', Enabled: 'True', Direction: 'Inbound', Action: 'Allow', Profile: 'Any' },
    application: { Program: process.execPath }, ports: { Protocol: 'TCP', LocalPort: ['47831'], RemotePort: ['Any'] },
    addresses: { LocalAddress: ['100.64.0.5'], RemoteAddress: ['100.64.0.0/10'] }, adapter: { InterfaceAlias: ['Tailscale'] }
  };
  function run(data, action = 'firewall-status') {
    fs.writeFileSync(fixture, JSON.stringify(data));
    const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'fixtures/firewall-helper.ps1'), '-Fixture', fixture, '-Program', process.execPath, '-Action', action], { encoding: 'utf8', timeout: 15000 });
    assert.ifError(result.error); assert.equal(result.stderr.trim(), '');
    return JSON.parse(result.stdout.trim());
  }
  assert.equal(run(allowed).firewall, 'allowed');
  assert.equal(run(allowed, 'firewall').firewall, 'allowed', 'Already configured must not elevate or recreate');
  assert.equal(run({ ...allowed, rule: null }).firewall, 'missing');
  assert.equal(run({ ...allowed, rule: null }, 'firewall-remove').firewall, 'missing');
  for (const [section, field, value] of [
    ['rule', 'Enabled', 'False'], ['rule', 'Action', 'Block'], ['rule', 'Profile', 'Private'],
    ['application', 'Program', 'C:\\Old\\Paddock.exe'], ['ports', 'LocalPort', ['47832']], ['ports', 'Protocol', 'UDP'],
    ['addresses', 'LocalAddress', ['100.64.0.6']], ['addresses', 'RemoteAddress', ['Any']], ['adapter', 'InterfaceAlias', ['Wi-Fi']]
  ]) {
    const changed = structuredClone(allowed); changed[section][field] = value;
    assert.equal(run(changed).firewall, 'outdated', `${section}.${field}`);
  }
  const normalized = structuredClone(allowed);
  normalized.addresses.LocalAddress = ['100.64.0.5/255.255.255.255'];
  normalized.addresses.RemoteAddress = ['100.64.0.0/255.192.0.0']; normalized.ports.Protocol = '6';
  assert.equal(run(normalized).firewall, 'allowed');
  const failed = run({ ...allowed, error: true });
  assert.equal(failed.ok, false); assert.match(failed.error, /could not read/);
});
