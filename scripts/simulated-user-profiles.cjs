'use strict';
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { openPage } = require('./ui-navigation.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts/simulated-users'), dist = path.join(root, 'dist');
const fresh = JSON.parse(fs.readFileSync(path.join(out, 'first-state.json'))), ready = JSON.parse(fs.readFileSync(path.join(out, 'fixture.json')));
const profiles = [['pc',chromium,{viewport:{width:1440,height:1000}}],['mac',webkit,{...devices['Desktop Safari'],viewport:{width:1440,height:1000}}],['android',chromium,devices['Pixel 7']],['iphone',webkit,devices['iPhone 13']]];
const server = http.createServer((req,res) => {
  const name=req.url.split('?')[0],file=name==='/axe.js'?require.resolve('axe-core/axe.min.js'):path.join(dist,name==='/'?'index.html':name);
  if ((name!=='/axe.js'&&!file.startsWith(dist+path.sep))||!fs.existsSync(file)) {res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'text/html');fs.createReadStream(file).pipe(res);
});
const checks=[];let browser;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  for(const [name,engine,options]of profiles){
    browser=await engine.launch();const context=await browser.newContext(options),errors=[],captures=[];let state=structuredClone(fresh);
    await context.route('https://**',route=>route.abort());
    await context.exposeFunction('fixtureCall',async(method,payload)=>{
      if(method==='state')return{ok:true,value:state};
      if(method==='session.buffer')return{ok:true,value:{data:'',sequence:0}};
      if(method==='session.models')return{ok:true,value:[]};
      if(method==='workbench.results.preview')return{ok:true,value:{text:'# Website check\n\nSynthetic saved result for the walkthrough.'}};
      if(method==='settings')Object.assign(state.settings,payload);
      return{ok:true};
    });
    await context.addInitScript(()=>{window.dock={call:(m,p)=>window.fixtureCall(m,p),onState:fn=>window.fixtureState=fn,onOutput(){},onSelect(){},onNotice:fn=>window.fixtureNotice=fn};});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const url=`http://127.0.0.1:${server.address().port}`;
    async function capture(view){
      await page.evaluate(async()=>{await document.fonts.ready;for(const a of document.getAnimations())if(a.effect?.getTiming().iterations!==Infinity)a.finish();});
      const file=`${name}-${view}.png`;await page.screenshot({path:path.join(out,file)});
      const audit=await page.evaluate(async()=>{const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});
      const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,viewport:{width:innerWidth,height:innerHeight}}));
      captures.push({view,file,...metrics,violations:audit});
    }
    await page.goto(url);await page.locator('#first-run[open]').waitFor();await page.addScriptTag({url:'/axe.js'});await capture('first-use');
    state=structuredClone(ready);state.settings.sidebarCollapsed=false;state.mode='dashboard';
    await page.reload();await page.locator('.session-grid').waitFor();await page.addScriptTag({url:'/axe.js'});
    await openPage(page,'projects');await page.locator('[data-project-new]').first().click();await capture('new-project');await page.keyboard.press('Escape');
    await openPage(page,'usage');await capture('usage');
    await openPage(page,'vault');await capture('keys');
    await openPage(page,'devices');await page.locator('[data-mobile=open]').click();await capture('phone-setup');await page.keyboard.press('Escape');
    await openPage(page,'results');await capture('results');
    checks.push({profile:name,engine:browser.version(),emulated:name!=='pc',method:'Actual renderer with isolated replay data; not native Mac/iOS/Android',captures,pageErrors:errors});
    await browser.close();browser=null;console.log(name+': '+captures.length+' captured states, '+captures.reduce((n,c)=>n+c.violations.length,0)+' automated findings, '+errors.length+' page errors');
  }
  fs.writeFileSync(path.join(out,'profiles.json'),JSON.stringify(checks,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
