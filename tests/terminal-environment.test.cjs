'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Sessions } = require('../electron/sessions.cjs');

function fixture(t, dependencies = {}) {
  const parent = path.resolve(__dirname, '..', 'test-data');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'terminal-color-'));
  const inherited = { NO_COLOR: '1', FORCE_COLOR: '0', CLICOLOR: '0', TERM: 'dumb', COLORTERM: '' };
  const original = Object.fromEntries(Object.keys(inherited).map(key => [key, process.env[key]]));
  Object.assign(process.env, inherited);
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(parent));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const calls = [];
  const make = () => new Sessions(root, {
    nativeCodex: () => 'codex.exe', findProgram: () => process.execPath,
    claude: { kind: 'native', path: 'claude.exe' },
    cliSetup: { executable: () => 'opencode.exe' },
    prepareCodexSession: async () => [],
    pty: { spawn(executable, args, options) {
      calls.push({ executable, args, options });
      return { onData() {}, onExit() {}, kill() {} };
    } },
    ...dependencies
  });
  return { root, make, calls, inherited };
}

function assertColorTerminal(call) {
  const { env, name } = call.options;
  assert.equal(name, 'xterm-256color');
  assert.equal(env.TERM, 'xterm-256color');
  assert.equal(env.COLORTERM, 'truecolor');
  for (const key of ['NO_COLOR', 'FORCE_COLOR', 'CLICOLOR']) {
    assert.equal(env[key], undefined, `${key} from Dock's launcher must not suppress console colors`);
  }
}

test('new and resumed consoles detect colors independently of the process that started Dock', async t => {
  const { root, make, calls, inherited } = fixture(t);
  const sessions = make();
  const threads = [crypto.randomUUID(), crypto.randomUUID()];
  for (const [index, provider] of ['codex', 'claude', 'opencode', 'shell', 'custom'].entries()) {
    await sessions.create({ provider, cwd: root, command: 'Write-Output test' }, { resumeId: threads[index] });
  }
  const saved = sessions.savedConsoles();
  const restored = make();
  for (const entry of saved) await restored.restore(entry);
  assert.equal(calls.length, 10);
  calls.forEach(assertColorTerminal);
  assert.deepEqual(calls[5].args.slice(0, 2), ['resume', threads[0]]);
  assert.equal(calls[6].args[calls[6].args.indexOf('--resume') + 1], threads[1]);
  for (const [key, value] of Object.entries(inherited)) {
    assert.equal(process.env[key], value, 'Changing a child environment must not change the host environment');
  }
});

test('SSH terminals also discard inherited color suppression without forwarding Dock credentials', async t => {
  const { root, make, calls } = fixture(t, {
    ssh: { launch: () => ({ executable: 'ssh.exe', args: ['example'], remote: { hostId: 'test', tmux: 'dock-test' } }) }
  });
  await make().create({ remoteHostId: 'test', provider: 'shell', cwd: root });
  assertColorTerminal(calls[0]);
  assert.ok(!Object.keys(calls[0].options.env).some(key => key.startsWith('AGENT_DOCK_')));
});
