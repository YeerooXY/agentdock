'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { settingsSummary } = require('../electron/mobile-settings.cjs');

function redactValue(value, secret) {
  if (typeof value === 'string') return value.replaceAll(secret, '[redacted]');
  if (Array.isArray(value)) return value.map(item => redactValue(item, secret));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, secret)]));
}
test('phone settings expose only configuration labels and shared instructions', () => {
  const value = settingsSummary({ keys: [{ id: 'sample', label: 'Sample key', key: 'SECRET', encrypted: 'PRIVATE' }], shared: {
    profiles: [{ id: 'api', name: 'API', protocol: 'responses', url: 'https://SECRET', keyId: 'PRIVATE' }],
    connections: [{ id: 'tool', name: 'Tool', enabled: true, envKeys: { TOKEN: 'SECRET' }, command: 'PRIVATE' }], instructions: 'Shared instructions',
  } });
  assert.deepEqual(value.keys, [{ name: 'Saved keys: 1' }]);
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
    'Connected', 'Needs setup', 'Failing', 'Connected', 'Not checked', 'Key missing', 'Failing', 'Off',
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
      redact: value => redactValue(value, 'plain-saved-value'),
      shared: { connections: [{ id: 'tool', name: 'Tool', enabled: true,
        command: 'npx', args: ['private-package'], envKeys: { VAULT_TOKEN: { key: 'saved-credential' } },
        status: { ok: false, error } }] } });
    assert.doesNotMatch(JSON.stringify(value), /alice|pass@example|short-secret|Private Folder|server\.exe|private\/server|server\\share|abc\.def|two word secret|another-secret|aBcDeFg|saved-credential|VAULT_TOKEN|plain-saved-value|private-package|Private entry/);
    assert.deepEqual(value.keys, [{ name: 'Saved keys: 1' }]);
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

test('ready integrations and configured connections without a hub result are not checked', () => {
  const value = settingsSummary({ capabilities, shared: { connections: [
    { id: 'unity', name: 'Unity', integration: 'unity', enabled: true, status: null },
    { id: 'custom', name: 'Custom tool', enabled: true, status: null },
  ] }, integrations: [{ id: 'unity', name: 'Unity', ready: true, enabled: true }] });
  assert.deepEqual(value.tools.map(x => x.status), ['Not checked', 'Not checked']);
  assert.match(value.tools[0].action, /test Unity\.$/);
  assert.match(value.tools[1].action, /test Custom tool\.$/);
});

test('common command and argument fragments leave names, requests and diagnostics intact', () => {
  const value = settingsSummary({ capabilities, shared: { connections: [{
    name: 'Unity mcp. Tools', enabled: true, command: 'unity', args: ['mcp', '-y', '.'],
    status: { ok: false, error: 'Unity mcp. Retry and/or check Add-ons/Preferences.' },
  }] }, setupRequests: [{ kind: 'tool', consoleName: 'Agent', config: { name: 'Unity mcp. Setup' } }] });
  assert.equal(value.tools[0].name, 'Unity mcp. Tools');
  assert.equal(value.tools[0].error, 'Unity mcp. Retry and/or check Add-ons/Preferences.');
  assert.equal(value.setupRequests[0].name, 'Unity mcp. Setup');
});

test('diagnostics redact Windows root paths, environment paths and comma or semicolon filenames', () => {
  for (const path of [
    String.raw`\Users\alice\private\x`,
    String.raw`%USERPROFILE%\AppData\private\x`,
    String.raw`C:\Users\Alice, Private\file`,
    String.raw`C:\Users\Alice; Private\file`,
    '/Users/Alice, Private/file',
    String.raw`(\Users\alice\private\x)`,
    String.raw`"C:\Users\Alice, Private\file"`,
  ]) {
    const value = settingsSummary({ capabilities, shared: { connections: [{
      name: 'Tool', status: { ok: false, error: `Failed at ${path}` },
    }] } });
    assert.match(value.tools[0].error, /\[redacted\]/);
    assert.doesNotMatch(value.tools[0].error, /Users|alice|Alice|Private|private|file|USERPROFILE|AppData/);
  }
});

test('key request names use the kind label for absent, defaulted or redacted names', () => {
  const value = settingsSummary({ capabilities, setupRequests: [
    { kind: 'key', consoleName: 'Agent', config: { id: 'private-key-id' } },
    { kind: 'key', consoleName: 'Agent', config: { id: 'private-key-id', name: 'private-key-id' } },
    { kind: 'key', consoleName: 'Agent', config: { id: 'private-key-id', name: 'Key private-key-id' } },
  ] });
  assert.deepEqual(value.setupRequests.map(x => x.name), ['Key entry', 'Key entry', 'Key entry']);
  assert.doesNotMatch(JSON.stringify(value), /private-key-id|\[redacted\]/);
});

test('keys expose only a count with or without tools.status, including zero saved keys', () => {
  for (const capabilityList of [[], capabilities]) {
    for (const keys of [[], [{ id: 'sk-secret-id', label: 'Secret label', value: 'Secret value' }]]) {
      const value = settingsSummary({ capabilities: capabilityList, keys });
      assert.deepEqual(value.keys, [{ name: `Saved keys: ${keys.length}` }]);
      assert.doesNotMatch(JSON.stringify(value), /sk-secret-id|Secret label|Secret value/);
    }
  }
});

test('ready integration connection failures and unconfigured Meshy retain their status', () => {
  const value = settingsSummary({ capabilities, shared: { connections: [{
    id: 'blender', integration: 'blender', enabled: true, status: { ok: false, error: 'Connection refused' },
  }] }, integrations: [
    { id: 'blender', name: 'Blender', ready: true },
    { id: 'meshy', name: 'Meshy', ready: false, keyId: '' },
  ] });
  assert.equal(value.tools[0].status, 'Failing');
  assert.equal(value.tools[0].error, 'Connection refused');
  assert.equal(value.tools[1].status, 'Key missing');
  assert.match(value.tools[1].action, /paste the key/);
});

test('one redaction pass covers tool names, job messages and setup requests', () => {
  let calls = 0;
  const value = settingsSummary({ capabilities,
    redact: fields => { calls++; return redactValue(fields, 'vault-value'); },
    integrations: [{ id: 'rea', name: 'REA vault-value', ready: false,
      job: { busy: false, message: 'Setup failed with vault-value' } }],
    shared: { connections: [{ name: 'Tool vault-value', status: { ok: false, error: 'Denied vault-value' } }] },
    setupRequests: [{ kind: 'tool', consoleName: 'Agent vault-value', config: { name: 'Request vault-value' } }],
  });
  assert.equal(calls, 1);
  assert.equal(value.tools[0].error, 'Setup failed with [redacted]');
  assert.equal(value.tools[1].error, 'Denied [redacted]');
  assert.equal(value.setupRequests[0].name, 'Tool connection');
  assert.doesNotMatch(JSON.stringify(value), /vault-value/);
});
