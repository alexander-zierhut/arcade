'use strict';
// Full-model prototype: layers (depth<=6), locks (open after N matches), side reserve (take-only single cells), golden bunny (type 0), orphan sweep.
const K = 3, BUNNY = 0;
function rng(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(a,r){for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}return a;}
// level: {comps:[{layers:[[types...]...], lock:N}], side:[types], T}
function init(L){
  const s={L, front:[], ptr:[], side:new Array(L.T+1).fill(0), m:0, left:0, dead:0n, cnt:new Array(L.T+1).fill(0)};
  for(const c of L.comps){ s.front.push(c.layers[0].slice()); s.ptr.push(1); for(const l of c.layers) for(const t of l){s.left++; s.cnt[t]++;} }
  for(const t of L.side){ s.side[t]++; s.left++; s.cnt[t]++; }
  for(let i=0;i<s.front.length;i++) settle(s,i);
  return s;
}
function clone(s){return {L:s.L, front:s.front.map(f=>f.slice()), ptr:s.ptr.slice(), side:s.side.slice(), m:s.m, left:s.left, dead:s.dead, cnt:s.cnt.slice()};}
const open=(s,i)=>s.L.comps[i].lock<=s.m;
function isDead(s,t){return t!==BUNNY && ((s.dead>>BigInt(t))&1n)===1n;}
function settle(s,i){
  for(;;){ const f=s.front[i];
    if(f.length===K && f[0]===f[1] && f[1]===f[2] && f[0]!==BUNNY){ s.front[i]=[]; s.left-=3; s.cnt[f[0]]-=3; s.m++; continue; }
    if(f.length===0 && s.ptr[i]<s.L.comps[i].layers.length){ s.front[i]=s.L.comps[i].layers[s.ptr[i]].filter(t=>!isDead(s,t)); s.ptr[i]++; continue; }
    return; }
}
function settleAll(s){ for(let i=0;i<s.front.length;i++) settle(s,i); }
function sweep(s){ // orphan sweep: any type with 0<cnt<3 is removed everywhere
  let any=false;
  for(let t=1;t<s.cnt.length;t++) if(s.cnt[t]>0 && s.cnt[t]<3){ any=true; s.dead|=(1n<<BigInt(t)); s.left-=s.cnt[t]; s.cnt[t]=0; s.side[t]=0; }
  if(any){ for(let i=0;i<s.front.length;i++) s.front[i]=s.front[i].filter(t=>!isDead(s,t)); settleAll(s); }
}
// move kinds: [a,t,b] centre->centre ; [-1,t,b] side take ; [a,-2,-2] bunny tap in comp a
function apply(s,mv){
  const [a,t,b]=mv; const m0=s.m;
  if(t===-2){ const f=s.front[a]; for(const x of f){ if(x!==BUNNY) s.cnt[x]--; s.left--; } s.front[a]=[]; settle(s,a); sweep(s); }
  else if(a===-1){ s.side[t]--; s.front[b].push(t); settle(s,b); }
  else { const fa=s.front[a]; fa.splice(fa.indexOf(t),1); s.front[b].push(t); settle(s,b); settle(s,a); }
  if(s.m!==m0) settleAll(s); // locks may have opened (nothing to settle, but keep generic)
}
function moves(s){
  const out=[], n=s.front.length;
  const free=[]; for(let b=0;b<n;b++) free.push(open(s,b) && s.front[b].length<K);
  for(let a=0;a<n;a++){ if(!open(s,a)) continue; const fa=s.front[a]; const seen=new Set();
    for(const t of fa){ if(t===BUNNY){ out.push([a,-2,-2]); continue; } if(seen.has(t)) continue; seen.add(t);
      for(let b=0;b<n;b++) if(b!==a && free[b]) out.push([a,t,b]); } }
  for(let t=1;t<s.side.length;t++) if(s.side[t]>0) for(let b=0;b<n;b++) if(free[b]) out.push([-1,t,b]);
  return out;
}
function F(s){let f=0;for(let i=0;i<s.front.length;i++) if(open(s,i)) f+=K-s.front[i].length; return f;}
// exact progress test for the full model (k=1 side cells)
function progressPossible(s){
  const n=s.front.length, V=new Map(); let f=0, H=0, bunny=false;
  for(let i=0;i<n;i++){ if(!open(s,i)) continue; f+=K-s.front[i].length; for(const t of s.front[i]){ if(t===BUNNY) bunny=true; else V.set(t,(V.get(t)||0)+1);} if(s.ptr[i]<s.L.comps[i].layers.length) H++; }
  if(bunny) return true; if(f<1) return false;
  for(const [t,v] of V){ if(v>=3) return true; if(v+s.side[t]>=3 && f>=3-v) return true; }
  for(let t=1;t<s.side.length;t++) if(!V.has(t) && s.side[t]>=3 && f>=3) return true;
  return f>=3 && H>0;
}
function cntIn(f,t){let c=0;for(const x of f) if(x===t) c++;return c;}
function score(s,mv){
  const [a,t,b]=mv; if(t===-2) return 900;
  const fb=s.front[b], cb=cntIn(fb,t); let sc=0;
  if(cb===2) sc+=1000; else if(cb===1&&fb.length===2) sc+=300; else if(cb===1) sc+=120;
  if(a===-1){ sc-=150; } else { const fa=s.front[a]; if(cntIn(fa,t)>=2) sc-=200; if(fa.length===1) sc+=(s.ptr[a]<s.L.comps[a].layers.length)?60:80; }
  if(fb.length===0) sc-=30; if(cb===0&&fb.length>0) sc-=60; return sc;
}
function key(s){ let k=''; for(let i=0;i<s.front.length;i++){ k+=s.ptr[i]+':'+s.front[i].slice().sort((x,y)=>x-y).join(',')+'|'; } return k+'#'+s.side.join(',')+'#'+s.m+'#'+s.dead; }
function ptrSum(s){let x=0;for(const p of s.ptr)x+=p;return x;}
// progress-bounded DFS, node budget, deterministic
function solveP(st,budget=100000,P=4){
  const root=clone(st); if(root.left===0) return {solved:true,path:[],nodes:0};
  const best=new Map(); let nodes=0;
  const ord=s=>moves(s).map(m=>(m.push(score(s,m)),m)).sort((x,y)=>y[3]-x[3]);
  const stack=[{s:root,ms:ord(root),i:0,mv:null,rem:P}];
  while(stack.length){ const top=stack[stack.length-1];
    if(top.i>=top.ms.length){stack.pop();continue;}
    const m=top.ms[top.i++]; const n=clone(top.s); apply(n,m);
    if(n.left===0){const path=stack.slice(1).map(f=>f.mv);path.push(m.slice(0,3));return {solved:true,path,nodes};}
    if(!progressPossible(n)) continue;
    const prog=n.left<top.s.left||ptrSum(n)>ptrSum(top.s); const rem=prog?P:top.rem-1; if(rem<0) continue;
    const k=key(n); const pv=best.get(k); if(pv!==undefined&&pv>=rem) continue; best.set(k,rem);
    if(++nodes>budget) return {solved:null,nodes};
    stack.push({s:n,ms:ord(n),i:0,mv:m.slice(0,3),rem}); }
  return {solved:false,nodes};
}
// greedy playout with random tie-break / softmax-ish noise. sees everything except deeper layers (does not matter for greedy)
function playout(st,r,noise=0,cap=2000){
  const s=clone(st); let n=0; const path=[];
  while(s.left>0){ if(!progressPossible(s)) return {win:false,moves:n}; if(n>=cap) return {win:false,moves:n};
    const ms=moves(s); let best=-1e9,c=[]; for(const m of ms){ const sc=score(s,m)+(noise?Math.floor(r()*noise):0); if(sc>best){best=sc;c=[m];} else if(sc===best)c.push(m);} 
    const m=c[Math.floor(r()*c.length)]; apply(s,m); path.push(m); n++; }
  return {win:true,moves:n,path};
}
function verify(L,path){ const s=init(L); for(const m of path){ const legal=moves(s).some(x=>x[0]===m[0]&&x[1]===m[1]&&x[2]===m[2]); if(!legal) return false; apply(s,m);} return s.left===0; }
module.exports={init,clone,apply,moves,progressPossible,solveP,playout,verify,F,rng,shuffle,BUNNY};
