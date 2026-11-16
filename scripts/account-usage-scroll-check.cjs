'use strict';
const { installStateTransport } = require('./state-test-transport.cjs');
const {chromium,webkit,devices}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),out=path.join(root,'artifacts/account-refresh');
fs.mkdirSync(out,{recursive:true});
// Headless regression for the shipped renderer, using synthetic sessions and IPC.
// Run after npm run build: node scripts/account-usage-scroll-check.cjs
const {initialSettings}=require('../electron/settings.cjs');
const base={
  mode:'dashboard',transitioning:false,trayHidden:false,grid:{columns:1,rows:1},
  sessions:[{id:'scroll-fixture',consoleKey:'scroll-fixture',projectId:null,slot:1,width:1,height:1,name:'Codex',nameMode:'custom',cwd:'C:\\Workspace',provider:'codex',permissions:'default',launchModel:'',accountId:null,accountLabel:null,launchId:'fixture-launch',purpose:'agent',switching:false,dismissed:false,draftSupported:false,switchTargets:[],state:'open',alive:true,cols:80,rows:30,sequence:0,usage:null,createdAt:1,updatedAt:1}],
  settings:initialSettings({setupComplete:true,suggestProjects:false},'C:\\Workspace',{}),
  projects:[],agents:[],accounts:[],limits:[],recent:[],accountError:null,refreshing:false,lastRefresh:0,capabilities:{},sshHosts:[],messages:[],ledger:[],
  summary:{requests:0,tokens:0},shared:{connections:[],profiles:[],imageGeneration:{provider:'agent',previewFirst:true},instructions:''},
  workbench:{results:[],concepts:[],unreadResults:0,setupRequests:[]},vault:{available:false,entries:[]},integrations:[],toolCatalog:[],toolLimits:{},defaultFolder:'C:\\Workspace',version:'fixture',screenshot:null
};
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(dist,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'}[path.extname(file)]||'text/html');fs.createReadStream(file).pipe(res);});
const profiles=[['windows',chromium,{viewport:{width:1440,height:1000}}],['mac-emulated',webkit,{...devices['Desktop Safari'],viewport:{width:1440,height:1000}}],['android-emulated',chromium,devices['Pixel 7']],['iphone-emulated',webkit,devices['iPhone 13']]];
let browser;
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,results=[];
for(const [name,engine,options] of profiles){browser=await engine.launch();const context=await browser.newContext(options),state=structuredClone(base),errors=[],calls=[];
state.mode='dashboard';Object.assign(state.settings,{setupComplete:true,ambientMotion:false,trimStyle:'icy',usageShown:[],usageHidden:[],suggestProjects:false});state.platform=name.startsWith('mac')?'darwin':'win32';state.sessions=state.sessions.slice(0,1);const session=state.sessions[0];session.provider='codex';session.state='open';session.alive=true;session.cols=80;session.rows=30;state.grid={columns:1,rows:1};state.screenshot=null;
const windowLimit=(minutes,usedPercent,label)=>({minutes,usedPercent,label,resetsAt:Date.now()+3600000});
state.limits=[{id:'codex',accountId:'codex:default',provider:'codex',name:'Codex',source:'Codex account service',observedAt:Date.now(),windows:[windowLimit(300,0),windowLimit(10080,100)]},{id:'claude',accountId:'claude:default',provider:'claude',name:'Claude Code',source:'Claude Code account service',observedAt:Date.now(),windows:[windowLimit(300,0),windowLimit(10080,97)]},{id:'kiro',accountId:'kiro:default',provider:'kiro',name:'Kiro',source:'Kiro usage estimate',observedAt:Date.now(),windows:[windowLimit(null,44.9,'Free plan credits')]}];
state.usageAccounts=[{id:'codex:default',provider:'codex',label:'Codex',hasUsage:true},{id:'claude:default',provider:'claude',label:'Claude Code',hasUsage:true},{id:'kiro:default',provider:'kiro',label:'Kiro',hasUsage:true}];
await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
await context.exposeFunction('fixtureCall',async(method,payload)=>{calls.push({method,payload});return {ok:true,value:method==='state'?state:method==='session.buffer'?{data:Array.from({length:600},(_,i)=>'history line '+String(i).padStart(4,'0')).join('\r\n')+'\r\n',sequence:0,launchId:session.launchId||null}:[]};});
await installStateTransport(context);
await context.addInitScript(()=>{window.dock={call:(m,p)=>window.fixtureCall(m,p),get state() { return window.fixtureStateTransport; },onOutput:fn=>window.fixtureOutput=fn,onSelect:()=>{},onNotice:()=>{}};});
const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.locator('.xterm-rows').waitFor();await page.evaluate(()=>document.fonts.ready);
const positions=()=>page.locator('#sidebar [data-page],.window-actions button').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>({name:e.dataset.page||e.dataset.action,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y})));
const before=await positions();state.screenshot={name:'Fixture.png',at:Date.now(),thumb:'data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/icon.png')).toString('base64')};await page.evaluate(s=>window.fixtureState(s),state);await page.locator('#screenshot-spot').waitFor({state:'visible'});assert.deepEqual(await positions(),before,'Screenshot arrival moves navigation');
await page.locator('.titlebar').screenshot({path:path.join(out,name+'-screenshot-present.png')});
state.screenshot=null;await page.evaluate(s=>window.fixtureState(s),state);assert.deepEqual(await positions(),before,'Screenshot removal moves navigation');
await page.locator('.titlebar').screenshot({path:path.join(out,name+'-screenshot-absent.png')});
const rows=page.locator('.terminal-instance .xterm-rows');await page.waitForFunction(()=>document.querySelector('.xterm-rows')?.textContent.includes('history line 0599'));
await page.evaluate(s=>{let seq=1;window.liveOutput=setInterval(()=>window.fixtureOutput({id:s.id,launchId:s.launchId||null,sequence:seq++,data:'\r\nstream line '+seq}),25);},session);
await page.locator('.terminal-instance .xterm-screen').hover();if(name==='iphone-emulated') await page.locator('.xterm-screen').dispatchEvent('wheel',{deltaY:-650,deltaMode:0,bubbles:true,cancelable:true}); else await page.mouse.wheel(0,-650);await page.waitForTimeout(150);const first=await rows.locator(':scope > div').first().textContent();assert.match(first,/history line/,'Wheel did not expose history');await page.waitForTimeout(500);assert.equal(await rows.locator(':scope > div').first().textContent(),first,'Output forced history to bottom');
await page.screenshot({path:path.join(out,name+'-scroll-history.png')});
if(name==='iphone-emulated') await page.locator('.xterm-screen').dispatchEvent('wheel',{deltaY:100000,deltaMode:0,bubbles:true,cancelable:true}); else await page.mouse.wheel(0,100000);await page.waitForTimeout(250);assert.match(await rows.textContent(),/stream line/,'Wheel down did not return to live output');
await page.evaluate(()=>clearInterval(window.liveOutput));assert.equal(calls.some(x=>x.method==='session.input'),false,'Scrolling sent CLI input');
await page.locator('#sidebar [data-page=usage]').click();await page.locator('.quota-ring').first().waitFor();assert.equal(await page.locator('.message-usage,.image-usage').count(),0);
await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).forEach(a=>a.finish()));
const rings=await page.locator('.quota-ring').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {width:b.width,height:b.height,text:e.textContent,inside:[...e.querySelectorAll('strong,span,small')].every(n=>{const r=n.getBoundingClientRect();return r.left>=b.left+6&&r.right<=b.right-6&&r.top>=b.top+6&&r.bottom<=b.bottom-6;})};}));assert.equal(rings.length,3);for(const r of rings){assert.ok(r.width>=112);assert.equal(r.width,r.height);assert.ok(r.inside,JSON.stringify(r));}
await page.screenshot({path:path.join(out,name+'-usage.png')});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.locator('#content').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
if(name==='windows'){await page.setViewportSize({width:320,height:900});await page.screenshot({path:path.join(out,'usage-320.png')});assert.equal(await page.locator('#content').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);}
assert.deepEqual(errors,[]);results.push({profile:name,rings,scrollHistoryHeld:true,screenshotPositionsStable:true,errors});await browser.close();browser=null;console.log('PASS '+name);}
fs.writeFileSync(path.join(out,'visual-checks.json'),JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
