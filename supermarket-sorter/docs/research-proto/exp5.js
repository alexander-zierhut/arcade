'use strict';
// Reverse-play generator: validate witness by forward replay; measure shape, casual win, solveP.
const M = require('./model'), S = require('./solver'), G = require('./gen');
const [C, D, T, pU, pA, scr, N] = process.argv.slice(2).map(Number);
const rnd = M.mulberry32(99 + C + D * 7 + T * 13);
let ok = 0, fail = 0, nulls = 0, items = 0, frontFree = 0, cw = 0, sv = 0, layersN = 0, witnessLen = 0, ms = 0;
for (let i = 0; i < N; i++) {
  const lvl = G.genReverse({ C, depth: D, T, pUnmatch: pU, pUnadv: pA, finalScramble: scr }, rnd);
  if (!lvl) { nulls++; continue; }
  // forward replay
  const st = M.initState(lvl); const s = M.cloneState(st);
  const fwd = lvl.log.filter(o => o[0] === 'move').reverse();
  let legal = true;
  for (const [, x, t, y] of fwd) { if (!s.front[y].includes(t) || s.front[x].length >= 3) { legal = false; break; } M.applyMove(s, y, t, x); }
  if (legal && s.left === 0) ok++; else { fail++; continue; }
  witnessLen += fwd.length;
  items += 3 * lvl.T; frontFree += M.freeFront(st);
  for (const c of lvl.cells) layersN += c.length;
  let w = 0; for (let k = 0; k < 30; k++) if (S.playout(st, rnd, 0.8, 500).win) w++; cw += w / 30;
  const t0 = Date.now(); const r = S.solveP(st, 20000, 4); ms += Date.now() - t0; if (r.solved) sv++;
}
const n = ok, f = x => x.toFixed(1);
console.log(`reverse C=${C} D=${D} T=${T} pUnmatch=${pU} pUnadv=${pA} scramble=${scr} | built ${N - nulls}/${N} replayOK ${ok} replayFAIL ${fail} | avg layers/cell ${f(layersN / n / C)} frontFree ${f(frontFree / n)} witnessLen ${f(witnessLen / n)} | solveP found ${sv}/${n} avgMs ${f(ms / n)} | casual win ${(100 * cw / n).toFixed(0)}%`);
