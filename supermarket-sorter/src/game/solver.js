// src/game/solver.js: the solver for the full model (DESIGN 3.2). Pure. compile() turns a Board into a compact state
// (fronts as code multisets, back layers, locks, belts as a take-only pool per type, bunnies collected automatically);
// solveP() is a progress-bounded DFS with a dead-state memo and a node budget; playouts() are greedy with integer noise;
// verify() replays a witness through the real board rules (independent of the compiled model); hint() gives one move.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var B = SS.board || (typeof require === 'function' ? require('./board.js') : null);
  var K = 3, BUNNY = 0;

  // ---------- compile ----------
  function compile(b) {
    var types = [], index = {}, t;
    function code(type) { if (type === B.BUNNY) return BUNNY; if (index[type] === undefined) { index[type] = types.length + 1; types.push(type); } return index[type]; }
    for (t in b.remaining) code(t);
    var s = { types: types, n: b.comps.length, front: [], layers: [], ptr: [], lockAt: [], matches: b.matches, pool: [], later: [], cnt: [], dead: {}, left: 0, bunnies: b.bunnies, maxThreshold: 0 };
    var ci, k, li;
    for (ci = 0; ci < s.n; ci++) {
      var c = b.comps[ci], f = [];
      for (k = 0; k < K; k++) if (c.slots[k]) f.push(code(b.items[c.slots[k]].type));
      s.front.push(f);
      var L = [];
      for (li = 0; li < c.back.length; li++) { var layer = []; for (k = 0; k < K; k++) { var v = c.back[li].t[k]; if (v !== null && (v === B.BUNNY || !b.swept[v])) layer.push(code(v)); } L.push(layer); }
      s.layers.push(L); s.ptr.push(0);
      s.lockAt.push(c.lockAt && b.matches < c.lockAt ? c.lockAt : 0);
      if (c.lockAt > s.maxThreshold) s.maxThreshold = c.lockAt;
    }
    var T = types.length;
    for (t = 0; t <= T; t++) { s.pool.push(0); s.cnt.push(0); }
    for (var bi = 0; bi < b.belts.length; bi++) {
      var belt = b.belts[bi], counts = null;
      if (!belt.appeared) { counts = []; for (t = 0; t <= T; t++) counts.push(0); s.later.push({ at: belt.appearAt, counts: counts }); if (belt.appearAt > s.maxThreshold) s.maxThreshold = belt.appearAt; }
      for (k = 0; k < belt.cells.length; k++) {
        var cell = belt.cells[k];
        if (cell.barred || !cell.stack.length) continue;
        var cc = code(cell.stack[0].t);
        if (counts) counts[cc] += 1; else s.pool[cc] += 1;
      }
    }
    for (t = 0; t <= T; t++) { s.pool[t] = s.pool[t] || 0; s.cnt[t] = 0; }
    for (var tt in b.remaining) s.cnt[index[tt]] = b.remaining[tt];
    for (t = 1; t <= T; t++) {                                 // orphans (fewer than 3 copies) can never match: dead from the start
      if (s.cnt[t] > 0 && s.cnt[t] < K) { s.dead[t] = 1; s.cnt[t] = 0; s.pool[t] = 0; }
      s.left += s.cnt[t];
    }
    if (Object.keys(s.dead).length) for (ci = 0; ci < s.n; ci++) s.front[ci] = s.front[ci].filter(function (x) { return !s.dead[x]; });
    s.pool[BUNNY] = 0; s.cnt[BUNNY] = 0;
    settleAll(s);
    return s;
  }
  function clone(s) {
    return { types: s.types, n: s.n, front: s.front.map(function (f) { return f.slice(); }), layers: s.layers, ptr: s.ptr.slice(), lockAt: s.lockAt,
      matches: s.matches, pool: s.pool.slice(), later: s.later, cnt: s.cnt.slice(), dead: s.dead, left: s.left, bunnies: s.bunnies, maxThreshold: s.maxThreshold };
  }
  function open(s, i) { return !s.lockAt[i] || s.matches >= s.lockAt[i]; }
  function isTriple(f) { return f.length === K && f[0] === f[1] && f[1] === f[2] && f[0] !== BUNNY; }
  function settle(s, i) {
    for (;;) {
      var f = s.front[i];
      if (isTriple(f)) { s.front[i] = []; s.left -= 3; s.cnt[f[0]] -= 3; s.matches += 1; continue; }
      if (open(s, i)) {
        var bi = f.indexOf(BUNNY);
        if (bi >= 0) { f.splice(bi, 1); s.bunnies += 1; continue; }
      }
      if (f.length === 0 && s.ptr[i] < s.layers[i].length) {
        var next = s.layers[i][s.ptr[i]], nf = [];
        for (var k = 0; k < next.length; k++) if (next[k] === BUNNY || !s.dead[next[k]]) nf.push(next[k]);
        s.front[i] = nf; s.ptr[i] += 1; continue;
      }
      return;
    }
  }
  function appearBelts(s) {
    if (!s.later.length) return;
    var keep = [];
    for (var j = 0; j < s.later.length; j++) {
      var L = s.later[j];
      if (s.matches >= L.at) { for (var t = 1; t < L.counts.length; t++) s.pool[t] += L.counts[t]; if (L.counts[BUNNY]) s.bunnies += L.counts[BUNNY]; }
      else keep.push(L);
    }
    if (keep.length !== s.later.length) s.later = keep;
  }
  function settleAll(s) {
    var m0 = s.matches;
    for (var i = 0; i < s.n; i++) settle(s, i);
    if (s.matches !== m0) { appearBelts(s); for (var j = 0; j < s.n; j++) settle(s, j); }
    else if (s.later.length) appearBelts(s);
  }

  // ---------- moves ----------
  // move = [a, t, b]: a >= 0 centre compartment, a === -1 take from the pool
  function moves(s) {
    var out = [], n = s.n, free = [], a, b, t;
    for (b = 0; b < n; b++) free.push(open(s, b) && s.front[b].length < K);
    var seenEmpty = {};
    function emptyDup(a, t, b) {                              // interchangeable empty targets with nothing behind
      if (s.front[b].length || s.ptr[b] < s.layers[b].length) return false;
      var k = a + ':' + t; if (seenEmpty[k]) return true; seenEmpty[k] = 1; return false;
    }
    for (a = 0; a < n; a++) {
      if (!open(s, a)) continue;
      var fa = s.front[a], seen = {};
      for (var i = 0; i < fa.length; i++) {
        t = fa[i]; if (seen[t]) continue; seen[t] = 1;
        for (b = 0; b < n; b++) if (b !== a && free[b] && !emptyDup(a, t, b)) out.push([a, t, b]);
      }
    }
    for (t = 1; t < s.pool.length; t++) if (s.pool[t] > 0) for (b = 0; b < n; b++) if (free[b] && !emptyDup(-1, t, b)) out.push([-1, t, b]);
    return out;
  }
  function apply(s, mv) {
    var a = mv[0], t = mv[1], b = mv[2], m0 = s.matches;
    if (a === -1) { s.pool[t] -= 1; s.front[b].push(t); settle(s, b); }
    else { var fa = s.front[a]; fa.splice(fa.indexOf(t), 1); s.front[b].push(t); settle(s, b); settle(s, a); }
    if (s.matches !== m0) settleAll(s);
  }
  function cntIn(f, t) { var c = 0; for (var i = 0; i < f.length; i++) if (f[i] === t) c += 1; return c; }
  function score(s, mv) {
    var a = mv[0], t = mv[1], b = mv[2], fb = s.front[b], cb = cntIn(fb, t), sc = 0;
    if (cb === 2) sc += 1000; else if (cb === 1 && fb.length === 2) sc += 300; else if (cb === 1) sc += 120;
    if (a === -1) { if (cb === 0) sc -= 150; else sc += 130; }
    else { var fa = s.front[a]; if (cntIn(fa, t) >= 2) sc -= 200; if (fa.length === 1) sc += (s.ptr[a] < s.layers[a].length) ? 60 : 80; }
    if (fb.length === 0) sc -= 30;
    if (cb === 0 && fb.length > 0) sc -= 60;
    return sc;
  }
  function ordered(s) {
    var ms = moves(s);
    for (var i = 0; i < ms.length; i++) ms[i].push(score(s, ms[i]));
    ms.sort(function (x, y) { return y[3] - x[3]; });
    return ms;
  }
  /** progressPossible(s): the exact test of DESIGN 1.9 on the compiled state. */
  function progressPossible(s) {
    if (s.left === 0) return true;
    var V = {}, f = 0, H = 0, i, t, k;
    for (i = 0; i < s.n; i++) {
      if (!open(s, i)) continue;
      f += K - s.front[i].length;
      for (k = 0; k < s.front[i].length; k++) { t = s.front[i][k]; if (t === BUNNY) return true; V[t] = (V[t] || 0) + 1; }
      if (s.ptr[i] < s.layers[i].length) H += 1;
    }
    if (f < 1) return false;
    for (t in V) { var v = V[t]; if (v >= 3) return true; if (v + s.pool[t] >= 3 && f >= 3 - v) return true; }
    for (t = 1; t < s.pool.length; t++) if (!V[t] && s.pool[t] >= 3 && f >= 3) return true;
    return f >= 3 && H > 0;
  }
  function key(s) {
    var parts = [], done = [], i;
    for (i = 0; i < s.n; i++) {
      var f = s.front[i].slice().sort(function (x, y) { return x - y; }).join(',');
      if (s.ptr[i] < s.layers[i].length || s.lockAt[i]) parts.push(i + ':' + s.ptr[i] + ':' + f); else done.push(f);
    }
    done.sort();
    return parts.join('|') + '#' + done.join('|') + '#' + s.pool.join(',') + '#' + Math.min(s.matches, s.maxThreshold);
  }
  function ptrSum(s) { var x = 0; for (var i = 0; i < s.ptr.length; i++) x += s.ptr[i]; return x; }

  /** solveP(state, budget, P) -> { solved: true, path, nodes } | { solved: null (budget), nodes } | { solved: false, nodes }. */
  function solveP(st, budget, P) {
    budget = budget || 100000; P = P || 4;
    var root = clone(st);
    if (root.left === 0) return { solved: true, path: [], nodes: 0 };
    if (!progressPossible(root)) return { solved: false, path: null, nodes: 0 };
    var best = {}, nodes = 0;
    var stack = [{ s: root, ms: ordered(root), i: 0, mv: null, rem: P }];
    best[key(root)] = P;
    while (stack.length) {
      var top = stack[stack.length - 1];
      if (top.i >= top.ms.length) { stack.pop(); continue; }
      var m = top.ms[top.i++];
      if (top.mv && top.mv[0] >= 0 && m[0] === top.mv[2] && m[2] === top.mv[0] && m[1] === top.mv[1]) continue;   // no immediate reversal
      var n = clone(top.s); apply(n, m);
      if (n.left === 0) { var path = []; for (var j = 1; j < stack.length; j++) path.push(stack[j].mv); path.push([m[0], m[1], m[2]]); return { solved: true, path: path, nodes: nodes }; }
      if (!progressPossible(n)) continue;
      var prog = n.left < top.s.left || ptrSum(n) > ptrSum(top.s) || n.matches > top.s.matches;
      var rem = prog ? P : top.rem - 1;
      if (rem < 0) continue;
      var k = key(n), pv = best[k];
      if (pv !== undefined && pv >= rem) continue;
      best[k] = rem;
      if (++nodes > budget) return { solved: null, path: null, nodes: nodes };
      stack.push({ s: n, ms: ordered(n), i: 0, mv: [m[0], m[1], m[2]], rem: rem });
    }
    return { solved: false, path: null, nodes: nodes };
  }

  /** playout(state, rng, noise, cap) -> { win, moves, path }: greedy with integer noise (0 = deterministic). */
  function playout(st, rng, noise, cap) {
    var s = clone(st), n = 0, path = [];
    cap = cap || 2000;
    while (s.left > 0) {
      if (!progressPossible(s) || n >= cap) return { win: false, moves: n, path: path };
      var ms = moves(s), bestSc = -1e9, c = [];
      for (var i = 0; i < ms.length; i++) {
        var sc = score(s, ms[i]) + (noise && rng ? rng.int(noise) : 0);
        if (sc > bestSc) { bestSc = sc; c = [ms[i]]; } else if (sc === bestSc) c.push(ms[i]);
      }
      var m = c.length > 1 && rng ? c[rng.int(c.length)] : c[0];
      apply(s, m); path.push([m[0], m[1], m[2]]); n += 1;
    }
    return { win: true, moves: n, path: path };
  }
  /** playouts(state, count, rng, noise) -> { wins, best (shortest winning path) | null, rate } */
  function playouts(st, count, rng, noise) {
    var wins = 0, best = null;
    for (var i = 0; i < count; i++) {
      var r = playout(st, rng, noise === undefined ? 120 : noise);
      if (r.win) { wins += 1; if (!best || r.moves < best.moves) best = r; }
    }
    return { wins: wins, rate: count ? wins / count : 0, best: best };
  }

  /** witnessToTypes(state, path) -> path with product type strings instead of codes (for storage and verify). */
  function witnessToTypes(s, path) { return path.map(function (m) { return [m[0], s.types[m[1] - 1], m[2]]; }); }

  // ---------- replay through the real rules (the proof; independent of the compiled model) ----------
  function collectAll(b) {
    var any = true, guard = 0;
    while (any && guard++ < 50) {
      any = false;
      for (var id in b.items) { var it = b.items[id]; if (it.type !== B.BUNNY) continue; if (B.collect(b, { item: it.id })) { any = true; break; } }
      if (any) B.resolve(b, b.matches, false);
    }
  }
  /** verify(board, witness) -> { ok, reason?, at? }: replays [a, type, b] tokens on a clone with board.js only. */
  function verify(board, witness) {
    var b = B.clone(board);
    B.resolve(b, b.matches, false); collectAll(b);
    for (var i = 0; i < witness.length; i++) {
      var w = witness[i], a = w[0], t = String(w[1]), to = w[2], id = 0;
      if (a >= 0) { for (var k = 0; k < K; k++) { var sid = b.comps[a] && b.comps[a].slots[k]; if (sid && b.items[sid].type === t) { id = sid; break; } } }
      else { for (var bi = 0; bi < b.belts.length && !id; bi++) for (var c = 0; c < b.belts[bi].cells.length; c++) { var cell = b.belts[bi].cells[c]; if (B.beltAvailable(b, bi, c) && b.items[cell.item].type === t) { id = cell.item; break; } } }
      if (!id) return { ok: false, reason: 'no item ' + t + ' at ' + a, at: i };
      var prev = b.matches, ev = B.move(b, id, to);
      if (!ev) return { ok: false, reason: 'illegal move at ' + i, at: i };
      B.resolve(b, prev, false);
      collectAll(b);
    }
    return { ok: B.isCleared(b), reason: B.isCleared(b) ? '' : 'not cleared', at: witness.length, left: b.count };
  }

  // ---------- convenience on Boards ----------
  /** solve(board, budget?) -> { solved, moves: [{item, to}] | null, count, witness, nodes } (board-level, with item ids). */
  function solve(board, budget) {
    var s = compile(board), r = solveP(s, budget || 200000, 4), witness = null;
    if (r.solved === null) { var p = playouts(s, 24, SS.rng ? SS.rng.create('solve-' + B.hash(board)) : null, 120); if (p.best) { r = { solved: true, path: p.best.path, nodes: r.nodes }; } }
    if (r.solved) witness = witnessToTypes(s, r.path);
    var movesOut = witness ? toItemMoves(board, witness) : null;
    return { solved: !!r.solved, unknown: r.solved === null, moves: movesOut, count: witness ? witness.length : 0, witness: witness, nodes: r.nodes };
  }
  /** toItemMoves(board, witness) -> [{ item, to }] on a replay clone (ids of the given board where possible). */
  function toItemMoves(board, witness) {
    var b = B.clone(board), out = [];
    B.resolve(b, b.matches, false); collectAll(b);
    for (var i = 0; i < witness.length; i++) {
      var w = witness[i], id = 0, k, bi, c;
      if (w[0] >= 0) { for (k = 0; k < K; k++) { var sid = b.comps[w[0]].slots[k]; if (sid && b.items[sid].type === w[1]) { id = sid; break; } } }
      else { for (bi = 0; bi < b.belts.length && !id; bi++) for (c = 0; c < b.belts[bi].cells.length; c++) if (B.beltAvailable(b, bi, c) && b.items[b.belts[bi].cells[c].item].type === w[1]) { id = b.belts[bi].cells[c].item; break; } }
      if (!id) break;
      out.push({ item: id, to: w[2] });
      var prev = b.matches; if (!B.move(b, id, w[2])) break; B.resolve(b, prev, false); collectAll(b);
    }
    return out;
  }
  /** hint(board, budget?) -> { item, to } or null: the next move of one coherent solution from the live
   *  state. A plan is cached: while the board develops exactly as the plan predicts, the following steps are returned
   *  without a new search (so repeated hints never oscillate). */
  var plan = null;
  function hint(board, budget) {
    var s = compile(board), k = key(s), path = null;
    if (plan && plan.nextKey === k && plan.rest.length) path = plan.rest;
    if (!path) {
      var r = solveP(s, budget || 25000, 4);
      if (!r.solved || !r.path.length) { var p = playouts(s, 8, SS.rng ? SS.rng.create('hint-' + B.hash(board)) : null, 120); if (!p.best) { plan = null; return null; } r = { solved: true, path: p.best.path }; }
      path = r.path;
    }
    var n = clone(s); apply(n, path[0]);
    plan = { nextKey: key(n), rest: path.slice(1) };
    var w = witnessToTypes(s, path.slice(0, 1)), mv = toItemMoves(board, w);
    return mv.length ? mv[0] : null;
  }

  var solver = { compile: compile, clone: clone, moves: moves, apply: apply, settleAll: settleAll, progressPossible: progressPossible, key: key,
    solveP: solveP, playout: playout, playouts: playouts, witnessToTypes: witnessToTypes, verify: verify, solve: solve, hint: hint, toItemMoves: toItemMoves };
  SS.solver = solver;
  if (typeof module !== 'undefined' && module.exports) module.exports = solver;
})(typeof globalThis !== 'undefined' ? globalThis : this);
