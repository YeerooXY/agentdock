'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { codexLimits } = require('./domain.cjs');
function findProgram(name) {
  if (process.platform === 'win32') {
    const result = spawnSync('where.exe', [name], { encoding: 'utf8', windowsHide: true, timeout: 3000 });
    return (result.stdout || '').trim().split(/\r?\n/).find(x => x && fs.existsSync(x)) || null;
  }
  return (process.env.PATH || '').split(path.delimiter).map(x => path.join(x, name)).find(x => fs.existsSync(x)) || null;
}
function nativeCodex() {
  const standalone = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
  if (fs.existsSync(standalone)) return standalone;
  const direct = findProgram('codex.exe');
  if (direct) return direct;
  const wrapper = findProgram('codex');
  const roots = [path.join(process.env.APPDATA || '', 'npm'), wrapper && path.dirname(wrapper)].filter(Boolean);
  for (const root of roots) {
    for (const arch of ['x64', 'arm64']) for (const directory of ['bin', 'codex']) {
      const triple = arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'aarch64-pc-windows-msvc';
      const file = path.join(root, 'node_modules', '@openai', 'codex', 'node_modules', `@openai/codex-win32-${arch}`, 'vendor', triple, directory, 'codex.exe');
      if (fs.existsSync(file)) return file;
    }
  }
  return process.platform === 'win32' ? null : wrapper;
}
function findClaude() {
  const native = findProgram('claude') || [path.join(os.homedir(), '.local', 'bin', 'claude.exe'), path.join(os.homedir(), '.claude', 'local', 'claude.exe')].find(x => fs.existsSync(x));
  if (native) return { kind: 'native', path: native, label: 'Windows' };
  if (process.platform !== 'win32') return null;
  const list = spawnSync('wsl.exe', ['--list', '--quiet'], { encoding: 'utf16le', windowsHide: true, timeout: 5000 });
  for (const distro of (list.stdout || '').replaceAll('\0', '').split(/\r?\n/).map(x => x.trim()).filter(x => x && !x.startsWith('docker-'))) {
    const found = spawnSync('wsl.exe', ['-d', distro, '--', 'sh', '-lc', 'command -v claude || test ! -x "$HOME/.local/bin/claude" || printf "%s\\n" "$HOME/.local/bin/claude"'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
    const command = (found.stdout || '').trim().split(/\r?\n/).find(x => x.startsWith('/'));
    if (command) return { kind: 'wsl', path: command, distro, label: `${distro} (WSL)` };
  }
  return null;
}
function wslPath(value) {
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(value);
  if (!match) throw new Error('This WSL console needs a project on a Windows drive.');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}
function consoleModels(provider, codexRoot = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')) {
  if (provider === 'claude') return ['sonnet', 'opus', 'haiku', 'fable', 'opusplan'].map(id => ({ id, name: id === 'opusplan' ? 'Opus plan' : id[0].toUpperCase() + id.slice(1) }));
  if (provider !== 'codex') return [];
  try {
    const file = path.join(codexRoot, 'models_cache.json');
    if (fs.statSync(file).size > 4_000_000) return [];
    const { models } = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(models)) return [];
    return models.filter(x => x && x.visibility !== 'hide' && /^[a-zA-Z0-9][a-zA-Z0-9._:/\[\]@+-]{0,199}$/.test(x.slug || '')).slice(0, 80).map(x => ({ id: x.slug, name: String(x.display_name || x.slug).slice(0, 100) }));
  } catch { return []; }
}
class CodexAccount {
  constructor(onUpdate) { this.onUpdate = onUpdate; this.child = null; this.pending = new Map(); this.nextId = 1; this.ready = null; }
  async start() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const executable = nativeCodex();
      if (!executable) throw new Error('Install Codex CLI to connect account usage.');
      const child = spawn(executable, ['app-server', '--listen', 'stdio://'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      let buffer = '';
      child.stdout.on('data', data => {
        buffer += data.toString('utf8');
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
          try {
            const message = JSON.parse(line);
            if (message.id !== undefined && this.pending.has(message.id)) {
              const pending = this.pending.get(message.id); this.pending.delete(message.id); clearTimeout(pending.timer);
              message.error ? pending.reject(new Error('Codex could not read account limits. Sign in to Codex and refresh.')) : pending.resolve(message.result);
            } else if (message.method === 'account/rateLimits/updated') this.onUpdate(codexLimits(message.params));
            else if (message.id !== undefined && message.method) child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'This client only reads account usage.' } }) + '\n');
          } catch {}
        }
        if (buffer.length > 4_000_000) buffer = '';
      });
      child.stderr.on('data', () => {});
      child.stdin.on('error', () => {});
      const disconnected = () => {
        for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Codex account connection closed. Try Refresh.')); }
        this.pending.clear(); this.ready = null; this.child = null;
      };
      child.on('exit', disconnected); child.on('error', disconnected);
      await this.request('initialize', { clientInfo: { name: 'agent_dock', title: 'Agent Dock', version: '0.1.0' } });
      child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    })();
    try { await this.ready; } catch (error) { this.stop(); throw error; }
  }
  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex account request timed out. Try Refresh.')); }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) }) + '\n');
    });
  }
  async refresh() { await this.start(); const result = await this.request('account/rateLimits/read'); const limits = codexLimits(result); this.onUpdate(limits); return limits; }
  stop() { const child = this.child; this.child = null; this.ready = null; if (child) child.kill(); }
}
function readChunk(file, start, length) {
  const fd = fs.openSync(file, 'r');
  try { const buffer = Buffer.alloc(length); const size = fs.readSync(fd, buffer, 0, length, start); return buffer.subarray(0, size).toString('utf8'); }
  finally { fs.closeSync(fd); }
}
function summarizeLog(file, stat) {
  const head = readChunk(file, 0, Math.min(stat.size, 65536));
  let meta = {};
  try { const first = JSON.parse(head.split('\n')[0]); if (first.type === 'session_meta') meta = first.payload; } catch {}
  const offset = Math.max(0, stat.size - 512 * 1024);
  const tail = readChunk(file, offset, Math.min(stat.size, 512 * 1024));
  const lines = tail.split('\n'); if (offset) lines.shift();
  let usage = null, state = 'recent', model = null, eventAt = stat.mtimeMs;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line), payload = entry.payload || {};
      if (entry.type === 'turn_context') model = payload.model || model;
      if (entry.type !== 'event_msg') continue;
      if (payload.type === 'token_count' && payload.info?.total_token_usage) {
        const u = payload.info.total_token_usage;
        usage = { input: u.input_tokens || 0, output: u.output_tokens || 0, cached: u.cached_input_tokens || 0, total: u.total_tokens ?? ((u.input_tokens || 0) + (u.output_tokens || 0)) };
      }
      if (payload.type === 'task_started') { state = 'active'; eventAt = Date.parse(entry.timestamp); }
      if (['task_complete', 'task_completed', 'turn_complete'].includes(payload.type)) { state = 'ready'; eventAt = Date.parse(entry.timestamp); }
      if (payload.type === 'turn_aborted') { state = 'interrupted'; eventAt = Date.parse(entry.timestamp); }
    } catch {}
  }
  if (state === 'active' && Date.now() - stat.mtimeMs > 15 * 60000) state = 'recent';
  return { id: meta.id || path.basename(file), cwd: meta.cwd || '', provider: 'codex', name: path.basename(meta.cwd || 'Codex session'), usage, state, model, updatedAt: stat.mtimeMs, eventAt };
}
class RecentCodex {
  constructor(root = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions')) { this.root = root; this.cache = new Map(); }
  scan() {
    const files = [];
    for (let days = 0; days < 2; days++) {
      const date = new Date(Date.now() - days * 86400000);
      const dir = path.join(this.root, String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0'));
      try { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) if (entry.isFile() && entry.name.endsWith('.jsonl')) { const file = path.join(dir, entry.name); files.push({ file, stat: fs.statSync(file) }); } } catch {}
    }
    files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    const result = [];
    for (const { file, stat } of files.slice(0, 20)) {
      try {
        const cached = this.cache.get(file);
        if (!cached || cached.mtime !== stat.mtimeMs) this.cache.set(file, { mtime: stat.mtimeMs, value: summarizeLog(file, stat) });
        result.push(this.cache.get(file).value);
      } catch {}
    }
    for (const file of this.cache.keys()) if (!files.slice(0, 20).some(x => x.file === file)) this.cache.delete(file);
    return result.slice(0, 9);
  }
}
module.exports = { findProgram, nativeCodex, findClaude, wslPath, consoleModels, CodexAccount, RecentCodex, summarizeLog };
