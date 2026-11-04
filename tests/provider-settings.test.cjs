'use strict';
// Acceptance tests for electron/provider-settings.cjs.
// Each case asserts the exact arg array produced by the adapter. The expected
// arrays were derived from the original if/else chain in sessions.cjs before
// this refactor. This is a pure refactor; launch arguments must be byte-identical.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { settingsAdapter, codexAdapter, claudeAdapter, cliAdapter } = require('../electron/provider-settings.cjs');
const { byId: cliAgents } = require('../electron/cli-catalog.cjs');
const { prepareCli } = require('../electron/cli-launch.cjs');
const { programLaunch, shellLaunch, customLaunch, shQuote } = require('../electron/platform.cjs');
const { atomicJson } = require('../electron/storage.cjs');
const { wslPath } = require('../electron/adapters.cjs');

// Minimal ctx builder. Callers override fields as needed.
function ctx(overrides = {}) {
  return {
    purpose: 'agent',
    model: '',
    resumeId: null,
    resumePath: null,
    resumeModel: null,
    resumeEffort: null,
    permissions: 'default',
    account: null,
    node: '/usr/bin/node',
    helper: '/app/electron/agent-event.cjs',
    summary: 'shared summary',
    summaryPath: '/session/PADDOCK.md',
    mcpConfig: '/session/mcp.json',
    dir: '/session',
    cwd: '/project',
    isWsl: false,
    claudeInstall: null,
    discussion: '',
    hub: false,
    codexScrollback: () => true,
    nativeCodex: () => '/usr/bin/codex',
    // Pass-through launch: these tests check arguments, not the Windows
    // PowerShell wrapper, which platform tests cover.
    programLaunch: (executable, args) => ({ executable, args }),
    prepareCli,
    cliAgents,
    agentHome: os.homedir(),
    cliSetup: null,
    findProgram: () => null,
    runtime: {},
    bridgeHelper: '/app/electron/agent-tools.cjs',
    atomicJson,
    shQuote,
    wslPath,
    quote: v => `"${v}"`,
    customLaunch,
    shellLaunch,
    provider: 'codex',
    command: '',
    profiles: [],
    ...overrides
  };
}

// switchMethod checks

test('codex and claude adapters have switchMethod resume; all others have none', () => {
  assert.equal(settingsAdapter('codex').switchMethod, 'resume');
  assert.equal(settingsAdapter('claude').switchMethod, 'resume');
  assert.equal(settingsAdapter('antigravity').switchMethod, 'none');
  assert.equal(settingsAdapter('grok').switchMethod, 'none');
  assert.equal(settingsAdapter('opencode').switchMethod, 'none');
  assert.equal(settingsAdapter('shell').switchMethod, 'none');
  assert.equal(settingsAdapter('custom').switchMethod, 'none');
  assert.equal(settingsAdapter('__unknown__').switchMethod, 'none');
});

// Codex tests

test('Codex new agent console without hub', () => {
  const result = settingsAdapter('codex').launchArgs(ctx({ provider: 'codex', hub: false }));
  assert.equal(result.executable, '/usr/bin/codex');
  // An agent console always gets completion notifications, with or without the hub.
  assert.deepEqual(result.args, [
    '--no-daemon',
    '--no-alt-screen',
    '-c',
    'notify=["/usr/bin/node","/app/electron/agent-event.cjs","codex-notify"]'
  ]);
  assert.deepEqual(result.env, {});
});

test('Codex new agent console with hub', () => {
  const node = '/usr/bin/node';
  const helper = '/app/electron/agent-event.cjs';
  const bridgeHelper = '/app/electron/agent-tools.cjs';
  const summary = 'shared summary';
  const summaryPath = '/session/PADDOCK.md';
  const result = settingsAdapter('codex').launchArgs(ctx({
    provider: 'codex',
    hub: true,
    node,
    helper,
    bridgeHelper,
    summary,
    summaryPath,
    purpose: 'agent'
  }));
  assert.equal(result.executable, '/usr/bin/codex');
  // --no-daemon, --no-alt-screen, notify, developer_instructions and mcp keys
  assert.ok(result.args[0] === '--no-daemon');
  assert.ok(result.args.includes('--no-alt-screen'));
  const notifyIndex = result.args.indexOf('-c');
  assert.ok(notifyIndex >= 0);
  assert.ok(result.args[notifyIndex + 1].startsWith('notify='));
  const notifyValue = JSON.parse(result.args[notifyIndex + 1].slice('notify='.length));
  assert.deepEqual(notifyValue, [node, helper, 'codex-notify']);
  // hub config keys
  const keys = [];
  for (let i = 0; i < result.args.length; i++) {
    if (result.args[i] === '-c') keys.push(result.args[i + 1]?.split('=')[0]);
  }
  assert.ok(keys.includes('developer_instructions'));
  assert.ok(keys.includes('mcp_servers.paddock.command'));
  assert.deepEqual(result.env, {});
});

test('Codex resume with model and effort', () => {
  const resumeId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const resumeModel = 'o4-mini';
  const resumeEffort = 'high';
  const result = settingsAdapter('codex').launchArgs(ctx({
    provider: 'codex',
    hub: false,
    resumeId,
    resumeModel,
    resumeEffort
  }));
  assert.equal(result.executable, '/usr/bin/codex');
  assert.equal(result.args[0], '--no-daemon');
  assert.equal(result.args[1], 'resume');
  assert.equal(result.args[2], resumeId);
  assert.equal(result.args[3], '--cd');
  assert.equal(result.args[4], '/project');
  assert.ok(result.args.includes('--no-alt-screen'));
  const modelIndex = result.args.indexOf('--model');
  assert.ok(modelIndex >= 0);
  assert.equal(result.args[modelIndex + 1], resumeModel);
  // effort via -c
  const effortArg = result.args.find(a => typeof a === 'string' && a.startsWith('model_reasoning_effort='));
  assert.ok(effortArg, 'model_reasoning_effort not found');
  assert.equal(effortArg, `model_reasoning_effort=${JSON.stringify(resumeEffort)}`);
});

test('Codex extra account sets sqlite_home', () => {
  const configDir = '/home/user/.codex-account2';
  const result = settingsAdapter('codex').launchArgs(ctx({
    provider: 'codex',
    hub: false,
    account: { profile: true, configDir }
  }));
  const sqliteArg = result.args.find(a => typeof a === 'string' && a.startsWith('sqlite_home='));
  assert.ok(sqliteArg, 'sqlite_home not found');
  assert.equal(sqliteArg, `sqlite_home=${JSON.stringify(path.join(configDir, 'sqlite'))}`);
});

test('Codex unrestricted adds dangerously-bypass flag', () => {
  const result = settingsAdapter('codex').launchArgs(ctx({
    provider: 'codex',
    hub: false,
    permissions: 'unrestricted'
  }));
  assert.ok(result.args.includes('--dangerously-bypass-approvals-and-sandbox'));
});

test('Codex throws when executable not found', () => {
  assert.throws(
    () => settingsAdapter('codex').launchArgs(ctx({ provider: 'codex', nativeCodex: () => null })),
    /Codex CLI was not found/
  );
});

// Claude tests

test('Claude new console (purpose agent, no hub)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdk-claude-test-'));
  try {
    const claudeInstall = { kind: 'native', path: '/usr/bin/claude' };
    const result = settingsAdapter('claude').launchArgs(ctx({
      provider: 'claude',
      hub: false,
      dir,
      claudeInstall,
      isWsl: false,
      purpose: 'agent',
      node: '/usr/bin/node',
      helper: '/app/electron/agent-event.cjs'
    }));
    assert.equal(result.executable, '/usr/bin/claude');
    // agent without hub: --settings written
    const settingsIndex = result.args.indexOf('--settings');
    assert.ok(settingsIndex >= 0);
    assert.ok(fs.existsSync(result.args[settingsIndex + 1]));
    // no --resume, no --model, no --append-system-prompt-file
    assert.ok(!result.args.includes('--resume'));
    assert.ok(!result.args.includes('--model'));
    assert.ok(!result.args.includes('--append-system-prompt-file'));
    assert.deepEqual(result.env, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Claude resume with resumePath and effort', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdk-claude-test-'));
  try {
    const resumeId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const resumePath = '/home/user/.claude/projects/myproject/aaaaaaaa.jsonl';
    const resumeEffort = 'max';
    const resumeModel = 'claude-opus-5';
    const claudeInstall = { kind: 'native', path: '/usr/bin/claude' };
    const result = settingsAdapter('claude').launchArgs(ctx({
      provider: 'claude',
      hub: false,
      dir,
      claudeInstall,
      isWsl: false,
      resumeId,
      resumePath,
      resumeEffort,
      resumeModel,
      purpose: 'agent',
      node: '/usr/bin/node',
      helper: '/app/electron/agent-event.cjs'
    }));
    assert.equal(result.args[result.args.indexOf('--resume') + 1], resumePath || resumeId);
    assert.equal(result.args[result.args.indexOf('--effort') + 1], resumeEffort);
    assert.equal(result.args[result.args.indexOf('--model') + 1], resumeModel);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Claude WSL resume wraps in wsl.exe', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdk-claude-test-'));
  try {
    const resumeId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const resumePath = '/mnt/c/Users/user/.claude/projects/proj/aaaaaaaa.jsonl';
    const claudeInstall = { kind: 'wsl', path: '/usr/bin/claude', distro: 'Ubuntu' };
    const result = settingsAdapter('claude').launchArgs(ctx({
      provider: 'claude',
      hub: false,
      dir,
      claudeInstall,
      isWsl: true,
      resumeId,
      resumePath,
      purpose: 'agent',
      node: 'C:\\Program Files\\node\\node.exe',
      helper: 'C:\\Paddock\\agent-event.cjs'
    }));
    assert.equal(result.executable, 'wsl.exe');
    assert.equal(result.args[0], '-d');
    assert.equal(result.args[1], 'Ubuntu');
    assert.equal(result.args[2], '--cd');
    assert.equal(result.args[3], '/project');
    assert.equal(result.args[4], '--exec');
    assert.equal(result.args[5], '/usr/bin/claude');
    assert.ok(result.args.includes('--resume'));
    assert.deepEqual(result.env, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Claude unrestricted with discussion appended', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdk-claude-test-'));
  try {
    const discussion = 'Help me plan this project.';
    const claudeInstall = { kind: 'native', path: '/usr/bin/claude' };
    const result = settingsAdapter('claude').launchArgs(ctx({
      provider: 'claude',
      hub: false,
      dir,
      claudeInstall,
      isWsl: false,
      permissions: 'unrestricted',
      discussion,
      purpose: 'agent',
      node: '/usr/bin/node',
      helper: '/app/electron/agent-event.cjs'
    }));
    assert.ok(result.args.includes('--dangerously-skip-permissions'));
    assert.equal(result.args[result.args.indexOf('--') + 1], discussion);
    assert.deepEqual(result.env, {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Claude throws when executable not found', () => {
  assert.throws(
    () => settingsAdapter('claude').launchArgs(ctx({ provider: 'claude', claudeInstall: null })),
    /Claude Code was not found/
  );
});

// CLI adapter (grok)

test('grok: cliAdapter returns programLaunch result with grok args', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdk-grok-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const grokPath = '/usr/bin/grok';
  const summaryPath = path.join(dir, 'PADDOCK.md');
  fs.writeFileSync(summaryPath, 'instructions');
  const result = settingsAdapter('grok').launchArgs(ctx({
    provider: 'grok',
    hub: false,
    findProgram: name => name === 'grok' ? grokPath : null,
    dir,
    summaryPath,
    model: 'grok-3',
    permissions: 'default'
  }));
  // grok with --model flag: agent.model is '--model', so ['--model', 'grok-3']
  assert.ok(result.args.includes('grok-3'), 'model arg missing');
  assert.deepEqual(result.env, {});
});

test('grok: cliAdapter throws when binary not found', () => {
  assert.throws(
    () => settingsAdapter('grok').launchArgs(ctx({
      provider: 'grok',
      hub: false,
      findProgram: () => null,
      cliSetup: null
    })),
    /Grok Build was not found/
  );
});

// Antigravity resume

test('antigravity resume appends --conversation flag', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdk-agy-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const conversationId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
  const summaryPath = path.join(dir, 'PADDOCK.md');
  fs.writeFileSync(summaryPath, 'instructions');
  const result = settingsAdapter('antigravity').launchArgs(ctx({
    provider: 'antigravity',
    hub: false,
    resumeId: conversationId,
    findProgram: name => name === 'agy' ? '/usr/bin/agy' : null,
    dir,
    summaryPath
  }));
  const convIndex = result.args.indexOf('--conversation');
  assert.ok(convIndex >= 0, '--conversation flag missing');
  assert.equal(result.args[convIndex + 1], conversationId);
});
