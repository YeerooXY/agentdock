'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { SshHosts, validateHost, remoteCommand, quote } = require('../electron/ssh-hosts.cjs');
const { Sessions } = require('../electron/sessions.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-ssh-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const key = Buffer.alloc(64, 42).toString('base64'), calls = [];
  const ssh = new SshHosts(root, { find: id => id, exec: async (program, args, options) => {
    calls.push({ program, args, options });
    return { stdout: program === 'ssh-keyscan' ? `127.0.0.1 ssh-ed25519 ${key}\n` : 'DOCK-LINUX\nLinux\nDOCK-TMUX\nDOCK-AGENT:codex\n' };
  } });
  const raw = { name: 'Linux VM', host: '127.0.0.1', port: 2222, user: 'tester', folder: "/home/tester's project" };
  return { root, ssh, raw, calls };
}
test('SSH requires explicit fingerprint verification, expires probes and rejects arbitrary destinations', async t => {
  const { ssh, raw } = fixture(t), scan = await ssh.scan(raw);
  assert.equal(ssh.list().length, 0);
  assert.throws(() => ssh.approve({ probeId: scan.probeId, fingerprint: scan.fingerprint }), /verify/);
  assert.throws(() => ssh.approve({ probeId: scan.probeId, fingerprint: 'wrong', verified: true }), /verify/);
  ssh.approve({ probeId: scan.probeId, fingerprint: scan.fingerprint, verified: true });
  assert.equal(ssh.list().length, 1); assert.equal(ssh.list()[0].key, undefined);
  const expired = await ssh.scan(raw); ssh.pending.get(expired.probeId).expires = 0;
  assert.throws(() => ssh.approve({ ...expired, verified: true }), /Scan/);
  for (const host of ['-oProxyCommand=calc', 'host;id', 'user@host', 'host\nx', 'https://vm', '$(id)']) assert.throws(() => validateHost({ ...raw, host }));
  for (const user of ['root -oProxyCommand=x', 'user;id', '$(id)', 'user\n']) assert.throws(() => validateHost({ ...raw, user }));
  assert.throws(() => validateHost({ ...raw, folder: 'relative/path' }));
});
test('SSH pinning and quoting preserve spaces without local hooks or forwarding', async t => {
  const { ssh, raw, calls } = fixture(t), scan = await ssh.scan(raw);
  const [host] = ssh.approve({ ...scan, verified: true });
  await ssh.check(host.id);
  assert.deepEqual(ssh.listMobile()[0].agents, ['codex']);
  assert.equal(ssh.listMobile()[0].identityFile, undefined);
  const launch = ssh.launch(host.id, { consoleKey: crypto.randomUUID(), provider: 'codex', folder: "/tmp/$(touch nope)'a", model: 'valid-model' });
  assert.ok(launch.args.includes('StrictHostKeyChecking=yes'));
  for (const option of ['ClearAllForwardings=yes', 'ForwardAgent=no', 'PermitLocalCommand=no', 'ProxyCommand=none']) assert.ok(launch.args.includes(option));
  assert.equal(calls[0].options.windowsHide, true);
  assert.match(launch.args.at(-1), /tmux new-session -A/);
  assert.ok(launch.args.at(-1).includes(quote(quote("/tmp/$(touch nope)'a")).slice(1, -1)));
  assert.throws(() => remoteCommand('custom', 'id'));
  assert.throws(() => remoteCommand('codex', '-bad'));
  assert.throws(() => remoteCommand('codex', 'model; rm'));
});
test('SSH console restoration reattaches the same tmux identity and keeps remote jobs alive on Paddock shutdown', async t => {
  const { root, ssh, raw } = fixture(t), scan = await ssh.scan(raw);
  const [host] = ssh.approve({ ...scan, verified: true });
  const spawned = [];
  const pty = { spawn(executable, args) {
    const item = { executable, args, write() {}, resize() {}, onData(cb) { this.data = cb; }, onExit(cb) { this.exit = cb; }, kill() { this.exit({ exitCode: 0 }); } };
    spawned.push(item); return item;
  } };
  const sessions = new Sessions(root, { ssh, pty });
  const first = await sessions.create({ remoteHostId: host.id, cwd: root, provider: 'shell', name: 'VM work' });
  spawned[0].data('remote output');
  assert.equal(sessions.buffer(first.id).data, 'remote output');
  const saved = sessions.savedConsoles()[0];
  await sessions.stop();
  assert.equal(sessions.items.get(first.id).dismissed, undefined);
  const restored = new Sessions(root, { ssh, pty });
  const next = await restored.restore(saved);
  assert.equal(next.remote.tmux, first.remote.tmux);
  assert.equal(next.consoleKey, first.consoleKey);
  await restored.end(next.id);
  assert.equal(restored.items.get(next.id).dismissed, true);
});
