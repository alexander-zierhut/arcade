'use strict';
const M = require('./model'), S = require('./solver'), G = require('./gen');
const [C, Dmin, D, F0, bmin, bmax, N, tau = 120] = process.argv.slice(2).map(Number);
const rnd = M.mulberry32(C * 1000 + D * 100 + F0 * 10 + bmin + bmax + 5);
let sv = 0, unk = 0, ms = 0, T = 0, aw = 0, as = 0, am = 0, len = 0, nodesTot = 0, msMax = 0; const winArr = [];
for (let i = 0; i < N; i++) {
  const lvl = G.genRandom({ C, depthMin: Dmin, depth: D, frontFree: F0, backMin: bmin, backMax: bmax, minFront: 1 }, rnd);
  T += lvl.T; const st = M.initState(lvl);
  const t0 = process.hrtime.bigint(); const r = S.solveP(st, 20000, 4); const dt = Number(process.hrtime.bigint() - t0) / 1e6;
  ms += dt; nodesTot += r.nodes; msMax = Math.max(msMax, dt);
  if (r.solved) { sv++; len += r.path.length; } else if (r.solved === null) unk++;
  let w = 0, s = 0, mv = 0; const n = 40;
  for (let k = 0; k < n; k++) { const p = S.agent(st, rnd, tau); if (p.win) { w++; mv += p.moves; } else if (p.stuck) s++; }
  aw += w / n; as += s / n; am += w ? mv / w : 0; winArr.push(w / n);
}
winArr.sort((a, b) => a - b); const f = x => x.toFixed(1);
console.log(`C=${C} L=${Dmin}-${D} back=${bmin}-${bmax} F0=${F0} T~${f(T / N)} items~${(3 * T / N).toFixed(0)} | witness ${sv}/${N} unk ${unk} ms ${f(ms / N)} (max ${msMax.toFixed(0)}) us/node ${(1000 * ms / Math.max(1, nodesTot)).toFixed(0)} len ${f(len / Math.max(1, sv))} | agent(tau${tau}) win ${(100 * aw / N).toFixed(0)}% [p10 ${(100 * winArr[Math.floor(N * .1)]).toFixed(0)} p50 ${(100 * winArr[N >> 1]).toFixed(0)} p90 ${(100 * winArr[Math.floor(N * .9)]).toFixed(0)}] hardStuck ${(100 * as / N).toFixed(0)}% movesWin ${f(am / N)}`);
