'use strict';
// Renders the project Decisions section on PC, Mac Safari, Android and iPhone
// profiles (all but PC emulated) and exercises approve, edit and add.
const {chromium,webkit,devices}=require('playwright'), fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'artifacts','decisions'),fixture=JSON.parse(fs.readFileSync(path.join(root,'artifacts','projects','fixture.json')));
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const name=req.url.split('?')[0],file=name==='/axe.js'?require.resolve('axe-core/axe.min.js'):path.join(root,'dist',name==='/'?'index.html':name);if(name!=='/axe.js'&&!file.startsWith(path.join(root,'dist')+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).pipe(res);});
const profiles=[['pc',chromium,{viewport:{width:1440,height:1000}}],['mac',webkit,{...devices['Desktop Safari'],viewport:{width:1440,height:1000}}],['android',chromium,{...devices['Pixel 7']}],['iphone',webkit,{...devices['iPhone 13']}]];
let browser;const reports=[];
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  for(const [name,engine,options]of profiles){
    browser=await engine.launch();const context=await browser.newContext(options),state=structuredClone(fixture),errors=[],captures=[],violations=[],calls=[];
    state.settings.sidebarCollapsed=false;state.mode='dashboard';
    state.projects=[{...state.projects[0],decisions:[
      {id:'d1',text:'Use Godot 4, not Unity',reason:'Smaller builds; last time Unity steps made 8 GB builds',status:'proposed',by:'Codex · Robonslaught',at:Date.now()},
      {id:'d2',text:'Enemies are drawn in a hand-inked style',reason:'',status:'approved',by:'You',at:Date.now()},
      {id:'d3',text:'Keep every build under 500 MB',reason:'Storage on the dev PC is limited',status:'approved',by:'Claude',at:Date.now()},
    ]}];
    await context.exposeFunction('fixtureCall',async(method,payload)=>{
      if(method==='state')return{ok:true,value:state};
      if(method==='session.buffer')return{ok:true,value:{data:'',sequence:0}};
      if(method==='session.models')return{ok:true,value:[]};
      if(method==='settings'){Object.assign(state.settings,payload);return{ok:true,state};}
      if(method==='explorer.list')return{ok:true,value:{entries:[]}};
      if(method==='projects.decision'){
        calls.push(payload);const p=state.projects[0];
        if(payload.action==='add')p.decisions.push({id:'d'+(p.decisions.length+1),text:payload.text,reason:payload.reason||'',status:'approved',by:'You',at:Date.now()});
        else{const d=p.decisions.find(x=>x.id===payload.decisionId);if(payload.action==='approve')d.status='approved';if(payload.action==='edit'){d.text=payload.text;d.reason=payload.reason;}}
        state.projects=[{...p,decisions:p.decisions.map(x=>({...x}))}];return{ok:true,value:p,state};
      }
      if(['session.resize','session.input','session.acknowledge'].includes(method))return{ok:true};
      throw Error('Unexpected fixture call '+method);
    });
    await context.addInitScript(()=>{let changed;window.dock={call:async(m,p)=>{const r=await window.fixtureCall(m,p);if(r.state)changed?.(r.state);return r;},onState:f=>{changed=f;},onOutput:()=>{},onSelect:()=>{}};});
    const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.session-card').first().waitFor();await page.addScriptTag({url:'/axe.js'});
    // The activity rail holds the page buttons; #sidebar-toggle now opens the Explorer.
    async function nav(view){await page.locator(`[data-page=${view}]`).first().click();}
    async function capture(view){await page.evaluate(async()=>{document.getAnimations().filter(x=>x.effect?.getTiming().iterations!==Infinity).forEach(x=>x.finish());await document.fonts.ready;});const decisions=page.locator('.project-decisions').first();await decisions.scrollIntoViewIfNeeded();const file=name+'-'+view+'.png';await page.screenshot({path:path.join(out,file)});captures.push(file);const checks=await page.evaluate(async()=>{const result=await axe.run(document.querySelector('.project-decisions'),{runOnly:['color-contrast','button-name','label']});return{overflow:document.documentElement.scrollWidth>innerWidth+1,violations:result.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)}))};});assert.equal(checks.overflow,false,`${name}/${view} overflow`);if(checks.violations.length)violations.push({view,items:checks.violations});}
    await nav('projects');
    const section=page.locator('.project-decisions').first();
    assert.equal(await section.evaluate(x=>x.open),true,'Proposals open the section');
    assert.match(await section.locator('summary').innerText(),/Decisions · 2\s*1 to review/);
    await capture('proposed');
    await section.locator('[data-decision-id=d1] [data-decision=approve]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-decision-id=d1] [data-decision=approve]'));
    assert.deepEqual(calls.at(-1),{id:state.projects[0].id,decisionId:'d1',action:'approve'});
    const reopened=page.locator('.project-decisions').first();
    if(!await reopened.evaluate(x=>x.open))await reopened.locator('summary').click();
    await reopened.locator('[data-decision-id=d2] [data-decision=edit]').click();
    const input=page.locator('[data-decision-edit=d2] [name=text]');
    assert.equal(await input.evaluate(x=>x===document.activeElement),true,'Edit focuses the decision');
    await input.fill('Enemies are drawn in a hand-inked style with flat colors');await capture('editing');
    await page.locator('[data-decision-edit=d2] [type=submit]').click();
    await page.waitForFunction(()=>!document.querySelector('[data-decision-edit]'));
    assert.equal(calls.at(-1).action,'edit');
    await page.locator('[data-decision-add] [name=text]').fill('Use tabs, not spaces');await page.locator('[data-decision-add] [type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('.project-decisions')?.textContent.includes('Use tabs, not spaces'));
    await capture('approved');
    assert.deepEqual(errors,[]);reports.push({profile:name,emulated:name!=='pc',engine:browser.version(),captures,violations});await browser.close();browser=null;console.log('PASS '+name+' decisions');
  }
  fs.writeFileSync(path.join(out,'visual-checks.json'),JSON.stringify(reports,null,2));assert.ok(reports.every(x=>!x.violations.length),'Review accessibility findings: '+JSON.stringify(reports.map(x=>x.violations)));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
