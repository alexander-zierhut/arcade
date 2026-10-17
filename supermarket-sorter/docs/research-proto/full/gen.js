'use strict';
const M=require('./fm');
// knobs: {C, F0, depth:[min,max] per comp, back:[lo,hi] items per back layer, side:n cells total, locks:[N...], bunny:0|1, T}
function make(k,seed){
  const r=M.rng(seed);
  const comps=[]; let total=0;
  // front sizes: total free = F0 spread
  const fr=new Array(k.C).fill(3); let need=k.F0; while(need>0){const i=Math.floor(r()*k.C); if(fr[i]>1){fr[i]--;need--;}}
  for(let i=0;i<k.C;i++){ const d=k.depth[0]+Math.floor(r()*(k.depth[1]-k.depth[0]+1)); const sizes=[fr[i]]; for(let j=1;j<d;j++) sizes.push(k.back[0]+Math.floor(r()*(k.back[1]-k.back[0]+1))); comps.push(sizes); total+=sizes.reduce((a,b)=>a+b,0); }
  total+=k.side; const bunnies=k.bunny||0; total+=0;
  // fix multiple of 3 by adjusting back layers
  let guard=0; while(total%3!==0 && guard++<100){ const i=Math.floor(r()*k.C); const s=comps[i]; if(s.length>1){ const j=1+Math.floor(r()*(s.length-1)); if(s[j]<3){s[j]++;total++;} } }
  const triples=total/3; const T=Math.min(k.T,triples);
  let items=[]; for(let t=0;t<triples;t++){ const ty=1+(t%T); items.push(ty,ty,ty); }
  shuffle(items,r);
  const side=items.splice(0,k.side);
  const L={comps:[],side,T};
  let p=0;
  for(let i=0;i<k.C;i++){ const layers=comps[i].map(sz=>{const l=items.slice(p,p+sz);p+=sz;return l;}); L.comps.push({layers,lock:0}); }
  // bunny: put into a back layer slot (adds an item, no type count)
  for(let b=0;b<bunnies;b++){ const i=Math.floor(r()*k.C); const c=L.comps[i]; if(c.layers.length>1){ const j=1+Math.floor(r()*(c.layers.length-1)); if(c.layers[j].length<3) c.layers[j].push(M.BUNNY); } }
  // reject layers that are triples: swap item with next layer item (simple re-roll handled by caller)
  for(const c of L.comps) for(const l of c.layers) if(l.length===3&&l[0]===l[1]&&l[1]===l[2]&&l[0]!==0) return null;
  (k.locks||[]).forEach((N,j)=>{ const i=(j*3+1)%k.C; L.comps[i].lock=N; });
  return L;
}
function shuffle(a,r){return M.shuffle(a,r);}
module.exports={make};
