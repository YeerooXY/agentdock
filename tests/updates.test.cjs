'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path'), crypto=require('node:crypto');
const {Updates,newer,selectRelease}=require('../electron/updates.cjs');
const data=Buffer.from('fixture installer only'), digest=crypto.createHash('sha256').update(data).digest('hex');
const release=(v,extra={})=>({tag_name:'v'+v,prerelease:v.includes('-'),draft:false,assets:[{name:`Agent-Dock-${v}-Setup-x64.exe`,browser_download_url:`https://github.com/YeerooXY/agentdock/releases/download/v${v}/Agent-Dock-${v}-Setup-x64.exe`,size:data.length,digest:'sha256:'+digest}],...extra});
test('updates compare semantic versions, keep stable users off previews and require a matching official asset',()=>{
  assert.ok(newer('0.6.0-preview.10','0.6.0-preview.9'));assert.ok(newer('0.6.0','0.6.0-preview.10'));assert.ok(!newer('0.6.0-preview.10','0.6.0'));
  assert.equal(selectRelease([release('0.7.0-preview.1'),release('0.6.1')],'0.6.0').version,'0.6.1');
  assert.equal(selectRelease([release('0.6.0-preview.5')],'0.6.0-preview.4').version,'0.6.0-preview.5');
  const bad=release('0.7.0');bad.assets[0].browser_download_url='https://example.com/untrusted.exe';assert.equal(selectRelease([bad],'0.6.0'),null);
  bad.assets[0].browser_download_url='https://github.com/YeerooXY/agentdock/releases/download/v0.7.0/Agent-Dock-0.7.0-Setup-x64.exe';delete bad.assets[0].digest;assert.equal(selectRelease([bad],'0.6.0'),null);
});
test('downloads verify size and SHA-256 before installation; tampered files are rejected and checks never launch anything',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dock-update-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let invalid=false;
  const u=new Updates(root,'0.6.0-preview.4',{fetcher:async url=> url.includes('api.github.com') ? {ok:true,json:async()=>[release('0.6.0-preview.5')]} : {ok:true,url,body:(async function*(){yield invalid ? Buffer.from('invalid') : data;})()}});
  await u.check();await u.download();const file=await u.verifiedFile();assert.deepEqual(fs.readFileSync(file),data);assert.ok(u.snapshot().downloaded);
  fs.writeFileSync(file,'tampered');await assert.rejects(u.verifiedFile(),/verify/);
  invalid=true;await assert.rejects(u.download(),/verification/);assert.equal(u.snapshot().downloaded,false);assert.ok(!fs.existsSync(file+'.partial'));
});
