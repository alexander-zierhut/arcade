'use strict';
// Browser gate: playouts-until-first-win as a solvability witness; cost in ms; par = min moves over 20 extra playouts.
const M = require('./model'), S = require('./solver'), G = require('./gen');
function progressPossible(s) {
  const F = M.freeFront(s); if (F === 0) return false;
  const vis = new Map(); for (const f of s.front) for (const t of f) vis.set(t, (vis.get(t) || 0) + 1);
  for (const c of vis.values()) if (c >= 3) return true;
  if (F >= 3) for (let i = 0; i < s.front.length; i++) if (s.ptr[i] < s.cells[i].length) return true;
  return false;
}
function agent(state, rnd, tau = 120) {
  const s = M.cloneState(state); let moves = 0, last = null; const cap = Math.ceil(6 * s.left / 3 + 30);
  while (s.left > 0) {
    if (!progressPossible(s)) return -1;
    if (moves >= cap) return -2;
    const ms = M.legalMoves(s).filter(m => !(last && m[0] === last[2] && m[2] === last[0] && m[1] === last[1]));
    const sc = ms.map(m => S.scoreMove(s, m[0], m[1], m[2])); const mx = Math.max(...sc); let tot = 0; const w = sc.map(x => { const e = Math.exp((x - mx) / tau); tot += e; return e; });
    let r = rnd() * tot, k = 0; while (k < w.length - 1 && (r -= w[k]) > 0) k++;
    const m = ms[k]; M.applyMove(s, m[0], m[1], m[2]); moves++; last = m;
  }
  return moves;
}
const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))] : NaN; };
const cfgs = [[12, 2, 2, 4, 1, 2], [12, 2, 2, 4, 2, 3], [12, 2, 3, 5, 1, 3], [12, 3, 3, 6, 1, 3], [15, 3, 3, 6, 1, 3]];
const rnd = M.mulberry32(4242); const MAXP = 200, EXTRA = 20, N = 30;
const tEnd = Date.now() + 52000;
for (const [C, Dmin, D, F0, bmin, bmax] of cfgs) {
  if (Date.now() > tEnd) { console.log('time budget hit'); break; }
  let found = 0; const pToWin = [], msGate = [], par = [], wr = [], items = [];
  for (let i = 0; i < N; i++) {
    const lvl = G.genRandom({ C, depthMin: Dmin, depth: D, frontFree: F0, backMin: bmin, backMax: bmax, minFront: 1 }, rnd);
    const st = M.initState(lvl); items.push(st.left);
    const t0 = process.hrtime.bigint(); let p = 0, first = -1;
    while (p < MAXP) { p++; const r = agent(st, rnd); if (r > 0) { first = r; break; } }
    msGate.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (first < 0) continue;
    found++; pToWin.push(p);
    let best = first, wins = 0; for (let k = 0; k < EXTRA; k++) { const r = agent(st, rnd); if (r > 0) { wins++; if (r < best) best = r; } }
    par.push(best); wr.push(wins / EXTRA);
  }
  const avg = a => (a.reduce((x, y) => x + y, 0) / a.length);
  console.log(`C=${C} L=${Dmin}-${D} back=${bmin}-${bmax} F0=${F0} items~${avg(items).toFixed(0)} | witness ${found}/${N} | playouts-to-win p50 ${q(pToWin, .5)} p90 ${q(pToWin, .9)} max ${Math.max(...pToWin)} | gate ms p50 ${q(msGate, .5).toFixed(1)} p90 ${q(msGate, .9).toFixed(1)} max ${Math.max(...msGate).toFixed(0)} | par(min of 21) avg ${avg(par).toFixed(1)} | agentWin avg ${(100 * avg(wr)).toFixed(0)}% p10 ${(100 * q(wr, .1)).toFixed(0)}%`);
}
