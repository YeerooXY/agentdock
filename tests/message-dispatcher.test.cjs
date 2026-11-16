'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { MessageDispatcher, normalizeDispatcher, parseMessagePlan } = require('../electron/message-dispatcher.cjs');
const { defaults } = require('../electron/task-routing.cjs');
const { initialSettings } = require('../electron/settings.cjs');
const item = (id, extra = {}) => ({ id, title: id, criteria: 'Verify the requested behavior.', kind: 'build', size: 'small', owns: ['src/' + id + '.js'], dependsOn: [], images: [], ...extra });
const plan = (...subtasks) => ({ contracts: 'Preserve existing work.', subtasks });
function fixture(value, settings = {}) {
  const loop = new EventEmitter(), starts = [], requests = [];
  const route = { accountId: 'codex:default', model: 'small-code' };
  Object.assign(loop, {
    jobs: new Map(), pending: new Map(), now: () => 1000000, root: os.tmpdir(),
    repositories: () => [{ path: path.resolve('fixture'), label: 'Fixture' }],
    candidates: () => [{ id: route.accountId, provider: 'codex', label: 'Codex', installed: true, signedIn: true, funding: 'included', available: true }],
    getSettings: () => ({ routing: { ...defaults, discoverAccounts: false, small: [route], medium: [route], large: [route], defaultReviewer: null }, ...settings }),
    getLimits: () => [{ accountId: route.accountId, observedAt: 1000000, funding: 'included', windows: [{ key: 'account', usedPercent: 20 }] }],
    assignment: raw => { if (!raw?.accountId) throw Error('Missing account'); return { ...raw, provider: 'codex', label: 'Codex', funding: 'included' }; },
    changed: job => { loop.emit('changed', { id: job.id }); return true; }, view: job => structuredClone(job),
    start: async (args, { dispatch }) => { const job = { ...args, id: 'child-' + starts.length, state: 'implementing', dispatchId: dispatch.parent.id }; starts.push(args); loop.jobs.set(job.id, job); dispatch.parent.dispatchTasks.push({ itemId: dispatch.itemId, taskId: job.id }); return job; },
    stop: async id => { const job = loop.jobs.get(id); job.state = 'stopped'; return job; }
  });
  const service = new MessageDispatcher(loop, { request: async (job, step, prompt) => { requests.push({ job, step, prompt }); return { text: typeof value === 'string' ? value : JSON.stringify(value), usage: { inputTokens: 10, outputTokens: 20 } }; } });
  return { loop, service, starts, requests, args: { text: 'Please handle these requests.', repo: path.resolve('fixture'), executionMode: 'serial' } };
}
test('single-item plan defaults to Small routing, ignores model account assignments and waits for one approval', async () => {
  const f = fixture(plan(item('one', { implementer: { accountId: 'paid:attacker', model: 'expensive' } })));
  const job = await f.service.create(f.args);
  assert.equal(job.state, 'plan-ready'); assert.equal(f.starts.length, 0);
  assert.equal(f.requests[0].step.model, 'small-code');
  assert.equal(job.plan.subtasks[0].implementer.accountId, 'codex:default');
  await f.service.approve({ id: job.id });
  assert.equal(f.starts.length, 1); assert.equal(f.starts[0].workflow, 'current');
  await assert.rejects(f.service.approve({ id: job.id }), /ready/);
});

test('new parallel plans choose an integration route, remove answered dependencies and need one approval', async () => {
  const f = fixture(plan(item('answer', { kind: 'question', owns: [], answer: 'Already answered.' }), item('one', { dependsOn: ['answer'] }), item('two')));
  delete f.args.executionMode; f.loop.git = async () => '';
  let approvedPlan;
  const original = f.loop.start;
  f.loop.start = async (args, options) => { approvedPlan = options.approvedPlan; return original(args, options); };
  const parent = await f.service.create(f.args);
  assert.equal(parent.executionMode, 'parallel'); assert.equal(parent.parallelLimit, 6); assert.equal(parent.integration.size, 'medium');
  await f.service.approve({ id: parent.id, parallelLimit: 5 });
  assert.equal(f.starts.length, 1); assert.equal(f.starts[0].workflow, 'worktree');
  assert.deepEqual(approvedPlan.subtasks.map(sub => sub.id), ['one', 'two']);
  assert.deepEqual(approvedPlan.subtasks[0].dependsOn, []);
  assert.equal(f.loop.jobs.get(parent.id).dispatchTasks[0].itemId, 'lanes');
  await assert.rejects(f.service.approve({ id: parent.id }), /ready/);
});

test('dirty parallel preflight and invalid lane count preserve the saved unapproved plan', async () => {
  const f = fixture(plan(item('one'))); delete f.args.executionMode;
  const parent = await f.service.create(f.args); f.loop.git = async () => ' M existing.js\n?? owner.txt\n';
  await assert.rejects(f.service.approve({ id: parent.id }), /Commit or stash/);
  assert.equal(f.loop.jobs.get(parent.id).state, 'plan-ready'); assert.equal(f.loop.jobs.get(parent.id).approvedAt, undefined); assert.equal(f.starts.length, 0);
  f.loop.git = async () => '';
  await assert.rejects(f.service.approve({ id: parent.id, parallelLimit: 0 }), /1 to 10/); assert.equal(f.starts.length, 0);
  await f.service.approve({ id: parent.id }); assert.equal(f.starts.length, 1);
});

test('parallel parent follows an explicitly resumed child but never restarts a stopped parent', async () => {
  const f = fixture(plan(item('one'))); delete f.args.executionMode; f.loop.git = async () => '';
  const parent = await f.service.create(f.args); await f.service.approve({ id: parent.id });
  const saved = f.loop.jobs.get(parent.id), child = f.loop.jobs.get(saved.dispatchTasks[0].taskId);
  child.state = 'needs-you'; await f.service.advance(parent.id); assert.equal(saved.state, 'needs-you');
  child.state = 'building'; f.loop.changed(child); assert.equal(saved.state, 'building');
  child.state = 'passed'; await f.service.advance(parent.id); assert.equal(saved.state, 'passed'); assert.equal(f.starts.length, 1);
  saved.state = 'stopped'; child.state = 'building'; f.loop.changed(child); assert.equal(saved.state, 'stopped');
});
test('question answers remain in the plan and never launch tasks, including all-question messages', async () => {
  const f = fixture(plan(item('why', { kind: 'question', owns: [], answer: 'The existing test covers this behavior.' })));
  const job = await f.service.create(f.args);
  assert.equal(job.plan.subtasks[0].answer, 'The existing test covers this behavior.');
  assert.equal(job.plan.subtasks[0].implementer, undefined);
  await f.service.approve({ id: job.id }); assert.equal(f.starts.length, 0);
  assert.equal(f.loop.jobs.get(job.id).state, 'accepted');
});
test('order respects dependencies and deterministically serializes overlapping file patterns', () => {
  const value = plan(item('two', { owns: ['src/**'], dependsOn: ['one'] }), item('one'), item('three'));
  const result = parseMessagePlan(JSON.stringify(value), []);
  assert.deepEqual(result.subtasks.map(sub => sub.id), ['one', 'two', 'three']);
  assert.deepEqual(result.conflicts, [{ before: 'one', after: 'two' }, { before: 'two', after: 'three' }]);
  assert.ok(result.subtasks[2].dependsOn.includes('two'));
  assert.deepEqual(result.subtasks.map(sub => sub.order), [1, 2, 3]);
});
test('invalid JSON, cycles, unknown files, invalid kinds and missing answers never launch work', async () => {
  for (const value of ['bad JSON', plan(item('one', { kind: 'unknown' })), plan(item('one', { owns: ['../secret'] })), plan(item('one', { dependsOn: ['one'] })), plan(item('one', { kind: 'question' }))]) {
    const f = fixture(value), job = await f.service.create(f.args);
    assert.equal(job.state, 'failed'); assert.equal(f.starts.length, 0);
  }
});
test('attached images reach the mocked model and retain item attribution; invented and omitted paths fail', async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'paddock-dispatch-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const image = path.join(folder, 'screen.png'); await fs.writeFile(image, 'image fixture');
  const f = fixture(plan(item('one', { images: [image] })));
  const job = await f.service.create({ ...f.args, images: [image] });
  assert.deepEqual(f.requests[0].job.images, [image]); assert.deepEqual(job.plan.subtasks[0].images, [image]);
  await f.service.approve({ id: job.id }); assert.deepEqual(f.starts[0].images, [image]);
  // Paths named in the message but not attached are dropped instead of failing the plan.
  assert.deepEqual(parseMessagePlan(JSON.stringify(plan(item('one', { images: [image, image + '.other'] }))), [image]).subtasks[0].images, [image]);
  assert.deepEqual(parseMessagePlan(JSON.stringify(plan(item('one', { images: ['design/concept.png'] }))), []).subtasks[0].images, []);
  assert.throws(() => parseMessagePlan(JSON.stringify(plan(item('one'))), [image]), /every attached image/);
});
test('approval starts one item at a time and halts subsequent items on a failed check', async () => {
  const f = fixture(plan(item('one'), item('two'), item('three'))), parent = await f.service.create(f.args);
  await f.service.approve({ id: parent.id }); assert.equal(f.starts.length, 1);
  f.loop.jobs.get('child-0').state = 'passed'; await f.service.advance(parent.id); assert.equal(f.starts.length, 2);
  f.loop.jobs.get('child-1').state = 'needs-you'; await f.service.advance(parent.id);
  assert.equal(f.loop.jobs.get(parent.id).state, 'needs-you'); assert.equal(f.starts.length, 2);
});
test('design concepts gate is visible before approval and never starts an implementation task', async () => {
  const f = fixture(plan(item('design', { kind: 'design' }), item('later'))), parent = await f.service.create(f.args);
  assert.equal(parent.plan.subtasks[0].phase, 'concepts-required');
  await f.service.approve({ id: parent.id });
  assert.equal(f.starts.length, 0); assert.equal(f.loop.jobs.get(parent.id).state, 'needs-you');
  assert.match(f.loop.jobs.get(parent.id).error, /Choose concepts/);
});
test('configured dispatcher is used and invalid saved routes recover to Small tier', async () => {
  const configured = { accountId: 'codex:other', model: 'configured-small' }, f = fixture(plan(item('one')), { dispatcher: configured });
  await f.service.create(f.args); assert.equal(f.requests[0].step.model, 'configured-small');
  assert.deepEqual(normalizeDispatcher(configured), configured); assert.equal(normalizeDispatcher(null), null);
  assert.throws(() => normalizeDispatcher({ ...configured, model: '-unsafe' }), /Choose/);
  assert.equal(initialSettings({ dispatcher: { invalid: true } }, os.tmpdir(), {}).dispatcher, null);
});
test('failed durable plan or approval save never launches model or implementation', async () => {
  const f = fixture(plan(item('one'))); f.loop.changed = () => false;
  await assert.rejects(f.service.create(f.args), /No model/); assert.equal(f.requests.length, 0);
  const g = fixture(plan(item('one'))), parent = await g.service.create(g.args); g.loop.changed = () => false;
  await assert.rejects(g.service.approve({ id: parent.id }), /No work/); assert.equal(g.starts.length, 0);
});
test('changed worker or reviewer funding cannot authorize spending at approval or the next item', async () => {
  for (const funding of ['metered', 'unknown']) {
    const f = fixture(plan(item('one'))), parent = await f.service.create(f.args);
    const assignment = f.loop.assignment;
    f.loop.assignment = raw => ({ ...assignment(raw), funding });
    await assert.rejects(f.service.approve({ id: parent.id }), /funding/); assert.equal(f.starts.length, 0);
  }
  const f = fixture(plan(item('one'), item('two', { size: 'medium' }))), parent = await f.service.create(f.args);
  await f.service.approve({ id: parent.id });
  f.loop.jobs.get('child-0').state = 'passed';
  const assignment = f.loop.assignment; f.loop.assignment = raw => ({ ...assignment(raw), funding: 'free' });
  await f.service.advance(parent.id); assert.equal(f.starts.length, 1); assert.equal(f.loop.jobs.get(parent.id).state, 'needs-you');
  const g = fixture(plan(item('one'))), reviewed = await g.service.create(g.args);
  g.loop.jobs.get(reviewed.id).plan.subtasks[0].reviewer = { accountId: 'claude:other', model: 'review' };
  const original = g.loop.assignment; g.loop.assignment = raw => ({ ...original(raw), funding: raw.accountId === 'claude:other' ? 'metered' : 'included' });
  await assert.rejects(g.service.approve({ id: reviewed.id }), /reviewer funding/); assert.equal(g.starts.length, 0);
});

test('the owner setting starts one or two small sequential tasks; larger, design and parallel plans still wait', async () => {
  const on = { autoApproveSmallPlans: true };
  let f = fixture(plan(item('one'), item('two')), on);
  let job = await f.service.create(f.args);
  assert.equal(job.autoApproved, true); assert.equal(job.state, 'building'); assert.equal(f.starts.length, 1);
  f = fixture(plan(item('one')));
  job = await f.service.create(f.args);
  assert.equal(job.state, 'plan-ready', 'setting off by default'); assert.equal(f.starts.length, 0);
  for (const subtasks of [[item('one'), item('two'), item('three')], [item('one', { size: 'medium' })], [item('one', { kind: 'design' })]]) {
    f = fixture(plan(...subtasks), on);
    job = await f.service.create(f.args);
    assert.equal(job.state, 'plan-ready', JSON.stringify(subtasks.map(s => [s.size, s.kind])));
    assert.equal(job.autoApproved, undefined); assert.equal(f.starts.length, 0);
  }
  f = fixture(plan(item('one')), on); delete f.args.executionMode; f.loop.git = async () => '';
  job = await f.service.create(f.args);
  assert.equal(job.state, 'plan-ready', 'parallel plans wait'); assert.equal(f.starts.length, 0);
});

test('a failed automatic start keeps the plan waiting with the reason', async () => {
  const f = fixture(plan(item('one')), { autoApproveSmallPlans: true });
  f.loop.changed = job => job.state !== 'building';
  const job = await f.service.create(f.args);
  assert.equal(job.state, 'plan-ready'); assert.equal(job.autoApproved, undefined);
  assert.match(job.error, /Automatic start failed: .*Approve the plan to retry/); assert.equal(f.starts.length, 0);
});

test('without a chosen dispatcher, the sending console account plans with its lightest model', async () => {
  const f = fixture(plan(item('one')));
  const fresh = 1000000;
  const claude = { id: 'claude:default', provider: 'claude', label: 'Claude', installed: true, signedIn: true, funding: 'included', available: true, model: 'claude-opus-5-5',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].map(id => ({ id, available: true, funding: 'included', observedAt: fresh })) };
  const base = f.loop.candidates; f.loop.candidates = () => [...base(), claude];
  const job = await f.service.create({ ...f.args, accountId: 'claude:default' });
  assert.equal(f.requests[0].step.accountId, 'claude:default');
  assert.equal(f.requests[0].step.model, 'claude-haiku-5-5');
  assert.equal(job.state, 'plan-ready');
  // An unknown console account falls back to Small routing; a chosen dispatcher always wins.
  const other = fixture(plan(item('one')));
  await other.service.create({ ...other.args, accountId: 'missing:account' });
  assert.equal(other.requests[0].step.model, 'small-code');
  const chosen = fixture(plan(item('one')), { dispatcher: { accountId: 'codex:default', model: 'picked' } });
  chosen.loop.candidates = () => [...base(), claude];
  await chosen.service.create({ ...chosen.args, accountId: 'claude:default' });
  assert.equal(chosen.requests[0].step.model, 'picked');
  await assert.rejects(f.service.create({ ...f.args, accountId: 'bad id' }), /console account/);
  // Without a discovered model list the account default (Opus here) is never used for planning.
  const undiscovered = fixture(plan(item('one')));
  undiscovered.loop.candidates = () => [...base(), { ...claude, models: [] }];
  await undiscovered.service.create({ ...undiscovered.args, accountId: 'claude:default' });
  assert.equal(undiscovered.requests[0].step.model, 'small-code');
});
