'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { verify } = require('../scripts/strata-local-smoke.cjs');
test('Strata smoke check requires a real tool round trip and sends only local requests', async () => {
  const seen = [];
  const fetcher = async (url, options = {}) => {
    assert.equal(new URL(url).origin, 'http://127.0.0.1:8080');
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/v1/models')) return { ok: true, json: async () => ({ data: [{ id: 'fixture-model' }] }) };
    const body = JSON.parse(options.body); seen.push(body);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(body.reasoning_effort, 'none');
    const message = !body.tools ? { content: 'STRATA_TEXT_OK' } : body.messages.some(item => item.role === 'tool')
      ? { content: 'STRATA_TOOL_OK' }
      : { content: null, tool_calls: [{ id: 'probe', type: 'function', function: { name: 'dock_context', arguments: '{}' } }] };
    return { ok: true, json: async () => ({ choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }] }) };
  };
  const result = await verify(fetcher);
  assert.equal(result.status, 'passed'); assert.equal(result.requests, 3);
  assert.ok(seen[2].messages.some(item => item.role === 'tool' && item.content.includes('STRATA_TOOL_OK')));
});
test('Strata smoke check rejects an unavailable or empty model server', async () => {
  await assert.rejects(verify(async () => ({ ok: false })), /discovery failed/);
  await assert.rejects(verify(async () => ({ ok: true, json: async () => ({ data: [] }) })), /no loaded model/);
});
