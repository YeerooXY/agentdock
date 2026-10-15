'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Sessions } = require('../electron/sessions.cjs');
const parent = path.resolve(__dirname, '..', 'test-data');
fs.mkdirSync(parent, { recursive: true });
const root = fs.mkdtempSync(path.join(parent, 'permissions-'));
after(() => { assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(parent)); fs.rmSync(root, { recursive: true }); });
function fixture(claude = 'C:\\Apps With Spaces\\claude.exe') {
  const calls = [];
  const sessions = new Sessions(root, {
    pty: { spawn(executable, args, options) { calls.push({ executable, args, options }); return { onData() {}, onExit() {}, kill() {} }; } },
    nativeCodex: () => 'C:\\Apps With Spaces\\codex.exe',
    findProgram: name => name === 'claude' ? claude : 'C:\\Program Files\\nodejs\\node.exe'
  });
  return { sessions, calls };
}

test('unrestricted Codex launch disables approvals/sandbox and keeps its completion callback', async () => {
  const { sessions, calls } = fixture();
  const session = await sessions.create({ provider: 'codex', cwd: root, permissions: 'unrestricted' });
  assert.equal(session.permissions, 'unrestricted');
  assert.equal(calls[0].executable, 'C:\\Apps With Spaces\\codex.exe');
  assert.ok(calls[0].args.includes('--dangerously-bypass-approvals-and-sandbox'));
  const notification = calls[0].args[calls[0].args.indexOf('-c') + 1];
  assert.equal(JSON.parse(notification.slice('notify='.length))[2], 'codex-notify');
  assert.equal(calls[0].options.cwd, root);
});

test('agent default mode preserves the existing CLI permission configuration', async () => {
  const { sessions, calls } = fixture();
  for (const provider of ['codex', 'claude']) {
    const session = await sessions.create({ provider, cwd: root, permissions: 'default' });
    assert.equal(session.permissions, 'default');
  }
  for (const call of calls) assert.ok(!call.args.some(x => /dangerously|permission-mode|sandbox_mode|approval_policy/.test(x)));
});

test('unrestricted Claude works with native executable and PowerShell wrapper paths', async () => {
  for (const executable of ['C:\\Apps With Spaces\\claude.exe', "C:\\User's Apps\\claude.cmd"]) {
    const { sessions, calls } = fixture(executable);
    const session = await sessions.create({ provider: 'claude', cwd: root, permissions: 'unrestricted' });
    assert.equal(session.permissions, 'unrestricted');
    assert.match(calls[0].args.join(' '), /--dangerously-skip-permissions/);
    assert.match(calls[0].args.join(' '), /--settings/);
    const settings = JSON.parse(fs.readFileSync(path.join(root, 'sessions', session.id, 'claude-settings.json'), 'utf8'));
    assert.ok(settings.hooks.Stop); assert.ok(settings.statusLine);
    if (executable.endsWith('.cmd')) assert.match(calls[0].args.at(-1), /User''s Apps/);
    else assert.equal(calls[0].executable, executable);
  }
});

test('permission flags are not injected into shell or custom commands', async () => {
  const { sessions, calls } = fixture();
  for (const provider of ['shell', 'custom']) {
    const session = await sessions.create({ provider, cwd: root, command: "Write-Output 'TEST_ONLY'", permissions: 'unrestricted' });
    assert.equal(session.permissions, 'system');
  }
  for (const call of calls) assert.ok(!call.args.some(x => /dangerously/.test(x)));
  const args = calls[1].args;
  assert.equal(Buffer.from(args[args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le'), "Write-Output 'TEST_ONLY'");
});

test('unknown permission values are rejected before starting a process', async () => {
  const { sessions, calls } = fixture();
  await assert.rejects(() => sessions.create({ provider: 'codex', cwd: root, permissions: 'unlimited-admin' }), /supported agent permission mode/);
  assert.equal(calls.length, 0);
});

test('model overrides apply only to the requested console and never to the next launch', async () => {
  const { sessions, calls } = fixture();
  for (const [provider, model] of [['codex', 'test-codex-model'], ['claude', 'sonnet[1m]']]) {
    const custom = await sessions.create({ provider, cwd: root, model, permissions: 'unrestricted' });
    const plain = await sessions.create({ provider, cwd: root });
    assert.equal(custom.launchModel, model); assert.equal(plain.launchModel, '');
    const [chosen, defaults] = calls.slice(-2);
    assert.equal(chosen.args[chosen.args.indexOf('--model') + 1], model);
    assert.ok(!defaults.args.includes('--model'));
  }
});

test('invalid model overrides are rejected before starting a process', async () => {
  const { sessions, calls } = fixture();
  for (const model of ['--help', 'model\ncommand', 'model;exit', 'x'.repeat(201)]) {
    await assert.rejects(() => sessions.create({ provider: 'codex', cwd: root, model }), /model name or alias/);
  }
  assert.equal(calls.length, 0);
});
