'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Results } = require('../electron/results.cjs');
const { AlertEvents } = require('../electron/alerts.cjs');
const { Concepts } = require('../electron/concepts.cjs');
const { pageUrl } = require('../electron/reviews.cjs');
const { Workbench } = require('../electron/workbench.cjs');
const { SharedHub } = require('../electron/shared.cjs');
const parent = path.resolve(__dirname, '..', 'test-data');
function fixture(t) {
  fs.mkdirSync(parent,{recursive:true}); const work = fs.mkdtempSync(path.join(parent,'workbench-'));
  const root = path.join(work,'profile'), project = path.join(work,'project'); fs.mkdirSync(root); fs.mkdirSync(project);
  t.after(()=>{ assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(parent)); fs.rmSync(work,{recursive:true,force:true}); });
  const trash = async file => { assert.ok(file.startsWith(root + path.sep)); fs.rmSync(file,{recursive:true}); };
  return { root, project, results:new Results(root,{trash}), alerts:new AlertEvents(), trash };
}
test('gallery copies project artifacts, rejects private/outside files, and deletes only owned copies', async t => {
  const { root,project,results } = fixture(t), source=path.join(project,'test.md'); fs.writeFileSync(source,'Verified: keyboard works');
  fs.writeFileSync(path.join(root,'vault.json'),'PRIVATE');
  assert.throws(()=>results.add({file:path.join(root,'vault.json')},{project}),/project/);
  const item=results.add({file:source,title:'Keyboard test',kind:'test',status:'passed'},{project,sessionId:'one'});
  assert.equal(results.preview(item.id).text,'Verified: keyboard works');
  fs.writeFileSync(source,'changed in project'); assert.equal(results.preview(item.id).text,'Verified: keyboard works');
  const loaded=new Results(root,{trash:results.trash}); assert.equal(loaded.list()[0].title,'Keyboard test');
  const savedDir = loaded.directory(item.id);
  assert.deepEqual(await loaded.remove([item.id]),{deleted:[item.id],failed:[]});
  assert.equal(fs.existsSync(savedDir), false); assert.deepEqual(new Results(root).list(), []);
  assert.equal(fs.readFileSync(source,'utf8'),'changed in project'); assert.equal(loaded.list().length,0);
  assert.throws(()=>loaded.path('../../vault.json'));
});

test('deletion reports failure if the saved files are still on disk', async t => {
  const { results } = fixture(t); const item = results.add({ text: 'Keep me until deletion succeeds' });
  results.trash = async () => {};
  assert.deepEqual(await results.remove([item.id]), { deleted: [], failed: [item.id] });
  assert.equal(results.list().length, 1); assert.ok(fs.existsSync(results.path(item.id)));
});

test('full image previews retain intrinsic pixels while thumbnails stay bounded', t => {
  const { results } = fixture(t), sizes = [];
  const source = { isEmpty: () => false, getSize: () => ({ width: 4000, height: 2000 }), toDataURL: () => 'full', resize: size => { sizes.push(size); return { toDataURL: () => 'thumbnail' }; } };
  results.nativeImage = { createFromPath: () => source };
  const item = results.add({ buffer: Buffer.from('fixture'), ext: '.png', kind: 'screenshot' }, { trusted: true });
  assert.equal(results.preview(item.id, false, null, true).image, 'full'); assert.deepEqual(sizes, []);
  assert.equal(results.preview(item.id, true).image, 'thumbnail'); assert.deepEqual(sizes, [{ width: 360, height: 180 }]);
  results.preview(item.id); assert.deepEqual(sizes[1], { width: 1440, height: 720 });
  source.isEmpty = () => true; assert.throws(() => results.preview(item.id), /could not be read/);
});

test('image fit and actual size clamp pan independently on each axis', async () => {
  const { imageGeometry } = await import('../src/image-viewer-geometry.js');
  assert.deepEqual(imageGeometry(2000, 1000, 1358, 752, 'fit'), { width: 1358, height: 679, x: 0, y: 0 });
  assert.deepEqual(imageGeometry(1000, 1600, 1358, 752, 'fit'), { width: 470, height: 752, x: 0, y: 0 });
  assert.deepEqual(imageGeometry(100, 50, 1000, 800, 'fit'), { width: 200, height: 100, x: 0, y: 0 });
  assert.deepEqual(imageGeometry(2000, 1000, 1358, 752, 'actual', 1000, -1000), { width: 2000, height: 1000, x: 321, y: -124 });
  assert.deepEqual(imageGeometry(1000, 1600, 1358, 752, 'actual', 100, 1000), { width: 1000, height: 1600, x: 0, y: 424 });
});

test('old capture reports hide dependency noise without deleting the saved original or source files', t => {
  const { root, results } = fixture(t);
  const noise = { file: 'ice-age-village-research/.deps/package.dist-info/INSTALLER', type: 'modified', patch: null };
  const empty = results.add({ text: JSON.stringify({ changes: [noise] }), kind: 'code', ext: '.json', title: '1 changed file' });
  const mixed = results.add({ text: JSON.stringify({ changes: [noise, { file: 'src/main.js', type: 'modified', patch: '+code' }] }), kind: 'code', ext: '.json', title: '2 changed files' });
  const loaded = new Results(root);
  assert.deepEqual(loaded.list().map(x => [x.id, x.title, x.changeCount]), [[mixed.id, '1 changed file', 1]]);
  assert.equal(loaded.unreadGroups(), 1);
  assert.deepEqual(loaded.preview(mixed.id).diff.changes.map(x => x.file), ['src/main.js']);
  assert.equal(JSON.parse(fs.readFileSync(loaded.path(empty.id), 'utf8')).changes.length, 1, 'Stored evidence remains available');
});
test('result notifications count batches, remember names and preserve unread state across launches', async t => {
  const { root, results, project } = fixture(t);
  const context = { project, sessionId: 'live-id', consoleKey: 'persistent-console', consoleName: 'Trader' };
  const first = Array.from({ length: 3 }, () => results.add({ title: 'Screen', text: 'fixture', groupId: 'verification-one' }, context));
  const second = Array.from({ length: 5 }, () => results.add({ title: 'Check', text: 'fixture', groupId: 'verification-two' }, context));
  assert.equal(results.unreadGroups(), 2);
  results.markSeen(first.map(x => x.id)); assert.equal(results.unreadGroups(), 1);
  results.renameConsole(context.consoleKey, 'Robonslaught');
  const loaded = new Results(root, { trash: results.trash });
  assert.equal(loaded.unreadGroups(), 1); assert.ok(loaded.list().every(x => x.consoleName === 'Trader'), 'Renaming a reused console must not relabel earlier results');
  loaded.markSeen(second.map(x => x.id)); assert.equal(loaded.unreadGroups(), 0);
  loaded.add({ title: 'Late screen', text: 'fixture', groupId: 'verification-two' }, { ...context, sessionId: 'restored-id' });
  assert.equal(loaded.unreadGroups(), 1);
  loaded.add({ title: 'Different console', text: 'fixture', groupId: 'verification-two' }, { ...context, consoleKey: 'other-console' });
  assert.equal(loaded.unreadGroups(), 2);
  await loaded.remove(loaded.list().map(x => x.id)); assert.equal(loaded.unreadGroups(), 0);
});

test('bulk deletion keeps failed items and a redirected result directory cannot be read or deleted', async t => {
  const { root,project,results }=fixture(t);
  const one=results.add({text:'one'}),two=results.add({text:'two'});
  const trash=results.trash; results.trash=async file=>{if(file.endsWith(two.id))throw Error('busy'); return trash(file);};
  assert.deepEqual(await results.remove([one.id,two.id]),{deleted:[one.id],failed:[two.id]});
  const dir=results.directory(two.id); fs.rmSync(dir,{recursive:true}); fs.symlinkSync(project,dir,'junction');
  assert.throws(()=>results.path(two.id),/redirected/); assert.deepEqual((await results.remove([two.id])).failed,[two.id]);
  assert.ok(fs.existsSync(project)); fs.unlinkSync(dir);
});
test('live alerts deduplicate delivery without keeping a stored notification history', t => {
  const { root, alerts } = fixture(t), events = [];
  alerts.on('notification', item => events.push(item));
  const one = alerts.send({ key: 'turn-one', title: 'Done', sessionId: 'a' });
  alerts.send({ key: 'turn-one', title: 'Duplicate' });
  alerts.send({ title: 'Question', kind: 'question', destination: 'projects' });
  assert.equal(events.length, 2); assert.equal(events[0].id, one.id);
  assert.equal(events[1].destination, 'projects');
  assert.equal(alerts.items, undefined); assert.equal(alerts.update, undefined);
  assert.equal(fs.existsSync(path.join(root, 'inbox.json')), false);
  const fresh = new AlertEvents(); assert.equal(fresh.keys.size, 0);
});

test('retired inbox and review UI actions are absent; agent review tools remain discoverable', async t => {
  const { root, project } = fixture(t);
  const wb = new Workbench(root, {}, { nativeImage: {} }, { testMode: true, onChange() {}, getSessions: () => ({ items: new Map() }), getProject: () => project });
  assert.equal('inbox' in wb.snapshot(), false); assert.equal('reviews' in wb.snapshot(), false);
  assert.equal(wb.inbox, undefined);
  for (const method of ['inbox.update', 'review.start', 'review.get', 'review.check', 'review.delete', 'review.brief', 'review.draft']) await assert.rejects(wb.call(method, {}), /Unknown workbench/);
  for (const name of ['review_page', 'review_details', 'list_reviews', 'review_check', 'delete_review']) assert.ok(wb.tools().some(x => x.name === 'dock/' + name));
});

test('website reviews reject local files, credentials and active schemes',()=>{
  assert.equal(pageUrl('http://localhost:3000'),'http://localhost:3000/');
  for(const url of ['file:///C:/secrets','javascript:alert(1)','https://user:secret@example.com']) assert.throws(()=>pageUrl(url));
});

test('dock/start_task forwards task arguments, defaults to the caller folder and validates bridge input without launching agents', async t => {
  const { root, project } = fixture(t), calls = [];
  const callerFolder = path.join(project, 'caller'); fs.mkdirSync(callerFolder);
  const sessions = { items: new Map([['live', { id: 'live', alive: true, cwd: callerFolder }]]) };
  let tasks;
  const workbench = new Workbench(root, {}, { nativeImage: {} }, { testMode: true, onChange() {}, getSessions: () => sessions, getProject: () => project, getTasks: () => tasks });
  const tool = workbench.tools().find(tool => tool.name === 'dock/start_task');
  assert.ok(tool); assert.match(tool.description, /Tasks page/); assert.match(tool.description, /approval/);
  const args = { title: 'Build the arena', criteria: 'Movement and collisions pass.', implementer: { accountId: 'codex:default', model: 'fixture', effort: 'high' }, reviewer: { accountId: 'claude:default', model: 'fixture' }, checks: 'echo fixture', workflow: 'current', maxRounds: 2, timeLimitMinutes: 10, split: false };
  await assert.rejects(workbench.invoke(tool.name, args, 'live'), /Tasks are unavailable/);
  tasks = { start: async args => { calls.push(args); return { id: `task-${calls.length}` }; } };
  const hub = new SharedHub(root, { list: () => [] }, { workbench }); await hub.start(); t.after(() => hub.close());
  const grant = hub.grant('live');
  const invoke = async arguments_ => (await fetch(grant.PADDOCK_BRIDGE_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + grant.PADDOCK_BRIDGE_TOKEN }, body: JSON.stringify({ name: 'dock_call', arguments: { tool: tool.name, arguments: arguments_ } }) })).json();
  const reply = await invoke(args);
  assert.equal(reply.isError, undefined); assert.deepEqual(JSON.parse(reply.content[0].text), { id: 'task-1' });
  assert.deepEqual(calls[0], { ...args, repo: callerFolder });
  const split = { ...args, repo: project, split: true, planner: { accountId: 'codex:default' }, reviewer: null, workflow: 'worktree' };
  assert.equal((await invoke(split)).isError, undefined); assert.deepEqual(calls[1], split);
  await workbench.invoke(tool.name, args); assert.equal(calls[2].repo, project);
  for (const invalid of [{ ...args, split: 'yes' }, { ...args, maxRounds: 6 }, { ...args, sessionId: 'someone-else' }, { criteria: 'Missing title' }]) assert.equal((await invoke(invalid)).isError, true);
  assert.equal(calls.length, 3, 'Invalid input never reaches the task loop');
  tasks.start = async () => { throw Error('A task is already running for this repository.'); };
  assert.equal((await invoke(args)).isError, true);
  sessions.items.get('live').alive = false;
  await assert.rejects(workbench.invoke(tool.name, args, 'live'), /no longer open/);
});
test('Dock bridge validates native tool schemas and scopes file access to the calling console', async t => {
  const {root,project}=fixture(t); const outside=path.join(root,'private.txt'); fs.writeFileSync(outside,'DO_NOT_COPY');
  const file=path.join(project,'verification.txt'); fs.writeFileSync(file,'A real test report');
  const sessions={items:new Map([['live',{id:'live',alive:true,cwd:project}]])};
  const workbench=new Workbench(root,{}, {shell:{trashItem:async()=>{}},nativeImage:{}}, {testMode:true,onChange:()=>{},getSessions:()=>sessions,getProject:()=>project});
  const hub=new SharedHub(root,{list:()=>[]},{workbench}); await hub.start(); t.after(()=>hub.close());
  const grant=hub.grant('live');
  const invoke=async args => (await fetch(grant.PADDOCK_BRIDGE_URL,{method:'POST',headers:{Authorization:'Bearer '+grant.PADDOCK_BRIDGE_TOKEN},body:JSON.stringify({name:'dock_call',arguments:args})})).json();
  const saved=await invoke({tool:'dock/save_result',arguments:{file,title:'Verification',kind:'test'}}); assert.equal(saved.isError,undefined);
  assert.equal(workbench.results.items[0].sessionId,'live'); assert.equal(workbench.results.items[0].project,project);
  const blocked=await invoke({tool:'dock/save_result',arguments:{file:outside,title:'Private'}}); assert.equal(blocked.isError,true);assert.ok(!JSON.stringify(workbench.snapshot()).includes('DO_NOT_COPY'));
  const invalid=await invoke({tool:'dock/save_result',arguments:{title:'No spoofing',text:'test',sessionId:'someone-else'}}); assert.equal(invalid.isError,true);
  hub.revoke('live'); const response=await fetch(grant.PADDOCK_BRIDGE_URL,{method:'POST',headers:{Authorization:'Bearer '+grant.PADDOCK_BRIDGE_TOKEN},body:'{}'});assert.equal(response.status,403);
});
test('Meshy device sign-in exposes only the user code and verification URL', async t=>{
  const {root,results,alerts}=fixture(t); let finish; const calls=[];
  const run=async args=>{
    calls.push(args);
    if(args.includes('--no-wait'))return {status:'device_flow_started',flow_id:'local-flow',user_code:'TEST-CODE',verification_url:'https://www.meshy.ai/authorize',device_code:'PRIVATE_DEVICE_SECRET',expires_in:300};
    return new Promise(resolve=>{finish=resolve;});
  };
  const concepts=new Concepts(root,{},results,{},alerts,{run}); await concepts.connect();
  assert.deepEqual(concepts.auth,{state:'waiting',code:'TEST-CODE',url:'https://www.meshy.ai/authorize'});
  assert.ok(calls[1].includes('local-flow'));assert.ok(!JSON.stringify(calls).includes('PRIVATE_DEVICE_SECRET'));
  finish({status:'logged_in',credential:'PRIVATE_TOKEN'}); await new Promise(r=>setImmediate(r));
  assert.deepEqual(concepts.auth,{state:'connected'});
});
test('Meshy fallback requires an agent attempt, preserves accepted IDs and resumes without resubmitting', async t=>{
  const {root,project,results,alerts}=fixture(t); const notices=[]; alerts.on('notification', item=>notices.push(item)); const ref=results.add({buffer:Buffer.from('mock image'),ext:'.png',kind:'screenshot',groupId:'review'}, {project,trusted:true});
  const calls=[]; let waitingFails=true;
  const run=async args=>{
    calls.push(args);
    if(args[1]==='create')return {result:{submission:{task_id:'accepted-task'}}};
    if(args[1]==='wait') { if(waitingFails) throw Error('Network interrupted'); return {result:{task:{task_id:'accepted-task',status:'SUCCEEDED',consumed_credits:9}}}; }
    if(args.includes('--list'))return {result:{assets:[{key:'image.0',kind:'image'}]}};
    const dir=args[args.indexOf('--output-dir')+1]; fs.mkdirSync(dir,{recursive:true}); const file=path.join(dir,'idea.png'); fs.writeFileSync(file,'mock image'); return {result:{downloads:{files:[{status:'written',path:file}]}}};
  };
  const reviews={get:()=>({id:'review',state:'complete',project,brief:'Sharper navigation'})};
  const concepts=new Concepts(root,{},results,reviews,alerts,{run});
  await assert.rejects(concepts.start({reviewId:'review'}),/first/);
  const id=await concepts.start({reviewId:'review',nativeStatus:'unavailable'});
  while(concepts.busy) await new Promise(r=>setTimeout(r,5));
  assert.equal(concepts.items[0].taskId,'accepted-task'); assert.equal(concepts.items[0].credits,null);
  waitingFails=false;
  const restored=new Concepts(root,{},results,reviews,alerts,{run}); restored.resume(id);
  while(restored.busy) await new Promise(r=>setTimeout(r,5));
  assert.equal(restored.items[0].state,'complete'); assert.equal(restored.items[0].credits,9);
  assert.equal(calls.filter(x=>x[1]==='create').length,1); assert.ok(results.items.some(x=>x.kind==='concept'));
  assert.ok(fs.existsSync(results.path(ref.id))); assert.equal(notices.at(-1).title,'Page concept ready');
  await restored.remove(id); assert.equal(restored.items.length,0);
  assert.equal(new Concepts(root,{},results,reviews,alerts,{run}).usage[0].credits,9,'Deleting a job keeps the usage ledger');
  const disabled=new Concepts(root,{},results,reviews,alerts,{run,testMode:true}); await assert.rejects(disabled.start({reviewId:'review',nativeStatus:'failed'}),/disabled/);
});
