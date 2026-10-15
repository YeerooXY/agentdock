'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Sessions } = require('../electron/sessions.cjs');
const { Workspace } = require('../electron/workspace.cjs');
const { atomicJson } = require('../electron/storage.cjs');
const parent = path.resolve(__dirname, '..', 'test-data');
fs.mkdirSync(parent, { recursive: true });
const key = crypto.randomBytes(32);
const storage = {
  isEncryptionAvailable: () => true,
  encryptString(value) { const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); },
  decryptString(value) { const cipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); cipher.setAuthTag(value.subarray(12, 28)); return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString('utf8'); }
};
function fixture(t, existingRoot, options = {}) {
  const root = existingRoot || fs.mkdtempSync(path.join(parent, 'restore-'));
  const calls = [], errors = [];
  const sessions = new Sessions(root, {
    nativeCodex: () => 'C:\\Programs\\codex.exe', findProgram: name => name === 'claude' ? 'C:\\Programs\\claude.exe' : process.execPath,
    claude: options.claude,
    pty: { spawn(executable, args, config) {
      const terminal = { onData(fn) { this.data = fn; }, onExit(fn) { this.exit = fn; }, kill() { this.exit({ exitCode: 0 }); }, write(data) { throw new Error('Restoration must not replay input: ' + data); } };
      calls.push({ executable, args, config, terminal }); return terminal;
    } }
  });
  const workspace = new Workspace(root, sessions, options.storage || storage, { enabled: options.enabled ?? true, onError: message => { if (message) errors.push(message); } });
  t.after(() => { workspace.frozen = true; clearTimeout(workspace.timer); });
  if (!existingRoot) t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(parent)); fs.rmSync(root, { recursive: true, force: true }); });
  const saved = () => JSON.parse(storage.decryptString(Buffer.from(JSON.parse(fs.readFileSync(workspace.file, 'utf8')).encrypted, 'base64')));
  return { root, sessions, workspace, calls, errors, saved };
}

test('restores nine slots, folders, names and exact agent conversations without replaying input', async t => {
  const first = fixture(t), ids = [];
  for (let slot = 1; slot <= 9; slot++) {
    const provider = slot < 4 ? 'codex' : slot < 6 ? 'claude' : slot === 9 ? 'custom' : 'shell';
    const created = await first.sessions.create({ slot, provider, name: `Project ${slot}`, cwd: first.root, permissions: slot === 1 ? 'unrestricted' : 'default', command: 'Write-Output PRIVATE_COMMAND', model: provider === 'codex' ? 'test-model' : provider === 'claude' ? 'sonnet' : '' });
    if (['codex', 'claude'].includes(provider)) {
      const thread = crypto.randomUUID(); ids.push(thread);
      atomicJson(path.join(first.root, 'events', `${created.id}.state.json`), { session: created.id, providerSessionId: thread, state: 'active', at: Date.now() });
    }
  }
  first.workspace.freeze(); await first.sessions.stop();
  assert.equal(first.saved().length, 9, 'shutdown must not save the now-ended process list');
  assert.ok(!fs.readFileSync(first.workspace.file, 'utf8').includes('PRIVATE_COMMAND'));
  const second = fixture(t, first.root);
  await second.workspace.restore(); await second.workspace.restore();
  assert.equal(second.calls.length, 9, 'startup restoration runs once');
  assert.deepEqual(second.sessions.list().map(x => [x.slot, x.name, x.cwd]), Array.from({ length: 9 }, (_, i) => [i + 1, `Project ${i + 1}`, first.root]));
  assert.deepEqual(second.calls.slice(0, 3).map(x => x.args.slice(0, 2)), ids.slice(0, 3).map(id => ['resume', id]));
  for (let index = 3; index < 5; index++) assert.equal(second.calls[index].args[second.calls[index].args.indexOf('--resume') + 1], ids[index]);
  assert.ok(second.calls[0].args.includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.ok(!second.calls[1].args.includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.ok(second.calls.every(x => !x.args.includes('--last') && !x.args.includes('--continue')));
  assert.ok(second.sessions.list().every(x => x.state === 'open'), 'old thinking/ready statuses are not shown as live');
  assert.deepEqual(second.sessions.list().map(x => x.launchModel), ['test-model', 'test-model', 'test-model', 'sonnet', 'sonnet', '', '', '', '']);
  for (let index = 0; index < 5; index++) assert.equal(second.calls[index].args[second.calls[index].args.indexOf('--model') + 1], index < 3 ? 'test-model' : 'sonnet');
  assert.ok(!JSON.stringify(second.sessions.list()).includes('PRIVATE_COMMAND'));
  assert.deepEqual(second.errors, []);
});

test('ending a panel removes it from the saved workspace; a crash keeps the other panels', async t => {
  const first = fixture(t);
  const one = await first.sessions.create({ slot: 2, provider: 'shell', cwd: first.root });
  await first.sessions.create({ slot: 8, provider: 'shell', cwd: first.root });
  first.workspace.save(); first.sessions.end(one.id); first.workspace.save();
  const second = fixture(t, first.root); await second.workspace.restore();
  assert.deepEqual(second.sessions.list().map(x => x.slot), [8]);
  assert.deepEqual(second.errors, []);
});

test('renaming preserves the live process and conversation, and the saved title reopens', async t => {
  const first = fixture(t), thread = crypto.randomUUID();
  const created = await first.sessions.create({ slot: 4, provider: 'codex', cwd: first.root }, { resumeId: thread });
  const terminal = first.sessions.items.get(created.id).terminal;
  first.sessions.rename(created.id, 'Robonslaught');
  assert.equal(first.sessions.items.get(created.id).terminal, terminal);
  assert.equal(first.sessions.list()[0].alive, true);
  assert.equal(first.calls.length, 1);
  first.workspace.freeze();
  const second = fixture(t, first.root); await second.workspace.restore();
  assert.equal(second.sessions.list()[0].name, 'Robonslaught');
  assert.equal(second.sessions.list()[0].providerSessionId, thread);
  second.sessions.rename(second.sessions.list()[0].id, '');
  assert.equal(second.sessions.list()[0].name, path.basename(first.root));
});

test('turning restoration off deletes the save and leaves current terminals running', async t => {
  const first = fixture(t);
  await first.sessions.create({ provider: 'shell', cwd: first.root }); first.workspace.save();
  first.workspace.setEnabled(false);
  assert.equal(fs.existsSync(first.workspace.file), false);
  assert.equal(first.sessions.list()[0].alive, true);
  first.workspace.freeze();
  const disabled = fixture(t, first.root, { enabled: false }); await disabled.workspace.restore();
  assert.equal(disabled.calls.length, 0);
});

test('missing project folders stay in their panel for retry while other panels reopen', async t => {
  const first = fixture(t), project = path.join(first.root, 'moved-project'); fs.mkdirSync(project);
  await first.sessions.create({ slot: 3, provider: 'shell', cwd: project });
  await first.sessions.create({ slot: 7, provider: 'shell', cwd: first.root }); first.workspace.freeze();
  fs.rmdirSync(project);
  const second = fixture(t, first.root); await second.workspace.restore();
  const failed = second.sessions.list().find(x => x.slot === 3);
  assert.match(failed.restoreError, /existing project folder/);
  assert.equal(second.sessions.list().find(x => x.slot === 7).alive, true);
  assert.equal(second.saved().length, 2);
  await assert.rejects(() => second.sessions.create({ slot: 3, provider: 'shell', cwd: first.root }), /already open/);
  fs.mkdirSync(project);
  const retried = await second.sessions.retry(failed.id);
  assert.equal(retried.alive, true); assert.equal(retried.slot, 3);
  assert.equal(second.sessions.list().length, 2);
});

test('damaged saves and unavailable encryption are preserved without plaintext fallback', async t => {
  const first = fixture(t);
  fs.writeFileSync(first.workspace.file, 'broken-json');
  await first.workspace.restore();
  await first.sessions.create({ provider: 'shell', cwd: first.root }); first.workspace.save();
  assert.equal(fs.readFileSync(first.workspace.file, 'utf8'), 'broken-json');
  assert.match(first.errors[0], /saved workspace was kept/);
  first.workspace.setEnabled(false); first.workspace.setEnabled(true);
  assert.equal(first.saved().length, 1);
  const unavailable = fixture(t, undefined, { storage: { isEncryptionAvailable: () => false } });
  await unavailable.sessions.create({ provider: 'shell', cwd: unavailable.root }); unavailable.workspace.save();
  assert.equal(fs.existsSync(unavailable.workspace.file), false); assert.match(unavailable.errors[0], /encryption/);
});

test('WSL Claude resumes through its original distribution even after a native install appears', async t => {
  const first = fixture(t, undefined, { claude: { kind: 'wsl', distro: 'Ubuntu', path: '/home/test/.local/bin/claude' } });
  const created = await first.sessions.create({ provider: 'claude', cwd: first.root });
  const thread = crypto.randomUUID(); first.sessions.items.get(created.id).providerSessionId = thread; first.workspace.freeze();
  const second = fixture(t, first.root, { claude: { kind: 'native', path: 'C:\\New\\claude.exe' } });
  await second.workspace.restore();
  assert.equal(second.calls[0].executable, 'wsl.exe');
  assert.deepEqual(second.calls[0].args.slice(0, 2), ['-d', 'Ubuntu']);
  assert.equal(second.calls[0].args[second.calls[0].args.indexOf('--resume') + 1], thread);
});

test('a CLI failing to reopen a saved chat keeps the saved panel and conversation ID', async t => {
  const first = fixture(t), thread = crypto.randomUUID();
  await first.sessions.restore({ slot: 1, provider: 'codex', name: 'Chat', cwd: first.root, permissions: 'default', providerSessionId: thread });
  first.calls[0].terminal.data('Conversation could not be found');
  first.calls[0].terminal.exit({ exitCode: 1 }); first.workspace.save();
  assert.ok(first.sessions.list()[0].restoreError);
  assert.equal(first.saved()[0].providerSessionId, thread);
  first.sessions.end(first.sessions.list()[0].id); first.workspace.save();
  assert.deepEqual(first.saved(), []);
});
