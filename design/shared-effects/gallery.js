import { presets } from './presets.js';
import { Backdrop, bolt } from './backgrounds.js';
import { opening } from './openings.js';
const $=s=>document.querySelector(s),stage=$('#stage'),bg=$('#background'),fg=$('#foreground');
const backdrop=new Backdrop(),reduced=matchMedia('(prefers-reduced-motion:reduce)');
let current=presets[0],motion=!reduced.matches,last=0,elapsed=0,start=-10,raf=0;
function fit(canvas){const d=Math.min(devicePixelRatio,2),w=stage.clientWidth,h=stage.clientHeight;
  if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);}
  const g=canvas.getContext('2d');g.setTransform(d,0,0,d,0,0);return[g,w,h];
}
function paint(now){
  raf=0;const dt=last?Math.min((now-last)/1000,.1):0;last=now;if(motion&&!reduced.matches)elapsed+=dt;
  const[g,w,h]=fit(bg),[f]=fit(fg);backdrop.draw(g,w,h,elapsed,current);f.clearRect(0,0,w,h);
  if(motion&&!reduced.matches){opening(f,w,h,(elapsed-start)/1.6,current);
    if(current.kind==='storm'&&elapsed%11<.4){f.save();f.globalAlpha=.22*(1-elapsed%11/.4);bolt(f,w*.85,0,-w*.4,h,97+Math.floor(elapsed/11),current.a,1.1);f.restore();}
  }
  if(motion&&!reduced.matches&&!document.hidden)raf=requestAnimationFrame(paint);
}
function wake(){if(!raf)raf=requestAnimationFrame(paint);}
function select(p,replay=true){
  current=p;document.documentElement.style.setProperty('--a',p.a);document.documentElement.style.setProperty('--b',p.b);
  $('#name').textContent=p.name;$('#theme-title').textContent=p.name;$('#note').textContent=p.note;
  for(const button of $('#themes').children)button.setAttribute('aria-pressed',String(button.dataset.theme===p.id));
  start=replay?elapsed:-10;wake();
}
for(const p of presets){const b=document.createElement('button');b.type='button';b.dataset.theme=p.id;b.textContent=p.name;b.setAttribute('aria-pressed','false');b.onclick=()=>select(p);$('#themes').append(b);}
$('#replay').onclick=()=>{start=elapsed;wake();};
$('#content').onclick=e=>{const show=$('#console').hidden;$('#console').hidden=!show;e.currentTarget.setAttribute('aria-pressed',String(show));};
$('#motion').onclick=e=>{motion=!motion;e.currentTarget.setAttribute('aria-pressed',String(motion));last=0;wake();};
$('#motion').setAttribute('aria-pressed',String(motion));
reduced.addEventListener('change',()=>{last=0;wake();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else{last=0;wake();}});
new ResizeObserver(wake).observe(stage);select(current,false);
// Headless comparison captures use the same drawing paths at fixed timestamps.
window.effectsPreview={presets:presets.map(p=>p.id),select:id=>select(presets.find(p=>p.id===id)||presets[0],false),
  capture(time=4,openingTime=-10){motion=false;elapsed=time;start=openingTime<0?-10:time-openingTime*1.6;cancelAnimationFrame(raf);raf=0;paint(performance.now());if(openingTime>=0){const[g,w,h]=fit(fg);opening(g,w,h,openingTime,current);}}
};
