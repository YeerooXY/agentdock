'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { CliSetup, installEnvironment, runInstaller, verifyExecutable, sanitizeDiagnostic } = require('../electron/cli-setup.cjs');
const { catalog } = require('../electron/cli-catalog.cjs');
const { prepareCli, saveManagedMcp } = require('../electron/cli-launch.cjs');
const { Sessions, validateConsoleDefaults } = require('../electron/sessions.cjs');
const { SetupRequests } = require('../electron/setup-requests.cjs');
const parent = path.resolve(__dirname, '../test-data');
function fixture(t) {
  fs.mkdirSync(parent, { recursive: true }); const root = fs.mkdtempSync(path.join(parent, 'cli-setup-'));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(parent)); fs.rmSync(root, { recursive: true, force: true }); });
  const runtime = { node: process.execPath, npm: path.join(root, 'npm-cli.js'), tools: path.join(root, 'agent-tools.cjs') };
  fs.writeFileSync(runtime.npm, ''); return { root, runtime };
}
test('optional installer uses only selected official recipes, skips installed tools and reports progress', async t => {
  const { root, runtime } = fixture(t), found = new Map([['codex', 'codex.exe']]), calls = [], states = [], verified = [];
  const setup = new CliSetup(root, runtime, { platform: 'win32', build: 30000, detect: id => found.get(id), download: async url => { assert.equal(url, catalog.find(x => x.id === 'claude').script); return '# Official installer fixture'; },
    onChange: () => states.push(structuredClone(setup.jobs)), run: async (command, args, options) => { calls.push({ command, args, options }); found.set(path.basename(options.cwd), path.join(root, 'vendor-tools', path.basename(options.cwd) + '.exe')); },
    verify: async (file, args, options) => { verified.push({ file, args, options }); return { code: 0 }; } });
  await assert.rejects(setup.install(['user-supplied-package']), /list/);
  await setup.install(['codex','claude','opencode','pi','opencode']);
  assert.equal(calls.length, 3); assert.deepEqual(Object.keys(setup.jobs), ['codex','claude','opencode','pi']);
  assert.equal(setup.downloads.list().length, 3, 'Only tools installed in this batch are recorded');
  assert.ok(setup.downloads.list().every(x => x.name !== 'Codex installer workspace'), 'Pre-existing agents are not claimed as Paddock downloads');
  assert.equal(setup.downloads.list().find(x => x.name === 'Claude Code installer workspace').executable, path.join(root, 'vendor-tools', 'claude.exe'));
  assert.equal(verified.length, 3); assert.ok(verified.every(x => x.args[0] === '--version'));
  assert.ok(states.some(x => x.opencode.state === 'installing' && x.pi.state === 'queued'));
  assert.ok(calls[0].args.includes('-NonInteractive'));
  assert.ok(calls[1].args.includes('opencode-ai@latest')); assert.ok(calls[2].args.includes('--ignore-scripts'));
  assert.ok(calls.slice(1).every(x => x.command === runtime.node && x.args[0] === runtime.npm));
  assert.ok(calls.every(x => fs.existsSync(x.options.env.NPM_CONFIG_USERCONFIG)));
  assert.ok(['codex','claude','opencode','pi'].every(id => setup.snapshot().find(x => x.id === id).installed));
});
test('installation failures can be retried without losing completed choices; duplicate batches and tests are blocked', async t => {
  const { root, runtime } = fixture(t), found = new Set(); let finish, fail = true;
  const setup = new CliSetup(root, runtime, { platform: 'win32', build: 30000, detect: id => found.has(id) && 'agent.exe', run: async (_, args, options) => { if (fail) { await new Promise(r => { finish = r; }); throw Error('Offline'); } found.add(path.basename(options.cwd)); }, verify: async () => ({ code: 0 }) });
  const pending = setup.install(['opencode']);
  await assert.rejects(setup.install(['pi']), /already running/); finish(); await pending;
  assert.equal(setup.jobs.opencode.error, 'Offline'); fail = false; await setup.install(['opencode']);
  assert.equal(setup.jobs.opencode.state, 'installed');
  await assert.rejects(new CliSetup(root, runtime, { testMode: true, detect: () => null }).install(['codex']), /disabled during tests/);
  await assert.rejects(new CliSetup(root, runtime, { platform: 'win32', build: 19045, detect: () => null }).install(['gemini']), /24H2/);
});

test('Kiro per-user binary clears its stale install error and remains outside the managed download inventory', async t => {
  const { root, runtime } = fixture(t), local = path.join(root, 'LocalAppData'), kiro = path.join(local, 'Kiro-Cli', 'kiro-cli.exe');
  fs.mkdirSync(path.dirname(kiro), { recursive: true }); fs.writeFileSync(kiro, 'fake executable');
  fs.writeFileSync(path.join(root, 'agent-setup.json'), JSON.stringify({ kiro: { state: 'error', error: 'The installer finished, but the command was not found.' } }));
  let runs = 0, visible = false;
  const setup = new CliSetup(root, runtime, { platform: 'win32', build: 30000, home: path.join(root, 'home'), localAppData: local, detect: id => id === 'kiro' && visible ? kiro : null, run: async () => { runs++; } });
  assert.equal(setup.jobs.kiro.state, 'error');
  visible = true; setup.refresh();
  assert.equal(setup.executable('kiro'), kiro);
  assert.deepEqual(setup.jobs.kiro, { state: 'installed' });
  await setup.install(['kiro']);
  assert.equal(runs, 0); assert.equal(setup.downloads.list().length, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(setup.file, 'utf8')).kiro, { state: 'installed' });
});

test('Grok per-user detection and Kimi install avoid shared PATH changes', async t => {
  const { root, runtime } = fixture(t), home = path.join(root, 'home'), grok = path.join(home, '.grok', 'bin', 'grok.exe'), grokAlias = path.join(home, '.grok', 'bin', 'agent.exe');
  fs.mkdirSync(path.dirname(grok), { recursive: true }); fs.writeFileSync(grok, 'fake Grok'); fs.writeFileSync(grokAlias, 'fake Grok alias');
  const setup = new CliSetup(root, runtime, { platform: 'win32', build: 30000, home, localAppData: path.join(root, 'LocalAppData'), download: async () => '# official fixture', run: async (_command, _args, options) => {
    const kimi = path.join(home, '.kimi-code', 'bin', 'kimi.exe'); fs.mkdirSync(path.dirname(kimi), { recursive: true }); fs.writeFileSync(kimi, 'fake Kimi');
    assert.equal(options.env.KIMI_NO_MODIFY_PATH, '1');
  }, verify: async () => ({ code: 0 }), findProgram: () => null });
  assert.equal(setup.executable('grok'), grok);
  assert.equal(setup.executable('cursor'), null, 'Grok agent.exe is not Cursor; Cursor resolves by its own directory or cursor-agent command');
  const cursorAgent = path.join(root, 'LocalAppData', 'cursor-agent', 'agent.exe');
  fs.mkdirSync(path.dirname(cursorAgent), { recursive: true }); fs.writeFileSync(cursorAgent, 'fake Cursor');
  assert.equal(setup.executable('cursor'), cursorAgent, 'Cursor may use its agent.exe alias inside its own install directory');
  await setup.install(['kimi']);
  assert.equal(setup.executable('kimi'), path.join(home, '.kimi-code', 'bin', 'kimi.exe'));
  assert.equal(setup.downloads.list().find(x => x.name.startsWith('Kimi')).executable, path.join(home, '.kimi-code', 'bin', 'kimi.exe'));
});

test('installer diagnostics redact credential fields, URL auth/query data and home paths', () => {
  const text = sanitizeDiagnostic([
    'TOKEN=token-sentinel',
    'OPENAI_API_KEY=openai-sentinel',
    'NPM_TOKEN=npm-sentinel',
    'Authorization: Basic basic-sentinel',
    'url=https://user-sentinel:pass-sentinel@example.test/pkg?X-Amz-Signature=signature-sentinel',
    '{"apiKey":"json-api-sentinel","refreshToken":"json-refresh-sentinel","access_token":"json-access-sentinel"}',
    'url=https://user2-sentinel:pass2-sentinel@example.test/pkg?opaque-sentinel',
    `path=${os.homedir()}\\private-folder`
  ].join('\n'));
  for (const sentinel of ['token-sentinel','openai-sentinel','npm-sentinel','basic-sentinel','user-sentinel','pass-sentinel','signature-sentinel','json-api-sentinel','json-refresh-sentinel','json-access-sentinel','user2-sentinel','pass2-sentinel','opaque-sentinel', os.homedir()]) assert.ok(!text.includes(sentinel));
  assert.match(text, /TOKEN="?\[redacted\]"?/); assert.match(text, /Authorization: \[redacted\]/i); assert.match(text, /\?\[query redacted\]/);
});

test('installer output with a split oversized credential line is redacted before it is bounded', async t => {
  const { root } = fixture(t), secret = 'oversized-token-sentinel';
  const program = `process.stderr.write('access_token='); setTimeout(() => { process.stderr.write('${secret}'.repeat(3000)); process.stderr.write(' tail-secret-sentinel\\n'); process.exit(7); }, 10);`;
  await assert.rejects(runInstaller(process.execPath, ['-e', program], { cwd: root, env: process.env }), error => {
    assert.ok(!error.message.includes(secret)); assert.ok(!error.message.includes('tail-secret-sentinel'));
    assert.match(error.message, /oversized output line redacted|diagnostic line omitted/); return true;
  });
});

test('a found CLI that fails --version stays retryable until its check passes', async t => {
  const { root, runtime } = fixture(t); let executable = null, installerRuns = 0, versionPasses = false;
  const setup = new CliSetup(root, runtime, { platform: 'win32', build: 30000, detect: id => id === 'pi' ? executable : null,
    run: async () => { installerRuns++; executable = 'fake-pi.cmd'; },
    verify: async () => { if (!versionPasses) throw Error('CLI check stopped (exit 1). synthetic failure'); return { code: 0 }; } });
  await setup.install(['pi']);
  const ui = await import('../src/setup-agent-state.mjs'), agent = setup.snapshot().find(x => x.id === 'pi');
  assert.equal(agent.installed, true); assert.equal(agent.job.checkFailed, true);
  assert.deepEqual(ui.pendingAgentIds(['pi'], [agent]), ['pi']); assert.equal(ui.agentInstallDisabled(agent, false), false);
  assert.equal(ui.agentOptionDisabled(agent, false), true);
  versionPasses = true; await setup.install(['pi']);
  const ready = setup.snapshot().find(x => x.id === 'pi');
  assert.equal(installerRuns, 1, 'Retry rechecks the existing command instead of reinstalling it');
  assert.equal(ready.job.state, 'installed'); assert.equal(ready.job.checkFailed, undefined);
  assert.deepEqual(ui.pendingAgentIds(['pi'], [ready]), []); assert.equal(ui.agentInstallDisabled(ready, false), true);
});

test('fake CLI installs, passes version/help checks and starts without sending model work', { skip: process.platform !== 'win32' }, async t => {
  const { root, runtime } = fixture(t), fake = path.join(root, 'fake cli', 'pi.cmd'), files = new Map();
  fs.mkdirSync(path.dirname(fake), { recursive: true });
  const setup = new CliSetup(root, runtime, { platform: 'win32', build: 30000, detect: id => files.get(id) || null,
    run: async (_, __, options) => {
      fs.writeFileSync(fake, '@echo off\r\nif "%~1"=="--version" (echo Fake Pi 1.0& exit /b 0)\r\nif "%~1"=="--help" (echo Fake Pi help& exit /b 0)\r\necho Fake Pi startup ready\r\nexit /b 0\r\n');
      files.set(path.basename(options.cwd), fake);
    } });
  await setup.install(['pi']);
  assert.equal(setup.jobs.pi.state, 'installed'); assert.equal(setup.executable('pi'), fake);
  const env = installEnvironment(runtime, root);
  const help = await verifyExecutable(fake, ['--help'], { cwd: root, env });
  const startup = await verifyExecutable(fake, [], { cwd: root, env });
  assert.match(help.stdout, /Fake Pi help/); assert.match(startup.stdout, /Fake Pi startup ready/);
});
test('installer environment excludes credentials and npm configuration from the host', t => {
  const { root, runtime } = fixture(t), names = ['OPENAI_API_KEY','ANTHROPIC_API_KEY','NPM_TOKEN','PADDOCK_BRIDGE_TOKEN','NODE_OPTIONS'];
  const previous = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, index) => previous[index] === undefined ? delete process.env[name] : process.env[name] = previous[index]));
  names.forEach(name => process.env[name] = 'PRIVATE_TEST_VALUE');
  const env = installEnvironment(runtime, root);
  assert.ok(names.every(name => !(name in env))); assert.ok(!JSON.stringify(env).includes('PRIVATE_TEST_VALUE'));
  assert.equal(env.NPM_CONFIG_USERCONFIG, path.join(root, 'npmrc'));
});
test('every catalog launch preserves the project, supplies shared context and never puts session tokens in saved configs', async t => {
  const { root, runtime } = fixture(t), home = path.join(root, 'home'), summaryPath = path.join(root, 'PADDOCK.md');
  fs.mkdirSync(home); fs.writeFileSync(summaryPath, 'Shared user instructions');
  const qwen = catalog.find(x => x.id === 'qwen'), kiro = catalog.find(x => x.id === 'kiro');
  assert.match(qwen.auth, /Qwen OAuth ended April 15, 2026/); assert.doesNotMatch(qwen.auth, /Choose Qwen OAuth/);
  assert.equal(qwen.docs, 'https://qwenlm.github.io/qwen-code-docs/en/users/quickstart/'); assert.equal(kiro.model, '--model');
  for (const agent of catalog.filter(x => !['codex','claude'].includes(x.id))) {
    const directory = path.join(root, agent.id); fs.mkdirSync(directory);
    const result = prepareCli(agent.id, { directory, runtime, summary: 'Shared user instructions', summaryPath, home, model: 'test-model', permissions: 'unrestricted' });
    assert.equal(validateConsoleDefaults({ provider: agent.id, cwd: root }).provider, agent.id);
    if (agent.model) assert.equal(result.args[result.args.indexOf(agent.model) + 1], 'test-model');
    if (agent.unrestricted) for (const flag of agent.unrestricted) assert.ok(result.args.includes(flag));
    const files = fs.readdirSync(directory); assert.ok(files.includes('mcp.json'));
    if (agent.mcp) assert.ok(fs.existsSync(path.join(home, agent.mcp)));
    assert.ok(!JSON.stringify(result).includes('PRIVATE_SESSION_TOKEN'));
  }
  const copilot = JSON.parse(fs.readFileSync(path.join(root, 'copilot', 'mcp.json')));
  assert.deepEqual(copilot.mcpServers.paddock.tools, ['*']);
  assert.equal(copilot.mcpServers.paddock.env.PADDOCK_BRIDGE_TOKEN, '${PADDOCK_BRIDGE_TOKEN}');
  const calls = [], hub = { summaryPath, summary: () => 'Shared user instructions', grant: () => ({ PADDOCK_BRIDGE_TOKEN: 'PRIVATE_SESSION_TOKEN' }), revoke() {} };
  const sessions = new Sessions(root, { hub, runtime, agentHome: home, cliSetup: { executable: () => 'C:\\Agent Tools\\agent.cmd' }, pty: { spawn(command, args, options) { calls.push({ command, args, options }); return { onData() {}, onExit(fn) { this.exit = fn; }, kill() { this.exit({ exitCode: 0 }); } }; } } });
  for (const agent of catalog.filter(x => !['codex','claude'].includes(x.id))) {
    const session = await sessions.create({ provider: agent.id, cwd: root, name: 'Keep this name', model: 'test-model' });
    assert.equal(session.name, 'Keep this name'); assert.equal(session.cwd, root);
    assert.equal(calls.at(-1).options.env.PADDOCK_BRIDGE_TOKEN, 'PRIVATE_SESSION_TOKEN');
    assert.ok(!JSON.stringify(calls.at(-1).args).includes('PRIVATE_SESSION_TOKEN'));
    sessions.end(session.id);
  }
});
test('managed MCP merges keep other servers and a backup; conflicts and invalid JSON leave files untouched', t => {
  const { root, runtime } = fixture(t), file = path.join(root, 'mcp.json'), before = JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'other.exe' } } });
  fs.writeFileSync(file, before); const server = { command: runtime.node, args: [runtime.tools] };
  saveManagedMcp(file, server); assert.equal(fs.readFileSync(file + '.paddock-backup','utf8'), before);
  assert.equal(JSON.parse(fs.readFileSync(file)).mcpServers.other.command, 'other.exe');
  assert.equal(saveManagedMcp(file, server).changed, false);
  const conflict = JSON.stringify({ mcpServers: { paddock: { command: 'someone-else' } } }); fs.writeFileSync(file, conflict);
  assert.throws(() => saveManagedMcp(file, server), /different/); assert.equal(fs.readFileSync(file, 'utf8'), conflict);
  fs.writeFileSync(file, '{bad'); assert.throws(() => saveManagedMcp(file, server), /valid JSON/); assert.equal(fs.readFileSync(file,'utf8'), '{bad');
  const toml = path.join(root, 'config.toml'); fs.writeFileSync(toml, 'model = "existing"\n');
  saveManagedMcp(toml, server); const after = fs.readFileSync(toml, 'utf8'); saveManagedMcp(toml, server);
  assert.equal(fs.readFileSync(toml, 'utf8'), after); assert.match(after, /^model = "existing"/);
});
test('entries written under the former Agent Dock name are replaced, foreign agent_dock entries are kept', t => {
  const { root, runtime } = fixture(t), server = { command: runtime.node, args: [runtime.tools] }, file = path.join(root, 'old.json');
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { agent_dock: { command: 'node', args: ['C:/old/electron/agent-tools.cjs'] }, other: { command: 'x' } } }));
  assert.equal(saveManagedMcp(file, server).changed, true);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file)).mcpServers).sort(), ['other', 'paddock']);
  const foreign = path.join(root, 'foreign.json'); fs.writeFileSync(foreign, JSON.stringify({ mcpServers: { agent_dock: { command: 'someone-else' } } }));
  saveManagedMcp(foreign, server); assert.equal(JSON.parse(fs.readFileSync(foreign)).mcpServers.agent_dock.command, 'someone-else');
  const toml = path.join(root, 'old.toml'); fs.writeFileSync(toml, 'model = "x"\n\n# BEGIN AGENT DOCK\n[mcp_servers.agent_dock]\ncommand = "node"\n# END AGENT DOCK\n');
  saveManagedMcp(toml, server); const text = fs.readFileSync(toml, 'utf8');
  assert.doesNotMatch(text, /AGENT DOCK|agent_dock/); assert.equal(text.match(/\[mcp_servers\.paddock\]/g).length, 1); assert.match(text, /^model = "x"/);
});
test('agent setup drafts never change connections before Apply and keys remain direct-entry only', async t => {
  const { root } = fixture(t), connections = [], profiles = [], keys = [];
  const hub = { vault: { list: () => keys }, config: { connections, profiles }, redact: x => JSON.parse(JSON.stringify(x).replaceAll('KNOWN_SECRET', '[credential removed]')), async saveConnection(x) { connections.push(x); }, saveProfile(x) { profiles.push(x); } };
  const setup = new SetupRequests(root, { getHub: () => hub, getAgents: () => [] });
  assert.throws(() => setup.prepare({ kind: 'key', config: { id: 'zai', key: 'SECRET' } }, {}), /secret values/);
  assert.throws(() => setup.prepare({ kind: 'tool', config: { id: 'test', type: 'stdio', command: 'node', args: ['KNOWN_SECRET'] } }, {}), /saved credential/);
  const result = setup.prepare({ kind: 'api', config: { id: 'zai', name: 'Z.AI', protocol: 'chat', url: 'https://api.z.ai/api/paas/v4/chat/completions', keyId: 'zai' } }, { consoleName: 'Trader' });
  assert.equal(profiles.length, 0); assert.equal(setup.items[0].consoleName, 'Trader');
  await assert.rejects(setup.apply(result.id), /Paste the requested key in Tools/); keys.push({ id: 'zai', label: 'Z.AI' });
  await setup.apply(result.id); assert.equal(profiles[0].id, 'zai'); assert.equal(setup.items.length, 0);
  const key = setup.prepare({ kind: 'key', config: { id: 'grok' } }, {});
  await assert.rejects(setup.apply(key.id), /Tools card/); setup.remove(key.id); assert.equal(setup.items.length, 0);
  assert.ok(!JSON.stringify(setup.status()).includes('SECRET'));
});
