'use strict';
// Experiment 1: single-layer model. Random fill, 12 cells x 3, T = 11/10/9 (F = 3/6/9). Check solvability, solver cost, par, playout.
const M = require('./model'), S = require('./solver'), G = require('./gen');
const rnd = M.mulberry32(12345);
for (const F of [3, 6, 9]) {
  let solved = 0, unknown = 0, nodes = 0, ms = 0, par = 0, lb = 0, dfsLen = 0, play = 0, n = 200;
  for (let i = 0; i < n; i++) {
    const lvl = G.genRandom({ C: 12, depth: 1, frontFree: F, backMin: 1, backMax: 3, minFront: 0 }, rnd);
    const st = M.initState(lvl);
    const t0 = process.hrtime.bigint();
    const r = S.solve(st, 100000);
    ms += Number(process.hrtime.bigint() - t0) / 1e6;
    nodes += r.nodes; if (r.solved) { solved++; dfsLen += r.path.length; } else if (r.solved === null) unknown++;
    if (i < 60) { par += S.beam(st, 200) || 0; }
    lb += S.lowerBound(st);
    let pm = 0; for (let k = 0; k < 20; k++) pm += S.playout(st, rnd, 0.8).moves; play += pm / 20;
  }
  console.log(`single-layer F=${F} T=${12 - F / 3}: solved ${solved}/${n} unknown ${unknown} avgNodes ${(nodes / n).toFixed(0)} avgMs ${(ms / n).toFixed(2)} dfsLen ${(dfsLen / solved).toFixed(1)} beamPar ${(par / 60).toFixed(1)} lowerBound ${(lb / n).toFixed(1)} casualPlayerMoves ${(play / n).toFixed(1)}`);
}
