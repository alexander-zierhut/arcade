'use strict';
const tag=L=>L===1?'Tut':((L-1)%10===0?'Br':(L-1)%10===4?'H':(L-1)%10===9?'VH':'N');
const ceil5=x=>Math.ceil(x/5)*5;
function common(L,br){
  const t=tag(L); const R=br==='R';
  const sideFrom=R?13:10;
  let shape,C; if(L===1){shape='G3x3';C=9;} else if(L<sideFrom){shape='G3x4';C=12;} else {shape='G2+2';C=10;}
  let dmax; if(R) dmax=L===1?1:L<=10?2:L<=20?3:L<=30?4:L<=40?5:6; else dmax=L===1?1:L<=15?2:3;
  let dlo=Math.max(1,dmax-1), dhi=dmax;
  if(t==='Br'){dhi=Math.max(1,dmax-1);dlo=Math.max(1,dmax-2);} if(t==='H'){dlo=dmax;} if(t==='VH'){dlo=dmax; if(!R) dhi=Math.min(5,dmax+1);}
  if(L===2){dlo=1;dhi=2;}
  let F0=L===1?6:R?(L<=20?5:L<=40?4:(t==='VH'?3:4)):(L<=30?5:4); if(L>=13&&L<=15&&R) F0=6; if(L>=10&&L<=11&&!R) F0=6;
  let backHi=L<=10?2:3; const back=L===1?'-':'1-'+backHi;
  // side
  let N=0,v=0; if(L>=sideFrom){ if(R){N=L<=20?8:L<=30?9:L<=40?10:11; v=L<=15?0:L<=30?0.2:L<=50?0.3:0.4;} else {N=L<=29?8:L<=49?9:10; v=Math.min(1.2,0.30+0.015*(L-10)); if(t==='H')v*=1.15; if(t==='VH')v*=1.3; if(t==='Br')v*=0.8; v=Math.min(1.5,v);} }
  // locks
  let locks=''; let lockItems=0;
  if(t==='N'){ if(R){ if(L>=41) locks='3×4-6'; else if(L>=21) locks='2×3-4'; else if(L>=14) locks='1×4'; else if(L>=8) locks='1×3'; } else { if(L>=40) locks='2×4'; else if(L>=25) locks='1×4'; else if(L>=12) locks='1×3'; } }
  if(R&&L===8) locks='1×3'; if(!R&&L===12) locks='1×3';
  // bunny
  const bFrom=R?16:14; let bunny=0; const idx=(L-1)%10; if(L===bFrom) bunny=1; else if(L>bFrom&&(idx===2||idx===7)) bunny=1; if(L>=30&&t==='VH') bunny=1;
  // hstrip timed
  let hs=''; if(!R){ if((t==='VH'&&L>=30)||(t==='H'&&L>=45)||(L>=61)) hs='8 @40%'; }
  // items estimate
  const davg=(dlo+dhi)/2; const bmean=L<=10?1.5:2.0;
  let items=(3*C-F0)+C*(davg-1)*bmean+2*N+(hs?8:0); items=Math.round(items/3)*3;
  let types=L===1?7:L<=10?14:L<=20?16:L<=40?18:20; if(!R) types=Math.min(types,18); types=Math.min(types,items/3);
  const W=Math.round(items*1.3);
  const tau=R?3:Math.max(1.8,3.4-0.03*(L-1));
  const Vmin=6; const takes=2*N+(hs?8:0); const wait=v>0?takes*Math.max(0,N-Vmin)/v:0;
  const time=R?0:Math.min(480,Math.max(L<=10?150:120,ceil5(tau*W+wait+20)));
  const par=Math.ceil(1.15*W);
  return {L,t,shape,C,F0,d:dlo===dhi?String(dlo):dlo+'-'+dhi,back,N,v,locks,bunny,hs,items,types,W,time,par,tau};
}
const fmtT=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
for(const br of ['R','Z']){
  console.log(br==='R'?'| L | Tag | Shape (C) | F0 | Depth | Back | Side N/side, v | Locks | Bunny | Types | Items≈ | Par≈ |':'| L | Tag | Shape (C) | F0 | Depth | Back | Side N/side, v | H-strip | Locks | Bunny | Types | Items≈ | Time≈ |');
  console.log(br==='R'?'|---|---|---|---|---|---|---|---|---|---|---|---|':'|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for(let L=1;L<=60;L++){ const k=common(L,br); const side=k.N?k.N+', '+k.v.toFixed(2):'-';
    if(br==='R') console.log(`| ${L} | ${k.t} | ${k.shape} (${k.C}) | ${k.F0} | ${k.d} | ${k.back} | ${side} | ${k.locks||'-'} | ${k.bunny||'-'} | ${k.types} | ${k.items} | ${k.par} |`);
    else console.log(`| ${L} | ${k.t} | ${k.shape} (${k.C}) | ${k.F0} | ${k.d} | ${k.back} | ${side} | ${k.hs||'-'} | ${k.locks||'-'} | ${k.bunny||'-'} | ${k.types} | ${k.items} | ${fmtT(k.time)} |`);
  }
  console.log();
}
