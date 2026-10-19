'use strict';
const { _electron: electron } = require('playwright');
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), out=path.join(root,'artifacts','projects'); fs.mkdirSync(out,{recursive:true});
const profile=fs.mkdtempSync(path.join(out,'profile-')), folder=path.join(profile,'game'), sub=path.join(folder,'src'); fs.mkdirSync(sub,{recursive:true});
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({setupComplete:true,restoreConsoles:false,consoleDefaults:{provider:'shell',cwd:folder,name:'',command:''}}));
let app;
(async()=>{
  app=await electron.launch({args:[root,'--smoke-test','--data-dir='+profile]});const page=await app.firstWindow();page.setDefaultTimeout(15000); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.session-grid');
  const call=(method,payload)=>page.evaluate(async({method,payload})=>{const r=await window.dock.call(method,payload);if(!r.ok)throw Error(r.error);return r.value;},{method,payload});
  await page.locator('[data-page=projects]').click(); await page.locator('.page-heading [data-project-new]').click();
  const form=page.locator('#project-form');await form.locator('[name=name]').fill('Robonslaught');await form.locator('[name=category]').fill('Game');await form.locator('[name=goals]').fill('Ship a playable arena');
  for(const key of ['approach','nextStep','notes','status']){assert.equal(await form.locator(`[name=${key}]`).isVisible(),false);assert.equal(await form.locator(`[name=${key}]`).isDisabled(),true);}
  await form.locator('[name=folders]').fill('Game | '+folder+'\nCode | '+sub);await form.locator('[type=submit]').click();await page.locator('#project-editor').waitFor({state:'hidden'});await page.locator('.project-card h2').filter({hasText:'Robonslaught'}).waitFor();
  await page.locator('#project-plan').waitFor(); await page.keyboard.press('Escape'); let project=(await call('state')).projects[0];assert.equal(project.goals,'Ship a playable arena');assert.equal(project.nextStep,'');assert.equal(project.approach,'');assert.deepEqual(project.milestones,[]);
  await page.locator('[data-project-edit]').click();await form.locator('[name=approach]').fill('Build a small playable prototype');await form.locator('[name=nextStep]').fill('Build the first wave');await form.locator('[name=milestones]').fill('[x] Prototype\n[ ] First wave');await form.locator('[type=submit]').click();await page.locator('#project-editor').waitFor({state:'hidden'});
  project=(await call('state')).projects[0];assert.equal(project.progress.done,1);assert.equal(project.approach,'Build a small playable prototype');assert.equal(project.nextStep,'Build the first wave');
  await page.locator('.page-heading [data-project-new]').click();assert.equal(await form.locator('[name=approach]').isVisible(),false);assert.equal(await form.locator('[name=nextStep]').inputValue(),'');await page.keyboard.press('Escape');
  for (const [section, changes] of [['brief',{audience:'Players',success:'Finish a wave'}],['research',{purpose:'personal',evidence:'Personal prototype'}],['infrastructure',{stack:'Godot',reason:'Small game',alternative:'Unity',tradeoff:'Existing Godot skills',hosting:'Local PC',data:'Local saves',security:'Offline only',operations:'Tests and backups'}],['roadmap',{scope:'Playable arena',milestones:[{text:'Prototype',acceptance:'Runs',done:true},{text:'First wave',acceptance:'Can finish',done:false}]}]]) { project=(await call('state')).projects[0]; await call('projects.plan.review',{id:project.id,revision:project.plan.revision,section,changes,action:'approve'}); }
  await page.locator('[data-project-open]').click();await page.locator('.session-card:not(.empty)').waitFor();
  let state=await call('state');assert.equal(state.sessions[0].name,'Robonslaught');assert.equal(state.sessions[0].projectId,project.id);
  assert.match(fs.readFileSync(path.join(profile,'sessions',state.sessions[0].id,'AGENT_DOCK.md'),'utf8'),/Ship a playable arena/);
  await page.locator('.session-card.empty [data-action=new]').first().click({button:'right'});await page.locator('#console-chooser').waitFor();
  await page.locator('#one-off-console-form [name=projectId]').selectOption(project.id);await page.locator('#one-off-console-form [name=projectFolder]').selectOption(sub);
  assert.equal(await page.locator('#one-off-console-form [name=cwd]').inputValue(),sub);await page.locator('#one-off-console-form [type=submit]').click();await page.locator('#console-chooser').waitFor({state:'hidden'});
  await call('session.create',{provider:'shell',cwd:folder,name:'Third'});state=await call('state');
  for(let i=0;i<3;i++)await call('session.layout',{id:state.sessions[i].id,slot:i*3+1,width:3,height:1});
  await page.locator('#grid-add').waitFor();await page.locator('#grid-add').click();await page.waitForFunction(()=>document.querySelectorAll('.session-card:not(.empty)').length===4);
  state=await call('state');assert.equal(state.sessions.filter(x=>x.width===2).length,1);assert.equal(state.sessions.length,4);
  await call('grid.configure',{columns:4,rows:4});await page.waitForFunction(()=>document.querySelectorAll('.session-card').length===16);assert.equal((await call('state')).grid.columns,4);
  await page.screenshot({path:path.join(out,'desktop-grid.png')});
  await page.locator('[data-page=projects]').click();await page.locator('.project-milestones summary').click();await page.locator('[data-project-milestone="1"]').check();await page.waitForFunction(()=>document.querySelector('.project-progress').textContent.includes('2 / 2'));assert.equal((await call('state')).projects[0].progress.done,2);
  await page.screenshot({path:path.join(out,'desktop-projects.png')});
  state=await call('state');fs.writeFileSync(path.join(out,'fixture.json'),JSON.stringify(state,null,2));
  assert.deepEqual(errors,[]);await call('projects.remove',project.id);assert.equal(fs.existsSync(sub),true);assert.equal((await call('state')).sessions.length,4);
  console.log('PASS: project creation, progress, scoped agent brief, subfolder console, automatic panel shrink, larger grid and metadata-only deletion.');
  await call('quit');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await app?.close().catch(()=>{});});
