'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { catalog, byId } = require('./cli-catalog.cjs');
const { findProgram, nativeCodex, findClaude } = require('./adapters.cjs');
const { readJson, atomicJson } = require('./storage.cjs');
const shell = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
function installEnvironment(runtime, directory) {
  const allow = new Set(['systemroot','windir','comspec','path','pathext','temp','tmp','userprofile','homedrive','homepath','localappdata','appdata','programfiles','programfiles(x86)','programdata','processor_architecture','number_of_processors']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allow.has(key.toLowerCase()) && key.toLowerCase() !== 'path'));
  env.PATH = path.dirname(runtime.node) + path.delimiter + (process.env.PATH || '');
  // Public packages only; do not inherit registry tokens or a user's npmrc.
  env.NPM_CONFIG_USERCONFIG = path.join(directory, 'npmrc');
  env.NPM_CONFIG_GLOBALCONFIG = path.join(directory, 'global-npmrc');
  env.NPM_CONFIG_CACHE = path.join(directory, 'cache');
  env.CODEX_NON_INTERACTIVE = '1';
  return env;
}
function runInstaller(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, windowsHide: true, shell: false, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Installation timed out. Check again, or open the setup guide.')); }, 10 * 60 * 1000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('The installer could not start. Open the setup guide or try again.')); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Installation stopped (exit ${code ?? 'unknown'}). Open the setup guide or try again.`)); });
  });
}
class CliSetup {
  constructor(root, runtime, { onChange = () => {}, testMode = false, detect, run = runInstaller, download, platform = process.platform, build = Number(os.release().split('.')[2] || 0), home = os.homedir() } = {}) {
    Object.assign(this, { root, runtime, onChange, testMode, run, platform, build, home });
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
    this.installed = new Map(); this.refresh();
  }
  locate(agent) {
    if (this.detectOverride) return this.detectOverride(agent.id);
    if (agent.id === 'codex') return nativeCodex();
    if (agent.id === 'claude') return findClaude()?.path || null;
    const names = [agent.command, ...(agent.aliases || [])];
    const local = process.env.LOCALAPPDATA || path.join(this.home, 'AppData', 'Local');
    const dirs = [path.join(this.directory, agent.id, 'node_modules', '.bin'), path.join(this.home, '.local', 'bin'), path.join(this.home, '.cursor', 'bin'), path.join(this.home, '.kimi-code', 'bin'), path.join(local, 'agy', 'bin'), path.join(local, 'cursor-agent'), path.join(local, 'Programs', agent.name), path.join(process.env.ProgramFiles || '', 'Kiro-Cli')];
    for (const dir of dirs) for (const name of names) for (const ext of ['.exe', '.cmd', '.ps1', '']) {
      const file = path.join(dir, name + ext);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    }
    for (const name of names) { const file = findProgram(name); if (file) return file; }
    return null;
  }
  refresh() { for (const agent of catalog) this.installed.set(agent.id, this.locate(agent)); return this.snapshot(); }
  executable(id) { const agent = byId.get(id); if (!agent) return null; const file = this.locate(agent); this.installed.set(id, file); return file; }
  snapshot() {
    return catalog.map(({ script, npm, ignoreScripts, aliases, args, mcp, ...agent }) => ({ ...agent,
      installed: !!this.installed.get(agent.id), job: this.jobs[agent.id] || null,
      installable: this.platform === 'win32' && (!agent.windowsBuild || this.build >= agent.windowsBuild),
      requirement: agent.windowsBuild ? agent.windowsBuild >= 26100 ? 'Windows 11 24H2 or newer' : 'Windows 11 or newer' : 'Windows 10/11',
      installSource: script || `https://www.npmjs.com/package/${npm}`
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
    for (const id of selected) this.jobs[id] = { state: 'queued' };
    this.changed();
    try {
      fs.mkdirSync(this.directory, { recursive: true });
      for (const id of selected) {
        const agent = byId.get(id);
        if (this.locate(agent)) { this.jobs[id] = { state: 'installed' }; this.installed.set(id, this.locate(agent)); this.changed(); continue; }
        this.jobs[id] = { state: 'installing' }; this.changed();
        try {
          const directory = path.join(this.directory, id); fs.mkdirSync(directory, { recursive: true });
          fs.writeFileSync(path.join(directory, 'npmrc'), ''); fs.writeFileSync(path.join(directory, 'global-npmrc'), '');
          const env = installEnvironment(this.runtime, directory);
          if (agent.script) {
            const installer = path.join(directory, 'install.ps1');
            fs.writeFileSync(installer, await this.download(agent.script), { mode: 0o600 });
            await this.run(shell(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', installer], { cwd: directory, env });
          } else {
            if (!this.runtime.npm || !fs.existsSync(this.runtime.npm)) throw new Error('Dock’s package installer is missing. Reinstall Dock or open the setup guide.');
            const args = [this.runtime.npm, 'install', '--prefix', directory, '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '--save-exact', agent.ignoreScripts ? '--ignore-scripts' : '--dangerously-allow-all-scripts', agent.npm + '@latest'];
            await this.run(this.runtime.node, args, { cwd: directory, env });
          }
          const executable = this.locate(agent);
          if (!executable) throw new Error('The installer finished, but the command was not found. Check again or open the setup guide.');
          this.installed.set(id, executable); this.jobs[id] = { state: 'installed' };
        } catch (error) { this.jobs[id] = { state: 'error', error: error.message }; }
        this.changed();
      }
    } finally { this.running = false; this.onChange(); }
    return this.snapshot();
  }
}
module.exports = { CliSetup, installEnvironment };
