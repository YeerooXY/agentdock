'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Projects } = require('../electron/projects.cjs');
const { cells, planOpening, planLayout, planGrid } = require('../electron/console-layout.cjs');
const { MessageUsage, apiMessages, codexMessages, claudeMessage } = require('../electron/message-usage.cjs');
const { runApi } = require('../electron/api-run.cjs');
const temp = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-project-test-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; };

test('project goals, multiple folders, progress and last activity persist; deletion leaves files', t => {
  const root = temp(t), other = path.join(root, 'website'), sub = path.join(other, 'src'); fs.mkdirSync(sub, { recursive: true });
  const projects = new Projects(root);
  const p = projects.save({ name: 'Robonslaught', category: 'Game', goals: 'Ship a playable demo', nextStep: 'Build the arena', folders: [{ path: root }, { label: 'Site', path: other }], milestones: [{ text: 'Arena', done: false }] });
  const launched = projects.launch({ projectId: p.id, cwd: sub, name: '' }); assert.equal(launched.name, p.name); assert.equal(launched.cwd, sub);
  projects.progress(p.id, { milestone: 0, done: true, note: 'Arena verified', nextStep: 'Add enemies' });
  const saved = new Projects(root).list()[0]; assert.deepEqual(saved.progress, { done: 1, total: 1 }); assert.ok(saved.lastActiveAt);
  assert.match(projects.summary(p.id), /Ship a playable demo/); assert.match(projects.summary(p.id), /Add enemies/);
  assert.throws(() => projects.progress(p.id, { milestone: 99, done: true }));
  assert.throws(() => projects.save({ ...saved, folders: [{ path: path.join(root, 'missing') }] }));
  assert.equal(projects.get(p.id).nextStep, 'Add enemies');
  const commit = projects.commit;
  projects.commit = () => { throw Error('Simulated disk failure'); };
  let activityError; projects.on('tracking-error', message => { activityError = message; });
  assert.doesNotThrow(() => projects.touch(p.id, Date.now() + 120000));
  assert.match(activityError, /could not be saved/);
  projects.commit = commit;
  projects.remove(p.id); assert.ok(fs.existsSync(sub)); assert.deepEqual(new Projects(root).list(), []);
});
test('a full three-row layout shrinks one panel; the tenth console grows the grid without replacing any console', () => {
  const wide = [1,4,7].map((slot,i) => ({ id: ''+i, slot, width: 3, height: 1, alive: true }));
  const opening = planOpening(wide);
  assert.equal(opening.slot, 9); assert.deepEqual(opening.plan.map(x => x.width), [3,3,2]);
  assert.equal(wide[2].width, 3, 'planning never mutates live panels');
  const full = Array.from({ length: 9 }, (_,i) => ({ id: ''+i, slot: i+1, alive: true }));
  const tenth = planOpening(full); assert.equal(tenth.slot, 10); assert.deepEqual(tenth.grid, { columns:3, rows:4 });
  assert.equal(tenth.plan.length, 9); assert.equal(new Set(tenth.plan.flatMap(x => cells(x, tenth.grid))).size, 9);
  const sixteen = planGrid(full, { columns:3, rows:3 }, { columns:4, rows:4 });
  assert.deepEqual(sixteen.plan.map(x=>x.slot), [1,2,3,5,6,7,9,10,11]);
  assert.throws(() => planGrid(wide, { columns:3, rows:3 }, { columns:2, rows:2 }));
  assert.throws(() => planGrid([{id:'edge',slot:3,alive:true}], {columns:3,rows:3}, {columns:2,rows:3}), /before reducing/, 'an excluded column must not wrap into another row');
  assert.throws(() => planOpening(full, { slot:9 }), /already open/);
  const moved = planLayout([...full, { id:'10', slot:10, alive:true }], { id:'10', slot:12 }, tenth.grid);
  assert.equal(moved.find(x=>x.id==='10').slot,12);
});
test('Codex per-turn counters include all tool steps, deduplicate updates and leave truncated baselines unknown', () => {
  const at = '2026-10-18T12:00:00Z', event = payload => ({ type:'event_msg', timestamp:at, payload });
  const tokens = (input,output) => event({ type:'token_count', info:{ total_token_usage:{ input_tokens:input, output_tokens:output, cached_input_tokens:0 } } });
  const lines = [event({type:'task_started',turn_id:'first'}),tokens(20,5),tokens(20,5),tokens(35,10),event({type:'task_complete',turn_id:'first'}),event({type:'task_started',turn_id:'second'}),tokens(50,15),event({type:'task_complete',turn_id:'second'})];
  assert.deepEqual(codexMessages(lines,{complete:true}).map(x=>x.usage.total),[45,20]);
  const partial = codexMessages(lines); assert.equal(partial[0].usage,null); assert.equal(partial[1].usage.total,20);
  const reset = codexMessages([tokens(200,100),...lines]); assert.equal(reset[0].usage,null);
});
test('Claude message totals include tool rounds and cache tokens once without retaining transcript text', t => {
  const root=temp(t), file=path.join(root,'transcript.jsonl'), at=new Date().toISOString();
  const user = id => ({type:'user',uuid:id,timestamp:at,message:{role:'user',content:'PRIVATE_PROMPT'}});
  const assistant = (id, output) => ({type:'assistant',message:{id,model:'test-model',content:[{type:'text',text:'PRIVATE_ANSWER'}],usage:{input_tokens:10,output_tokens:output,cache_read_input_tokens:4,cache_creation_input_tokens:2}}});
  const lines=[user('old'),assistant('old',100),user('new'),assistant('a',1),assistant('a',3),{type:'user',message:{role:'user',content:[{type:'tool_result',content:'PRIVATE_TOOL'}]}},assistant('b',5)];
  fs.writeFileSync(file,lines.map(x=>JSON.stringify(x)).join('\n'));
  const result=claudeMessage(file); assert.equal(result.id,'new'); assert.equal(result.usage.input,32); assert.equal(result.usage.output,8); assert.equal(result.usage.total,40); assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
  const store=new MessageUsage(root), session={id:'s',provider:'claude',name:'Trader'};store.record(session,[result,result]); assert.equal(store.items.length,1); assert.equal(new MessageUsage(root).items.length,1);
});
test('API model/tool rounds share one message and unknown billing never becomes zero', async () => {
  let calls=0;
  const result=await runApi({model:'test',prompt:'PRIVATE_PROMPT'},'FAKE_TEST_KEY', {input:1,output:2}, {profile:{id:'mock',protocol:'responses',url:'https://example.com/v1/responses'},hub:{summary:()=>'',invoke:async()=>({content:[{type:'text',text:'done'}]})},fetcher:async()=>({ok:true,json:async()=> ++calls===1 ? {usage:{input_tokens:10,output_tokens:5},output:[{type:'function_call',call_id:'1',name:'dock_context',arguments:'{}'}]} : {usage:{input_tokens:20,output_tokens:10},output_text:'Done'}})});
  assert.equal(result.entries.length,2); assert.equal(new Set(result.entries.map(x=>x.messageId)).size,1);
  const rows=apiMessages(result.entries); assert.equal(rows.length,1); assert.equal(rows[0].usage.total,45); assert.equal(rows[0].steps,2); assert.ok(Math.abs(rows[0].estimatedCost - 0.00006) < 1e-12); assert.ok(!JSON.stringify(rows).includes('PRIVATE_'));
  assert.equal(apiMessages([{id:'unpriced',at:1,usage:null,estimatedCost:null,status:'unknown'}])[0].estimatedCost,null);
});
