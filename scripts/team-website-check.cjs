'use strict';
const {chromium,webkit,devices}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../artifacts/team-website-rerun-20261101');
const first=process.argv.includes('--first'),out=path.join(root,first?'first-screen':'verification');fs.mkdirSync(out,{recursive:true});
const profiles=[['pc',chromium,{viewport:{width:1440,height:1000}}],['mac',webkit,{...devices['Desktop Safari'],viewport:{width:1440,height:1000}}],['android',chromium,devices['Pixel 7']],['iphone',webkit,devices['iPhone 13']]];
(async()=>{const records=[];for(const [name,engine,options] of(first?profiles.slice(0,1):profiles)){
 const browser=await engine.launch({headless:true});try{for(const [site,port] of [['bakery',5186],['playtime',5187]]){
  const page=await browser.newPage(options),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>requests.push(r.url()));
  const start=Date.now(),response=await page.goto(`http://127.0.0.1:${port}/`);await page.evaluate(()=>document.fonts.ready);await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode().catch(()=>{}))));
  assert.equal(response.status(),200);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  const missingTargets=await page.locator('a[href^="#"]').evaluateAll(links=>links.filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));
  const images=await page.locator('img').evaluateAll(imgs=>imgs.map(i=>({src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0})));
  await page.screenshot({path:path.join(out,`${site}-${name}.png`),fullPage:true});
  const axe=first?[]:(await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')}),await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))));
  let dialogCheck=null;if(site==='playtime'&&!first){const button=page.locator('[data-open-dialog]').first();await button.click();assert.equal(await page.locator('dialog').evaluate(d=>d.open),true);await page.screenshot({path:path.join(out,`${site}-${name}-download.png`)});await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);assert.equal(await button.evaluate(b=>b===document.activeElement),true);dialogCheck='open, unavailable copy, Escape, focus restoration';}
  let timerCheck=null;if(site==='playtime'&&!first){await page.clock.install({time:new Date('2026-11-01T12:00:00Z')});const toggle=page.locator('#timer-toggle');await toggle.click();await page.clock.fastForward(61000);assert.equal(await page.locator('#study-clock').textContent(),'03:59');await toggle.click();await page.clock.fastForward(10000);assert.equal(await page.locator('#study-clock').textContent(),'03:59');await toggle.click();await page.clock.fastForward(239000);assert.equal(await page.locator('#study-clock').textContent(),'00:00');assert.equal(await page.locator('#timer-status').textContent(),'Timer finished');await toggle.click();assert.equal(await page.locator('#study-clock').textContent(),'05:00');await page.locator('#timer-reset').click();assert.equal(await toggle.textContent(),'Start timer');timerCheck='start, wall-clock catch-up, pause, resume, completion, restart, reset';}
  const record={site,profile:name,host:process.platform,emulated:name!=='pc',elapsedMs:Date.now()-start,overflow,missingTargets,images,errors,requests,axe,dialogCheck,timerCheck};records.push(record);await page.close();
 }}finally{await browser.close();}}
 fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(records,null,2));console.log(JSON.stringify(records));
 if(records.some(r=>r.overflow||r.missingTargets.length||r.images.some(i=>!i.loaded)||r.errors.length||r.requests.length||r.axe.length))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
