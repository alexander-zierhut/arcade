'use strict';
// Experiment 2: layered model, random fill. 12 cells, depth D, front free slots F0. Back layers 2..3 items (like the original).
const M = require('./model'), S = require('./solver'), G = require('./gen');
const args = process.argv.slice(2).map(Number);
const [D, F0, N, BUD, bmin = 2, bmax = 3, typesCap = 0] = args;
const rnd = M.mulberry32(777 + D * 100 + F0);
let solved = 0, unsolv = 0, unknown = 0, nodesS = 0, msMax = 0, ms = 0, lenS = 0, T = 0, win = 0, winN = 0, stuck = 0, moves = 0;
const nodesArr = [];
for (let i = 0; i < N; i++) {
  const lvl = G.genRandom({ C: 12, depth: D, frontFree: F0, backMin: bmin, backMax: bmax, minFront: 1, typesCap: typesCap || 0 }, rnd);
  T += lvl.T;
  const st = M.initState(lvl);
  const t0 = process.hrtime.bigint(); const r = S.solve(st, BUD); const dt = Number(process.hrtime.bigint() - t0) / 1e6;
  ms += dt; msMax = Math.max(msMax, dt); nodesArr.push(r.nodes);
  if (r.solved) { solved++; lenS += r.path.length; nodesS += r.nodes;
    for (let k = 0; k < 20; k++) { const p = S.playout(st, rnd, 0.8); winN++; if (p.win) { win++; moves += p.moves; } else if (p.stuck) stuck++; }
  } else if (r.solved === false) unsolv++; else unknown++;
}
nodesArr.sort((a, b) => a - b);
console.log(`D=${D} F0=${F0} back=${bmin}-${bmax} typesCap=${typesCap||'-'} avgT=${(T / N).toFixed(1)} | solvable ${solved}/${N} unsolvable ${unsolv} unknown(>${BUD}) ${unknown} | solveMs avg ${(ms / N).toFixed(1)} max ${msMax.toFixed(0)} nodes p50 ${nodesArr[N >> 1]} p90 ${nodesArr[Math.floor(N * .9)]} | dfsLen ${(lenS / solved).toFixed(1)} | casual(0.8) win ${(100 * win / winN).toFixed(0)}% stuck ${(100 * stuck / winN).toFixed(0)}% movesWhenWin ${(moves / Math.max(1, win)).toFixed(1)}`);
