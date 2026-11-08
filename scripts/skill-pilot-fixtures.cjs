'use strict';
// Synthetic pilot fixtures. Static checks only: no network, no process or model calls,
// and no execution of generated code. Scope: a small pilot, not a repository benchmark.
const fs = require('node:fs');
const path = require('node:path');

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const lower = (s) => norm(s).toLowerCase();
function readText(folder, rel) {
  try { return fs.readFileSync(path.join(folder, rel), 'utf8'); } catch { return null; }
}
function readJson(folder, rel) {
  const text = readText(folder, rel);
  if (text == null) return { error: `${rel} missing` };
  try { return { value: JSON.parse(text) }; } catch { return { error: `${rel} is not valid JSON` }; }
}
const segments = (text) => String(text).split(/(?<=[.!?])\s+|\n+/).map(lower).filter(Boolean);
const NEGATION = /\b(no|not|none|without|never|absent|n't|cannot|neither)\b|n't/;
function finish(checks) {
  return { passed: checks.every((c) => c.passed), checks };
}
const check = (id, passed, note) => (note ? { id, passed: Boolean(passed), note } : { id, passed: Boolean(passed) });

// Task 1: application map document
const queueJs = `'use strict';
const pending = [];
const tombstones = new Set();
const published = [];

function enqueue(job, now) {
  if (job.token.expiresAt <= now) return { sent: false, reason: 'expired' };
  if (tombstones.has(job.id)) return { sent: false, reason: 'cancelled' };
  pending.push(job);
  return { sent: true };
}

function cancelJob(id) {
  tombstones.add(id);
  const i = pending.findIndex((j) => j.id === id);
  if (i >= 0) pending.splice(i, 1);
  return { cancelled: true };
}

function publishNext() {
  const job = pending.shift();
  if (!job || tombstones.has(job.id)) return null;
  published.push(job.id);
  return job;
}

module.exports = { enqueue, cancelJob, publishNext };
`;
const clientJs = `'use strict';
let controller = null;

async function submitJob(job) {
  controller = new AbortController();
  const res = await fetch('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(job),
    signal: controller.signal,
  });
  return res.json();
}

function cancelRequest(id) {
  if (controller) controller.abort();
  return fetch('/api/jobs/' + id + '/cancel', { method: 'POST' });
}

module.exports = { submitJob, cancelRequest };
`;
const buildConfig = '{\n  "entry": "web/client.js",\n  "outDir": "dist",\n  "target": "es2020"\n}\n';
const T1_PATHS = ['server/queue.js', 'web/client.js', 'build.config.json'];

function verifyMap(folder) {
  const raw = readText(folder, 'docs/application-map.md');
  if (raw == null || !raw.trim()) {
    return finish(['structure', 'sources', 'expired', 'tombstone', 'abort', 'noInvented']
      .map((id) => check(id, false, 'docs/application-map.md missing or empty')));
  }
  const segs = segments(raw);
  const structure = /^#{1,3}\s*1[.)]?\s*backend/im.test(raw) && /^#{1,3}\s*2[.)]?\s*frontend/im.test(raw)
    && /^#{1,4}\s*[^\n]*(uncertain|unknown|open question)[^\n]*\n+\s*\S/im.test(raw);
  const mentioned = raw.match(/\b(?:server|web)\/[\w.-]+/g) || [];
  const names = ['enqueue', 'cancelJob', 'publishNext', 'submitJob', 'cancelRequest'].filter((n) => raw.includes(n));
  const sources = mentioned.includes('server/queue.js') && mentioned.includes('web/client.js')
    && mentioned.every((p) => T1_PATHS.includes(p)) && names.length >= 4;
  const expired = segs.some((s) => s.includes('expired') && /(not|never|n't|no longer|refus|reject|without) ?(be )?(sent|send|enqueue|publish|queue)|rejected|refused/.test(s));
  const tombstone = segs.some((s) => s.includes('tombstone') && s.includes('before') && /publi/.test(s));
  const abort = segs.some((s) => s.includes('abort') && NEGATION.test(s) && /roll ?back|undo|revert/.test(s));
  const invented = segs.some((s) => /\b(database|sql\w*|postgres\w*|mongo\w*|redis|jwt|oauth\w*|login|password|authenticat\w*|authoriz\w*)\b/.test(s) && !NEGATION.test(s));
  return finish([
    check('structure', structure, 'needs "1. Backend", "2. Frontend" and a non-empty uncertainties section'),
    check('sources', sources, 'link server/queue.js and web/client.js plus functions; no unknown paths'),
    check('expired', expired, 'expired token must not be sent'),
    check('tombstone', tombstone, 'cancellation tombstone is recorded before publication'),
    check('abort', abort, 'local abort does not roll back the server'),
    check('noInvented', !invented, 'no database or auth claims'),
  ]);
}

// Task 2: reuse sumValid (static verification only, not runtime correctness)
const sumJs = `'use strict';
function sumValid(values) {
  if (!Array.isArray(values)) return 0;
  let total = 0;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  return total;
}

module.exports = { sumValid };
`;
const totalJs = `'use strict';
function orderTotal(order) {
  if (!order || !Array.isArray(order.items)) return 0;
  let total = 0;
  for (const p of order.items) {
    if (typeof p === 'number' && Number.isFinite(p)) total += p;
  }
  if (Array.isArray(order.fees)) {
    for (const f of order.fees) {
      if (typeof f === 'number' && Number.isFinite(f)) total += f;
    }
  }
  return total;
}

module.exports = { orderTotal };
`;
const GUARD = 'if (!order || !Array.isArray(order.items)) return 0;';

function verifyPatch(folder) {
  const ids = ['json', 'scope', 'import', 'noDuplication', 'guard', 'export'];
  const r = readJson(folder, 'patch.json');
  const files = r.value && r.value.files;
  if (r.error || !files || typeof files !== 'object' || Array.isArray(files)) {
    return finish(ids.map((id) => check(id, false, r.error || 'patch.json needs a files object')));
  }
  const keys = Object.keys(files);
  const code = typeof files['src/total.js'] === 'string' ? files['src/total.js'] : '';
  const flat = norm(code);
  const requires = code.match(/require\(\s*['"][^'"]+['"]\s*\)|from\s+['"][^'"]+['"]/g) || [];
  const importOk = /(require\(\s*['"]\.\/sum(\.js)?['"]\s*\)|from\s+['"]\.\/sum(\.js)?['"])/.test(code)
    && /\bsumValid\b/.test(code) && (code.match(/sumValid\(/g) || []).length >= 1;
  return finish([
    check('json', Boolean(code.trim()), 'static check: files["src/total.js"] must be a full replacement'),
    check('scope', keys.length === 1 && keys[0] === 'src/total.js' && requires.length === 1, 'only src/total.js, no new dependency'),
    check('import', importOk, 'imports and calls the existing sumValid'),
    check('noDuplication', code.trim() && !/\b(for|while)\s*\(|\.reduce\(|Number\.isFinite/.test(code), 'no repeated validation loops'),
    check('guard', flat.includes(GUARD), 'malformed-order guard preserved'),
    check('export', /module\.exports\s*=\s*\{\s*orderTotal\s*\}/.test(code), 'orderTotal still exported'),
  ]);
}

// Task 3: idempotent publisher plan
const publisherJs = `'use strict';
const { hasPublished, markPublished } = require('./ledger');

async function publishEvent(event, transport) {
  if (hasPublished(event.id)) return { status: 'duplicate' };
  await transport.send(event);
  markPublished(event.id);
  return { status: 'sent' };
}

module.exports = { publishEvent };
`;
const ledgerJs = `'use strict';
const done = new Set();

function hasPublished(id) { return done.has(id); }
function markPublished(id) { done.add(id); }

module.exports = { hasPublished, markPublished };
`;
const publisherTest = `'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publishEvent } = require('../src/publisher');

test('second publish of the same id is a duplicate', async () => {
  const sent = [];
  const transport = { send: async (e) => sent.push(e.id) };
  await publishEvent({ id: 'a' }, transport);
  assert.equal((await publishEvent({ id: 'a' }, transport)).status, 'duplicate');
  assert.deepEqual(sent, ['a']);
});
`;
const T3_FILES = ['src/publisher.js', 'src/ledger.js', 'test/publisher.test.js'];

function verifyPlan(folder) {
  const ids = ['shape', 'files', 'symbols', 'recovery', 'noInvented', 'scope'];
  const r = readJson(folder, 'plan.json');
  const p = r.value;
  const arr = (k) => Array.isArray(p && p[k]) && p[k].every((x) => typeof x === 'string' && x.trim());
  const shape = p && typeof p === 'object' && ['affectedFiles', 'tests', 'ordering', 'unknowns'].every((k) => arr(k) && p[k].length)
    && typeof p.failureRecovery === 'string';
  if (r.error || !shape) return finish(ids.map((id) => check(id, false, r.error || 'plan.json needs affectedFiles, tests, ordering, unknowns, failureRecovery')));
  const norms = (list) => list.map((f) => f.replace(/\\/g, '/').replace(/^\.\//, ''));
  const affected = norms(p.affectedFiles);
  const orderText = p.ordering.join(' ');
  const strings = [...p.affectedFiles, ...p.tests, ...p.ordering, ...p.unknowns, p.failureRecovery];
  return finish([
    check('shape', true),
    check('files', affected.includes('src/publisher.js') && affected.every((f) => T3_FILES.includes(f)) && norms(p.tests).some((t) => t.includes('test/publisher.test.js')), 'name existing files and the existing test'),
    check('symbols', p.ordering.length >= 2 && /\bpublishEvent\b/.test(orderText) && /\bmarkPublished\b/.test(orderText), 'ordered steps name publishEvent and markPublished'),
    check('recovery', p.failureRecovery.trim().split(/\s+/).length >= 8 && /(retry|retries|duplicate|crash|fail|re-?send)/i.test(p.failureRecovery), 'explicit failure recovery'),
    check('noInvented', !strings.some((s) => /\b(database|sql\w*|postgres\w*|mongo\w*|redis|kafka|table|migration)\b/i.test(s) && !NEGATION.test(s.toLowerCase())), 'no database or infrastructure invented'),
    check('scope', affected.length <= 3 && p.tests.length <= 4 && p.ordering.length <= 8 && p.unknowns.length <= 6, 'bounded scope'),
  ]);
}

// Task 4: structural review
const pricingJs = `'use strict';
let lastCart = null;
let lastTotal = 0;

function totalFor(cart) {
  if (cart === lastCart) return lastTotal;
  const net = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
  lastTotal = net * 1.2;
  lastCart = cart;
  return lastTotal;
}

module.exports = { totalFor };
`;
const cartJs = `'use strict';
const { totalFor } = require('./pricing');

function addItem(cart, item) {
  cart.items.push(item);
  return cart;
}

function receipt(cart) {
  const net = cart.items.reduce((s, i) => s + i.price * i.qty, 0);
  return { net, gross: net * 1.2, total: totalFor(cart) };
}

module.exports = { addItem, receipt };
`;
const apiJs = `'use strict';
function parseOrder(body) {
  if (!body || !Array.isArray(body.items)) throw new Error('invalid order');
  return { items: body.items.map(item => {
    if (!item || typeof item !== 'object' || !Number.isFinite(item.price) || item.price < 0 || !Number.isInteger(item.qty) || item.qty < 1) throw new Error('invalid item');
    return { price: item.price, qty: item.qty };
  }) };
}

module.exports = { parseOrder };
`;
const T4_SOURCES = { 'src/pricing.js': pricingJs, 'src/cart.js': cartJs, 'src/api.js': apiJs };

function verifyReview(folder) {
  const ids = ['shape', 'identityCache', 'duplicatedRate', 'boundaryKept', 'noFixes', 'evidenceReal'];
  const r = readJson(folder, 'review.json');
  const list = r.value && r.value.findings;
  const ok = Array.isArray(list) && list.length >= 2 && list.length <= 4
    && list.every((f) => f && ['file', 'evidence', 'why'].every((k) => typeof f[k] === 'string' && f[k].trim()));
  if (r.error || !ok) return finish(ids.map((id) => check(id, false, r.error || 'review.json needs 2-4 findings with file, evidence, why')));
  const fileOf = (f) => f.file.replace(/\\/g, '/').replace(/^\.\//, '');
  const real = (f) => {
    const src = T4_SOURCES[fileOf(f)];
    return Boolean(src) && f.evidence.trim().length >= 4 && lower(src).includes(lower(f.evidence));
  };
  const prose = (f) => f.why.trim().split(/\s+/).length >= 6;
  const f1 = list.some((f) => fileOf(f) === 'src/pricing.js' && real(f) && lower(f.evidence).includes('lastcart') && prose(f) && /stale|mutat|identity|cache|shared|module-level|global/i.test(f.why));
  const f2 = list.some((f) => fileOf(f) === 'src/cart.js' && real(f) && f.evidence.includes('1.2') && prose(f) && /duplicat|diverg|twice|two places|single source|second copy|drift/i.test(f.why));
  const fixKeys = ['fix', 'patch', 'diff', 'replacement', 'suggestion', 'code'];
  return finish([
    check('shape', true),
    check('identityCache', f1, 'pricing.js: module-level identity cache goes stale'),
    check('duplicatedRate', f2, 'cart.js: tax rate duplicated outside pricing'),
    check('boundaryKept', !list.some((f) => fileOf(f) === 'src/api.js'), 'api.js validation boundary is correct and must not be flagged'),
    check('noFixes', !list.some((f) => fixKeys.some((k) => k in f) || /```/.test(f.why)), 'findings only, no implementation fixes'),
    check('evidenceReal', list.every(real), 'evidence must quote the named source file'),
  ]);
}

const PRINT = 'Write the result to';
const tasks = [
  {
    id: 'application-map',
    skill: 'project-documentation',
    prompt: `${PRINT} docs/application-map.md. Document this small repository for a new maintainer. Use a section "1. Backend" and a section "2. Frontend", each listing files with the exact code responsibility (link the file path and function names), the obligations the code enforces, and a final "Uncertainties" section. State only what the code shows; do not add anything the code does not contain.`,
    files: { 'server/queue.js': queueJs, 'web/client.js': clientJs, 'build.config.json': buildConfig },
    verify: verifyMap,
  },
  {
    id: 'reuse-helper',
    skill: 'ponytail',
    prompt: `${PRINT} patch.json as JSON of the form {"files":{"src/total.js":"<full replacement file contents>"}}. Make the smallest patch to src/total.js that reuses the existing sumValid helper instead of the duplicated branching. Behavior for malformed input must stay the same; keep its existing guard line unchanged. Add no dependency and touch no other file.`,
    files: { 'src/sum.js': sumJs, 'src/total.js': totalJs },
    verify: verifyPatch,
  },
  {
    id: 'publisher-plan',
    skill: 'pstack',
    prompt: `${PRINT} plan.json with the keys affectedFiles, tests, ordering, unknowns (arrays of strings) and failureRecovery (string). Plan a bounded change that makes publishEvent safe to retry when delivery succeeds but recording it fails. Name the existing files and functions involved, order the steps, list what you cannot determine from the code, and describe how a failed step recovers. Do not implement the change.`,
    files: { 'src/publisher.js': publisherJs, 'src/ledger.js': ledgerJs, 'test/publisher.test.js': publisherTest },
    verify: verifyPlan,
  },
  {
    id: 'structure-review',
    skill: 'thermo-nuclear-code-quality-review',
    prompt: `${PRINT} review.json as {"findings":[{"file":"","evidence":"","why":""}]}. Review the source under src/ for structural faults. For each finding give the file path, a verbatim quote from that file as evidence, and why it is a structural problem. Report only genuine faults and do not flag code whose boundary is sound. Do not propose or write fixes.`,
    files: { ...T4_SOURCES },
    verify: verifyReview,
  },
];

module.exports = { tasks };
