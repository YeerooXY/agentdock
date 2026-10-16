'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { CliSetup, installEnvironment } = require('../electron/cli-setup.cjs');
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
  const { root, runtime } = fixture(t), found = new Map([['codex', 'codex.exe']]), calls = [], states = [];
  const setup = new CliSetup(root, runtime, { platform: 'win32', build: 30000, detect: id => found.get(id), download: async url => { assert.equal(url, catalog.find(x => x.id === 'claude').script); return '# Official installer fixture'; },
    onChange: () => states.push(structuredClone(setup.jobs)), run: async (command, args, options) => { calls.push({ command, args, options }); found.set(path.basename(options.cwd), 'installed.exe'); } });
  await assert.rejects(setup.install(['user-supplied-package']), /list/);
  await setup.install(['codex','claude','opencode','pi','opencode']);
  assert.equal(calls.length, 3); assert.deepEqual(Object.keys(setup.jobs), ['codex','claude','opencode','pi']);
  assert.ok(states.some(x => x.opencode.state === 'installing' && x.pi.state === 'queued'));
  assert.ok(calls[0].args.includes('-NonInteractive'));
  assert.ok(calls[1].args.includes('opencode-ai@latest')); assert.ok(calls[2].args.includes('--ignore-scripts'));
  assert.ok(calls.slice(1).every(x => x.command === runtime.node && x.args[0] === runtime.npm));
  assert.ok(calls.every(x => fs.existsSync(x.options.env.NPM_CONFIG_USERCONFIG)));
  assert.ok(['codex','claude','opencode','pi'].every(id => setup.snapshot().find(x => x.id === id).installed));
});
test('installation failures can be retried without losing completed choices; duplicate batches and tests are blocked', async t => {
  const { root, runtime } = fixture(t), found = new Set(); let finish, fail = true;
  const setup = new CliSetup(root, runtime, { platform: 'win32', build: 30000, detect: id => found.has(id) && 'agent.exe', run: async (_, args, options) => { if (fail) { await new Promise(r => { finish = r; }); throw Error('Offline'); } found.add(path.basename(options.cwd)); } });
  const pending = setup.install(['opencode']);
  await assert.rejects(setup.install(['pi']), /already running/); finish(); await pending;
  assert.equal(setup.jobs.opencode.error, 'Offline'); fail = false; await setup.install(['opencode']);
  assert.equal(setup.jobs.opencode.state, 'installed');
  await assert.rejects(new CliSetup(root, runtime, { testMode: true, detect: () => null }).install(['codex']), /disabled during tests/);
  await assert.rejects(new CliSetup(root, runtime, { platform: 'win32', build: 19045, detect: () => null }).install(['gemini']), /24H2/);
});
test('installer environment excludes credentials and npm configuration from the host', t => {
  const { root, runtime } = fixture(t), names = ['OPENAI_API_KEY','ANTHROPIC_API_KEY','NPM_TOKEN','AGENT_DOCK_BRIDGE_TOKEN','NODE_OPTIONS'];
  const previous = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, index) => previous[index] === undefined ? delete process.env[name] : process.env[name] = previous[index]));
  names.forEach(name => process.env[name] = 'PRIVATE_TEST_VALUE');
  const env = installEnvironment(runtime, root);
  assert.ok(names.every(name => !(name in env))); assert.ok(!JSON.stringify(env).includes('PRIVATE_TEST_VALUE'));
  assert.equal(env.NPM_CONFIG_USERCONFIG, path.join(root, 'npmrc'));
});
test('every catalog launch preserves the project, supplies shared context and never puts session tokens in saved configs', async t => {
  const { root, runtime } = fixture(t), home = path.join(root, 'home'), summaryPath = path.join(root, 'AGENT_DOCK.md');
  fs.mkdirSync(home); fs.writeFileSync(summaryPath, 'Shared user instructions');
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
  assert.deepEqual(copilot.mcpServers.agent_dock.tools, ['*']);
  assert.equal(copilot.mcpServers.agent_dock.env.AGENT_DOCK_BRIDGE_TOKEN, '${AGENT_DOCK_BRIDGE_TOKEN}');
  const calls = [], hub = { summaryPath, summary: () => 'Shared user instructions', grant: () => ({ AGENT_DOCK_BRIDGE_TOKEN: 'PRIVATE_SESSION_TOKEN' }), revoke() {} };
  const sessions = new Sessions(root, { hub, runtime, agentHome: home, cliSetup: { executable: () => 'C:\\Agent Tools\\agent.cmd' }, pty: { spawn(command, args, options) { calls.push({ command, args, options }); return { onData() {}, onExit(fn) { this.exit = fn; }, kill() { this.exit({ exitCode: 0 }); } }; } } });
  for (const agent of catalog.filter(x => !['codex','claude'].includes(x.id))) {
    const session = await sessions.create({ provider: agent.id, cwd: root, name: 'Keep this name', model: 'test-model' });
    assert.equal(session.name, 'Keep this name'); assert.equal(session.cwd, root);
    assert.equal(calls.at(-1).options.env.AGENT_DOCK_BRIDGE_TOKEN, 'PRIVATE_SESSION_TOKEN');
    assert.ok(!JSON.stringify(calls.at(-1).args).includes('PRIVATE_SESSION_TOKEN'));
    sessions.end(session.id);
  }
});
test('managed MCP merges keep other servers and a backup; conflicts and invalid JSON leave files untouched', t => {
  const { root, runtime } = fixture(t), file = path.join(root, 'mcp.json'), before = JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'other.exe' } } });
  fs.writeFileSync(file, before); const server = { command: runtime.node, args: [runtime.tools] };
  saveManagedMcp(file, server); assert.equal(fs.readFileSync(file + '.agent-dock-backup','utf8'), before);
  assert.equal(JSON.parse(fs.readFileSync(file)).mcpServers.other.command, 'other.exe');
  assert.equal(saveManagedMcp(file, server).changed, false);
  const conflict = JSON.stringify({ mcpServers: { agent_dock: { command: 'someone-else' } } }); fs.writeFileSync(file, conflict);
  assert.throws(() => saveManagedMcp(file, server), /different/); assert.equal(fs.readFileSync(file, 'utf8'), conflict);
  fs.writeFileSync(file, '{bad'); assert.throws(() => saveManagedMcp(file, server), /valid JSON/); assert.equal(fs.readFileSync(file,'utf8'), '{bad');
  const toml = path.join(root, 'config.toml'); fs.writeFileSync(toml, 'model = "existing"\n');
  saveManagedMcp(toml, server); const after = fs.readFileSync(toml, 'utf8'); saveManagedMcp(toml, server);
  assert.equal(fs.readFileSync(toml, 'utf8'), after); assert.match(after, /^model = "existing"/);
});
test('agent setup drafts never change connections before Apply and keys remain direct-entry only', async t => {
  const { root } = fixture(t), connections = [], profiles = [], keys = [];
  const hub = { vault: { list: () => keys }, config: { connections, profiles }, redact: x => JSON.parse(JSON.stringify(x).replaceAll('KNOWN_SECRET', '[credential removed]')), async saveConnection(x) { connections.push(x); }, saveProfile(x) { profiles.push(x); } };
  const setup = new SetupRequests(root, { getHub: () => hub, getAgents: () => [] });
  assert.throws(() => setup.prepare({ kind: 'key', config: { id: 'zai', key: 'SECRET' } }, {}), /secret values/);
  assert.throws(() => setup.prepare({ kind: 'tool', config: { id: 'test', type: 'stdio', command: 'node', args: ['KNOWN_SECRET'] } }, {}), /saved credential/);
  const result = setup.prepare({ kind: 'api', config: { id: 'zai', name: 'Z.AI', protocol: 'chat', url: 'https://api.z.ai/api/paas/v4/chat/completions', keyId: 'zai' } }, { consoleName: 'Trader' });
  assert.equal(profiles.length, 0); assert.equal(setup.items[0].consoleName, 'Trader');
  await assert.rejects(setup.apply(result.id), /Keys first/); keys.push({ id: 'zai', label: 'Z.AI' });
  await setup.apply(result.id); assert.equal(profiles[0].id, 'zai'); assert.equal(setup.items.length, 0);
  const key = setup.prepare({ kind: 'key', config: { id: 'grok' } }, {});
  await assert.rejects(setup.apply(key.id), /directly/); setup.remove(key.id); assert.equal(setup.items.length, 0);
  assert.ok(!JSON.stringify(setup.status()).includes('SECRET'));
});
