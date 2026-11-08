'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { tasks } = require('../scripts/skill-pilot-fixtures.cjs');

const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));

function materialize(task, outputs = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-'));
  for (const [rel, text] of Object.entries({ ...task.files, ...outputs })) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return dir;
}
function hashTree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else out[path.relative(dir, f)] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    }
  };
  walk(dir);
  return out;
}
function run(task, outputs) {
  const dir = materialize(task, outputs);
  try {
    const before = hashTree(dir);
    const result = task.verify(dir);
    assert.deepEqual(hashTree(dir), before, 'verify must not modify files');
    return result;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const MAP = `# Application map

## 1. Backend
- [server/queue.js](server/queue.js) \`enqueue\` rejects a job whose token has expired, so an expired token is never sent.
- \`cancelJob\` records a cancellation tombstone before publication can happen; \`publishNext\` skips tombstoned ids.
- Nothing here stores data outside process memory and no database is used.

## 2. Frontend
- [web/client.js](web/client.js) \`submitJob\` posts with an AbortController signal; \`cancelRequest\` aborts locally, which does not roll back the server job, and then calls the cancel endpoint.
- build.config.json names the entry file only.

## Uncertainties
- The server route that connects /api/jobs to \`enqueue\` is not in this repository.
`;
const PATCH = JSON.stringify({ files: { 'src/total.js': `'use strict';
const { sumValid } = require('./sum');

function orderTotal(order) {
  if (!order || !Array.isArray(order.items)) return 0;
  return sumValid(order.items) + sumValid(order.fees);
}

module.exports = { orderTotal };
` } });
const PLAN = JSON.stringify({
  affectedFiles: ['src/publisher.js', 'src/ledger.js'],
  tests: ['test/publisher.test.js: add a case where markPublished throws after send'],
  ordering: ['Record intent in src/ledger.js before calling transport.send in publishEvent', 'Call markPublished after send succeeds and treat a repeat id as duplicate'],
  unknowns: ['Whether the transport deduplicates by event id', 'Whether the ledger must survive a process restart'],
  failureRecovery: 'If markPublished fails after send, the next retry sees the recorded intent and re-sends once with the same id so the receiver can discard a duplicate.',
});
const REVIEW = JSON.stringify({ findings: [
  { file: 'src/pricing.js', evidence: 'if (cart === lastCart) return lastTotal;', why: 'The module-level identity cache returns a stale total after the same cart object is mutated.' },
  { file: 'src/cart.js', evidence: 'gross: net * 1.2', why: 'The tax rate is duplicated here and in pricing, so the two places can drift apart.' },
] });

test('four tasks with bounded sources and neutral prompts', () => {
  assert.equal(tasks.length, 4);
  assert.deepEqual(tasks.map((t) => t.skill), ['project-documentation', 'ponytail', 'pstack', 'thermo-nuclear-code-quality-review']);
  for (const t of tasks) {
    const files = Object.values(t.files);
    assert.ok(files.length <= 3, t.id);
    assert.ok(files.join('').split('\n').length < 150, t.id);
    assert.equal(typeof t.verify, 'function');
    assert.ok(!/ponytail|pstack|baseline|treatment|thermo|project-documentation|skill/i.test(t.prompt), t.id);
  }
});

test('known valid outputs pass with at most six checks', () => {
  const valid = {
    'application-map': { 'docs/application-map.md': MAP },
    'reuse-helper': { 'patch.json': PATCH },
    'publisher-plan': { 'plan.json': PLAN },
    'structure-review': { 'review.json': REVIEW },
  };
  for (const [id, out] of Object.entries(valid)) {
    const r = run(byId[id], out);
    assert.ok(r.checks.length <= 6 && r.checks.length >= 4, id);
    assert.deepEqual(r.checks.filter((c) => !c.passed), [], id);
    assert.equal(r.passed, true, id);
  }
});

test('missing or empty output fails every task', () => {
  for (const t of tasks) {
    assert.equal(run(t, {}).passed, false, t.id);
  }
  assert.equal(run(byId['application-map'], { 'docs/application-map.md': '  ' }).passed, false);
  assert.equal(run(byId['reuse-helper'], { 'patch.json': '{}' }).passed, false);
  assert.equal(run(byId['publisher-plan'], { 'plan.json': '{}' }).passed, false);
  assert.equal(run(byId['structure-review'], { 'review.json': '{"findings":[]}' }).passed, false);
});

test('fabricated or keyword-only outputs fail', () => {
  const map = run(byId['application-map'], { 'docs/application-map.md': '# Map\n## 1. Backend\nPostgres database with JWT auth in db/schema.sql.\n## 2. Frontend\nexpired tombstone abort.\n## Uncertainties\nnone\n' });
  assert.equal(map.passed, false);
  assert.equal(map.checks.find((c) => c.id === 'noInvented').passed, false);

  const dup = JSON.stringify({ files: { 'src/total.js': "const { sumValid } = require('./sum');\nfunction orderTotal(order){ let t=0; for (const p of order.items) t+=p; return t + sumValid([]); }\nmodule.exports = { orderTotal };" } });
  assert.equal(run(byId['reuse-helper'], { 'patch.json': dup }).passed, false);
  const extra = JSON.stringify({ files: { 'src/total.js': JSON.parse(PATCH).files['src/total.js'], 'package.json': '{}' } });
  assert.equal(run(byId['reuse-helper'], { 'patch.json': extra }).checks.find((c) => c.id === 'scope').passed, false);

  const db = JSON.parse(PLAN);
  db.affectedFiles.push('db/migrations/001.sql');
  db.ordering.push('Create a postgres table for events');
  const plan = run(byId['publisher-plan'], { 'plan.json': JSON.stringify(db) });
  assert.equal(plan.passed, false);

  const stuffed = JSON.stringify({ findings: [
    { file: 'src/pricing.js', evidence: 'a global shared stale cache with mutation', why: 'stale global cache' },
    { file: 'src/cart.js', evidence: 'duplicated 1.2 rate', why: 'duplicated' },
    { file: 'src/api.js', evidence: 'throw new Error(\'invalid order\')', why: 'This validation boundary is flagged although it is sound code.' },
  ] });
  const review = run(byId['structure-review'], { 'review.json': stuffed });
  assert.equal(review.passed, false);
  assert.equal(review.checks.find((c) => c.id === 'identityCache').passed, false);
  assert.equal(review.checks.find((c) => c.id === 'duplicatedRate').passed, false);
  assert.equal(review.checks.find((c) => c.id === 'boundaryKept').passed, false);

  const withFix = JSON.parse(REVIEW);
  withFix.findings[0].fix = 'delete the cache';
  assert.equal(run(byId['structure-review'], { 'review.json': JSON.stringify(withFix) }).checks.find((c) => c.id === 'noFixes').passed, false);
});
