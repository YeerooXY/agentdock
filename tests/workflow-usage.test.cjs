'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { summarizeUsage } = require('../electron/workflow-usage.cjs');
const { taskUsage } = require('../electron/workflow-usage.cjs');
const { compareUsage } = require('../electron/workflow-comparison.cjs');
test('counts cloud coordination, failures and cached tokens separately from local work', () => {
  const r = summarizeUsage([
    {status:'completed',usage:{input:100,output:30,cached:80}},
    {status:'failed',usage:{input:10,output:5,cached:0}},
    {local:true,status:'completed',usage:{input:500,output:200,cached:50}},
    {status:'incomplete',usage:null}
  ]);
  assert.deepEqual(r.cloud,{calls:3,input:110,output:35,cached:80,unknown:1,unknownCached:1,failed:2});
  assert.deepEqual(r.local,{calls:1,input:500,output:200,cached:50,unknown:0,unknownCached:0,failed:0});
});

test('comparison refuses unsupported savings claims and retains negative reductions', () => {
  const run = { benchmarkKey:'same-brief-and-checks',accepted:true,cloudComplete:true,wallMs:100,usage:summarizeUsage([{usage:{input:100,output:20,cached:50}}]) };
  const candidate = {...run,wallMs:110,usage:summarizeUsage([{usage:{input:70,output:25,cached:40}},{local:true,usage:{input:500,output:500,cached:0}}])};
  assert.deepEqual(compareUsage(run,candidate),{comparable:true,reasons:[],cloudInputReduction:30,cloudOutputReduction:-5,cachedInputReduction:10,wallMsReduction:-10});
  for(const change of [{benchmarkKey:'different'},{benchmarkKey:' '},{accepted:false},{cloudComplete:false},{wallMs:NaN},{usage:{cloud:{input:1,output:2,unknown:1}}},{usage:null}]) {
    const r=compareUsage(run,{...candidate,...change}); assert.equal(r.comparable,false); assert.ok(r.reasons.length); assert.equal(r.cloudInputReduction,null);
  }
  assert.equal(compareUsage(null,candidate).comparable,false);
  const noCache={...candidate,usage:{cloud:{input:70,output:25,unknown:0,unknownCached:1}}};
  assert.equal(compareUsage(run,noCache).cloudInputReduction,30); assert.equal(compareUsage(run,noCache).cachedInputReduction,null);
});
test('worker totals include nested planning and failed rounds without claiming coordinator coverage', () => {
  const step=(input,model='cloud')=>({accountId:'account',model,state:'done',usage:{inputTokens:input,outputTokens:2,cachedInputTokens:0}});
  const r=taskUsage({planRounds:[{planner:step(5),review:{...step(900),state:'reused'}}],rounds:[{implement:step(10,'strata/local'),review:{...step(3),state:'failed'}}],subtasks:[{rounds:[{implement:step(20)}]}]});
  assert.equal(r.local.input,10); assert.equal(r.cloud.input,28); assert.equal(r.cloud.failed,1); assert.equal(r.cloud.calls,3); assert.equal(r.cloudComplete,false);
});
test('invalid and missing counters remain unknown without double counting', () => {
  for(const usage of [null,{input:'1',output:2,cached:0},{input:1,output:-1,cached:1},{input:NaN,output:1,cached:5}]) {
    const r=summarizeUsage([{usage}]).cloud; assert.equal(r.unknown,1); assert.equal(r.unknownCached,1); assert.equal(r.cached,0);
  }
  for(const cached of [undefined,-1,Infinity,11,'0']) {
    const r=summarizeUsage([{usage:{input:10,output:1,cached}}]).cloud; assert.equal(r.unknown,0); assert.equal(r.unknownCached,1); assert.equal(r.input,10);
  }
});
