'use strict';
const {chromium,webkit,devices}=require('playwright'), fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','projects'),fixture=JSON.parse(fs.readFileSync(path.join(out,'fixture.json')));
const server=http.createServer((req,res)=>{const name=req.url.split('?')[0],file=name==='/axe.js'?require.resolve('axe-core/axe.min.js'):path.join(root,'dist',name==='/'?'index.html':name);if(name!=='/axe.js'&&!file.startsWith(path.join(root,'dist')+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).pipe(res);});
const profiles=[['pc',chromium,{viewport:{width:1440,height:1000}}],['mac',webkit,{...devices['Desktop Safari'],viewport:{width:1440,height:1000}}],['android',chromium,{...devices['Pixel 7']}],['iphone',webkit,{...devices['iPhone 13']}]];
let browser;const reports=[];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  for(const [name,engine,options]of profiles){
    browser=await engine.launch();const context=await browser.newContext(options),state=structuredClone(fixture),errors=[],captures=[],violations=[];
    state.version='0.6.0-preview.4';state.settings.sidebarCollapsed=false;state.mode='dashboard';state.updates={current:state.version};
    state.projects.push({...state.projects[0],id:'second-project',name:'Trader',category:'App',goals:'Keep a clear record of decisions.',nextStep:'Review the position history',milestones:[],lastActiveAt:Date.now()-14*86400000});
    state.messages=[{id:'demo',at:Date.now(),provider:'codex',consoleName:'Robonslaught',model:'Test model',usage:{input:12000,output:700,cached:9000},source:'Codex log',status:'completed'},{id:'api-demo',at:Date.now()-50000,provider:'openai',consoleName:'Trader',model:'Test API model',usage:{input:4200,output:500,cached:2000},estimatedCost:0.032,source:'Dock API',steps:3,status:'completed'}];
    await context.exposeFunction('fixtureCall',async(method,payload)=>{
      let value;
      if(method==='state')return{ok:true,value:state};
      if(method==='session.buffer')return{ok:true,value:{data:'',sequence:0}};
      if(method==='session.models')return{ok:true,value:[]};
      if(method==='settings')Object.assign(state.settings,payload);
      else if(method==='updates.check')state.updates={current:state.version,checkedAt:Date.now(),release:{version:'0.6.0-preview.5',size:150000000},checking:false};
      else if(method==='updates.download')Object.assign(state.updates,{downloaded:true,progress:100});
      else if(method==='projects.save'){const p=state.projects.find(x=>x.id===payload.id);Object.assign(p,payload);value=p;}
      else if(method==='projects.progress'){const p=state.projects.find(x=>x.id===payload.id);p.milestones[payload.milestone].done=payload.done;value=p;}
      else if(!['session.resize','session.input','session.acknowledge'].includes(method))throw Error('Unexpected fixture call '+method);
      return{ok:true,value,state};
    });
    await context.addInitScript(()=>{let changed;window.dock={call:async(m,p)=>{const r=await window.fixtureCall(m,p);if(r.state)changed?.(r.state);return r;},onState:f=>{changed=f;},onOutput:()=>{},onSelect:()=>{}};});
    const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.session-card').first().waitFor();await page.addScriptTag({url:'/axe.js'});
    const small=['android','iphone'].includes(name);
    async function nav(view){if(small&&state.settings.sidebarCollapsed)await page.locator('#sidebar-toggle').click();await page.locator(`[data-page=${view}]`).first().click();if(small&&!state.settings.sidebarCollapsed)await page.locator('#sidebar-toggle').click();}
    async function capture(view){await page.evaluate(async()=>{document.getAnimations().filter(x=>x.effect?.getTiming().iterations!==Infinity).forEach(x=>x.finish());await document.fonts.ready;});const file=name+'-'+view+'.png';await page.screenshot({path:path.join(out,file)});captures.push(file);const checks=await page.evaluate(async()=>{const result=await axe.run(document,{runOnly:['color-contrast','button-name','label','aria-dialog-name']});return{overflow:document.documentElement.scrollWidth>innerWidth+1||(!document.querySelector('#content').hidden&&document.querySelector('#content').scrollWidth>document.querySelector('#content').clientWidth+1),violations:result.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)}))};});assert.equal(checks.overflow,false,`${name}/${view} overflow`);if(checks.violations.length)violations.push({view,items:checks.violations});}
    await nav('projects');await capture('projects');await page.locator('[data-project-search]').fill('Trader');assert.equal(await page.locator('.project-card').count(),1);await page.locator('[data-project-search]').fill('');
    await page.locator('.page-heading [data-project-new]').click();await page.locator('#project-editor').waitFor();
    assert.equal(await page.locator('#project-form [name=name]').evaluate(x=>x===document.activeElement),true);
    for(const field of ['approach','nextStep','milestones','notes','status'])assert.equal(await page.locator(`#project-form [name=${field}]`).isVisible(),false);
    await page.locator('#project-form [name=name]').fill('A new idea');await page.locator('#project-form [name=goals]').fill('Make a small game that is fun to play.');
    await capture('new-project');await page.keyboard.press('Escape');assert.equal(await page.locator('#project-editor').isVisible(),false);assert.equal(await page.locator('.page-heading [data-project-new]').evaluate(x=>x===document.activeElement),true);
    await page.locator('[data-project-edit]').first().click();await page.locator('#project-editor').waitFor();await page.locator('#project-form [name=nextStep]').fill('Verify the next wave');await capture('project-editor');await page.keyboard.press('Escape');assert.equal(await page.locator('#project-editor').isVisible(),false);
    await nav('usage');await page.locator('.message-usage').scrollIntoViewIfNeeded();await capture('usage');
    await nav('api');await page.locator('#api-form [name=projectId]').selectOption(state.projects[0].id);await capture('api-project');
    await nav('settings');await page.locator('#updates-settings').scrollIntoViewIfNeeded();await page.locator('[data-update=check]').click();await capture('updates');await page.locator('[data-update=download]').click();assert.equal(await page.locator('[data-update=install]').count(),1);
    await page.locator('#grid-form').scrollIntoViewIfNeeded();await capture('grid-settings');
    await nav('consoles');await capture('grid');
    if(small){const panels=await page.locator('.session-card:not([hidden])').evaluateAll(nodes=>nodes.map(x=>x.getBoundingClientRect().toJSON()));assert.ok(panels.every(x=>x.width>300),'Narrow consoles must stack');assert.ok(panels.every((x,i)=>!i||x.top>=panels[i-1].bottom),'Stacked panels must not overlap');}
    await page.locator('.session-card.empty:not([hidden]) [data-action=new]').first().click({button:'right'});await page.locator('#one-off-console-form [name=projectId]').selectOption(state.projects[0].id);await capture('project-picker');await page.keyboard.press('Escape');
    assert.deepEqual(errors,[]);reports.push({profile:name,emulated:name!=='pc',engine:browser.version(),captures,violations});await browser.close();browser=null;console.log('PASS '+name+' project, usage, update and grid flows');
  }
  fs.writeFileSync(path.join(out,'visual-checks.json'),JSON.stringify(reports,null,2));assert.ok(reports.every(x=>!x.violations.length),'Review accessibility findings');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
