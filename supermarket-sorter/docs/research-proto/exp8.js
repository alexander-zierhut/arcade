'use strict';
// Exhaustive solvability on small boards (complete DFS, no progress bound) to find real unsolvable instances.
const M = require('./model'), S = require('./solver'), G = require('./gen');
const [C, Dmin, D, F0, bmin, bmax, N] = process.argv.slice(2).map(Number);
const rnd = M.mulberry32(4242 + C * 31 + D * 7 + F0);
let sol = 0, uns = 0, unk = 0, stuck0 = 0, agentWin = 0; let example = null;
for (let i = 0; i < N; i++) {
  const lvl = G.genRandom({ C, depthMin: Dmin, depth: D, frontFree: F0, backMin: bmin, backMax: bmax, minFront: 1 }, rnd);
  const st = M.initState(lvl);
  // witness first via agent, then exhaustive proof
  let w = false; for (let k = 0; k < 100 && !w; k++) if (S.agent(st, rnd, 120, 800).win) w = true;
  if (w) { sol++; agentWin++; continue; }
  const r = S.bfs(st, 1500000);
  if (r.solved) sol++; else if (r.solved === false) { uns++; if (!example) example = lvl.cells; } else unk++;
}
console.log(`C=${C} L=${Dmin}-${D} back=${bmin}-${bmax} F0=${F0}: solvable ${sol} (agent ${agentWin}) PROVEN-UNSOLVABLE ${uns} unknown ${unk} of ${N}`);
if (example) console.log('  example unsolvable:', JSON.stringify(example));
