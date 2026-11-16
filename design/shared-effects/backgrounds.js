const TAU=Math.PI*2;
export const seeded=(seed)=>()=>((seed=(seed*16807)%2147483647)/2147483647);
export function glow(g,x,y,r,color,alpha=1){
  const grad=g.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,color);grad.addColorStop(1,color+'00');
  g.save();g.globalAlpha=alpha;g.fillStyle=grad;g.fillRect(x-r,y-r,r*2,r*2);g.restore();
}
export function bolt(g,x,y,dx,dy,seed,color,width=2){
  const rand=seeded(seed);let points=[[x,y]];const steps=18;
  for(let i=1;i<=steps;i++)points.push([x+dx*i/steps+(rand()-.5)*Math.hypot(dx,dy)*.13,y+dy*i/steps]);
  g.save();g.lineCap='round';g.lineJoin='round';g.strokeStyle=color;
  for(const [line,alpha]of[[width*8,.05],[width*3,.2],[width,1]]){
    g.globalAlpha*=alpha;g.lineWidth=line;g.beginPath();points.forEach(([a,b],i)=>i?g.lineTo(a,b):g.moveTo(a,b));g.stroke();g.globalAlpha/=alpha;
  }
  g.strokeStyle='#e9faff';g.lineWidth=width*.4;g.beginPath();points.forEach(([a,b],i)=>i?g.lineTo(a,b):g.moveTo(a,b));g.stroke();
  for(const i of [5,10,13]){const [a,b]=points[i];g.strokeStyle=color;g.lineWidth=width*.45;g.beginPath();g.moveTo(a,b);g.lineTo(a+(rand()-.5)*80,b+30);g.lineTo(a+(rand()-.5)*140,b+70);g.stroke();}g.restore();
}
function stamp(color){
  const c=document.createElement('canvas');c.width=c.height=80;const g=c.getContext('2d');
  const fill=g.createRadialGradient(40,40,0,40,40,40);
  for(const [p,col]of[[0,'#ffffff'],[.045,'#ffffff'],[.12,color+'c0'],[.35,color+'25'],[1,color+'00']])fill.addColorStop(p,col);
  g.fillStyle=fill;g.fillRect(0,0,80,80);return c;
}
export class Backdrop{
  constructor(){const r=seeded(62837);this.stars=Array.from({length:520},()=>({x:r(),y:r(),z:r(),phase:r()*TAU,size:r(),color:Math.floor(r()*3)}));this.stamps=[];}
  starscape(g,w,h,t,p,amount=1){
    if(this.palette!==p.id){this.palette=p.id;this.stamps=[stamp(p.a),stamp(p.b),stamp('#e1e9ff')];}
    g.save();g.globalCompositeOperation='lighter';
    for(const star of this.stars.slice(0,Math.round(520*amount))){
      const x=(star.x*w+t*(.35+star.z*1.4))%w,y=(star.y*h-t*star.z*.25+h)%h;
      const near=star.z>.93;const size=near?17+star.size*17:2+star.z*star.z*10;
      const pulse=.85+.15*Math.sin(t*.5+star.phase);g.globalAlpha=(.2+star.z*.8)*pulse;
      g.drawImage(this.stamps[star.color],x-size/2,y-size/2,size,size);
      if(near){g.globalAlpha=.2*pulse;g.strokeStyle=star.color===2?'#ffffff':p.a;g.lineWidth=.6;g.beginPath();g.moveTo(x-5,y);g.lineTo(x+5,y);g.moveTo(x,y-5);g.lineTo(x,y+5);g.stroke();}
    }g.restore();
  }
  draw(g,w,h,t,p){
    g.clearRect(0,0,w,h);g.fillStyle='#06080d';g.fillRect(0,0,w,h);
    if(!['matrix','circuit'].includes(p.kind))this.starscape(g,w,h,t,p,p.kind==='plain'?.22:.8);
    g.save();g.globalCompositeOperation='lighter';
    if(['nebula','aurora','ice','storm','portal'].includes(p.kind)){
      glow(g,w*.2,h*.15,w*.5,p.b,.09);glow(g,w*.82,h*.75,w*.42,p.a,.065);
    }
    if(['aurora','ice','spectrum','nebula'].includes(p.kind))this.aurora(g,w,h,t,p);
    if(p.kind==='hole')this.hole(g,w,h,t,p);
    if(p.kind==='portal')this.portal(g,w,h,t,p);
    if(p.kind==='matrix')this.matrix(g,w,h,t,p);
    if(p.kind==='circuit')this.circuit(g,w,h,t,p);
    if(p.kind==='fire')this.fire(g,w,h,t,p);
    if(p.kind==='laser')this.laser(g,w,h,t,p);
    if(p.kind==='ice')this.snow(g,w,h,t,p);
    if(p.kind==='storm'){
      const age=t%8;if(age<.65){g.globalAlpha=Math.pow(1-age/.65,2)*.65;bolt(g,w*.83,-20,-w*.24,h*.92,120+Math.floor(t/8),p.a,1.5);}
    }
    g.restore();
  }
  aurora(g,w,h,t,p){
    const spectrum=p.kind==='spectrum',strength=p.kind==='nebula'?.3:p.kind==='ice'?.55:1.25;
    g.save();
    for(let band=0;band<3;band++)for(let row=0;row<22;row++){
      g.globalAlpha=strength*(1-row/22)*.045;
      g.strokeStyle=spectrum?`hsl(${band*95+row*3+t*12} 100% 65%)`:band%2?p.b:p.a;g.lineWidth=2.5;
      g.beginPath();for(let i=0;i<=90;i++){const x=w*i/90;const y=h*(.22+band*.2)+Math.sin(i*.065+t*.13+band)*h*.12+Math.sin(i*.13-t*.16)*h*.035-row*2;
        i?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
    }g.restore();
  }
  hole(g,w,h,t,p){
    const x=w*.72,y=h*.5,r=Math.min(w,h)*.175;
    g.save();g.translate(x,y);g.rotate(-.22);
    glow(g,0,0,r*2.6,'#c073ff',.08);
    // Far disk is hidden behind the event horizon; the near disk crosses in front.
    const disk=(front)=>{for(let i=0;i<115;i++){
      const q=i/115,R=r*(1.1+q*1.8);g.strokeStyle=q<.25?'#fff1cb':q<.6?'#e9a269':'#9571c1';
      g.globalAlpha=(1-q)*.5;g.lineWidth=.8+q;
      g.beginPath();g.ellipse(0,0,R,R*.23,0,front?0:Math.PI,front?Math.PI:TAU);g.stroke();
    }};disk(false);
    g.globalCompositeOperation='source-over';g.globalAlpha=1;g.fillStyle='#010104';g.beginPath();g.arc(0,0,r,0,TAU);g.fill();
    g.globalCompositeOperation='lighter';
    for(let i=0;i<18;i++){g.globalAlpha=.16*(1-i/18);g.strokeStyle=i<5?'#ffe3af':'#9f78cf';g.lineWidth=1.3;g.beginPath();g.ellipse(0,0,r+i*.9,r+i*.6,0,0,TAU);g.stroke();}
    disk(true);
    for(let i=0;i<90;i++){const a=i*2.399+t*.06,R=r*(1.18+(i%13)/13*1.55);g.globalAlpha=.12;g.fillStyle=p.a;g.fillRect(Math.cos(a)*R,Math.sin(a)*R*.23,1.7,.6);}
    g.restore();
  }
  portal(g,w,h,t,p){
    const x=w*.75,y=h*.47,r=Math.min(w,h)*.24;g.save();g.translate(x,y);
    for(let j=0;j<65;j++){const q=j/65;g.globalAlpha=(1-q)*.21;g.strokeStyle=j%3?p.a:p.b;g.lineWidth=1.2;g.beginPath();
      for(let i=0;i<=110;i++){const a=i/110*TAU,R=r*(.8+q*.6)+Math.sin(a*5+t*.5+q*12)*8+Math.sin(a*11-t*.3)*3;i?g.lineTo(Math.cos(a)*R,Math.sin(a)*R):g.moveTo(Math.cos(a)*R,Math.sin(a)*R);}g.stroke();}g.restore();
  }
  matrix(g,w,h,t,p){
    const glyphs='01ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ';g.save();g.font='13px Consolas,monospace';
    for(let col=0;col<Math.ceil(w/19);col++){
      const r=seeded(col*113+71),speed=22+r()*38,head=(t*speed+r()*(h+360))%(h+360)-60;
      for(let j=0;j<23;j++){const y=head-j*17;if(y<0||y>h)continue;
        g.globalAlpha=Math.pow(1-j/23,1.8)*(col%3===0?.95:.55);g.fillStyle=j===0?'#d8ffe4':j<4?'#71ffa2':'#06b85a';
        const index=Math.floor(r()*glyphs.length+Math.floor(t*(j===0?5:.8)))%glyphs.length;g.fillText(glyphs[index],col*19,y);
      }
    }g.restore();glow(g,w*.7,h*.25,w*.4,p.b,.045);
  }
  circuit(g,w,h,t,p){
    g.save();const vanish=[w*.6,h*.2];g.strokeStyle=p.a;g.lineWidth=.7;g.globalAlpha=.1;
    for(let i=-10;i<20;i++){g.beginPath();g.moveTo(...vanish);g.lineTo(w*.5+i*w*.12,h);g.stroke();}
    for(let i=0;i<14;i++){const y=h*.2+Math.pow((i+(t*.1)%1)/14,2)*h*.8;g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
    const rand=seeded(66);for(let i=0;i<36;i++){
      const x=rand()*w,y=rand()*h,len=35+rand()*90;g.globalAlpha=.15;g.strokeStyle=i%3?p.a:p.b;
      g.beginPath();g.moveTo(x,y);g.lineTo(x+len*.4,y);g.lineTo(x+len*.6,y-20);g.lineTo(x+len,y-20);g.stroke();
      const u=(t*.12+i*.173)%1;const px=x+len*u,py=y-Math.min(1,Math.max(0,(u-.4)/.2))*20;
      glow(g,px,py,7,i%3?p.a:p.b,.7);g.fillStyle='#d5fcff';g.globalAlpha=.65;g.fillRect(px-1,py-1,2,2);
    }g.restore();
  }
  fire(g,w,h,t,p){
    glow(g,w*.5,h*1.2,h*.9,'#d43d19',.15);g.save();
    for(const star of this.stars.slice(0,95)){
      const y=h-((star.y*h+t*(8+star.z*22))%(h+20)),x=star.x*w+Math.sin(t*.5+star.phase)*12;
      glow(g,x,y,star.z> .8?9:4,p.a,(.15+star.z*.65)*(y/h));
    }g.restore();
  }
  laser(g,w,h,t,p){
    glow(g,w*.1,h*.8,w*.6,p.b,.12);g.save();g.rotate(-.13);
    for(let i=0;i<9;i++){const y=h*.25+i*45;const grad=g.createLinearGradient(0,y,w,y);grad.addColorStop(0,p.a+'00');grad.addColorStop(.3,p.a+'50');grad.addColorStop(.7,p.b+'30');grad.addColorStop(1,p.a+'00');g.fillStyle=grad;g.fillRect(0,y,w,.7);}
    const x=(t*35)%(w*1.6)-w*.3;glow(g,x,h*.5,170,p.a,.07);g.restore();
  }
  snow(g,w,h,t,p){
    for(const star of this.stars.slice(0,70)){const x=star.x*w+Math.sin(t*.2+star.phase)*12,y=(star.y*h+t*(3+star.z*8))%h;
      glow(g,x,y,star.z> .8?7:3,'#defaff',.2+star.z*.2);}
  }
}
