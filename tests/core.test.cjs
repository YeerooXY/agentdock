'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { codexLimits, claudeLimits, normalizeUsage, estimateCost, ledgerSummary } = require('../electron/domain.cjs');
const { callApi } = require('../electron/api.cjs');
const { Vault, atomicJson, readJson } = require('../electron/storage.cjs');
const { summarizeLog, consoleModels } = require('../electron/adapters.cjs');
const parent = path.resolve(__dirname, '..', 'test-data');
fs.mkdirSync(parent, { recursive: true });
const temp = fs.mkdtempSync(path.join(parent, 'core-'));
after(() => { assert.equal(path.dirname(fs.realpathSync(temp)), fs.realpathSync(parent)); fs.rmSync(temp, { recursive: true }); });

test('console model choices expose only visible model IDs and names from the local cache', () => {
  atomicJson(path.join(temp, 'models_cache.json'), { identity: 'PRIVATE_ACCOUNT', models: [
    { slug: 'test-model', display_name: 'Test model', visibility: 'list', instructions: 'PRIVATE_INSTRUCTIONS' },
    { slug: 'hidden-model', visibility: 'hide' }, { slug: '--invalid', visibility: 'list' }
  ] });
  assert.deepEqual(consoleModels('codex', temp), [{ id: 'test-model', name: 'Test model' }]);
  assert.deepEqual(consoleModels('codex', path.join(temp, 'not-found')), []);
  assert.deepEqual(consoleModels('shell', temp), []);
});

test('subscription windows keep their actual duration and missing values remain missing', () => {
  const limits = codexLimits({ rateLimits: { planType: 'plus', primary: { usedPercent: 7, windowDurationMins: 10080, resetsAt: 1800000000 }, secondary: null } }, 123);
  assert.equal(limits[0].windows.length, 1);
  assert.deepEqual(limits[0].windows[0], { usedPercent: 7, minutes: 10080, resetsAt: 1800000000000 });
  assert.equal(limits[0].observedAt, 123);
  assert.equal(claudeLimits({}), null);
  assert.deepEqual(claudeLimits({ rate_limits: { five_hour: { used_percentage: 0, resets_at: null }, seven_day: null } }).windows, [{ usedPercent: 0, minutes: 300, resetsAt: null }]);
});

test('multiple Codex quota pools stay separate rather than being summed', () => {
  const limits = codexLimits({ rateLimits: { primary: { usedPercent: 99 } }, rateLimitsByLimitId: { codex: { primary: { usedPercent: 15, windowDurationMins: 300 } }, review: { primary: { usedPercent: 20, windowDurationMins: 10080 } } } });
  assert.equal(limits.length, 2);
  assert.deepEqual(limits.map(x => x.windows[0].usedPercent), [15, 20]);
});

test('OpenAI cached input and reasoning tokens are counted once', () => {
  const usage = normalizeUsage('openai', { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 800 }, output_tokens_details: { reasoning_tokens: 150 }, total_tokens: 1200 });
  assert.deepEqual(usage, { input: 1000, output: 200, uncached: 200, cached: 800, cacheWrite: 0, total: 1200 });
  assert.ok(Math.abs(estimateCost(usage, { input: 2, output: 10, cached: 0.5 }) - .0028) < 1e-10);
  assert.equal(estimateCost(usage, { input: 2, output: 10 }), null);
  assert.equal(normalizeUsage('openai', {}), null);
});

test('Anthropic cache tokens are included in input totals and separately priced', () => {
  const usage = normalizeUsage('anthropic', { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 100, cache_creation_input_tokens: 50 });
  assert.equal(usage.input, 160); assert.equal(usage.total, 180);
  assert.equal(estimateCost(usage, { input: 2, output: 10, cached: 0.2 }), null);
  assert.ok(Math.abs(estimateCost(usage, { input: 2, output: 10, cached: 0.2, cacheWrite: 2.5 }) - .000365) < 1e-10);
});

test('ledger distinguishes unpriced requests, unknown usage, zero cost and older records', () => {
  const summary = ledgerSummary([{ at: 200, usage: { total: 12 }, estimatedCost: 0 }, { at: 200, usage: { total: 30 }, estimatedCost: null }, { at: 200, usage: null, estimatedCost: null }, { at: 1, usage: { total: 100 }, estimatedCost: 100 }], 100);
  assert.deepEqual(summary, { requests: 3, tokens: 42, cost: 0, unpriced: 2, unknownUsage: 1 });
});

test('API requests use fixed provider endpoints and ledger entries omit content and credentials', async () => {
  let called = 0;
  const result = await callApi({ provider: 'openai', model: 'model-test', prompt: 'PRIVATE_PROMPT', maxOutput: 100 }, 'PRIVATE_KEY', { input: 2, output: 10 }, async (url, options) => {
    called++;
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer PRIVATE_KEY');
    assert.equal(JSON.parse(options.body).store, false);
    return { ok: true, json: async () => ({ status: 'completed', output: [{ content: [{ type: 'output_text', text: 'PRIVATE_RESPONSE' }] }], usage: { input_tokens: 20, output_tokens: 10 } }) };
  });
  assert.equal(called, 1); assert.equal(result.text, 'PRIVATE_RESPONSE'); assert.equal(result.entry.usage.total, 30);
  assert.ok(!JSON.stringify(result.entry).includes('PRIVATE_'));
  await assert.rejects(() => callApi({ provider: 'https://evil.invalid', model: 'x', prompt: 'x' }, 'k', null, () => { throw new Error('Should not fetch'); }), /Choose OpenAI/);
});

test('API failures never retry or echo provider error bodies', async () => {
  let count = 0;
  const result = await callApi({ provider: 'anthropic', model: 'test', prompt: 'x' }, 'secret', null, async () => { count++; return { ok: false, status: 401, json: async () => ({ error: 'SECRET_ERROR_BODY' }) }; });
  assert.equal(count, 1); assert.equal(result.entry.status, 'failed'); assert.equal(result.entry.usage, null);
  assert.ok(!JSON.stringify(result).includes('SECRET_ERROR_BODY'));
  const unknown = await callApi({ provider: 'openai', model: 'test', prompt: 'x' }, 'secret', null, async () => { count++; throw new Error('SECRET_NETWORK_DETAIL'); });
  assert.equal(count, 2); assert.equal(unknown.entry.status, 'unknown'); assert.ok(!JSON.stringify(unknown).includes('SECRET_NETWORK_DETAIL'));
});

test('truncated Anthropic output is marked incomplete while its usage is kept', async () => {
  const result = await callApi({ provider: 'anthropic', model: 'test', prompt: 'x' }, 'secret', null, async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages'); assert.equal(options.headers['anthropic-version'], '2023-06-01');
    return { ok: true, json: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Partial' }], usage: { input_tokens: 10, output_tokens: 20 } }) };
  });
  assert.equal(result.entry.status, 'incomplete'); assert.equal(result.entry.usage.total, 30);
});

test('vault refuses unavailable or plaintext backends and does not corrupt an existing file', () => {
  const file = path.join(temp, 'vault.json');
  atomicJson(file, { existing: { encrypted: 'preserved' } });
  const original = fs.readFileSync(file, 'utf8');
  for (const backend of [{ isEncryptionAvailable: () => false }, { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'basic_text' }]) {
    const vault = new Vault(file, backend);
    assert.throws(() => vault.set('openai', 'FAKE_TEST_KEY_12345'), /unavailable/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  }
  const bad = path.join(temp, 'corrupt.json'); fs.writeFileSync(bad, 'broken');
  assert.throws(() => readJson(bad, []), /preserved/); assert.equal(fs.readFileSync(bad, 'utf8'), 'broken');
});

test('Codex log reader extracts counters without retaining conversation text', () => {
  const file = path.join(temp, 'session.jsonl');
  const lines = [
    { type: 'session_meta', payload: { id: 'session-id', cwd: temp } },
    { type: 'response_item', payload: { content: 'PRIVATE_TRANSCRIPT' } },
    { type: 'event_msg', timestamp: new Date().toISOString(), payload: { type: 'task_started' } },
    { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 50, cached_input_tokens: 30, output_tokens: 20, total_tokens: 70 } } } },
    { type: 'event_msg', timestamp: new Date().toISOString(), payload: { type: 'task_complete', last_agent_message: 'PRIVATE_RESPONSE' } }
  ];
  fs.writeFileSync(file, lines.map(x => JSON.stringify(x)).join('\n') + '\n{"incomplete":');
  const value = summarizeLog(file, fs.statSync(file));
  assert.equal(value.usage.total, 70); assert.equal(value.state, 'ready');
  assert.ok(!JSON.stringify(value).includes('PRIVATE_'));
});

test('CLI callbacks write only state and usage metadata, including real zero percent limits', () => {
  const session = crypto.randomUUID(), launchId = crypto.randomUUID(), helper = path.join(__dirname, '..', 'electron', 'agent-event.cjs');
  const env = { ...process.env, PADDOCK_DATA_DIR: temp, PADDOCK_SESSION_ID: session, PADDOCK_LAUNCH_ID: launchId };
  delete env.PADDOCK_BRIDGE_URL; delete env.PADDOCK_BRIDGE_TOKEN;
  const payload = { type: 'agent-turn-complete', 'thread-id': 'thread', 'input-messages': ['PRIVATE_PROMPT'], 'last-assistant-message': 'PRIVATE_RESPONSE' };
  assert.equal(spawnSync(process.execPath, [helper, 'codex-notify', JSON.stringify(payload)], { env, windowsHide: true }).status, 0);
  const event = readJson(path.join(temp, 'events', `${session}.${launchId}.state.json`));
  assert.equal(event.state, 'ready'); assert.equal(event.providerSessionId, 'thread'); assert.ok(!JSON.stringify(event).includes('PRIVATE_'));
  const input = { session_id: 'claude-id', rate_limits: { five_hour: { used_percentage: 0, resets_at: 1800000000 } }, context_window: { used_percentage: 20, total_input_tokens: 60, total_output_tokens: 10 }, model: { display_name: 'Test' }, transcript_path: 'PRIVATE_TRANSCRIPT_PATH' };
  assert.equal(spawnSync(process.execPath, [helper, 'statusline'], { env, input: JSON.stringify(input), windowsHide: true }).status, 0);
  const usage = readJson(path.join(temp, 'events', `${session}.${launchId}.usage.json`));
  assert.equal(usage.usage.total, 70); assert.equal(usage.limits.windows[0].usedPercent, 0); assert.ok(!JSON.stringify(usage).includes('PRIVATE_'));
});
