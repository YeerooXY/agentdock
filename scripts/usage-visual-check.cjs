'use strict';
// Isolated renderer checks. Run test:desktop first to create the synthetic base.
const { chromium, webkit, devices } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'artifacts/usage-remaining');
fs.mkdirSync(out, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json')));
const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  const file = pathname === '/_axe.js' ? require.resolve('axe-core/axe.min.js') : path.join(root, 'dist', pathname === '/' ? 'index.html' : pathname);
  if ((pathname !== '/_axe.js' && !file.startsWith(path.join(root, 'dist') + path.sep)) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js':'text/javascript', '.css':'text/css', '.png':'image/png' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});
const profiles = [
  ['pc', chromium, { viewport: { width:1440, height:1000 } }],
  ['mac', webkit, { ...devices['Desktop Safari'], viewport: { width:1440, height:1000 } }],
  ['android', chromium, { ...devices['Pixel 7'] }],
  ['iphone', webkit, { ...devices['iPhone 13'] }],
];
const reports = []; let browser;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  for (const [name, engine, options] of profiles) {
    browser = await engine.launch(); const context = await browser.newContext(options), state = structuredClone(base), errors = [], external = [];
    state.mode = 'dashboard'; state.settings.setupComplete = true; state.settings.sidebarCollapsed = false;
    state.limits = [
      { id:'codex:account', provider:'codex', name:'Codex', observedAt:Date.now(), source:'Synthetic fixture', windows:[
        { minutes:300, usedPercent:38, resetsAt:Date.now()+3600000 },
        { minutes:10080, usedPercent:0, resetsAt:Date.now()+86400000 },
      ]},
      { id:'claude:account', provider:'claude', name:'Claude', observedAt:Date.now()-1800000, source:'Synthetic fixture', windows:[
        { minutes:300, usedPercent:100, resetsAt:Date.now()-3600000 },
        { minutes:10080, usedPercent:null, resetsAt:null },
      ]},
    ];
    state.ledger = [];
    await context.exposeFunction('fixtureCall', method => ({ ok:true, value: method === 'state' ? state : method === 'session.buffer' ? { data:'', sequence:0 } : [] }));
    await context.addInitScript(() => { window.dock = { call:(m,p)=>window.fixtureCall(m,p), onState:fn=>window.fixtureState=fn, onOutput:()=>{}, onSelect:()=>{} }; });
    const page = await context.newPage(); page.on('pageerror', e=>errors.push(e.message));
    page.on('request', req=>{if(!req.url().startsWith('http://127.0.0.1:')&&!req.url().startsWith('data:'))external.push(req.url());});
    await page.goto(`http://127.0.0.1:${server.address().port}`); await page.locator('[data-page=usage]').click();
    await page.locator('.quota-card').first().waitFor();
    assert.deepEqual(await page.locator('.quota-window strong').allTextContents(), ['62% left','100% left','0% left','Unknown']);
    assert.deepEqual(await page.locator('.meter').evaluateAll(nodes=>nodes.map(x=>x.getAttribute('aria-valuenow'))), ['62','100','0',null]);
    assert.equal(await page.locator('.quota-heading img').count(), 1);
    assert.ok(await page.locator('.quota-heading img').evaluate(img=>img.complete&&img.naturalWidth>0));
    await page.evaluate(async()=>{await document.fonts.ready;document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).forEach(a=>a.finish());await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    await page.addScriptTag({ url:'/_axe.js' });
    const axe = await page.evaluate(async()=> (await window.axe.run(document,{runOnly:['color-contrast','button-name','image-alt','aria-progressbar-name']})).violations.map(x=>({id:x.id,targets:x.nodes.map(n=>n.target)})));
    assert.deepEqual(axe, [], name+' accessibility checks');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.querySelector('#content').scrollWidth>document.querySelector('#content').clientWidth+1), false, name+' overflow');
    await page.screenshot({ path:path.join(out,name+'-usage.png') });
    await page.locator('.sidebar nav [data-page=consoles]').focus(); await page.keyboard.press('Enter');
    await page.locator('.session-grid').waitFor();
    await page.locator('[data-page=usage]').focus(); await page.keyboard.press('Enter'); await page.locator('.quota-card').first().waitFor();
    state.limits[0].windows[0].usedPercent=90.5;
    state.limits[0].windows[1].usedPercent=-1;
    state.limits[1].windows[0].usedPercent=101;
    await page.evaluate(s=>window.fixtureState(s),state);
    assert.deepEqual(await page.locator('.quota-window strong').allTextContents(),['9.5% left','Unknown','Unknown','Unknown']);
    const providers = require('../electron/cli-catalog.cjs').catalog.map(x=>x.id);
    state.limits = providers.map(provider=>({id:provider,provider,name:provider,observedAt:Date.now(),source:'Synthetic fixture',windows:[{minutes:300,usedPercent:25}]}));
    await page.evaluate(s=>window.fixtureState(s),state);
    assert.equal(await page.locator('.quota-card').count(),providers.length);
    assert.equal(await page.locator('.quota-heading img').count(),4);
    await page.waitForFunction(()=>[...document.querySelectorAll('.quota-heading img')].every(i=>i.complete&&i.naturalWidth>0));
    await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).forEach(a=>a.finish()));
    await page.screenshot({ path:path.join(out,name+'-providers.png') });
    state.limits=[]; await page.evaluate(s=>window.fixtureState(s),state);
    assert.equal(await page.locator('.meter').count(),0);
    if (name === 'pc' || name === 'mac') {
      state.limits=['codex','claude'].map(provider=>({id:provider+':account',provider,observedAt:Date.now(),windows:[{minutes:300,usedPercent:38},{minutes:10080,usedPercent:null}]}));
      state.mode='hud'; await page.setViewportSize({width:360,height:450});
      await page.evaluate(s=>window.fixtureState(s),state); await page.locator('#hud').waitFor();
      assert.match(await page.locator('.hud-usage').innerText(),/62% left/);
      assert.match(await page.locator('.hud-usage').innerText(),/Unknown/);
      await page.evaluate(()=>document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).forEach(a=>a.finish()));
      assert.equal(await page.locator('.hud-usage').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
      await page.screenshot({path:path.join(out,name+'-hud.png')});
    }
    assert.deepEqual(errors,[],name+' page errors'); assert.deepEqual(external,[],name+' no external logo requests');
    reports.push({profile:name,checks:['remaining values and bars','unknown and invalid values','low balance','local provider icons','keyboard navigation','empty readings','selected axe checks','no overflow','no external requests'],emulated:name!=='pc'});
    await browser.close(); browser=null;
  }
  fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(reports,null,2));
  console.log('PASS: remaining allowance and provider identities on PC Chromium, Mac WebKit, Android Chromium and iPhone WebKit profiles.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
