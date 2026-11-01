'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { readPiUsage, authCredential, selectedRoute, freeAlternatives } = require('../electron/pi-usage.cjs');

const SECRET = 'sk-or-v1-TEST_ONLY_NOT_A_REAL_KEY_000000';
const KEY = { label: 'sk-or-v1-abc...xyz', usage: 0, limit: null, limit_remaining: null, is_free_tier: true, free_model_daily_requests: { used: 18, limit: 50, remaining: 32 } };
const CREDITS = { total_credits: 0, total_usage: 0 };
const CATALOG = [
  { id: 'moonshotai/kimi-k2.6', pricing: { prompt: '0.00000065', completion: '0.00000341' }, supported_parameters: ['tools'], context_length: 262144 },
  { id: 'cohere/north-mini-code:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools', 'temperature'], context_length: 131072 },
  { id: 'someone/chat-only:free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature'] },
  { id: 'someone/per-request:free', pricing: { prompt: '0', completion: '0', request: '0.01' }, supported_parameters: ['tools'] },
  { id: 'someone/unpriced', supported_parameters: ['tools'] },
  { id: '--bad id', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] }];

function settings(t, value) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-pi-usage-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'settings.json');
  if (value !== undefined) fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
}
function fixture({ auth = JSON.stringify({ provider: 'openrouter', status: 'ready', credentials: SECRET }), runError = null, key = { status: 200, body: { data: KEY } },
  credits = { status: 200, body: { data: CREDITS } }, models = { status: 200, body: { data: CATALOG } } } = {}) {
  const calls = [], commands = [];
  const run = (file, args, options, done) => { commands.push({ file, args, options }); queueMicrotask(() => done(runError, runError ? auth : auth, '')); return { stdin: { end() {} } }; };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const reply = { 'https://openrouter.ai/api/v1/key': key, 'https://openrouter.ai/api/v1/credits': credits, 'https://openrouter.ai/api/v1/models': models }[url];
    if (!reply) throw new Error('unexpected url ' + url);
    if (reply.hang) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    if (reply.throws) throw new Error('network ' + SECRET);
    return new Response(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body), { status: reply.status });
  };
  return { run, fetchImpl, calls, commands };
}
const read = (f, extra = {}) => readPiUsage({ executable: 'pi.exe', run: f.run, fetchImpl: f.fetchImpl, env: { OPENROUTER_API_KEY: 'ENVSECRET', PADDOCK_BRIDGE_TOKEN: 'X', PATH: 'p' }, now: () => 1000, timeoutMs: 200, settingsPath: path.join(os.tmpdir(), 'paddock-pi-no-settings', 'settings.json'), ...extra });
const noLeak = value => { const text = JSON.stringify(value) + String(value?.message || ''); assert.ok(!text.includes(SECRET) && !text.includes('ENVSECRET')); };

test('saved paid Kimi stays metered with zero balance while the free window is shown separately', async t => {
  const f = fixture();
  const [r] = await read(f, { settingsPath: settings(t, { defaultProvider: 'openrouter', defaultModel: 'moonshotai/kimi-k2.6', apiKey: 'ignored', packages: ['x'] }) });
  assert.deepEqual(f.commands[0].args, ['auth', 'check', '--provider', 'openrouter', '--json', '--credentials', '--no-refresh']);
  assert.equal(f.commands[0].options.env.OPENROUTER_API_KEY, undefined); assert.equal(f.commands[0].options.env.PADDOCK_BRIDGE_TOKEN, undefined);
  assert.equal(r.id, 'pi:default'); assert.equal(r.provider, 'pi'); assert.equal(r.observedAt, 1000); assert.ok(r.source);
  assert.deepEqual(r.route, { provider: 'openrouter', model: 'moonshotai/kimi-k2.6' });
  assert.equal(r.funding, 'metered'); assert.equal(r.modelAllowed, false); assert.equal(r.remainingCredits, 0); assert.equal(r.creditsKnown, true);
  assert.equal(r.windows.length, 1);
  assert.deepEqual({ used: r.windows[0].used, total: r.windows[0].total, remaining: r.windows[0].remaining, unit: r.windows[0].unit }, { used: 18, total: 50, remaining: 32, unit: 'requests' });
  assert.deepEqual(r.freeAlternatives.map(m => m.route), ['openrouter/cohere/north-mini-code:free']);
  noLeak(r);
});

test('credential goes only to exact key and credits endpoints, without redirects', async () => {
  const f = fixture();
  await read(f, { model: 'openrouter/cohere/north-mini-code:free' });
  assert.deepEqual(f.calls.map(c => c.url).sort(), ['https://openrouter.ai/api/v1/credits', 'https://openrouter.ai/api/v1/key', 'https://openrouter.ai/api/v1/models']);
  for (const call of f.calls) {
    assert.equal(call.options.redirect, 'error'); assert.equal(call.options.method, 'GET'); assert.ok(call.options.signal);
    assert.equal(call.options.headers.Authorization, call.url.endsWith('/models') ? undefined : 'Bearer ' + SECRET);
  }
});

test('a selected free route uses the free request window, not the paid default', async t => {
  const file = settings(t, { defaultProvider: 'openrouter', defaultModel: 'moonshotai/kimi-k2.6' });
  const [r] = await read(fixture(), { model: 'openrouter/cohere/north-mini-code:free', settingsPath: file });
  assert.equal(r.funding, 'free'); assert.equal(r.modelAllowed, true); assert.equal(r.remainingCredits, null);
  const spent = fixture({ key: { status: 200, body: { data: { ...KEY, free_model_daily_requests: { used: 50, limit: 50, remaining: 0 } } } } });
  const [s] = await read(spent, { model: 'openrouter/cohere/north-mini-code:free' });
  assert.equal(s.modelAllowed, false);
});

test('free-tier flag never makes an unpriced, missing or non-OpenRouter model free', async t => {
  for (const extra of [{ model: 'openrouter/someone/unpriced' }, { model: 'openrouter/missing/model' }, { model: 'anthropic/claude-x' },
    { settingsPath: settings(t) }, { settingsPath: settings(t, '{not json') }, { settingsPath: settings(t, { defaultModel: '--tools=bash' }) }]) {
    const [r] = await read(fixture(), extra);
    assert.equal(r.funding, 'unknown', JSON.stringify(extra)); assert.equal(r.modelAllowed, null); assert.equal(r.remainingCredits, null);
    assert.equal(r.windows.length, 1, 'account free window is still shown');
  }
});

test('credits, catalog and malformed counters fail to unknown rather than zero', async () => {
  const [a] = await read(fixture({ credits: { status: 500, body: {} } }), { model: 'openrouter/moonshotai/kimi-k2.6' });
  assert.equal(a.funding, 'metered'); assert.equal(a.remainingCredits, null); assert.equal(a.modelAllowed, null); assert.equal(a.creditsKnown, false);
  const [b] = await read(fixture({ credits: { throws: true }, key: { status: 200, body: { data: { ...KEY, limit_remaining: 0 } } } }), { model: 'openrouter/moonshotai/kimi-k2.6' });
  assert.equal(b.modelAllowed, false, 'a zero key cap blocks metered use');
  const [c] = await read(fixture({ models: { status: 503, body: {} } }), { model: 'openrouter/cohere/north-mini-code:free' });
  assert.equal(c.funding, 'unknown'); assert.equal(c.catalogKnown, false); assert.deepEqual(c.freeAlternatives, []);
  const [d] = await read(fixture({ key: { status: 200, body: { data: { ...KEY, free_model_daily_requests: { used: 40, limit: 50, remaining: 32 } } } } }), { model: 'openrouter/cohere/north-mini-code:free' });
  assert.deepEqual(d.windows, []); assert.equal(d.modelAllowed, null);
  const [e] = await read(fixture({ credits: { status: 200, body: { data: { total_credits: 5, total_usage: 2 } } } }), { model: 'openrouter/moonshotai/kimi-k2.6' });
  assert.equal(e.remainingCredits, 3); assert.equal(e.modelAllowed, true);
});

test('key endpoint errors map to safe codes without exposing the credential', async () => {
  for (const [key, code] of [[{ status: 401, body: { error: SECRET } }, 'sign-in'], [{ status: 403, body: {} }, 'sign-in'], [{ status: 429, body: {} }, 'limited'],
    [{ status: 500, body: { error: SECRET } }, 'unavailable'], [{ throws: true }, 'unavailable'], [{ hang: true }, 'timeout'],
    [{ status: 200, body: 'not json ' + SECRET }, 'unavailable'], [{ status: 200, body: { data: null } }, 'unavailable'], [{ status: 200, body: 'x'.repeat(1024 * 1024 + 10) }, 'unavailable']]) {
    await assert.rejects(read(fixture({ key }), { timeoutMs: 30 }), e => { noLeak(e); return e.code === code; });
  }
});

test('Pi auth check failures stay generic and never reach the network', async () => {
  for (const [input, code] of [[{ auth: JSON.stringify({ status: 'missing' }) }, 'sign-in'], [{ auth: JSON.stringify({ credentials: { key: SECRET } }) }, 'sign-in'],
    [{ auth: JSON.stringify({ credentials: 'has space ' + SECRET }) }, 'sign-in'], [{ auth: 'garbage ' + SECRET }, 'sign-in'],
    [{ auth: 'Not authenticated ' + SECRET, runError: Object.assign(new Error('exit 1 ' + SECRET), { code: 1 }) }, 'sign-in'],
    [{ auth: SECRET, runError: Object.assign(new Error('killed'), { killed: true }) }, 'timeout'],
    [{ auth: SECRET, runError: new Error('exit ' + SECRET) }, 'unavailable']]) {
    const f = fixture(input);
    await assert.rejects(read(f), e => { noLeak(e); return e.code === code; }, JSON.stringify(input).slice(0, 60));
    assert.equal(f.calls.length, 0);
  }
  await assert.rejects(readPiUsage({}), e => e.code === 'not-installed');
  assert.equal(authCredential('warning: update available\n' + JSON.stringify({ credentials: SECRET })), SECRET);
});

test('settings reader uses only whitelisted provider and model fields', t => {
  assert.deepEqual(selectedRoute({ settingsPath: settings(t, { defaultProvider: 'OpenRouter', defaultModel: 'cohere/north-mini-code:free', secret: SECRET }) }), { provider: 'openrouter', model: 'cohere/north-mini-code:free' });
  assert.deepEqual(selectedRoute({ settingsPath: settings(t, { defaultModel: 'openrouter/moonshotai/kimi-k2.6' }) }), { provider: 'openrouter', model: 'moonshotai/kimi-k2.6' });
  assert.equal(selectedRoute({ settingsPath: settings(t, { defaultProvider: 'a/b', defaultModel: 'm' }) }), null);
  assert.equal(selectedRoute({ settingsPath: settings(t, [1, 2]) }), null);
  assert.equal(selectedRoute({ settingsPath: settings(t, 'x'.repeat(300 * 1024)) }), null);
  assert.deepEqual(freeAlternatives(CATALOG, 0), []);
});
