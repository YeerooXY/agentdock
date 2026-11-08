'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { Projects } = require('../electron/projects.cjs');
const { ProjectKnowledge } = require('../electron/project-knowledge.cjs');
const { KnowledgeAccess } = require('../electron/knowledge-access.cjs');
const { KnowledgeQueue } = require('../electron/knowledge-queue.cjs');
const { KnowledgeUpkeep } = require('../electron/knowledge-upkeep.cjs');
const sha = text => createHash('sha256').update(text).digest('hex');
function proposal(context) {
  return { text: JSON.stringify({ unresolved: [], sections: context.sections.map(section => ({
    id: section.id, title: section.title, summary: 'Returns the numeric sum and preserves caller error handling.',
    evidence: context.files.filter(file => section.sourceRefs.includes(file.sourceId)).map(source => ({ sourceId: source.sourceId, contentHash: source.contentHash, anchor: source.anchors[0].anchor }))
  })) }) };
}
function note(f, { id = 'sec_math_contract', paths = ['math.js'], role = 'responsibility', provenance, kind = 'interpretation', flowRefs = ['sec_caller'] } = {}) {
  const captured = f.access.sources.capture(f.project.id, f.repo, { paths });
  const snapshot = f.access.sources.load(f.project.id, captured.snapshotId);
  const section = { schemaVersion: 1, id, kind, title: 'Math caller contract', summary: 'Adds values for callers; callers handle invalid inputs.',
    sourceSnapshot: captured.snapshotId, freshness: 'unknown', provenance: provenance || { kind: 'inferred', reference: 'documentation:' + role + ':' + captured.rootId },
    evidence: snapshot.files.map(file => ({ sourceId: file.sourceId, contentHash: file.contentHash, anchor: 'file:' + file.contentHash })),
    sourceRefs: snapshot.files.map(file => file.sourceId), flowRefs };
  f.store.commit(f.project.id, { operationId: randomUUID(), changes: [{ id, expectedVersion: 0, section }] });
  return section;
}
function fixture(t, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-upkeep-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo); fs.writeFileSync(path.join(repo, 'math.js'), 'export function add(a, b) { return a + b; }');
  const projects = new Projects(root), project = projects.save({ name: 'Math', folders: [{ path: repo }] });
  const settings = { knowledgeMode: 'automatic', knowledgeWorker: { accountId: 'fixture', model: 'mock', funding: 'included' } };
  const store = new ProjectKnowledge(root), access = new KnowledgeAccess({ store, getSettings: () => settings, getProjects: () => projects });
  const queue = new KnowledgeQueue(root); let calls = 0;
  const upkeep = new KnowledgeUpkeep({ access, queue, getSettings: () => settings, getProjects: () => projects, runTurn: async args => {
    calls++; if (callback) return callback(args, { settings, repo });
    return proposal(args.context);
  } }); access.upkeep = upkeep;
  function change(text = 'export function add(a, b) { return Number(a) + Number(b); }', touchedPaths = ['math.js']) {
    const id = randomUUID(), job = { id, projectId: project.id, repo, workFolder: repo, workflow: 'current', changedFiles: touchedPaths, fingerprint: sha(text), finishedAt: Date.now() };
    job.documentation = upkeep.begin(job); fs.writeFileSync(path.join(repo, 'math.js'), text);
    job.pendingDocDelta = { operationId: randomUUID(), taskId: id, projectId: project.id, baseSnapshot: job.documentation.baseSnapshot, targetSnapshot: null, diffHash: job.fingerprint, touchedPaths: [] };
    upkeep.complete(job); upkeep.relay(job); return job;
  }
  return { root, project, projects, settings, store, access, queue, upkeep, change, repo, calls: () => calls };
}
test('automatic upkeep commits only evidence-backed inferred notes and clears pending obligations', async t => {
  const f = fixture(t); f.change(); await f.upkeep.tick();
  assert.equal(f.calls(), 1); const snapshot = f.store.snapshot(f.project.id); assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.entries[0].section.kind, 'interpretation'); assert.equal(snapshot.entries[0].section.freshness, 'unknown');
  assert.equal(snapshot.entries[0].section.provenance.kind, 'inferred'); assert.equal(f.queue.dirty(f.project.id).length, 0);
  assert.equal(f.access.read(f.project.id, { ids: [snapshot.entries[0].id] }).assurance.semanticVerified, false);
});
test('Off and project on-demand suppress automatic turns while retaining records', async t => {
  const f = fixture(t); f.change(); f.settings.knowledgeMode = 'off'; await f.upkeep.tick(); assert.equal(f.calls(), 0);
  f.settings.knowledgeMode = 'automatic'; f.projects.setKnowledgeMode(f.project.id, 'read'); await f.upkeep.tick(); assert.equal(f.calls(), 0);
  assert.equal(f.queue.dirty(f.project.id).length, 1);
});
test('invalid evidence is blocked without a retry or fabricated documentation', async t => {
  const f = fixture(t, async args => ({ text: JSON.stringify({ unresolved: [], sections: args.context.sections.map(section => ({ id: section.id, title: 'Bad', summary: 'Invented obligation.', evidence: [{ sourceId: section.sourceId, contentHash: sha('wrong'), anchor: 'not-an-anchor' }] })) }) }));
  f.change(); await f.upkeep.tick(); await f.upkeep.tick(); assert.equal(f.calls(), 1);
  assert.equal(f.queue.state(f.project.id)[0].status, 'blocked'); assert.equal(f.store.snapshot(f.project.id).entries.length, 0);
});
test('source changes and disabling mode during inference prevent stale commits', async t => {
  const f = fixture(t, async (_args, { settings }) => { settings.knowledgeMode = 'off'; return { text: '{}' }; });
  f.change(); await f.upkeep.tick(); assert.equal(f.store.snapshot(f.project.id).entries.length, 0); assert.equal(f.queue.state(f.project.id)[0].status, 'blocked');
});
test('unchanged exact source uses zero model turns', async t => {
  const f = fixture(t); f.change(fs.readFileSync(path.join(f.repo, 'math.js'), 'utf8')); await f.upkeep.tick();
  assert.equal(f.calls(), 0); assert.equal(f.queue.state(f.project.id)[0].receipt.mode, 'exact-source-unchanged');
});
test('four-attempt hourly budget survives service restart', async t => {
  const f = fixture(t); for (let i = 0; i < 5; i++) { f.change(`export function add(a, b) { return a + b + ${i}; }`); await f.upkeep.tick(); }
  assert.equal(f.calls(), 4); assert.equal(f.queue.dirty(f.project.id).length, 1);
  const restarted = new KnowledgeUpkeep({ access: f.access, queue: new KnowledgeQueue(f.root), getSettings: () => f.settings, getProjects: () => f.projects, runTurn: () => { throw Error('must not dispatch'); } });
  await restarted.tick(); assert.equal(f.queue.dirty(f.project.id).length, 1);
});


test('deleted generated modules retire without a model call and reintroduced modules get a new identity', async t => {
  const f = fixture(t); f.change(); await f.upkeep.tick(); const original = f.store.snapshot(f.project.id).entries[0].id;
  f.change('export function add(a, b) { return a + b + 1; }'); fs.unlinkSync(path.join(f.repo, 'math.js')); await f.upkeep.tick();
  assert.equal(f.calls(), 1); assert.equal(f.store.snapshot(f.project.id).entries.find(entry => entry.id === original).deleted, true);
  f.change('export function add(a, b) { return a + b + 2; }'); await f.upkeep.tick();
  const entries = f.store.snapshot(f.project.id).entries; assert.equal(f.calls(), 2); assert.equal(entries.filter(entry => !entry.deleted).length, 1);
  assert.notEqual(entries.find(entry => !entry.deleted).id, original);
});

test('a filtered changed path never silently clears the coalesced obligation', async t => {
  const f = fixture(t), job = f.change(); fs.writeFileSync(path.join(f.repo, '.env'), 'PRIVATE=value');
  const delta = { ...job.pendingDocDelta, operationId: randomUUID(), touchedPaths: ['.env'] }; delete delta.relayed;
  f.queue.enqueue(Object.fromEntries(['operationId','taskId','projectId','rootId','baseSnapshot','targetSnapshot','diffHash','touchedPaths'].map(key => [key, delta[key]])));
  await f.upkeep.tick(); assert.equal(f.calls(), 0); assert.equal(f.queue.state(f.project.id).filter(item => item.status === 'blocked').length, 2);
  assert.equal(f.store.snapshot(f.project.id).entries.length, 0);
});


test('authored responsibility and bounded flow update the existing claims with all dependencies', async t => {
  for (const role of ['responsibility', 'flow']) await t.test(role, async t => {
    let original;
    const f = fixture(t, async ({ context }) => {
      assert.equal(context.sections.length, 1);
      assert.equal(context.sections[0].id, original.id);
      assert.equal(context.sections[0].expectedVersion, 1);
      assert.equal(context.sections[0].summary, original.summary);
      assert.deepEqual(context.sections[0].evidence, original.evidence);
      assert.deepEqual(context.sections[0].flowRefs, original.flowRefs);
      assert.equal(context.files.length, 2);
      const unchanged = context.files.find(file => file.path === 'caller.js');
      assert.equal(unchanged.before, unchanged.after);
      assert.ok(unchanged.beforeAnchors.length);
      assert.ok(context.files.find(file => file.path === 'math.js').before.includes('return a + b;'));
      assert.ok(Buffer.byteLength(JSON.stringify(context)) <= 48000);
      return proposal(context);
    });
    fs.writeFileSync(path.join(f.repo, 'caller.js'), 'export function total(a, b) { return add(a, b); }');
    original = note(f, { paths: ['math.js', 'caller.js'], role });
    f.change(); await f.upkeep.tick();
    const entries = f.store.snapshot(f.project.id).entries;
    assert.equal(f.calls(), 1); assert.equal(entries.length, 1); assert.equal(entries[0].version, 2);
    const updated = entries[0].section;
    for (const field of ['id', 'title', 'sourceRefs', 'flowRefs', 'provenance']) assert.deepEqual(updated[field], original[field]);
    assert.notEqual(updated.summary, original.summary);
    assert.notEqual(updated.evidence[0].contentHash, original.evidence[0].contentHash);
    assert.equal(updated.evidence[1].contentHash, original.evidence[1].contentHash);
    const pinned = f.access.sources.load(f.project.id, updated.sourceSnapshot);
    assert.equal(pinned.files.length, 2); assert.equal(f.queue.dirty(f.project.id).length, 0);
  });
});

test('every original source dependency must have current evidence, including unchanged callers', async t => {
  const f = fixture(t, async ({ context }) => {
    const result = JSON.parse(proposal(context).text); result.sections[0].evidence.pop();
    return { text: JSON.stringify(result) };
  });
  fs.writeFileSync(path.join(f.repo, 'caller.js'), 'export const caller = 1;');
  const original = note(f, { paths: ['math.js', 'caller.js'] });
  f.change(); await f.upkeep.tick(); await f.upkeep.tick();
  assert.equal(f.calls(), 1); assert.equal(f.queue.state(f.project.id)[0].status, 'blocked');
  assert.deepEqual(f.store.snapshot(f.project.id).entries[0].section, original);
});

test('protected owner, reviewed and adopted map records block before a model call', async t => {
  for (const options of [
    { kind: 'intent', provenance: { kind: 'owner', reference: 'owner:contract' } },
    { provenance: { kind: 'reviewed', reference: 'review:contract' } },
    { provenance: { kind: 'inferred', reference: 'map:contract' } }
  ]) await t.test(options.provenance.kind + ':' + options.provenance.reference, async t => {
    const f = fixture(t); const original = note(f, options); f.change(); await f.upkeep.tick();
    assert.equal(f.calls(), 0); assert.equal(f.queue.state(f.project.id)[0].status, 'blocked');
    assert.deepEqual(f.store.snapshot(f.project.id).entries[0].section, original);
  });
});

test('inferred initialize and inventory scaffolds do not compete with authored claims', async t => {
  const f = fixture(t);
  note(f, { id: 'sec_initialize', provenance: { kind: 'inferred', reference: 'initialize:root' } });
  note(f, { id: 'sec_inventory', provenance: { kind: 'inferred', reference: 'inventory:root' } });
  const original = note(f); f.change(); await f.upkeep.tick();
  const entries = f.store.snapshot(f.project.id).entries;
  assert.equal(f.calls(), 1); assert.equal(entries.length, 3);
  assert.equal(entries.find(entry => entry.id === original.id).version, 2);
  assert.equal(entries.find(entry => entry.id === 'sec_initialize').version, 1);
  assert.equal(entries.find(entry => entry.id === 'sec_inventory').version, 1);
});

test('concurrent source, dependency, record or coverage changes block the whole proposal', async t => {
  for (const conflict of ['source', 'dependency', 'version', 'protected-record']) await t.test(conflict, async t => {
    let f, original;
    f = fixture(t, async ({ context }) => {
      if (conflict === 'source' || conflict === 'dependency') fs.writeFileSync(path.join(f.repo, conflict === 'source' ? 'math.js' : 'caller.js'), 'export const changed = 2;');
      if (conflict === 'version') f.store.commit(f.project.id, { operationId: randomUUID(), changes: [{ id: original.id, expectedVersion: 1, section: { ...original, summary: 'Concurrent author update.' } }] });
      if (conflict === 'protected-record') note(f, { id: 'sec_new_map', provenance: { kind: 'inferred', reference: 'map:new' } });
      return proposal(context);
    });
    fs.writeFileSync(path.join(f.repo, 'caller.js'), 'export const caller = 1;');
    original = note(f, { paths: ['math.js', 'caller.js'] });
    f.change(); await f.upkeep.tick(); await f.upkeep.tick();
    assert.equal(f.calls(), 1); assert.equal(f.queue.state(f.project.id)[0].status, 'blocked');
    const entry = f.store.snapshot(f.project.id).entries.find(entry => entry.id === original.id);
    assert.equal(entry.version, conflict === 'version' ? 2 : 1);
    assert.equal(entry.section.summary, conflict === 'version' ? 'Concurrent author update.' : original.summary);
    assert.equal(f.store.snapshot(f.project.id).entries.some(entry => entry.id.startsWith('sec_module_')), false);
  });
});

test('bounded authored reconciliation blocks mixed coverage, too many records and too many paths', async t => {
  for (const limit of ['mixed', 'records', 'paths', 'sensitive', 'missing', 'bytes']) await t.test(limit, async t => {
    const f = fixture(t); let paths = ['math.js'];
    if (limit === 'paths') for (let i = 0; i < 8; i++) {
      const file = `dep${i}.js`; fs.writeFileSync(path.join(f.repo, file), 'export const value = 1;'); paths.push(file);
    }
    if (limit === 'sensitive') { fs.writeFileSync(path.join(f.repo, 'auth.js'), 'export const session = 1;'); paths.push('auth.js'); }
    if (limit === 'missing') { fs.writeFileSync(path.join(f.repo, 'caller.js'), 'export const caller = 1;'); paths.push('caller.js'); }
    if (limit === 'bytes') { fs.writeFileSync(path.join(f.repo, 'caller.js'), '// ' + 'x'.repeat(25000)); paths.push('caller.js'); }
    note(f, { paths });
    if (limit === 'records') for (let i = 0; i < 3; i++) note(f, { id: `sec_contract_${i}` });
    if (limit === 'mixed') fs.writeFileSync(path.join(f.repo, 'new.js'), 'export const value = 1;');
    f.change(undefined, limit === 'mixed' ? ['math.js', 'new.js'] : ['math.js']);
    if (limit === 'missing') fs.unlinkSync(path.join(f.repo, 'caller.js'));
    await f.upkeep.tick();
    assert.equal(f.calls(), 0); assert.equal(f.queue.state(f.project.id)[0].status, 'blocked');
    assert.equal(f.store.snapshot(f.project.id).entries.every(entry => entry.version === 1), true);
  });
});

test('authored proposals cannot drop records, identity, provenance or links', async t => {
  for (const corruption of ['missing', 'duplicate', 'provenance', 'flowRefs', 'sourceRefs', 'title', 'id']) await t.test(corruption, async t => {
    const f = fixture(t, async ({ context }) => {
      const value = JSON.parse(proposal(context).text);
      if (corruption === 'missing') value.sections.pop();
      else if (corruption === 'duplicate') value.sections[1] = value.sections[0];
      else value.sections[0][corruption] = ({ provenance: { kind: 'inferred', reference: 'maintenance:replacement' }, flowRefs: [], sourceRefs: [], title: 'Replacement', id: 'sec_replacement' })[corruption];
      return { text: JSON.stringify(value) };
    });
    note(f); note(f, { id: 'sec_second' }); f.change(); await f.upkeep.tick();
    assert.equal(f.calls(), 1); assert.equal(f.queue.state(f.project.id)[0].status, 'blocked');
    assert.equal(f.store.snapshot(f.project.id).entries.every(entry => entry.version === 1), true);
  });
});

test('identical authored source costs zero turns but a body-only change requires inference', async t => {
  const f = fixture(t); note(f); f.change(fs.readFileSync(path.join(f.repo, 'math.js'), 'utf8')); await f.upkeep.tick();
  assert.equal(f.calls(), 0); assert.equal(f.store.snapshot(f.project.id).entries[0].version, 1);
  f.change('export function add(a, b) { throw new Error("invalid inputs"); }'); await f.upkeep.tick();
  assert.equal(f.calls(), 1); assert.equal(f.store.snapshot(f.project.id).entries[0].version, 2);
});


test('deleted owner obligations remain blocked and authored mixed deletion never partially commits', async t => {
  for (const mixed of [false, true]) await t.test(mixed ? 'mixed deletion' : 'owner deletion', async t => {
    const f = fixture(t);
    if (mixed) {
      f.change(); await f.upkeep.tick();
      fs.writeFileSync(path.join(f.repo, 'caller.js'), 'export const caller = 1;');
      note(f, { paths: ['caller.js'] });
      f.change('export const value = 2;', ['math.js', 'caller.js']);
    } else {
      note(f, { kind: 'intent', provenance: { kind: 'owner', reference: 'owner:contract' } }); f.change();
    }
    fs.unlinkSync(path.join(f.repo, 'math.js'));
    const before = f.store.snapshot(f.project.id); const calls = f.calls();
    await f.upkeep.tick();
    assert.equal(f.calls(), calls); assert.deepEqual(f.store.snapshot(f.project.id), before);
    assert.equal(f.queue.state(f.project.id).at(-1).status, 'blocked');
  });
});

test('missing running queue membership rejects publication', async t => {
  let f; const state = {};
  f = fixture(t, async ({ context }) => {
    state.read = f.queue.state.bind(f.queue); f.queue.state = () => [];
    return proposal(context);
  });
  note(f); f.change(); await f.upkeep.tick();
  assert.equal(f.calls(), 1); assert.equal(state.read(f.project.id)[0].status, 'blocked');
  assert.equal(f.store.snapshot(f.project.id).entries[0].version, 1);
});

test('missing task base cannot borrow old authored evidence to claim exact source no-change', async t => {
  const f = fixture(t); note(f);
  f.change();
  // A task checkpoint can omit a dependency that an earlier authored claim captured.
  const partial = f.access.sources.capture(f.project.id, f.repo, { paths: [] });
  const record = f.queue.state(f.project.id)[0];
  const isolated = new KnowledgeQueue(path.join(f.root, 'isolated'));
  isolated.enqueue({ ...Object.fromEntries(['operationId', 'taskId', 'projectId', 'rootId', 'baseSnapshot', 'targetSnapshot', 'diffHash', 'touchedPaths'].map(key => [key, record[key]])), baseSnapshot: partial.snapshotId });
  f.upkeep.queue = isolated;
  fs.writeFileSync(path.join(f.repo, 'math.js'), 'export function add(a, b) { return a + b; }');
  await f.upkeep.tick();
  assert.equal(f.calls(), 1); assert.equal(isolated.state(f.project.id)[0].status, 'committed');
});

// A finished task with no listed changes. Mutations run before completion, so they shape the evidence the queue sees.
function emptyDelta(f, { evidence = true, state = 'passed', mutate = () => {} } = {}) {
  const id = randomUUID(), text = fs.readFileSync(path.join(f.repo, 'math.js'), 'utf8');
  const job = { id, projectId: f.project.id, repo: f.repo, workFolder: f.repo, workflow: 'current', changedFiles: [], fingerprint: sha(text), baseline: 'a'.repeat(40),
    finishedAt: Date.now(), state, diffError: '', finalDiff: '', diffStat: 'No task changes.' };
  if (evidence) job.documentationEvidence = { schemaVersion: 1, complete: true, omittedCount: 0, changedCount: 0 };
  job.documentation = f.upkeep.begin(job);
  job.pendingDocDelta = { operationId: randomUUID(), taskId: id, projectId: f.project.id, baseSnapshot: job.documentation?.baseSnapshot ?? null, targetSnapshot: null, diffHash: job.fingerprint, touchedPaths: [] };
  mutate(job);
  f.upkeep.complete(job); f.upkeep.relay(job);
  return job;
}
const statuses = f => f.queue.state(f.project.id).map(record => record.status);

test('new known-empty tasks settle at relay with zero model turns and an explicit receipt', async t => {
  const f = fixture(t); emptyDelta(f);
  const [record] = f.queue.state(f.project.id);
  assert.equal(record.status, 'committed'); assert.equal(record.receipt.mode, 'proven-no-change'); assert.equal(record.receipt.evidence, 'task-evidence');
  await f.upkeep.tick(); assert.equal(f.calls(), 0); assert.deepEqual(f.queue.dirty(f.project.id), []);
});

test('legacy known-empty tasks settle only from retained evidence during reconciliation', async t => {
  const f = fixture(t); const job = emptyDelta(f, { evidence: false, state: 'needs-you' });
  assert.deepEqual(statuses(f), ['pending']);
  job.state = 'passed'; f.upkeep.reconcile([job]);
  assert.deepEqual(statuses(f), ['committed']); assert.equal(f.queue.state(f.project.id)[0].receipt.evidence, 'legacy-task');
  assert.equal(f.calls(), 0);
});

test('an unproven empty operation is blocked by the tick and stays dirty when its task later looks clean', async t => {
  const f = fixture(t); const job = emptyDelta(f, { evidence: false, state: 'needs-you' });
  await f.upkeep.tick(); assert.equal(f.calls(), 0); assert.deepEqual(statuses(f), ['blocked']);
  job.state = 'passed'; f.upkeep.reconcile([job]);
  assert.deepEqual(statuses(f), ['blocked'], 'blocked records are not settled by proof');
  assert.equal(f.queue.dirty(f.project.id).length, 1);
});

test('tick settles relayed known-empty operations from retained jobs before worker gating', async t => {
  const f = fixture(t); const job = emptyDelta(f, { state: 'needs-you' });
  job.state = 'passed'; delete f.settings.knowledgeWorker; f.upkeep.getJobs = () => [job];
  await f.upkeep.tick();
  assert.deepEqual(statuses(f), ['committed']); assert.equal(f.calls(), 0);
});

test('Off pauses proof settlement and read or manual modes still settle without a worker', async t => {
  const f = fixture(t); const job = emptyDelta(f, { state: 'needs-you' });
  f.settings.knowledgeMode = 'off'; job.state = 'passed'; f.upkeep.reconcile([job]); f.upkeep.getJobs = () => [job];
  await f.upkeep.tick(); assert.deepEqual(statuses(f), ['pending']);
  f.settings.knowledgeMode = 'automatic'; f.projects.setKnowledgeMode(f.project.id, 'read');
  await f.upkeep.tick(); assert.deepEqual(statuses(f), ['committed']); assert.equal(f.calls(), 0);
});

test('a task that changed nothing but was never relayed under Off leaves no operation behind', t => {
  const f = fixture(t); f.settings.knowledgeMode = 'off'; emptyDelta(f);
  assert.deepEqual(f.queue.state(f.project.id), []);
});

test('missing, overflowing and incomplete change lists stay unknown and are never settled as empty', async t => {
  const f = fixture(t);
  emptyDelta(f, { evidence: false, mutate: job => { delete job.changedFiles; } });
  emptyDelta(f, { mutate: job => { job.changedFiles = Array.from({ length: 257 }, (_, i) => `src/file${i}.js`); job.documentationEvidence.changedCount = 257; } });
  await f.upkeep.tick(); await f.upkeep.tick();
  assert.equal(f.calls(), 0); assert.equal(f.queue.dirty(f.project.id).length, 2);
  assert.deepEqual(statuses(f).filter(status => status === 'committed'), []);
});

test('omitted or incomplete empty evidence never proves no change', async t => {
  const f = fixture(t);
  emptyDelta(f, { mutate: job => { job.documentationEvidence = { schemaVersion: 1, complete: false, omittedCount: 2, changedCount: 0 }; } });
  await f.upkeep.tick();
  assert.equal(f.calls(), 0); assert.deepEqual(statuses(f), ['blocked']);
});

test('non-exact diff evidence, filtered diffs and error evidence stay dirty', async t => {
  for (const mutate of [
    job => { job.diffStat = 'math.js | 1 +-'; },
    job => { job.finalDiff = 'diff --git a/x b/x'; },
    job => { job.diffError = 'git failed'; },
    job => { job.state = 'interrupted'; }
  ]) await t.test(String(mutate), async t => {
    const f = fixture(t); emptyDelta(f, { mutate });
    await f.upkeep.tick(); assert.equal(f.calls(), 0); assert.deepEqual(statuses(f), ['blocked']);
  });
});

test('a source edit after the task ended keeps the empty operation pending and unhidden', async t => {
  const f = fixture(t); const job = emptyDelta(f, { state: 'needs-you' });
  fs.writeFileSync(path.join(f.repo, 'math.js'), 'export function add(a, b) { return a - b; }');
  job.state = 'passed'; f.upkeep.reconcile([job]);
  assert.deepEqual(statuses(f), ['pending']);
  await f.upkeep.tick(); assert.equal(f.calls(), 0); assert.deepEqual(statuses(f), ['blocked']);
  assert.equal(f.queue.dirty(f.project.id).length, 1);
});

test('missing, null or mismatched snapshots, roots and baselines stay unsettled', async t => {
  for (const mutate of [
    job => { job.documentation.baseSnapshot = null; },
    job => { job.documentation.rootId = 'b'.repeat(64); },
    job => { job.baseline = 'not-a-revision'; }
  ]) await t.test(String(mutate), async t => {
    const f = fixture(t); emptyDelta(f, { mutate });
    await f.upkeep.tick(); assert.equal(f.calls(), 0);
    assert.notEqual(f.queue.state(f.project.id)[0].status, 'committed');
  });
});

test('proof settlement is idempotent and a committed operation is never re-settled', t => {
  const f = fixture(t); const job = emptyDelta(f);
  const [record] = f.queue.state(f.project.id), revision = f.queue.revision(f.project.id);
  assert.equal(f.upkeep.proveJob(job), false);
  f.upkeep.reconcile([job]); f.upkeep.reconcile([job]);
  const [again] = f.queue.state(f.project.id);
  assert.equal(again.receipt.mode, 'proven-no-change'); assert.equal(again.enqueuedAt, record.enqueuedAt);
  assert.equal(f.queue.revision(f.project.id), revision, 'replays write nothing');
});
