'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { initialSettings } = require('../electron/settings.cjs');
const { runtimeFiles } = require('../electron/runtime.cjs');
const { Sessions } = require('../electron/sessions.cjs');

test('fresh installs choose an available console; existing and unfinished setups keep their choices', () => {
  const folder = path.resolve(__dirname, '..');
  for (const [capabilities, provider] of [[{}, 'shell'], [{ claude: true }, 'claude'], [{ codex: true, claude: true }, 'codex']]) {
    const settings = initialSettings({}, folder, capabilities);
    assert.equal(settings.setupComplete, false); assert.equal(settings.consoleDefaults.provider, provider);
    assert.equal(settings.keepAwakeWhileWorking, true);
  }
  const existing = { consoleDefaults: { provider: 'custom', cwd: folder, command: 'my-agent' }, agentPermissions: 'unrestricted', slotNames: { 4: 'Trader' }, vimControls: true };
  const migrated = initialSettings(existing, 'unused', {});
  assert.equal(migrated.setupComplete, true); assert.equal(migrated.consoleDefaults.command, 'my-agent');
  assert.equal(migrated.consoleDefaults.cwd, folder); assert.equal(migrated.agentPermissions, 'unrestricted');
  assert.equal(migrated.vimControls, true); assert.equal(migrated.slotNames[4], 'Trader');
  assert.equal(migrated.keepAwakeWhileWorking, true);
  assert.equal(initialSettings({ ...existing, keepAwakeWhileWorking: false }, folder, {}).keepAwakeWhileWorking, false);
  assert.equal(initialSettings({ ...existing, setupComplete: false }, folder, {}).setupComplete, false);
});

test('packaged sessions use their bundled runtime and helpers without Node on PATH', async t => {
  const parent = path.resolve(__dirname, '..', 'test-data'); fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'packaged paths '));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(parent)); fs.rmSync(root, { recursive: true, force: true }); });
  fs.mkdirSync(path.join(root, 'runtime')); fs.writeFileSync(path.join(root, 'runtime', 'node.exe'), 'fixture');
  const runtime = runtimeFiles({ isPackaged: true, resourcesPath: root, findProgram: () => { throw new Error('Must not search PATH'); } });
  const calls = [];
  const sessions = new Sessions(root, {
    runtime, findProgram: () => null, nativeCodex: () => 'C:\\Agents\\codex.exe', claude: { kind: 'native', path: 'C:\\Agents\\claude.exe' },
    pty: { spawn(executable, args) { calls.push({ executable, args }); return { onData() {}, onExit() {} }; } }
  });
  await sessions.create({ provider: 'codex', cwd: root });
  const notify = calls[0].args.find(x => x.startsWith('notify='));
  assert.deepEqual(JSON.parse(notify.slice(7)), [runtime.node, runtime.event, 'codex-notify']);
  const claude = await sessions.create({ provider: 'claude', cwd: root });
  const config = JSON.parse(fs.readFileSync(path.join(root, 'sessions', claude.id, 'claude-settings.json'), 'utf8'));
  assert.equal(config.hooks.Stop[0].hooks[0].command, `"${runtime.node.replaceAll('\\', '/')}" "${runtime.event.replaceAll('\\', '/')}" Stop`);
  fs.unlinkSync(runtime.node);
  assert.throws(() => runtimeFiles({ isPackaged: true, resourcesPath: root }), /runtime is missing/);
});
