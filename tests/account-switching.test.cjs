'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { AccountProfiles, defaultId } = require('../electron/account-profiles.cjs');
const { copyConversation, findConversation } = require('../electron/account-history.cjs');
const { DraftBridge } = require('../electron/draft-bridge.cjs');
const { Sessions } = require('../electron/sessions.cjs');
const { CodexAccount } = require('../electron/adapters.cjs');
const { automaticSwitchEligible, thresholdCandidate } = require('../electron/account-switching-policy.cjs');
const { runtimeFiles } = require('../electron/runtime.cjs');
const { editorArgs, resolveWindowsShim, runEditor } = require('../electron/draft-editor.cjs');
const { TerminalStream } = require('../electron/mobile-stream.cjs');

const threadId = '12345678-1234-4234-8234-123456789abc';
const fakeCli = path.join(__dirname, 'fixtures', 'account-switch-fake-cli.cjs');
const draftEditor = path.join(__dirname, '..', 'electron', 'draft-editor.cjs');
const tempRoot = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const accountEnvNames = ['CODEX_HOME', 'CODEX_SQLITE_HOME', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_BASE_URL', 'CLAUDE_CONFIG_DIR', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'PADDOCK_SESSION_ID', 'PADDOCK_LAUNCH_ID', 'PADDOCK_DATA_DIR', 'PADDOCK_INSTRUCTIONS', 'PADDOCK_MCP_CONFIG', 'FAKE_CLI_RECORD_DIR'];
function saveEnvironment() { return Object.fromEntries(accountEnvNames.map(name => [name, process.env[name]])); }
function restoreEnvironment(saved) { for (const [name, value] of Object.entries(saved)) value === undefined ? delete process.env[name] : process.env[name] = value; }

async function fixture(t, { model = 'gpt-5.2-codex', failResumeTarget = false, failTrustTarget = false, holdStageReady = false, deferStageSetup = false, bridgeTimeout = 4000, onEditorExit = null } = {}) {
  const root = tempRoot('paddock-account-switch-'), workspace = path.join(root, 'project');
  fs.mkdirSync(workspace);
  const accounts = new AccountProfiles(root, { env: process.env, home: path.join(root, 'home') });
  const first = accounts.create('codex', 'Primary');
  const second = accounts.create('codex', 'Backup');
  const firstClaude = accounts.create('claude', 'Claude Primary');
  const secondClaude = accounts.create('claude', 'Claude Backup');
  accounts.markLoginCompleted(first.id, true); accounts.markLoginCompleted(second.id, true);
  accounts.markLoginCompleted(firstClaude.id, true); accounts.markLoginCompleted(secondClaude.id, true);
  const bridge = new DraftBridge({ timeout: bridgeTimeout });
  await bridge.start();
  const terminals = [], loginLaunches = [], setupLaunches = [];
  process.env.FAKE_CLI_RECORD_DIR = path.join(root, 'records');
  let prepareCalls = 0, releaseStageSetup = null, markStageSetupStarted;
  const stageSetupStarted = new Promise(resolve => { markStageSetupStarted = resolve; });

  class FakeTerminal {
    constructor(options, exitCode, { initialOutput = 'READY\r\n', holdReady = false, suppressEditor = false } = {}) {
      this.options = options; this.handlers = []; this.exits = []; this.draft = ''; this.writes = []; this.killed = false; this.exitCode = exitCode;
      this.suppressEditor = suppressEditor;
      if (!holdReady) setImmediate(() => { this.emitData(initialOutput); if (this.exitCode != null) this.emitExit(this.exitCode); });
    }
    onData(handler) { this.handlers.push(handler); }
    onExit(handler) { this.exits.push(handler); }
    emitData(data) { if (!this.killed) for (const handler of this.handlers) handler(data); }
    emitExit(exitCode) { if (this.killed) return; this.killed = true; for (const handler of this.exits) handler({ exitCode }); }
    write(data) {
      this.writes.push(data);
      if (data === '\x07') { if (!this.suppressEditor) void this.openEditor(); return; }
      if (data === '/status') {
        this.draft = '/status';
        setImmediate(() => this.emitData('/status'));
        return;
      }
      if (data === '\x1b') {
        setImmediate(() => this.emitData(' '));
        return;
      }
      if (data === '\r' && this.draft === '/status') {
        this.draft = '';
        setImmediate(() => this.emitData(`Session: ${threadId}\r\n`));
        return;
      }
      if (/^\x7f+$/.test(data)) {
        this.draft = this.draft.slice(0, -data.length);
        setImmediate(() => this.emitData(' '));
        return;
      }
      assert.fail(`Unexpected input in fake CLI: ${JSON.stringify(data)}`);
    }
    async openEditor() {
      const roots = JSON.parse(this.options.env.PADDOCK_DRAFT_ROOTS || '[]');
      const root = roots[0]; fs.mkdirSync(root, { recursive: true });
      const file = path.join(root, `fixture-${crypto.randomUUID()}.md`);
      fs.writeFileSync(file, this.draft, 'utf8');
      const helper = this.options.env.PADDOCK_DRAFT_HELPER || draftEditor;
      const child = spawn(process.execPath, [helper, file], { env: this.options.env, windowsHide: true, stdio: 'ignore' });
      child.once('exit', code => {
        if (code === 0) this.draft = fs.readFileSync(file, 'utf8');
        onEditorExit?.(this, code);
        setImmediate(() => this.emitData(' '));
      });
    }
    kill() { this.emitExit(0); }
    resize(cols, rows) { this.cols = cols; this.rows = rows; }
  }

  const sessions = new Sessions(root, {
    accounts, draftBridge: bridge, nativeCodex: () => 'fake-codex.exe', findProgram: () => process.execPath,
    runtime: { node: process.execPath, draftEditor }, prepareCodexSession: async () => {
      prepareCalls++;
      if (deferStageSetup && prepareCalls > 1) { markStageSetupStarted(); await new Promise(resolve => { releaseStageSetup = resolve; }); }
      return [];
    }, draftQuietMs: 2,
    getThreadModel: async () => model,
    isBusy: () => false,
    pty: { spawn(executable, args, options) {
      if (args.includes('login')) {
        const allowed = ['CODEX_HOME', 'CODEX_SQLITE_HOME', 'CLAUDE_CONFIG_DIR', 'PADDOCK_ACCOUNT_ID'];
        loginLaunches.push({ args: [...args], env: Object.fromEntries(allowed.filter(key => options.env[key] !== undefined).map(key => [key, options.env[key]])) });
        const terminal = new FakeTerminal(options, null); terminals.push(terminal); return terminal;
      }
      if (!options.env.PADDOCK_SESSION_ID) {
        setupLaunches.push({ executable, args: [...args], env: Object.fromEntries(['CODEX_HOME', 'CODEX_SQLITE_HOME', 'CLAUDE_CONFIG_DIR'].filter(key => options.env[key] !== undefined).map(key => [key, options.env[key]])) });
        const terminal = new FakeTerminal(options, null, { initialOutput: 'SETUP READY\r\n' }); terminals.push(terminal); return terminal;
      }
      if (args.join(' ').includes('--settings')) {
        const events = path.join(root, 'events'); fs.mkdirSync(events, { recursive: true });
        fs.writeFileSync(path.join(events, `${options.env.PADDOCK_SESSION_ID}.${options.env.PADDOCK_LAUNCH_ID}.usage.json`), JSON.stringify({
          session: options.env.PADDOCK_SESSION_ID, launchId: options.env.PADDOCK_LAUNCH_ID,
          accountId: options.env.PADDOCK_ACCOUNT_ID, providerSessionId: threadId, model: 'claude-sonnet-4-5'
        }));
        if (options.env.CLAUDE_CONFIG_DIR) {
          const terminal = new FakeTerminal(options, null, { initialOutput: 'CLAUDE READY\r\n' }); terminals.push(terminal); return terminal;
        }
      }
      const env = { ...options.env };
      if (failResumeTarget && env.PADDOCK_ACCOUNT_ID !== first.id && args.includes('resume')) env.FAKE_CLI_FAIL_RESUME = '1';
      const child = spawnSync(process.execPath, [fakeCli, ...args], { env, encoding: 'utf8', windowsHide: true });
      if (child.error) throw child.error;
      const isSwitchTarget = args.includes('resume') && env.PADDOCK_ACCOUNT_ID !== first.id;
      const terminal = new FakeTerminal(options, child.status === 0 ? null : child.status, {
        initialOutput: failTrustTarget && isSwitchTarget ? 'Folder access\r\nTrust\x1b[1Dthis\x1b[1Dfolder?\r\n' : 'READY\r\n',
        holdReady: holdStageReady && isSwitchTarget,
        suppressEditor: failTrustTarget && isSwitchTarget
      });
      terminals.push(terminal); return terminal;
    } }
  });
  t.after(async () => {
    let ownedTempRoot = false;
    try { ownedTempRoot = path.dirname(fs.realpathSync(root)) === fs.realpathSync(os.tmpdir()); } catch {}
    try { await sessions.stop(); }
    finally {
      try { await bridge.close(); }
      finally { restoreEnvironment(savedEnvironment); fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
    }
    assert.equal(ownedTempRoot, true, 'fixture data stays within its temporary directory');
  });
  return { root, workspace, accounts, first, second, firstClaude, secondClaude, bridge, sessions, terminals, loginLaunches, setupLaunches, stageSetupStarted, releaseStageSetup: () => releaseStageSetup?.() };
}

function writeClaudeHistory(configDir, id) {
  const file = path.join(configDir, 'projects', 'fixture-project', `${id}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ sessionId: id, type: 'user', message: { content: 'Synthetic fixture history' } })}\n`);
  return file;
}

const savedEnvironment = saveEnvironment();

test('named profiles isolate auth overrides and the Codex usage reader pins SQLite to the profile', async t => {
  const root = tempRoot('paddock-profiles-'), home = path.join(root, 'home'); fs.mkdirSync(home);
  const fakeEnv = {
    CODEX_HOME: path.join(root, 'other-codex'), CODEX_SQLITE_HOME: path.join(root, 'other-sqlite'),
    OpenAI_API_KEY: 'CODEX_TOKEN_SENTINEL', codex_api_key: 'OTHER_TOKEN_SENTINEL', codex_access_token: 'CODEX_ACCESS_SENTINEL', OpenAI_Base_URL: 'https://other.invalid',
    CLAUDE_CONFIG_DIR: path.join(root, 'other-claude'), ANTHROPIC_API_KEY: 'CLAUDE_TOKEN_SENTINEL', ANTHROPIC_AUTH_TOKEN: 'CLAUDE_AUTH_SENTINEL', CLAUDE_CODE_OAUTH_TOKEN: 'CLAUDE_OAUTH_SENTINEL',
    ANTHROPIC_BASE_URL: 'https://other-anthropic.invalid', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_VERTEX: '1', CLAUDE_CODE_USE_FOUNDRY: '1'
  };
  const accounts = new AccountProfiles(root, { env: fakeEnv, home });
  const codex = accounts.create('codex', 'Research');
  const claude = accounts.create('claude', 'Writing');
  const codexEnv = accounts.environment(codex.id, 'codex', { baseEnv: fakeEnv });
  const claudeEnv = accounts.environment(claude.id, 'claude', { baseEnv: fakeEnv });
  assert.equal(codexEnv.CODEX_HOME, codex.configDir);
  assert.equal(codexEnv.CODEX_SQLITE_HOME, path.join(codex.configDir, 'sqlite'));
  assert.equal(fs.lstatSync(codexEnv.CODEX_SQLITE_HOME).isSymbolicLink(), false);
  assert.equal(Object.keys(codexEnv).some(key => ['openai_api_key', 'codex_api_key', 'codex_access_token', 'openai_base_url'].includes(key.toLowerCase())), false);
  assert.equal(claudeEnv.CLAUDE_CONFIG_DIR, claude.configDir);
  assert.equal(Object.keys(claudeEnv).some(key => ['anthropic_api_key', 'anthropic_auth_token', 'claude_code_oauth_token', 'anthropic_base_url', 'claude_code_use_bedrock', 'claude_code_use_vertex', 'claude_code_use_foundry'].includes(key.toLowerCase())), false);
  assert.equal(accounts.environment(defaultId('codex'), 'codex', { baseEnv: fakeEnv }).CODEX_HOME, fakeEnv.CODEX_HOME, 'the default account keeps its existing environment choice');
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'agent-accounts.json'), 'utf8'), /TOKEN_SENTINEL|other\.invalid/);

  const calls = [];
  class FakeChild extends EventEmitter {
    constructor() {
      super(); this.stdout = new PassThrough(); this.stderr = new PassThrough();
      this.stdin = Object.assign(new EventEmitter(), { write: line => {
        const request = JSON.parse(line);
        if (request.id !== undefined && request.method !== 'held') setImmediate(() => this.stdout.emit('data', `${JSON.stringify({ id: request.id, result: request.method === 'thread/read' ? { thread: { model: 'gpt-5.2-codex' } } : {} })}\n`));
      } });
    }
    kill() {}
  }
  const reader = new CodexAccount(() => {}, {
    env: codexEnv, accountId: codex.id, sqliteHome: codexEnv.CODEX_SQLITE_HOME, executable: () => 'fake-codex.exe',
    spawnProcess: (executable, args, options) => { calls.push({ executable, args, env: options.env }); return new FakeChild(); }
  });
  assert.equal(await reader.threadModel(threadId), 'gpt-5.2-codex');
  assert.equal(calls[0].args[0], '-c');
  assert.match(calls[0].args[1], /^sqlite_home=/);
  assert.deepEqual(calls[0].args.slice(-3), ['app-server', '--listen', 'stdio://']);
  assert.equal(calls[0].env.CODEX_HOME, codex.configDir);
  assert.equal(calls[0].env.CODEX_SQLITE_HOME, codexEnv.CODEX_SQLITE_HOME);
  reader.stop();

  const children = [];
  const racingReader = new CodexAccount(() => {}, {
    env: codexEnv, accountId: codex.id, sqliteHome: codexEnv.CODEX_SQLITE_HOME, executable: () => 'fake-codex.exe',
    spawnProcess: () => { const child = new FakeChild(); children.push(child); return child; }
  });
  await racingReader.start();
  const oldPending = racingReader.request('held');
  const oldRejection = assert.rejects(oldPending, /connection closed/);
  racingReader.stop();
  await racingReader.start();
  children[0].emit('exit', 0); // A late old-process callback must not clear the replacement.
  await oldRejection;
  assert.equal(racingReader.child, children[1]);
  await racingReader.request('fresh');
  racingReader.stop();
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
});

test('profile sign-in runs only the provider login command and stays outside saved agent sessions', async t => {
  process.env.PADDOCK_SESSION_ID = 'outer-console'; process.env.PADDOCK_LAUNCH_ID = 'outer-launch'; process.env.PADDOCK_DATA_DIR = 'outer-data'; process.env.PADDOCK_INSTRUCTIONS = 'outer-instructions'; process.env.PADDOCK_MCP_CONFIG = 'outer-mcp';
  const f = await fixture(t), pending = f.accounts.create('codex', 'New profile');
  const login = await f.sessions.createLoginConsole(pending.id, f.workspace);
  assert.equal(login.purpose, 'login');
  assert.equal(f.sessions.list().find(item => item.id === login.id).switchTargets, undefined);
  assert.equal(f.sessions.savedConsoles().some(item => item.consoleKey === login.consoleKey), false);
  assert.deepEqual(f.loginLaunches[0].args, ['login']);
  assert.equal(f.loginLaunches[0].env.CODEX_HOME, pending.configDir);
  const loginEnv = f.sessions.items.get(login.id).terminal.options.env;
  assert.equal(loginEnv.PADDOCK_SESSION_ID, undefined); assert.equal(loginEnv.PADDOCK_LAUNCH_ID, undefined);
  assert.equal(loginEnv.PADDOCK_DATA_DIR, undefined); assert.equal(loginEnv.PADDOCK_INSTRUCTIONS, undefined); assert.equal(loginEnv.PADDOCK_MCP_CONFIG, undefined);
  assert.equal(loginEnv.PADDOCK_ACCOUNT_ID, pending.id);
  await assert.rejects(f.sessions.createLoginConsole(pending.id, f.workspace), /already open/);
  f.sessions.items.get(login.id).terminal.kill();
  assert.ok(f.accounts.get(pending.id).loginCompletedAt);

  const cancelled = f.accounts.create('claude', 'Cancelled login');
  const cancelledLogin = await f.sessions.createLoginConsole(cancelled.id, f.workspace);
  f.sessions.end(cancelledLogin.id); // A user closing the login console must not mark it signed in.
  assert.equal(f.accounts.get(cancelled.id).loginCompletedAt, null);
});

test('a missing login CLI leaves the new profile available for a later sign-in attempt', async t => {
  const f = await fixture(t), pending = f.accounts.create('codex', 'Waiting account');
  f.sessions.nativeCodex = () => null;
  await assert.rejects(f.sessions.createLoginConsole(pending.id, f.workspace), /Codex was not found/);
  assert.equal(f.accounts.get(pending.id).loginCompletedAt, null);
  assert.equal(f.sessions.loginAccounts.has(pending.id), false);
  assert.equal(f.sessions.list().some(item => item.accountId === pending.id), false);
});

test('managed account folders reject sibling links and redirected profile roots', t => {
  const root = tempRoot('paddock-profile-links-'), accounts = new AccountProfiles(root);
  const first = accounts.create('codex', 'First'), second = accounts.create('codex', 'Second');
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.rmSync(second.configDir, { recursive: true, force: true });
  fs.symlinkSync(first.configDir, second.configDir, linkType);
  assert.throws(() => accounts.directory(second.id), /linked or unavailable/);
  fs.rmSync(second.configDir, { recursive: true, force: true });

  const moved = `${accounts.root}-owned`; fs.renameSync(accounts.root, moved);
  fs.symlinkSync(moved, accounts.root, linkType);
  assert.throws(() => accounts.directory(first.id), /inside Paddock data/);
  assert.throws(() => new AccountProfiles(root), /inside Paddock data/);
  t.after(() => {
    fs.rmSync(accounts.root, { recursive: true, force: true, maxRetries: 3 });
    fs.rmSync(moved, { recursive: true, force: true, maxRetries: 3 });
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  });
});

test('fake CLI switches back and forth with exact multiline Unicode draft and the resumed model', async t => {
  process.env.CODEX_HOME = path.join(os.tmpdir(), 'unrelated-codex-profile');
  process.env.CODEX_SQLITE_HOME = path.join(os.tmpdir(), 'unrelated-codex-sqlite');
  process.env.OPENAI_API_KEY = 'CODEX_TOKEN_SENTINEL';
  process.env.CODEX_API_KEY = 'OTHER_TOKEN_SENTINEL';
  process.env.ANTHROPIC_AUTH_TOKEN = 'CLAUDE_TOKEN_SENTINEL';
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'CLAUDE_OAUTH_SENTINEL';
  const f = await fixture(t), source = await f.sessions.create({ provider: 'codex', cwd: f.workspace, model: 'gpt-5.1-codex' }, { accountId: f.first.id });
  await new Promise(resolve => setTimeout(resolve, 5)); f.sessions.scanEvents();
  const original = 'First line\nUnicode: café — 🧪\nEdited line with spaces  \n';
  f.sessions.items.get(source.id).terminal.draft = original;
  const duplicate = f.sessions.switchAccount({ id: source.id, launchId: source.launchId, targetAccountId: f.second.id });
  await assert.rejects(f.sessions.switchAccount({ id: source.id, launchId: source.launchId, targetAccountId: f.second.id }), /already in progress|switching/);
  let switched = await duplicate;
  assert.equal(f.sessions.items.get(source.id).accountId, f.second.id);
  assert.equal(f.sessions.items.get(source.id).terminal.draft, original);
  assert.ok(fs.readFileSync(path.join(f.second.configDir, 'sessions', '2026', '10', '25', `rollout-2026-10-25T00-00-00-${threadId}.jsonl`), 'utf8').includes('fixture resumed turn'));
  const resumedRecord = JSON.parse(fs.readFileSync(path.join(f.root, 'records', `${switched.launchId}.json`), 'utf8'));
  assert.deepEqual(resumedRecord.args.filter((_, index, all) => all[index] === '--model' || all[index] === 'gpt-5.2-codex'), ['--model', 'gpt-5.2-codex']);
  assert.equal(resumedRecord.env.CODEX_HOME, f.second.configDir);
  assert.equal(resumedRecord.env.CODEX_SQLITE_HOME, path.join(f.second.configDir, 'sqlite'));
  assert.equal(resumedRecord.args.find(value => value.startsWith('sqlite_home=')), `sqlite_home=${path.join(f.second.configDir, 'sqlite')}`);
  assert.ok(resumedRecord.args.includes('--no-daemon'), 'switch launches without attaching to a prior background daemon');
  assert.equal(resumedRecord.providerOverridesAbsent, true);

  switched = await f.sessions.switchAccount({ id: source.id, launchId: switched.launchId, targetAccountId: f.first.id });
  assert.equal(f.sessions.items.get(source.id).accountId, f.first.id);
  assert.equal(f.sessions.items.get(source.id).terminal.draft, original);
  const returnedHistory = fs.readFileSync(path.join(f.first.configDir, 'sessions', '2026', '10', '25', `rollout-2026-10-25T00-00-00-${threadId}.jsonl`), 'utf8');
  assert.ok(returnedHistory.includes('fixture resumed turn'), 'a strict-prefix target history receives the newer conversation safely');
  const identityWrites = f.terminals.at(-1).writes.slice(f.terminals.at(-1).writes.indexOf('/status'));
  const commandEnter = identityWrites.indexOf('\r');
  assert.ok(commandEnter > 0, 'the staged Codex identity command is submitted only after composer verification');
  assert.equal(identityWrites[1], '\x1b', 'the known local-command popup is dismissed before capture');
  for (let index = 0; index < commandEnter; index++) {
    if (/^\x7f+$/.test(identityWrites[index])) assert.equal(identityWrites[index + 1], '\x1b', 'each verified /status suffix removal dismisses the reopened completion popup');
  }
  assert.ok(f.terminals.every(terminal => terminal.writes.every(data => ['\x07', '/status', '\x1b', '\r'].includes(data) || /^\x7f+$/.test(data))), 'only the local identity command and marker deletion reach the PTY; no composer text is submitted');

  const publicState = JSON.stringify(f.sessions.list());
  const records = fs.readdirSync(path.join(f.root, 'records')).map(file => fs.readFileSync(path.join(f.root, 'records', file), 'utf8')).join('\n');
  for (const secret of ['CODEX_TOKEN_SENTINEL', 'OTHER_TOKEN_SENTINEL', 'Paddock draft token', original]) {
    assert.doesNotMatch(publicState + records, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(f.sessions.items.get(source.id).accountLabel, 'Primary');
});

test('Claude Code resumes under a named profile and refuses external-editor context without losing the draft', async t => {
  const f = await fixture(t), source = await f.sessions.create({ provider: 'claude', cwd: f.workspace, model: 'sonnet' }, { accountId: f.firstClaude.id, resumeId: threadId });
  writeClaudeHistory(f.firstClaude.configDir, threadId);
  const live = f.sessions.items.get(source.id); live.model = live.modelId = 'claude-sonnet-4-5';
  const draft = 'Keep this line\nUnicode: cafÃ© ðŸ§ª\nTrailing spaces stay  \n';
  live.terminal.draft = draft;
  const switched = await f.sessions.switchAccount({ id: source.id, launchId: live.launchId, targetAccountId: f.secondClaude.id });
  const resumed = f.sessions.items.get(source.id);
  assert.equal(resumed.accountId, f.secondClaude.id);
  assert.equal(resumed.terminal.draft, draft);
  assert.equal(resumed.modelId, 'claude-sonnet-4-5');
  assert.ok(switched.launchId !== source.launchId);
  assert.ok(f.terminals.at(-1).options.env.CLAUDE_CONFIG_DIR === f.secondClaude.configDir);
  assert.ok(f.terminals.at(-1).options.env.CLAUDE_CODE_TMPDIR);
  assert.ok(f.terminals.at(-1).options.env.PADDOCK_DRAFT_TOKEN);

  const contextDraft = "# ─── Claude's last response (for reference; removed on save) ───\n# Synthetic prior response.\n# --- Write your reply below this line --------------------------\n\nMy unsent draft";
  const current = f.sessions.items.get(source.id), currentTerminal = current.terminal;
  currentTerminal.draft = contextDraft;
  await assert.rejects(f.sessions.switchAccount({ id: source.id, launchId: current.launchId, targetAccountId: f.firstClaude.id }), /Show last response in external editor/);
  assert.equal(f.sessions.items.get(source.id).terminal, currentTerminal);
  assert.equal(currentTerminal.draft, contextDraft);
  const claudeDraftDir = path.join(f.root, 'sessions', source.id, 'draft-editor', current.launchId, 'claude');
  const claudeDraftFile = fs.readdirSync(claudeDraftDir).map(name => path.join(claudeDraftDir, name)).find(file => fs.readFileSync(file, 'utf8') === contextDraft);
  assert.ok(claudeDraftFile, 'the Claude helper refuses the reference block before a successful editor return can strip it');
  assert.equal(current.alive, true);
});

test('Claude Code in WSL keeps its editor environment and disables unverified account switching', async t => {
  if (process.platform !== 'win32') return t.skip('WSL console environment is Windows-specific.');
  const before = process.env.VISUAL;
  process.env.VISUAL = 'fixture-editor --wait';
  try {
    const f = await fixture(t), source = await f.sessions.create({ provider: 'claude', cwd: f.workspace }, {
      accountId: f.firstClaude.id, claudeTarget: { kind: 'wsl', path: '/home/fixture/.local/bin/claude', distro: 'Ubuntu' }
    });
    const live = f.sessions.items.get(source.id), env = live.terminal.options.env;
    assert.equal(live.draftSupported, false);
    assert.match(live.draftSupportReason, /WSL/);
    assert.equal(env.VISUAL, 'fixture-editor --wait');
    assert.equal(Object.keys(env).some(key => key.toLowerCase().startsWith('paddock_draft_')), false);
    assert.doesNotMatch(env.WSLENV || '', /PADDOCK_DRAFT/);
  } finally {
    before === undefined ? delete process.env.VISUAL : process.env.VISUAL = before;
  }
});

test('Claude profiles can open a pinned first-use folder setup console before switching', async t => {
  process.env.PADDOCK_SESSION_ID = 'outer-console'; process.env.PADDOCK_LAUNCH_ID = 'outer-launch'; process.env.PADDOCK_DATA_DIR = 'outer-data'; process.env.PADDOCK_INSTRUCTIONS = 'outer-instructions'; process.env.PADDOCK_MCP_CONFIG = 'outer-mcp';
  const f = await fixture(t), source = await f.sessions.create({ provider: 'claude', cwd: f.workspace, model: 'sonnet' }, { accountId: f.firstClaude.id });
  const live = f.sessions.items.get(source.id), draft = 'Keep the source console open.\n';
  live.terminal.draft = draft;
  const setup = await f.sessions.createSetupConsole({ id: source.id, launchId: source.launchId, targetAccountId: f.secondClaude.id });
  const session = f.sessions.items.get(setup.id);
  const setupEnv = session.terminal.options.env;
  assert.equal(setup.purpose, 'setup'); assert.equal(setup.cwd, live.cwd);
  assert.equal(session.provider, 'claude'); assert.equal(session.accountId, f.secondClaude.id);
  assert.equal(setupEnv.CLAUDE_CONFIG_DIR, f.secondClaude.configDir);
  assert.equal(Object.keys(setupEnv).some(key => key.toLowerCase().startsWith('paddock_')), false, 'setup receives no inherited console metadata, hooks or bridge token');
  assert.equal(f.setupLaunches.at(-1).env.CLAUDE_CONFIG_DIR, f.secondClaude.configDir);
  assert.equal(f.setupLaunches.at(-1).args.includes('--settings'), false);
  assert.equal(f.setupLaunches.at(-1).args.includes('--append-system-prompt-file'), false);
  assert.ok(f.sessions.savedConsoles().every(item => item.accountId !== f.secondClaude.id));
  assert.equal(live.terminal.draft, draft); assert.equal(live.alive, true);
});

test('missing login, changed target, unknown resume model, busy session and failed restart keep the original console', async t => {
  const f = await fixture(t), notReady = f.accounts.create('codex', 'Pending');
  const source = await f.sessions.create({ provider: 'codex', cwd: f.workspace }, { accountId: f.first.id });
  await new Promise(resolve => setTimeout(resolve, 5)); f.sessions.scanEvents();
  const originalTerminal = f.sessions.items.get(source.id).terminal;
  await assert.rejects(f.sessions.switchAccount({ id: source.id, launchId: source.launchId, targetAccountId: notReady.id }), /Sign in/);
  assert.equal(f.sessions.items.get(source.id).terminal, originalTerminal);

  f.sessions.isBusy = () => true;
  await assert.rejects(f.sessions.switchAccount({ id: source.id, launchId: source.launchId, targetAccountId: f.second.id }), /Finish the current task/);
  f.sessions.isBusy = () => false;

  const f2 = await fixture(t, { model: null });
  const noModel = await f2.sessions.create({ provider: 'codex', cwd: f2.workspace }, { accountId: f2.first.id });
  await new Promise(resolve => setTimeout(resolve, 5)); f2.sessions.scanEvents();
  const modelSource = f2.sessions.items.get(noModel.id), modelTerminal = modelSource.terminal;
  await assert.rejects(f2.sessions.switchAccount({ id: noModel.id, launchId: noModel.launchId, targetAccountId: f2.second.id }), /has not confirmed/);
  assert.equal(f2.sessions.items.get(noModel.id).terminal, modelTerminal);
  assert.equal(modelSource.alive, true);

  const f3 = await fixture(t, { failResumeTarget: true });
  const restart = await f3.sessions.create({ provider: 'codex', cwd: f3.workspace }, { accountId: f3.first.id });
  await new Promise(resolve => setTimeout(resolve, 5)); f3.sessions.scanEvents();
  const restartSource = f3.sessions.items.get(restart.id), restartTerminal = restartSource.terminal;
  const target = f3.second;
  await assert.rejects(f3.sessions.switchAccount({ id: restart.id, launchId: restart.launchId, targetAccountId: target.id }), /ended before|could not be reopened|stable prompt/);
  assert.equal(f3.sessions.items.get(restart.id).terminal, restartTerminal);
  assert.equal(restartSource.alive, true);
});

test('a target that loses its completed login during draft capture is rechecked before restart', async t => {
  let accountProfiles;
  const f = await fixture(t, { onEditorExit: () => accountProfiles?.markLoginCompleted(f.second.id, false) });
  accountProfiles = f.accounts;
  const source = await f.sessions.create({ provider: 'codex', cwd: f.workspace }, { accountId: f.first.id });
  await new Promise(resolve => setTimeout(resolve, 5)); f.sessions.scanEvents();
  const live = f.sessions.items.get(source.id), terminal = live.terminal;
  await assert.rejects(f.sessions.switchAccount({ id: source.id, launchId: source.launchId, targetAccountId: f.second.id }), /changed or needs sign-in/);
  assert.equal(live.terminal, terminal);
  assert.equal(live.alive, true);
  assert.equal(live.switching, false);
});

test('a Codex folder trust prompt opens an account-pinned setup console and keeps the source draft', async t => {
  const f = await fixture(t, { failTrustTarget: true, bridgeTimeout: 1000 });
  const source = await f.sessions.create({ provider: 'codex', cwd: f.workspace, permissions: 'unrestricted' }, { accountId: f.first.id });
  await new Promise(resolve => setTimeout(resolve, 5)); f.sessions.scanEvents();
  const live = f.sessions.items.get(source.id), sourceTerminal = live.terminal, draft = 'Keep this unsent draft\nUnicode: café 🧪\n';
  live.terminal.draft = draft;
  await assert.rejects(f.sessions.switchAccount({ id: source.id, launchId: source.launchId, targetAccountId: f.second.id }), /Set up Backup/);
  assert.equal(live.terminal, sourceTerminal); assert.equal(live.terminal.draft, draft); assert.equal(live.alive, true);
  const openingSetup = f.sessions.createSetupConsole({ id: source.id, launchId: live.launchId, targetAccountId: f.second.id });
  await assert.rejects(f.sessions.createSetupConsole({ id: source.id, launchId: live.launchId, targetAccountId: f.second.id }), /already open/);
  const setup = await openingSetup;
  assert.equal(setup.purpose, 'setup'); assert.equal(setup.cwd, live.cwd); assert.equal(setup.permissions, 'unrestricted');
  assert.equal(f.sessions.items.get(setup.id).accountId, f.second.id);
  assert.equal(f.sessions.items.get(setup.id).terminal.options.env.CODEX_HOME, f.second.configDir);
  const setupEnv = f.sessions.items.get(setup.id).terminal.options.env;
  assert.equal(Object.keys(setupEnv).some(key => key.toLowerCase().startsWith('paddock_')), false, 'setup has no inherited Paddock session state or provider hooks');
  const setupArgs = f.setupLaunches.at(-1).args;
  assert.equal(setupArgs.includes('--notify'), false);
  assert.equal(setupArgs.some(arg => String(arg).includes('mcp_servers.paddock')), false);
  assert.equal(f.sessions.items.get(setup.id).terminal.draft, '');
  assert.ok(!f.sessions.items.get(setup.id).terminal.options.env.PADDOCK_INSTRUCTIONS);
  assert.equal(f.sessions.savedConsoles().some(item => item.accountId === f.second.id), false, 'setup consoles are transient');
  await assert.rejects(f.sessions.createLoginConsole(f.second.id, f.workspace), /setup console is already open/);
  assert.equal(live.terminal.draft, draft);
});

test('ending the source during staged Codex setup prevents the replacement from spawning', async t => {
  const f = await fixture(t, { deferStageSetup: true });
  const source = await f.sessions.create({ provider: 'codex', cwd: f.workspace }, { accountId: f.first.id });
  await new Promise(resolve => setTimeout(resolve, 5)); f.sessions.scanEvents();
  const operation = f.sessions.switchAccount({ id: source.id, launchId: source.launchId, targetAccountId: f.second.id });
  await f.stageSetupStarted;
  f.sessions.end(source.id);
  f.releaseStageSetup();
  await assert.rejects(operation, /original console was closed|console changed before/);
  assert.equal(f.terminals.length, 1, 'the staged CLI was cancelled before PTY creation');
  assert.equal(f.sessions.pendingStages.size, 0);
  assert.equal(f.sessions.items.get(source.id).alive, false);
});

test('app stop kills a staged replacement while it waits at native startup', async t => {
  const f = await fixture(t, { holdStageReady: true });
  const source = await f.sessions.create({ provider: 'codex', cwd: f.workspace }, { accountId: f.first.id });
  await new Promise(resolve => setTimeout(resolve, 5)); f.sessions.scanEvents();
  const operation = f.sessions.switchAccount({ id: source.id, launchId: source.launchId, targetAccountId: f.second.id });
  const deadline = Date.now() + 2000;
  while (!f.sessions.pendingStages.size && Date.now() < deadline) await new Promise(resolve => setImmediate(resolve));
  const stage = [...f.sessions.pendingStages.values()][0];
  assert.ok(stage, 'the staged process reached the held native startup prompt');
  const stageLaunch = stage.launchId;
  await f.sessions.stop();
  await assert.rejects(operation, /closed before|before the composer could be checked/);
  assert.equal(f.sessions.pendingStages.size, 0);
  assert.equal(f.terminals.every(terminal => terminal.killed), true);
  assert.equal([...f.bridge.tokens.values()].some(owner => owner.launchId === stageLaunch), false, 'the stopped launch loses its draft bridge token');
});

test('switch commit keeps later title, project, slot and PTY size changes', async t => {
  const f = await fixture(t, { holdStageReady: true });
  const source = await f.sessions.create({ provider: 'codex', cwd: f.workspace }, { accountId: f.first.id });
  await new Promise(resolve => setTimeout(resolve, 5)); f.sessions.scanEvents();
  f.sessions.projects = { get: id => id === 'project-b' ? { id, name: 'Project B' } : null, launch: raw => raw, chatSummary: () => 'Project B context', touch() {}, on() {}, off() {} };
  const operation = f.sessions.switchAccount({ id: source.id, launchId: source.launchId, targetAccountId: f.second.id });
  const deadline = Date.now() + 2000;
  while (!f.sessions.pendingStages.size && Date.now() < deadline) await new Promise(resolve => setImmediate(resolve));
  const staged = [...f.sessions.pendingStages.values()][0];
  assert.ok(staged, 'the target is held before its native prompt finishes');
  f.sessions.rename(source.id, 'Review conversation');
  f.sessions.assignProject(source.id, 'project-b', { useProjectName: false });
  f.sessions.layout({ id: source.id, slot: 2 }, () => {});
  f.sessions.resize(source.id, 127, 35);
  const sibling = await f.sessions.create({ provider: 'codex', cwd: f.workspace, slot: 1 }, { accountId: f.first.id });
  staged.terminal.emitData('READY\r\n');
  await operation;
  const current = f.sessions.items.get(source.id);
  assert.equal(current.name, 'Review conversation'); assert.equal(current.nameMode, 'custom');
  assert.equal(current.projectId, 'project-b'); assert.equal(current.slot, 2);
  assert.equal(current.cols, 127); assert.equal(current.rows, 35);
  assert.deepEqual([current.terminal.cols, current.terminal.rows], [127, 35]);
  assert.equal(f.sessions.items.get(sibling.id).slot, 1);
  assert.equal(new Set([...f.sessions.items.values()].filter(item => item.alive).map(item => item.slot)).size, f.sessions.items.size, 'the switched console does not collide with the newly occupied slot');
});

test('unsupported draft content is rejected before capture changes the native composer', async t => {
  const f = await fixture(t), source = await f.sessions.create({ provider: 'codex', cwd: f.workspace }, { accountId: f.first.id });
  await new Promise(resolve => setTimeout(resolve, 5)); f.sessions.scanEvents();
  const live = f.sessions.items.get(source.id), original = 'Unsent text\n[pasted attachment #1]\nKeep this draft';
  live.terminal.draft = original;
  await assert.rejects(f.sessions.switchAccount({ id: source.id, launchId: live.launchId, targetAccountId: f.second.id }), /attachment or control sequence/);
  assert.equal(live.terminal.draft, original);
  const nativeDraftFile = fs.readdirSync(path.join(f.first.configDir, 'editor')).map(name => path.join(f.first.configDir, 'editor', name)).find(file => fs.readFileSync(file, 'utf8') === original);
  assert.ok(nativeDraftFile, 'the helper rejected the editor file before adding a suffix');
  assert.equal(live.alive, true);
  assert.equal(live.switching, false);
});

test('history transfer handles large transcripts, strict-prefix return, conflicts, active targets and references', async t => {
  const root = tempRoot('paddock-history-'), id = threadId;
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  const configA = path.join(root, 'a'), configB = path.join(root, 'b'); fs.mkdirSync(configA); fs.mkdirSync(configB);
  const relative = path.join('sessions', '2026', '10', '25', `rollout-2026-10-25T00-00-00-${id}.jsonl`);
  const meta = `${JSON.stringify({ type: 'session_meta', payload: { id } })}\n`;
  async function write(home, value) { const file = path.join(home, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); await fs.promises.writeFile(file, value); return file; }
  const sourceFile = await write(configA, meta + '{"type":"event_msg","payload":{"text":"one"}}\n');
  await copyConversation({ sourceConfig: configA, targetConfig: configB, provider: 'codex', sessionId: id });
  const targetFile = path.join(configB, relative);
  await fs.promises.appendFile(targetFile, '{"type":"event_msg","payload":{"text":"newer turn"}}\n');
  const updated = await fs.promises.readFile(targetFile);
  await assert.rejects(copyConversation({ sourceConfig: configB, targetConfig: configA, provider: 'codex', sessionId: id, isTargetInUse: () => true }), /Another console is using/);
  assert.equal((await fs.promises.readFile(sourceFile, 'utf8')).includes('newer turn'), false);
  await copyConversation({ sourceConfig: configB, targetConfig: configA, provider: 'codex', sessionId: id });
  assert.deepEqual(await fs.promises.readFile(sourceFile), updated);
  await fs.promises.writeFile(sourceFile, meta + '{"type":"event_msg","payload":{"text":"different"}}\n');
  const divergent = await fs.promises.readFile(sourceFile);
  await assert.rejects(copyConversation({ sourceConfig: configB, targetConfig: configA, provider: 'codex', sessionId: id }), /different history/);
  assert.deepEqual(await fs.promises.readFile(sourceFile), divergent);

  const large = path.join(root, 'large'), prefix = meta + '{"type":"event_msg","payload":{"text":"';
  const longTranscript = prefix + 'a'.repeat(256 * 1024 - Buffer.byteLength(prefix) - 1) + '€"}}\n';
  await write(large, longTranscript);
  const found = await findConversation(large, 'codex', id);
  assert.equal(found.buffer.length, Buffer.byteLength(longTranscript));

  const dependent = path.join(root, 'dependent');
  await write(dependent, `${JSON.stringify({ type: 'session_meta', payload: { id, history_base: 'rollout-reference.jsonl' } })}\n{"type":"event_msg"}\n`);
  await assert.rejects(findConversation(dependent, 'codex', id), /depends on another rollout/);
});

test('threshold offers stay per account and automatic switching needs explicit opt-in and every fresh window', () => {
  const now = Date.now(), window = (minutes, usedPercent, reset = now + 60_000) => ({ minutes, usedPercent, resetsAt: reset });
  const limits = [
    { id: 'codex:a', accountId: 'codex:a', provider: 'codex', observedAt: now, windows: [window(300, 92), window(10080, 10)] },
    { id: 'codex:b', accountId: 'codex:b', provider: 'codex', observedAt: now, windows: [window(300, 15), window(10080, 30)] }
  ];
  const candidate = thresholdCandidate(limits, 'codex:a', 'codex', 90, now);
  assert.equal(candidate.usedPercent, 92);
  assert.equal(thresholdCandidate(limits, 'codex:b', 'codex', 90, now), null, 'percentages from other accounts are not combined');
  const eligible = { limits, sourceAccountId: 'codex:a', targetAccountId: 'codex:b', provider: 'codex', candidate, threshold: 90, now, state: 'ready', busy: false, draftSupported: true };
  assert.equal(automaticSwitchEligible({ ...eligible, enabled: false }), false, 'automatic switching starts off');
  assert.equal(automaticSwitchEligible({ ...eligible, enabled: true }), true);
  assert.equal(automaticSwitchEligible({ ...eligible, enabled: true, busy: true }), false);
  assert.equal(automaticSwitchEligible({ ...eligible, enabled: true, state: 'active' }), false);
  assert.equal(automaticSwitchEligible({ ...eligible, enabled: true, draftSupported: false }), false);
  assert.equal(automaticSwitchEligible({ ...eligible, enabled: true, limits: [...limits, { ...limits[1], id: 'codex:b:other', windows: [window(300, 15), window(10080, 99)] }] }), false, 'another exhausted target window blocks automatic switching');
  assert.equal(automaticSwitchEligible({ ...eligible, enabled: true, limits: limits.map(item => item.accountId === 'codex:b' ? { ...item, windows: [window(300, 15), window(10080, 30, now - 1)] } : item) }), false, 'a target window whose reset has passed is not fresh available quota');
  assert.equal(automaticSwitchEligible({ ...eligible, enabled: true, limits: limits.map(item => item.accountId === 'codex:b' ? { ...item, observedAt: now - 6 * 60_000 } : item) }), false, 'stale target usage stays unknown');
  assert.equal(thresholdCandidate(limits.map(item => item.accountId === 'codex:a' ? { ...item, windows: [window(300, 92, now - 1)] } : item), 'codex:a', 'codex', 90, now), null);
});

test('draft bridge rejects stale operations after timeout and the editor parser preserves quoted shims', async t => {
  const bridge = new DraftBridge({ timeout: 2000 }); await bridge.start();
  t.after(() => bridge.close());
  const launch = crypto.randomUUID(), session = crypto.randomUUID();
  const registration = bridge.register(session, launch, { node: process.execPath, helper: draftEditor, editorCommand: '"C:\\Program Files\\Editor\\code" --wait' });
  assert.deepEqual(editorArgs(registration.editorCommand), ['C:\\Program Files\\Editor\\code', '--wait']);
  const bridgePost = (action, operationId, fields = {}) => fetch(registration.url, {
    method: 'POST', headers: { authorization: `Bearer ${registration.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ action, operationId, sessionId: session, launchId: launch, ...fields })
  });
  const first = bridge.request(session, launch, 'capture'), firstOperation = crypto.randomUUID();
  assert.equal((await (await bridgePost('prepare', firstOperation)).json()).operationId, firstOperation);
  assert.equal((await bridgePost('complete', firstOperation, { text: 'first fixture draft' })).status, 200);
  assert.equal(await first, 'first fixture draft');
  const second = bridge.request(session, launch, 'capture'), secondOperation = crypto.randomUUID();
  assert.equal((await bridgePost('complete', firstOperation, { text: 'stale fixture draft' })).status, 410);
  assert.equal((await (await bridgePost('prepare', secondOperation)).json()).operationId, secondOperation);
  await bridgePost('complete', secondOperation, { text: 'second fixture draft' });
  assert.equal(await second, 'second fixture draft');
  const timeoutBridge = new DraftBridge({ timeout: 25 }); await timeoutBridge.start();
  t.after(() => timeoutBridge.close());
  const expiring = timeoutBridge.request(session, launch, 'capture'), expirationCheck = assert.rejects(expiring, /could not verify/);
  await expirationCheck;
  const blocked = timeoutBridge.request(session, launch, 'capture'), blockedCheck = assert.rejects(blocked, /Restart this console/);
  await blockedCheck;
  await bridge.close();
  assert.equal(resolveWindowsShim('code', { PATH: 'C:\\Tools', PATHEXT: '.EXE;.CMD' }), 'code');
  const root = tempRoot('paddock-editor-delegate-'), editor = path.join(root, 'editor script.cjs'), file = path.join(root, 'draft with spaces.md');
  fs.writeFileSync(editor, "require('node:fs').appendFileSync(process.argv.at(-1), '\\nEdited — ✓');\n"); fs.writeFileSync(file, 'Original');
  const previousEditor = process.env.PADDOCK_REAL_EDITOR;
  process.env.PADDOCK_REAL_EDITOR = `"${process.execPath}" "${editor}" --wait`;
  try {
    assert.equal(await runEditor([file]), 0, 'normal Ctrl+G editor delegation keeps the configured editor command');
    assert.equal(fs.readFileSync(file, 'utf8'), 'Original\nEdited — ✓');
  } finally {
    previousEditor === undefined ? delete process.env.PADDOCK_REAL_EDITOR : process.env.PADDOCK_REAL_EDITOR = previousEditor;
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  }
  if (process.platform === 'win32') {
    const shimRoot = tempRoot('paddock-editor-shim & space '), shim = path.join(shimRoot, 'code.cmd'), edited = path.join(shimRoot, 'draft & (review) with spaces.md');
    fs.writeFileSync(shim, '@echo off\r\nif not "%~1"=="--wait" exit /b 21\r\nif not "%~3"=="" exit /b 22\r\necho.>>"%~2"\r\necho SHIM_OK>>"%~2"\r\nexit /b 0\r\n'); fs.writeFileSync(edited, 'draft');
    const oldEditor = process.env.PADDOCK_REAL_EDITOR; process.env.PADDOCK_REAL_EDITOR = 'code --wait';
    const oldPath = process.env.PATH; process.env.PATH = shimRoot + path.delimiter + oldPath;
    try {
      assert.equal(resolveWindowsShim('code'), shim);
      assert.equal(await runEditor([edited]), 0, 'the resolved shim and draft path are quoted safely without a shell');
      assert.equal(fs.readFileSync(edited, 'utf8'), 'draft\r\nSHIM_OK\r\n');
    } finally {
      oldEditor === undefined ? delete process.env.PADDOCK_REAL_EDITOR : process.env.PADDOCK_REAL_EDITOR = oldEditor;
      oldPath === undefined ? delete process.env.PATH : process.env.PATH = oldPath;
      fs.rmSync(shimRoot, { recursive: true, force: true, maxRetries: 3 });
    }
  }
  t.after(() => {});
});

test('phone terminal stream orders queued output before reset and rejects a delayed old launch', async () => {
  const stream = new TerminalStream({ cols: 40, rows: 8, launchId: 'launch-a', sequence: 0, buffer: '' });
  const pending = [
    stream.write({ launchId: 'launch-a', sequence: 1, data: 'OLD BEFORE RESET' }),
    stream.write({ launchId: 'launch-a', sequence: 2, data: 'CURRENT CHECKPOINT', reset: true }),
    stream.write({ launchId: 'launch-a', sequence: 3, data: 'CURRENT OUTPUT' }),
    stream.write({ launchId: 'launch-old', sequence: 99, data: 'STALE LEAK', reset: true })
  ];
  await Promise.all(pending);
  const frame = await stream.read(0, 0);
  assert.equal(frame.reset, true);
  assert.match(frame.data, /CURRENT CHECKPOINT/);
  assert.match(frame.data, /CURRENT OUTPUT/);
  assert.doesNotMatch(frame.data, /OLD BEFORE RESET|STALE LEAK/);
  assert.equal(stream.launchId, 'launch-a');
  stream.dispose();
});

test('packaged runtime resolves the external draft helper without installation', t => {
  const root = tempRoot('paddock-runtime-fixture-'), runtime = path.join(root, 'resources', 'runtime'); fs.mkdirSync(runtime, { recursive: true });
  const { nodeName } = require('../electron/runtime.cjs');
  fs.mkdirSync(path.dirname(path.join(runtime, nodeName)), { recursive: true }); fs.writeFileSync(path.join(runtime, nodeName), 'fixture'); fs.copyFileSync(draftEditor, path.join(runtime, 'draft-editor.cjs')); fs.copyFileSync(path.join(__dirname, '..', 'electron', 'draft-policy.cjs'), path.join(runtime, 'draft-policy.cjs'));
  const files = runtimeFiles({ isPackaged: true, resourcesPath: path.join(root, 'resources'), findProgram: () => null });
  assert.equal(files.draftEditor, path.join(runtime, 'draft-editor.cjs'));
  assert.equal(fs.existsSync(files.draftEditor), true);
  assert.equal(fs.existsSync(path.join(runtime, 'draft-policy.cjs')), true);
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
});
