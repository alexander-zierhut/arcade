'use strict';
// Verify the O(C) progress test against exhaustive search over non-progress moves.
const M = require('./model'), S = require('./solver'), G = require('./gen');
function progressPossible(s) {
  const F = M.freeFront(s); if (F === 0) return false;
  const vis = new Map(); for (const f of s.front) for (const t of f) vis.set(t, (vis.get(t) || 0) + 1);
  for (const c of vis.values()) if (c >= 3) return true;
  if (F >= 3) for (let i = 0; i < s.front.length; i++) if (s.ptr[i] < s.cells[i].length) return true;
  return false;
}
const ptrSum = s => s.ptr.reduce((a, b) => a + b, 0);
function progressReachable(s0, maxStates = 300000) { // BFS over plain moves; true if any move yields match/reveal
  const seen = new Set([S.symKey(s0)]); let fr = [s0];
  while (fr.length) { const nx = [];
    for (const s of fr) for (const m of M.legalMoves(s)) { const n = M.cloneState(s); M.applyMove(n, m[0], m[1], m[2]);
      if (n.left < s.left || ptrSum(n) > ptrSum(s)) return true;
      const k = S.symKey(n); if (seen.has(k)) continue; seen.add(k); if (seen.size > maxStates) return null; nx.push(n); }
    fr = nx; }
  return false;
}
const rnd = M.mulberry32(2026);
let agree = 0, disagree = 0, unk = 0, negatives = 0; const conf = { tt: 0, ff: 0, tf: 0, ft: 0 };
for (let i = 0; i < 1500; i++) {
  const C = 4 + Math.floor(rnd() * 5);
  const lvl = G.genRandom({ C, depthMin: 1, depth: 3, frontFree: 1 + Math.floor(rnd() * 3), backMin: 1, backMax: 3, minFront: 1 }, rnd);
  const s = M.initState(lvl);
  const steps = Math.floor(rnd() * 25);
  for (let k = 0; k < steps; k++) { const ms = M.legalMoves(s); if (!ms.length || s.left === 0) break; const m = ms[Math.floor(rnd() * ms.length)]; M.applyMove(s, m[0], m[1], m[2]); }
  if (s.left === 0) continue;
  const a = progressPossible(s), b = progressReachable(s);
  if (b === null) { unk++; continue; }
  if (!b) negatives++;
  conf[(a ? 't' : 'f') + (b ? 't' : 'f')]++;
}
console.log('formula vs exhaustive (formula,truth):', conf, 'unknown', unk, 'states with no reachable progress:', negatives);
