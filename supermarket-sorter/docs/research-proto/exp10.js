'use strict';
const M = require('./model'), S = require('./solver'), G = require('./gen');
function progressPossible(s) {
  const F = M.freeFront(s); if (F === 0) return false;
  const vis = new Map(); for (const f of s.front) for (const t of f) vis.set(t, (vis.get(t) || 0) + 1);
  for (const c of vis.values()) if (c >= 3) return true;
  if (F >= 3) for (let i = 0; i < s.front.length; i++) if (s.ptr[i] < s.cells[i].length) return true;
  return false;
}
function pairsInFront(lvl) { let p = 0; for (const c of lvl.cells) { const f = c[0]; const m = new Map(); for (const t of f) m.set(t, (m.get(t) || 0) + 1); for (const v of m.values()) if (v >= 2) p++; } return p; }
// agent that records whether it ever reached a state with no reachable progress (provable dead end)
function agentDead(state, rnd, tau = 120) {
  const s = M.cloneState(state); let moves = 0, last = null; const cap = Math.ceil(6 * s.left / 3 + 30);
  while (s.left > 0) {
    if (!progressPossible(s)) return 'dead';
    if (moves >= cap) return 'cap';
    const ms = M.legalMoves(s).filter(m => !(last && m[0] === last[2] && m[2] === last[0] && m[1] === last[1]));
    const sc = ms.map(m => S.scoreMove(s, m[0], m[1], m[2])); const mx = Math.max(...sc); let tot = 0; const w = sc.map(x => { const e = Math.exp((x - mx) / tau); tot += e; return e; });
    let r = rnd() * tot, k = 0; while (k < w.length - 1 && (r -= w[k]) > 0) k++;
    const m = ms[k]; M.applyMove(s, m[0], m[1], m[2]); moves++; last = m;
  }
  return 'win';
}
const cfgs = [[12, 1, 1, 3, 1, 1], [12, 2, 2, 4, 1, 2], [12, 2, 2, 4, 2, 3], [12, 2, 3, 5, 1, 3], [12, 3, 3, 6, 1, 3]];
const rnd = M.mulberry32(31337);
for (const [C, Dmin, D, F0, bmin, bmax] of cfgs) {
  const res = { win: 0, dead: 0, cap: 0 }; let tms = 0, runs = 0; const byPairs = new Map();
  for (let i = 0; i < 60; i++) {
    const lvl = G.genRandom({ C, depthMin: Dmin, depth: D, frontFree: F0, backMin: bmin, backMax: bmax, minFront: 1 }, rnd);
    const st = M.initState(lvl); const pr = pairsInFront(lvl); let w = 0;
    for (let k = 0; k < 30; k++) { const t0 = process.hrtime.bigint(); const r = agentDead(st, rnd); tms += Number(process.hrtime.bigint() - t0) / 1e6; runs++; res[r]++; if (r === 'win') w++; }
    const b = pr <= 1 ? '0-1' : pr <= 3 ? '2-3' : '4+'; const e = byPairs.get(b) || [0, 0]; e[0] += w / 30; e[1]++; byPairs.set(b, e);
  }
  const tot = res.win + res.dead + res.cap;
  console.log(`C=${C} L=${Dmin}-${D} back=${bmin}-${bmax} F0=${F0}: agent win ${(100 * res.win / tot).toFixed(0)}% provable-dead-end ${(100 * res.dead / tot).toFixed(0)}% wander(cap) ${(100 * res.cap / tot).toFixed(0)}% | ms/playout ${(tms / runs).toFixed(2)} | win% by initial front pairs: ${[...byPairs].sort().map(([k, v]) => k + ':' + (100 * v[0] / v[1]).toFixed(0) + '%(n' + v[1] + ')').join(' ')}`);
}
