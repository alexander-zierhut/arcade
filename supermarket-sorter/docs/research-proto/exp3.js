'use strict';
// Experiment 3: compare solveP (P=3,4,6) vs Monte-Carlo witness on layered random fills.
const M = require('./model'), S = require('./solver'), G = require('./gen');
const [D, F0, N, BUD, P = 4, bmin = 2, bmax = 3] = process.argv.slice(2).map(Number);
const rnd = M.mulberry32(777 + D * 100 + F0);
let sv = 0, un = 0, unk = 0, ms = 0, msMax = 0, len = 0, mcS = 0, mcWin = 0, mcLen = 0, casual = 0, casualStuck = 0, T = 0, mcMs = 0, disagree = 0;
const nodesArr = [];
for (let i = 0; i < N; i++) {
  const lvl = G.genRandom({ C: 12, depth: D, frontFree: F0, backMin: bmin, backMax: bmax, minFront: 1 }, rnd);
  T += lvl.T; const st = M.initState(lvl);
  let t0 = process.hrtime.bigint(); const r = S.solveP(st, BUD, P); let dt = Number(process.hrtime.bigint() - t0) / 1e6;
  ms += dt; msMax = Math.max(msMax, dt); nodesArr.push(r.nodes);
  if (r.solved) { sv++; len += r.path.length; } else if (r.solved === false) un++; else unk++;
  t0 = process.hrtime.bigint(); const mc = S.mcSolve(st, rnd, 50, 1.0); mcMs += Number(process.hrtime.bigint() - t0) / 1e6;
  if (mc.solvable) { mcS++; mcLen += mc.bestLen; }
  mcWin += mc.winRate;
  const cz = S.mcSolve(st, rnd, 50, 0.8); casual += cz.winRate; casualStuck += cz.stuckRate;
  if (mc.solvable && r.solved === false) disagree++;
}
nodesArr.sort((a, b) => a - b);
const f = x => x.toFixed(1);
console.log(`D=${D} F0=${F0} P=${P} T~${f(T / N)} | solveP: solvable ${sv} unsolvable ${un} unknown ${unk} /${N}, ms avg ${f(ms / N)} max ${msMax.toFixed(0)}, nodes p50 ${nodesArr[N >> 1]} p90 ${nodesArr[Math.floor(N * .9)]}, len ${f(len / Math.max(1, sv))} | MC(50 greedy): found ${mcS}/${N} avg winrate ${(100 * mcWin / N).toFixed(0)}% bestLen ${f(mcLen / Math.max(1, mcS))} ms ${f(mcMs / N)} | casual0.8 win ${(100 * casual / N).toFixed(0)}% stuck ${(100 * casualStuck / N).toFixed(0)}% | MC-solvable-but-solveP-unsolvable: ${disagree}`);
