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
const { copyConversation } = require('./account-history.cjs');
const { defaultId, inside } = require('./account-profiles.cjs');
const { hasClaudeEditorContext, validateDraftText } = require('./draft-policy.cjs');
function psQuote(text) { return "'" + text.replaceAll("'", "''") + "'"; }
function shQuote(text) { return "'" + text.replaceAll("'", "'\"'\"'") + "'"; }
function envValue(env, name) { return Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]; }
function removeEnv(env, names) { const set = new Set(names.map(x => x.toLowerCase())); for (const key of Object.keys(env)) if (set.has(key.toLowerCase())) delete env[key]; }
function canonical(value) { const result = path.resolve(value).replace(/[\\/]+$/, ''); return process.platform === 'win32' ? result.toLowerCase() : result; }
const UUID_TEXT = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
function plainTerminalText(value) {
  return String(value || '').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b[()][A-Z0-9]/g, '').replace(/\r/g, '\n');
}
function hasCodexFolderTrustPrompt(value) {
  const text = plainTerminalText(value).toLowerCase();
  return /folder\s*access/.test(text) && /trust\s*this\s*folder/.test(text);
}
function ensureOwnedDirectory(parent, target) {
  const parentInfo = fs.lstatSync(parent), parentReal = fs.realpathSync(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || canonical(parentReal) !== canonical(parent)) throw new Error('The private CLI draft folder is linked or unavailable.');
  try { fs.mkdirSync(target); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const info = fs.lstatSync(target), real = fs.realpathSync(target);
  if (!info.isDirectory() || info.isSymbolicLink() || canonical(real) !== canonical(target) || !inside(parentReal, real)) throw new Error('The private CLI draft folder is linked or unavailable.');
  return real;
}
function publicSession({ terminal, buffer, command, claudeTarget, switchOperation, accountConfigDir, editorRoots, ...session }) { return session; }
function terminalEnvironment() {
  const env = { ...process.env };
  // Agents can launch Paddock with NO_COLOR=1 and TERM=dumb for their command
  // output. Our interactive PTYs have their own color capabilities.
  for (const key of Object.keys(env)) {
    if (/^(NO_COLOR|FORCE_COLOR|CLICOLOR|CLICOLOR_FORCE|TERM|COLORTERM)$/i.test(key)) delete env[key];
  }
  return { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
}
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
    this.ssh = dependencies.ssh;
    this.claude = dependencies.claude;
    this.runtime = dependencies.runtime;
    this.cliSetup = dependencies.cliSetup;
    this.agentHome = dependencies.agentHome;
    this.prepareCodexSession = dependencies.prepareCodexSession || prepareCodexSession;
    this.accounts = dependencies.accounts;
    this.draftBridge = dependencies.draftBridge;
    this.getThreadModel = dependencies.getThreadModel || (async () => null);
    this.isBusy = dependencies.isBusy || (() => false);
    this.draftQuietMs = dependencies.draftQuietMs ?? 900;
    this.switchOperations = new Map(); this.pendingStages = new Map(); this.loginAccounts = new Map(); this.setupAccounts = new Map();
    this.grid = gridSize(dependencies.grid); this.onLayout = dependencies.onLayout || (() => {});
    this.contexts = new Map();
    this.refreshProjectContext = () => this.syncProjects();
    this.projects?.on('changed', this.refreshProjectContext);
    this.hub?.on?.('context-changed', this.refreshProjectContext);
  }
  list() { return [...this.items.values()].filter(item => item.kind !== 'code').map(item => ({
    ...publicSession(item),
      ...(this.accounts && ['codex', 'claude'].includes(item.provider) && !['login', 'setup'].includes(item.purpose) ? {
      switchTargets: this.accounts.choices(item.provider).filter(x => x.id !== item.accountId).map(({ id, label, loginCompletedAt }) => ({ id, label, ready: id.endsWith(':default') || !!loginCompletedAt }))
    } : {})
  })).sort((a, b) => a.slot - b.slot); }
  codePanels() { return [...this.items.values()].filter(item => item.kind === 'code' && item.alive).map(publicSession); }
  createCodePanel(raw = {}) {
    if (this.stopping || this.starting.size) throw new Error('Wait for the console to finish opening.');
    const cwd = String(raw.cwd || '');
    if (!path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Choose an existing project folder.');
    const opening = planOpening(this.items.values(), raw, this.grid);
    const item = { id: crypto.randomUUID(), kind: 'code', provider: 'code', purpose: 'code', alive: true, state: 'open', name: 'Code', nameMode: 'custom', permissions: 'default', cwd,
      slot: opening.slot, width: opening.width, height: opening.height, codeSourceKey: typeof raw.codeSourceKey === 'string' ? raw.codeSourceKey.slice(0, 100) : null, consoleKey: raw.consoleKey || crypto.randomUUID(), projectId: raw.projectId || null };
    this.commitLayout(opening.plan, opening.grid); this.items.set(item.id, item); this.emit('changed'); return publicSession(item);
  }
  savedConsoles() {
    return [...this.items.values()].filter(x => (x.alive || x.restoreError) && !x.dismissed && !['login', 'setup'].includes(x.purpose)).map(x => ({
      slot: x.slot, width: x.width || 1, height: x.height || 1, consoleKey: x.consoleKey || x.id, projectId: x.projectId || null, name: x.name, nameMode: x.nameMode, cwd: x.cwd, provider: x.provider, permissions: x.permissions,
      ...(x.kind === 'code' ? { kind: 'code', codeSourceKey: x.codeSourceKey } : {}),
      command: x.command || '', model: x.launchModel || '', accountId: ['codex', 'claude'].includes(x.provider) ? x.accountId || defaultId(x.provider) : null, providerSessionId: ['codex', 'claude'].includes(x.provider) ? x.providerSessionId : null, claudeTarget: x.claudeTarget,
      ...(x.remote ? { remoteHostId: x.remote.hostId, remoteFolder: x.remote.folder } : {})
    })).sort((a, b) => a.slot - b.slot);
  }
  async restore(entry) {
    if (entry.kind === 'code' && entry.provider === 'code') {
      try { return this.createCodePanel(entry); } catch { return null; }
    }
    if (entry.projectId && this.projects && !this.projects.get(entry.projectId)) entry = { ...entry, projectId: null, ...(entry.nameMode === 'project' ? { name: '', nameMode: 'folder' } : {}) };
    try {
      return await this.create({ ...entry, permissions: entry.permissions === 'system' ? 'default' : entry.permissions }, { resumeId: entry.providerSessionId, claudeTarget: entry.claudeTarget, accountId: entry.accountId });
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
  async createOne(raw, { resumeId = null, resumePath = null, claudeTarget = null, accountId = null, sessionId = null, launchId = null, stage = false, resumeModel = null, purpose = 'agent', login = false, cancelCheck = null } = {}) {
    if (this.stopping) throw new Error('Paddock is closing.');
    if (raw?.remoteHostId) return this.createRemote(raw);
    raw = this.projects?.launch(raw) || raw;
    if (raw.nameMode != null && !['project', 'folder', 'custom'].includes(raw.nameMode)) throw new Error('Choose project naming or a custom chat title.');
    const opening = stage ? { slot: raw.slot, width: raw.width || 1, height: raw.height || 1, grid: this.grid, plan: [] } : planOpening([...this.items.values(), ...this.starting.values()], raw, this.grid);
    if (!stage && this.starting.size && (JSON.stringify(opening.grid) !== JSON.stringify(this.grid) || opening.plan.some(x => { const before = this.items.get(x.id) || this.starting.get(x.id); return before && ['slot','width','height'].some(k => x[k] !== before[k]); }))) throw new Error('Wait for the console to open before changing the layout.');
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
    const nameMode = raw.nameMode || (raw.name?.trim() ? 'custom' : 'folder');
    const name = String(nameMode === 'folder' ? path.basename(cwd) : raw.name || path.basename(cwd)).trim().slice(0, 64);
    const id = sessionId || crypto.randomUUID();
    launchId ||= crypto.randomUUID();
    if (!stage && this.items.has(id)) throw new Error('This console is already open.');
    const selectedAccountId = ['codex', 'claude'].includes(raw.provider) ? accountId || defaultId(raw.provider) : null;
    const account = selectedAccountId && this.accounts ? this.accounts.getAccount(selectedAccountId, raw.provider) : null;
    const sessionsRoot = path.join(this.root, 'sessions');
    try { fs.mkdirSync(sessionsRoot); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    ensureOwnedDirectory(this.root, sessionsRoot);
    const dir = path.join(sessionsRoot, id);
    try { fs.mkdirSync(dir); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    ensureOwnedDirectory(sessionsRoot, dir);
    const summary = purpose === 'agent' && this.hub ? this.hub.summary() + (this.projects?.chatSummary({ projectId: raw.projectId, name, cwd }) || '') : '';
    let discussion = '';
    if (raw.planDiscussion && !resumeId) {
      if (!['brief', 'research', 'infrastructure', 'roadmap'].includes(raw.planDiscussion)) throw new Error('Choose a planning section.');
      this.projects?.plan(raw.projectId, raw.planDiscussion);
      discussion = `Call dock_context, then dock/project_plan for section ${raw.planDiscussion}. Help me plan this project through a conversation. Ask one focused question and wait for my answer. Discuss alternatives and explain recommendations. Do not edit code, initialize the project or add features. Submit a proposal only after we have discussed this section; I approve it in Projects.`;
    }
    const summaryPath = purpose === 'agent' && this.hub ? path.join(dir, 'PADDOCK.md') : undefined;
    if (summaryPath) { fs.writeFileSync(summaryPath, summary, { mode: 0o600 }); this.contexts.set(id, summary); }
    const helper = this.runtime?.event || path.join(__dirname, 'agent-event.cjs');
    const node = this.runtime?.node || this.findProgram('node.exe') || this.findProgram('node');
    const claudeInstall = claudeTarget || this.claude || (raw.provider === 'claude' && { kind: 'native', path: this.findProgram('claude') });
    const isWsl = raw.provider === 'claude' && claudeInstall?.kind === 'wsl';
    const bridgeHelper = this.runtime?.tools || path.join(__dirname, 'agent-tools.cjs');
    const mcpConfig = path.join(dir, 'mcp.json');
    if (purpose === 'agent' && this.hub && node) atomicJson(mcpConfig, { mcpServers: { paddock: { type: 'stdio', command: isWsl ? wslPath(node) : node, args: [bridgeHelper], env: { PADDOCK_BRIDGE_URL: '${PADDOCK_BRIDGE_URL}', PADDOCK_BRIDGE_TOKEN: '${PADDOCK_BRIDGE_TOKEN}', ...(isWsl ? { WSLENV: 'PADDOCK_BRIDGE_URL:PADDOCK_BRIDGE_TOKEN' } : {}) } } } });
    let executable = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'pwsh';
    let args = ['-NoLogo', '-NoProfile'], cliEnv = {};
    if (raw.provider === 'codex') {
      executable = this.nativeCodex();
      if (!executable) throw new Error('Codex CLI was not found. Install it, then restart Paddock.');
      args = [...(resumeId ? ['--no-daemon', 'resume', resumeId, '--cd', cwd] : ['--no-daemon'])];
      if (purpose === 'agent') {
        if (!node) throw new Error('Node.js is needed for completion notifications.');
        args.push('-c', `notify=${JSON.stringify([node, helper, 'codex-notify'])}`);
      }
      if (account?.profile) args.push('-c', `sqlite_home=${JSON.stringify(path.join(account.configDir, 'sqlite'))}`);
      if (!resumeId && model) args.push('--model', model);
      if (resumeId && resumeModel) args.push('--model', resumeModel);
      if (this.hub && purpose === 'agent') {
        const context = JSON.stringify(summary).length < 22000 ? summary : `Before doing any work, call the paddock dock_context tool to load the shared user instructions and tool summary. The same instructions are in ${summaryPath}. Refresh them at the start of each task. Use dock_tools to discover tools and dock_call to invoke them.`;
        const values = { developer_instructions: context, 'mcp_servers.paddock.command': node, 'mcp_servers.paddock.args': [bridgeHelper], 'mcp_servers.paddock.env_vars': ['PADDOCK_BRIDGE_URL', 'PADDOCK_BRIDGE_TOKEN'], 'mcp_servers.paddock.tool_timeout_sec': 150 };
        for (const [key, value] of Object.entries(values)) args.push('-c', `${key}=${JSON.stringify(value)}`);
      }
      if (permissions === 'unrestricted') args.push('--dangerously-bypass-approvals-and-sandbox');
    } else if (raw.provider === 'claude') {
      const claude = claudeInstall?.path;
      if (!claude) throw new Error('Claude Code was not found. Install it, then restart Paddock.');
      if (purpose === 'agent' && !node) throw new Error('Node.js is needed for Claude tracking.');
      const command = mode => isWsl ? `${shQuote(wslPath(node))} ${shQuote(helper)} ${mode}` : `"${node.replaceAll('\\', '/')}" "${helper.replaceAll('\\', '/')}" ${mode}`;
      const claudeArgs = [];
      if (purpose === 'agent') {
        const hooks = {};
        for (const type of ['SessionStart', 'UserPromptSubmit', 'Stop', 'PermissionRequest', 'Notification', 'StopFailure', 'SessionEnd']) hooks[type] = [{ hooks: [{ type: 'command', command: command(type), timeout: 15 }] }];
        const settings = path.join(dir, 'claude-settings.json');
        atomicJson(settings, { hooks, statusLine: { type: 'command', command: command('statusline') } });
        claudeArgs.push('--settings', isWsl ? wslPath(settings) : settings);
      }
      if (!resumeId && model) claudeArgs.push('--model', model);
      if (resumeId && resumeModel) claudeArgs.push('--model', resumeModel);
      if (resumeId) claudeArgs.push('--resume', resumePath || resumeId);
      if (this.hub && purpose === 'agent') claudeArgs.push('--append-system-prompt-file', isWsl ? wslPath(summaryPath) : summaryPath, '--mcp-config', isWsl ? wslPath(mcpConfig) : mcpConfig);
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
    const baseEnv = terminalEnvironment();
    const editorCommand = envValue(baseEnv, 'VISUAL') || envValue(baseEnv, 'EDITOR') || '';
    const editorRoots = raw.provider === 'codex' && account?.configDir ? [path.join(account.configDir, 'editor')] : [];
    let claudeTempRoot = null;
    if (raw.provider === 'claude' && purpose === 'agent' && node && this.draftBridge && !isWsl) {
      const launchTemp = path.join(this.root, 'sessions', id, 'draft-editor', launchId);
      ensureOwnedDirectory(path.dirname(path.dirname(launchTemp)), path.dirname(launchTemp));
      ensureOwnedDirectory(path.dirname(launchTemp), launchTemp);
      claudeTempRoot = launchTemp;
      editorRoots.push(path.join(launchTemp, 'claude'));
    }
    let bridge = null;
    if (['codex', 'claude'].includes(raw.provider) && purpose === 'agent' && node && this.draftBridge && !isWsl) {
      try { bridge = this.draftBridge.register(id, launchId, { node, helper: this.runtime?.draftEditor || path.join(__dirname, 'draft-editor.cjs'), editorCommand, editorRoots, provider: raw.provider }); }
      catch { bridge = null; }
    }
    let env = this.accounts && selectedAccountId
      ? this.accounts.environment(selectedAccountId, raw.provider, { baseEnv, bridge, login })
      : { ...baseEnv };
    if (purpose === 'setup') {
      for (const key of Object.keys(env)) if (key.toLowerCase().startsWith('paddock_')) delete env[key];
    } else {
      Object.assign(env, { PADDOCK_DATA_DIR: this.root, PADDOCK_SESSION_ID: id, PADDOCK_LAUNCH_ID: launchId });
      if (selectedAccountId) env.PADDOCK_ACCOUNT_ID = selectedAccountId;
    }
    if (claudeTempRoot && bridge) env.CLAUDE_CODE_TMPDIR = claudeTempRoot;
    delete env.ELECTRON_RUN_AS_NODE;
    removeEnv(env, ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'GOOGLE_API_KEY', 'GEMINI_API_KEY']);
    if (this.hub && purpose === 'agent' && !login) Object.assign(env, this.hub.grant(id, launchId), { PADDOCK_MCP_CONFIG: mcpConfig });
    if (summaryPath) env.PADDOCK_INSTRUCTIONS = summaryPath;
    Object.assign(env, cliEnv);
    if (isWsl && account?.profile && raw.provider === 'claude') {
      const configured = envValue(env, 'CLAUDE_CONFIG_DIR');
      if (configured && path.isAbsolute(configured)) env.CLAUDE_CONFIG_DIR = wslPath(configured);
    }
    if (isWsl && claudeTempRoot && bridge) env.CLAUDE_CODE_TMPDIR = wslPath(claudeTempRoot);
    if (node && purpose === 'agent') {
      const currentPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
      for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
      env.PATH = path.dirname(node) + path.delimiter + currentPath;
    }
    if (isWsl) {
      const inherited = (env.WSLENV || '').split(':').filter(Boolean).filter(value => purpose !== 'setup' || !value.split('/')[0].toLowerCase().startsWith('paddock_'));
      env.WSLENV = [...new Set([...inherited, ...(purpose === 'agent' ? ['PADDOCK_DATA_DIR', 'PADDOCK_SESSION_ID', 'PADDOCK_LAUNCH_ID', 'PADDOCK_ACCOUNT_ID', 'PADDOCK_BRIDGE_URL', 'PADDOCK_BRIDGE_TOKEN', 'PADDOCK_INSTRUCTIONS/p', 'PADDOCK_MCP_CONFIG/p'] : []), ...(envValue(env, 'CLAUDE_CONFIG_DIR') ? ['CLAUDE_CONFIG_DIR/p'] : []), ...(claudeTempRoot && bridge ? ['CLAUDE_CODE_TMPDIR/p'] : [])])].join(':');
    }
    let trackingWarning = '';
    if (purpose === 'agent' && !login && raw.provider === 'codex') {
      if (!stage) this.starting.set(id, { id, slot, width, height, alive: true });
      try { args.push(...await this.prepareCodexSession(executable, { node, helper, root: this.root, session: id, launchId, cwd, env, sqliteHome: account?.profile ? path.join(account.configDir, 'sqlite') : null })); }
      catch { trackingWarning = 'Paddock: Update Codex to restore chats before the first reply finishes.\r\n'; }
      finally { if (!stage) this.starting.delete(id); }
    }
    if (cancelCheck?.()) { this.hub?.revoke(id, launchId); this.draftBridge?.unregister(id, launchId); throw new Error('The console changed before the selected account could open. The original console is still available.'); }
    if (this.stopping) { this.hub?.revoke(id, launchId); this.draftBridge?.unregister(id, launchId); throw new Error('Paddock is closing.'); }
    if (!login && raw.provider === 'codex' && discussion) args.push('--', discussion);
    let terminal;
    try { terminal = this.pty.spawn(executable, args, { name: 'xterm-256color', cols: 110, rows: 30, cwd, env, useConpty: true }); }
    catch (error) { this.hub?.revoke(id, launchId); this.draftBridge?.unregister(id, launchId); throw error; }
    try { if (!stage) this.commitLayout(opening.plan, opening.grid); }
    catch (error) { terminal.kill(); this.hub?.revoke(id, launchId); this.draftBridge?.unregister(id, launchId); throw error; }
    if (!stage) for (const [oldId, old] of this.items) if (old.slot === slot && !old.alive) this.items.delete(oldId);
    const consoleKey = /^[a-f0-9-]{36}$/i.test(raw.consoleKey || '') ? raw.consoleKey : id;
    const session = { id, consoleKey, projectId: raw.projectId || null, slot, width, height, name, nameMode, cwd, provider: raw.provider, permissions, launchModel: resumeModel || model, command: raw.provider === 'custom' ? raw.command : '', claudeTarget: raw.provider === 'claude' ? claudeInstall : undefined, accountId: selectedAccountId, accountLabel: account?.label || null, accountConfigDir: account?.configDir || null, launchId, purpose, switching: false, draftSupported: !!bridge, ...(isWsl && raw.provider === 'claude' ? { draftSupportReason: 'Account switching is unavailable for Claude Code in WSL.' } : {}), editorRoots, state: 'open', alive: true, cols: 110, rows: 30, createdAt: Date.now(), updatedAt: Date.now(), terminal, buffer: '', sequence: 0, usage: null, providerSessionId: resumeId };
    if (resumeModel) { session.model = resumeModel; session.modelId = resumeModel; session.settingsAt = Date.now(); }
    if (trackingWarning) session.buffer = trackingWarning;
    if (!stage) this.items.set(id, session);
    else this.pendingStages.set(launchId, session);
    if (!stage) this.projects?.touch(session.projectId);
    terminal.onData(data => {
      session.buffer = (session.buffer + data).slice(-250000);
      session.lastOutputAt = Date.now();
      if (this.items.get(id) === session) this.emit('output', { id, launchId, data, sequence: ++session.sequence });
      else session.sequence++;
    });
    terminal.onExit(({ exitCode }) => {
      this.hub?.revoke(id, launchId); this.draftBridge?.unregister(id, launchId);
      session.alive = false; session.exitCode = exitCode; session.updatedAt = Date.now();
      if (this.pendingStages.get(launchId) === session) this.pendingStages.delete(launchId);
      if (session.purpose === 'setup' && this.setupAccounts.get(session.accountId) === session) this.setupAccounts.delete(session.accountId);
      if (this.items.get(id) !== session) { session.state = 'ended'; session.exitResolve?.(); this.emit('changed'); return; }
      this.contexts.delete(id); session.state = 'ended';
      if (resumeId && exitCode !== 0 && !session.dismissed) {
        session.state = 'error'; session.restoreError = 'The saved conversation could not be reopened. Check the console output, then try again.';
      }
      if (session.purpose === 'login' && this.accounts) this.accounts.markLoginCompleted(session.accountId, exitCode === 0);
      this.emit('changed');
    });
    if (!stage) this.emit('changed');
    return stage ? publicSession(session) : this.list().find(x => x.id === id);
  }
  async createLoginConsole(accountId, cwd = this.root) {
    if (this.stopping || !this.accounts) throw new Error('Account sign-in is unavailable.');
    const saved = this.accounts.get(accountId);
    if (!saved) throw new Error('Account profile not found.');
    if (this.loginAccounts.has(accountId)) throw new Error('A sign-in console is already open for this account.');
    if (this.setupAccounts.has(accountId)) throw new Error('A setup console is already open for this account.');
    if (!path.isAbsolute(cwd) || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) cwd = this.root;
    const opening = planOpening([...this.items.values(), ...this.starting.values()], { cwd, provider: saved.provider }, this.grid);
    if (this.starting.size) throw new Error('Wait for the console to open before starting sign-in.');
    const id = crypto.randomUUID(), launchId = crypto.randomUUID(), executable = saved.provider === 'codex' ? this.nativeCodex() : (this.claude?.path || this.findProgram('claude'));
    if (!executable) throw new Error(`${saved.provider === 'codex' ? 'Codex' : 'Claude Code'} was not found. Install it, then restart Paddock.`);
    const account = this.accounts.getAccount(accountId, saved.provider), env = this.accounts.environment(accountId, saved.provider, { baseEnv: terminalEnvironment(), login: true });
    Object.assign(env, { PADDOCK_ACCOUNT_ID: accountId });
    let command = executable, args = saved.provider === 'codex' ? ['login'] : ['auth', 'login'];
    const install = saved.provider === 'claude' ? (this.claude || { kind: 'native', path: executable }) : null;
    if (install?.kind === 'wsl') {
      const config = envValue(env, 'CLAUDE_CONFIG_DIR');
      if (config && path.isAbsolute(config)) env.CLAUDE_CONFIG_DIR = wslPath(config);
      env.WSLENV = [...new Set([...(env.WSLENV || '').split(':').filter(Boolean), 'CLAUDE_CONFIG_DIR/p', 'PADDOCK_ACCOUNT_ID'])].join(':');
      command = 'wsl.exe'; args = ['-d', install.distro, '--cd', cwd, '--exec', executable, ...args];
    }
    const terminal = this.pty.spawn(command, args, { name: 'xterm-256color', cols: 110, rows: 30, cwd, env, useConpty: true });
    this.commitLayout(opening.plan, opening.grid);
    for (const [oldId, old] of this.items) if (old.slot === opening.slot && !old.alive) this.items.delete(oldId);
    const session = { id, launchId, consoleKey: id, slot: opening.slot, width: opening.width, height: opening.height, name: `Sign in · ${saved.label}`, nameMode: 'custom', cwd, provider: saved.provider, accountId, accountLabel: saved.label, purpose: 'login', switching: false, state: 'open', alive: true, cols: 110, rows: 30, createdAt: Date.now(), updatedAt: Date.now(), terminal, buffer: '', sequence: 0, usage: null };
    this.items.set(id, session); this.loginAccounts.set(accountId, session);
    terminal.onData(data => { session.buffer = (session.buffer + data).slice(-250000); session.lastOutputAt = Date.now(); this.emit('output', { id, launchId, data, sequence: ++session.sequence }); });
    terminal.onExit(({ exitCode }) => {
      session.alive = false; session.state = 'ended'; session.exitCode = exitCode; session.updatedAt = Date.now();
      if (this.loginAccounts.get(accountId) === session) this.loginAccounts.delete(accountId);
      if (exitCode === 0 && !session.dismissed) this.accounts.markLoginCompleted(accountId, true);
      this.emit('changed');
    });
    this.emit('changed');
    return this.list().find(x => x.id === id);
  }
  async createSetupConsole({ id, launchId, targetAccountId } = {}) {
    const source = this.items.get(id);
    if (!source?.alive || source.dismissed || source.purpose !== 'agent' || source.launchId !== launchId || source.switching || this.isBusy(id)) {
      throw new Error('This console changed. Select it again before setting up the account.');
    }
    if (!this.accounts || targetAccountId === source.accountId || !this.accounts.choices(source.provider).some(choice => choice.id === targetAccountId && (!choice.profile || !!choice.loginCompletedAt))) {
      throw new Error('Choose a signed-in account for this provider before setting up its folder access.');
    }
    const target = this.accounts.getAccount(targetAccountId, source.provider);
    if (target.profile && !target.loginCompletedAt) throw new Error(`Sign in to ${target.label} before setting up its folder access.`);
    if (this.setupAccounts.has(target.id) || this.loginAccounts.has(target.id)) throw new Error(`A sign-in or setup console is already open for ${target.label}.`);
    const reservation = { id, launchId, targetAccountId };
    this.setupAccounts.set(target.id, reservation);
    try {
      const opened = await this.createOne({
        provider: source.provider, cwd: source.cwd, name: `Set up ${target.label}`, nameMode: 'custom',
        permissions: source.permissions, model: source.launchModel
      }, {
        accountId: target.id, purpose: 'setup',
        cancelCheck: () => this.items.get(id) !== source || !source.alive || source.dismissed || source.launchId !== launchId
      });
      const setup = this.items.get(opened.id);
      if (!setup?.alive || this.setupAccounts.get(target.id) !== reservation) throw new Error('The setup console could not be opened. The original console is still running.');
      this.setupAccounts.set(target.id, setup);
      this.emit('changed');
      return opened;
    } catch (error) {
      if (this.setupAccounts.get(target.id) === reservation) this.setupAccounts.delete(target.id);
      throw error;
    }
  }
  async waitForOutputIdle(session, { afterSequence = -1, timeout = 15000, quietMs = this.draftQuietMs } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (!session.alive) throw new Error('The CLI process ended before the composer could be checked. Keep the original console open.');
      if (session.sequence > afterSequence && session.lastOutputAt && Date.now() - session.lastOutputAt >= quietMs) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('The CLI composer did not reach a stable prompt. Keep the original console open and try again.');
  }
  async nativeDraft(session, mode, text) {
    const pending = this.draftBridge.request(session.id, session.launchId, mode, text);
    session.terminal.write('\x07');
    return pending;
  }
  validateSwitchDraft(text, provider) { return validateDraftText(text, provider); }
  async captureNativeDraft(session, { dismissCodexStatusPopup = false } = {}) {
    if (!session.draftSupported || !this.draftBridge) throw new Error('Paddock could not verify the CLI composer draft. Keep the current console open.');
    const captureOnce = async () => {
      await this.waitForOutputIdle(session);
      const marker = `PDK${crypto.randomUUID().replaceAll('-', '')}`;
      const firstSequence = session.sequence;
      const text = await this.nativeDraft(session, 'capture', marker);
      this.validateSwitchDraft(text, session.provider);
      await this.waitForOutputIdle(session, { afterSequence: firstSequence });
      if (!session.alive) throw new Error('The CLI closed while Paddock checked the draft. Keep this console open and restore the draft before closing it.');
      const deleteSequence = session.sequence;
      session.terminal.write('\x7f'.repeat(marker.length));
      await this.waitForOutputIdle(session, { afterSequence: deleteSequence });
      // Removing the capture suffix reopens Codex's slash-command completion
      // popup when the controlled local command is /status. Dismiss only that
      // verified command state so the next acknowledged editor capture works.
      if (dismissCodexStatusPopup && session.provider === 'codex' && text === '/status') {
        const popupSequence = session.sequence;
        session.terminal.write('\x1b');
        await this.waitForOutputIdle(session, { afterSequence: popupSequence });
      }
      return text;
    };
    const first = await captureOnce();
    this.validateSwitchDraft(first, session.provider);
    const second = await captureOnce();
    this.validateSwitchDraft(second, session.provider);
    if (second !== first) throw new Error('The draft changed while Paddock checked it. Keep the current console open.');
    return second;
  }
  async awaitResumeIdentity(session, expectedId, timeout = 20000) {
    if (session.provider === 'codex') return this.confirmCodexResumeIdentity(session, expectedId);
    const stateFile = path.join(this.root, 'events', `${session.id}.${session.launchId}.state.json`);
    const usageFile = path.join(this.root, 'events', `${session.id}.${session.launchId}.usage.json`);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (!session.alive) throw new Error('The selected conversation could not be reopened. Keep the original console open.');
      const state = readJson(stateFile, {}), usage = readJson(usageFile, {});
      for (const event of [state, usage]) if (event.session === session.id && event.launchId === session.launchId && event.accountId === session.accountId && event.providerSessionId) {
        if (event.providerSessionId !== expectedId) throw new Error('The CLI opened a different conversation. Keep the original console open.');
        session.providerSessionId = event.providerSessionId;
        if (event.model) { session.model = event.model; session.modelId = event.modelId || event.model; }
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('The CLI did not confirm the selected conversation. Keep the original console open.');
  }
  async confirmCodexResumeIdentity(session, expectedId) {
    if (!/^[a-f0-9-]{36}$/i.test(expectedId || '')) throw new Error('The selected Codex conversation ID is unavailable. Keep the original console open.');
    await this.waitForOutputIdle(session);
    if (await this.captureNativeDraft(session) !== '') throw new Error('The selected account opened with a draft already present. Keep the original console open.');
    const originalBuffer = session.buffer, initialSequence = session.sequence;
    session.terminal.write('/status');
    await this.waitForOutputIdle(session, { afterSequence: initialSequence });
    const popupSequence = session.sequence;
    session.terminal.write('\x1b');
    await this.waitForOutputIdle(session, { afterSequence: popupSequence });
    if (await this.captureNativeDraft(session, { dismissCodexStatusPopup: true }) !== '/status') throw new Error('Codex did not confirm its local status command. Keep the original console open.');
    const commandSequence = session.sequence;
    const statusStart = session.buffer.length;
    session.terminal.write('\r');
    await this.waitForOutputIdle(session, { afterSequence: commandSequence });
    const statusText = plainTerminalText(session.buffer.slice(statusStart));
    const match = statusText.match(new RegExp(`(?:^|\\n)\\s*Session:\\s*(${UUID_TEXT})`, 'i'));
    if (!match) throw new Error('Codex did not report the selected conversation ID. Keep the original console open.');
    if (match[1].toLowerCase() !== expectedId.toLowerCase()) throw new Error('Codex opened a different conversation. Keep the original console open.');
    if (await this.captureNativeDraft(session) !== '') throw new Error('Codex did not return to an empty composer after its local status check. Keep the original console open.');
    // /status is a local CLI command. Keep its temporary terminal output out of
    // the visible handover checkpoint while retaining the live process state.
    session.buffer = originalBuffer;
    session.providerSessionId = expectedId;
  }
  async switchAccount({ id, launchId, targetAccountId } = {}) {
    const source = this.items.get(id);
    if (!source?.alive || source.dismissed || source.purpose !== 'agent' || source.launchId !== launchId) throw new Error('This console has changed. Select it again before switching.');
    if (!['codex', 'claude'].includes(source.provider) || !this.accounts) throw new Error('Account switching is unavailable for this console.');
    if (this.switchOperations.has(id)) throw new Error('An account switch is already in progress.');
    if (source.switching || ['active', 'attention'].includes(source.state) || this.isBusy(id)) throw new Error('Finish the current task before switching accounts.');
    const target = this.accounts.getAccount(targetAccountId, source.provider);
    if (target.id === source.accountId) throw new Error('Choose a different account for this console.');
    if (target.profile && !target.loginCompletedAt) throw new Error(`Sign in to ${target.label} before switching to it.`);
    const operation = (async () => {
      let staged = null, stageLaunchId = null, committed = false;
      source.switching = true; source.switchTargetId = target.id; this.emit('changed');
      try {
        await this.hub?.waitForLaunchCalls?.(id, launchId);
        if (this.items.get(id) !== source || !source.alive || source.dismissed || !source.switching || this.isBusy(id) || ['active', 'attention'].includes(source.state)) throw new Error('Finish the current task before switching accounts. The original console is still running.');
        const draft = await this.captureNativeDraft(source);
        if (source.provider === 'claude' && hasClaudeEditorContext(draft)) {
          throw new Error('Turn off “Show last response in external editor” in Claude Code before switching. The current console and draft are still running.');
        }
        const currentSource = this.items.get(id);
        if (currentSource !== source || !source.alive || source.dismissed || !source.switching || source.launchId !== launchId || this.isBusy(id) || ['active', 'attention'].includes(source.state)) throw new Error('The console changed while Paddock was checking it. The original console is still running.');
        const liveTarget = this.accounts.getAccount(target.id, source.provider);
        if (liveTarget.id !== target.id || liveTarget.provider !== source.provider || (liveTarget.profile && !liveTarget.loginCompletedAt)) throw new Error('The selected account changed or needs sign-in. The original console is still running.');
        const history = await copyConversation({
          sourceConfig: source.accountConfigDir, targetConfig: liveTarget.configDir, provider: source.provider, sessionId: source.providerSessionId,
          isTargetInUse: () => [...this.items.values()].some(item => item !== source && item.alive && item.provider === source.provider && item.accountId === target.id && item.providerSessionId === source.providerSessionId)
        });
        if (this.items.get(id) !== source || !source.alive || source.dismissed || !source.switching || source.launchId !== launchId) throw new Error('The original console was closed while Paddock checked its conversation.');
        const resumeModel = source.provider === 'codex'
          ? await this.getThreadModel(target.id, source.providerSessionId)
          : (source.modelId || source.model || null);
        if (!resumeModel) throw new Error(`${source.provider === 'codex' ? 'Codex' : 'Claude Code'} has not confirmed the current conversation model. Keep the current console open.`);
        if (this.items.get(id) !== source || !source.alive || source.dismissed || !source.switching || source.launchId !== launchId) throw new Error('The original console was closed while Paddock checked its model.');
        const resumePath = source.provider === 'claude' ? path.join(liveTarget.configDir, 'projects', history.path) : null;
        const raw = { provider: source.provider, cwd: source.cwd, name: source.name, nameMode: source.nameMode, projectId: source.projectId, slot: source.slot, width: source.width, height: source.height, consoleKey: source.consoleKey, permissions: source.permissions, model: source.launchModel };
        stageLaunchId = crypto.randomUUID();
        staged = await this.createOne(raw, {
          resumeId: source.providerSessionId, resumePath, accountId: target.id, sessionId: source.id, launchId: stageLaunchId, stage: true, resumeModel,
          cancelCheck: () => this.items.get(id) !== source || !source.alive || source.dismissed || !source.switching || source.launchId !== launchId
        });
        const stageSession = this.pendingStages.get(stageLaunchId);
        if (!stageSession) throw new Error('The selected account console could not be started. Keep the original console open.');
        await this.waitForOutputIdle(stageSession);
        await this.awaitResumeIdentity(stageSession, source.providerSessionId);
        const targetDraft = await this.captureNativeDraft(stageSession);
        if (source.provider === 'claude' && hasClaudeEditorContext(targetDraft)) {
          throw new Error('Turn off “Show last response in external editor” in Claude Code before switching. Keep the original console open.');
        }
        if (targetDraft !== '') throw new Error('The selected account opened with a draft already present. Keep the original console open.');
        const marker = `PDK${crypto.randomUUID().replaceAll('-', '')}`;
        const restoreSequence = stageSession.sequence;
        await this.nativeDraft(stageSession, 'restore', draft + marker);
        await this.waitForOutputIdle(stageSession, { afterSequence: restoreSequence });
        const deleteSequence = stageSession.sequence;
        stageSession.terminal.write('\x7f'.repeat(marker.length));
        await this.waitForOutputIdle(stageSession, { afterSequence: deleteSequence });
        const restored = await this.captureNativeDraft(stageSession);
        if (restored !== draft) throw new Error('The selected account could not confirm the exact unsent draft. Keep the original console open.');
        if (this.items.get(id) !== source || !source.alive || source.dismissed || !source.switching || source.launchId !== launchId || this.isBusy(id) || ['active', 'attention'].includes(source.state)) throw new Error('The console changed while Paddock was switching accounts. The original console is still running.');
        const finalTarget = this.accounts.getAccount(target.id, source.provider);
        if (finalTarget.id !== liveTarget.id || finalTarget.provider !== source.provider || (finalTarget.profile && !finalTarget.loginCompletedAt)) throw new Error('The selected account changed. The original console is still running.');
        Object.assign(stageSession, {
          name: source.name, nameMode: source.nameMode, projectId: source.projectId,
          slot: source.slot, width: source.width || 1, height: source.height || 1,
          cols: source.cols || 110, rows: source.rows || 30, accountLabel: finalTarget.label
        });
        this.refreshContextFile(source);
        stageSession.terminal.resize?.(stageSession.cols, stageSession.rows);
        this.hub?.revoke(id, source.launchId);
        this.draftBridge?.unregister(id, source.launchId);
        stageSession.switching = false; delete stageSession.switchTargetId;
        this.items.set(id, stageSession); this.pendingStages.delete(stageLaunchId); committed = true;
        this.emit('changed');
        this.emit('output', { id, launchId: stageSession.launchId, data: stageSession.buffer, sequence: stageSession.sequence, reset: true });
        try { source.terminal.kill(); } catch {}
        staged = publicSession(stageSession);
      } catch (error) {
        const stageSession = stageLaunchId && this.pendingStages.get(stageLaunchId);
        if (stageSession && source.provider === 'codex' && hasCodexFolderTrustPrompt(stageSession.buffer) && this.items.get(id) === source && source.alive && !source.dismissed) {
          error = new Error(`${target.label} needs to trust this project folder before it can resume here. Select “Set up ${target.label}” in this console's account menu. Paddock kept this console and its draft open.`);
          this.emit('changed');
        }
        if (stageSession) {
          this.pendingStages.delete(stageLaunchId);
          this.hub?.revoke(stageSession.id, stageSession.launchId); this.draftBridge?.unregister(stageSession.id, stageSession.launchId);
          try { stageSession.terminal.kill(); } catch {}
        }
        throw error;
      } finally {
        if (!committed && this.items.get(id) === source) { source.switching = false; delete source.switchTargetId; this.emit('changed'); }
        this.switchOperations.delete(id);
      }
      return staged;
    })();
    this.switchOperations.set(id, operation);
    return operation;
  }
  createRemote(raw) {
    if (!this.ssh) throw new Error('SSH connections are unavailable.');
    raw = this.projects?.launch(raw) || raw;
    const opening = planOpening([...this.items.values(), ...this.starting.values()], raw, this.grid);
    if (this.starting.size && (JSON.stringify(opening.grid) !== JSON.stringify(this.grid) || opening.plan.some(x => { const before = this.items.get(x.id) || this.starting.get(x.id); return before && ['slot','width','height'].some(k => x[k] !== before[k]); }))) throw new Error('Wait for the console to open before changing the layout.');
    const id = crypto.randomUUID(), consoleKey = /^[a-f0-9-]{36}$/i.test(raw.consoleKey || '') ? raw.consoleKey : id;
    const launch = this.ssh.launch(raw.remoteHostId, { consoleKey, provider: raw.provider, folder: raw.remoteFolder, model: raw.model });
    const cwd = raw.cwd && path.isAbsolute(raw.cwd) && fs.existsSync(raw.cwd) ? raw.cwd : this.root;
    const name = String(raw.name?.trim() || this.projects?.get(raw.projectId)?.name || launch.remote.name).slice(0, 64);
    const env = terminalEnvironment();
    for (const key of Object.keys(env)) if (/^(PADDOCK_|ELECTRON_RUN_AS_NODE$|OPENAI_API_KEY$|ANTHROPIC_API_KEY$|GOOGLE_API_KEY$|GEMINI_API_KEY$)/.test(key)) delete env[key];
    const terminal = this.pty.spawn(launch.executable, launch.args, { name: 'xterm-256color', cwd, cols: 110, rows: 30, env, useConpty: true });
    try { this.commitLayout(opening.plan.filter(x => this.items.has(x.id)), opening.grid); }
    catch (error) { terminal.kill(); throw error; }
    for (const [oldId, old] of this.items) if (old.slot === opening.slot && !old.alive) this.items.delete(oldId);
    const session = { id, consoleKey, projectId: raw.projectId || null, slot: opening.slot, width: opening.width, height: opening.height,
      name, nameMode: raw.nameMode || 'custom', cwd, provider: raw.provider, permissions: 'default', launchModel: raw.model || '',
      remote: launch.remote, state: 'open', alive: true, cols: 110, rows: 30, createdAt: Date.now(), updatedAt: Date.now(),
      terminal, buffer: '', sequence: 0, usage: null };
    this.items.set(id, session);
    terminal.onData(data => { session.buffer = (session.buffer + data).slice(-250000); this.emit('output', { id, data, sequence: ++session.sequence }); });
    terminal.onExit(({ exitCode }) => {
      session.alive = false; session.state = 'ended'; session.exitCode = exitCode;
      if (!session.dismissed) { session.state = 'error'; session.restoreError = 'SSH disconnected. Reconnect to reattach the remote session.'; }
      session.updatedAt = Date.now(); this.emit('changed');
    });
    this.projects?.touch(session.projectId);
    this.emit('changed');
    return this.list().find(x => x.id === id);
  }
  write(id, data, { draft = false } = {}) {
    const item = this.items.get(id);
    if (item?.kind === 'code') throw new Error('This is a read-only code panel.');
    if (!item?.alive) return;
    if (item.switching) throw new Error('This console is switching accounts. Your composer draft stays on the phone until switching finishes.');
    if (typeof data !== 'string' || data.length > 65536) throw new Error('Terminal input is too large.');
    item.terminal.write(data);
    if (!draft && /[\r\n]/.test(data)) this.projects?.touch(item.projectId);
    if (!draft && /[\r\n]/.test(data) && cliAgents.has(item.provider) && !item.remote) { item.state = 'active'; item.updatedAt = Date.now(); this.emit('changed'); }
  }
  signal(id, kind) {
    const item = this.items.get(id); if (!item?.alive || !['ready', 'question', 'error'].includes(kind)) return;
    item.state = kind === 'question' ? 'attention' : kind; item.updatedAt = Date.now(); this.emit('changed');
  }
  resize(id, cols, rows) {
    const item = this.items.get(id); if (!item?.alive) return;
    if (item.kind === 'code') return;
    cols = Math.max(20, Math.min(500, Math.floor(cols) || 80)); rows = Math.max(5, Math.min(200, Math.floor(rows) || 24));
    if (item.cols === cols && item.rows === rows) return;
    item.cols = cols; item.rows = rows;
    this.emit('resize', { id, cols, rows });
    item.terminal.resize(cols, rows);
  }
  buffer(id) { const item = this.items.get(id); return { data: item?.buffer || '', sequence: item?.sequence || 0, launchId: item?.launchId || null }; }
  refreshContextFile(item) {
    if (item.kind === 'code') return;
    if (!this.hub || item.remote) return;
    const file = path.join(this.root, 'sessions', item.id, 'PADDOCK.md'), temp = file + '.tmp';
    try {
      const summary = this.hub.summary() + (this.projects?.chatSummary(item) || '');
      if (this.contexts.get(item.id) === summary) return;
      fs.writeFileSync(temp, summary, { mode: 0o600 }); fs.renameSync(temp, file); this.contexts.set(item.id, summary);
    } catch {
      try { fs.unlinkSync(temp); } catch {}
      this.emit('context-error', 'A chat instruction file could not be refreshed. Use dock_context for the current project.');
    }
  }
  syncProjects() {
    let changed = false;
    for (const item of this.items.values()) {
      if ((!item.alive && !item.restoreError) || item.dismissed) continue;
      if (item.projectId && this.projects && !this.projects.get(item.projectId)) { item.projectId = null; if (item.nameMode === 'project') item.nameMode = 'folder'; changed = true; }
      const name = item.nameMode === 'project' ? this.projects?.get(item.projectId)?.name : item.nameMode === 'folder' ? path.basename(item.cwd) : item.name;
      if (name && name !== item.name) { item.name = name; this.emit('name-changed', item); changed = true; }
      if (item.alive) this.refreshContextFile(item);
    }
    if (changed) this.emit('changed');
  }
  rename(id, name) {
    const item = this.items.get(id);
    if (!item || (!item.alive && !item.restoreError)) throw new Error('This console is no longer open.');
    item.nameMode = name ? 'custom' : item.projectId ? 'project' : 'folder';
    item.name = name || this.projects?.get(item.projectId)?.name || path.basename(item.cwd) || `Console ${item.slot}`;
    if (item.alive) this.refreshContextFile(item);
    this.emit('name-changed', item);
    this.emit('changed');
  }
  assignProject(id, projectId, { useProjectName } = {}) {
    const item = this.items.get(id);
    if (!item || (!item.alive && !item.restoreError) || item.dismissed) throw new Error('This console is no longer open.');
    if (projectId !== null && (typeof projectId !== 'string' || !this.projects?.get(projectId))) throw new Error('Choose an existing project.');
    if (useProjectName != null && typeof useProjectName !== 'boolean') throw new Error('Choose whether to use the project name.');
    // Associate metadata only. Never restart the PTY, replay input or change its folder.
    item.projectId = projectId;
    if (projectId) item.nameMode = useProjectName === true || (useProjectName == null && item.nameMode !== 'custom') ? 'project' : 'custom';
    else if (item.nameMode === 'project') item.nameMode = 'folder';
    this.syncProjects();
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
  cancelPendingStages(id) {
    for (const [launchId, session] of this.pendingStages) {
      if (session.id !== id) continue;
      this.pendingStages.delete(launchId);
      this.hub?.revoke(id, launchId); this.draftBridge?.unregister(id, launchId);
      try { session.terminal.kill(); } catch {}
    }
  }
  end(id) {
    const item = this.items.get(id); if (!item) return;
    if (item.kind === 'code') { this.items.delete(id); this.emit('changed'); return; }
    if (item.remote) return this.ssh.end(item.remote).then(() => {
      item.dismissed = true;
      if (item.alive) item.terminal.kill(); else this.items.delete(id);
      this.emit('changed');
    }).catch(() => { throw new Error('Could not end the remote job. It may still be running. Reconnect and exit it in the terminal.'); });
    item.dismissed = true; delete item.restoreError;
    this.cancelPendingStages(id);
    if (item.alive) item.terminal.kill();
    else this.items.delete(id);
    this.emit('changed');
  }
  scanEvents() {
    let changed = false;
    for (const item of this.items.values()) {
      if (['login', 'setup'].includes(item.purpose) || !item.launchId || item.switching) continue;
      for (const kind of ['identity', 'state', 'usage']) {
        const file = path.join(this.root, 'events', `${item.id}.${item.launchId}.${kind}.json`);
        try {
          const stat = fs.statSync(file);
          if (this.eventTimes.get(file) === stat.mtimeMs) continue;
          this.eventTimes.set(file, stat.mtimeMs);
          const event = readJson(file, {});
          if (event.session !== item.id || event.launchId !== item.launchId) continue;
          if (kind === 'identity') {
            if (item.provider !== 'codex' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(event.providerSessionId || '')) continue;
            this.codexIdentities.set(item.id, event.providerSessionId);
            if (item.providerSessionId !== event.providerSessionId) { item.providerSessionId = event.providerSessionId; delete item.model; delete item.modelId; delete item.effort; delete item.settingsAt; changed = true; }
            continue;
          }
          // A late completion from a previous chat must not replace the new
          // chat selected with /new, /resume or /fork in this same terminal.
          if (item.provider === 'codex' && this.codexIdentities.has(item.id) && event.providerSessionId && event.providerSessionId !== this.codexIdentities.get(item.id)) continue;
          if (event.providerSessionId && event.providerSessionId !== item.providerSessionId) {
            item.providerSessionId = event.providerSessionId;
            delete item.model; delete item.modelId; delete item.effort; delete item.settingsAt;
          }
          if (event.usage) item.usage = event.usage;
          if (event.messageUsage) this.emit('message-usage', { session: item, messages: [event.messageUsage] });
          if (event.model) { item.model = event.model; item.modelId = event.modelId || event.model; item.effort = event.effort || null; item.settingsAt = event.at; }
          if (event.contextPercent !== undefined) item.contextPercent = event.contextPercent;
          if (event.state && item.alive) {
            item.state = event.state; item.updatedAt = event.at;
            if (['ready', 'attention'].includes(event.state)) this.emit('attention', { ...this.list().find(x => x.id === item.id), turnId: event.turnId || null });
          }
          if (event.limits) this.emit('limits', event.limits);
          changed = true;
        } catch {}
      }
    }
    if (changed) this.emit('changed');
  }
  updateUsage(recent) { for (const session of this.items.values()) { if (['login', 'setup'].includes(session.purpose) || (session.provider === 'codex' && (session.accountId || 'codex:default') !== 'codex:default')) continue; const match = recent.find(x => x.id === session.providerSessionId); if (match?.usage) session.usage = match.usage; if (match?.model) { session.model = match.model; session.modelId = match.model; session.effort = match.effort || null; session.settingsAt = match.settingsAt; } if (match?.messages?.length) this.emit('message-usage', { session, messages: match.messages }); } }
  async stop() {
    this.stopping = true;
    this.projects?.off('changed', this.refreshProjectContext);
    this.hub?.off?.('context-changed', this.refreshProjectContext);
    const active = [...this.items.values()].filter(x => x.alive && x.kind !== 'code');
    const staged = [...this.pendingStages.values()];
    for (const item of staged) {
      this.pendingStages.delete(item.launchId);
      this.hub?.revoke(item.id, item.launchId); this.draftBridge?.unregister(item.id, item.launchId);
      try { item.terminal.kill(); } catch {}
    }
    if (!active.length && !staged.length) return;
    await new Promise(resolve => {
      const finish = () => { clearTimeout(timeout); this.off('changed', check); resolve(); };
      const check = () => { if ([...active, ...staged].every(x => !x.alive)) finish(); };
      const timeout = setTimeout(finish, 5000);
      this.on('changed', check);
      for (const item of active) { try { item.terminal.kill(); } catch {} }
      check();
    });
  }
}
module.exports = { Sessions, psQuote, validateConsoleDefaults };
