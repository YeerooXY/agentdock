'use strict';
// Synthetic renderer coverage for themed page backgrounds and Tools cards.
// Run after npm run build. No CLI, account or model calls are made.
const { chromium, webkit, devices } = require('playwright');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.PADDOCK_BACKGROUNDS_OUT || path.join(root, '.build/codex-prompt-runs/2026-10-24/3/verification'));
fs.mkdirSync(out, { recursive: true });
const fixture = structuredClone(JSON.parse(fs.readFileSync(path.join(root, 'artifacts/console-layout/fixture.json'))));
const projectSeed = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/projects/fixture.json'))).projects[0];
const resultSeed = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/results-check/fixture.json'))).state.workbench.results[0];
fixture.projects = Array.from({ length: 22 }, (_, index) => ({
  ...structuredClone(projectSeed), id: `background-project-${index + 1}`,
  name: index === 0 ? 'Robonslaught' : `Background project ${index + 1}`,
}));
fixture.workbench.results = Array.from({ length: 24 }, (_, index) => ({
  ...structuredClone(resultSeed), id: `background-result-${index + 1}`,
  groupId: `background-result-group-${index + 1}`,
  title: index === 0 ? resultSeed.title : `Synthetic result ${index + 1}`,
}));
fixture.workbench.unreadResults = fixture.workbench.results.length;
fixture.ledger = Array.from({ length: 72 }, (_, index) => ({
  at: Date.now() - index * 60000, provider: index % 2 ? 'openai' : 'codex', model: 'Synthetic verification model',
  status: index % 13 === 0 ? 'failed' : 'completed', usage: { input: 900 + index * 17, output: 140 + index * 3 },
}));
fixture.summary = { ...fixture.summary, requests: 72, tokens: 90000, cost: 0, unpriced: 0, unknownUsage: 0 };
fixture.mode = 'dashboard';
fixture.settings = { ...fixture.settings, trimStyle: 'blue', themeTextures: true, starDensity: 4, ambientMotion: true };
const profiles = [
  ['windows-chromium', chromium, { viewport: { width: 1212, height: 1147 } }],
  ['mac-webkit', webkit, { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }],
  ['android-chromium', chromium, devices['Pixel 7']],
  ['iphone-webkit', webkit, devices['iPhone 13']],
];
const results = [], openBrowsers = [];
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, 'dist', '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'text/html');
  fs.createReadStream(file).pipe(res);
});

function installFixture(initial) {
  let state = initial;
  // A deterministic top-left shooting star crosses the exposed page heading
  // line box, allowing the compositor probe to measure a real comet overlap.
  Math.random = () => 0;
  window.fixtureCalls = [];
  const copy = () => structuredClone(state);
  window.dock = {
    async call(method, payload) {
      window.fixtureCalls.push([method, payload]);
      if (method === 'state') return { ok: true, value: copy() };
      if (method === 'settings') {
        if ('starDensity' in payload) payload.starDensity = Number(payload.starDensity);
        state.settings = { ...state.settings, ...payload };
        window.fixtureReceive(copy());
        return { ok: true };
      }
      if (method === 'mode') {
        state.mode = payload;
        window.fixtureReceive(copy());
        return { ok: true };
      }
      if (method === 'session.buffer') return { ok: true, value: { data: '> Synthetic terminal output for Blue texture verification.\r\n'.repeat(20), sequence: 0, launchId: state.sessions.find(session => session.id === payload)?.launchId || null } };
      return { ok: true, value: [] };
    },
    onState(fn) { window.fixtureReceive = fn; },
    onOutput() {}, onSelect() {}, onNotice() {},
  };
  const frames = new WeakMap();
  const proto = CanvasRenderingContext2D.prototype;
  const clear = proto.clearRect, draw = proto.drawImage, fill = proto.fillRect, arc = proto.arc, paint = proto.fill, stroke = proto.stroke;
  proto.clearRect = function (...args) {
    if (this.canvas.matches('.panel-sky')) {
      const value = frames.get(this.canvas) || { frames: 0, particles: 0, cometHeads: 0, cometTrails: 0 };
      frames.set(this.canvas, { ...value, frames: value.frames + 1, particles: 0 });
    }
    return clear.apply(this, args);
  };
  proto.arc = function (x, y, radius, ...args) {
    if (this.canvas.matches('.panel-sky')) this.__paddockSkyArc = { x, y, radius };
    return arc.call(this, x, y, radius, ...args);
  };
  proto.fill = function (...args) {
    if (this.canvas.matches('.panel-sky') && this.__paddockSkyArc?.radius === 2.5 && this.fillStyle === '#ffffff') {
      const value = frames.get(this.canvas) || { frames: 0, particles: 0, cometHeads: 0, cometTrails: 0 };
      const cometPoints=[...(value.cometPoints||[]),{...this.__paddockSkyArc,at:performance.now()}].slice(-12);
      frames.set(this.canvas, { ...value, cometHeads: value.cometHeads + 1, cometPoints });
    }
    return paint.apply(this, args);
  };
  proto.stroke = function (...args) {
    if (this.canvas.matches('.panel-sky') && this.lineWidth >= 2) {
      const value = frames.get(this.canvas) || { frames: 0, particles: 0, cometHeads: 0, cometTrails: 0 };
      frames.set(this.canvas, { ...value, cometTrails: value.cometTrails + 1 });
    }
    return stroke.apply(this, args);
  };
  for (const [name, original] of [['drawImage', draw], ['fillRect', fill]]) {
    proto[name] = function (...args) {
      if (this.canvas.matches('.panel-sky')) {
        const value = frames.get(this.canvas) || { frames: 0, particles: 0, cometHeads: 0, cometTrails: 0 };
        frames.set(this.canvas, { ...value, particles: value.particles + 1 });
      }
      return original.apply(this, args);
    };
  }
  window.skySnapshot = () => [...document.querySelectorAll('.panel-sky')].map(canvas => {
    const host=canvas.parentElement, visible=canvas.offsetParent!==null && getComputedStyle(host).visibility!=='hidden', r=canvas.getBoundingClientRect();
    return {host:host.id||host.className,visible,canvasRect:{left:r.left,top:r.top,width:r.width,height:r.height},...(frames.get(canvas)||{frames:0,particles:0,cometHeads:0,cometTrails:0,cometPoints:[]})};
  });
}

function overlap(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
function assertAlignedRows(items, name) {
  const rows = new Map();
  for (const item of items) {
    const key = Math.round(item.card.top);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(item.action.bottom);
  }
  for (const actions of rows.values()) if (actions.length > 1) {
    assert.ok(Math.max(...actions) - Math.min(...actions) <= 2, `${name}: adjacent primary actions align`);
  }
}
async function assertNoOverflow(page, name) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    content: document.querySelector('#content').scrollWidth,
    contentClient: document.querySelector('#content').clientWidth,
  }));
  assert.ok(sizes.document <= sizes.viewport + 1, `${name}: document overflow ${JSON.stringify(sizes)}`);
  assert.ok(sizes.content <= sizes.contentClient + 1, `${name}: content overflow ${JSON.stringify(sizes)}`);
  return sizes;
}
function luminance(rgb) {
  const [r,g,b] = rgb.map(value => value / 255 <= .04045 ? value / 3294.6 : ((value / 255 + .055) / 1.055) ** 2.4);
  return .2126*r + .7152*g + .0722*b;
}
async function sampleCompositeContrast(page, profile, view, position, captures) {
  const areas = await page.evaluate(async () => {
    const content = document.querySelector('#content'), sidebar = document.querySelector('#sidebar');
    const selectors = '#content h1,#content h2,#content h3,#content p,#content small,#content th,#content td,#content time,#content .eyebrow,#content .stat>span,#content .stat-description,#content .section-note,#content .ledger-foot,#content .response-foot,#content .field-hint,#content .small-label,#sidebar .local-note';
    const roots = new Set([content,sidebar]);
    const targets = [...document.querySelectorAll(selectors)].filter(el => {
      if (!el.textContent.trim() || !el.getClientRects().length) return false;
      for (let node=el; node && roots.has(node)===false; node=node.parentElement) {
        if (node.matches('.surface,.integration-card,.tool-card,.quota-card,.result-card,.empty-ledger,.saved-key,.settings-rail,.selected')) return false;
        const background=getComputedStyle(node).backgroundColor;
        const alpha=background.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/i) || background.match(/^rgb\([^/]+\/\s*([\d.]+)\s*\)$/i);
        const opacity=alpha ? Number(alpha[1]) : /^rgb\(/i.test(background) ? 1 : 0;
        if (opacity >= .98) return false;
      }
      return true;
    });
    const samples=[];
    for (const el of targets) {
      const color=getComputedStyle(el).color, values=color.match(/[\d.]+/g)?.map(Number) || [];
      if (values.length < 3) continue;
      const range=document.createRange();
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        range.selectNodeContents(walker.currentNode);
        for (const rect of range.getClientRects()) if (rect.width>0 && rect.height>0 && rect.right>0 && rect.bottom>0 && rect.left<innerWidth && rect.top<innerHeight) samples.push({
          selector:el.tagName.toLowerCase() + (el.className && typeof el.className==='string' ? '.'+el.className.trim().split(/\s+/).join('.') : ''),
          text:el.textContent.trim().slice(0,90), color:values.slice(0,3),
          rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
        });
      }
    }
    const style=document.createElement('style'); style.dataset.compositeContrastProbe='';
    // Capture only the actual texture/sky/veil composite under the measured text.
    // Foreground card borders and icons can otherwise be mistaken for comet pixels.
    style.textContent='body *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}#content>*:not(.page-background-layer),#sidebar>*:not(.panel-sky):not(.page-backdrop){visibility:hidden!important}';
    document.head.append(style);
  const sky=window.skySnapshot().find(item=>item.host==='page-background-layer');
    return {samples,frames:sky?.frames||0,particles:sky?.particles||0,cometHeads:sky?.cometHeads||0,cometTrails:sky?.cometTrails||0,cometPoints:sky?.cometPoints||[],canvasRect:sky?.canvasRect||null,now:performance.now()};
  });
  let cometOverlap = null;
  if (position === 'comet-head' && areas.samples.length) {
    const deadline=Date.now()+12000;
    while (!cometOverlap && Date.now()<deadline) {
      const sky=await page.evaluate(() => { const item=window.skySnapshot().find(value=>value.host==='page-background-layer'); return item && {...item,now:performance.now()}; });
      for (const head of sky.cometPoints.filter(point=>sky.now-point.at>=0 && sky.now-point.at<120)) {
        const x=sky.canvasRect.left+head.x, y=sky.canvasRect.top+head.y;
        const sample=areas.samples.find(item=>x>=item.rect.x && x<=item.rect.x+item.rect.width && y>=item.rect.y && y<=item.rect.y+item.rect.height);
        if (sample) { cometOverlap={head,screen:{x,y},sample,age:sky.now-head.at}; break; }
      }
      if (!cometOverlap) await page.waitForTimeout(24);
    }
    assert.ok(cometOverlap, `${profile}/${view}/${position}: a live comet head crosses an exposed label line box`);
  }
  const frames=[];
  for (let index=0;index<5;index++) {
    if (index) await page.waitForTimeout(80); // Ambient frames continue independently of finite page-transition waits.
    frames.push(await page.screenshot());
  }
  const beforeAfter=await page.evaluate(() => { const sky=window.skySnapshot().find(item=>item.host==='page-background-layer'); return sky && {frames:sky.frames,particles:sky.particles,cometHeads:sky.cometHeads,cometTrails:sky.cometTrails,cometPoints:sky.cometPoints||[],canvasRect:sky.canvasRect,now:performance.now()}; });
  assert.ok(beforeAfter.frames>areas.frames, `${profile}/${view}/${position}: sky continues moving during contrast sampling`);
  const file=`${profile}-${view}-${position}-contrast-background.png`;
  await page.evaluate(() => document.querySelector('style[data-composite-contrast-probe]')?.remove());
  if (!areas.samples.length) {
    const screenshotPath=path.join(out,file); fs.writeFileSync(screenshotPath,frames[0]); captures.push(file);
    return {position,minContrast:null,pixels:0,targets:0,reason:'No exposed heading or secondary-label text is visible in this scroll window; the captured content is card surfaces or blank background.',motionFrames:{before:areas.frames,after:beforeAfter.frames},movingParticles:beforeAfter.particles,cometHeads:beforeAfter.cometHeads,cometTrails:beforeAfter.cometTrails,screenshot:file};
  }
  let min=Infinity,worst=null,pixels=0,worstFrame=0;
  const parsed=frames.map(buffer=>PNG.sync.read(buffer));
  const scaleX=parsed[0].width/page.viewportSize().width, scaleY=parsed[0].height/page.viewportSize().height;
  for (let frameIndex=0;frameIndex<parsed.length;frameIndex++) {
    const png=parsed[frameIndex];
    for (const sample of areas.samples) {
      const left=Math.max(0,Math.floor(sample.rect.x*scaleX)), top=Math.max(0,Math.floor(sample.rect.y*scaleY));
      const right=Math.min(png.width,Math.ceil((sample.rect.x+sample.rect.width)*scaleX));
      const bottom=Math.min(png.height,Math.ceil((sample.rect.y+sample.rect.height)*scaleY));
      const fg=luminance(sample.color);
      for (let y=top;y<bottom;y++) for (let x=left;x<right;x++) {
        const i=(y*png.width+x)*4, rgb=[png.data[i],png.data[i+1],png.data[i+2]], bg=luminance(rgb);
        const ratio=(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05); pixels++;
        if (ratio<min) { min=ratio; worstFrame=frameIndex; worst={selector:sample.selector,text:sample.text,color:sample.color,pixel:[x,y],background:rgb}; }
      }
    }
  }
  fs.writeFileSync(path.join(out,file),frames[worstFrame]); captures.push(file);
  assert.ok(pixels>0, `${profile}/${view}/${position}: screenshot contains sampled text background pixels`);
  assert.ok(min>=4.5, `${profile}/${view}/${position}: sampled moving composite contrast ${min.toFixed(2)}:1 at ${JSON.stringify(worst)}`);
  const cometSamples=[];
  if (cometOverlap) {
    const file=`${profile}-${view}-${position}-intersection.png`;
    fs.writeFileSync(path.join(out,file),frames[0]); captures.push(file);
    const png=PNG.sync.read(frames[0]), sx=cometOverlap.screen.x*scaleX, sy=cometOverlap.screen.y*scaleY;
    const x=Math.max(0,Math.min(png.width-1,Math.round(sx))), y=Math.max(0,Math.min(png.height-1,Math.round(sy)));
    let brightest={luminance:-1,rgb:null};
    for(let py=Math.max(0,y-7);py<=Math.min(png.height-1,y+7);py++) for(let px=Math.max(0,x-7);px<=Math.min(png.width-1,x+7);px++) {
      const i=(py*png.width+px)*4, rgb=[png.data[i],png.data[i+1],png.data[i+2]], light=luminance(rgb);
      if(light>brightest.luminance) brightest={luminance:light,rgb,pixel:[px,py]};
    }
    const foreground=luminance(cometOverlap.sample.color), ratio=(Math.max(brightest.luminance,foreground)+.05)/(Math.min(brightest.luminance,foreground)+.05);
    cometSamples.push({head:{local:{x:cometOverlap.head.x,y:cometOverlap.head.y},screen:cometOverlap.screen,radius:cometOverlap.head.radius,ageAtDetectionMs:cometOverlap.age},textLineBox:cometOverlap.sample.rect,
      brightestPixel:brightest.pixel,headPixelDistance:Math.hypot(brightest.pixel[0]-sx,brightest.pixel[1]-sy),background:brightest.rgb,foreground:cometOverlap.sample.color,
      text:cometOverlap.sample.text,selector:cometOverlap.sample.selector,contrast:ratio,intersection:'comet center inside exposed text line box; brightest pixel sampled within 7px'});
    assert.ok(ratio>=4.5, `${profile}/${view}/${position}: rendered comet overlap contrast ${ratio.toFixed(2)}:1 at ${JSON.stringify(cometSamples[0])}`);
  }
  return {position,minContrast:min,pixels,targets:areas.samples.length,worst,worstFrame,framesSampled:frames.length,motionFrames:{before:areas.frames,after:beforeAfter.frames},movingParticles:beforeAfter.particles,cometHeads:beforeAfter.cometHeads,cometTrails:beforeAfter.cometTrails,cometSamples,screenshot:file};
}
async function verifySkyPixels(page, profile, textures, captures) {
  await page.evaluate(async enabled => window.dock.call('settings',{themeTextures:enabled,starDensity:4,ambientMotion:true}),textures);
  await page.waitForFunction(enabled => document.body.dataset.textures === (enabled ? 'on' : 'off') && document.body.dataset.stars === 'on',textures);
  await page.evaluate(()=>{
    const style=document.createElement('style'); style.dataset.skyPixelProbe='';
    style.textContent='body *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}#content>*:not(.page-background-layer),#sidebar>*:not(.panel-sky):not(.page-backdrop){visibility:hidden!important}';
    document.head.append(style);
  });
  await page.waitForTimeout(180);
  const bounds=await page.evaluate(() => ['#sidebar','#content > .page-background-layer'].map(selector=>{
    const r=document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};
  }));
  const visibleBefore=await page.evaluate(()=>window.skySnapshot().filter(item=>item.host==='sidebar'||item.host==='page-background-layer').map(item=>item.frames));
  const onBuffer=await page.screenshot(), onFile=`${profile}-textures-${textures?'on':'off'}-stars-on.png`;
  captures.push(onFile);
  await page.waitForTimeout(140);
  const framesWhileOn=await page.evaluate(()=>window.skySnapshot().filter(item=>item.host==='sidebar'||item.host==='page-background-layer').map(item=>item.frames));
  await page.evaluate(async()=>window.dock.call('settings',{starDensity:0}));
  await page.waitForFunction(()=>document.body.dataset.stars==='off');
  await page.waitForTimeout(260); // Let the finite opacity fade finish; the ambient checks remain separate.
  const offBuffer=await page.screenshot(), offFile=`${profile}-textures-${textures?'on':'off'}-stars-off.png`;
  captures.push(offFile);
  await page.evaluate(()=>document.querySelector('style[data-sky-pixel-probe]')?.remove());
  const on=PNG.sync.read(onBuffer), off=PNG.sync.read(offBuffer);
  assert.equal(on.width,off.width,`${profile}: star on/off screenshots share width`);
  assert.equal(on.height,off.height,`${profile}: star on/off screenshots share height`);
  const scaleX=on.width/page.viewportSize().width, scaleY=on.height/page.viewportSize().height;
  let changedPixels=0,maxLumaDelta=0,positivePixels=0;
  for(const box of bounds){
    const left=Math.max(0,Math.floor(box.x*scaleX)),top=Math.max(0,Math.floor(box.y*scaleY));
    const right=Math.min(on.width,Math.ceil((box.x+box.width)*scaleX)),bottom=Math.min(on.height,Math.ceil((box.y+box.height)*scaleY));
    for(let y=top;y<bottom;y++) for(let x=left;x<right;x++){
      const i=(y*on.width+x)*4, a=luminance([on.data[i],on.data[i+1],on.data[i+2]]), b=luminance([off.data[i],off.data[i+1],off.data[i+2]]), delta=Math.abs(a-b);
      if(delta>.001) changedPixels++;
      if(a>b+.001) positivePixels++;
      if(delta>maxLumaDelta) maxLumaDelta=delta;
    }
  }
  fs.writeFileSync(path.join(out,onFile),onBuffer); fs.writeFileSync(path.join(out,offFile),offBuffer);
  assert.ok(framesWhileOn.every((value,index)=>value>visibleBefore[index]),`${profile}: both region skies animate while textures are ${textures?'on':'off'}`);
  assert.ok(changedPixels>40 && positivePixels>10 && maxLumaDelta>.003,`${profile}: rendered sky pixels remain visible with textures ${textures?'on':'off'} (${JSON.stringify({changedPixels,positivePixels,maxLumaDelta})})`);
  await page.evaluate(async enabled=>window.dock.call('settings',{themeTextures:enabled,starDensity:4,ambientMotion:true}),textures);
  await page.waitForFunction(()=>document.body.dataset.stars==='on');
  return {textures:textures?'on':'off',regions:['#sidebar','#content page sky'],changedPixels,positivePixels,maxLumaDelta,motionFrames:{before:visibleBefore,whileOn:framesWhileOn},screenshots:[onFile,offFile]};
}
async function scrollEvidence(page, name, mustScroll = false) {
  const before = await page.evaluate(() => {
    const content = document.querySelector('#content');
    return { scrollHeight:content.scrollHeight, clientHeight:content.clientHeight, top:content.scrollTop };
  });
  const maxScroll = Math.max(0, before.scrollHeight - before.clientHeight);
  await page.evaluate(max => { const content=document.querySelector('#content'); content.scrollTop=max; }, maxScroll);
  await page.waitForTimeout(80);
  const after = await page.evaluate(() => {
    const content = document.querySelector('#content'), rect = element => {
      const r=element.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height};
    };
    const visible = content.getBoundingClientRect();
    const coverage = element => {
      const r=element.getBoundingClientRect(); return Math.max(0,Math.min(visible.bottom,r.bottom)-Math.max(visible.top,r.top));
    };
    const layer=content.querySelector(':scope > .page-background-layer'), sky=layer.querySelector(':scope > .panel-sky'), backdrop=layer.querySelector(':scope > .page-backdrop');
    return { top:content.scrollTop, scrollHeight:content.scrollHeight, clientHeight:content.clientHeight,
      layer:rect(layer), sky:rect(sky), backdrop:rect(backdrop), layerCoverage:coverage(layer),
      skyCoverage:coverage(sky), backdropCoverage:coverage(backdrop) };
  });
  assert.ok(after.top >= maxScroll - 1, `${name}: reached the page's actual scroll bottom`);
  if (mustScroll) assert.ok(maxScroll > 0, `${name}: long fixture produces real page scrolling`);
  assert.ok(after.layerCoverage >= before.clientHeight - 2, `${name}: background layer covers the exposed bottom viewport (${JSON.stringify(after)})`);
  assert.ok(after.skyCoverage >= before.clientHeight - 2, `${name}: canvas covers the exposed bottom viewport (${JSON.stringify(after)})`);
  assert.ok(after.backdropCoverage >= before.clientHeight - 2, `${name}: dark veil covers the exposed bottom viewport (${JSON.stringify(after)})`);
  await assertNoOverflow(page, name + ' at scroll bottom');
  return { ...after, maxScroll, actuallyScrolled:maxScroll > 0 };
}
async function assertRegion(page, name, expectedView) {
  const state = await page.evaluate(() => {
    const bg = document.querySelector('#content > .page-background-layer > .page-backdrop');
    return {
      view: document.querySelector('#content').dataset.view,
      frame: document.querySelector('#content').dataset.frame,
      sidebarFrame: document.querySelector('#sidebar').dataset.frame,
      consolesFrame: document.querySelector('#consoles-page').dataset.frame,
      pageLayers: document.querySelectorAll('#content > .page-background-layer').length,
      pageSkies: document.querySelectorAll('#content > .page-background-layer > .panel-sky').length,
      pageBackdrops: document.querySelectorAll('#content > .page-background-layer > .page-backdrop').length,
      sidebarLayers: document.querySelectorAll('#sidebar > .page-backdrop').length,
      sidebarSkies: document.querySelectorAll('#sidebar > .panel-sky').length,
      skySizes: ['#sidebar','#content'].map(selector => {
        const region = document.querySelector(selector), host = selector === '#content'
          ? region.querySelector(':scope > .page-background-layer') : region;
        const canvas = host.querySelector(':scope > .panel-sky'), box = el => { const r=el.getBoundingClientRect(); return [r.width,r.height]; };
        return { host:box(host), sky:box(canvas) };
      }),
      texture: bg && getComputedStyle(bg).backgroundImage,
    };
  });
  assert.equal(state.view, expectedView, `${name}: rendered ${expectedView}`);
  assert.equal(state.frame, 'blue', `${name}: content frame tracks the selected theme`);
  assert.equal(state.sidebarFrame, 'blue', `${name}: sidebar frame tracks the selected theme`);
  assert.equal(state.consolesFrame, 'blue', `${name}: console frame tracks the selected theme`);
  assert.deepEqual([state.pageLayers, state.pageSkies, state.pageBackdrops, state.sidebarLayers, state.sidebarSkies], [1, 1, 1, 1, 1], `${name}: one backdrop and one sky per region`);
  assert.ok(state.skySizes.every(({host,sky}) => Math.abs(host[0]-sky[0]) <= 1 && Math.abs(host[1]-sky[1]) <= 1), `${name}: each sky fills its own region ${JSON.stringify(state.skySizes)}`);
  assert.match(state.texture, /blue[^,)]*\.webp/i, `${name}: Blue texture is used`);
  return state;
}
async function inspectTools(page, name, capture) {
  await page.locator('.sidebar-bottom [data-page=settings]').click();
  await page.locator('.settings-navigation [data-page=tools]').click();
  const recommended = page.locator('[aria-label="Recommended tools"]');
  await recommended.waitFor(); await recommended.scrollIntoViewIfNeeded(); await page.waitForTimeout(100);
  const recommendedCards = page.locator('.tool-catalog .integration-card');
  assert.ok(await recommendedCards.count() >= 3, `${name}: recommended tool cards render`);
  const recommendedLayout = await recommendedCards.evaluateAll(items => items.map(card => {
    const rect = el => { const r=el.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
    return {id:card.dataset.catalog, card:rect(card), title:rect(card.querySelector('.integration-heading h3')),
      logo:rect(card.querySelector('.integration-mark')), guide:rect(card.querySelector('.integration-heading .subtle')),
      action:rect(card.querySelector('.catalog-action-row button')),
      required:card.querySelector('.key-entry')?.innerText || '', description:card.querySelector(':scope > p')?.innerText || ''};
  }));
  for (const item of recommendedLayout) {
    assert.ok(!overlap(item.title,item.guide), `${name}/${item.id}: docs link does not overlap its title`);
    assert.ok(!overlap(item.title,item.logo), `${name}/${item.id}: title does not overlap its icon`);
    if (item.action.height) assert.ok(item.action.height >= 43, `${name}/${item.id}: Add action has a stable row`);
    if (item.required) assert.ok(item.required.trim().length > 0, `${name}/${item.id}: key requirements stay readable`);
  }
  assertAlignedRows(recommendedLayout.filter(item=>item.action.height), `${name} recommended tools`);
  await capture(`${name}-tools-recommended`);

  const builtIn = page.locator('[aria-label="Built-in tools"]');
  await builtIn.waitFor();
  await builtIn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  assert.ok(await page.locator('.integration-card[data-integration]').count() >= 5, `${name}: built-in tool cards render`);
  const defaultLayout = await page.locator('.integration-card[data-integration]').evaluateAll(items => items.map(card => {
    const rect = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
    return { id:card.dataset.integration, card:rect(card), title:rect(card.querySelector('.integration-heading h3')), logo:rect(card.querySelector('.integration-mark')), guide:rect(card.querySelector('.integration-heading .subtle')), action:rect(card.querySelector('.button-row button')) };
  }));
  for (const item of defaultLayout) {
    assert.ok(!overlap(item.title, item.guide), `${name}/${item.id}: guide does not overlap title`);
    assert.ok(!overlap(item.title, item.logo), `${name}/${item.id}: title does not overlap icon`);
    assert.ok(item.action.height >= 43, `${name}/${item.id}: primary action has a stable minimum row`);
  }
  assertAlignedRows(defaultLayout, name);
  await capture(`${name}-tools-built-in`);

  // Keep recommended cards' descriptions, key requirements and action controls intact under long text and state changes.
  await page.locator('[data-catalog=chrome-devtools] h3').evaluate(el => { el.textContent = 'Chrome DevTools with a Long Name That Must Wrap Without Hiding Setup Requirements'; });
  await page.locator('[data-catalog=chrome-devtools] > p').first().evaluate(el => { el.textContent += ' Keep Chrome installed and select the matching browser profile before connecting the debugging endpoint.'; });
  await page.locator('[data-catalog=playwright] [data-catalog-status]').evaluate(el => { el.textContent = 'Installing pinned package…'; });
  await page.locator('[data-catalog=playwright] [data-catalog-add]').evaluate(el => { el.disabled = true; });
  await page.locator('[data-catalog=context7] [data-catalog-status]').evaluate(el => { el.textContent = 'Install failed. Check the local package manager and retry.'; });
  const recommendationLong = await recommendedCards.evaluateAll(items => items.map(card => {
    const r=el=>{const b=el.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,height:b.height};};
    return{id:card.dataset.catalog,card:r(card),title:r(card.querySelector('.integration-heading h3')),logo:r(card.querySelector('.integration-mark')),
      guide:r(card.querySelector('.integration-heading .subtle')),action:r(card.querySelector('.catalog-action-row button')),
      description:card.querySelector(':scope > p')?.innerText||'', key:card.querySelector('.key-entry')?.innerText||''};
  }));
  for (const item of recommendationLong) {
    assert.ok(!overlap(item.title,item.guide), `${name}/${item.id}: long recommended title stays separate from Docs`);
    assert.ok(!overlap(item.title,item.logo), `${name}/${item.id}: long recommended title stays clear of its icon`);
    assert.ok(item.description.length > 20, `${name}/${item.id}: full setup description remains present`);
    if (item.key) assert.ok(item.key.length > 10, `${name}/${item.id}: key requirements remain present`);
  }
  assertAlignedRows(recommendationLong.filter(item=>item.action.height), `${name} recommended long/state cards`);
  await recommended.scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
  await capture(`${name}-tools-recommended-long-and-states`);

  // Keep two realistic card states visible while checking the header at long and scaled text.
  await page.locator('[data-integration=rea] [data-integration-status]').evaluate(el => { el.textContent = 'Setting up REA…'; });
  await page.locator('[data-integration=rea] [data-integration-setup]').evaluate(el => { el.disabled = true; });
  await page.locator('[data-integration=mirofish] [data-integration-status]').evaluate(el => { el.textContent = 'Connection failed. Check the local backend URL and try again.'; });
  await page.locator('[data-integration=rea] h3').evaluate(el => { el.textContent = 'Reverse Engineer Anything with a Long Identifier That Must Wrap'; });
  await page.locator('[data-integration=blender] h3').evaluate(el => { el.textContent = 'Blender Integration with a Very Long Name That Must Wrap Cleanly'; });
  let longState = await page.locator('.integration-card[data-integration]').evaluateAll(items => items.map(card => {
    const r = el => { const b=el.getBoundingClientRect(); return {left:b.left,right:b.right,top:b.top,bottom:b.bottom}; };
    return { id:card.dataset.integration, card:r(card), title:r(card.querySelector('.integration-heading h3')), logo:r(card.querySelector('.integration-mark')), guide:r(card.querySelector('.integration-heading .subtle')), action:r(card.querySelector('.button-row button')) };
  }));
  for (const item of longState) {
    assert.ok(!overlap(item.title, item.guide), `${name}/${item.id}: long title does not collide with guide`);
    assert.ok(!overlap(item.title, item.logo), `${name}/${item.id}: long title does not collide with icon`);
  }
  assertAlignedRows(longState, `${name} long states`);
  await builtIn.scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
  await capture(`${name}-tools-long-and-states`);

  await page.addStyleTag({ content: `
    .settings-content .integration-heading h3,
    .settings-content .integration-heading .subtle,
    .settings-content .integration-card p,
    .settings-content .integration-card .field-hint,
    .settings-content .integration-card label,
    .settings-content .integration-card button { font-size:2em!important; line-height:1.35!important }
  ` });
  await page.waitForTimeout(120);
  longState = await page.locator('.integration-card[data-integration]').evaluateAll(items => items.map(card => {
    const r = el => { const b=el.getBoundingClientRect(); return {left:b.left,right:b.right,top:b.top,bottom:b.bottom}; };
    return { id:card.dataset.integration, card:r(card), title:r(card.querySelector('.integration-heading h3')), logo:r(card.querySelector('.integration-mark')), guide:r(card.querySelector('.integration-heading .subtle')), action:r(card.querySelector('.button-row button')) };
  }));
  for (const item of longState) {
    assert.ok(!overlap(item.title, item.guide), `${name}/${item.id}: 200% title does not collide with guide`);
    assert.ok(!overlap(item.title, item.logo), `${name}/${item.id}: 200% title does not collide with icon`);
  }
  assertAlignedRows(longState, `${name} 200% text`);
  await assertNoOverflow(page, `${name} Tools at 200% text`);
  await builtIn.scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
  await capture(`${name}-tools-200-percent`);
  const recommendationsAt200 = await recommendedCards.evaluateAll(items => items.map(card => {
    const r=el=>{const b=el.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,height:b.height};};
    return{id:card.dataset.catalog,card:r(card),title:r(card.querySelector('.integration-heading h3')),logo:r(card.querySelector('.integration-mark')),
      guide:r(card.querySelector('.integration-heading .subtle')),action:r(card.querySelector('.catalog-action-row button'))};
  }));
  for (const item of recommendationsAt200) {
    assert.ok(!overlap(item.title,item.guide), `${name}/${item.id}: 200% title stays separate from Docs`);
    assert.ok(!overlap(item.title,item.logo), `${name}/${item.id}: 200% title stays clear of icon`);
  }
  assertAlignedRows(recommendationsAt200.filter(item=>item.action.height), `${name} recommended cards at 200% text`);
  await assertNoOverflow(page, `${name} recommended Tools at 200% text`);
  await recommended.scrollIntoViewIfNeeded(); await page.waitForTimeout(120);
  await capture(`${name}-tools-recommended-200-percent`);
  const callsBefore = await page.evaluate(() => window.fixtureCalls.length);
  await page.locator('[data-integration=blender] [data-docs=blender]').click();
  await page.locator('[data-integration=blender] [data-integration-setup]').click();
  await page.waitForFunction(before => window.fixtureCalls.length >= before + 2, callsBefore);
  const actions = await page.evaluate(before => window.fixtureCalls.slice(before).map(([method]) => method), callsBefore);
  assert.ok(actions.includes('docs') && actions.includes('integrations.setup'), `${name}: guide and setup actions still work through the fixture`);
  assert.equal(await page.locator('.settings-rail-title').textContent(), 'Settings');
  assert.equal(await page.locator('.settings-rail-title').evaluate(el => getComputedStyle(el).textTransform), 'none');
  assert.equal(await page.locator('.settings-close span').count(), 0, `${name}: redundant ESC label is absent`);
  await assertNoOverflow(page, `${name} Tools`);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [name, engine, options] of profiles) {
    const browser = await engine.launch();
    openBrowsers.push(browser);
    const context = await browser.newContext(options), errors = [], blocked = [], captures = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      blocked.push(route.request().url()); return route.abort();
    });
    await context.addInitScript(installFixture, fixture);
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000);
    const capture = async label => { const file=label+'.png'; await page.screenshot({ path:path.join(out,file) }); captures.push(file); };
    await page.goto(origin); await page.locator('.session-grid').waitFor();
    await page.waitForTimeout(180);
    const pageScroll = {};
    for (const view of ['projects','results','usage','api']) {
      await page.locator(`.sidebar [data-page=${view}]`).click();
      await page.waitForTimeout(220); // Keep the settled-capture fix; this does not pause ambient motion.
      await page.waitForFunction(() => {
        const content=document.querySelector('#content');
        return content && getComputedStyle(content).opacity === '1' &&
          !document.getAnimations().some(animation => animation.effect?.getTiming().iterations !== Infinity && animation.playState === 'running');
      });
      await assertRegion(page, name, view);
      const heading = page.locator('#content .page-heading h1');
      const expectedHeading = { projects:'Projects',results:'Results',usage:'Usage',api:'API' }[view];
      assert.equal((await heading.innerText()).trim(), expectedHeading, `${name}/${view}: settled page heading is visible`);
      assert.ok(await heading.isVisible(), `${name}/${view}: page heading is visible in the capture`);
      await page.evaluate(() => { document.querySelector('#content').scrollTop=0; });
      await assertNoOverflow(page, `${name} ${view} top`);
      await capture(`${name}-${view}-top`);
      const topContrast=await sampleCompositeContrast(page,name,view,'top',captures);
      let cometContrast=null;
      if (name === 'windows-chromium' && view === 'usage') {
        // Keep the sky moving until this real page sky draws a comet, then inspect its composited head.
        await page.waitForFunction(() => window.skySnapshot().some(item=>item.host==='page-background-layer'&&item.cometHeads>0), null, {timeout:12000});
        await capture(`${name}-usage-comet-visible`);
        cometContrast=await sampleCompositeContrast(page,name,view,'comet-head',captures);
        assert.ok(cometContrast.cometHeads>0 && cometContrast.cometSamples.length>0, `${name}: a moving comet head was included in the composite contrast sample`);
      }
      const evidence = await scrollEvidence(page, `${name} ${view}`, ['projects','results','usage'].includes(view));
      if (cometContrast) evidence.cometContrast=cometContrast;
      pageScroll[view]=evidence;
      await capture(`${name}-${view}-scroll-bottom`);
      const bottomContrast=evidence.maxScroll>0 ? await sampleCompositeContrast(page,name,view,'scroll-bottom',captures) : topContrast;
      pageScroll[view].compositeContrast={top:topContrast,bottom:bottomContrast};
    }

    // Theme textures toggle off without removing the sky, then restore for the card checks.
    await page.locator('.sidebar-bottom [data-page=settings]').click();
    await page.locator('.settings-navigation [data-page=appearance]').click();
    const textures = page.locator('[data-setting=themeTextures]');
    await textures.setChecked(false);
    await page.waitForTimeout(80);
    const noTexture = await page.evaluate(() => ({
      enabled: document.body.dataset.textures,
      content: getComputedStyle(document.querySelector('#content > .page-background-layer > .page-backdrop')).backgroundImage,
      settings: getComputedStyle(document.querySelector('.settings-backdrop')).backgroundImage,
      skies: [...document.querySelectorAll('#sidebar > .panel-sky,#content > .page-background-layer > .panel-sky')].map(x => getComputedStyle(x).opacity),
    }));
    assert.equal(noTexture.enabled, 'off', `${name}: Theme textures switch disables textures`);
    assert.doesNotMatch(noTexture.content + noTexture.settings, /blue[^,)]*\.webp/i, `${name}: texture off hides Blue artwork`);
    assert.equal(noTexture.skies.length, 2, `${name}: stars remain mounted with textures off`);
    await textures.setChecked(true);
    await page.waitForTimeout(80);
    await page.locator('[data-setting=starDensity]').evaluate(el => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true })); });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#sidebar > .panel-sky')).opacity) < 0.01, null, { timeout: 1500 });
    assert.equal(await page.locator('body').getAttribute('data-stars'), 'off', `${name}: Stars Off reaches all skies`);
    assert.ok(Number(await page.locator('#sidebar > .panel-sky').evaluate(el => getComputedStyle(el).opacity)) < 0.01, `${name}: Stars Off fades the sidebar sky`);
    await page.locator('[data-setting=starDensity]').evaluate(el => { el.value = '4'; el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true })); });
    await page.locator('[data-setting=ambientMotion]').setChecked(false);
    await page.waitForTimeout(100);
    let motion = await page.evaluate(() => window.skySnapshot());
    await page.waitForTimeout(160);
    let later = await page.evaluate(() => window.skySnapshot());
    assert.deepEqual(later.map(x => x.frames), motion.map(x => x.frames), `${name}: Ambient motion pauses all active skies`);
    await page.locator('[data-setting=ambientMotion]').setChecked(true);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(100);
    motion = await page.evaluate(() => window.skySnapshot()); await page.waitForTimeout(160); later = await page.evaluate(() => window.skySnapshot());
    assert.deepEqual(later.map(x => x.frames), motion.map(x => x.frames), `${name}: reduced motion pauses all active skies`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Return to the console grid and confirm the active particle count stays below the shared cap.
    await page.locator('.settings-close button').click();
    await page.waitForFunction(() => document.body.dataset.settingsOpen !== 'true' && getComputedStyle(document.querySelector('#content')).opacity === '1');
    const skyPixelVisibility=[];
    skyPixelVisibility.push(await verifySkyPixels(page,name,true,captures));
    skyPixelVisibility.push(await verifySkyPixels(page,name,false,captures));
    await page.evaluate(async()=>window.dock.call('settings',{themeTextures:true,starDensity:4,ambientMotion:true}));
    await page.waitForFunction(()=>document.body.dataset.textures==='on'&&document.body.dataset.stars==='on');
    await page.locator('.sidebar nav [data-page=consoles]').click(); await page.waitForTimeout(100);
    let skyState = await page.evaluate(() => window.skySnapshot());
    let totalParticles = skyState.filter(x => x.visible).reduce((sum, x) => sum + x.particles, 0);
    assert.ok(totalParticles <= 1450, `${name}: visible sky particle budget ${totalParticles}`);
    await capture(name + '-blue-grid');

    // Enlarge the existing synthetic console without replacing its panel or sky.
    await page.locator('#consoles-page button[aria-label^="Expand console"]').first().click();
    await page.locator('.session-card.console-expanded .xterm-screen').waitFor(); await page.waitForTimeout(180);
    await assertNoOverflow(page, `${name} Blue terminal`);
    await capture(name + '-blue-terminal');
    const terminalBg = await page.evaluate(() => ({
      frame: document.querySelector('.session-card.console-expanded').dataset.frame,
      texture: getComputedStyle(document.querySelector('.session-card.console-expanded > .console-skin'), '::after').backgroundImage,
      skies: document.querySelectorAll('.session-card.console-expanded > .panel-sky').length,
    }));
    assert.equal(terminalBg.frame, 'blue', `${name}: fullscreen terminal retains Blue frame`);
    assert.match(terminalBg.texture, /blue[^,)]*\.webp/i, `${name}: fullscreen terminal uses the continuous Blue texture`);
    assert.equal(terminalBg.skies, 1, `${name}: terminal sky is mounted once`);
    skyState = await page.evaluate(() => window.skySnapshot());
    totalParticles = skyState.filter(x => x.visible).reduce((sum, x) => sum + x.particles, 0);
    assert.ok(totalParticles <= 1450, `${name}: terminal sky particle budget ${totalParticles}`);
    results.push({ profile:name, engine:browser.version(), viewport:page.viewportSize(), scrollEvidence:pageScroll, texturesOff:noTexture, skyPixelVisibility, particleCount:totalParticles, terminalBg, captures, errors, blocked });
    await page.locator('.session-card.console-expanded [data-action="toggle-console"]').click();
    await page.evaluate(() => window.dock.call('mode', 'dashboard'));
    await page.locator('.sidebar [data-page=projects]').click();
    await page.waitForTimeout(220);
    await assertRegion(page, name, 'projects');
    await inspectTools(page, name, capture);
    assert.deepEqual(errors, [], `${name}: no renderer errors`);
    assert.deepEqual(blocked, [], `${name}: no external requests`);
    results.at(-1).captures = captures;
    fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify(results, null, 2));
    await browser.close();
    openBrowsers.splice(openBrowsers.indexOf(browser), 1);
    console.log(`${name}: pages, settings, Tools wrapping/actions, Blue grid and terminal passed; ${captures.length} captures`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await Promise.all(openBrowsers.map(browser => browser.close().catch(() => {})));
  await new Promise(resolve => server.close(resolve));
});
