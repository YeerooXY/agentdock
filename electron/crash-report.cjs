'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { psQuote, shQuote, powershell } = require('./platform.cjs');

const PROMPT = 'Read CRASH.md in this folder and follow the instructions in it.';
const ISSUE_URL = 'https://github.com/YeerooXY/agentdock/issues/new';
async function guardStartup(start, onCrash) {
  try { return await start(); } catch (error) { return onCrash(error); }
}
function redact(value, home = os.homedir()) {
  let text = String(value ?? '');
  if (home) {
    for (const spelling of new Set([home, home.replaceAll('\\', '/')])) {
      const escaped = spelling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(escaped, process.platform === 'win32' ? 'gi' : 'g'), '~');
    }
  }
  return text.replace(/(command failed|command was|spawn args|arguments|environment)\s*[:=][^\r\n]*/gi, '$1: [omitted]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b((?:api[_-]?)?(?:key|token|secret|password))['"]?\s*[=:]\s*(?:"[^"]*"|'[^']*'|[^\s,;}'"]+)/gi, '$1=[redacted]')
    .replace(/\b([A-Z_][A-Z0-9_]{2,})=(?:"[^"]*"|'[^']*'|[^\s,;]+)/g, '$1=[omitted]')
    .replace(/--[a-z][\w-]*(?:=(?:"[^"]*"|'[^']*'|[^\s,;]+)|\s+(?:"[^"]*"|'[^']*'|[^\s,;]+))?/gi, '[argument omitted]')
    .replace(/\b(?:sk-|ghp_|gho_|ghu_|ghs_|github_pat_)[a-z0-9_-]+/gi, '[redacted]')
    // Long secret-like runs: hex, or mixed-case base64 with digits. Plain path runs such as
    // node_modules/opencode-windows-x64/bin stay readable so stack traces remain useful.
    .replace(/\b[a-f0-9]{32,}\b/gi, '[redacted]')
    .replace(/[A-Za-z0-9+/_=-]{32,}/g, run => /[a-z]/.test(run) && /[A-Z]/.test(run) && /\d/.test(run) && !/[/\\]?[a-z][\w.-]*\/[a-z]/.test(run) ? '[redacted]' : run);
}
class CrashReport {
  constructor(root, { home = os.homedir(), maxBytes = 1024 * 1024 } = {}) {
    this.root = root; this.home = home; this.maxBytes = maxBytes;
    this.logs = path.join(root, 'logs'); this.file = path.join(this.logs, 'main.log');
    this.marker = path.join(root, 'startup-marker.json'); this.notices = []; this.step = 'starting';
  }
  log(level, message) {
    try {
      fs.mkdirSync(this.logs, { recursive: true });
      try {
        if (fs.statSync(this.file).size > this.maxBytes) {
          const previous = path.join(this.logs, 'main.1.log');
          try { fs.unlinkSync(previous); } catch (error) { if (error.code !== 'ENOENT') throw error; }
          fs.renameSync(this.file, previous);
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      fs.appendFileSync(this.file, redact(`${new Date().toISOString()} ${level} ${message}\n`, this.home), { mode: 0o600 });
    } catch {} // Logging must not cause another startup failure.
  }
  begin(explicit = false) {
    fs.mkdirSync(this.root, { recursive: true });
    let failures = 0;
    try { const previous = JSON.parse(fs.readFileSync(this.marker, 'utf8')); failures = Number.isSafeInteger(previous.failures) ? Math.max(0, previous.failures) : 0; failures++; } catch {}
    fs.writeFileSync(this.marker, JSON.stringify({ failures }), { mode: 0o600 });
    this.log('INFO', 'starting');
    return explicit || failures >= 2;
  }
  ready() { try { fs.unlinkSync(this.marker); } catch {} this.windowReady = true; this.log('INFO', 'window ready'); }
  async startupStep(name, fn, { optional = false, safeMode = false, skipInSafeMode = true, notice } = {}) {
    if (optional && safeMode && skipInSafeMode) { this.log('INFO', `${name}: skipped in safe mode`); return; }
    if (!this.windowReady) this.step = name;
    this.log('INFO', name);
    try { return await fn(); }
    catch (error) {
      this.log('ERROR', `${name}: ${error?.stack || error}`);
      if (!optional) throw error;
      const message = notice || `${name} failed. This feature is off for now. Details are in the log.`;
      if (!this.notices.includes(message)) this.notices.push(message);
    }
  }
  report(error, { version, electron, node, install, system = `${os.type()} ${os.release()} ${os.arch()}` }) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const base = path.join(this.root, 'diagnostics'); fs.mkdirSync(base, { recursive: true });
    let folder = path.join(base, `crash-${stamp}`), suffix = 1;
    while (fs.existsSync(folder)) folder = path.join(base, `crash-${stamp}-${suffix++}`);
    fs.mkdirSync(folder, { mode: 0o700 });
    const logs = [];
    for (const file of [path.join(this.logs, 'main.1.log'), this.file]) {
      try { logs.push(...fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)); } catch {}
    }
    const lines = logs.slice(-200).join('\n');
    const summary = `Paddock stopped while ${this.step}.`;
    const content = `# Paddock crash report\n\n${summary}\n\n## Error\n\n\`\`\`\n${error?.stack || error}\n\`\`\`\n\n## Versions and folders\n\n- Paddock: ${version}\n- Electron: ${electron}\n- Node: ${node}\n- OS: ${system}\n- Install folder: ${install}\n- Data folder: ${this.root}\n\n## Last 200 log lines\n\n\`\`\`\n${lines}\n\`\`\`\n\n## Instructions for the AI assistant\n\nExplain to a non-programmer in plain words what went wrong and the most likely cause. Read the log files in ${this.root}/logs and read Paddock's install folder at ${install} as needed. Treat the install folder as read-only.\n\nSuggest steps in order of safety: restart, safe mode, update or reinstall, and removing one named setting. For the setting, name the file and keep a backup.\n\nChange nothing outside this crash folder without asking the user first. Never print, copy or ask for passwords, keys or tokens.\n\nIf this looks like a Paddock bug, write ISSUE.md in this crash folder with an issue the user can paste into GitHub, without personal data.\n`;
    fs.writeFileSync(path.join(folder, 'CRASH.md'), redact(content, this.home), { mode: 0o600 });
    return { folder, summary };
  }
}

// Reuse locate without loading setup jobs or constructing the rest of the app.
function detectAgents(root, { locate, findProgram, platform = process.platform, home = os.homedir() } = {}) {
  const { CliSetup } = require('./cli-setup.cjs');
  const { byId } = require('./cli-catalog.cjs');
  const { findProgram: defaultFind } = require('./adapters.cjs');
  const setup = Object.assign(Object.create(CliSetup.prototype), { directory: path.join(root, 'agents'), home, platform, localAppData: process.env.LOCALAPPDATA, findProgram: findProgram || defaultFind });
  return ['claude', 'codex', 'opencode', 'gemini', 'kiro'].flatMap(id => {
    const agent = byId.get(id); let executable;
    try { executable = locate ? locate(agent) : setup.locate(agent); } catch {}
    if (platform === 'win32' && executable && !/^(?:[a-z]:[\\/]|\\\\)/i.test(executable)) return [];
    return executable ? [{ id, name: agent.name, executable }] : [];
  });
}
function terminalCommand(agent, folder, { platform = process.platform, findProgram = require('./adapters.cjs').findProgram } = {}) {
  const args = [...(agent.id === 'kiro' ? ['chat'] : agent.id === 'opencode' ? ['--prompt'] : agent.id === 'gemini' ? ['--prompt-interactive'] : []), PROMPT];
  if (platform === 'win32') {
    const command = `& ${psQuote(agent.executable)} ${args.map(psQuote).join(' ')}`;
    const encoded = Buffer.from(command, 'utf16le').toString('base64');
    const shellArgs = ['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', encoded];
    const wt = findProgram('wt.exe') || findProgram('wt');
    if (wt) return { executable: wt, args: ['-d', folder, powershell(), ...shellArgs], cwd: folder };
    // The cwd is supplied separately, so the cmd command contains no user paths.
    return { executable: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"start "Paddock diagnosis" /D . cmd /k powershell.exe ${shellArgs.join(' ')}"`], cwd: folder, windowsVerbatimArguments: true };
  }
  const command = [agent.executable, ...args].map(shQuote).join(' ');
  if (platform === 'darwin') {
    const script = `tell application "Terminal" to do script ${JSON.stringify(`cd ${shQuote(folder)} && ${command}`)}\ntell application "Terminal" to activate`;
    return { executable: 'osascript', args: ['-e', script], cwd: folder };
  }
  for (const name of ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm']) {
    const executable = findProgram(name); if (!executable) continue;
    const flag = name === 'gnome-terminal' ? '--' : name === 'xfce4-terminal' ? '-x' : '-e';
    return { executable, args: [flag, agent.executable, ...args], cwd: folder };
  }
  throw new Error('No terminal was found.');
}
async function diagnose(folder, { root, dialog, shell, findAgents = detectAgents, launch = spawn, terminal = terminalCommand }) {
  const agents = findAgents(root);
  if (!agents.length) {
    const { response } = await dialog.showMessageBox({ type: 'info', title: 'No AI agent found', message: 'No supported AI agent was found.', buttons: ['Open report folder', 'Open GitHub issue', 'Cancel'], defaultId: 0, cancelId: 2 });
    if (response === 0) await shell.openPath(folder);
    if (response === 1) await shell.openExternal(ISSUE_URL);
    return;
  }
  let index = 0;
  if (agents.length > 1) {
    const choice = await dialog.showMessageBox({ type: 'question', title: 'Choose an AI agent', message: 'Which agent should diagnose the problem?', buttons: [...agents.map(a => a.name), 'Cancel'], cancelId: agents.length });
    index = choice.response; if (index >= agents.length) return;
  }
  const command = terminal(agents[index], folder);
  await new Promise((resolve, reject) => {
    const child = launch(command.executable, command.args, { cwd: command.cwd, detached: true, stdio: 'ignore', windowsVerbatimArguments: command.windowsVerbatimArguments });
    child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); });
  });
}
module.exports = { CrashReport, redact, detectAgents, terminalCommand, diagnose, guardStartup, PROMPT, ISSUE_URL };
