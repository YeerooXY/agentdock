'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { cursorReading, readCursorUsage } = require('../electron/cursor-usage.cjs');
const { stopUsageReaders } = require('../electron/subscription-usage.cjs');
const screen = `Usage • Free                       Resets Dec 1
Monthly plan and on-demand usage
Category    Current    Usage
Included    19% used    ███░░
  Auto      38% used    ███░░
  API       0% used     ░░░░░
On-Demand   Disabled   ——
On-demand usage is off
Esc to close`;
function fixture({ startup = 'Cursor Agent\r\nAsk', command = 'Show plan and on-demand usage', response = screen } = {}) {
  let data, exit, options, args, kills = 0; const writes = [];
  const emit = value => queueMicrotask(() => data?.('\x1b[2J\x1b[H' + value.replaceAll('\n', '\r\n')));
  const child = { onData(fn) { data = fn; emit(startup); return { dispose() { data = null; } }; },
    onExit(fn) { exit = fn; return { dispose() { exit = null; } }; },
    write(value) { writes.push(value); emit(value === '/usage' ? command : response); } };
  return { writes, emit, exit: () => exit?.(), get options() { return options; }, get args() { return args; }, get kills() { return kills; },
    spawnPty(file, argv, opts) { args = argv; options = opts; return child; }, stopProcess() { kills++; }, executable: 'cursor-agent.exe', cwd: '/usage', timeoutMs: 1000, settleMs: 2 };
}
test('Cursor native reading preserves independent percentages and imprecise reset label', () => {
  const [r] = cursorReading(screen, 'cursor:default', 10);
  assert.equal(r.plan, 'Free'); assert.equal(r.observedAt, 10);
  assert.deepEqual(r.windows.map(w => w.usedPercent), [19, 38, 0]);
  assert.equal(new Set(r.windows.map(w => w.modelGroup)).size, 3);
  assert.ok(r.windows.every(w => w.resetsAt === null && w.resetLabel === 'Resets Dec 1'));
  for (const s of [screen.replace('19%', '101%'), screen.replace('Esc to close', ''), screen.replace('0% used', 'Unknown'), 'Usage unavailable']) assert.equal(cursorReading(s), null);
});
test('Cursor submits only a confirmed native usage command and cleans up its own process', async () => {
  const f = fixture(); const r = await readCursorUsage({ ...f, env: { CURSOR_API_KEY: 'PRIVATE', PADDOCK_BRIDGE_TOKEN: 'PRIVATE' } });
  assert.deepEqual(f.writes, ['/usage', '\r']); assert.equal(f.kills, 1); assert.equal(r[0].provider, 'cursor');
  assert.deepEqual(f.args, ['--mode', 'ask', '--trust']);
  assert.equal(f.options.env.CURSOR_API_KEY, undefined); assert.equal(f.options.env.PADDOCK_BRIDGE_TOKEN, undefined);
});
test('missing native command is never submitted as a model prompt', async () => {
  const f = fixture({ command: 'No commands found' });
  await assert.rejects(readCursorUsage({ ...f, timeoutMs: 80 }), e => e.code === 'timeout');
  assert.deepEqual(f.writes, ['/usage']); assert.equal(f.kills, 1);
});
test('login, unavailable plans, service errors and shutdown do not leak raw diagnostics', async () => {
  for (const [input, code] of [[{startup:'Not logged in'},'sign-in'],[{response:'Usage details are not available for this plan in the CLI.'},'unsupported'],[{response:'Failed to load usage data: PRIVATE'},'unavailable']]) {
    const f = fixture(input); await assert.rejects(readCursorUsage(f), e => e.code === code && !e.message.includes('PRIVATE')); assert.equal(f.kills, 1);
  }
  const f = fixture({startup:''}), pending = readCursorUsage(f); stopUsageReaders();
  await assert.rejects(pending, e => e.code === 'unavailable'); assert.equal(f.kills, 1);
});
