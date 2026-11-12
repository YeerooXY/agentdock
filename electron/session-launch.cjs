'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { wslPath } = require('./adapters.cjs');
const { atomicJson } = require('./storage.cjs');
const { planOpening } = require('./console-layout.cjs');
const { providers, byId: cliAgents } = require('./cli-catalog.cjs');
const { prepareCli } = require('./cli-launch.cjs');
const { settingsAdapter } = require('./provider-settings.cjs');
const { envValue, plainTerminalText, hasCodexFolderTrustPrompt } = require('./providers/strategies/index.cjs');
const { defaultId, inside } = require('./account-profiles.cjs');
const { shQuote, quote, shellLaunch, programLaunch, customLaunch } = require('./platform.cjs');
const { cleanWorktree } = require('./worktrees.cjs');
const { stripInheritedSessionEnv } = require('./agent-env.cjs');

function removeEnv(env, names) { const set = new Set(names.map(x => x.toLowerCase())); for (const key of Object.keys(env)) if (set.has(key.toLowerCase())) delete env[key]; }
function canonical(value) { const result = path.resolve(value).replace(/[\\/]+$/, ''); return process.platform === 'win32' ? result.toLowerCase() : result; }
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
  for (const key of Object.keys(env)) {
    if (/^(NO_COLOR|FORCE_COLOR|CLICOLOR|CLICOLOR_FORCE|TERM|COLORTERM)$/i.test(key)) delete env[key];
  }
  return { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
}

// Owns validation, process construction and staged process creation. Terminal
// callbacks belong to SessionEventRuntime; layout and metadata stay in Sessions.
class SessionLauncher {
  constructor(host) { this.host = host; }

  async createOne(raw, { resumeId = null, resumePath = null, claudeTarget = null, accountId = null, sessionId = null, launchId = null, stage = false, resumeModel = null, resumeEffort = null, purpose = 'agent', login = false, cancelCheck = null } = {}) {
    const h = this.host;
    resumeEffort ??= raw?.effort ?? null;
    if (h.isStopping()) throw new Error('Paddock is closing.');
    if (raw?.remoteHostId) return this.createRemote(raw);
    raw = h.getProjects()?.launch(raw) || raw;
    if (raw.nameMode != null && !['project', 'folder', 'custom'].includes(raw.nameMode)) throw new Error('Choose project naming or a custom chat title.');
    const opening = stage ? { slot: raw.slot, width: raw.width || 1, height: raw.height || 1, grid: h.getGrid(), plan: [] } : planOpening([...h.layoutItems(), ...h.starting.values()], raw, h.getGrid());
    if (!stage && h.starting.size && (JSON.stringify(opening.grid) !== JSON.stringify(h.getGrid()) || opening.plan.some(x => { const before = h.items.get(x.id) || h.starting.get(x.id); return before && ['slot','width','height'].some(k => x[k] !== before[k]); }))) throw new Error('Wait for the console to open before changing the layout.');
    opening.plan = opening.plan.filter(x => h.items.has(x.id));
    const { slot, width, height } = opening;
    if (!providers.includes(raw?.provider)) throw new Error('Choose a console type.');
    if (resumeId != null && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(resumeId)) throw new Error('The saved conversation ID is invalid.');
    const selectedPermissions = raw.permissions ?? 'default';
    if (!['default', 'unrestricted'].includes(selectedPermissions)) throw new Error('Choose a supported agent permission mode.');
    const permissions = settingsAdapter(raw.provider).native || cliAgents.get(raw.provider)?.unrestricted ? selectedPermissions : 'system';
    const model = settingsAdapter(raw.provider).native || cliAgents.get(raw.provider)?.model ? String(raw.model ?? '').trim() : '';
    if (resumeEffort !== null && !/^(none|minimal|low|medium|high|xhigh|max|ultra)$/.test(resumeEffort)) throw new Error('Choose a supported effort level.');
    if (model && !/^[a-zA-Z0-9][a-zA-Z0-9._:/\[\]@+-]{0,199}$/.test(model)) throw new Error('Enter a model name or alias, up to 200 characters.');
    const cwd = String(raw.cwd || '');
    if (!path.isAbsolute(cwd) || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('Choose an existing project folder.');
    const nameMode = raw.nameMode || (raw.name?.trim() ? 'custom' : 'folder');
    const name = String(nameMode === 'folder' ? path.basename(cwd) : raw.name || path.basename(cwd)).trim().slice(0, 64);
    const id = sessionId || crypto.randomUUID();
    launchId ||= crypto.randomUUID();
    if (!stage && h.items.has(id)) throw new Error('This console is already open.');
    const selectedAccountId = cliAgents.has(raw.provider) ? accountId || defaultId(raw.provider) : null;
    const account = selectedAccountId && h.getAccounts() ? h.getAccounts().getAccount(selectedAccountId, raw.provider) : null;
    if (selectedAccountId && h.getCredentialSwitch()?.handles(raw.provider)) await h.getCredentialSwitch().activate(raw.provider, selectedAccountId, { except: sessionId });
    const sessionsRoot = path.join(h.root, 'sessions');
    try { fs.mkdirSync(sessionsRoot); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    ensureOwnedDirectory(h.root, sessionsRoot);
    const dir = path.join(sessionsRoot, id);
    try { fs.mkdirSync(dir); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    ensureOwnedDirectory(sessionsRoot, dir);
    const playtimeDataDir = raw.playtimeDataDir == null ? undefined : h.playtimeDirectory(raw.playtimeDataDir);
    const summary = purpose === 'agent' && h.getHub() ? h.getHub().summary({ knowledgeEnabled: h.getHub().knowledgeEnabled?.(raw.projectId) === true }) + (h.getProjects()?.chatSummary({ projectId: raw.projectId, name, cwd }) || '') + h.studyContext({ cwd, playtimeDataDir, purpose, provider: raw.provider, projectId: raw.projectId || null }) : '';
    const summaryPath = purpose === 'agent' && h.getHub() ? path.join(dir, 'PADDOCK.md') : undefined;
    if (summaryPath) { fs.writeFileSync(summaryPath, summary, { mode: 0o600 }); h.contexts.set(id, summary); }
    const helper = h.getRuntime()?.event || path.join(__dirname, 'agent-event.cjs');
    const node = h.getRuntime()?.node || h.findProgram('node.exe') || h.findProgram('node');
    const strategy = settingsAdapter(raw.provider);
    const { install: claudeInstall, wsl: isWsl } = strategy.resolveInstall({ claudeTarget, getClaude: () => h.getClaude(), findProgram: n => h.findProgram(n) });
    const bridgeHelper = h.getRuntime()?.tools || path.join(__dirname, 'agent-tools.cjs');
    const mcpConfig = path.join(dir, 'mcp.json');
    if (purpose === 'agent' && h.getHub() && node) atomicJson(mcpConfig, { mcpServers: { paddock: { type: 'stdio', command: isWsl ? wslPath(node) : node, args: [bridgeHelper], env: { PADDOCK_BRIDGE_URL: '${PADDOCK_BRIDGE_URL}', PADDOCK_BRIDGE_TOKEN: '${PADDOCK_BRIDGE_TOKEN}', ...(isWsl ? { WSLENV: 'PADDOCK_BRIDGE_URL:PADDOCK_BRIDGE_TOKEN' } : {}) } } } });
    let { executable, args } = shellLaunch(), cliEnv = {};
    const adapterCtx = {
      purpose, model, resumeId, resumePath, resumeModel, resumeEffort,
      permissions, account, node, helper, summary, summaryPath,
      mcpConfig, dir, cwd, isWsl, claudeInstall,
      hub: !!h.getHub(), codexScrollback: () => h.codexScrollback(),
      nativeCodex: () => h.nativeCodex(), programLaunch, prepareCli,
      cliAgents, agentHome: h.agentHome, cliSetup: h.getCliSetup(),
      findProgram: n => h.findProgram(n), runtime: h.getRuntime(),
      bridgeHelper, atomicJson, shQuote, wslPath, quote, customLaunch, shellLaunch,
      provider: raw.provider, command: raw.command,
      profiles: h.getHub()?.config?.profiles || []
    };
    const launched = strategy.launchArgs(adapterCtx);
    executable = launched.executable;
    args = launched.args;
    cliEnv = launched.env;
    const baseEnv = terminalEnvironment();
    const editorCommand = envValue(baseEnv, 'VISUAL') || envValue(baseEnv, 'EDITOR') || '';
    const { editorRoots, tempRoot } = strategy.prepareEditor({ id, launchId, account, purpose, node, draftBridge: h.getDraftBridge(), wsl: isWsl, root: h.root, ensureOwnedDirectory });
    let bridge = null;
    if (strategy.switchMethod === 'resume' && purpose === 'agent' && node && h.getDraftBridge() && !isWsl) {
      try { bridge = h.getDraftBridge().register(id, launchId, { node, helper: h.getRuntime()?.draftEditor || path.join(__dirname, 'draft-editor.cjs'), editorCommand, editorRoots, provider: raw.provider }); }
      catch { bridge = null; }
    }
    let env = h.getAccounts() && selectedAccountId
      ? h.getAccounts().environment(selectedAccountId, raw.provider, { baseEnv, bridge, login })
      : { ...baseEnv };
    if (purpose === 'setup') {
      for (const key of Object.keys(env)) if (key.toLowerCase().startsWith('paddock_')) delete env[key];
    } else {
      Object.assign(env, { PADDOCK_DATA_DIR: h.root, PADDOCK_SESSION_ID: id, PADDOCK_LAUNCH_ID: launchId });
      if (selectedAccountId) env.PADDOCK_ACCOUNT_ID = selectedAccountId;
    }
    stripInheritedSessionEnv(env);
    delete env.ELECTRON_RUN_AS_NODE;
    removeEnv(env, ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'GOOGLE_API_KEY', 'GEMINI_API_KEY']);
    if (h.getHub() && purpose === 'agent' && !login) Object.assign(env, h.getHub().grant(id, launchId), { PADDOCK_MCP_CONFIG: mcpConfig });
    if (summaryPath) env.PADDOCK_INSTRUCTIONS = summaryPath;
    Object.assign(env, cliEnv);
    if (node && purpose === 'agent') {
      const currentPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
      for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
      env.PATH = path.dirname(node) + path.delimiter + currentPath;
    }
    strategy.applyEnvironment(env, { account, wsl: isWsl, tempRoot, bridge, purpose, wslPath });
    const hold = () => {
      if (!stage) h.starting.set(id, { id, slot, width, height, alive: true });
      return () => { if (!stage) h.starting.delete(id); };
    };
    const tracking = strategy.prepareTracking({ purpose, login, executable, args, account, hold, prepareSession: (...values) => h.prepareCodexSession(...values), options: { node, helper, root: h.root, session: id, launchId, cwd, env } });
    const trackingWarning = typeof tracking === 'string' ? tracking : await tracking;
    if (cancelCheck?.()) { h.getHub()?.revoke(id, launchId); h.getDraftBridge()?.unregister(id, launchId); throw new Error('The console changed before the selected account could open. The original console is still available.'); }
    if (h.isStopping()) { h.getHub()?.revoke(id, launchId); h.getDraftBridge()?.unregister(id, launchId); throw new Error('Paddock is closing.'); }
    let terminal;
    try { terminal = h.pty.spawn(executable, args, { name: 'xterm-256color', cols: 110, rows: 30, cwd, env, useConpty: true }); }
    catch (error) { h.getHub()?.revoke(id, launchId); h.getDraftBridge()?.unregister(id, launchId); throw error; }
    try { if (!stage) h.commitLayout(opening.plan, opening.grid); }
    catch (error) { terminal.kill(); h.getHub()?.revoke(id, launchId); h.getDraftBridge()?.unregister(id, launchId); throw error; }
    if (!stage) for (const [oldId, old] of h.items) if (old.slot === slot && !old.alive) h.items.delete(oldId);
    const consoleKey = /^[a-f0-9-]{36}$/i.test(raw.consoleKey || '') ? raw.consoleKey : id;
    const session = { id, consoleKey, projectId: raw.projectId || null, ...(cleanWorktree(raw.worktree) ? { worktree: cleanWorktree(raw.worktree) } : {}), slot, width, height, name, nameMode, cwd, provider: raw.provider, permissions, launchModel: resumeModel || model, command: raw.provider === 'custom' ? raw.command : '', accountId: selectedAccountId, accountLabel: account?.label || null, accountConfigDir: account?.configDir || null, launchId, purpose, switching: false, draftSupported: !!bridge, ...strategy.sessionFields({ install: claudeInstall, wsl: isWsl }), editorRoots, state: 'open', alive: true, cols: 110, rows: 30, createdAt: Date.now(), updatedAt: Date.now(), terminal, buffer: '', sequence: 0, usage: null, providerSessionId: resumeId };
    session.launchEffort = resumeEffort;
    if (resumeModel) { session.model = resumeModel; session.modelId = resumeModel; session.settingsAt = Date.now(); }
    if (playtimeDataDir) session.playtimeDataDir = playtimeDataDir;
    if (trackingWarning) session.buffer = trackingWarning;
    if (!stage) h.items.set(id, session);
    else h.pendingStages.set(launchId, session);
    if (!stage) h.getProjects()?.touch(session.projectId);
    h.events.bindAgent(session, { resumeId });
    if (!stage) h.emit('changed');
    return stage ? publicSession(session) : h.listItem(id);
  }

  async createLoginConsole(accountId, cwd = this.host.root) {
    const h = this.host;
    if (h.isStopping() || !h.getAccounts()) throw new Error('Account sign-in is unavailable.');
    const saved = h.getAccounts().get(accountId);
    if (!saved) throw new Error('Account profile not found.');
    if (h.loginAccounts.has(accountId)) throw new Error('A sign-in console is already open for this account.');
    if (h.setupAccounts.has(accountId)) throw new Error('A setup console is already open for this account.');
    if (!path.isAbsolute(cwd) || !fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) cwd = h.root;
    const opening = planOpening([...h.layoutItems(), ...h.starting.values()], { cwd, provider: saved.provider }, h.getGrid());
    if (h.starting.size) throw new Error('Wait for the console to open before starting sign-in.');
    const adapter = h.getAccounts().provider(saved.provider);
    if (!adapter?.namedProfiles || !adapter.login) throw new Error('Sign-in for a separate account is unavailable for this provider.');
    const strategy = settingsAdapter(saved.provider), getClaude = () => h.getClaude();
    const id = crypto.randomUUID(), launchId = crypto.randomUUID(), executable = strategy.loginExecutable({ provider: saved.provider, agent: cliAgents.get(saved.provider), cliSetup: h.getCliSetup(), nativeCodex: () => h.nativeCodex(), getClaude, findProgram: name => h.findProgram(name) });
    if (!executable) throw new Error(`${adapter.name} was not found. Install it, then restart Paddock.`);
    const switched = !!h.getCredentialSwitch()?.handles(saved.provider);
    if (switched) await h.getCredentialSwitch().activate(saved.provider, accountId);
    const account = h.getAccounts().getAccount(accountId, saved.provider), env = h.getAccounts().environment(accountId, saved.provider, { baseEnv: terminalEnvironment(), login: true });
    Object.assign(env, { PADDOCK_ACCOUNT_ID: accountId });
    const { executable: command, args } = strategy.loginLaunch({ executable, args: [...adapter.login.args], env, cwd, getClaude, wslPath, programLaunch });
    const terminal = h.pty.spawn(command, args, { name: 'xterm-256color', cols: 110, rows: 30, cwd, env, useConpty: true });
    h.commitLayout(opening.plan, opening.grid);
    for (const [oldId, old] of h.items) if (old.slot === opening.slot && !old.alive) h.items.delete(oldId);
    const session = { id, launchId, consoleKey: id, slot: opening.slot, width: opening.width, height: opening.height, name: `Sign in (${saved.label})`, nameMode: 'custom', cwd, provider: saved.provider, accountId, accountLabel: saved.label, purpose: 'login', switching: false, state: 'open', alive: true, cols: 110, rows: 30, createdAt: Date.now(), updatedAt: Date.now(), terminal, buffer: '', sequence: 0, usage: null };
    h.items.set(id, session); h.loginAccounts.set(accountId, session);
    h.events.bindLogin(session, { switched });
    h.emit('changed');
    return h.listItem(id);
  }

  createRemote(raw) {
    const h = this.host;
    if (!h.getSsh()) throw new Error('SSH connections are unavailable.');
    raw = h.getProjects()?.launch(raw) || raw;
    const opening = planOpening([...h.layoutItems(), ...h.starting.values()], raw, h.getGrid());
    if (h.starting.size && (JSON.stringify(opening.grid) !== JSON.stringify(h.getGrid()) || opening.plan.some(x => { const before = h.items.get(x.id) || h.starting.get(x.id); return before && ['slot','width','height'].some(k => x[k] !== before[k]); }))) throw new Error('Wait for the console to open before changing the layout.');
    const id = crypto.randomUUID(), consoleKey = /^[a-f0-9-]{36}$/i.test(raw.consoleKey || '') ? raw.consoleKey : id;
    const launch = h.getSsh().launch(raw.remoteHostId, { consoleKey, provider: raw.provider, folder: raw.remoteFolder, model: raw.model });
    const cwd = raw.cwd && path.isAbsolute(raw.cwd) && fs.existsSync(raw.cwd) ? raw.cwd : h.root;
    const name = String(raw.name?.trim() || h.getProjects()?.get(raw.projectId)?.name || launch.remote.name).slice(0, 64);
    const env = terminalEnvironment();
    for (const key of Object.keys(env)) if (/^(PADDOCK_|ELECTRON_RUN_AS_NODE$|OPENAI_API_KEY$|ANTHROPIC_API_KEY$|GOOGLE_API_KEY$|GEMINI_API_KEY$)/.test(key)) delete env[key];
    const terminal = h.pty.spawn(launch.executable, launch.args, { name: 'xterm-256color', cwd, cols: 110, rows: 30, env, useConpty: true });
    try { h.commitLayout(opening.plan.filter(x => h.items.has(x.id)), opening.grid); }
    catch (error) { terminal.kill(); throw error; }
    for (const [oldId, old] of h.items) if (old.slot === opening.slot && !old.alive) h.items.delete(oldId);
    const session = { id, consoleKey, projectId: raw.projectId || null, slot: opening.slot, width: opening.width, height: opening.height,
      name, nameMode: raw.nameMode || 'custom', cwd, provider: raw.provider, permissions: 'default', launchModel: raw.model || '',
      remote: launch.remote, state: 'open', alive: true, cols: 110, rows: 30, createdAt: Date.now(), updatedAt: Date.now(),
      terminal, buffer: '', sequence: 0, usage: null };
    h.items.set(id, session);
    h.events.bindRemote(session);
    h.getProjects()?.touch(session.projectId);
    h.emit('changed');
    return h.listItem(id);
  }
}

module.exports = { SessionLauncher, publicSession, plainTerminalText, hasCodexFolderTrustPrompt, terminalEnvironment, ensureOwnedDirectory };
