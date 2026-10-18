'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), https = require('node:https'), net = require('node:net'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), parent = path.join(root, 'test-data'), out = path.join(root, 'artifacts/pairing-check');
fs.mkdirSync(parent, { recursive: true }); fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(parent, 'pairing-'));
fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ setupComplete: true, restoreConsoles: false }));
let app;
(async () => {
  const reserve = net.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r)); const port = reserve.address().port; await new Promise(r => reserve.close(r));
  app = await electron.launch({ args: [root, '--smoke-test', `--data-dir=${profile}`] });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000); await page.locator('.session-grid').waitFor();
  const call = (method, payload) => page.evaluate(async ([m,p]) => { const r = await window.dock.call(m,p); if (!r.ok) throw Error(r.error); return r.value; }, [method,payload]);
  const request = (route, auth, body) => new Promise((resolve,reject) => { const req = https.request({ hostname:'127.0.0.1', port, path:route, method:'POST', rejectUnauthorized:false, agent:false, headers:{ Authorization:'Bearer '+auth } }, res => { let s=''; res.on('data',x=>s+=x); res.on('end',()=>resolve({status:res.statusCode, data:JSON.parse(s)})); }); req.on('error',reject); req.end(JSON.stringify(body)); });
  await call('mobile.configure', { enabled: true, host:'127.0.0.1', port });
  await page.locator('[data-page=settings]').click(); await page.locator('[data-mobile=open]').click(); await page.locator('[data-mobile=step][data-step="2"]').click();
  for (const allow of [false,true]) {
    const invite = JSON.parse(Buffer.from((await call('mobile.invite')).code.slice(10), 'base64url')), key = crypto.randomBytes(32).toString('base64url');
    const pending = await request('/v1/pair', invite.secret, { approval:true, requestKey:key, name:'Test Android' }); assert.equal(pending.status,202);
    await page.locator('.mobile-match-code').waitFor();
    assert.equal((await page.locator('.mobile-match-code').innerText()).replaceAll(' ',''), pending.data.code);
    assert.equal((await call('mobile.status')).devices.length,0);
    assert.equal((await request('/v1/pair/status',key,{id:pending.data.id})).status,202);
    if (allow) await page.screenshot({ path:path.join(out,'windows-approval.png') });
    const button = page.locator(`[data-mobile=${allow ? 'approve' : 'deny'}]`); await button.focus(); await page.keyboard.press('Enter');
    const result = await request('/v1/pair/status',key,{id:pending.data.id}); assert.equal(result.status,allow?200:403);
    assert.equal((await call('mobile.status')).devices.length,allow?1:0);
    if (allow) { await page.locator('[data-mobile=revoke]').click(); assert.equal((await call('mobile.status')).devices.length,0); }
  }
  fs.writeFileSync(path.join(out,'desktop-check.json'),JSON.stringify({passed:true, checks:['actual HTTPS request waits without access','matching PC code','keyboard Deny refuses credentials','keyboard Allow issues credentials','revoke removes paired device']},null,2));
  await call('quit'); await app.close(); app=null;
  console.log('PASS desktop phone approval, denial and revocation');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{ await app?.close().catch(()=>{}); assert.equal(path.dirname(fs.realpathSync(profile)),fs.realpathSync(parent)); fs.rmSync(profile,{recursive:true,force:true}); });
