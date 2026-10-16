'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Results, Inbox } = require('../electron/results.cjs');
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
  return { root, project, results:new Results(root,{trash}), inbox:new Inbox(root), trash };
}
test('gallery copies project artifacts, rejects private/outside files, and deletes only owned copies', async t => {
  const { root,project,results } = fixture(t), source=path.join(project,'test.md'); fs.writeFileSync(source,'Verified: keyboard works');
  fs.writeFileSync(path.join(root,'vault.json'),'PRIVATE');
  assert.throws(()=>results.add({file:path.join(root,'vault.json')},{project}),/project/);
  const item=results.add({file:source,title:'Keyboard test',kind:'test',status:'passed'},{project,sessionId:'one'});
  assert.equal(results.preview(item.id).text,'Verified: keyboard works');
  fs.writeFileSync(source,'changed in project'); assert.equal(results.preview(item.id).text,'Verified: keyboard works');
  const loaded=new Results(root,{trash:results.trash}); assert.equal(loaded.list()[0].title,'Keyboard test');
  assert.deepEqual(await loaded.remove([item.id]),{deleted:[item.id],failed:[]});
  assert.equal(fs.readFileSync(source,'utf8'),'changed in project'); assert.equal(loaded.list().length,0);
  assert.throws(()=>loaded.path('../../vault.json'));
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
  assert.equal(loaded.unreadGroups(), 1); assert.ok(loaded.list().every(x => x.consoleName === 'Robonslaught'));
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
test('inbox persists read state, deduplicates completion events and clears only read items', t=>{
  const { root,inbox }=fixture(t); const one=inbox.add({key:'one',title:'Done',sessionId:'a'});
  inbox.add({key:'one',title:'Duplicate'}); inbox.add({key:'two',title:'Question',kind:'question'});
  inbox.update({id:one.id,action:'read'}); const loaded=new Inbox(root); assert.equal(loaded.items.length,2);
  loaded.update({action:'clear-read'}); assert.equal(loaded.items.length,1); assert.equal(loaded.items[0].kind,'question');
  loaded.update({action:'clear-all'}); assert.equal(new Inbox(root).items.length,0);
});
test('website reviews reject local files, credentials and active schemes',()=>{
  assert.equal(pageUrl('http://localhost:3000'),'http://localhost:3000/');
  for(const url of ['file:///C:/secrets','javascript:alert(1)','https://user:secret@example.com']) assert.throws(()=>pageUrl(url));
});
test('Dock bridge validates native tool schemas and scopes file access to the calling console', async t => {
  const {root,project}=fixture(t); const outside=path.join(root,'private.txt'); fs.writeFileSync(outside,'DO_NOT_COPY');
  const file=path.join(project,'verification.txt'); fs.writeFileSync(file,'A real test report');
  const sessions={items:new Map([['live',{id:'live',alive:true,cwd:project}]])};
  const workbench=new Workbench(root,{}, {shell:{trashItem:async()=>{}},nativeImage:{}}, {testMode:true,onChange:()=>{},getSessions:()=>sessions,getProject:()=>project});
  const hub=new SharedHub(root,{list:()=>[]},{workbench}); await hub.start(); t.after(()=>hub.close());
  const grant=hub.grant('live');
  const invoke=async args => (await fetch(grant.AGENT_DOCK_BRIDGE_URL,{method:'POST',headers:{Authorization:'Bearer '+grant.AGENT_DOCK_BRIDGE_TOKEN},body:JSON.stringify({name:'dock_call',arguments:args})})).json();
  const saved=await invoke({tool:'dock/save_result',arguments:{file,title:'Verification',kind:'test'}}); assert.equal(saved.isError,undefined);
  assert.equal(workbench.results.items[0].sessionId,'live'); assert.equal(workbench.results.items[0].project,project);
  const blocked=await invoke({tool:'dock/save_result',arguments:{file:outside,title:'Private'}}); assert.equal(blocked.isError,true);assert.ok(!JSON.stringify(workbench.snapshot()).includes('DO_NOT_COPY'));
  const invalid=await invoke({tool:'dock/save_result',arguments:{title:'No spoofing',text:'test',sessionId:'someone-else'}}); assert.equal(invalid.isError,true);
  hub.revoke('live'); const response=await fetch(grant.AGENT_DOCK_BRIDGE_URL,{method:'POST',headers:{Authorization:'Bearer '+grant.AGENT_DOCK_BRIDGE_TOKEN},body:'{}'});assert.equal(response.status,403);
});
test('Meshy device sign-in exposes only the user code and verification URL', async t=>{
  const {root,results,inbox}=fixture(t); let finish; const calls=[];
  const run=async args=>{
    calls.push(args);
    if(args.includes('--no-wait'))return {status:'device_flow_started',flow_id:'local-flow',user_code:'TEST-CODE',verification_url:'https://www.meshy.ai/authorize',device_code:'PRIVATE_DEVICE_SECRET',expires_in:300};
    return new Promise(resolve=>{finish=resolve;});
  };
  const concepts=new Concepts(root,{},results,{},inbox,{run}); await concepts.connect();
  assert.deepEqual(concepts.auth,{state:'waiting',code:'TEST-CODE',url:'https://www.meshy.ai/authorize'});
  assert.ok(calls[1].includes('local-flow'));assert.ok(!JSON.stringify(calls).includes('PRIVATE_DEVICE_SECRET'));
  finish({status:'logged_in',credential:'PRIVATE_TOKEN'}); await new Promise(r=>setImmediate(r));
  assert.deepEqual(concepts.auth,{state:'connected'});
});
test('Meshy fallback requires an agent attempt, preserves accepted IDs and resumes without resubmitting', async t=>{
  const {root,project,results,inbox}=fixture(t); const ref=results.add({buffer:Buffer.from('mock image'),ext:'.png',kind:'screenshot',groupId:'review'}, {project,trusted:true});
  const calls=[]; let waitingFails=true;
  const run=async args=>{
    calls.push(args);
    if(args[1]==='create')return {result:{submission:{task_id:'accepted-task'}}};
    if(args[1]==='wait') { if(waitingFails) throw Error('Network interrupted'); return {result:{task:{task_id:'accepted-task',status:'SUCCEEDED',consumed_credits:9}}}; }
    if(args.includes('--list'))return {result:{assets:[{key:'image.0',kind:'image'}]}};
    const dir=args[args.indexOf('--output-dir')+1]; fs.mkdirSync(dir,{recursive:true}); const file=path.join(dir,'idea.png'); fs.writeFileSync(file,'mock image'); return {result:{downloads:{files:[{status:'written',path:file}]}}};
  };
  const reviews={get:()=>({id:'review',state:'complete',project,brief:'Sharper navigation'})};
  const concepts=new Concepts(root,{},results,reviews,inbox,{run});
  await assert.rejects(concepts.start({reviewId:'review'}),/first/);
  const id=await concepts.start({reviewId:'review',nativeStatus:'unavailable'});
  while(concepts.busy) await new Promise(r=>setTimeout(r,5));
  assert.equal(concepts.items[0].taskId,'accepted-task'); assert.equal(concepts.items[0].credits,null);
  waitingFails=false;
  const restored=new Concepts(root,{},results,reviews,inbox,{run}); restored.resume(id);
  while(restored.busy) await new Promise(r=>setTimeout(r,5));
  assert.equal(restored.items[0].state,'complete'); assert.equal(restored.items[0].credits,9);
  assert.equal(calls.filter(x=>x[1]==='create').length,1); assert.ok(results.items.some(x=>x.kind==='concept'));
  assert.ok(fs.existsSync(results.path(ref.id))); assert.equal(inbox.items[0].title,'Page concept ready');
  await restored.remove(id); assert.equal(restored.items.length,0);
  assert.equal(new Concepts(root,{},results,reviews,inbox,{run}).usage[0].credits,9,'Deleting a job keeps the usage ledger');
  const disabled=new Concepts(root,{},results,reviews,inbox,{run,testMode:true}); await assert.rejects(disabled.start({reviewId:'review',nativeStatus:'failed'}),/disabled/);
});
