'use strict';
// Isolated Linux SSH/tmux verification. Publishes one loopback-only Docker port.
// Uses throwaway SSH keys, no real VM credentials or paid agent calls.
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const assert = require('node:assert/strict');
const { execFile, spawn } = require('node:child_process'), { promisify } = require('node:util');
const { SshHosts } = require('../electron/ssh-hosts.cjs');
const exec = promisify(execFile), root = path.resolve(__dirname, '../.build/ssh-smoke-' + Date.now());
const out = path.resolve(__dirname, '../artifacts/ssh');
const container = 'agentdock-ssh-test-' + process.pid;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function run(program, args, options = {}) {
  if (program === 'docker' && process.env.DOCK_SSH_DOCKER_WSL) {
    const distro = process.env.DOCK_SSH_DOCKER_WSL;
    assert.match(distro, /^[a-zA-Z0-9_-]+$/);
    args = ['-d', distro, '--', 'docker', ...args.map(x =>
      x.replace(/^([a-zA-Z]):\\/, (_, drive) => '/mnt/' + drive.toLowerCase() + '/').replaceAll('\\', '/'))];
    program = 'wsl';
  }
  return exec(program, args, { windowsHide: true, timeout: 90000, maxBuffer: 1024 * 1024, ...options });
}
async function waitFor(fn, seconds = 15) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) { if (await fn()) return; await pause(250); }
  throw new Error('SSH fixture timed out.');
}
(async () => {
  fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(out, { recursive: true });
  const server = path.join(root, 'server'); fs.mkdirSync(server);
  const identity = path.join(root, 'client_key');
  await run('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', identity]);
  fs.copyFileSync(identity + '.pub', path.join(server, 'authorized_keys'));
  const reserve = net.createServer();
  await new Promise(r => reserve.listen(0, '127.0.0.1', r));
  const port = reserve.address().port; await new Promise(r => reserve.close(r));
  const ssh = new SshHosts(path.join(root, 'data'), { exec: async (program, args, options) => { try { return await run(program, args, options); } catch (error) { fs.writeFileSync(path.join(out, 'transport-error.txt'), String(error.stderr || error.message)); throw error; } } });
  let running, client, output = '';
  try {
    await run('docker', ['run', '-d', '--rm', '--name', container, '-p', `127.0.0.1:${port}:22`,
      '-v', `${server}:/fixture:ro`, 'alpine:3.23', 'sh', '-c',
      'apk add --no-cache openssh-server tmux >/dev/null && ssh-keygen -A >/dev/null && passwd -d root >/dev/null && exec /usr/sbin/sshd -D -e -o AuthorizedKeysFile=/fixture/authorized_keys -o StrictModes=no -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no -o PermitRootLogin=prohibit-password -o AllowTcpForwarding=no -o X11Forwarding=no']);
    running = true;
    await waitFor(async () => {
      try { await run('docker', ['exec', container, 'test', '-f', '/etc/ssh/ssh_host_ed25519_key.pub'], { timeout: 3000 }); return true; } catch { return false; }
    }, 60);
    await pause(500);
    const scan = await ssh.scan({ name: 'Isolated Linux', host: '127.0.0.1', port, user: 'root', folder: '/tmp', identityFile: identity });
    const actual = (await run('docker', ['exec', container, 'ssh-keygen', '-lf', '/etc/ssh/ssh_host_ed25519_key.pub'])).stdout;
    assert.ok(actual.includes(scan.fingerprint), 'Compare scanned fingerprint against VM console');
    const [host] = ssh.approve({ ...scan, verified: true });
    await ssh.check(host.id);
    const key = require('node:crypto').randomUUID();
    const launch = ssh.launch(host.id, { consoleKey: key, provider: 'shell' });
    const connect = () => {
      output = '';
      client = spawn(launch.executable, launch.args, { windowsHide: true, env: { ...process.env, TERM: 'xterm-256color' } });
      client.stdout.on('data', b => output = (output + b.toString()).slice(-64000));
      client.stderr.on('data', b => output = (output + b.toString()).slice(-64000));
      client.stdin.on('error', () => {});
    };
    connect();
    await waitFor(() => output.includes('#'));
    client.stdin.write("DOCK_MARK=retained; printf 'FIRST_OK\\n'\n");
    await waitFor(() => /\r?\nFIRST_OK\r?\n/.test(output));
    client.kill(); await pause(500);
    connect(); await waitFor(() => output.includes('#'));
    client.stdin.write("printf '\\nPERSISTED:%s\\n' \"$DOCK_MARK\"\n");
    await waitFor(() => output.includes('PERSISTED:retained'));
    client.kill(); client = null;
    const changed = ssh.get(host.id);
    const original = changed.key;
    // A different valid key is rejected before authentication.
    changed.key = 'ssh-ed25519 ' + fs.readFileSync(identity + '.pub', 'utf8').trim().split(' ')[1];
    await assert.rejects(ssh.check(host.id), /SSH check failed/);
    changed.key = original;
    await ssh.end(launch.remote);
    await assert.rejects(run('docker', ['exec', container, 'tmux', 'has-session', '-t', launch.remote.tmux]),
      error => error.code === 1);
    await ssh.end(launch.remote); // An already-exited job can still be dismissed.
    fs.writeFileSync(path.join(out, 'ssh-smoke.md'), '# Linux SSH verification\n\nPassed against an isolated Alpine Linux Docker container over OpenSSH.\n\n- Scanned fingerprint matched the container console.\n- Strict host-key verification rejected a changed key.\n- tmux preserved a live shell variable across disconnect/reconnect.\n- Explicit end removed only the selected tmux session.\n- SSH-key authentication; no passwords, agent forwarding or AI requests.\n\nThis verifies a real Linux SSH/tmux transport. A physical VM and its installed AI login still need user setup.\n');
    console.log('SSH smoke passed: verified keys, reconnect and explicit end.');
  } finally {
    client?.kill();
    if (running) await run('docker', ['rm', '-f', container]).catch(() => {});
    // Keys and scratch data are restricted to the freshly created directory.
    assert.ok(root.startsWith(path.resolve(__dirname, '../.build') + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
