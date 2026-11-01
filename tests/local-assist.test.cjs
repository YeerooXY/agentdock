'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { LocalAssist } = require('../electron/local-assist.cjs');
const profile = { id: 'strata', protocol: 'chat', url: 'http://127.0.0.1:8080/v1/chat/completions', keyId: '' };
const args = { requestId: 'one', purpose: 'extract', prompt: 'Extract these hours: hétfő 08:00–16:00.' };
function fixture({ answer, fetcher, ...options } = {}) {
  const calls = [], entries = [];
  const assistant = new LocalAssist({ getProfiles: () => [profile], onEntry: entry => entries.push(entry),
    fetcher: async (url, init) => {
      calls.push({ url, init });
      if (fetcher) return fetcher(url, init);
      return { ok: true, json: async () => url.endsWith('/models') ? { data: [{ id: 'loaded-local-model' }] } : answer || {
        choices: [{ finish_reason: 'stop', message: { content: 'hétfő 08:00–16:00' } }], usage: { prompt_tokens: 30, completion_tokens: 12 }
      } };
    }, ...options });
  return { assistant, calls, entries };
}
test('bounded local request preserves Unicode, discovers the model and records only metadata', async () => {
  const f = fixture(), result = await f.assistant.run(args, { projectId: 'project', turnId: 'turn', consoleName: 'Test' });
  assert.equal(result.status, 'completed'); assert.equal(result.model, 'loaded-local-model');
  assert.equal(result.text, 'hétfő 08:00–16:00'); assert.equal(result.usage.output, 12);
  assert.equal(f.calls.length, 2);
  const body = JSON.parse(f.calls[1].init.body);
  assert.equal(body.max_tokens, 2048); assert.equal(body.reasoning_effort, 'none');
  assert.equal(body.tools, undefined); assert.equal(f.calls[1].init.headers.Authorization, undefined);
  assert.equal(body.messages[1].content, args.prompt); assert.equal(f.calls[1].init.redirect, 'error');
  assert.equal(f.entries[0].projectId, 'project'); assert.equal(f.entries[0].turnId, 'turn');
  assert.equal(f.entries[0].local, true); assert.equal(f.entries[0].estimatedCost, null);
  assert.ok(!JSON.stringify(f.entries).includes('hétfő'));
});
test('same request reuses its answer; changing input under that ID fails; another turn is separate', async () => {
  const f = fixture();
  const first = await f.assistant.run(args, { turnId: 'a' });
  assert.deepEqual(await f.assistant.run(args, { turnId: 'a' }), first);
  await assert.rejects(f.assistant.run({ ...args, prompt: 'Different' }, { turnId: 'a' }), /different input/);
  assert.equal(f.calls.length, 2); assert.equal(f.entries.length, 1);
  await f.assistant.run(args, { turnId: 'b' }); assert.equal(f.calls.length, 4);
});
test('busy helper joins an identical request and rejects a different request without queuing it', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ fetcher: async url => { await gate; return { ok: true, json: async () => url.endsWith('/models') ? { data: [{ id: 'local' }] } : { choices: [{ finish_reason: 'stop', message: { content: 'Done' } }] } }; } });
  const first = f.assistant.run(args), same = f.assistant.run(args);
  await assert.rejects(f.assistant.run({ ...args, requestId: 'two' }), /busy/);
  release(); assert.deepEqual(await first, await same); assert.equal(f.calls.length, 2);
});
test('offline local server makes no inference request, has unknown usage and never falls back', async () => {
  const f = fixture({ fetcher: async () => { throw Error('private server details'); } });
  const result = await f.assistant.run(args);
  assert.equal(result.status, 'unavailable'); assert.equal(result.usage, null);
  assert.equal(f.calls.length, 1); assert.ok(!result.error.includes('private server details'));
  await f.assistant.run(args); assert.equal(f.calls.length, 1);
});
test('partial, empty and tool-only replies are not success; usage survives incomplete output', async () => {
  for (const choice of [
    { finish_reason: 'length', message: { content: 'Partial' } },
    { finish_reason: 'stop', message: { content: '' } },
    { finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name: 'shell' } }] } },
    { message: { content: 'Missing finish reason' } }
  ]) {
    const f = fixture({ answer: { choices: [choice], usage: { prompt_tokens: 12, completion_tokens: 20 } } });
    const result = await f.assistant.run(args);
    assert.equal(result.status, 'incomplete'); assert.equal(result.usage.output, 20); assert.equal(f.calls.length, 2);
  }
});
test('reject unsafe profiles and invalid bounds before network use', async () => {
  for (const change of [{ url: 'https://example.com/v1/chat/completions' }, { keyId: 'vault-key' }, { url: 'http://localhost.evil/v1/chat/completions' }]) {
    const f = fixture({ getProfiles: () => [{ ...profile, ...change }] });
    await assert.rejects(f.assistant.run(args)); assert.equal(f.calls.length, 0);
  }
  for (const change of [{ prompt: 'x'.repeat(24001) }, { maxOutput: 0 }, { maxOutput: 8193 }, { reasoning: 'unbounded' }, { purpose: '__proto__' }, { requestId: '' }, { tools: ['shell'] }]) {
    const f = fixture(); await assert.rejects(f.assistant.run({ ...args, ...change })); assert.equal(f.calls.length, 0);
  }
});
test('app test mode prevents even local requests', async () => {
  const f = fixture({ testMode: true }); await assert.rejects(f.assistant.run(args), /disabled/); assert.equal(f.calls.length, 0);
});
test('HTTP rejection and interrupted inference retain failure states without automatic retries', async () => {
  for (const interrupted of [false, true]) {
    const f = fixture({ fetcher: async url => {
      if (url.endsWith('/models')) return { ok: true, json: async () => ({ data: [{ id: 'local' }] }) };
      if (interrupted) throw Error('connection lost');
      return { ok: false, status: 503 };
    } });
    const result = await f.assistant.run(args);
    assert.equal(result.status, interrupted ? 'unknown' : 'failed');
    assert.equal(result.usage, null); assert.equal(f.calls.length, 2);
    await f.assistant.run(args); assert.equal(f.calls.length, 2);
  }
});
