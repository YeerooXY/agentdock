'use strict';
const { _electron: electron, chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { Projects } = require('../electron/projects.cjs');
const { MessageUsage, quotaChange } = require('../electron/message-usage.cjs');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data'), artifacts = path.join(root, 'artifacts', 'shell-project');
fs.mkdirSync(parent, { recursive:true }); fs.mkdirSync(artifacts, { recursive:true });
const profile = fs.mkdtempSync(path.join(parent, 'shell-project-'));
const projects = new Projects(profile);
const game = projects.save({ name:'Game prototype', color:'#f19cda', goals:'Finish the playable prototype', folders:[{path:root}] });
const site = projects.save({ name:'Portfolio', color:'#89b4ff', goals:'Publish the portfolio', folders:[{path:root}] });
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete:true, suggestProjects:false, sidebarCollapsed:false, consoleDefaults:{provider:'shell',cwd:root,name:'',command:''} }));
const now = Date.now(), reset = now + 7200000, usage = new MessageUsage(profile);
const windows = n => [{minutes:300,resetsAt:reset,usedPercent:n},{minutes:10080,resetsAt:reset+604800000,usedPercent:n}];
for (const [i,p] of [game,site,game].entries()) usage.record({id:'fixture-'+i,provider:i===1?'claude':'codex',name:p.name,projectId:p.id,projectName:p.name},[{id:'turn',at:now-i*60000,usage:{input:1400,output:300,total:1700,cached:800},quota:quotaChange(windows(10),windows(i===2?10:12)),status:'completed',model:'Verification fixture'}]);
let app, server;
const checks = [], errors = [];
async function screenshot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; for(const a of document.getAnimations()) if(a.effect?.getTiming().iterations !== Infinity) a.finish(); });
  await page.screenshot({ path:path.join(artifacts,name+'.png') });
}
(async () => {
  app = await electron.launch({ args:[root,'--smoke-test',`--data-dir=${profile}`],timeout:30000 });
  const native = await app.firstWindow();
  await native.waitForSelector('.session-grid');
  const invoke = (method,payload) => native.evaluate(async ([m,p]) => { const r=await window.dock.call(m,p); if(!r.ok)throw Error(r.error);return r.value; },[method,payload]);
  const state = await invoke('state');
  assert.equal(state.projects.find(x=>x.id===game.id).color,'#f19cda');
  const first = await invoke('session.create',{provider:'shell',cwd:root,name:'First',projectId:game.id});
  const second = await invoke('session.create',{provider:'shell',cwd:root,name:'Second',projectId:site.id});
  await native.getByRole('button',{name:'Close console 1',exact:true}).click();
  const deadline = Date.now()+10000;
  while ((await invoke('state')).sessions.find(s=>s.id===first.id)?.alive && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal((await invoke('state')).sessions.find(x=>x.id===first.id).alive,false,JSON.stringify({first,second,sessions:(await invoke('state')).sessions.map(s=>({id:s.id,alive:s.alive,slot:s.slot}))}));
  assert.equal((await invoke('state')).sessions.find(x=>x.id===second.id).alive,true);
  checks.push('Real Windows shell: header Close ends only the clicked console; another shell remains alive.');
  await app.close(); app=null;
  state.sessions = [{id:'fixture-codex',slot:1,name:game.name,provider:'codex',projectId:game.id,cwd:root,alive:true,state:'ready',cols:90,rows:25,width:1,height:1}, {id:'fixture-claude',slot:2,name:site.name,provider:'claude',projectId:site.id,cwd:root,alive:true,state:'open',cols:90,rows:25,width:1,height:1}];
  state.settings.sidebarCollapsed=true;
  const dist=path.join(root,'dist');
  server=http.createServer((req,res)=>{
    let file;try{file=path.resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400);res.end();return;}
    if(file===dist)file=path.join(dist,'index.html');
    if(!file.startsWith(dist+path.sep)){res.writeHead(403);res.end();return;}
    fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);res.end();return;}const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const profiles=[['windows-chromium',chromium,{viewport:{width:1440,height:960}}],['mac-safari-emulated',webkit,{viewport:{width:1440,height:960}}],['android-chrome-emulated',chromium,{...devices['Pixel 7']}],['iphone-safari-emulated',webkit,{...devices['iPhone 13']}]];
  for(const [name,engine,options] of profiles){
    const browser=await engine.launch({headless:true});
    try{
      const context=await browser.newContext(options);
      await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
      await context.addInitScript(({state})=>{
        const callbacks=[],value=structuredClone(state);window.fixtureCalls=[];
        const emit=()=>callbacks.forEach(fn=>fn(structuredClone(value)));
        window.dock={onState:fn=>callbacks.push(fn),onOutput:()=>{},onSelect:()=>{},onNotice:()=>{},call:async(method,payload)=>{
          window.fixtureCalls.push({method,payload});let result;
          if(method==='state')result=value;
          else if(method==='session.buffer')result={data:'\x1b[32mVerification fixture\x1b[0m\r\nNo AI request was submitted.\r\n',sequence:1};
          else if(method==='session.models')result=[{id:'fixture-model',name:'Verification model'}];
          else if(method==='mode'){value.mode=payload;emit();}
          else if(method==='settings'){Object.assign(value.settings,payload);emit();}
          else if(method==='session.end'){value.sessions.find(s=>s.id===payload).alive=false;emit();}
          else if(method==='session.acknowledge'){value.sessions.find(s=>s.id===payload).state='open';emit();}
          else if(method==='projects.save'){const old=value.projects.find(p=>p.id===payload.id);Object.assign(old,payload);result=old;emit();}
          return{ok:true,value:structuredClone(result)};
        }};
      },{state});
      const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(name+': '+e.message));
      await page.goto(origin);
      await page.locator(".session-grid").waitFor();
      assert.equal(await page.locator("[data-page=inbox], [data-page=reviews]").count(),0);
      await page.waitForSelector('.console-grip [data-shell=claude] img');
      assert.ok(await page.locator('.console-grip [data-shell=claude] img').evaluate(img=>img.complete&&img.naturalWidth>0));
      assert.equal(await page.getByRole('button',{name:'Close console 1',exact:true}).count(),1);
      await screenshot(page,name+'-consoles');
      await page.locator('.session-card.empty[data-slot="3"] [data-action=new]').click({button:'right'});
      const chooser=page.locator('#console-chooser');await chooser.waitFor({state:'visible'});
      await chooser.locator('.shell-picker>summary').click();
      assert.equal(await chooser.locator('.shell-picker-options [data-shell=claude] img').count(),1);
      assert.equal(await chooser.locator('.shell-picker-options img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)),true);
      const b=await chooser.boundingBox();assert.ok(b.x>=-1&&b.x+b.width<=page.viewportSize().width+1,'Chooser overflows '+name);
      await screenshot(page,name+'-chooser');
      await page.evaluate(() => { window.pickerEvents=[]; const picker=document.querySelector('#console-chooser .shell-picker'); for(const kind of ['pointerdown','pointerup','click','focusin','focusout','toggle']) picker.addEventListener(kind,e=>window.pickerEvents.push({kind:e.type,tag:e.target.tagName,text:e.target.textContent.slice(0,60),open:picker.open,active:document.activeElement.tagName}),true); });
      await chooser.locator('.shell-picker-options button').filter({hasText:'Claude Code'}).click();
      assert.equal(await chooser.locator('[name=provider]').inputValue(),'claude',name+': '+JSON.stringify(await page.evaluate(()=>window.pickerEvents)));

      await chooser.locator('.shell-picker>summary').press('ArrowDown');await page.keyboard.press('Escape');
      assert.equal(await chooser.isVisible(),true);assert.equal(await chooser.locator('.shell-picker').getAttribute('open'),null);
      await chooser.locator('.shell-picker>summary').press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('Enter');
      assert.equal(await chooser.locator('[name=provider]').inputValue(),'codex');
      await chooser.locator('.shell-picker>summary').press('ArrowUp');await page.keyboard.press('End');await page.keyboard.press('Enter');
      assert.equal(await chooser.locator('[name=provider]').inputValue(),'custom');
      await chooser.getByRole('button',{name:'Cancel',exact:true}).click();
      await page.locator('#sidebar-toggle').click();await page.locator('.sidebar [data-page=projects]').click();
      await page.locator(`[data-project-edit="${game.id}"]`).click();
      const color=page.locator('#project-form [name=color]');assert.equal(await color.inputValue(),'#f19cda');
      await color.fill('#44bbcc');await screenshot(page,name+'-project-color');
      await page.locator('#project-form [type=submit]').click();
      await page.locator('.sidebar [data-page=usage]').click();
      await page.locator('[data-usage-project]').selectOption(game.id);
      assert.equal(await page.locator('[data-usage-group]').count(),1);assert.equal(await page.locator('[data-usage-group] tbody tr').count(),2);
      assert.ok((await page.locator('.message-usage').innerText()).includes('~2%'));
      assert.ok((await page.locator('.message-usage').innerText()).includes('No reported change'));
      assert.equal(await page.locator('[data-usage-group] .project-color-dot').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(68, 187, 204)');
      await screenshot(page,name+'-usage');
      await page.locator('.sidebar [data-page=tools]').click();
      const auth=page.locator('.image-auth summary'); await auth.focus(); await auth.press('Enter');
      assert.equal(await page.locator('[data-image-auth=connect]').isVisible(),true);
      await page.keyboard.press('Tab'); assert.equal(await page.locator('[data-image-auth=auth-status]').evaluate(el=>el===document.activeElement),true);
      await page.keyboard.press('Tab'); assert.equal(await page.locator('[data-image-auth=connect]').evaluate(el=>el===document.activeElement),true);
      await page.evaluate(()=>document.querySelector('#content').scrollTop=0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Tools overflows '+name);
      await screenshot(page,name+'-tools');
      checks.push(name+': local logos in headers and chooser; keyboard select/Escape; color edit; project/turn grouping; separate 5h/weekly readings; rounded zero labelled.');
      await context.close();
    }finally{await browser.close();}
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(artifacts,'verification.json'),JSON.stringify({at:new Date().toISOString(),checks,errors,note:'Synthetic data in browser profiles; no paid AI calls. Windows Electron tested separately. Safari and phone profiles are emulated, not real macOS/iOS or physical Android.'},null,2));
  console.log(checks.map(x=>'PASS '+x).join('\n'));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(app)await app.close().catch(()=>{});
  if(server)await new Promise(resolve=>server.close(resolve));
  assert.equal(path.dirname(fs.realpathSync(profile)),fs.realpathSync(parent));fs.rmSync(profile,{recursive:true,force:true});
});
