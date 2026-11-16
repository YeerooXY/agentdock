import { glow, bolt, seeded } from './backgrounds.js';
const TAU=Math.PI*2;
export function opening(g,w,h,progress,p){
  if(progress<0||progress>1)return;
  const t=progress,fade=Math.pow(1-t,1.5),ease=1-Math.pow(1-t,3),cx=w*.5,cy=h*.5;
  g.save();g.globalCompositeOperation='lighter';
  if(p.opening==='wave'||p.opening==='ribbon'){
    const x=-w*.4+ease*w*1.9;
    for(let j=0;j<65;j++){
      g.strokeStyle=p.opening==='wave'?`hsl(${j*5+t*160} 100% 62%)`:j%3?p.a:p.b;
      g.globalAlpha=fade*.5;g.lineWidth=7;g.beginPath();
      for(let i=0;i<=60;i++){const y=h*i/60;const xx=x+Math.sin(i*.065-t*3)*w*.16+j*4-130;i?g.lineTo(xx,y):g.moveTo(xx,y);}g.stroke();
    }
  }else if(p.opening==='lightning'){
    // Two separated strikes, without a full-screen white flash.
    const phase=t<.45?t/.45:(t-.5)/.5;
    if(phase>=0){g.globalAlpha=Math.pow(1-phase,2)*.85;bolt(g,w*.2,-10,w*.42,h+20,t<.45?561:791,p.a,2.2);glow(g,w*.5,h*.48,h*.75,p.a,.12*(1-phase));}
  }else if(p.opening==='explosion'){
    const r=seeded(177);glow(g,cx,cy,30+ease*h*.7,'#ff8436',fade*.16);
    for(let i=0;i<75;i++){
      const a=r()*TAU,speed=.1+r()*.8,R=ease*h*.5*speed;
      const x=cx+Math.cos(a)*R,y=cy+Math.sin(a)*R*.75-t*t*30;
      const radius=(20+r()*42)*(1+t*.6),color=i%5?'#f05c20':'#ffcf75';
      glow(g,x,y,radius,color,fade*(i<20?.13:.05));
    }
    for(let i=0;i<120;i++){const a=r()*TAU,R=ease*h*(.25+r()*.7);const x=cx+Math.cos(a)*R,y=cy+Math.sin(a)*R*.7+t*t*45;
      g.globalAlpha=fade*(.3+r()*.5);g.strokeStyle=i%4?'#ff9c4e':'#fff1c9';g.lineWidth=.7+r();g.beginPath();g.moveTo(x,y);g.lineTo(x-Math.cos(a)*10*fade,y-Math.sin(a)*10*fade);g.stroke();}
  }else if(p.opening==='decode'){
    g.font='16px Consolas,monospace';const r=seeded(711);
    for(let x=0;x<w;x+=20){const head=ease*(h+250)-r()*250;
      for(let j=0;j<10;j++){g.fillStyle=j===0?'#e5ffed':p.a;g.globalAlpha=fade*(1-j/10)*.8;g.fillText('01ｱｳｶｷｻｼﾀﾁ'[Math.floor(r()*10)],x,head-j*20);}}
  }else if(p.opening==='frost'){
    g.globalAlpha=fade*.6;
    for(let i=0;i<7;i++){const x=w*i/6;bolt(g,x,h,Math.sin(i)*w*.1,-ease*h*.65,171+i,p.a,1);}
  }else if(p.opening==='circuit'||p.opening==='scan'){
    const x=ease*w,grad=g.createLinearGradient(x-100,0,x+10,0);
    grad.addColorStop(0,p.a+'00');grad.addColorStop(.95,p.a+'45');grad.addColorStop(1,p.a+'00');g.globalAlpha=fade;g.fillStyle=grad;g.fillRect(x-100,0,110,h);
    if(p.opening==='circuit')for(let j=0;j<12;j++){g.strokeStyle=j%3?p.a:p.b;g.globalAlpha=fade*.3;g.beginPath();g.moveTo(0,j*h/12);g.lineTo(x,j*h/12);g.stroke();}
  }else if(p.opening==='collapse'||p.opening==='portal'||p.opening==='bloom'){
    const inward=p.opening==='collapse';
    for(let j=0;j<36;j++){
      const phase=Math.max(0,Math.min(1,ease-j*.006));const R=Math.max(2,(inward?1-phase:phase)*Math.hypot(w,h)*.55);
      g.globalAlpha=fade*(1-j/36)*.08;g.strokeStyle=j%3?p.a:p.b;g.lineWidth=1.7;
      g.beginPath();g.ellipse(cx,cy,R,R*(p.opening==='portal'?.8:1),-.2,0,TAU);g.stroke();
    }
    glow(g,cx,cy,h*.5,p.a,fade*.055);
  }else{glow(g,cx,cy,w*.7,p.a,fade*.055);}
  g.restore();
}
