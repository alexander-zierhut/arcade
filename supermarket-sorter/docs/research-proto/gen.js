'use strict';
const M = require('./model');
const { K } = M;

// Random fill. p = { C, depth (layers per cell incl. front, or array per cell), frontFree, backMin (1..3), backMax }
// Layer sizes chosen first; total forced to a multiple of 3; then shuffled 3T items dealt; layers that are triples are re-dealt.
function genRandom(p, rnd) {
  const C = p.C;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const depth = [];
    for (let i = 0; i < C; i++) depth.push(Array.isArray(p.depth) ? p.depth[i] : (p.depthMin ? p.depthMin + Math.floor(rnd() * (p.depth - p.depthMin + 1)) : p.depth));
    // front sizes: 3C - frontFree items, spread so that no front is empty at start (unless allowFrontEmpty)
    const front = new Array(C).fill(K);
    let free = p.frontFree;
    const order = M.shuffle([...Array(C).keys()], rnd);
    let idx = 0;
    while (free > 0) { const i = order[idx % C]; if (front[i] > (p.minFront || 1)) { front[i]--; free--; } idx++; if (idx > 10 * C) break; }
    const sizes = [];
    let total = 0;
    for (let i = 0; i < C; i++) {
      const cs = [front[i]];
      for (let d = 1; d < depth[i]; d++) cs.push(p.backMin + Math.floor(rnd() * (p.backMax - p.backMin + 1)));
      sizes.push(cs); for (const x of cs) total += x;
    }
    // fix total to multiple of 3 by trimming/adding back-layer items
    let r = total % 3, guard = 0;
    while (r !== 0 && guard++ < 100) {
      const i = Math.floor(rnd() * C); const L = sizes[i]; if (L.length < 2) continue;
      const d = 1 + Math.floor(rnd() * (L.length - 1));
      if (L[d] > p.backMin) { L[d]--; total--; r = total % 3; }
    }
    if (total % 3) continue;
    const T = total / 3;
    if (p.maxTypes && T > p.maxTypes * (p.copies || 1)) continue;
    const types = p.typesCap ? Math.min(T, p.typesCap) : T;
    // build pool: T triples over `types` distinct kinds (kind repeated if T > types)
    const pool = [];
    for (let t = 0; t < T; t++) { const kind = 1 + (t % types); pool.push(kind, kind, kind); }
    for (let deal = 0; deal < 50; deal++) {
      M.shuffle(pool, rnd);
      let k = 0, bad = false; const cells = [];
      for (let i = 0; i < C; i++) { const cl = []; for (const n of sizes[i]) { const layer = pool.slice(k, k + n); k += n; if (M.isTriple(layer)) bad = true; cl.push(layer); } cells.push(cl); }
      if (!bad) return { cells, T, types };
    }
  }
  throw new Error('genRandom failed');
}

// Reverse-play generator (layered). Builds the level backwards from the empty board; forward replay of the reversed op log is a solution.
// p = { C, depth, triples (T), frontFree target ignored; scramble: reverse moves per placed triple }
function genReverse(p, rnd) {
  const C = p.C, T = p.T;
  const maxLayers = p.depth;
  // reverse state: front[i] (array), back[i] = list of frozen layers (index 0 = directly behind front)
  const front = Array.from({ length: C }, () => []), back = Array.from({ length: C }, () => []);
  const log = [];
  let placed = 0, kind = 0;
  const kinds = p.types || T;
  const totalOps = () => 0;
  function hasTriple(f) { return M.isTriple(f); }
  function canRevMoveFrom(x) { // forward: item moved INTO x. If x would become empty and has back layers -> impossible
    if (!front[x].length) return false;
    if (front[x].length === 1 && back[x].length) return false;
    return true;
  }
  function revMove() {
    const xs = []; for (let i = 0; i < C; i++) if (canRevMoveFrom(i)) xs.push(i);
    if (!xs.length) return false;
    const x = xs[Math.floor(rnd() * xs.length)];
    const f = front[x]; const t = f[Math.floor(rnd() * f.length)];
    const ys = [];
    for (let y = 0; y < C; y++) {
      if (y === x || front[y].length >= K) continue;
      const fy = front[y].concat([t]);
      if (hasTriple(fy)) continue;                      // forward state can't hold a triple
      // forward: item leaves y. If y's front becomes empty in forward, y's back layer advances; reverse: y empty is only legal if y has no back (genuinely empty) or y was just un-advanced (empty front with back) -> both fine.
      ys.push(y);
    }
    if (!ys.length) return false;
    const y = ys[Math.floor(rnd() * ys.length)];
    f.splice(f.indexOf(t), 1); front[y].push(t);
    log.push(['move', x, t, y]);
    return true;
  }
  function unAdvance() { // push a non-empty, non-triple front behind
    const xs = []; for (let i = 0; i < C; i++) if (front[i].length && !hasTriple(front[i]) && back[i].length + 1 < maxLayers) xs.push(i);
    if (!xs.length) return false;
    const x = xs[Math.floor(rnd() * xs.length)];
    back[x].unshift(front[x]); front[x] = [];
    log.push(['unadv', x]);
    return true;
  }
  function unMatch() {
    // need a cell whose front is empty. If cell has back layers and empty front, fine (forward: match empties then back advances).
    const xs = []; for (let i = 0; i < C; i++) if (!front[i].length) xs.push(i);
    if (!xs.length) return false;
    const x = xs[Math.floor(rnd() * xs.length)];
    kind = kind % kinds + 1;
    front[x] = [kind, kind, kind]; placed++;
    log.push(['unmatch', x, kind]);
    // immediately scatter at least one item (forward: the move that completed the triple)
    for (let g = 0; g < 20; g++) if (revMoveFrom(x)) return true;
    // undo if impossible
    front[x] = []; placed--; log.pop(); return false;
  }
  function revMoveFrom(x) {
    const f = front[x]; const t = f[0];
    const ys = []; for (let y = 0; y < C; y++) { if (y === x || front[y].length >= K) continue; if (hasTriple(front[y].concat([t]))) continue; ys.push(y); }
    if (!ys.length) return false;
    const y = ys[Math.floor(rnd() * ys.length)];
    f.splice(0, 1); front[y].push(t); log.push(['move', x, t, y]); return true;
  }
  let guard = 0;
  while (placed < T && guard++ < 20000) {
    const r = rnd();
    if (r < p.pUnmatch) unMatch();
    else if (r < p.pUnmatch + p.pUnadv) unAdvance();
    else revMove();
  }
  // final scramble with reverse moves only
  for (let i = 0; i < (p.finalScramble || 0); i++) revMove();
  if (placed < T) return null;
  // reject if any front is a triple or empty-front-with-back
  for (let i = 0; i < C; i++) { if (hasTriple(front[i])) return null; if (!front[i].length && back[i].length) return null; }
  const cells = []; for (let i = 0; i < C; i++) { const cl = [front[i].slice()].concat(back[i].map(l => l.slice())); cells.push(cl.filter((l, j) => j === 0 || l.length)); }
  return { cells, T, types: kinds, log };
}
module.exports = { genRandom, genReverse };
