'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Projects } = require('../electron/projects.cjs');
const { Sessions } = require('../electron/sessions.cjs');
const { savedProjectFolder } = require('../electron/session-launch.cjs');
const { claudeAdapter, READ_ONLY_TOOLS } = require('../electron/providers/strategies/claude.cjs');
const { trustClaudeFolder } = require('../electron/claude-folder-trust.cjs');
const { atomicJson } = require('../electron/storage.cjs');
const { programLaunch } = require('../electron/platform.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-claude-trust-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  const saved = path.join(root, 'saved'), other = path.join(root, 'other'), config = path.join(root, 'config');
  for (const dir of [saved, path.join(saved, 'sub'), other, config]) fs.mkdirSync(dir);
  const projects = new Projects(root), project = projects.save({ name: 'Lab', folders: [{ path: saved }] });
  return { root, saved, other, config, projects, project, file: path.join(config, '.claude.json') };
}
const configKey = folder => { const real = fs.realpathSync.native(folder); return process.platform === 'win32' ? real.replaceAll('\\', '/') : real; };

test('only an exact saved project folder is offered for trust', t => {
  const f = fixture(t);
  assert.equal(savedProjectFolder(f.projects, f.project.id, f.saved), fs.realpathSync.native(f.saved));
  assert.equal(savedProjectFolder(f.projects, null, f.saved), fs.realpathSync.native(f.saved), 'an unlinked console in a saved folder');
  assert.equal(savedProjectFolder(f.projects, f.project.id, f.other), null, 'a linked project does not authorize another folder');
  assert.equal(savedProjectFolder(f.projects, null, f.other), null);
  assert.equal(savedProjectFolder(f.projects, f.project.id, path.join(f.saved, 'sub')), null);
  assert.equal(savedProjectFolder(f.projects, null, f.root), null, 'ancestors are never trusted');
  assert.equal(savedProjectFolder(null, f.project.id, f.saved), null);
});

test('trust is added to the account config without changing other entries', t => {
  const f = fixture(t), key = configKey(f.saved);
  const before = { oauthAccount: { emailAddress: 'fixture' }, numStartups: 4, projects: { '/elsewhere': { allowedTools: ['Bash'] }, [key]: { lastCost: 2 } } };
  atomicJson(f.file, before);
  assert.equal(trustClaudeFolder({ CLAUDE_CONFIG_DIR: f.config }, fs.realpathSync.native(f.saved)), true);
  const after = JSON.parse(fs.readFileSync(f.file, 'utf8'));
  assert.deepEqual(after, { ...before, projects: { ...before.projects, [key]: { lastCost: 2, hasTrustDialogAccepted: true } } });
  assert.deepEqual(Object.keys(after.projects).sort(), ['/elsewhere', key].sort(), 'no ancestor or extra folder is trusted');
  assert.deepEqual(fs.readdirSync(f.config), ['.claude.json'], 'no temporary file remains');
});

test('an unreadable account config is preserved and the prompt stays', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{ damaged');
  assert.equal(trustClaudeFolder({ CLAUDE_CONFIG_DIR: f.config }, f.saved), false);
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{ damaged');
});

test('the strategy trusts nothing without a saved folder, outside agent consoles or in WSL', t => {
  const f = fixture(t), strategy = claudeAdapter(), wslPath = value => value;
  for (const options of [{ purpose: 'agent', trustedFolder: null }, { purpose: 'setup', trustedFolder: f.saved }, { purpose: 'agent', wsl: true, trustedFolder: f.saved }]) {
    strategy.applyEnvironment({ CLAUDE_CONFIG_DIR: f.config }, { wslPath, trustFolder: trustClaudeFolder, ...options });
  }
  assert.equal(fs.existsSync(f.file), false);
  strategy.applyEnvironment({ CLAUDE_CONFIG_DIR: f.config }, { wslPath, trustFolder: trustClaudeFolder, purpose: 'agent', trustedFolder: fs.realpathSync.native(f.saved) });
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).projects[configKey(f.saved)].hasTrustDialogAccepted, true);
});

test('launch settings allow only the read-only Paddock context tools', t => {
  const f = fixture(t), dir = path.join(f.root, 'session');
  fs.mkdirSync(dir);
  claudeAdapter().launchArgs({ purpose: 'agent', node: process.execPath, helper: 'agent-event.cjs', dir, hub: true, permissions: 'default', resumeEffort: null,
    summaryPath: path.join(dir, 'PADDOCK.md'), mcpConfig: path.join(dir, 'mcp.json'), claudeInstall: { kind: 'native', path: 'claude.exe' }, programLaunch, atomicJson });
  const allow = JSON.parse(fs.readFileSync(path.join(dir, 'claude-settings.json'), 'utf8')).permissions.allow;
  assert.deepEqual(allow, READ_ONLY_TOOLS);
  assert.deepEqual(allow, ['mcp__paddock__dock_context', 'mcp__paddock__dock_tools']);
  for (const tool of allow) assert.doesNotMatch(tool, /dock_call|Bash|Edit|Write|\*/);
});

test('a Claude console in a saved folder starts trusted; an arbitrary folder still asks', async t => {
  const f = fixture(t), previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = f.config;
  t.after(() => { if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = previous; });
  const sessions = new Sessions(f.root, { projects: f.projects, prepareCodexSession: async () => [], findProgram: name => name === 'claude' ? 'claude.exe' : process.execPath,
    pty: { spawn() { return { onData() {}, onExit() {}, kill() {} }; } } });
  await sessions.create({ provider: 'claude', cwd: f.other });
  assert.equal(fs.existsSync(f.file), false, 'an unsaved folder keeps the trust prompt');
  // Phone launches resolve to { projectId, cwd: saved folder } before reaching the launcher.
  await sessions.create({ provider: 'claude', projectId: f.project.id, cwd: f.saved });
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f.file, 'utf8')).projects), [configKey(f.saved)]);
});
