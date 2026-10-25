'use strict';
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const repo='YeerooXY/agentdock', api='https://api.github.com/repos/'+repo+'/releases?per_page=30';
function version(value) {
  const m=/^v?(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?$/.exec(value || '');
  return m ? [+m[1],+m[2],+m[3],m[4] ? 0 : 1,m[4] || '',+(m[5] || 0)] : null;
}
function newer(a,b) { const x=version(a),y=version(b); if(!x||!y)return false; for(let i=0;i<x.length;i++){if(x[i]!==y[i])return x[i]>y[i];}return false; }
// The release file for this system, as named by electron-builder.cjs.
function releaseAsset(platform=process.platform,arch=process.arch){return platform==='win32'?'Setup-x64.exe':platform==='darwin'?`Mac-${arch}.dmg`:`Linux-${arch}.AppImage`;}
function selectRelease(releases,current,platform='Setup-x64.exe') {
  const preview=current.includes('-');
  return releases.filter(r=>!r.draft && (preview || !r.prerelease) && version(r.tag_name) && newer(r.tag_name,current)).sort((a,b)=>newer(a.tag_name,b.tag_name)?-1:1).map(r=>{
    // Releases before the rename were named Agent-Dock-*.
    const v=r.tag_name.replace(/^v/,''), asset=['Paddock','Agent-Dock'].map(p=>r.assets?.find(a=>a.name===`${p}-${v}-${platform}`)).find(Boolean), name=asset?.name || `Paddock-${v}-${platform}`;
    const url=`https://github.com/${repo}/releases/download/${r.tag_name}/${name}`;
    if(!asset || asset.browser_download_url!==url || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '') || !Number.isSafeInteger(asset.size) || asset.size<1 || asset.size>500*1024*1024)return null;
    return {version:v,url:`https://github.com/${repo}/releases/tag/${r.tag_name}`,downloadUrl:url,name,size:asset.size,sha256:asset.digest.slice(7),publishedAt:r.published_at};
  }).find(Boolean) || null;
}
const hashFile=file=>new Promise((resolve,reject)=>{const hash=crypto.createHash('sha256'),stream=fs.createReadStream(file);stream.on('error',reject);stream.on('data',x=>hash.update(x));stream.on('end',()=>resolve(hash.digest('hex')));});
class Updates {
  constructor(root,current,{fetcher=fetch,onChange=()=>{},asset=releaseAsset()}={}) { this.root=path.join(root,'updates');this.current=current;this.fetcher=fetcher;this.onChange=onChange;this.asset=asset;this.state={current,checking:false,downloading:false,progress:0,checkedAt:null,release:null,error:'',downloaded:false}; }
  snapshot(){return {...this.state};}
  change(patch){Object.assign(this.state,patch);this.onChange();}
  async check(){
    if(this.state.checking||this.state.downloading)return this.snapshot();this.change({checking:true,error:''});
    try{
      const response=await this.fetcher(api,{headers:{Accept:'application/vnd.github+json','User-Agent':'Agent-Dock'},redirect:'error',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error(response.status===403||response.status===429?'Update checks are temporarily limited. Try again later.':'Could not check GitHub releases. Try again.');
      const releases=await response.json();if(!Array.isArray(releases))throw Error('The release list could not be read.');
      const release=selectRelease(releases,this.current,this.asset),same=this.state.release?.version===release?.version;
      this.change({release,checkedAt:Date.now(),downloaded:same&&this.state.downloaded});
    }catch(error){this.change({error:error.message});}
    finally{this.change({checking:false});}return this.snapshot();
  }
  async download(){
    if(this.state.downloading||this.state.checking)throw Error('Wait for the update check or download to finish.');
    const release=this.state.release;if(!release)throw Error('Check for updates first.');
    fs.mkdirSync(this.root,{recursive:true});const target=path.join(this.root,release.name),partial=target+'.partial';
    this.change({downloading:true,downloaded:false,error:'',progress:0});let fd;
    try{
      if(fs.existsSync(target)&&await hashFile(target)===release.sha256){this.file=target;this.change({downloaded:true,progress:100});return this.snapshot();}
      const response=await this.fetcher(release.downloadUrl,{signal:AbortSignal.timeout(600000)});
      if(!response.ok)throw Error('The update could not be downloaded. Try again.');
      if(response.url){const url=new URL(response.url);if(url.protocol!=='https:'||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname))throw Error('Unexpected update download host.');}
      fd=fs.openSync(partial,'w',0o600);let count=0,progress=0;const hash=crypto.createHash('sha256');
      for await(const chunk of response.body){count+=chunk.length;if(count>release.size)throw Error('Update size did not match the release.');fs.writeSync(fd,chunk);hash.update(chunk);const next=Math.floor(count/release.size*100);if(next!==progress){progress=next;this.change({progress});}}
      fs.closeSync(fd);fd=undefined;if(count!==release.size||hash.digest('hex')!==release.sha256)throw Error('Update verification failed. Download it again.');
      fs.renameSync(partial,target);this.file=target;this.change({downloaded:true,progress:100});
    }catch(error){this.change({error:error.message});throw error;}
    finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(partial))fs.unlinkSync(partial);this.change({downloading:false});}return this.snapshot();
  }
  async verifiedFile(){if(!this.state.downloaded||!this.file||await hashFile(this.file)!==this.state.release?.sha256)throw Error('Download and verify the update first.');return this.file;}
}
module.exports={Updates,newer,selectRelease,releaseAsset};
