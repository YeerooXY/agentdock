const { test } = require('node:test');
const assert = require('node:assert/strict');

test('API charts filter the chosen period and keep missing usage and durations explicit', async () => {
  const { usageAnalytics } = await import('../src/usage-analytics.js');
  const now = 1800000000000, day = 86400000;
  const entries = [
    { at: now, provider: 'a', usage: { total: 0 }, durationMs: 0, status: 'completed' },
    { at: now - 7 * day, provider: 'a', usage: { total: 30 }, durationMs: 2000, status: 'completed' },
    { at: now - 1, provider: 'b', usage: null, status: 'failed' },
    { at: now - 7 * day - 1, provider: 'a', usage: { total: 999 }, durationMs: 999 },
    { at: now + 1, provider: 'a', usage: { total: 999 } },
  ];
  const result = usageAnalytics(entries, 7, now);
  assert.equal(result.requests, 3); assert.equal(result.tokens, 30); assert.equal(result.unknownUsage, 1);
  assert.equal(result.averageMs, 1000); assert.equal(result.measured, 2); assert.equal(result.failed, 1);
  assert.equal(result.points[0].requests, 1); assert.equal(result.points[6].requests, 2);
  assert.deepEqual(result.providers, [{ provider: 'a', requests: 2, tokens: 30 }, { provider: 'b', requests: 1, tokens: 0 }]);
  assert.equal(usageAnalytics([], 90, now).averageMs, null);
  assert.equal(usageAnalytics([], 90, now).points.length, 90);
});

test('local inference never inflates cloud token totals and unknown readings stay separate', async () => {
  const { usageAnalytics } = await import('../src/usage-analytics.js'); const now=1800000000000;
  const r=usageAnalytics([{at:now,provider:'strata',usage:{total:800}}, {at:now,local:true,usage:null}, {at:now,provider:'cloud',usage:{total:50}}, {at:now,provider:'cloud',usage:null}],7,now);
  assert.deepEqual(r.cloud,{tokens:50,unknownUsage:1}); assert.deepEqual(r.local,{tokens:800,unknownUsage:1}); assert.equal(r.tokens,850);
});
