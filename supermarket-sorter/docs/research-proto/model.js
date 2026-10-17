'use strict';
// Layered shelf-sort model. A level = array of cells; each cell = array of layers; layer = array of item types (1..T), length 1..3.
// layers[0] is the front (playable) row. Single-layer model = every cell has exactly one layer (front may be empty or partial).
const K = 3;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}

// Runtime state: per cell { front: int[] (<=3), ptr: index of next back layer }, plus level.cells for back layers.
function initState(level) {
  const s = { cells: level.cells, front: [], ptr: [], left: 0 };
  for (let i = 0; i < level.cells.length; i++) {
    const L = level.cells[i];
    s.front.push(L.length ? L[0].slice() : []);
    s.ptr.push(1);
    for (const layer of L) s.left += layer.length;
  }
  settleAll(s);
  return s;
}
function cloneState(s) { return { cells: s.cells, front: s.front.map(f => f.slice()), ptr: s.ptr.slice(), left: s.left }; }
function isTriple(f) { return f.length === K && f[0] === f[1] && f[1] === f[2]; }
// Clear triples and advance layers until stable for cell i. Returns number of matches made.
function settle(s, i) {
  let m = 0;
  for (;;) {
    const f = s.front[i];
    if (isTriple(f)) { s.front[i] = []; s.left -= 3; m++; continue; }
    if (f.length === 0 && s.ptr[i] < s.cells[i].length) { s.front[i] = s.cells[i][s.ptr[i]].slice(); s.ptr[i]++; continue; }
    return m;
  }
}
function settleAll(s) { let m = 0; for (let i = 0; i < s.front.length; i++) m += settle(s, i); return m; }
// Apply move: one item of type t from cell a to cell b. Returns matches made.
function applyMove(s, a, t, b) {
  const fa = s.front[a]; const k = fa.indexOf(t); fa.splice(k, 1);
  s.front[b].push(t);
  return settle(s, b) + settle(s, a);
}
function legalMoves(s) {
  const out = []; const n = s.front.length;
  for (let a = 0; a < n; a++) {
    const fa = s.front[a]; if (!fa.length) continue;
    const seen = new Set();
    for (const t of fa) {
      if (seen.has(t)) continue; seen.add(t);
      for (let b = 0; b < n; b++) if (b !== a && s.front[b].length < K) out.push([a, t, b]);
    }
  }
  return out;
}
function freeFront(s) { let f = 0; for (const x of s.front) f += K - x.length; return f; }
// Hard deadlock: items remain but no front slot is free (triples auto-clear, so no move exists).
function isHardStuck(s) { return s.left > 0 && freeFront(s) === 0; }
function key(s) {
  let k = '';
  for (let i = 0; i < s.front.length; i++) { const f = s.front[i].slice().sort((x, y) => x - y); k += s.ptr[i] + ':' + f.join(',') + '|'; }
  return k;
}
module.exports = { K, mulberry32, shuffle, initState, cloneState, applyMove, legalMoves, freeFront, isHardStuck, key, settle, settleAll, isTriple };
