'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { catalog, byId } = require('./cli-catalog.cjs');
const { findProgram, nativeCodex, findClaude } = require('./adapters.cjs');
const { readJson, atomicJson } = require('./storage.cjs');
const { ManagedDownloads } = require('./managed-downloads.cjs');
const shell = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const DIAGNOSTIC_LIMIT = 1200;
const RAW_LINE_LIMIT = 16000;

function sanitizeLine(value) {
  let result = String(value || '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/(https?:\/\/)[^/?#\s@]*:[^/?#\s@]*@/gi, '$1[credentials-redacted]@')
    .replace(/(https?:\/\/[^\s?#"'<>]+)\?[^\s#"'<>]*/gi, '$1?[query redacted]')
    .replace(/\b((?:proxy-)?authorization\s*[:=])\s*.*/gi, '$1 [redacted]')
    .replace(/\b(set-cookie\s*[:=])\s*.*/gi, '$1 [redacted]')
    .replace(/((?:"|')?[A-Z0-9_.-]*(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|AUTH|SIGNATURE)(?:"|')?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,}\]\s]+)/gi, '$1"[redacted]"')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|xai-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|AKIA[A-Z0-9]{16})\b/g, '[redacted]')
    .trim();
  const homes = [...new Set([os.homedir(), process.env.USERPROFILE, process.env.HOME].filter(Boolean))];
  for (const home of homes) result = result.replace(new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '%USERPROFILE%');
  return result;
}

function sanitizeDiagnostic(value) {
  const lines = String(value || '').split(/\r?\n/).map(line => line.length > RAW_LINE_LIMIT ? '[oversized diagnostic line redacted]' : sanitizeLine(line));
  const output = []; let size = 0;
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]; if (!line) continue;
    if (line.length + size + 1 > DIAGNOSTIC_LIMIT) {
      if (!output.length) output.push('[diagnostic line omitted]');
      continue;
    }
    output.unshift(line); size += line.length + 1;
  }
  return output.join('\n');
}

class BoundedOutput {
  constructor() { this.lines = []; this.size = 0; this.pending = ''; this.discarding = false; }
  keep(line) {
    const safe = line.length > RAW_LINE_LIMIT ? '[oversized output line redacted]' : sanitizeLine(line);
    if (!safe) return;
    this.lines.push(safe); this.size += safe.length + 1;
    while (this.size > 8000 && this.lines.length > 1) this.size -= this.lines.shift().length + 1;
  }
  add(chunk) {
    let input = this.pending + chunk.toString('utf8'); this.pending = '';
    while (input.length) {
      if (this.discarding) {
        const end = input.indexOf('\n'); if (end < 0) return;
        this.discarding = false; input = input.slice(end + 1); continue;
      }
      const end = input.indexOf('\n');
      if (end >= 0) { this.keep(input.slice(0, end).replace(/\r$/, '')); input = input.slice(end + 1); continue; }
      if (input.length > RAW_LINE_LIMIT) { this.keep('[oversized output line redacted]'); this.discarding = true; }
      else this.pending = input;
      return;
    }
  }
  value() { return [...this.lines, ...(this.pending && !this.discarding ? [sanitizeLine(this.pending)] : [])].join('\n'); }
}

function capturedProcess(command, args, options, { timeoutMs = 10 * 60 * 1000, label = 'Process' } = {}) {
  return new Promise((resolve, reject) => {
    let child, settled = false;
    const stdout = new BoundedOutput(), stderr = new BoundedOutput();
    const diagnostics = () => sanitizeDiagnostic([stdout.value(), stderr.value()].filter(Boolean).join('\n'));
    const fail = message => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      const detail = diagnostics(); reject(new Error(detail ? `${message} ${detail}` : message));
    };
    const timer = setTimeout(() => {
      try {
        const childIsRunning = child && child.exitCode === null && child.signalCode === null;
        if (process.platform === 'win32' && childIsRunning && Number.isInteger(child.pid)) {
          const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
          if (fs.existsSync(taskkill)) { const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' }); killer.once('error', () => {}); killer.unref(); }
          else child.kill();
        } else if (childIsRunning) child.kill();
        child?.stdin?.destroy(); child?.stdout?.destroy(); child?.stderr?.destroy();
      } catch {}
      fail(`${label} timed out. Retry or open the setup guide.`);
    }, timeoutMs);
    try {
      child = spawn(command, args, { ...options, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      fail(`${label} could not start. Check the installation and retry.`); return;
    }
    child.stdout?.on('data', chunk => stdout.add(chunk));
    child.stderr?.on('data', chunk => stderr.add(chunk));
    child.once('error', () => fail(`${label} could not start. Check the installation and retry.`));
    child.once('close', code => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (code === 0) resolve({ code, stdout: sanitizeDiagnostic(stdout.value()), stderr: sanitizeDiagnostic(stderr.value()) });
      else {
        const detail = diagnostics();
        reject(new Error(detail ? `${label} stopped (exit ${code ?? 'unknown'}). ${detail}` : `${label} stopped (exit ${code ?? 'unknown'}). Retry or open the setup guide.`));
      }
    });
  });
}

function powershellInvocation(file, args) {
  const quote = value => `'${String(value).replaceAll("'", "''")}'`;
  const command = `& ${quote(file)} ${args.map(quote).join(' ')}; if ($LASTEXITCODE -is [int]) { exit $LASTEXITCODE }; exit 0`;
  return [shell(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')]];
}

function verifyExecutable(file, args = ['--version'], options = {}) {
  if (process.platform === 'win32' && /\.(?:cmd|bat|ps1)$/i.test(file)) {
    const [command, invocationArgs] = powershellInvocation(file, args);
    return capturedProcess(command, invocationArgs, options, { timeoutMs: 20000, label: 'CLI check' });
  }
  return capturedProcess(file, args, options, { timeoutMs: 20000, label: 'CLI check' });
}

function runInstaller(command, args, options) {
  return capturedProcess(command, args, options, { label: 'Installation' });
}

function installEnvironment(runtime, directory, agentId) {
  const allow = new Set(['systemroot','windir','comspec','path','pathext','temp','tmp','userprofile','homedrive','homepath','localappdata','appdata','programfiles','programfiles(x86)','programdata','processor_architecture','number_of_processors',
    'home','user','logname','shell','lang','lc_all','tmpdir','xdg_data_home','xdg_config_home','xdg_cache_home']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allow.has(key.toLowerCase()) && key.toLowerCase() !== 'path'));
  env.PATH = path.dirname(runtime.node) + path.delimiter + (process.env.PATH || '');
  // Public packages only; do not inherit registry tokens or a user's npmrc.
  env.NPM_CONFIG_USERCONFIG = path.join(directory, 'npmrc');
  env.NPM_CONFIG_GLOBALCONFIG = path.join(directory, 'global-npmrc');
  env.NPM_CONFIG_CACHE = path.join(directory, 'cache');
  env.CODEX_NON_INTERACTIVE = '1';
  // Keep the vendor installer from changing the user's PATH or renaming legacy
  // kimi-cli shims. Paddock launches the managed binary by its exact path.
  if (agentId === 'kimi') env.KIMI_NO_MODIFY_PATH = '1';
  return env;
}

class CliSetup {
  constructor(root, runtime, { onChange = () => {}, onDetectError = () => {}, deferDetection = false, testMode = false, detect, run = runInstaller, verify = verifyExecutable, download, platform = process.platform, build = Number(os.release().split('.')[2] || 0), home = os.homedir(), localAppData = process.env.LOCALAPPDATA, findProgram: findProgramOverride } = {}) {
    this.downloads = new ManagedDownloads(root);
    Object.assign(this, { root, runtime, onChange, onDetectError, testMode, run, verify, platform, build, home, localAppData, findProgram: findProgramOverride || findProgram });
    this.directory = path.join(root, 'agents'); this.file = path.join(root, 'agent-setup.json');
    this.detectOverride = detect;
    this.download = download || (async url => {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`Download failed (${response.status}). Try again or open the setup guide.`);
      const text = await response.text();
      if (!text || text.length > 2_000_000 || /^\s*<(?:!doctype|html)/i.test(text)) throw new Error('The server did not return an installer. Open the setup guide.');
      return text;
    });
    this.jobs = readJson(this.file, {});
    for (const job of Object.values(this.jobs)) if (['queued', 'installing'].includes(job.state)) { job.state = 'error'; job.error = 'Setup was interrupted. Check again, then retry if needed.'; }
    this.installed = new Map(); if (!deferDetection) this.refresh();
  }
  locate(agent) {
    if (this.detectOverride) return this.detectOverride(agent.id);
    if (agent.id === 'codex' || agent.id === 'claude') {
      const dir = path.join(this.directory, agent.id, 'node_modules', '.bin');
      for (const ext of this.platform === 'win32' ? ['.exe', '.cmd', '.ps1', ''] : ['']) {
        const file = path.join(dir, agent.command + ext);
        try { if (fs.statSync(file).isFile()) return file; } catch {}
      }
      return (agent.id === 'codex' ? nativeCodex() : findClaude()?.path) || this.findProgram(agent.command) || null;
    }
    // `agent` is shared by Cursor and Grok. Only trust Cursor's unique
    // cursor-agent command outside its vendor-owned install directory.
    const names = agent.id === 'cursor' ? ['cursor-agent'] : [agent.command, ...(agent.aliases || [])];
    const local = this.localAppData || path.join(this.home, 'AppData', 'Local');
    const vendorDirs = {
      antigravity: [path.join(local, 'agy', 'bin')],
      cursor: [path.join(this.home, '.cursor', 'bin'), path.join(local, 'cursor-agent')],
      grok: [path.join(this.home, '.grok', 'bin')],
      kiro: [path.join(local, 'Kiro-Cli'), path.join(process.env.ProgramFiles || '', 'Kiro-Cli')],
      kimi: [path.join(this.home, '.kimi-code', 'bin')]
    };
    if (this.platform !== 'win32') Object.assign(vendorDirs, { cursor: [path.join(this.home, '.local', 'bin')], kiro: [], kimi: [path.join(this.home, '.kimi-code', 'bin')], antigravity: [] });
    const dirs = [path.join(this.directory, agent.id, 'node_modules', '.bin'), ...(vendorDirs[agent.id] || []), path.join(this.home, '.local', 'bin'), ...(this.platform === 'win32' ? [path.join(local, 'Programs', agent.name)] : [])];
    for (const dir of dirs) {
      const cursorVendorDir = agent.id === 'cursor' && (dir === vendorDirs.cursor[0] || dir === vendorDirs.cursor[1]);
      const candidates = cursorVendorDir ? ['cursor-agent', 'agent'] : names;
      for (const name of candidates) for (const ext of this.platform === 'win32' ? ['.exe', '.cmd', '.ps1', ''] : ['']) {
        const file = path.join(dir, name + ext);
        try { if (fs.statSync(file).isFile()) return file; } catch {}
      }
    }
    for (const name of names) { const file = this.findProgram(name); if (file) return file; }
    return null;
  }
  refresh() {
    let jobsChanged = false;
    for (const agent of catalog) {
      let file = null;
      try { file = this.locate(agent); } catch (error) { this.onDetectError(agent, error); }
      this.installed.set(agent.id, file);
      if (file && this.jobs[agent.id]?.state === 'error' && !this.jobs[agent.id].checkFailed) {
        this.jobs[agent.id] = { state: 'installed' }; jobsChanged = true;
      }
    }
    if (jobsChanged) atomicJson(this.file, this.jobs);
    return this.snapshot();
  }
  executable(id) { const agent = byId.get(id); if (!agent) return null; const file = this.locate(agent); this.installed.set(id, file); return file; }
  snapshot() {
    const windows = this.platform === 'win32';
    return catalog.map(({ script, shScript, installArgs, npm, ignoreScripts, aliases, args, mcp, ...agent }) => ({ ...agent,
      installed: !!this.installed.get(agent.id), job: this.jobs[agent.id] || null,
      installable: windows ? !agent.windowsBuild || this.build >= agent.windowsBuild : ['darwin', 'linux'].includes(this.platform) && !!(shScript || npm),
      requirement: !windows ? 'macOS or Linux' : agent.windowsBuild ? agent.windowsBuild >= 26100 ? 'Windows 11 24H2 or newer' : 'Windows 11 or newer' : 'Windows 10/11',
      installSource: (windows ? script : shScript) || `https://www.npmjs.com/package/${npm}`
    }));
  }
  changed() { atomicJson(this.file, this.jobs); this.onChange(); }
  async install(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > catalog.length || ids.some(id => !byId.has(id))) throw new Error('Choose agents from the list.');
    if (this.testMode) throw new Error('Agent installation is disabled during tests.');
    if (this.running) throw new Error('Installation is already running.');
    const selected = [...new Set(ids)];
    for (const id of selected) if (!this.snapshot().find(x => x.id === id).installable && !this.installed.get(id)) throw new Error(`${byId.get(id).name} needs ${this.snapshot().find(x => x.id === id).requirement}.`);
    this.running = true;
    for (const id of selected) this.jobs[id] = { state: 'queued', ...(this.jobs[id]?.checkFailed ? { checkFailed: true } : {}) };
    this.changed();
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      for (const id of selected) {
        const agent = byId.get(id);
        const existing = this.locate(agent);
        if (existing) {
          this.installed.set(id, existing);
          if (this.jobs[id]?.checkFailed) {
            this.jobs[id] = { state: 'installing', checkFailed: true }; this.changed();
            try { await this.verify(existing, ['--version'], { cwd: this.directory, env: installEnvironment(this.runtime, this.directory) }); this.jobs[id] = { state: 'installed' }; }
            catch (error) { this.jobs[id] = { state: 'error', error: sanitizeDiagnostic(error?.message) || 'The installed command did not pass its version check. Retry or open the setup guide.', checkFailed: true }; }
          } else this.jobs[id] = { state: 'installed' };
          this.changed(); continue;
        }
        this.jobs[id] = { state: 'installing' }; this.changed();
        const script = this.platform === 'win32' ? agent.script : agent.shScript;
        const directory = path.join(this.directory, id), source = script ? script.split('?')[0] : `https://www.npmjs.com/package/${agent.npm}`;
        const downloadEntry = { name: agent.name + (script ? ' installer workspace' : ''), kind: script ? 'installer' : 'npm', source, directory };
        let installedExecutable = null;
        try {
          fs.mkdirSync(directory, { recursive: true });
          this.downloads.record({ ...downloadEntry, state: 'installing' });
          fs.writeFileSync(path.join(directory, 'npmrc'), '', { mode: 0o600 }); fs.writeFileSync(path.join(directory, 'global-npmrc'), '', { mode: 0o600 });
          const env = installEnvironment(this.runtime, directory, agent.id);
          if (script && this.platform === 'win32') {
            const installer = path.join(directory, 'install.ps1');
            fs.writeFileSync(installer, await this.download(script), { mode: 0o600 });
            const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', installer, ...(agent.installArgs || [])];
            await this.run(shell(), args, { cwd: directory, env });
          } else if (script) {
            // The vendor's own shell installer, run with bash and no terminal.
            const installer = path.join(directory, 'install.sh');
            fs.writeFileSync(installer, await this.download(script), { mode: 0o600 });
            await this.run('/bin/bash', [installer], { cwd: directory, env });
          } else {
            if (!this.runtime.npm || !fs.existsSync(this.runtime.npm)) throw new Error('Paddock’s package installer is missing. Reinstall Paddock or open the setup guide.');
            const args = [this.runtime.npm, 'install', '--prefix', directory, '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '--save-exact', agent.ignoreScripts ? '--ignore-scripts' : '--dangerously-allow-all-scripts', agent.npm + '@latest'];
            await this.run(this.runtime.node, args, { cwd: directory, env });
          }
          const executable = this.locate(agent);
          if (!executable) throw new Error('The installer finished, but the command was not found. Check again or open the setup guide.');
          this.installed.set(id, executable);
          if (script && path.isAbsolute(executable)) installedExecutable = executable;
          await this.verify(executable, ['--version'], { cwd: directory, env });
          this.jobs[id] = { state: 'installed' };
          this.downloads.record({ ...downloadEntry, ...(installedExecutable ? { executable: installedExecutable } : {}) });
        } catch (error) {
          const message = sanitizeDiagnostic(error?.message) || 'Installation failed. Retry or open the setup guide.';
          this.jobs[id] = { state: 'error', error: message, ...(this.installed.get(id) ? { checkFailed: true } : {}) };
          try { this.downloads.record({ ...downloadEntry, ...(installedExecutable ? { executable: installedExecutable } : {}), state: 'incomplete' }); } catch {}
        }
        this.changed();
      }
    } finally { this.running = false; this.onChange(); }
    return this.snapshot();
  }
}
module.exports = { CliSetup, installEnvironment, runInstaller, verifyExecutable, sanitizeDiagnostic };
