'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { SubscriptionUsage, UsageError, UsageTransport, usageEnvironment, claudeReading, copilotReading, kiroReading, kimiReading, readClaudeUsage, readCopilotUsage, readKiroUsage, readKimiUsage } = require('../electron/subscription-usage.cjs');

const reading = (provider, id, at = 100) => [{ id, accountId: id, provider, observedAt: at, windows: [{ minutes: 300, usedPercent: 34 }] }];
const claudeQuota = { rate_limits_available: true, subscription_type: 'pro', rate_limits: { five_hour: { utilization: 20, resets_at: '2030-01-01T00:00:00Z' }, seven_day: { utilization: 72, resets_at: '2030-01-07T00:00:00Z' } } };
const copilotQuota = { quotaSnapshots: { premium_interactions: { entitlementRequests: 300, remainingPercentage: 60, resetDate: '2030-02-01T00:00:00Z' }, chat: { entitlementRequests: -1 } } };

function childFixture(onWrite = () => {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({ write(chunk, encoding, done) { onWrite(chunk); done(); } });
  child.exitCode = null; child.signalCode = null; child.kills = 0;
  child.kill = () => { if (child.exitCode !== null) return; child.kills++; child.exitCode = 0; child.emit('exit', 0); };
  child.stdin.on('finish', () => child.kill());
  return child;
}
function protocolFixture(format, answer) {
  let input = Buffer.alloc(0), child, options, argv; const requests = [];
  const spawnProcess = (file, args, opts) => {
    options = opts; argv = args;
    child = childFixture(chunk => {
      input = Buffer.concat([input, chunk]);
      let body;
      if (format === 'framed') {
        const end = input.indexOf('\r\n\r\n'); if (end < 0) return;
        const length = Number(/Content-Length: (\d+)/.exec(input.toString())?.[1]);
        if (input.length < end + 4 + length) return;
        body = input.subarray(end + 4, end + 4 + length); input = input.subarray(end + 4 + length);
      } else { const end = input.indexOf('\n'); if (end < 0) return; body = input.subarray(0, end); input = input.subarray(end + 1); }
      const request = JSON.parse(body.toString()); requests.push(request);
      const method = format === 'framed' ? request.method : request.request.subtype;
      const result = answer(method);
      const response = format === 'framed' ? { jsonrpc: '2.0', id: request.id, ...result } : { type: 'control_response', response: { request_id: request.request_id, subtype: result.error ? 'error' : 'success', response: result.result, error: result.error } };
      const encoded = Buffer.from(JSON.stringify(response));
      const wire = format === 'framed' ? Buffer.concat([Buffer.from(`Content-Length: ${encoded.length}\r\n\r\n`), encoded]) : Buffer.concat([encoded, Buffer.from('\n')]);
      queueMicrotask(() => { child.stdout.write(wire.subarray(0, 7)); child.stdout.write(wire.subarray(7)); });
    }); return child;
  };
  return { spawnProcess, requests, get child() { return child; }, get options() { return options; }, get argv() { return argv; } };
}

test('refresh checks every provider and keeps each account separate', async () => {
  const calls = [], saved = [];
  const readers = Object.fromEntries(['codex', 'claude', 'copilot', 'kiro', 'kimi'].map(provider => [provider, async account => { calls.push(account.id); return reading(provider, account.id); }]));
  const accounts = Object.keys(readers).map(provider => ({ id: provider + ':default', provider }));
  accounts.push({ id: 'claude:second', provider: 'claude' });
  const usage = new SubscriptionUsage({ readers, now: () => 100, onReading: (account, values) => saved.push([account.id, values[0].accountId]) });
  await usage.refresh(accounts);
  assert.deepEqual(calls.sort(), accounts.map(a => a.id).sort());
  assert.ok(saved.every(([id, returned]) => id === returned));
  assert.ok(usage.snapshot().every(state => state.status === 'current'));
});

test('failed refresh retains reading time and reports safe errors per provider', async () => {
  let now = 100, fail = false; const saved = [];
  const usage = new SubscriptionUsage({ cooldownMs: 0, now: () => now, onReading: (a, values) => saved.push(values), readers: {
    claude: async a => { if (fail) throw Error('network SECRET_TOKEN user@example.com'); return reading('claude', a.id, now); },
    copilot: async () => { throw new UsageError('sign-in', 'Sign in through this CLI, then refresh.'); },
  } });
  const accounts = [{ id: 'claude:default', provider: 'claude' }, { id: 'copilot:default', provider: 'copilot' }, { id: 'gemini:default', provider: 'gemini' }];
  await usage.refresh(accounts); fail = true; now += 20000; await usage.refresh(accounts);
  const states = usage.snapshot();
  assert.equal(states[0].observedAt, 100); assert.equal(states[0].checkedAt, now); assert.equal(states[0].status, 'unavailable');
  assert.equal(states[1].status, 'sign-in'); assert.equal(states[2].status, 'unsupported');
  assert.equal(saved.length, 1); assert.doesNotMatch(JSON.stringify(states), /SECRET_TOKEN|user@example/);
});

test('refresh deduplicates accounts, bounds helpers, and has a cooldown', async () => {
  let active = 0, maximum = 0, calls = 0, now = 100;
  const usage = new SubscriptionUsage({ now: () => now, readers: { claude: async a => {
    active++; calls++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return reading('claude', a.id, now);
  } } });
  const accounts = Array.from({ length: 7 }, (_, i) => ({ id: 'claude:' + i, provider: 'claude' }));
  await Promise.all([usage.refresh([...accounts, accounts[0]]), usage.refreshOne(accounts[0])]);
  assert.equal(calls, 7); assert.ok(maximum <= 3);
  await usage.refresh(accounts); assert.equal(calls, 7);
  now += 15000; await usage.refresh(accounts); assert.equal(calls, 14);
});

test('readings for the wrong account or invalid time are rejected', async () => {
  let saves = 0;
  const usage = new SubscriptionUsage({ readers: { claude: async () => reading('claude', 'wrong') }, onReading: () => saves++ });
  await usage.refresh([{ id: 'claude:default', provider: 'claude' }]);
  assert.equal(saves, 0); assert.equal(usage.snapshot()[0].status, 'unavailable');
});

test('Claude reader requests account usage without a prompt and preserves profile isolation', async () => {
  const fixture = protocolFixture('lines', method => ({ result: method === 'get_usage' ? claudeQuota : {} }));
  const values = await readClaudeUsage({ executable: 'claude.exe', accountId: 'claude:second', env: { CLAUDE_CONFIG_DIR: 'private-profile', ANTHROPIC_API_KEY: 'secret', PADDOCK_TOKEN: 'secret' }, ...fixture });
  assert.deepEqual(fixture.requests.map(r => r.request.subtype), ['initialize', 'get_usage']);
  assert.equal(fixture.requests[1].request.skip_behaviors, true);
  assert.ok(fixture.requests.every(r => r.type === 'control_request'));
  assert.equal(fixture.options.env.CLAUDE_CONFIG_DIR, 'private-profile'); assert.equal(fixture.options.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(fixture.options.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, undefined);
  assert.ok(fixture.argv.includes('--restricted')); assert.ok(fixture.argv.includes('--no-session-persistence'));
  assert.equal(values[0].accountId, 'claude:second'); assert.deepEqual(values[0].windows.map(w => w.usedPercent), [20, 72]);
});

test('Copilot reader handles fragmented framed messages and unlimited allowances', async () => {
  const fixture = protocolFixture('framed', method => ({ result: method === 'account.getQuota' ? copilotQuota : {} }));
  const result = await readCopilotUsage({ executable: 'copilot.exe', ...fixture });
  assert.deepEqual(fixture.requests.map(r => r.method), ['ping', 'account.getQuota']);
  assert.equal(result[0].windows[0].usedPercent, 40); assert.equal(result[0].windows[1].unlimited, true);
  assert.equal(result[0].windows[1].usedPercent, null);
});

test('native errors, process exits and timeouts release owned helpers', async () => {
  const denied = protocolFixture('framed', () => ({ error: { message: 'Not authenticated SECRET' } }));
  await assert.rejects(readCopilotUsage({ executable: 'copilot.exe', ...denied }), e => e.code === 'sign-in' && !e.message.includes('SECRET'));
  const child = childFixture(), reader = new UsageTransport('cli.exe', [], { spawnProcess: () => child, timeoutMs: 5 });
  await assert.rejects(reader.request('read'), e => e.code === 'timeout');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(child.kills, 1);
  const dead = childFixture(), exited = new UsageTransport('cli.exe', [], { spawnProcess: () => dead });
  dead.kill(); await assert.rejects(exited.request('read'), /closed/); exited.close();
});

test('quota parsers reject missing and invalid values without inventing zero', () => {
  assert.throws(() => claudeReading({ rate_limits_available: true, rate_limits: null }, 'a'), UsageError);
  assert.throws(() => claudeReading({ rate_limits_available: true, rate_limits: { five_hour: { utilization: -1 } } }, 'a'), UsageError);
  assert.throws(() => copilotReading({ quotaSnapshots: { chat: { remainingPercentage: '80' } } }, 'a'), UsageError);
  const report = kimiReading({ kind: 'ok', quota: { usages: { limit5h: { usedRatio: .25 }, monthCode: { usedRatio: .7 }, limit7d: { usedRatio: 2 } } } }, 'a', 123);
  assert.deepEqual(report[0].windows.map(w => [w.label, w.usedPercent]), [['5-hour', 25], ['Monthly Code', 70]]);
});

test('Kiro reads its V2 local command with tools and MCP disabled', async t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-usage-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const output = 'Estimated Usage\nresets on 2030-02-01 | PRO\nCredits used: 300\nCredits covered in plan (25 of 500)\nBonus credits:\nPromotion - 10/100 used (3 days left)\nOverages: 275';
  let argumentsUsed;
  const result = await readKiroUsage({ executable: 'kiro.exe', cwd, run: (file, args, options, done) => {
    argumentsUsed = args; queueMicrotask(() => done(null, output, '')); return childFixture();
  } });
  assert.deepEqual(argumentsUsed.slice(0, 4), ['chat', '--agent-engine', 'v2', '--no-interactive']);
  assert.equal(argumentsUsed.at(-1), '/usage');
  assert.deepEqual(result[0].windows.map(w => w.usedPercent), [5, 10]);
  const config = JSON.parse(fs.readFileSync(path.join(cwd, '.kiro/agents/paddock-usage.json')));
  assert.deepEqual(config.tools, []); assert.deepEqual(config.hooks, {}); assert.equal(config.includeMcpJson, false);
  assert.throws(() => kiroReading('Estimated Usage\nCredits covered in plan (NaN of 0)', 'a'), UsageError);
});

test('Kimi calls only the authenticated loopback quota route and closes its server', async () => {
  let child, request;
  const result = await readKimiUsage({ executable: 'kimi.exe', spawnProcess: (file, args, options) => {
    assert.deepEqual(args, ['web', '--port', '0', '--host', '127.0.0.1', '--no-open']); assert.equal(options.windowsHide, true);
    child = childFixture(); queueMicrotask(() => { child.stdout.write('Local: http://127.0.0.1:12345/#token=PRIVATE_'); child.stdout.write('LOCAL_TOKEN\n'); }); return child;
  }, fetchUsage: async (url, options) => {
    request = { url, options }; return new Response(JSON.stringify({ code: 0, data: { kind: 'ok', quota: { usages: { limit5h: { usedRatio: .2 } } } } }));
  } });
  assert.equal(request.url, 'http://127.0.0.1:12345/api/v1/oauth/usage');
  assert.equal(request.options.headers.Authorization, 'Bearer PRIVATE_LOCAL_TOKEN'); assert.equal(request.options.redirect, 'error');
  assert.equal(child.kills, 1); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_LOCAL_TOKEN/);
});

test('Kimi refuses a non-loopback startup URL without making a request', async () => {
  let requests = 0, child;
  await assert.rejects(readKimiUsage({ executable: 'kimi.exe', timeoutMs: 5, spawnProcess: () => {
    child = childFixture(); queueMicrotask(() => child.stdout.write('Local: http://example.com:12345/#token=secret')); return child;
  }, fetchUsage: () => { requests++; } }), e => e.code === 'timeout');
  assert.equal(requests, 0); assert.equal(child.kills, 1);
});

test('usage environment removes inherited agent credentials without mutating the original', () => {
  const original = { PATH: 'tools', CODEX_HOME: 'account-one', CLAUDE_CONFIG_DIR: 'account-two', PADDOCK_SECRET: 's', KIRO_API_KEY: 's', GH_TOKEN: 's', NODE_OPTIONS: '--require bad', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
  assert.deepEqual(usageEnvironment(original), { PATH: 'tools', CODEX_HOME: 'account-one', CLAUDE_CONFIG_DIR: 'account-two', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' });
  assert.equal(original.KIRO_API_KEY, 's');
});

test('Kiro Free native usage reports fractional credits in the current CLI format', () => {
  const value = kiroReading('Estimated Usage | resets on 2026-11-01 | KIRO FREE\nCredits (7.95 of 50 covered in plan), 15.9%', 'kiro:default', 123);
  assert.equal(value[0].windows[0].label, 'Free plan credits');
  assert.equal(value[0].windows[0].used, 7.95); assert.equal(value[0].windows[0].total, 50);
  assert.equal(value[0].windows[0].usedPercent, 15.9);
  assert.equal(value[0].observedAt, 123);
});
