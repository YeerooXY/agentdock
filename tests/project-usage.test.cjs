'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Projects } = require('../electron/projects.cjs');
const { quotaChange, codexMessages, MessageUsage } = require('../electron/message-usage.cjs');
function temporary(t) {
  const parent = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(parent, 'dock-quota-test-'));
  t.after(() => { assert.equal(path.dirname(fs.realpathSync(root)), parent); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}
const window = (usedPercent, resetsAt = 1800000000000, minutes = 300) => ({ usedPercent, resetsAt, minutes });

test('quota changes keep windows independent and mark resets, missing readings and saturated limits unavailable', () => {
  const result = quotaChange([window(10), window(35, 1800000000000, 10080)], [window(12.5), window(36, 1800000000000, 10080)]);
  assert.deepEqual(result.map(x => x.changePercent), [2.5, 1]);
  assert.ok(result.every(x => x.scope === 'account' && x.attribution === 'estimate'));
  for (const [before, after, reason] of [[[], [window(5)], 'No starting reading'], [[window(40)], [window(2,1800100000000)], 'Window reset'], [[window(100)], [window(100)], 'At quota limit'], [[window(45)], [window(40)], 'Quota reading decreased']]) {
    const [q] = quotaChange(before, after); assert.equal(q.changePercent, null); assert.equal(q.reason, reason);
  }
  assert.deepEqual(quotaChange([], [{ usedPercent: 101, minutes: 300, resetsAt: 1800000000000 }]), []);
  assert.equal(quotaChange([window(25)], [window(25)])[0].changePercent, 0, 'Zero means no reported change; the UI labels rounding');
  assert.equal(quotaChange([{...window(10),limitId:'one'}],[{...window(20),limitId:'two'}])[0].changePercent,null,'Different account/model limit groups must not be subtracted');
});

test('Codex turn usage reads real snake_case quota fields, never invents a baseline and never sums windows', () => {
  const event = (type, seconds, data = {}) => ({ type:'event_msg', timestamp:new Date(1800000000000 + seconds * 1000).toISOString(), payload:{ type, ...data } });
  const tokens = (seconds, used, reset = 1800100000) => event('token_count', seconds, { rate_limits: { primary:{ used_percent:used, window_minutes:300, resets_at:reset }, credits:{ balance:'PRIVATE_BALANCE' } } });
  const lines = [tokens(0,10), event('task_started',1,{turn_id:'a'}),tokens(2,12),event('task_complete',3,{turn_id:'a'}),event('task_started',300,{turn_id:'b'}),tokens(301,15),event('task_complete',302,{turn_id:'b'})];
  const rows = codexMessages(lines);
  assert.equal(rows[0].quota[0].changePercent, 2);
  assert.equal(rows[1].quota[0].changePercent, null, 'A stale reading is not a starting reading');
  assert.equal(codexMessages(lines.slice(1))[0].quota[0].changePercent, null);
  assert.ok(!JSON.stringify(rows).includes('PRIVATE_BALANCE'));
});

test('per-turn quota records deduplicate rescans, retain known readings and persist project attribution', t => {
  const store = new MessageUsage(temporary(t));
  const session = { id:'session', provider:'codex', providerSessionId:'chat', name:'Console', model:'Original model', projectId:'project', projectName:'My project' };
  const message = { id:'turn', at:1800000000000, finishedAt:1800000010000, quota:quotaChange([window(10)],[window(11)]), usage:{input:10,output:5,total:15}, status:'completed' };
  store.record(session, [message, message]);
  store.record(session, [{ ...message, quota:[] }]);
  store.record({...session,projectId:'different',projectName:'Different project',model:'Different model'}, [{...message,usage:null,quota:quotaChange([], [window(11)])}]);
  assert.equal(store.items.length,1); assert.equal(store.items[0].quota[0].changePercent,1);
  assert.equal(store.items[0].usage.total,15,'A truncated rescan must retain the previously measured counters');
  const saved = new MessageUsage(path.dirname(store.file)).items[0];
  assert.equal(saved.model,'Original model'); assert.equal(saved.projectId,'project'); assert.equal(saved.projectName,'My project');
});

test('project colors survive edits and reloads; invalid CSS is rejected; legacy colors remain stable', t => {
  const root = temporary(t), projects = new Projects(root);
  const p = projects.save({ name:'Game', color:'#Aa12eF', folders:[{ path:root }] });
  assert.equal(p.color,'#aa12ef');
  const updated = projects.save({ ...p, color:undefined, goals:'Finish' });
  assert.equal(updated.color,'#aa12ef');
  assert.equal(new Projects(root).list()[0].color,'#aa12ef');
  assert.throws(() => projects.save({ ...updated, color:'red; background:url(https://example.com)' }), /valid project color/);
  const legacy = { ...updated }; delete legacy.color;
  projects.commit([legacy]); const color = projects.list()[0].color;
  projects.save({ name:'Other', folders:[{ path:root }] });
  assert.equal(projects.list().find(x => x.id === p.id).color,color);
});

test('Claude hooks compare fresh readings for the same user turn and discard stale baselines', t => {
  const root = temporary(t), session = crypto.randomUUID(), launchId = crypto.randomUUID(), conversation = crypto.randomUUID(), helper = path.resolve(__dirname,'../electron/agent-event.cjs');
  const env = { ...process.env, PADDOCK_DATA_DIR:root, PADDOCK_SESSION_ID:session, PADDOCK_LAUNCH_ID:launchId };
  delete env.PADDOCK_BRIDGE_URL; delete env.PADDOCK_BRIDGE_TOKEN;
  const run = (mode,input) => { const child=spawnSync(process.execPath,[helper,mode],{env,input:JSON.stringify(input),windowsHide:true}); assert.equal(child.status,0,child.stderr?.toString()); };
  const status = used => run('statusline',{session_id:conversation,rate_limits:{five_hour:{used_percentage:used,resets_at:1800100000}}});
  status(10); run('UserPromptSubmit',{session_id:conversation,hook_event_name:'UserPromptSubmit'});
  const file = path.join(root,'transcript.jsonl');
  fs.writeFileSync(file,[{type:'user',uuid:'turn',timestamp:new Date().toISOString(),message:{role:'user',content:'PRIVATE_PROMPT'}},{type:'assistant',message:{id:'a',model:'test',usage:{input_tokens:10,output_tokens:5},content:'PRIVATE_RESPONSE'}}].map(x=>JSON.stringify(x)).join('\n'));
  status(12); run('Stop',{session_id:conversation,hook_event_name:'Stop',transcript_path:file});
  const stateFile = path.join(root,'events',`${session}.${launchId}.state.json`);
  const state = JSON.parse(fs.readFileSync(stateFile));
  assert.equal(state.messageUsage.quota[0].changePercent,2); assert.ok(!JSON.stringify(state).includes('PRIVATE_'));
  const startFile=path.join(root,'events',`${session}.${launchId}.quota-start.json`), start=JSON.parse(fs.readFileSync(startFile));
  start.at -= 600000; fs.writeFileSync(startFile,JSON.stringify(start));
  run('Stop',{session_id:conversation,hook_event_name:'Stop',transcript_path:file});
  assert.deepEqual(JSON.parse(fs.readFileSync(stateFile)).messageUsage.quota,[]);
});
