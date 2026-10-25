'use strict';
const { openPage } = require('./ui-navigation.cjs');
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname,'..'), parent=path.join(root,'test-data');
fs.mkdirSync(parent,{recursive:true}); const work=fs.mkdtempSync(path.join(parent,'workbench-desktop-')), profile=path.join(work,'profile'), project=path.join(work,'project');
fs.mkdirSync(profile); fs.mkdirSync(project); fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({setupComplete:true,restoreConsoles:true,consoleDefaults:{provider:'shell',cwd:project,name:'',command:''}}));
let app, server;
const executablePath = process.argv.find(arg => arg.startsWith('--app='))?.slice(6);
async function eventually(check, message='Timed out') {const end=Date.now()+45000; while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw Error(message);}
(async()=>{
  server=http.createServer((req,res)=>{
    if(req.url==='/missing'){res.writeHead(404);return res.end();}
    if(req.url==='/image.png'){res.setHeader('Content-Type','image/png');return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZDbkAAAAASUVORK5CYII=','base64'));}
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><title>Fixture workshop</title></head><body style="background:#080612;color:#eee;font:22px sans-serif;padding:40px"><main><h1>Review fixture</h1><p>A deliberately flawed page for the review test.</p><img src="/image.png" style="width:180px;height:100px"><div style="width:700px">This fixed width overflows a phone.</div><a href="/missing">Broken link</a><button style="color:#ddd;background:#eee">Low contrast</button></main></body></html>');
  }); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const errors=[];
  app=await electron.launch({ ...(executablePath ? { executablePath } : {}), args:[...(executablePath ? [] : [root]),'--smoke-test',`--data-dir=${profile}`],timeout:30000}); const page=await app.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.session-grid');
  const capture = async filename => { await page.waitForFunction(() => document.querySelector('#content').getAnimations().every(x => x.playState === 'finished')); await page.screenshot({path:path.join(root,'artifacts',filename)}); };
  const call=(method,payload)=>page.evaluate(async([m,p])=>{const r=await window.dock.call(m,p);if(!r.ok)throw Error(r.error);return r.value;},[method,payload]);
  const one=await call('session.create',{slot:1,provider:'shell',cwd:project,name:'Trader'}),two=await call('session.create',{slot:9,provider:'shell',cwd:project,name:'Game'});
  await call('slot.name',{slot:1,name:'Trader',sessionId:one.id});await call('slot.name',{slot:9,name:'Game',sessionId:two.id});
  await call('session.input',{id:one.id,data:"Write-Output 'MOVE_MARKER_917'\r"});
  await eventually(async()=>(await call('session.buffer',one.id)).data.includes('MOVE_MARKER_917'));
  await page.locator(`[data-console-drag="${one.id}"]`).dragTo(page.locator('.session-card[data-slot="9"]'));
  await eventually(async()=>(await call('state')).sessions.find(x=>x.id===one.id).slot===9,'Console drag did not swap');
  let state=await call('state'); assert.equal(state.sessions.find(x=>x.id===two.id).slot,1); assert.equal(state.settings.slotNames[9],'Trader');
  await page.locator(`[data-console-drag="${one.id}"]`).focus(); await page.keyboard.press('Alt+4');
  await eventually(async()=>(await call('state')).sessions.find(x=>x.id===one.id).slot===4);
  assert.ok((await call('session.buffer',one.id)).data.includes('MOVE_MARKER_917')); assert.equal((await call('state')).sessions.filter(x=>x.alive).length,2);
  console.log('PASS console drag, occupied swap, keyboard move and terminal preservation');
  const tools=await call('tools.catalog','dock');assert.ok(tools.some(x=>x.name==='dock/save_result'));assert.ok(tools.some(x=>x.name==='dock/meshy_concept'));
  fs.mkdirSync(path.join(profile,'events'),{recursive:true});fs.writeFileSync(path.join(profile,'events',`${one.id}.${one.launchId}.state.json`),JSON.stringify({session:one.id,launchId:one.launchId,state:'ready',at:Date.now()}));
  await eventually(async()=>(await call('state')).sessions.find(x=>x.id===one.id).state==='ready');
  assert.equal(await page.locator('nav [data-page="inbox"], nav [data-page="reviews"]').count(), 0);
  assert.equal('inbox' in (await call('state')).workbench, false);
  const bridgeFile=path.join(profile,'fixture-bridge.json');
  await call('session.input',{id:one.id,data:`@{url=$env:PADDOCK_BRIDGE_URL;token=$env:PADDOCK_BRIDGE_TOKEN} | ConvertTo-Json -Compress | Set-Content -LiteralPath '${bridgeFile.replaceAll("'","''")}'\r`});
  await eventually(()=>fs.existsSync(bridgeFile));
  const grant=JSON.parse(fs.readFileSync(bridgeFile,'utf8').replace(/^\uFEFF/,''));
  async function tool(name,args={}) {
    const response=await fetch(grant.url,{method:'POST',headers:{Authorization:'Bearer '+grant.token,'Content-Type':'application/json'},body:JSON.stringify({name:'dock_call',arguments:{tool:name,arguments:args}})});
    assert.equal(response.status,200); const result=await response.json();
    if(result.isError)throw Error(result.content[0].text);
    return JSON.parse(result.content[0].text);
  }
  // Exercise the same main-process activation path as Windows notifications,
  // with a disposable profile and no visible system toast during the test.
  const notificationOut = path.join(root, 'artifacts', 'notification-routing'); fs.mkdirSync(notificationOut, { recursive: true });
  async function activateNotice(item) {
    const current = await call('state');
    await app.evaluate(async ({ BrowserWindow, app }, { item, sessions, mode }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const { DockNotifications } = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json')('./electron/notifications.cjs');
      const center = new DockNotifications({ getWindow: () => win, getSessions: () => sessions, getMode: () => mode,
        reveal: () => { win.show(); }, publish() {}, setMode: value => win.webContents.executeJavaScript('window.dock.call("mode", ' + JSON.stringify(value) + ')') });
      await center.open(item);
    }, { item, sessions: current.sessions, mode: current.mode });
  }
  const tracked = await tool('dock/start_turn');
  const saved = await tool('dock/save_result', { title: 'Completed prompt report', text: '# Completed prompt\n\nThe finished prompt opens its saved Results.', summary: 'Notification routing verified with synthetic data.', kind: 'report' });
  fs.writeFileSync(path.join(notificationOut, 'fixture.json'), JSON.stringify(await call('state')));
  const ready = await tool('dock/notify', { title: 'Finished prompt', kind: 'ready' });
  assert.equal(ready.turnId, tracked.turnId); assert.equal(ready.resultId, saved.id); assert.equal(ready.destination, 'results');
  await page.locator(`.session-card[data-console-id="${one.id}"] [data-action="toggle-console"]`).click();
  await page.locator(`.session-card.console-expanded[data-console-id="${one.id}"]`).waitFor();
  await eventually(async () => (await call('state')).mode === 'fullscreen');
  await activateNotice(ready);
  await page.locator('.wb-dialog[open] h2').filter({ hasText: 'Completed prompt report' }).waitFor();
  assert.equal((await call('state')).mode, 'dashboard'); assert.equal(await page.locator('.session-card.console-expanded').count(), 0);
  assert.equal(await page.locator('.sidebar').isVisible(), true);
  await page.screenshot({ path: path.join(notificationOut, 'windows-completed-prompt.png') });
  await page.keyboard.press('Escape');
  await call('workbench.results.delete', [saved.id]); await activateNotice(ready);
  await page.locator('#toast').filter({ hasText: 'These results are no longer available.' }).waitFor();
  assert.equal(await page.locator('.session-card.console-expanded').count(), 0);
  const question = await tool('dock/notify', { title: 'Input needed', kind: 'question' }); await activateNotice(question);
  await page.locator('.session-card.console-expanded').waitFor(); assert.equal((await call('state')).mode, 'fullscreen');
  assert.equal((await call('state')).sessions.filter(x => x.alive).length, 2);
  await page.locator('.session-card.console-expanded [data-action="toggle-console"]').click();
  console.log('PASS completion notifications open their exact Results in the dashboard; deleted Results stay out of consoles; questions preserve live console access');
  const review=await tool('dock/review_page',{url:`http://127.0.0.1:${server.address().port}`,brief:'Clearer typography and a calmer layout.'});
  await eventually(async()=>{const r=await tool('dock/review_details',{id:review.id});if(r.state==='failed')throw Error(r.error);return r.state==='complete';},'Agent website review did not finish');
  state=await call('state'); assert.equal(state.workbench.results.length,3);
  const report=await tool('dock/review_details',{id:review.id}); assert.equal(report.report.views.length,2); assert.equal(report.report.views[1].page.horizontalOverflow,true);assert.ok(report.report.views[0].accessibility.violations.some(x=>x.id==='image-alt'));assert.ok(report.report.links.some(x=>x.status===404));assert.ok(report.checks.every(x=>x.status==='unreviewed'));
  assert.equal(report.screenshots.length,2); assert.equal((await tool('dock/list_reviews'))[0].id,review.id);
  await tool('dock/review_check',{id:review.id,index:0,status:'needs-work',note:'Owner needs to confirm data collection.'});
  assert.equal((await tool('dock/review_details',{id:review.id})).checks[0].status,'needs-work');
  const reportResult=state.workbench.results.find(x=>x.kind==='review');const preview=await call('workbench.results.preview',reportResult.id);assert.equal(JSON.parse(preview.text).checklist[0].status,'needs-work');
  await assert.rejects(tool('dock/meshy_concept',{reviewId:review.id,nativeStatus:'failed'}),/Paid generation is disabled during tests/);
  assert.equal((await call('state')).workbench.concepts.length,0);
  await openPage(page, 'results'); await page.locator('.result-card').first().waitFor();
  await eventually(async()=>page.locator('.result-image img').evaluateAll(xs=>xs.length===1&&xs.every(x=>x.complete&&x.naturalWidth>0)));
  assert.ok(await page.locator('.result-image img').evaluateAll(xs=>xs.every(x=>x.naturalWidth<=360&&x.naturalHeight<=400)),'Gallery loads bounded thumbnails');
  await capture('test-results.png');
  const screenshot=state.workbench.results.find(x=>x.kind==='screenshot');await page.locator(`[data-wb="preview"][data-id="${screenshot.id}"]`).first().click();await page.locator('[data-wb="delete-one"]').click();await eventually(async()=>(await call('state')).workbench.results.length===2);
  await page.locator('.wb-dialog [data-wb=close]').click();
  await page.reload();await page.waitForSelector('.session-grid');assert.equal((await call('state')).workbench.results.length,2);assert.equal((await tool('dock/review_details',{id:review.id})).checks[0].status,'needs-work');
  await tool('dock/delete_review',{id:review.id});assert.equal((await call('state')).workbench.results.length,0);assert.equal((await tool('dock/list_reviews')).length,0);
  assert.equal(fs.existsSync(path.join(profile,'inbox.json')),false);
  assert.deepEqual(errors,[]); console.log('PASS gallery previews/deletion, agent-only review/checklist/delete tools, removed tabs/storage, and paid-call guard');
  await call('quit'); await app.close(); app=null;
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(app){await (await app.firstWindow()).evaluate(()=>window.dock.call('quit')).catch(()=>{});await app.close().catch(()=>{});}if(server)server.closeAllConnections?.();if(server)await new Promise(r=>server.close(r));assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(parent));fs.rmSync(work,{recursive:true,force:true});});
