'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareCli } = require('../electron/cli-launch.cjs');

test('maintained Kimi launch uses its discoverable MCP file and preserves existing servers', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-kimi-launch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), directory = path.join(root, 'launch');
  const file = path.join(home, '.kimi-code', 'mcp.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(directory);
  const original = JSON.stringify({ mcpServers: { other: { command: 'existing-tool' } } });
  fs.writeFileSync(file, original);
  const summaryPath = path.join(directory, 'PADDOCK.md');
  fs.writeFileSync(summaryPath, 'Shared instructions');
  const runtime = { node: process.execPath, tools: path.join(root, 'agent-tools.cjs') };
  const result = prepareCli('kimi', { directory, runtime, summary: 'Shared instructions', summaryPath, home, model: 'chosen-model', permissions: 'default' });
  assert.deepEqual(result.args, ['--model', 'chosen-model'], 'Kimi 2.x rejects the former --mcp-config-file option');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(config.mcpServers.other, { command: 'existing-tool' });
  assert.deepEqual(config.mcpServers.paddock, { command: runtime.node, args: [runtime.tools] }, 'The native stdio child inherits bridge values; no credentials or unexpanded placeholders are saved');
  assert.equal(fs.readFileSync(file + '.paddock-backup', 'utf8'), original);
  assert.deepEqual(result.env, {});
});

test('Gemini merges user MCP settings without replacing administrator policy or user preferences', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-gemini-launch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), directory = path.join(root, 'launch');
  const file = path.join(home, '.gemini', 'settings.json');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.mkdirSync(directory);
  const previous = { general: { theme: 'custom' }, mcp: { excluded: ['untrusted-server'] }, mcpServers: { other: { command: 'existing-tool' } } };
  fs.writeFileSync(file, JSON.stringify(previous));
  const runtime = { node: process.execPath, tools: path.join(root, 'agent-tools.cjs') };
  const result = prepareCli('gemini', { directory, runtime, summary: 'Shared instructions', summaryPath: path.join(directory, 'PADDOCK.md'), home, permissions: 'default' });
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(config.general, previous.general);
  assert.deepEqual(config.mcp, previous.mcp);
  assert.deepEqual(config.mcpServers.other, previous.mcpServers.other);
  assert.equal(config.mcpServers.paddock.env.PADDOCK_BRIDGE_TOKEN, '${PADDOCK_BRIDGE_TOKEN}');
  assert.deepEqual(result.env, {}, 'Do not supply a user-writable system policy override or redirect login storage');
  assert.deepEqual(result.args, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.paddock-backup', 'utf8')), previous);
});

test('OpenCode configuration stays valid when environment substitution sees a Windows instructions path', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-opencode-launch-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const summaryPath = 'C:\\Users\\Example Name\\Paddock\\sessions\\launch\\PADDOCK.md';
  const result = prepareCli('opencode', { directory, runtime: { node: process.execPath, tools: path.join(directory, 'agent-tools.cjs') }, summaryPath, home: directory, permissions: 'default' });
  const values = { PADDOCK_BRIDGE_URL: 'http://127.0.0.1:12345', PADDOCK_BRIDGE_TOKEN: 'synthetic-bridge-token', PADDOCK_INSTRUCTIONS: summaryPath };
  const expanded = result.env.OPENCODE_CONFIG_CONTENT.replace(/\{env:([^}]+)\}/g, (_match, key) => values[key]);
  const config = JSON.parse(expanded);
  assert.equal(config.mcp.paddock.environment.PADDOCK_INSTRUCTIONS, summaryPath);
  assert.equal(config.mcp.paddock.environment.PADDOCK_BRIDGE_TOKEN, values.PADDOCK_BRIDGE_TOKEN);
  assert.deepEqual(config.instructions, [summaryPath]);
  assert.ok(!result.env.OPENCODE_CONFIG_CONTENT.includes(values.PADDOCK_BRIDGE_TOKEN));
});
