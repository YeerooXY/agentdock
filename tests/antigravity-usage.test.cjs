'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { antigravityReading, readAntigravityUsage } = require('../electron/antigravity-usage.cjs');
const { stopUsageReaders } = require('../electron/subscription-usage.cjs');
const screen = `Models & Quota
Account: private@example.com
GEMINI MODELS
Models within this group: Gemini Flash, Gemini Pro
Weekly Limit Remaining
 [████░] 99.05%
 Refreshes in 167h 49m
Five Hour Limit Remaining
 [████░] 98.84%
 Refreshes in 4h 49m
CLAUDE AND GPT MODELS
Models within this group: Claude Opus, Claude Sonnet, GPT-OSS
Weekly Limit Remaining
 [█████] 100.00%
 Quota available
Five Hour Limit Remaining
 [█████] 100.00%
 Quota available
↑/↓ Scroll · esc Close`;

function fixture({ response = screen, startup = 'Antigravity CLI 1.4.12\r\n? for shortcuts', silent = false } = {}) {
  let data, exit, options, args, kills = 0; const writes = [];
  const child = {
    onData(fn) { data = fn; if (!silent) queueMicrotask(() => data?.(startup)); return { dispose() { data = null; } }; },
    onExit(fn) { exit = fn; return { dispose() { exit = null; } }; },
    write(text) {
      writes.push(text);
      if (text === '\r' && response) {
        const wire = '\x1b[2J\x1b[H' + response.replaceAll('\n', '\r\n');
        queueMicrotask(() => { data?.(wire.slice(0, 95)); data?.(wire.slice(95)); });
      }
    },
  };
  return { child, writes, get options() { return options; }, get args() { return args; }, get kills() { return kills; },
    emit: text => data?.(text), exit: () => exit?.({ exitCode: 1 }),
    spawnPty: (file, argv, opts) => { args = argv; options = opts; return child; }, stopProcess: () => { kills++; }, cwd: '/owned/usage', executable: 'agy', timeoutMs: 1500,
  };
}

test('native quota retains separate model pools, windows and reset times without account identity', () => {
  const [value] = antigravityReading(screen, 'antigravity:default', 1000);
  assert.deepEqual(value.windows.map(w => w.usedPercent), [.95, 1.16, 0, 0]);
  assert.deepEqual(value.windows.map(w => w.minutes), [10080, 300, 10080, 300]);
  assert.equal(new Set(value.windows.map(w => w.key)).size, 4);
  assert.equal(value.windows[0].resetsAt, 1000 + (167 * 60 + 49) * 60000);
  assert.equal(value.windows[2].resetsAt, null);
  assert.equal(value.observedAt, 1000);
  assert.doesNotMatch(JSON.stringify(value), /private@example/);
});

test('partial, invalid, loading and unknown quota layouts never invent a reading', () => {
  for (const invalid of [screen.replace('esc Close', ''), screen.replace('99.05%', '101%'), screen.replace('99.05%', 'unknown'), screen.replace('167h 49m', 'tomorrow'), screen.replace('Five Hour Limit Remaining', 'Different limit'), screen + '\nRefreshing']) assert.equal(antigravityReading(invalid), null);
  assert.equal(antigravityReading('Login required'), null);
  const single = screen.split('CLAUDE AND GPT MODELS')[0] + 'esc Close';
  assert.equal(antigravityReading(single)[0].windows.length, 2);
});

test('reader uses only native /usage, session-only settings, sanitized environment and owned cleanup', async () => {
  const f = fixture();
  const result = await readAntigravityUsage({ ...f, env: { PATH: 'tools', PADDOCK_BRIDGE_TOKEN: 'secret', GOOGLE_API_KEY: 'secret' }, now: () => 1234 });
  assert.deepEqual(f.writes, ['/usage', '\r']);
  assert.deepEqual(f.args.slice(0, 1), ['--settings']);
  const settings = JSON.parse(f.args[1]);
  assert.equal(settings.toolPermission, 'strict'); assert.equal(settings.agentMode, 'plan');
  assert.deepEqual(settings.trustedWorkspaces, ['/owned/usage']);
  assert.equal(f.options.env.GOOGLE_API_KEY, undefined); assert.equal(f.options.env.PADDOCK_BRIDGE_TOKEN, undefined);
  assert.equal(result[0].observedAt, 1234); assert.equal(f.kills, 1);
});

test('login gates do not submit commands and timeouts close owned readers', async () => {
  const login = fixture({ startup: 'Sign in with Google' });
  await assert.rejects(readAntigravityUsage(login), error => error.code === 'sign-in');
  assert.deepEqual(login.writes, []); assert.equal(login.kills, 1);
  const quiet = fixture({ silent: true });
  await assert.rejects(readAntigravityUsage({ ...quiet, timeoutMs: 10 }), error => error.code === 'timeout');
  assert.deepEqual(quiet.writes, []); assert.equal(quiet.kills, 1);
});

test('shutdown, early exit and excessive output cancel the reader without exposing native data', async () => {
  for (const action of ['shutdown', 'exit', 'oversize']) {
    const f = fixture({ silent: true }); const pending = readAntigravityUsage(f);
    if (action === 'shutdown') stopUsageReaders();
    if (action === 'exit') f.exit();
    if (action === 'oversize') f.emit('PRIVATE'.repeat(160000));
    await assert.rejects(pending, error => error.code === 'unavailable' && !error.message.includes('PRIVATE'));
    assert.equal(f.kills, 1); assert.deepEqual(f.writes, []);
  }
});
