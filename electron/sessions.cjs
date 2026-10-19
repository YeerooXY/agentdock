'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { findProgram, nativeCodex, wslPath } = require('./adapters.cjs');
const { atomicJson, readJson } = require('./storage.cjs');
const { planLayout, planOpening, planGrid, gridSize } = require('./console-layout.cjs');
const { providers, byId: cliAgents } = require('./cli-catalog.cjs');
const { prepareCli } = require('./cli-launch.cjs');
const { prepareCodexSession } = require('./codex-session.cjs');
function psQuote(text) { return "'" + text.replaceAll("'", "''") + "'"; }
function shQuote(text) { return "'" + text.replaceAll("'", "'\"'\"'") + "'"; }
function validateConsoleDefaults(raw) {
  if (!providers.includes(raw?.provider)) throw new Error('Choose an agent or shell.');
  const cwd = String(raw.cwd || '').trim();
  if (!path.isAbsolute(cwd) || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Choose an existing project folder.');
  const command = String(raw.command || '');
  if (command.length > 4000 || command.includes('\0') || (raw.provider === 'custom' && !command.trim())) throw new Error('Enter a custom command, up to 4,000 characters.');
  return { provider: raw.provider, cwd, name: String(raw.name || '').trim().slice(0, 64), command };
}
class Sessions extends EventEmitter {
  constructor(root, dependencies = {}) {
    super(); this.root = root; this.items = new Map(); this.eventTimes = new Map(); this.starting = new Map(); this.codexIdentities = new Map();
    this.pty = dependencies.pty || require('node-pty');
    this.findProgram = dependencies.findProgram || findProgram;
    this.nativeCodex = dependencies.nativeCodex || nativeCodex;
    this.hub = dependencies.hub;
    this.projects = dependencies.projects;
    this.claude = dependencies.claude;
    this.runtime = dependencies.runtime;
    this.cliSetup = dependencies.cliSetup;
    this.agentHome = dependencies.agentHome;
    this.prepareCodexSession = dependencies.prepareCodexSession || prepareCodexSession;
    this.grid = gridSize(dependencies.grid); this.onLayout = dependencies.onLayout || (() => {});
  }
  list() { return [...this.items.values()].map(({ terminal, buffer, command, claudeTarget, ...session }) => session).sort((a, b) => a.slot - b.slot); }
  savedConsoles() {
    return [...this.items.values()].filter(x => (x.alive || x.restoreError) && !x.dismissed).map(x => ({
      slot: x.slot, width: x.width || 1, height: x.height || 1, consoleKey: x.consoleKey || x.id, projectId: x.projectId || null, name: x.name, cwd: x.cwd, provider: x.provider, permissions: x.permissions,
      command: x.command || '', model: x.launchModel || '', providerSessionId: ['codex', 'claude'].includes(x.provider) ? x.providerSessionId : null, claudeTarget: x.claudeTarget
    })).sort((a, b) => a.slot - b.slot);
  }
  async restore(entry) {
    if (entry.projectId && this.projects && !this.projects.get(entry.projectId)) entry = { ...entry, projectId: null };
    try {
      return await this.create({ ...entry, permissions: entry.permissions === 'system' ? 'default' : entry.permissions }, { resumeId: entry.providerSessionId, claudeTarget: entry.claudeTarget });
    } catch (error) {
      const id = crypto.randomUUID();
      const item = { ...entry, launchModel: entry.model || '', id, alive: false, state: 'error', restoreError: error.message, buffer: `Could not reopen this console.\r\n${error.message}\r\n`, sequence: 0, cols: 110, rows: 30, createdAt: Date.now(), updatedAt: Date.now(), terminal: null };
      this.items.set(id, item); this.emit('changed');
      return this.list().find(x => x.id === id);
    }
  }
  async retry(id) {
    const item = this.items.get(id);
    if (!item?.restoreError) throw new Error('This console does not need to be reopened.');
    const entry = this.savedConsoles().find(x => x.slot === item.slot);
    this.items.delete(id);
    return this.restore(entry);
  }
  create(raw, options) {
    return this.createOne(raw, options);
  }
  commitLayout(plan, grid = this.grid) {
    this.onLayout({ plan, grid });
    this.grid = grid;
    for (const placed of plan) if (this.items.has(placed.id)) Object.assign(this.items.get(placed.id), placed);
  }
  setGrid(raw) {
    if (this.starting.size) throw new Error('Wait for the console to open.');
    const { plan, grid } = planGrid(this.items.values(), this.grid, raw);
    this.commitLayout(plan, grid); this.emit('changed');
  }
  async createOne(raw, { resumeId = null, claudeTarget = null } = {}) {
    if (this.stopping) throw new Error('Agent Dock is closing.');
    raw = this.projects?.launch(raw) || raw;
    const opening = planOpening([...this.items.values(), ...this.starting.values()], raw, this.grid);
    if (this.starting.size && (JSON.stringify(opening.grid) !== JSON.stringify(this.grid) || opening.plan.some(x => { const before = this.items.get(x.id) || this.starting.get(x.id); return before && ['slot','width','height'].some(k => x[k] !== before[k]); }))) throw new Error('Wait for the console to open before changing the layout.');
    opening.plan = opening.plan.filter(x => this.items.has(x.id));
    const { slot, width, height } = opening;
    if (!providers.includes(raw?.provider)) throw new Error('Choose a console type.');
    if (resumeId != null && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(resumeId)) throw new Error('The saved conversation ID is invalid.');
    const selectedPermissions = raw.permissions ?? 'default';
    if (!['default', 'unrestricted'].includes(selectedPermissions)) throw new Error('Choose a supported agent permission mode.');
    const permissions = ['codex', 'claude'].includes(raw.provider) || cliAgents.get(raw.provider)?.unrestricted ? selectedPermissions : 'system';
    const model = ['codex', 'claude'].includes(raw.provider) || cliAgents.get(raw.provider)?.model ? String(raw.model ?? '').trim() : '';
    if (model && !/^[a-zA-Z0-9][a-zA-Z0-9._:/\[\]@+-]{0,199}$/.test(model)) throw new Error('Enter a model name or alias, up to 200 characters.');
    const cwd = String(raw.cwd || '');
    if (!path.isAbsolute(cwd) || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Choose an existing project folder.');
    const name = String(raw.name || path.basename(cwd)).trim().slice(0, 64);
    const id = crypto.randomUUID();
    const dir = path.join(this.root, 'sessions', id); fs.mkdirSync(dir, { recursive: true });
    const summary = this.hub ? this.hub.summary() + (this.projects?.summary(raw.projectId) || '') : '';
    let discussion = '';
    if (raw.planDiscussion && !resumeId) {
      if (!['brief', 'research', 'infrastructure', 'roadmap'].includes(raw.planDiscussion)) throw new Error('Choose a planning section.');
      this.projects?.plan(raw.projectId, raw.planDiscussion);
      discussion = `Call dock_context, then dock/project_plan for section ${raw.planDiscussion}. Help me plan this project through a conversation. Ask one focused question and wait for my answer. Discuss alternatives and explain recommendations. Do not edit code, initialize the project or add features. Submit a proposal only after we have discussed this section; I approve it in Projects.`;
    }
    const summaryPath = this.hub && raw.projectId ? path.join(dir, 'AGENT_DOCK.md') : this.hub?.summaryPath;
    if (this.hub && raw.projectId) fs.writeFileSync(summaryPath, summary, { mode: 0o600 });
    const helper = this.runtime?.event || path.join(__dirname, 'agent-event.cjs');
    const node = this.runtime?.node || this.findProgram('node.exe') || this.findProgram('node');
    const claudeInstall = claudeTarget || this.claude || (raw.provider === 'claude' && { kind: 'native', path: this.findProgram('claude') });
    const isWsl = raw.provider === 'claude' && claudeInstall?.kind === 'wsl';
    const bridgeHelper = this.runtime?.tools || path.join(__dirname, 'agent-tools.cjs');
    const mcpConfig = path.join(dir, 'mcp.json');
    if (this.hub && node) atomicJson(mcpConfig, { mcpServers: { agent_dock: { type: 'stdio', command: isWsl ? wslPath(node) : node, args: [bridgeHelper], env: { AGENT_DOCK_BRIDGE_URL: '${AGENT_DOCK_BRIDGE_URL}', AGENT_DOCK_BRIDGE_TOKEN: '${AGENT_DOCK_BRIDGE_TOKEN}', ...(isWsl ? { WSLENV: 'AGENT_DOCK_BRIDGE_URL:AGENT_DOCK_BRIDGE_TOKEN' } : {}) } } } });
    let executable = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'pwsh';
    let args = ['-NoLogo', '-NoProfile'], cliEnv = {};
    if (raw.provider === 'codex') {
      executable = this.nativeCodex();
      if (!executable) throw new Error('Codex CLI was not found. Install it, then restart Agent Dock.');
      if (!node) throw new Error('Node.js is needed for completion notifications.');
      args = [...(resumeId ? ['resume', resumeId] : []), '-c', `notify=${JSON.stringify([node, helper, 'codex-notify'])}`];
      if (model) args.push('--model', model);
      if (this.hub) {
        const context = JSON.stringify(summary).length < 22000 ? summary : `Before doing any work, call the agent_dock dock_context tool to load the shared user instructions and tool summary. The same instructions are in ${summaryPath}. Refresh them at the start of each task. Use dock_tools to discover tools and dock_call to invoke them.`;
        const values = { developer_instructions: context, 'mcp_servers.agent_dock.command': node, 'mcp_servers.agent_dock.args': [bridgeHelper], 'mcp_servers.agent_dock.env_vars': ['AGENT_DOCK_BRIDGE_URL', 'AGENT_DOCK_BRIDGE_TOKEN'], 'mcp_servers.agent_dock.tool_timeout_sec': 150 };
        for (const [key, value] of Object.entries(values)) args.push('-c', `${key}=${JSON.stringify(value)}`);
      }
      if (permissions === 'unrestricted') args.push('--dangerously-bypass-approvals-and-sandbox');
    } else if (raw.provider === 'claude') {
      const claude = claudeInstall?.path;
      if (!claude) throw new Error('Claude Code was not found. Install it, then restart Agent Dock.');
      if (!node) throw new Error('Node.js is needed for Claude tracking.');
      const command = mode => isWsl ? `${shQuote(wslPath(node))} ${shQuote(helper)} ${mode}` : `"${node.replaceAll('\\', '/')}" "${helper.replaceAll('\\', '/')}" ${mode}`;
      const hooks = {};
      for (const type of ['SessionStart', 'UserPromptSubmit', 'Stop', 'PermissionRequest', 'Notification', 'StopFailure', 'SessionEnd']) hooks[type] = [{ hooks: [{ type: 'command', command: command(type), timeout: 15 }] }];
      const settings = path.join(dir, 'claude-settings.json');
      atomicJson(settings, { hooks, statusLine: { type: 'command', command: command('statusline') } });
      const claudeArgs = ['--settings', isWsl ? wslPath(settings) : settings];
      if (model) claudeArgs.push('--model', model);
      if (resumeId) claudeArgs.push('--resume', resumeId);
      if (this.hub) claudeArgs.push('--append-system-prompt-file', isWsl ? wslPath(summaryPath) : summaryPath, '--mcp-config', isWsl ? wslPath(mcpConfig) : mcpConfig);
      if (permissions === 'unrestricted') claudeArgs.push('--dangerously-skip-permissions');
      if (discussion) claudeArgs.push('--', discussion);
      if (isWsl) { executable = 'wsl.exe'; args = ['-d', claudeInstall.distro, '--cd', cwd, '--exec', claude, ...claudeArgs]; }
      else if (claude.toLowerCase().endsWith('.exe')) { executable = claude; args = claudeArgs; }
      else { args.push('-Command', `& ${psQuote(claude)} ${claudeArgs.map(psQuote).join(' ')}`); }
    } else if (cliAgents.has(raw.provider)) {
      const agent = cliAgents.get(raw.provider);
      const program = this.cliSetup?.executable(raw.provider) || this.findProgram(agent.command);
      if (!program) throw new Error(`${agent.name} was not found. Open Settings → Set up agents to install it.`);
      const prepared = this.hub ? prepareCli(raw.provider, { directory: dir, runtime: { ...this.runtime, node, tools: bridgeHelper }, summary, summaryPath, home: this.agentHome, model, permissions }) : { args: [...(agent.args || []), ...(model && agent.model ? [agent.model, model] : [])], env: {} };
      cliEnv = prepared.env;
      if (program.toLowerCase().endsWith('.exe')) { executable = program; args = prepared.args; }
      else args.push('-ExecutionPolicy', 'Bypass', '-Command', `& ${psQuote(program)} ${prepared.args.map(psQuote).join(' ')}`);
    } else if (raw.provider === 'custom') {
      if (typeof raw.command !== 'string' || !raw.command.trim() || raw.command.length > 4000 || raw.command.includes('\0')) throw new Error('Enter the command you want this console to run.');
      const command = this.hub ? raw.command.replaceAll('{instructions}', psQuote(summaryPath)).replaceAll('{mcp_config}', psQuote(mcpConfig)) : raw.command;
      args.push('-NoExit', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64'));
    }
    const env = { ...process.env, AGENT_DOCK_DATA_DIR: this.root, AGENT_DOCK_SESSION_ID: id, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
    delete env.ELECTRON_RUN_AS_NODE;
    for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY']) delete env[key];
    if (this.hub) Object.assign(env, this.hub.grant(id), { AGENT_DOCK_MCP_CONFIG: mcpConfig });
    if (summaryPath) env.AGENT_DOCK_INSTRUCTIONS = summaryPath;
    Object.assign(env, cliEnv);
    if (node) {
      const currentPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
      for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
      env.PATH = path.dirname(node) + path.delimiter + currentPath;
    }
    if (isWsl) env.WSLENV = [...new Set([...(env.WSLENV || '').split(':').filter(Boolean), 'AGENT_DOCK_DATA_DIR', 'AGENT_DOCK_SESSION_ID', 'AGENT_DOCK_BRIDGE_URL', 'AGENT_DOCK_BRIDGE_TOKEN', 'AGENT_DOCK_INSTRUCTIONS/p', 'AGENT_DOCK_MCP_CONFIG/p'])].join(':');
    let trackingWarning = '';
    if (raw.provider === 'codex') {
      this.starting.set(id, { id, slot, width, height, alive: true });
      try { args.push(...await this.prepareCodexSession(executable, { node, helper, root: this.root, session: id, cwd, env })); }
      catch { trackingWarning = 'Agent Dock: Update Codex to restore chats before the first reply finishes.\r\n'; }
      finally { this.starting.delete(id); }
    }
    if (this.stopping) { this.hub?.revoke(id); throw new Error('Agent Dock is closing.'); }
    if (raw.provider === 'codex' && discussion) args.push('--', discussion);
    let terminal;
    try { terminal = this.pty.spawn(executable, args, { name: 'xterm-256color', cols: 110, rows: 30, cwd, env, useConpty: true }); }
    catch (error) { this.hub?.revoke(id); throw error; }
    try { this.commitLayout(opening.plan, opening.grid); }
    catch (error) { terminal.kill(); this.hub?.revoke(id); throw error; }
    for (const [oldId, old] of this.items) if (old.slot === slot && !old.alive) this.items.delete(oldId);
    const consoleKey = /^[a-f0-9-]{36}$/i.test(raw.consoleKey || '') ? raw.consoleKey : id;
    const session = { id, consoleKey, projectId: raw.projectId || null, slot, width, height, name, cwd, provider: raw.provider, permissions, launchModel: model, command: raw.provider === 'custom' ? raw.command : '', claudeTarget: raw.provider === 'claude' ? claudeInstall : undefined, state: 'open', alive: true, cols: 110, rows: 30, createdAt: Date.now(), updatedAt: Date.now(), terminal, buffer: '', sequence: 0, usage: null, providerSessionId: resumeId };
    if (trackingWarning) session.buffer = trackingWarning;
    this.items.set(id, session);
    this.projects?.touch(session.projectId);
    terminal.onData(data => { session.buffer = (session.buffer + data).slice(-250000); this.emit('output', { id, data, sequence: ++session.sequence }); });
    terminal.onExit(({ exitCode }) => {
      this.hub?.revoke(id); session.alive = false; session.state = 'ended'; session.exitCode = exitCode; session.updatedAt = Date.now();
      if (resumeId && exitCode !== 0 && !session.dismissed) {
        session.state = 'error'; session.restoreError = 'The saved conversation could not be reopened. Check the console output, then try again.';
      }
      this.emit('changed');
    });
    this.emit('changed');
    return this.list().find(x => x.id === id);
  }
  write(id, data, { draft = false } = {}) {
    const item = this.items.get(id);
    if (!item?.alive) return;
    if (typeof data !== 'string' || data.length > 65536) throw new Error('Terminal input is too large.');
    item.terminal.write(data);
    if (!draft && /[\r\n]/.test(data)) this.projects?.touch(item.projectId);
    if (!draft && /[\r\n]/.test(data) && cliAgents.has(item.provider)) { item.state = 'active'; item.updatedAt = Date.now(); this.emit('changed'); }
  }
  signal(id, kind) {
    const item = this.items.get(id); if (!item?.alive || !['ready', 'question', 'error'].includes(kind)) return;
    item.state = kind === 'question' ? 'attention' : kind; item.updatedAt = Date.now(); this.emit('changed');
  }
  resize(id, cols, rows) {
    const item = this.items.get(id); if (!item?.alive) return;
    cols = Math.max(20, Math.min(500, Math.floor(cols) || 80)); rows = Math.max(5, Math.min(200, Math.floor(rows) || 24));
    if (item.cols === cols && item.rows === rows) return;
    item.cols = cols; item.rows = rows;
    this.emit('resize', { id, cols, rows });
    item.terminal.resize(cols, rows);
  }
  buffer(id) { const item = this.items.get(id); return { data: item?.buffer || '', sequence: item?.sequence || 0 }; }
  rename(id, name) {
    const item = this.items.get(id);
    if (!item || (!item.alive && !item.restoreError)) throw new Error('This console is no longer open.');
    item.name = name || path.basename(item.cwd) || `Console ${item.slot}`;
    this.emit('changed');
  }
  assignProject(id, projectId) {
    const item = this.items.get(id);
    if (!item || (!item.alive && !item.restoreError) || item.dismissed) throw new Error('This console is no longer open.');
    if (projectId !== null && (typeof projectId !== 'string' || !this.projects?.get(projectId))) throw new Error('Choose an existing project.');
    // Associate metadata only. Never restart the PTY, replay input or change its folder.
    item.projectId = projectId;
    this.projects?.touch(projectId);
    this.emit('changed');
    return this.list().find(x => x.id === id);
  }
  move(id, slot, beforeMove = () => {}) {
    const item = this.items.get(id);
    if (!item || (!item.alive && !item.restoreError)) throw new Error('This console is no longer open.');
    if (!Number.isInteger(slot) || slot < 1 || slot > this.grid.columns * this.grid.rows) throw new Error('Choose a slot inside the console grid.');
    return this.layout({ id, slot }, beforeMove);
  }
  layout(change, beforeMove = () => {}) {
    if (this.starting.size) throw new Error('Wait for the new console to open before moving panels.');
    const plan = planLayout(this.items.values(), change, this.grid);
    beforeMove(plan);
    for (const placed of plan) Object.assign(this.items.get(placed.id), placed);
    for (const [id, old] of this.items) if (!old.alive && !old.restoreError && plan.some(x => x.slot === old.slot)) this.items.delete(id);
    this.emit('changed');
  }
  acknowledge(id) { const item = this.items.get(id); if (item && ['ready', 'attention'].includes(item.state)) { item.state = 'open'; this.emit('changed'); } }
  end(id) {
    const item = this.items.get(id); if (!item) return;
    item.dismissed = true; delete item.restoreError;
    if (item.alive) item.terminal.kill();
    else this.items.delete(id);
    this.emit('changed');
  }
  scanEvents() {
    let changed = false;
    for (const item of this.items.values()) {
      for (const kind of ['identity', 'state', 'usage']) {
        const file = path.join(this.root, 'events', `${item.id}.${kind}.json`);
        try {
          const stat = fs.statSync(file);
          if (this.eventTimes.get(file) === stat.mtimeMs) continue;
          this.eventTimes.set(file, stat.mtimeMs);
          const event = readJson(file, {});
          if (event.session !== item.id) continue;
          if (kind === 'identity') {
            if (item.provider !== 'codex' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(event.providerSessionId || '')) continue;
            this.codexIdentities.set(item.id, event.providerSessionId);
            if (item.providerSessionId !== event.providerSessionId) { item.providerSessionId = event.providerSessionId; changed = true; }
            continue;
          }
          // A late completion from a previous chat must not replace the new
          // chat selected with /new, /resume or /fork in this same terminal.
          if (item.provider === 'codex' && this.codexIdentities.has(item.id) && event.providerSessionId && event.providerSessionId !== this.codexIdentities.get(item.id)) continue;
          if (event.providerSessionId) item.providerSessionId = event.providerSessionId;
          if (event.usage) item.usage = event.usage;
          if (event.messageUsage) this.emit('message-usage', { session: item, messages: [event.messageUsage] });
          if (event.model) item.model = event.model;
          if (event.contextPercent !== undefined) item.contextPercent = event.contextPercent;
          if (event.state && item.alive) {
            item.state = event.state; item.updatedAt = event.at;
            if (['ready', 'attention'].includes(event.state)) this.emit('attention', this.list().find(x => x.id === item.id));
          }
          if (event.limits) this.emit('limits', event.limits);
          changed = true;
        } catch {}
      }
    }
    if (changed) this.emit('changed');
  }
  updateUsage(recent) { for (const session of this.items.values()) { const match = recent.find(x => x.id === session.providerSessionId); if (match?.usage) session.usage = match.usage; if (match?.messages?.length) this.emit('message-usage', { session, messages: match.messages }); } }
  async stop() {
    this.stopping = true;
    const active = [...this.items.values()].filter(x => x.alive);
    if (!active.length) return;
    await new Promise(resolve => {
      const finish = () => { clearTimeout(timeout); this.off('changed', check); resolve(); };
      const check = () => { if (active.every(x => !x.alive)) finish(); };
      const timeout = setTimeout(finish, 5000);
      this.on('changed', check);
      for (const item of active) { try { item.terminal.kill(); } catch {} }
      check();
    });
  }
}
module.exports = { Sessions, psQuote, validateConsoleDefaults };
