'use strict';
const M=require('./fm'), G=require('./gen');
const cfgs={
 A_g3_12_d2:{C:12,F0:4,depth:[2,2],back:[1,2],side:0,locks:[],T:14},
 B_g2_10_d3_side16:{C:10,F0:5,depth:[2,3],back:[1,3],side:16,locks:[3,4],T:16,bunny:1},
 C_g2_10_d4_side16:{C:10,F0:5,depth:[3,4],back:[1,3],side:16,locks:[3,4],T:18,bunny:1},
 D_g2_10_d6_side20:{C:10,F0:5,depth:[4,6],back:[2,3],side:20,locks:[3,4,4],T:20,bunny:1},
 E_g2_10_d6_side20_F6:{C:10,F0:6,depth:[5,6],back:[1,3],side:20,locks:[3,4,4],T:20,bunny:2},
};
const which=process.argv[2], N=+process.argv[3]||20, budget=+process.argv[4]||50000;
const k=cfgs[which]; let made=0,sol=0,unk=0,uns=0,pw=0,items=0; const tS=[],tP=[],nodes=[],plen=[]; let agentWins=0,agentTot=0;
for(let seed=1;made<N&&seed<N*20;seed++){
  const L=G.make(k,seed*7919); if(!L) continue; const s=M.init(L); if(!M.progressPossible(s)) continue; made++;
  items+=s.left;
  // certificate by greedy playouts (deterministic rng per level)
  let t0=process.hrtime.bigint(); const r=M.rng(seed); let cert=null,tries=0;
  for(;tries<16&&!cert;tries++){ const p=M.playout(s,r,tries===0?0:40,Math.ceil(s.left*1.6)); if(p.win) cert=p; }
  let t1=process.hrtime.bigint(); tP.push(Number(t1-t0)/1e6); if(cert){pw++; plen.push(cert.moves); if(!M.verify(L,cert.path)) console.log('VERIFY FAIL');}
  t0=process.hrtime.bigint(); const res=M.solveP(s,budget,4); t1=process.hrtime.bigint(); tS.push(Number(t1-t0)/1e6); nodes.push(res.nodes);
  if(res.solved===true){sol++; if(!M.verify(L,res.path)) console.log('VERIFY FAIL dfs');} else if(res.solved===null) unk++; else uns++;
  // human-like agent win rate: noisy greedy, 10 runs
  const ra=M.rng(seed*31); for(let i=0;i<10;i++){agentTot++; if(M.playout(s,ra,250).win) agentWins++;}
}
const q=(a,p)=>{const b=a.slice().sort((x,y)=>x-y);return b.length?b[Math.min(b.length-1,Math.floor(p*b.length))].toFixed(1):'-';};
console.log(which,'levels',made,'avgItems',(items/made).toFixed(0),'| DFS solved',sol,'budget-hit',unk,'proven-unsolvable',uns,'| DFS ms p50',q(tS,.5),'p90',q(tS,.9),'max',q(tS,.999),'nodes p90',q(nodes,.9),'| playout-cert',pw,'ms p50',q(tP,.5),'p90',q(tP,.9),'max',q(tP,.999),'certLen p50',q(plen,.5),'| agentWin',(100*agentWins/agentTot).toFixed(0)+'%');
