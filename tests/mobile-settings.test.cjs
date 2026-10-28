'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settingsSummary } = require('../electron/mobile-settings.cjs');
test('phone settings expose only configuration labels and shared instructions', () => {
  const value = settingsSummary({ keys: [{ id: 'sample', label: 'Sample key', key: 'SECRET', encrypted: 'PRIVATE' }], shared: {
    profiles: [{ id: 'api', name: 'API', protocol: 'responses', url: 'https://SECRET', keyId: 'PRIVATE' }],
    connections: [{ id: 'tool', name: 'Tool', enabled: true, envKeys: { TOKEN: 'SECRET' }, command: 'PRIVATE' }], instructions: 'Shared instructions',
  } });
  assert.deepEqual(value.keys, [{ id: 'sample', name: 'Sample key' }]);
  assert.deepEqual(value.apis, [{ id: 'api', name: 'API', protocol: 'responses' }]);
  assert.deepEqual(value.tools, [{ id: 'tool', name: 'Tool', enabled: true }]);
  assert.equal(value.instructions, 'Shared instructions');
  assert.doesNotMatch(JSON.stringify(value), /SECRET|PRIVATE/);
});

const capabilities = ['tools.status'];

test('tool status uses connection results, missing bindings and integration readiness', () => {
  const value = settingsSummary({ capabilities, keys: [{ id: 'saved' }], shared: { connections: [
    { id: 'connected', name: 'Connected tool', enabled: true, status: { ok: true } },
    { id: 'setup', name: 'New tool', enabled: true },
    { id: 'key', name: 'Key tool', enabled: true, headerKeys: { Authorization: { key: 'absent' } } },
    { id: 'failing', name: 'Failing tool', enabled: true, status: { ok: false, error: 'Connection refused' } },
    { id: 'off', name: 'Off tool', enabled: false, status: { ok: true } },
    { id: 'blender', name: 'Blender', integration: 'blender', enabled: true, status: { ok: true } },
  ] }, integrations: [
    { id: 'blender', name: 'Blender', ready: true, enabled: true },
    { id: 'unity', name: 'Unity', ready: false, enabled: true },
    { id: 'rea', name: 'REA', ready: false, job: { busy: false, message: 'Setup failed' } },
  ] });
  assert.deepEqual(value.tools.map(x => x.status), [
    'Connected', 'Needs setup', 'Failing', 'Connected', 'Needs setup', 'Key missing', 'Failing', 'Off',
  ]);
  assert.equal(value.tools.filter(x => x.name === 'Blender').length, 1);
  assert.equal(value.tools.find(x => x.name === 'Failing tool').error, 'Connection refused');
  assert.equal(value.tools.find(x => x.name === 'Off tool').enabled, false);
  for (const tool of value.tools) assert.match(tool.action, /^On your PC: Open Settings → Tools/);
  assert.match(value.tools.find(x => x.name === 'Key tool').action, /paste the key/);
});

test('Meshy missing key takes precedence over readiness; pending setup is not connected', () => {
  const input = { capabilities, shared: { connections: [
    { id: 'mesh', name: 'Meshy', integration: 'meshy', enabled: true, envKeys: { MESHY_API_KEY: { key: 'missing' } } },
    { id: 'blend', name: 'Blender', integration: 'blender', enabled: true, status: { ok: true } },
  ] }, integrations: [
    { id: 'meshy', name: 'Meshy', ready: false, keyId: 'missing' },
    { id: 'blender', name: 'Blender', ready: false, job: { busy: true, message: 'Installing' } },
  ] };
  assert.deepEqual(settingsSummary(input).tools.map(x => x.status), ['Key missing', 'Needs setup']);
  input.shared.connections[0].enabled = false;
  assert.equal(settingsSummary(input).tools[0].status, 'Off');
});

test('diagnostics remove credentials, paths, environment names and command lines before trimming', () => {
  const diagnostics = [
    'Denied: https://alice:pass@example.com/mcp?token=short-secret',
    'Failed at C:\\Users\\Alice\\Private Folder\\server.exe',
    'Failed at /Users/alice/private/server',
    'Failed at \\\\server\\share\\private',
    'Denied: Bearer abc.def.ghi',
    'Denied: token=short-secret password="two word secret" api_key=another-secret',
    'Denied: sk-short-secret github_pat_short-secret ghp_short-secret',
    'Denied: aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789',
    'Denied: saved-credential VAULT_TOKEN plain-saved-value',
    'command: npx private-package --key short-secret',
    'spawn npx private-package --key short-secret',
  ];
  for (const error of diagnostics) {
    const value = settingsSummary({ capabilities, keys: [{ id: 'saved-credential', label: 'Private entry' }],
      redact: text => text.replaceAll('plain-saved-value', '[redacted]'),
      shared: { connections: [{ id: 'tool', name: 'Tool', enabled: true,
        command: 'npx', args: ['private-package'], envKeys: { VAULT_TOKEN: { key: 'saved-credential' } },
        status: { ok: false, error } }] } });
    assert.doesNotMatch(JSON.stringify(value), /alice|pass@example|short-secret|Private Folder|server\.exe|private\/server|server\\share|abc\.def|two word secret|another-secret|aBcDeFg|saved-credential|VAULT_TOKEN|plain-saved-value|private-package|Private entry/);
    assert.deepEqual(value.keys, []);
    assert.ok(value.tools[0].error.length <= 200);
    assert.deepEqual(Object.keys(value.tools[0]), ['name', 'enabled', 'status', 'error', 'action']);
  }
  const value = settingsSummary({ capabilities, shared: { connections: [{ name: 'Tool', status: { ok: false, error: 'x'.repeat(190) + ' token=short-secret ' + 'tail '.repeat(50) } }] } });
  assert.ok(value.tools[0].error.length <= 200);
  assert.doesNotMatch(value.tools[0].error, /short-secret/);
  const longError = 'Connection refused. '.repeat(20);
  const trimmed = settingsSummary({ capabilities, shared: { connections: [{ name: 'Tool', status: { ok: false, error: longError } }] } });
  assert.equal(trimmed.tools[0].error, longError.trim().slice(0, 200));
});

test('setup requests expose who asked for what without request configs or vault IDs', () => {
  const setupRequests = ['tool', 'api', 'key', 'image'].map(kind => ({
    id: 'private-request', kind, consoleName: 'Agent Ada', config: {
      id: 'private-id', name: 'Requested service', keyId: 'private-vault-id',
      url: 'https://alice:secret@private.example', command: 'private-command',
      args: ['private-argument'], envKeys: { PRIVATE_ENV: { key: 'private-vault-id' } },
    },
  }));
  const value = settingsSummary({ capabilities, setupRequests });
  assert.equal(value.setupRequests.length, 4);
  assert.deepEqual(value.setupRequests.map(x => x.kind), ['Tool connection', 'Model API', 'Key entry', 'Image generator']);
  assert.equal(value.setupRequests[0].agent, 'Agent Ada');
  assert.equal(value.setupRequests[0].name, 'Requested service');
  assert.match(value.setupRequests[2].action, /paste the key on the request card/);
  assert.doesNotMatch(JSON.stringify(value), /private-|PRIVATE_ENV|secret@/);
});

test('hosts without tools.status retain the old summary and omit status and setup requests', () => {
  const input = { shared: { connections: [{ id: 'one', name: 'One', enabled: true, status: { ok: false, error: 'Hidden' } }] },
    integrations: [{ id: 'unity', name: 'Unity' }], setupRequests: [{ kind: 'key', consoleName: 'Agent' }] };
  for (const capabilityList of [[], ['unrelated']]) {
    const value = settingsSummary({ ...input, capabilities: capabilityList });
    assert.deepEqual(value.tools, [{ id: 'one', name: 'One', enabled: true }]);
    assert.equal(value.setupRequests, undefined);
    assert.doesNotMatch(JSON.stringify(value), /Hidden|Unity|Agent/);
  }
});
