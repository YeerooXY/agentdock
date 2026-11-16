'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Projects } = require('../electron/projects.cjs');
const { ProjectKnowledge } = require('../electron/project-knowledge.cjs');
const { KnowledgeAccess } = require('../electron/knowledge-access.cjs');
const { KnowledgeQueue } = require('../electron/knowledge-queue.cjs');
const { KnowledgeUpkeep } = require('../electron/knowledge-upkeep.cjs');

function fixture(t, mode = 'automatic') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paddock-map-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'timer.js'), 'export function startTimer(course) { return { course, at: Date.now() }; }');
  fs.writeFileSync(path.join(repo, 'plan.js'), 'export function dailyPlan(courses) { return courses.map(c => c.name); }');
  const projects = new Projects(root), project = projects.save({ name: 'Lab', folders: [{ path: repo }] });
  const settings = { knowledgeMode: mode, knowledgeWorker: { accountId: 'claude:default', model: 'claude-haiku-5-5', funding: 'included' } };
  const store = new ProjectKnowledge(root), access = new KnowledgeAccess({ store, getSettings: () => settings, getProjects: () => projects });
  let clock = Date.now() + 10 * 60000; const turns = [];
  const reply = { value: null };
  const upkeep = new KnowledgeUpkeep({ access, queue: new KnowledgeQueue(root), getSettings: () => settings, getProjects: () => projects, now: () => clock,
    runTurn: async ({ context }) => {
      turns.push(context);
      const overview = context.overview.id, files = context.files.map(file => file.path);
      return { text: JSON.stringify(reply.value ? reply.value(context) : { sections: [
        { id: overview, role: 'overview', title: 'Study lab', summary: 'A planner with a focus timer. Start at plan.js.', sources: files.map(p => ({ path: p })), links: ['sec_timer'] },
        { id: 'sec_timer', role: 'responsibility', title: 'Focus timer', summary: 'startTimer records the course and start time.', sources: [{ path: 'timer.js', anchor: 'made-up-anchor' }, { path: 'ghost.js' }], links: [overview] }] }) };
    } });
  access.upkeep = upkeep;
  return { root, repo, project, settings, access, upkeep, turns, reply, advance: ms => { clock += ms; }, setClock: at => { clock = at; } };
}

test('an automatic project without a map gets one, then waits until the source changes', async t => {
  const f = fixture(t);
  await f.upkeep.tick();
  assert.equal(f.turns.length, 1, 'one documentation turn wrote the first map');
  assert.ok(f.turns[0].files.some(file => file.path === 'timer.js' && file.text.includes('startTimer')), 'the worker sees the source text');
  const timer = f.access.read(f.project.id, { ids: ['sec_timer'] }).items[0];
  assert.match(timer.recorded.summary, /startTimer/); assert.equal(timer.sourceEvidence, 'matches');
  assert.deepEqual(timer.recorded.evidence.map(ref => ref.anchor.startsWith('file:')), [true], 'invented anchor falls back to the whole file; invented path is dropped');
  await f.upkeep.tick();
  assert.equal(f.turns.length, 1, 'an unchanged source runs no further turn');
});

test('a direct edit refreshes the map once the files have been quiet', async t => {
  const f = fixture(t);
  await f.upkeep.tick();
  fs.writeFileSync(path.join(f.repo, 'timer.js'), 'export function startTimer(topic) { return { topic, at: Date.now() }; }');
  f.reply.value = context => ({ sections: [{ id: 'sec_timer', role: 'responsibility', title: 'Focus timer', summary: 'Timer now logs per topic.', sources: [{ path: 'timer.js' }] }] });
  const edited = fs.statSync(path.join(f.repo, 'timer.js')).mtimeMs;
  f.setClock(edited + 30000); await f.upkeep.tick();
  assert.equal(f.turns.length, 1, 'no refresh while the edit is fresh');
  f.advance(2 * 60000); await f.upkeep.tick();
  assert.equal(f.turns.length, 2); assert.ok(f.turns[1].prior.some(item => item.id === 'sec_timer'), 'the refresh sees the previous notes');
  assert.match(f.access.read(f.project.id, { ids: ['sec_timer'] }).items[0].recorded.summary, /per topic/);
});

test('read mode and a lowered project never start map turns', async t => {
  const f = fixture(t, 'read');
  await f.upkeep.tick(); assert.equal(f.turns.length, 0);
  f.settings.knowledgeMode = 'automatic'; f.project.knowledgeMode = 'read';
  f.access.getProjects().setKnowledgeMode(f.project.id, 'read');
  await f.upkeep.tick(); assert.equal(f.turns.length, 0);
});

test('restoring timestamps does not refresh unchanged contents', async t => {
  const f = fixture(t); await f.upkeep.tick();
  fs.utimesSync(path.join(f.repo, 'timer.js'), new Date(), new Date());
  await f.upkeep.tick(); assert.equal(f.turns.length, 1);
});

test('an unavailable documentation worker leaves source preparation and budget untouched', async t => {
  const f = fixture(t); let prepared = 0;
  const initialize = f.access.initialize.bind(f.access);
  f.access.initialize = (...args) => { prepared++; return initialize(...args); };
  f.upkeep.selectWorker = () => { throw Error('Documentation allowance is stale.'); };
  await f.upkeep.tick(); await f.upkeep.tick();
  assert.equal(prepared, 0); assert.equal(f.turns.length, 0);
  assert.match(f.upkeep.status(f.project.id).waitingReason, /allowance is stale/);
  assert.equal(f.upkeep.budget.available(f.project.id), true);
  f.upkeep.selectWorker = () => f.settings.knowledgeWorker;
  await f.upkeep.tick();
  assert.equal(prepared, 1); assert.equal(f.turns.length, 1);
});

test('large files have code outlines and missed files lead the next batch', t => {
  const f = fixture(t), { context } = require('../electron/knowledge-bootstrap.cjs');
  fs.writeFileSync(path.join(f.repo, 'app.js'), 'export function startApp() { return 1; }\n' + '// retained code context\n'.repeat(6000));
  for (let i = 0; i < 150; i++) fs.writeFileSync(path.join(f.repo, `module${i}.js`), `export const value${i} = 1;`);
  const first = context(f.access, f.project.id, { refresh: false });
  assert.ok(first.files.find(file => file.path === 'app.js')?.outline?.partial);
  assert.match(first.files.find(file => file.path === 'app.js').outline.entry, /startApp/);
  assert.ok(first.coverage.deferredCount > 0);
  const missed = first.coverage.deferred[0];
  const next = context(f.access, f.project.id, { refresh: true, deferred: [missed] });
  assert.equal(next.files[0].path, missed);
  assert.ok(Buffer.byteLength(JSON.stringify(first)) <= 98304);
});

test('map hints are brief, source-bound and limited to larger projects', async t => {
  const f = fixture(t); await f.upkeep.tick();
  assert.equal(f.access.startupHint(f.project.id), '');
  for (let i = 0; i < 45; i++) fs.writeFileSync(path.join(f.repo, `hint${i}.js`), `export const hint${i} = 1;`);
  f.advance(120000); await f.upkeep.tick();
  assert.match(f.access.startupHint(f.project.id), /documentation map/);
  f.settings.knowledgeMode = 'off'; assert.equal(f.access.startupHint(f.project.id), '');
});
