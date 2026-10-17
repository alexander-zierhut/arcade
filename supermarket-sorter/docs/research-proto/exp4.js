'use strict';
// Sweep: C, depth (min..max layers), back layer size range, front free -> T, solveP rate/time, casual win rate & stuck rate.
const M = require('./model'), S = require('./solver'), G = require('./gen');
const [C, Dmin, D, F0, bmin, bmax, N] = process.argv.slice(2).map(Number);
const rnd = M.mulberry32(C * 1000 + D * 100 + F0 * 10 + bmin + bmax);
let sv = 0, unk = 0, un = 0, ms = 0, msMax = 0, T = 0, cw = 0, cs = 0, cm = 0, len = 0; const nodesArr = []; const winArr = [];
for (let i = 0; i < N; i++) {
  const lvl = G.genRandom({ C, depthMin: Dmin, depth: D, frontFree: F0, backMin: bmin, backMax: bmax, minFront: 1 }, rnd);
  T += lvl.T; const st = M.initState(lvl);
  const t0 = process.hrtime.bigint(); const r = S.solveP(st, 20000, 4); const dt = Number(process.hrtime.bigint() - t0) / 1e6;
  ms += dt; msMax = Math.max(msMax, dt); nodesArr.push(r.nodes);
  if (r.solved) { sv++; len += r.path.length; } else if (r.solved === false) un++; else unk++;
  let w = 0, s = 0, mv = 0; const n = 40;
  for (let k = 0; k < n; k++) { const p = S.playout(st, rnd, 0.8, 500); if (p.win) { w++; mv += p.moves; } else if (p.stuck) s++; }
  cw += w / n; cs += s / n; cm += w ? mv / w : 0; winArr.push(w / n);
}
nodesArr.sort((a, b) => a - b); winArr.sort((a, b) => a - b);
const f = x => x.toFixed(1);
console.log(`C=${C} layers=${Dmin}-${D} back=${bmin}-${bmax} F0=${F0} T~${f(T / N)} | witness ${sv}/${N} (unsolv ${un}, unknown ${unk}) ms avg ${f(ms / N)} max ${msMax.toFixed(0)} nodes p50 ${nodesArr[N >> 1]} p90 ${nodesArr[Math.floor(N * .9)]} len ${f(len / Math.max(1, sv))} | casual win ${(100 * cw / N).toFixed(0)}% (p10 ${(100 * winArr[Math.floor(N * .1)]).toFixed(0)}% p90 ${(100 * winArr[Math.floor(N * .9)]).toFixed(0)}%) stuck ${(100 * cs / N).toFixed(0)}% moves ${f(cm / N)}`);
