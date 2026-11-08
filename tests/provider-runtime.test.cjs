'use strict';
// Provider runtime strategies and the screen profiles served to the phone.
// Hooks run against fakes: no CLI, credential store or provider request is used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../electron/providers/index.cjs');
const { commonRuntime } = require('../electron/providers/strategies/index.cjs');
const { settingsAdapter } = require('../electron/provider-settings.cjs');
const { hasClaudeEditorContext } = require('../electron/draft-policy.cjs');
const launch = require('../electron/session-launch.cjs');
const { AccountSwitching } = require('../electron/account-switching.cjs');
const { render } = require('../scripts/generate-agent-profiles.cjs');
const recorded = require('./fixtures/state/dto/phone-agent-profiles.json');

const repo = path.join(__dirname, '..');
const providersDir = path.join(repo, 'electron', 'providers');
const wslPath = value => `/mnt/${value}`;
const uuid = '12345678-1234-4234-8234-123456789abc';

test('registry load contract: adapters are data and strategies never reach back to a loader', () => {
  for (const id of registry.ids) {
    const source = fs.readFileSync(path.join(providersDir, `${id}.cjs`), 'utf8');
    assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s*\(/, `${id} must stay data only`);
  }
  const strategies = path.join(providersDir, 'strategies');
  for (const file of fs.readdirSync(strategies)) {
    const source = fs.readFileSync(path.join(strategies, file), 'utf8');
    for (const [, target] of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      assert.ok(target.startsWith('node:') || /^\.\/[a-z-]+\.cjs$/.test(target), `${file} imports ${target}`);
    }
  }
  const profiles = fs.readFileSync(path.join(providersDir, 'screen-profiles.cjs'), 'utf8');
  assert.doesNotMatch(profiles, /\brequire\s*\(/);
});

test('adapter metadata is frozen and JSON-safe after load', () => {
  for (const adapter of registry.adapters) {
    assert.equal(Object.isFrozen(adapter), true, adapter.id);
    assert.equal(Object.isFrozen(adapter.usage), true, adapter.id);
    assert.deepEqual(JSON.parse(JSON.stringify(adapter)), structuredClone(adapter), adapter.id);
  }
  assert.throws(() => { 'use strict'; registry.byId('codex').usage.reader = 'other'; }, TypeError);
});

test('every provider and console type exposes the complete runtime interface', () => {
  for (const id of [...registry.ids, 'shell', 'custom', '__unknown__']) {
    const strategy = settingsAdapter(id);
    for (const hook of Object.keys(commonRuntime)) assert.equal(typeof strategy[hook], 'function', `${id}.${hook}`);
  }
});

test('generic providers keep the launcher defaults', async () => {
  const strategy = settingsAdapter('grok'), env = { A: '1' }, args = ['x'];
  assert.deepEqual(strategy.resolveInstall({ getClaude: () => assert.fail('not Claude'), findProgram: () => assert.fail('not Claude') }), { install: null, wsl: false });
  assert.deepEqual(strategy.prepareEditor({ account: { configDir: 'C:/a' } }), { editorRoots: [], tempRoot: null });
  strategy.applyEnvironment(env, {});
  strategy.appendDiscussion(args, { discussion: 'hello' });
  assert.deepEqual(env, { A: '1' }); assert.deepEqual(args, ['x']);
  assert.equal(strategy.prepareTracking({ hold: () => assert.fail('no tracking') }), '', 'skipped tracking stays synchronous');
  assert.deepEqual(strategy.sessionFields({}), {});
  assert.equal(strategy.loginExecutable({ provider: 'grok', agent: { command: 'grok' }, cliSetup: { executable: () => null }, findProgram: name => `/bin/${name}` }), '/bin/grok');
  assert.deepEqual(strategy.loginLaunch({ executable: 'grok', args: ['login'], programLaunch: (executable, args, options) => ({ executable: 'wrap', args: [executable, ...args, options.bypass] }) }), { executable: 'wrap', args: ['grok', 'login', true] });
});

test('Codex strategy owns its editor root, tracking, discussion and login', async () => {
  const strategy = settingsAdapter('codex');
  const account = { profile: true, configDir: path.join('C:', 'profile') };
  assert.deepEqual(strategy.prepareEditor({ account }), { editorRoots: [path.join(account.configDir, 'editor')], tempRoot: null });
  assert.deepEqual(strategy.prepareEditor({ account: null }).editorRoots, []);

  const events = [], args = ['--no-daemon'];
  const tracked = { purpose: 'agent', login: false, executable: 'codex.exe', args, account, options: { session: 's' }, hold: () => { events.push('hold'); return () => events.push('release'); } };
  const warning = await strategy.prepareTracking({ ...tracked, prepareSession: async (executable, options) => { events.push([executable, options.session, options.sqliteHome]); return ['-c', 'hook']; } });
  assert.equal(warning, '');
  assert.deepEqual(args, ['--no-daemon', '-c', 'hook']);
  assert.deepEqual(events, ['hold', ['codex.exe', 's', path.join(account.configDir, 'sqlite')], 'release']);

  events.length = 0;
  const failed = await strategy.prepareTracking({ ...tracked, prepareSession: async () => { throw new Error('old CLI'); } });
  assert.match(failed, /^Paddock: Update Codex/);
  assert.deepEqual(events, ['hold', 'release'], 'a failed hook releases the reserved cell');
  for (const skip of [{ login: true }, { purpose: 'setup' }]) assert.equal(strategy.prepareTracking({ ...tracked, ...skip, hold: () => assert.fail('no tracking'), prepareSession: () => assert.fail('no tracking') }), '');

  const discussed = [];
  strategy.appendDiscussion(discussed, { login: true, discussion: 'plan' });
  strategy.appendDiscussion(discussed, { login: false, discussion: '' });
  assert.deepEqual(discussed, []);
  strategy.appendDiscussion(discussed, { login: false, discussion: 'plan' });
  assert.deepEqual(discussed, ['--', 'plan']);
  assert.equal(strategy.loginExecutable({ nativeCodex: () => 'native-codex' }), 'native-codex');
  assert.deepEqual(strategy.loginLaunch({ executable: 'native-codex', args: ['login'], programLaunch: () => assert.fail('native') }), { executable: 'native-codex', args: ['login'] });
});

test('Claude strategy resolves its install, editor folder and WSL environment', () => {
  const strategy = settingsAdapter('claude');
  const wsl = { kind: 'wsl', distro: 'Ubuntu', path: '/usr/bin/claude' };
  assert.deepEqual(strategy.resolveInstall({ claudeTarget: wsl, getClaude: () => null, findProgram: () => null }), { install: wsl, wsl: true });
  assert.deepEqual(strategy.resolveInstall({ getClaude: () => null, findProgram: () => 'claude.exe' }), { install: { kind: 'native', path: 'claude.exe' }, wsl: false });
  assert.deepEqual(strategy.sessionFields({ install: wsl, wsl: true }), { claudeTarget: wsl, draftSupportReason: 'Account switching is unavailable for Claude Code in WSL.' });

  const owned = [], base = { id: 's', launchId: 'l', purpose: 'agent', node: 'node', draftBridge: {}, wsl: false, root: 'root', ensureOwnedDirectory: (parent, target) => owned.push([parent, target]) };
  const launchTemp = path.join('root', 'sessions', 's', 'draft-editor', 'l');
  assert.deepEqual(strategy.prepareEditor(base), { editorRoots: [path.join(launchTemp, 'claude')], tempRoot: launchTemp });
  assert.deepEqual(owned, [[path.join('root', 'sessions', 's'), path.dirname(launchTemp)], [path.dirname(launchTemp), launchTemp]]);
  for (const skip of [{ wsl: true }, { purpose: 'setup' }, { node: null }, { draftBridge: null }]) assert.deepEqual(strategy.prepareEditor({ ...base, ...skip }), { editorRoots: [], tempRoot: null });

  const native = {};
  strategy.applyEnvironment(native, { wsl: false, tempRoot: 'temp', bridge: {}, purpose: 'agent', wslPath });
  assert.deepEqual(native, { CLAUDE_CODE_TMPDIR: 'temp' });
  const unbridged = {};
  strategy.applyEnvironment(unbridged, { wsl: false, tempRoot: 'temp', bridge: null, purpose: 'agent', wslPath });
  assert.deepEqual(unbridged, {});

  const configDir = path.resolve('profile');
  const agent = { CLAUDE_CONFIG_DIR: configDir, WSLENV: 'KEEP/p:PADDOCK_OLD' };
  strategy.applyEnvironment(agent, { account: { profile: true }, wsl: true, tempRoot: null, bridge: null, purpose: 'agent', wslPath });
  assert.equal(agent.CLAUDE_CONFIG_DIR, wslPath(configDir));
  assert.deepEqual(agent.WSLENV.split(':'), ['KEEP/p', 'PADDOCK_OLD', 'PADDOCK_DATA_DIR', 'PADDOCK_SESSION_ID', 'PADDOCK_LAUNCH_ID', 'PADDOCK_ACCOUNT_ID', 'PADDOCK_BRIDGE_URL', 'PADDOCK_BRIDGE_TOKEN', 'PADDOCK_INSTRUCTIONS/p', 'PADDOCK_MCP_CONFIG/p', 'CLAUDE_CONFIG_DIR/p']);
  const setup = { WSLENV: 'KEEP/p:paddock_old/p' };
  strategy.applyEnvironment(setup, { wsl: true, purpose: 'setup', wslPath });
  assert.equal(setup.WSLENV, 'KEEP/p', 'setup consoles never forward Paddock variables');

  const env = { CLAUDE_CONFIG_DIR: configDir };
  assert.deepEqual(strategy.loginLaunch({ executable: '/usr/bin/claude', args: ['auth', 'login'], env, cwd: '/w', getClaude: () => wsl, wslPath }), { executable: 'wsl.exe', args: ['-d', 'Ubuntu', '--cd', '/w', '--exec', '/usr/bin/claude', 'auth', 'login'] });
  assert.equal(env.WSLENV, 'CLAUDE_CONFIG_DIR/p:PADDOCK_ACCOUNT_ID');
  assert.deepEqual(strategy.loginLaunch({ executable: 'claude.exe', args: ['auth', 'login'], env: {}, getClaude: () => null, wslPath }), { executable: 'claude.exe', args: ['auth', 'login'] });
});

test('switch strategies preserve draft refusal, resume path, model and trust messages', async () => {
  const claude = settingsAdapter('claude'), codex = settingsAdapter('codex');
  const context = "# ─── Claude's last response (for reference; removed on save) ───\n";
  assert.throws(() => claude.checkDraft(context, 'source', { hasClaudeEditorContext }), /The current console and draft are still running\.$/);
  assert.throws(() => claude.checkDraft(context, 'target', { hasClaudeEditorContext }), /Keep the original console open\.$/);
  assert.doesNotThrow(() => claude.checkDraft('plain', 'source', { hasClaudeEditorContext }));
  assert.doesNotThrow(() => codex.checkDraft(context, 'source', { hasClaudeEditorContext }));

  const target = { configDir: 'cfg' }, history = { path: 'a.jsonl', relative: 'b.jsonl' };
  assert.equal(claude.resumePath({ target, history, selection: null }), path.join('cfg', 'projects', 'a.jsonl'));
  assert.equal(claude.resumePath({ target, history, selection: {} }), path.join('cfg', 'projects', 'b.jsonl'));
  assert.equal(codex.resumePath({ target, history, selection: null }), null);

  assert.equal(await claude.resumeModel({ source: { modelId: 'id', model: 'name' }, getThreadModel: () => assert.fail('events only') }), 'id');
  assert.equal(await claude.resumeModel({ source: {} }), null);
  assert.equal(await codex.resumeModel({ targetAccountId: 't', source: { providerSessionId: 'p', modelId: 'stale' }, getThreadModel: async (...args) => args.join(':') }), 't:p');
  assert.deepEqual([codex.label, claude.label], ['Codex', 'Claude Code']);

  const prompt = 'Folder access\r\nTrust\x1b[1Dthis\x1b[1Dfolder?\r\n';
  assert.equal(codex.stageFailure({ buffer: 'READY', targetLabel: 'Work' }), null);
  assert.equal(claude.stageFailure({ buffer: prompt, targetLabel: 'Work' }), null);
  assert.match(codex.stageFailure({ buffer: prompt, targetLabel: 'Work' }), /^Work needs to trust this project folder.*"Set up Work"/);
  assert.equal(launch.hasCodexFolderTrustPrompt(prompt), true, 'the launcher export remains available');
  assert.equal(launch.plainTerminalText('a\x1b[1mb\r'), 'ab\n');
});

function identityFixture(reported) {
  const session = { provider: 'codex', buffer: 'history', sequence: 0, writes: [], terminal: { write(data) {
    session.writes.push(data); session.sequence++;
    if (data === '\r') session.buffer += `Session: ${reported}\r\n`;
  } } };
  const drafts = ['', '/status', ''], switching = new AccountSwitching({});
  switching.waitForOutputIdle = async () => {};
  switching.captureNativeDraft = async () => drafts.shift();
  return { session, switching };
}

test('resume identity dispatch keeps the public methods and instance overrides', async () => {
  const confirmed = identityFixture(uuid);
  await confirmed.switching.awaitResumeIdentity(confirmed.session, uuid);
  assert.deepEqual(confirmed.session.writes, ['/status', '\x1b', '\r']);
  assert.equal(confirmed.session.providerSessionId, uuid);
  assert.equal(confirmed.session.buffer, 'history', 'the status check leaves no output in the replacement');

  const other = identityFixture('87654321-1234-4234-8234-123456789abc');
  await assert.rejects(other.switching.confirmCodexResumeIdentity(other.session, uuid), /Codex opened a different conversation/);
  assert.equal(other.session.providerSessionId, undefined);

  const events = [], claude = new AccountSwitching({});
  claude.awaitEventIdentity = async (...args) => events.push(args);
  const session = { provider: 'claude' };
  await claude.awaitResumeIdentity(session, uuid, 25);
  assert.deepEqual(events, [[session, uuid, 25]]);
});

test('screen profiles match the recorded DTO, the bundled phone data and recorded screens', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(registry.screenProfiles)), recorded.output);
  assert.equal(Object.isFrozen(registry.screenProfiles.providers.codex.selectors), true);
  const data = fs.readFileSync(path.join(repo, 'mobile', 'lib', 'agent_profile_data.dart'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(data, render(), 'run node scripts/generate-agent-profiles.cjs');

  const { menu, providers } = registry.screenProfiles;
  for (const screen of recorded.screens) {
    const lines = fs.readFileSync(path.join(repo, 'mobile', 'test', 'fixtures', screen.file), 'utf8').split(/\r?\n/);
    const { selectors } = providers[screen.provider];
    const marked = lines.filter(line => selectors.includes(line.trimStart()[0]) && line.trimStart()[1] === ' ');
    assert.equal(marked.length, 1, screen.file);
    assert.ok(marked[0].includes(screen.options[screen.selected]), screen.file);
    if (!screen.menu) continue;
    assert.ok(lines.some(line => new RegExp(menu.heading, 'i').test(line)), screen.file);
    const match = marked[0].match(new RegExp(menu.option));
    assert.equal(match[2], String(screen.selected + 1));
    assert.ok(match[3].startsWith(screen.options[screen.selected]));
  }
  assert.ok(new RegExp(menu.working, 'i').test('Working (5s • Esc to interrupt)'));
});

test('dynamic and unverified providers stay in the terminal', () => {
  const { providers } = registry.screenProfiles;
  assert.deepEqual(Object.keys(providers), [...registry.ids, 'shell', 'custom']);
  assert.deepEqual(Object.keys(providers).filter(id => providers[id].support === 'dialog').sort(), ['claude', 'codex']);
  for (const id of ['shell', 'custom', 'grok', 'strata']) assert.deepEqual(providers[id], { support: 'terminal' });
});

test('adapter schema rejects malformed screen facts', () => {
  const good = () => structuredClone(registry.byId('codex'));
  assert.doesNotThrow(() => registry.validate(good(), 'codex'));
  const bad = [
    [a => { a.screen = []; }, /screen must be an object/],
    [a => { a.screen.extra = 1; }, /unknown screen field/],
    [a => { a.screen.selectors = []; }, /single characters/],
    [a => { a.screen.selectors = ['ab']; }, /single characters/],
    [a => { a.screen.selectors = ['›', '›']; }, /single characters/],
    [a => { a.screen.banner = '('; }, /regular expression/],
    [a => { a.screen.banner = 'x'.repeat(241); }, /regular expression/],
    [a => { a.screen.emptyPrompts = [1]; }, /emptyPrompts/]
  ];
  for (const [mutate, pattern] of bad) { const adapter = good(); mutate(adapter); assert.throws(() => registry.validate(adapter, 'codex'), pattern); }
  assert.throws(() => registry.validate({ ...structuredClone(registry.byId('strata')), screen: good().screen }, 'strata'), /screen needs a CLI/);
});
