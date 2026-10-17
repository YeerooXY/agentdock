'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { prepareCodexSession, startupHook } = require('../electron/codex-session.cjs');
const options = { node: 'C:\\Program Files\\node.exe', helper: "C:\\User's Apps\\event.cjs", root: 'C:\\Dock', session: 'a'.repeat(36), cwd: 'C:\\Project', env: {} };
function fixture(entries, { stall = false, timeout = 200 } = {}) {
  const calls = [], sent = []; let killed = false;
  const spawnProcess = (...args) => {
    calls.push(args); const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => { killed = true; queueMicrotask(() => child.emit('exit')); };
    child.stdin.on('data', data => {
      const message = JSON.parse(data.toString()); sent.push(message);
      if (stall || !message.id) return;
      const response = message.id === 1 ? { id: 1, result: {} } : { id: 2, result: { data: [{ hooks: entries }] } };
      queueMicrotask(() => { const line = JSON.stringify(response) + '\n'; child.stdout.write(line.slice(0, 17)); child.stdout.write(line.slice(17)); });
    }); return child;
  };
  return { promise: prepareCodexSession('codex.exe', options, { spawnProcess, timeout }), calls, sent, killed: () => killed };
}
const hook = () => ({ source: 'sessionFlags', eventName: 'sessionStart', handlerType: 'command', command: startupHook(options.node, options.helper, options.root, options.session), enabled: true, async: false, matcher: null, timeoutSec: 10, key: 'C:\\<session-flags>\\config.toml:session_start:0:0', currentHash: 'sha256:' + 'a'.repeat(64) });
test('Codex startup config trusts only Dock’s exact metadata hook, with no global config writes or bypass', async () => {
  const f = fixture([hook(), { ...hook(), source: 'project', key: 'other-hook', currentHash: 'sha256:' + 'b'.repeat(64) }]);
  const args = await f.promise;
  assert.ok(args.some(x => x.startsWith('hooks.SessionStart='))); assert.ok(args.some(x => x.includes(hook().currentHash)));
  assert.ok(!args.join(' ').includes('other-hook')); assert.ok(!args.join(' ').includes('dangerously'));
  assert.deepEqual(f.sent.filter(x => x.id).map(x => x.method), ['initialize', 'hooks/list']);
  assert.equal(f.calls[0][2].windowsHide, true); assert.equal(f.killed(), true);
  const script = Buffer.from(hook().command.split(' ').at(-1), 'base64').toString('utf16le');
  assert.ok(script.includes("User''s Apps")); assert.ok(script.includes('codex-session')); assert.ok(!script.includes('TOKEN'));
});
test('missing, disabled, changed, or ambiguous hook definitions fail closed', async () => {
  for (const entries of [[], [null], [{ ...hook(), enabled: false }], [{ ...hook(), command: 'another-command' }], [hook(), hook()]]) {
    const f = fixture(entries); await assert.rejects(f.promise, /Update Codex/); assert.equal(f.killed(), true);
  }
});
test('a stalled Codex metadata process is stopped after the setup timeout', async () => {
  const f = fixture([], { stall: true, timeout: 15 }); await assert.rejects(f.promise, /timed out/); assert.equal(f.killed(), true);
});
