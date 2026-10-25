'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { atomicJson, readJson } = require('./storage.cjs');
const { catalog } = require('./cli-catalog.cjs');
const { findProgram } = require('./adapters.cjs');
const quote = text => "'" + String(text).replaceAll("'", "'\"'\"'") + "'";
const uuid = /^[a-f0-9-]{36}$/i;
const clean = (value, max = 200) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(value);

function validateHost(raw) {
  const host = raw?.host, user = raw?.user, port = Number(raw?.port || 22);
  if (!clean(host, 253) || !(net.isIP(host) || /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host)) || host.includes('..')) throw new Error('Enter an IP address or hostname.');
  if (!clean(user, 64) || !/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(user)) throw new Error('Enter the Linux username.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use an SSH port from 1 to 65535.');
  if (!clean(raw.name, 64) || !raw.name.trim()) throw new Error('Enter a host name.');
  const folder = raw.folder || '.';
  if (!clean(folder, 1500) || !(folder === '.' || folder.startsWith('/')) || folder.startsWith('//')) throw new Error('Use an absolute Linux folder, or . for the home folder.');
  const identityFile = raw.identityFile || '';
  if (identityFile && (!clean(identityFile, 1500) || !path.isAbsolute(identityFile) || /[%$~]/.test(identityFile) || !fs.statSync(identityFile).isFile())) throw new Error('Choose an existing SSH private-key file on this PC.');
  return { name: raw.name.trim(), host, user, port, folder, identityFile };
}

function remoteCommand(provider, model = '') {
  if (provider === 'shell') return 'exec "${SHELL:-/bin/sh}" -l';
  const entry = catalog.find(x => x.id === provider);
  if (!entry) throw new Error('Choose a supported remote agent.');
  if (model && !/^[a-zA-Z0-9][a-zA-Z0-9._:/\[\]@+-]{0,199}$/.test(model)) throw new Error('Choose a valid model.');
  const args = [...(entry.args || [])];
  if (model && (entry.model || ['claude', 'codex'].includes(provider))) args.push(entry.model || '--model', model);
  return `exec ${[entry.command, ...args].map(quote).join(' ')}`;
}

class SshHosts {
  constructor(root, { exec = promisify(execFile), find = findProgram } = {}) {
    this.root = path.join(root, 'ssh');
    fs.mkdirSync(this.root, { recursive: true });
    this.file = path.join(this.root, 'hosts.json');
    this.empty = path.join(this.root, 'empty_config');
    fs.writeFileSync(this.empty, '', { mode: 0o600 });
    this.items = readJson(this.file, []).filter(x => uuid.test(x.id || ''));
    this.pending = new Map(); this.exec = exec; this.find = find;
  }
  list() { return this.items.map(({ key, ...item }) => ({ ...item })); }
  listMobile() { return this.items.map(({ id, name, folder, agents = [] }) => ({ id, name, folder, agents })); }
  get(id) { return this.items.find(x => x.id === id); }
  save() { atomicJson(this.file, this.items); }
  executable() {
    const file = this.find('ssh');
    if (!file) throw new Error(process.platform === 'win32' ? 'Install the OpenSSH Client in Windows optional features.' : 'Install the OpenSSH client (ssh) with your system package manager.');
    return file;
  }
  async scan(raw) {
    const value = validateHost(raw);
    // Windows' bundled 9.5 keyscan can fail on current OpenSSH key exchange.
    // Git for Windows ships a maintained scanner; it only reads public keys.
    const gitScanner = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'ssh-keyscan.exe');
    const program = process.platform === 'win32' && this.find === findProgram && fs.existsSync(gitScanner)
      ? gitScanner : this.find('ssh-keyscan');
    if (!program) throw new Error(process.platform === 'win32' ? 'Install the OpenSSH Client in Windows optional features.' : 'Install the OpenSSH client (ssh-keyscan) with your system package manager.');
    let stdout;
    try { ({ stdout } = await this.exec(program, ['-T', '5', '-p', String(value.port), '-t', 'ed25519,ecdsa,rsa', value.host], { windowsHide: true, timeout: 18000, maxBuffer: 64000 })); }
    catch (error) {
      if (/unsupported KEX/i.test(error.stderr || '')) throw new Error('Update the OpenSSH client or install current Git for Windows, then scan again.');
      throw new Error('SSH host could not be reached. Check its address, port and SSH service.');
    }
    const keys = [];
    for (const line of stdout.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length !== 3 || !/^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa)$/.test(parts[1]) || !/^[A-Za-z0-9+/]+={0,2}$/.test(parts[2])) continue;
      const bytes = Buffer.from(parts[2], 'base64');
      if (bytes.length < 32 || bytes.length > 8192) continue;
      const key = parts[1] + ' ' + parts[2];
      const fingerprint = 'SHA256:' + crypto.createHash('sha256').update(bytes).digest('base64').replace(/=+$/, '');
      keys.push({ key, fingerprint, algorithm: parts[1] });
    }
    const chosen = keys.find(x => x.algorithm === 'ssh-ed25519') || keys[0];
    if (!chosen) throw new Error('The host returned no supported SSH identity.');
    for (const [id, p] of this.pending) if (p.expires < Date.now()) this.pending.delete(id);
    if (this.pending.size > 10) this.pending.delete(this.pending.keys().next().value);
    const probeId = crypto.randomUUID(), existing = raw.id ? this.get(raw.id) : undefined;
    if (raw.id && !existing) throw new Error('Host no longer exists.');
    this.pending.set(probeId, { value, existingId: existing?.id, ...chosen, expires: Date.now() + 300000 });
    return { probeId, fingerprint: chosen.fingerprint, algorithm: chosen.algorithm,
      changed: !!existing && existing.fingerprint !== chosen.fingerprint,
      previous: existing?.fingerprint || '', host: value.host };
  }
  approve({ probeId, fingerprint, verified } = {}) {
    const pending = this.pending.get(probeId);
    if (!pending || pending.expires < Date.now() || verified !== true || fingerprint !== pending.fingerprint) throw new Error('Scan again and verify the fingerprint on the VM console.');
    const id = pending.existingId || crypto.randomUUID();
    const record = { ...pending.value, id, key: pending.key, fingerprint, agents: [], checkedAt: 0 };
    const previous = this.items;
    this.items = [...this.items.filter(x => x.id !== id), record];
    try { this.save(); } catch (error) { this.items = previous; throw error; }
    this.pending.delete(probeId);
    return this.list();
  }
  rename(id, name) {
    if (!clean(name, 64) || !name.trim()) throw new Error('Enter a host name.');
    const item = this.get(id); if (!item) throw new Error('Host not found.');
    const before = item.name; item.name = name.trim();
    try { this.save(); } catch (error) { item.name = before; throw error; }
    return this.list();
  }
  remove(id) {
    if (!uuid.test(id || '')) throw new Error('Choose a saved host.');
    const before = this.items;
    this.items = this.items.filter(x => x.id !== id);
    try { this.save(); } catch (error) { this.items = before; throw error; }
    fs.rmSync(path.join(this.root, id + '.known_hosts'), { force: true });
  }
  args(item, interactive = false) {
    // Revalidate saved files too. An edited local profile is not shell syntax.
    validateHost(item);
    if (!uuid.test(item.id) || !/^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/]+={0,2}$/.test(item.key || '')) throw new Error('Verify this host again.');
    const known = path.join(this.root, item.id + '.known_hosts');
    const label = item.port === 22 ? item.host : `[${item.host}]:${item.port}`;
    fs.writeFileSync(known, `${label} ${item.key}\n`, { mode: 0o600 });
    const args = ['-F', this.empty, '-p', String(item.port), '-l', item.user,
      '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile="${known.replaceAll('\\', '/')}"`,
      '-o', `GlobalKnownHostsFile="${this.empty.replaceAll('\\', '/')}"`,
      '-o', 'UpdateHostKeys=no', '-o', 'CheckHostIP=no', '-o', 'ClearAllForwardings=yes',
      '-o', 'ForwardAgent=no', '-o', 'ForwardX11=no', '-o', 'PermitLocalCommand=no',
      '-o', 'ProxyCommand=none', '-o', 'ProxyJump=none',
      '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3',
      '-o', `BatchMode=${interactive ? 'no' : 'yes'}`];
    if (item.identityFile) args.push('-i', item.identityFile, '-o', 'IdentitiesOnly=yes');
    args.push(interactive ? '-tt' : '-T', item.host);
    return args;
  }
  async check(id) {
    const item = this.get(id); if (!item) throw new Error('Choose a saved host.');
    const script = `printf 'DOCK-LINUX\\n'; uname -s; command -v tmux >/dev/null && printf 'DOCK-TMUX\\n'; ` +
      catalog.map(a => `command -v ${quote(a.command)} >/dev/null && printf ${quote('DOCK-AGENT:' + a.id + '\\n')}`).join('; ') + '; true';
    let stdout;
    try { ({ stdout } = await this.exec(this.executable(), [...this.args(item), 'sh -lc ' + quote(script)], { windowsHide: true, timeout: 20000, maxBuffer: 64000 })); }
    catch { throw new Error('SSH check failed. Verify the host key and SSH-key login from this PC. Password login is available inside a console.'); }
    if (!stdout.includes('DOCK-LINUX\nLinux') || !stdout.includes('DOCK-TMUX')) throw new Error('The host must run Linux with tmux installed.');
    if (this.get(id) !== item) throw new Error('Host changed during the check.');
    item.agents = catalog.filter(a => stdout.split(/\r?\n/).includes('DOCK-AGENT:' + a.id)).map(a => a.id);
    item.checkedAt = Date.now(); this.save();
    return this.list();
  }
  launch(id, { consoleKey, provider = 'shell', folder, model = '' }) {
    const item = this.get(id); if (!item) throw new Error('Choose a saved SSH host.');
    if (!uuid.test(consoleKey)) throw new Error('Invalid remote console identity.');
    const cwd = folder || item.folder;
    validateHost({ ...item, folder: cwd });
    const tmux = 'agentdock_' + consoleKey.replaceAll('-', '');
    const command = remoteCommand(provider, model);
    // The command is used only when the tmux session is new. -A reattaches the
    // existing process, including its conversation, after Paddock/SSH disconnects.
    const script = `set -eu; command -v tmux >/dev/null || { printf 'Install tmux on this Linux host.\\n'; exit 1; }; cd -- ${quote(cwd)}; exec tmux new-session -A -s ${quote(tmux)} ${quote(command)}`;
    return { executable: this.executable(), args: [...this.args(item, true), 'sh -lc ' + quote(script)],
      remote: { hostId: id, name: item.name, folder: cwd, tmux }, provider };
  }
  async end(remote) {
    const host = this.get(remote.hostId);
    if (!host || !/^agentdock_[a-f0-9]{32}$/i.test(remote.tmux)) throw new Error('Remote host/session unavailable.');
    const target = quote('=' + remote.tmux);
    await this.exec(this.executable(), [...this.args(host), `if tmux has-session -t ${target} 2>/dev/null; then tmux kill-session -t ${target}; fi`],
      { windowsHide: true, timeout: 15000, maxBuffer: 32000 });
  }
}
module.exports = { SshHosts, validateHost, remoteCommand, quote };
