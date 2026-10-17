'use strict';
const M = require('./model'), S = require('./solver'), G = require('./gen');
const [C, Dmin, D, F0, bmin, bmax, N] = process.argv.slice(2).map(Number);
const rnd = M.mulberry32(C * 1000 + D * 100 + F0 * 10 + bmin + bmax + 5);
let unk = 0, laterSolved = 0, agentSolved = 0, proven = 0, still = 0;
for (let i = 0; i < N; i++) {
  const lvl = G.genRandom({ C, depthMin: Dmin, depth: D, frontFree: F0, backMin: bmin, backMax: bmax, minFront: 1 }, rnd);
  const st = M.initState(lvl);
  const r = S.solveP(st, 20000, 4);
  if (r.solved !== null) continue;
  unk++;
  let aw = false; for (let k = 0; k < 400 && !aw; k++) if (S.agent(st, rnd, 120, 1000).win) aw = true;
  if (aw) agentSolved++;
  const t0 = Date.now(); const r2 = S.solveP(st, 400000, 6); const dt = Date.now() - t0;
  if (r2.solved) laterSolved++; else if (r2.solved === false) proven++; else still++;
  console.log(`  unk#${unk}: agent400=${aw} solveP(400k,P6)=${r2.solved} nodes=${r2.nodes} ${dt}ms`);
}
console.log(`C=${C} L=${Dmin}-${D} back=${bmin}-${bmax} F0=${F0}: unknown@20k=${unk} -> agent found ${agentSolved}, big-search solved ${laterSolved}, proven-unsolvable(P6) ${proven}, still unknown ${still}`);
