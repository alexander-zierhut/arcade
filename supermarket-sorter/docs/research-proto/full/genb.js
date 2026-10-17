'use strict';
const M=require('./fm');
// banded deal: slots sorted by depth; triples dealt in order with a local shuffle window W (in slots), so copies of a type sit within ~1-2 layers.
function make(k,seed){
  const r=M.rng(seed); const comps=[]; let total=0;
  const fr=new Array(k.C).fill(3); let need=k.F0; while(need>0){const i=Math.floor(r()*k.C); if(fr[i]>1){fr[i]--;need--;}}
  for(let i=0;i<k.C;i++){ const d=k.depth[0]+Math.floor(r()*(k.depth[1]-k.depth[0]+1)); const sizes=[fr[i]]; for(let j=1;j<d;j++) sizes.push(k.back[0]+Math.floor(r()*(k.back[1]-k.back[0]+1))); comps.push(sizes); total+=sizes.reduce((a,b)=>a+b,0); }
  let g=0; while((total+k.side)%3!==0&&g++<100){const i=Math.floor(r()*k.C);const s=comps[i];if(s.length>1){const j=1+Math.floor(r()*(s.length-1));if(s[j]<3){s[j]++;total++;}}}
  const slots=[]; for(let i=0;i<k.C;i++) comps[i].forEach((sz,j)=>{for(let x=0;x<sz;x++) slots.push({i,j,o:j*1000+r()*1000*k.jitter});});
  slots.sort((a,b)=>a.o-b.o);
  // side cells take wave-interleaved items: every (S/side)-th triple contributes one copy to the side
  const triples=(total+k.side)/3, T=Math.min(k.T,triples);
  const seq=[]; for(let t=0;t<triples;t++){const ty=1+(t%T); seq.push(ty,ty,ty);} 
  // local shuffle in windows
  const W=k.W; for(let s=0;s<seq.length;s+=Math.floor(W/2)){ const a=seq.slice(s,s+W); shuffle(a,r); for(let x=0;x<a.length;x++) seq[s+x]=a[x]; }
  const side=[]; const step=seq.length/k.side; const take=new Set(); for(let x=0;x<k.side;x++) take.add(Math.floor(x*step+r()*step));
  const rest=[]; seq.forEach((t,x)=>{ if(take.has(x)&&side.length<k.side) side.push(t); else rest.push(t); }); while(side.length<k.side) side.push(rest.pop());
  const L={comps:comps.map(sz=>({layers:sz.map(()=>[]),lock:0})),side,T};
  slots.forEach((sl,x)=>L.comps[sl.i].layers[sl.j].push(rest[x]));
  for(let b=0;b<(k.bunny||0);b++){const i=Math.floor(r()*k.C);const c=L.comps[i];if(c.layers.length>2){const j=2+Math.floor(r()*(c.layers.length-2));if(c.layers[j].length<3)c.layers[j].push(M.BUNNY);}}
  for(const c of L.comps) for(const l of c.layers) if(l.length===3&&l[0]===l[1]&&l[1]===l[2]&&l[0]!==0) return null;
  (k.locks||[]).forEach((N,j)=>{const i=(j*3+1)%k.C;L.comps[i].lock=N;});
  return L;
}
function shuffle(a,r){return M.shuffle(a,r);}
module.exports={make};
